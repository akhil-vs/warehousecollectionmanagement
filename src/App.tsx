import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DeviceRole, Lookup, Order, TabId } from './types';
import { isFirebaseConfigured, ensureAnonymousAuth } from './lib/firebase';
import { SoundPatterns, isSoundUnlocked, unlockSound } from './lib/sound';
import {
  requestNotificationPermission,
  showBrowserNotification,
  updateTabTitle,
} from './lib/notifications';
import {
  acknowledgeOrder,
  cancelOrder,
  closeOpenLookupsForOrder,
  confirmHandover,
  deleteOrderAdmin,
  driverCollection,
  exceptionHandover,
  markOrderReady,
  reopenOrder,
  updateReadyOrder,
  resendLookup,
  respondToLookup,
  sendLookup,
  undoDriverCollection,
  updateLookupStatus,
} from './lib/ordersApi';
import { useDeviceRole, isDepartmentRole } from './hooks/useDeviceRole';
import { useWarehouseData } from './hooks/useWarehouseData';
import { RoleSetup } from './components/RoleSetup';
import { AppHeader } from './components/AppHeader';
import { ShiftBanner } from './components/ShiftBanner';
import { AlertBanners } from './components/AlertBanners';
import { PalletReadyPanel } from './components/PalletReadyPanel';
import { DockPanel } from './components/DockPanel';
import { HistoryPanel } from './components/HistoryPanel';
import { AdminPanel } from './components/AdminPanel';
import './App.css';

function defaultTab(role: DeviceRole): TabId {
  if (role === 'dock') return 'driver-collection';
  return 'pallet-ready';
}

function tabsFor(role: DeviceRole): { id: TabId; label: string }[] {
  if (role === 'dock') return [];
  if (role === 'admin') {
    return [
      { id: 'pallet-ready', label: 'Pallet ready' },
      { id: 'driver-collection', label: 'Driver collection' },
      { id: 'history', label: 'History' },
      { id: 'admin', label: 'Admin' },
    ];
  }
  return [
    { id: 'pallet-ready', label: 'Pallet ready' },
    { id: 'history', label: 'History' },
  ];
}

