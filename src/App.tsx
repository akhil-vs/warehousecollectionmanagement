import { useCallback, useEffect, useState } from 'react';
import type { DeviceRole, Lookup, Order, TabId } from './types';
import { isFirebaseConfigured, ensureAnonymousAuth } from './lib/firebase';
import { isSoundUnlocked, unlockSound } from './lib/sound';
import { requestNotificationPermission } from './lib/notifications';
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
  setDepartments,
  undoDriverCollection,
  updateLookupStatus,
} from './lib/ordersApi';
import { useDeviceRole, isDepartmentRole } from './hooks/useDeviceRole';
import { useWarehouseData } from './hooks/useWarehouseData';
import { useToast } from './hooks/useToast';
import { useAlerts } from './hooks/useAlerts';
import { ConfirmProvider, useConfirm } from './components/ConfirmDialog';
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

function AppShell() {
  const [bootError, setBootError] = useState<string | null>(null);
  const [booted, setBooted] = useState(!isFirebaseConfigured());
  const [demoMode] = useState(!isFirebaseConfigured());
  const device = useDeviceRole();
  const data = useWarehouseData();
  const confirm = useConfirm();
  const { toast, showToast } = useToast();
  const [tab, setTab] = useState<TabId>('pallet-ready');
  const [alertsEnabled, setAlertsEnabled] = useState(
    () => typeof Notification !== 'undefined' && Notification.permission === 'granted',
  );
  const [soundBlocked, setSoundBlocked] = useState(true);
  const [prefillOrderId, setPrefillOrderId] = useState<string | undefined>();
  const [alertResetKey, setAlertResetKey] = useState(0);
  const [adminPinCache, setAdminPinCache] = useState('');

  const { waitingForUs } = useAlerts({
    role: device.role,
    departments: device.departments,
    orders: data.orders,
    arrivedOrders: data.arrivedOrders,
    openLookups: data.openLookups,
    onToast: showToast,
    resetKey: alertResetKey,
  });

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

  const requireOperator = useCallback(() => {
    if (!device.operator.trim()) {
      showToast('Enter your name at the top first.');
      return false;
    }
    if (device.shiftStale) {
      showToast('Confirm your name for this shift first.');
      return false;
    }
    return true;
  }, [device.operator, device.shiftStale, showToast]);

  const requireAdminPin = useCallback(async (): Promise<string | null> => {
    if (adminPinCache.trim()) return adminPinCache.trim();
    const entered = window.prompt('Enter admin PIN to continue');
    if (!entered) return null;
    setAdminPinCache(entered);
    return entered;
  }, [adminPinCache]);

  const handleMarkReady = useCallback(
    async (input: {
      orderId: string;
      pallets?: number;
      bay?: string;
      collectionDate?: string;
      department: import('./types').Department;
      operator: string;
    }) => {
      if (!requireOperator()) {
        return { ok: false as const, error: 'Confirm your name for this shift first.' };
      }
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
      if (result.ok) showToast(`Updated ${order.id}`);
      return result;
    },
    [device.operator, requireOperator, showToast],
  );

  const handleExceptionById = useCallback(
    async (orderId: string, reason: string, pin?: string) => {
      if (!requireOperator()) return { ok: false as const, error: 'Confirm your name first.' };
      const order = data.arrivedOrders.find((o) => o.id === orderId.trim().toUpperCase());
      if (!order) return { ok: false as const, error: 'No driver is waiting on that order.' };
      const ok = await confirm({
        title: 'Exception handover',
        message: `Exception-collect ${order.id}? ${reason.trim()}`,
        confirmLabel: 'Exception handover',
        danger: true,
      });
      if (!ok) return { ok: false as const, error: 'Cancelled.' };
      const resolvedPin = pin?.trim() || (await requireAdminPin());
      if (!resolvedPin) return { ok: false as const, error: 'Admin PIN required.' };
      return exceptionHandover(order, device.operator, reason, resolvedPin);
    },
    [confirm, data.arrivedOrders, device.operator, requireAdminPin, requireOperator],
  );

  if (bootError) {
    return (
      <div className="setup-screen">
        <div className="setup-panel">
          <p className="brand-mark">FreightFetch</p>
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
          <p className="brand-mark">FreightFetch</p>
          <p className="lede">Connecting…</p>
        </div>
      </div>
    );
  }

  if (!device.role) {
    return (
      <RoleSetup
        pinConfigured={device.pinConfigured}
        departments={device.departments}
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
    (isDepartmentRole(role, device.departments) && tab === 'pallet-ready') ||
    (role === 'admin' && tab === 'pallet-ready');
  const showHistory =
    (isDepartmentRole(role, device.departments) && tab === 'history') ||
    (role === 'admin' && tab === 'history');
  const showAdmin = role === 'admin' && tab === 'admin';

  return (
    <div
      className="app-shell"
      onPointerDown={() => void unlockSound().then((ok) => setSoundBlocked(!ok))}
    >
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
            if (p !== 'granted') showToast('Browser notifications were not granted.');
          });
        }}
        soundBlocked={soundBlocked && !isSoundUnlocked()}
        onUnlockSound={() => void unlockSound().then((ok) => setSoundBlocked(!ok))}
        reassignBusy={device.busy}
        reassignError={device.error}
        onReassign={async (pin) => {
          const ok = await device.reassignWithPin(pin);
          if (ok) setAlertResetKey((k) => k + 1);
          return ok;
        }}
      />

      {device.shiftStale && (
        <ShiftBanner
          operator={device.operator}
          soundBlocked={soundBlocked && !isSoundUnlocked()}
          alertsEnabled={alertsEnabled}
          onConfirm={() => {
            const ok = device.confirmShift();
            if (ok) {
              void unlockSound().then((unlocked) => setSoundBlocked(!unlocked));
              if (!alertsEnabled) {
                void requestNotificationPermission().then((p) => {
                  setAlertsEnabled(p === 'granted');
                });
              }
            }
            return ok;
          }}
          onUnlockSound={() => void unlockSound().then((ok) => setSoundBlocked(!ok))}
          onEnableAlerts={() => {
            void requestNotificationPermission().then((p) => {
              setAlertsEnabled(p === 'granted');
              if (p !== 'granted') showToast('Browser notifications were not granted.');
            });
          }}
        />
      )}

      <AlertBanners
        waitingForUs={waitingForUs}
        openLookups={data.openLookups}
        department={isDepartmentRole(role, device.departments) ? role : undefined}
        canRespondLookup={isDepartmentRole(role, device.departments)}
        canAck={isDepartmentRole(role, device.departments) || role === 'admin'}
        canConfirmHandoverAction={isDepartmentRole(role, device.departments)}
        canExceptionHandover={role === 'admin'}
        onAcknowledge={(order) => {
          if (!requireOperator()) return;
          void acknowledgeOrder(order, device.operator).then((r) => {
            if (!r.ok) showToast(r.error);
          });
        }}
        onConfirmHandover={(order) => {
          if (!requireOperator()) return;
          void confirm({
            title: 'Confirm handover',
            message: `Confirm handover of ${order.id} (${order.pallets} pallet${order.pallets === 1 ? '' : 's'})?`,
            confirmLabel: 'Confirm handover',
          }).then((ok) => {
            if (!ok) return;
            void confirmHandover(order, device.operator).then((r) => {
              if (!r.ok) showToast(r.error);
              else showToast(`Collected ${order.id}`);
            });
          });
        }}
        onExceptionHandover={(order, reason) => {
          if (!requireOperator()) return;
          if (!reason.trim()) {
            showToast('Enter a reason for the exception handover.');
            return;
          }
          void confirm({
            title: 'Exception handover',
            message: `Exception-collect ${order.id}? ${reason.trim()}`,
            confirmLabel: 'Exception handover',
            danger: true,
          }).then(async (ok) => {
            if (!ok) return;
            const pin = await requireAdminPin();
            if (!pin) {
              showToast('Admin PIN required.');
              return;
            }
            void exceptionHandover(order, device.operator, reason, pin).then((r) => {
              if (!r.ok) showToast(r.error);
              else showToast(`Exception collected ${order.id}`);
            });
          });
        }}
        onLookupOurs={(lookup) => {
          if (!requireOperator()) return;
          if (isDepartmentRole(role, device.departments)) {
            void respondToLookup(lookup, role, 'ours', device.operator);
          }
          setPrefillOrderId(lookup.orderId);
          setTab('pallet-ready');
        }}
        onLookupNotOurs={(lookup) => {
          if (!requireOperator()) return;
          if (isDepartmentRole(role, device.departments)) {
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
            departments={device.departments}
            operator={device.operator}
            orders={data.orders}
            prefillOrderId={prefillOrderId}
            onClearPrefill={() => setPrefillOrderId(undefined)}
            onMarkedReady={() => showToast('Order marked ready')}
            markReady={handleMarkReady}
            updateReady={handleUpdateReady}
            onAcknowledge={(order) => {
              if (!requireOperator()) return;
              void acknowledgeOrder(order, device.operator).then((r) => {
                if (!r.ok) showToast(r.error);
              });
            }}
            onConfirmHandover={(order) => {
              if (!requireOperator()) return;
              void confirm({
                title: 'Confirm handover',
                message: `Confirm handover of ${order.id} (${order.pallets} pallet${order.pallets === 1 ? '' : 's'})?`,
                confirmLabel: 'Confirm handover',
              }).then((ok) => {
                if (!ok) return;
                void confirmHandover(order, device.operator).then((r) => {
                  if (!r.ok) showToast(r.error);
                  else showToast(`Collected ${order.id}`);
                });
              });
            }}
            onCancel={(order) => {
              if (!requireOperator()) return;
              void confirm({
                title: 'Cancel ready order',
                message: `Cancel ready order ${order.id}? It stays in history.`,
                confirmLabel: 'Cancel order',
                danger: true,
              }).then((ok) => {
                if (!ok) return;
                void cancelOrder(order, device.operator).then((r) => {
                  if (!r.ok) showToast(r.error);
                  else showToast(`Cancelled ${order.id}`);
                });
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
            departments={device.departments}
            operator={device.operator}
            onDriverCollection={(order: Order, extras) => {
              if (!requireOperator()) return;
              void confirm({
                title: 'Driver collection',
                message: `Alert ${order.department} that a driver is here for ${order.id}?`,
                confirmLabel: 'Alert department',
              }).then((ok) => {
                if (!ok) return;
                void driverCollection(order, device.operator, extras).then((r) => {
                  if (!r.ok) showToast(r.error);
                });
              });
            }}
            onUndoCollection={(order: Order) => {
              if (!requireOperator()) return;
              void confirm({
                title: 'Undo collection',
                message: `Return ${order.id} to the ready list? The department alarm will stop.`,
                confirmLabel: 'Undo collection',
              }).then((ok) => {
                if (!ok) return;
                void undoDriverCollection(order, device.operator).then((r) => {
                  if (!r.ok) showToast(r.error);
                  else showToast(`Returned ${order.id} to ready`);
                });
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
          <HistoryPanel role={role} departments={device.departments} orders={data.orders} events={data.events} />
        )}

        {showAdmin && (
          <AdminPanel
            orders={data.orders}
            departments={device.departments}
            openLookupCount={data.openLookups.length}
            busy={device.busy}
            onReopen={async (id, pin) => {
              if (!requireOperator()) return { ok: false, error: 'Enter your name.' };
              return reopenOrder(id, device.operator, pin);
            }}
            onDelete={async (id, pin) => {
              if (!requireOperator()) return { ok: false, error: 'Enter your name.' };
              return deleteOrderAdmin(id, device.operator, pin);
            }}
            onExceptionHandover={handleExceptionById}
            onChangePin={async (current, next) => {
              const ok = await device.changePin(current, next);
              if (!ok && device.error) showToast(device.error);
              return ok;
            }}
            onSetDepartments={(next, pin) => setDepartments(next, pin)}
          />
        )}
      </main>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

export default function App() {
  return (
    <ConfirmProvider>
      <AppShell />
    </ConfirmProvider>
  );
}