export default function App() {
  const [bootError, setBootError] = useState<string | null>(null);
  const [booted, setBooted] = useState(!isFirebaseConfigured());
  const [demoMode] = useState(!isFirebaseConfigured());
  const device = useDeviceRole();
  const data = useWarehouseData();
  const [tab, setTab] = useState<TabId>('pallet-ready');
  const [alertsEnabled, setAlertsEnabled] = useState(
    () => typeof Notification !== 'undefined' && Notification.permission === 'granted',
  );
  const [soundBlocked, setSoundBlocked] = useState(true);
  const [prefillOrderId, setPrefillOrderId] = useState<string | undefined>();
  const [toast, setToast] = useState<string | null>(null);

  const seenReady = useRef<Set<string>>(new Set());
  const seenArrived = useRef<Set<string>>(new Set());
  const seenCollected = useRef<Set<string>>(new Set());
  const seenLookups = useRef<Set<string>>(new Set());
  const seenAck = useRef<Set<string>>(new Set());
  const primed = useRef(false);
  const roleRef = useRef(device.role);

  useEffect(() => {
    roleRef.current = device.role;
  }, [device.role]);

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setBooted(true);
      return;
    }
    ensureAnonymousAuth()
      .then(() => setBooted(true))
      .catch((err) =>
        setBootError(err instanceof Error ? err.message : 'Firebase auth failed'),
      );
  }, []);

  useEffect(() => {
    if (device.role) setTab(defaultTab(device.role));
  }, [device.role]);

  useEffect(() => {
    void unlockSound().then((ok) => setSoundBlocked(!ok));
    const onFirst = () => {
      void unlockSound().then((ok) => setSoundBlocked(!ok));
      window.removeEventListener('pointerdown', onFirst);
    };
    window.addEventListener('pointerdown', onFirst);
    return () => window.removeEventListener('pointerdown', onFirst);
  }, []);

  const waitingForUs = useMemo(() => {
    if (!device.role || device.role === 'dock') return [];
    if (isDepartmentRole(device.role)) {
      return data.arrivedOrders.filter((o) => o.department === device.role);
    }
    return data.arrivedOrders;
  }, [data.arrivedOrders, device.role]);

  const waitingTitleCount = useMemo(() => {
    if (!device.role) return 0;
    if (device.role === 'dock') return data.arrivedOrders.length;
    return waitingForUs.length;
  }, [device.role, data.arrivedOrders, waitingForUs]);

  useEffect(() => {
    updateTabTitle(waitingTitleCount);
  }, [waitingTitleCount]);

  useEffect(() => {
    if (!device.role || device.role === 'dock') return;
    const unacked = waitingForUs.filter((o) => !o.ackBy);
    if (unacked.length === 0) return;
    const id = window.setInterval(() => {
      void SoundPatterns.nagUnacked();
    }, 30_000);
    return () => window.clearInterval(id);
  }, [device.role, waitingForUs]);

  useEffect(() => {
    if (!device.role) return;
    const role = device.role;

    if (!primed.current) {
      data.orders.forEach((o) => {
        if (o.status === 'ready') seenReady.current.add(o.id);
        if (o.status === 'arrived') {
          seenArrived.current.add(o.id);
          if (o.ackBy) seenAck.current.add(o.id);
        }
        if (o.status === 'collected') seenCollected.current.add(o.id);
      });
      data.openLookups.forEach((l) => seenLookups.current.add(`${l.id}:${l.at}`));
      primed.current = true;
      return;
    }

    for (const o of data.orders) {
      if (o.status === 'ready' && !seenReady.current.has(o.id)) {
        seenReady.current.add(o.id);
        const visible =
          role === 'admin' ||
          role === 'dock' ||
          (isDepartmentRole(role) && o.department === role);
        if (visible) {
          void SoundPatterns.markedReady();
          setToast(`Order ${o.id} marked ready (${o.department})`);
          showBrowserNotification('Pallets ready', `${o.id} · ${o.department}`);
        }
      }
      if (o.status === 'arrived' && !seenArrived.current.has(o.id)) {
        seenArrived.current.add(o.id);
        const owning = isDepartmentRole(role) && o.department === role;
        if (owning || role === 'admin') {
          void SoundPatterns.driverOwning();
          setToast(`Driver waiting on ${o.id}`);
          showBrowserNotification('Driver waiting', `Order ${o.id}`);
        } else if (role === 'dock' || isDepartmentRole(role)) {
          void SoundPatterns.driverOther();
        }
      }
      if (o.ackBy && o.status === 'arrived' && !seenAck.current.has(o.id)) {
        seenAck.current.add(o.id);
        void SoundPatterns.softAck();
      }
      if (o.status === 'collected' && !seenCollected.current.has(o.id)) {
        seenCollected.current.add(o.id);
        void SoundPatterns.softAck();
      }
      if (o.status !== 'ready') seenReady.current.delete(o.id);
      if (o.status !== 'arrived') {
        seenArrived.current.delete(o.id);
        seenAck.current.delete(o.id);
      }
    }

    for (const l of data.openLookups) {
      const key = `${l.id}:${l.at}`;
      if (!seenLookups.current.has(key)) {
        seenLookups.current.add(key);
        if (isDepartmentRole(role) || role === 'admin') {
          void SoundPatterns.dockLookup();
          setToast(`Dock lookup: ${l.orderId}`);
          showBrowserNotification('Dock lookup', `Is order ${l.orderId} yours?`);
        }
      }
    }
  }, [data.orders, data.openLookups, device.role]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const requireOperator = useCallback(() => {
    if (!device.operator.trim()) {
      setToast('Enter your name at the top first.');
      return false;
    }
    if (device.shiftStale) {
      setToast('Confirm your name for this shift first.');
      return false;
    }
    return true;
  }, [device.operator, device.shiftStale]);

  const handleMarkReady = useCallback(
    async (input: {
      orderId: string;
      pallets?: number;
      bay?: string;
      collectionDate?: string;
      department: import('./types').Department;
      operator: string;
    }) => {
      if (!requireOperator()) return { ok: false as const, error: 'Confirm your name for this shift first.' };
      const result = await markOrderReady(input);
      if (result.ok) {
        await closeOpenLookupsForOrder(
          input.orderId.trim().toUpperCase(),
          data.openLookups,
          input.operator,
        );
      }
      return result;
    },
    [data.openLookups, requireOperator],
  );

  const handleUpdateReady = useCallback(
    async (
      order: Order,
      patch: { pallets: number; bay?: string; collectionDate?: string },
    ) => {
      if (!requireOperator()) {
        return { ok: false as const, error: 'Confirm your name for this shift first.' };
      }
      const result = await updateReadyOrder(order, device.operator, patch);
      if (result.ok) setToast(`Updated ${order.id}`);
      return result;
    },
    [device.operator, requireOperator],
  );

  const handleExceptionById = useCallback(
    async (orderId: string, reason: string) => {
      if (!requireOperator()) return { ok: false as const, error: 'Confirm your name first.' };
      const order = data.arrivedOrders.find((o) => o.id === orderId.trim().toUpperCase());
      if (!order) return { ok: false as const, error: 'No driver is waiting on that order.' };
      if (!window.confirm(`Exception-collect ${order.id}? ${reason.trim()}`)) {
        return { ok: false as const, error: 'Cancelled.' };
      }
      return exceptionHandover(order, device.operator, reason);
    },
    [data.arrivedOrders, device.operator, requireOperator],
  );

  if (bootError) {
    return (
      <div className="setup-screen">
        <div className="setup-panel">
          <p className="brand-mark">Warehouse Collections</p>
          <h1>Cannot connect</h1>
          <p className="lede">{bootError}</p>
        </div>
      </div>
    );
  }

  if (!booted) {
    return (
      <div className="setup-screen">
        <div className="setup-panel">
          <p className="brand-mark">Warehouse Collections</p>
          <p className="lede">Connecting…</p>
        </div>
      </div>
    );
  }

  if (!device.role) {
    return (
      <RoleSetup
        pinConfigured={device.pinConfigured}
        busy={device.busy}
        error={device.error}
        onAssign={device.assignRole}
      />
    );
  }

  const role = device.role;
  const tabs = tabsFor(role);
  const showDock = role === 'dock' || (role === 'admin' && tab === 'driver-collection');
  const showReady =
    (isDepartmentRole(role) && tab === 'pallet-ready') ||
    (role === 'admin' && tab === 'pallet-ready');
  const showHistory =
    (isDepartmentRole(role) && tab === 'history') || (role === 'admin' && tab === 'history');
  const showAdmin = role === 'admin' && tab === 'admin';

  return (
    <div className="app-shell" onPointerDown={() => void unlockSound().then((ok) => setSoundBlocked(!ok))}>
      {demoMode && (
        <div className="demo-banner">
          Demo mode — Firebase env vars not set. Data stays in this browser only.
        </div>
      )}
      <AppHeader
        role={role}
        operator={device.operator}
        onOperatorChange={device.setOperator}
        alertsEnabled={alertsEnabled}
        onEnableAlerts={() => {
          void requestNotificationPermission().then((p) => {
            setAlertsEnabled(p === 'granted');
            if (p !== 'granted') setToast('Browser notifications were not granted.');
          });
        }}
        soundBlocked={soundBlocked && !isSoundUnlocked()}
        onUnlockSound={() => void unlockSound().then((ok) => setSoundBlocked(!ok))}
        hideReassign={role === 'dock'}
        reassignBusy={device.busy}
        reassignError={device.error}
        onReassign={async (pin) => {
          const ok = await device.reassignWithPin(pin);
          if (ok) primed.current = false;
          return ok;
        }}
      />

      {device.shiftStale && (
        <ShiftBanner operator={device.operator} onConfirm={device.confirmShift} />
      )}

      <AlertBanners
        waitingForUs={waitingForUs}
        openLookups={data.openLookups}
        department={isDepartmentRole(role) ? role : undefined}
        canRespondLookup={isDepartmentRole(role)}
        canAck={isDepartmentRole(role) || role === 'admin'}
        canConfirmHandoverAction={isDepartmentRole(role)}
        canExceptionHandover={role === 'admin'}
        onAcknowledge={(order) => {
          if (!requireOperator()) return;
          void acknowledgeOrder(order, device.operator).then((r) => {
            if (!r.ok) setToast(r.error);
          });
        }}
        onConfirmHandover={(order) => {
          if (!requireOperator()) return;
          if (
            !window.confirm(
              `Confirm handover of ${order.id} (${order.pallets} pallet${order.pallets === 1 ? '' : 's'})?`,
            )
          ) {
            return;
          }
          void confirmHandover(order, device.operator).then((r) => {
            if (!r.ok) setToast(r.error);
            else setToast(`Collected ${order.id}`);
          });
        }}
        onExceptionHandover={(order, reason) => {
          if (!requireOperator()) return;
          if (!reason.trim()) {
            setToast('Enter a reason for the exception handover.');
            return;
          }
          if (!window.confirm(`Exception-collect ${order.id}? ${reason.trim()}`)) return;
          void exceptionHandover(order, device.operator, reason).then((r) => {
            if (!r.ok) setToast(r.error);
            else setToast(`Exception collected ${order.id}`);
          });
        }}
        onLookupOurs={(lookup) => {
          if (!requireOperator()) return;
          if (isDepartmentRole(role)) {
            void respondToLookup(lookup, role, 'ours', device.operator);
          }
          setPrefillOrderId(lookup.orderId);
          setTab('pallet-ready');
        }}
        onLookupNotOurs={(lookup) => {
          if (!requireOperator()) return;
          if (isDepartmentRole(role)) {
            void respondToLookup(lookup, role, 'not_ours', device.operator);
          }
        }}
      />

      {tabs.length > 0 && (
        <nav className="tabs" aria-label="Sections">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tab === t.id ? 'tab active' : 'tab'}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      )}

      <main className="main">
        {showReady && (
          <PalletReadyPanel
            role={role}
            operator={device.operator}
            orders={data.orders}
            prefillOrderId={prefillOrderId}
            onClearPrefill={() => setPrefillOrderId(undefined)}
            onMarkedReady={() => setToast('Order marked ready')}
            markReady={handleMarkReady}
            updateReady={handleUpdateReady}
            onAcknowledge={(order) => {
              if (!requireOperator()) return;
              void acknowledgeOrder(order, device.operator).then((r) => {
                if (!r.ok) setToast(r.error);
              });
            }}
            onConfirmHandover={(order) => {
              if (!requireOperator()) return;
              if (
                !window.confirm(
                  `Confirm handover of ${order.id} (${order.pallets} pallet${order.pallets === 1 ? '' : 's'})?`,
                )
              ) {
                return;
              }
              void confirmHandover(order, device.operator).then((r) => {
                if (!r.ok) setToast(r.error);
                else setToast(`Collected ${order.id}`);
              });
            }}
            onCancel={(order) => {
              if (!requireOperator()) return;
              if (!window.confirm(`Cancel ready order ${order.id}? It stays in history.`)) return;
              void cancelOrder(order, device.operator).then((r) => {
                if (!r.ok) setToast(r.error);
                else setToast(`Cancelled ${order.id}`);
              });
            }}
          />
        )}

        {showDock && (
          <DockPanel
            readyOrders={data.readyOrders}
            arrivedOrders={data.arrivedOrders}
            allOrders={data.orders}
            openLookups={data.openLookups}
            operator={device.operator}
            onDriverCollection={(order: Order, extras) => {
              if (!requireOperator()) return;
              if (
                !window.confirm(
                  `Alert ${order.department} that a driver is here for ${order.id}?`,
                )
              ) {
                return;
              }
              void driverCollection(order, device.operator, extras).then((r) => {
                if (!r.ok) setToast(r.error);
              });
            }}
            onUndoCollection={(order: Order) => {
              if (!requireOperator()) return;
              if (
                !window.confirm(
                  `Return ${order.id} to the ready list? The department alarm will stop.`,
                )
              ) {
                return;
              }
              void undoDriverCollection(order, device.operator).then((r) => {
                if (!r.ok) setToast(r.error);
                else setToast(`Returned ${order.id} to ready`);
              });
            }}
            onSendLookup={async (orderId) => {
              if (!requireOperator()) return { ok: false, error: 'Enter your name at the top.' };
              return sendLookup(orderId, device.operator);
            }}
            onResendLookup={(lookup: Lookup) => {
              if (!requireOperator()) return;
              void resendLookup(lookup, device.operator);
            }}
            onCloseLookup={(lookup: Lookup) => {
              if (!requireOperator()) return;
              void updateLookupStatus(lookup.id, 'closed', device.operator, lookup.orderId);
            }}
          />
        )}

        {showHistory && (
          <HistoryPanel role={role} orders={data.orders} events={data.events} />
        )}

        {showAdmin && (
          <AdminPanel
            orders={data.orders}
            openLookupCount={data.openLookups.length}
            busy={device.busy}
            onReopen={(id) => {
              if (!requireOperator()) return Promise.resolve({ ok: false, error: 'Enter your name.' });
              return reopenOrder(id, device.operator);
            }}
            onDelete={(id) => {
              if (!requireOperator()) return Promise.resolve({ ok: false, error: 'Enter your name.' });
              return deleteOrderAdmin(id, device.operator);
            }}
            onExceptionHandover={handleExceptionById}
            onChangePin={async (current, next) => {
              const ok = await device.changePin(current, next);
              if (!ok && device.error) setToast(device.error);
              return ok;
            }}
          />
        )}
      </main>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
