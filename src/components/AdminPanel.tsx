import { Fragment, useEffect, useMemo, useState } from 'react';
import type { Department, Order } from '../types';
import {
  collectionDateLabel,
  formatDwell,
  formatTime,
  isCollectionOverdue,
  startOfLocalDay,
  statusLabel,
} from '../lib/format';
import { canEditReady, STALE_WAIT_MS } from '../lib/orderState';
import { useNow } from '../hooks/useNow';
import { CollectionDateTables } from './CollectionDateTables';
import { useConfirm } from './ConfirmDialog';
import { ReadyOrderEditForm, type ReadyOrderPatch } from './PalletReadyPanel';

interface Props {
  orders: Order[];
  departments: Department[];
  openLookupCount: number;
  busy: boolean;
  onReopen: (
    orderId: string,
    pin: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  onDelete: (
    orderId: string,
    pin: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  onExceptionHandover: (
    orderId: string,
    reason: string,
    pin: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  onChangePin: (current: string, next: string) => Promise<boolean>;
  onSetDepartments: (
    departments: string[],
    pin: string,
  ) => Promise<{ ok: true; departments: Department[] } | { ok: false; error: string }>;
  updateReady: (
    order: Order,
    patch: ReadyOrderPatch,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
}

function averageMinutes(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

export function AdminPanel({
  orders,
  departments,
  openLookupCount,
  busy,
  onReopen,
  onDelete,
  onExceptionHandover,
  onChangePin,
  onSetDepartments,
  updateReady,
}: Props) {
  const now = useNow();
  const confirm = useConfirm();
  const dayStart = startOfLocalDay(now);
  const [orderId, setOrderId] = useState('');
  const [exceptionReason, setExceptionReason] = useState('');
  const [adminPin, setAdminPin] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [currentPin, setCurrentPin] = useState('');
  const [nextPin, setNextPin] = useState('');
  const [deptDraft, setDeptDraft] = useState(departments.join(', '));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    setDeptDraft(departments.join(', '));
  }, [departments]);

  useEffect(() => {
    if (!editingId) return;
    const current = orders.find((o) => o.id === editingId);
    if (!current || current.status !== 'ready') {
      setEditingId(null);
      setEditError(null);
    }
  }, [orders, editingId]);

  const waiting = useMemo(
    () =>
      orders
        .filter((o) => o.status === 'arrived')
        .sort((a, b) => (a.arrivedAt ?? 0) - (b.arrivedAt ?? 0)),
    [orders],
  );
  const unacked = waiting.filter((o) => !o.ackBy);
  const oldestWaiting = waiting[0];
  const collectedToday = orders.filter(
    (o) => o.status === 'collected' && (o.collectedAt ?? 0) >= dayStart,
  );
  const cancelledToday = orders.filter(
    (o) => o.status === 'cancelled' && (o.cancelledAt ?? 0) >= dayStart,
  ).length;
  const readyNow = orders.filter((o) => o.status === 'ready');
  const overdueReady = readyNow.filter((o) => isCollectionOverdue(o.collectionDate, now));
  const liveByDate = useMemo(
    () => orders.filter((o) => o.status === 'ready' || o.status === 'arrived'),
    [orders],
  );

  const waitReport = useMemo(() => {
    const openWaits = waiting
      .map((o) => (o.arrivedAt ? now - o.arrivedAt : 0))
      .filter((ms) => ms > 0);
    const completedWaits = collectedToday
      .map((o) => {
        if (!o.arrivedAt || !o.collectedAt) return null;
        return o.collectedAt - o.arrivedAt;
      })
      .filter((ms): ms is number => ms != null && ms >= 0);
    const staleOpen = waiting.filter((o) => (o.arrivedAt ?? 0) > 0 && now - (o.arrivedAt ?? 0) >= STALE_WAIT_MS);
    return {
      avgOpenMin: averageMinutes(openWaits.map((ms) => ms / 60_000)),
      avgCompletedMin: averageMinutes(completedWaits.map((ms) => ms / 60_000)),
      staleOpen: staleOpen.length,
      overdueReady: overdueReady.length,
      longestOpen: oldestWaiting,
    };
  }, [waiting, collectedToday, now, overdueReady.length, oldestWaiting]);

  const overview = useMemo(() => {
    return departments.map((dept) => {
      const mine = orders.filter((o) => o.department === dept);
      return {
        dept,
        ready: mine.filter((o) => o.status === 'ready').length,
        waiting: mine.filter((o) => o.status === 'arrived').length,
        collectedToday: mine.filter(
          (o) => o.status === 'collected' && (o.collectedAt ?? 0) >= dayStart,
        ).length,
      };
    });
  }, [orders, dayStart, departments]);

  async function reopen() {
    setMsg(null);
    setErr(null);
    if (!adminPin.trim()) {
      setErr('Enter admin PIN for corrections.');
      return;
    }
    const r = await onReopen(orderId, adminPin);
    if (!r.ok) setErr(r.error);
    else {
      setMsg(`Reopened ${orderId.trim().toUpperCase()} as ready.`);
      setOrderId('');
    }
  }

  async function remove() {
    setMsg(null);
    setErr(null);
    if (!adminPin.trim()) {
      setErr('Enter admin PIN for corrections.');
      return;
    }
    const ok = await confirm({
      title: 'Delete order',
      message: `Permanently delete order ${orderId.trim().toUpperCase()}?`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    const r = await onDelete(orderId, adminPin);
    if (!r.ok) setErr(r.error);
    else {
      setMsg(`Deleted ${orderId.trim().toUpperCase()}.`);
      setOrderId('');
    }
  }

  async function exceptionCollect() {
    setMsg(null);
    setErr(null);
    if (!adminPin.trim()) {
      setErr('Enter admin PIN for corrections.');
      return;
    }
    const r = await onExceptionHandover(orderId, exceptionReason, adminPin);
    if (!r.ok) setErr(r.error);
    else {
      setMsg(`Exception handover recorded for ${orderId.trim().toUpperCase()}.`);
      setOrderId('');
      setExceptionReason('');
    }
  }

  async function changePin() {
    setMsg(null);
    setErr(null);
    const ok = await onChangePin(currentPin, nextPin);
    if (ok) {
      setMsg('Admin PIN updated.');
      setCurrentPin('');
      setNextPin('');
    }
  }

  async function saveDepartments() {
    setMsg(null);
    setErr(null);
    if (!adminPin.trim()) {
      setErr('Enter admin PIN to change departments.');
      return;
    }
    const list = deptDraft
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const r = await onSetDepartments(list, adminPin);
    if (!r.ok) setErr(r.error);
    else {
      setMsg(`Departments updated: ${r.departments.join(', ')}`);
      setDeptDraft(r.departments.join(', '));
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Admin</h2>
        <p>Today’s board, wait-time report, corrections, departments, and PIN.</p>
      </div>

      <div className="overview-grid shift-kpis">
        <div className="overview-item">
          <h3>Today</h3>
          <p>
            <strong>{collectedToday.length}</strong> collected
          </p>
          <p>
            <strong>{cancelledToday}</strong> cancelled
          </p>
          <p>
            <strong>{readyNow.length}</strong> still ready
          </p>
        </div>
        <div className="overview-item">
          <h3>Waiting now</h3>
          <p>
            <strong>{waiting.length}</strong> drivers
          </p>
          <p>
            <strong>{unacked.length}</strong> not acknowledged
          </p>
          <p>
            <strong>{openLookupCount}</strong> open lookups
          </p>
        </div>
        <div className="overview-item">
          <h3>Wait-time report</h3>
          <p>
            Avg open wait:{' '}
            <strong>
              {waitReport.avgOpenMin == null ? '—' : `${waitReport.avgOpenMin} min`}
            </strong>
          </p>
          <p>
            Avg completed today:{' '}
            <strong>
              {waitReport.avgCompletedMin == null
                ? '—'
                : `${waitReport.avgCompletedMin} min`}
            </strong>
          </p>
          <p>
            <strong>{waitReport.staleOpen}</strong> stale (&gt;15 min) ·{' '}
            <strong>{waitReport.overdueReady}</strong> overdue ready
          </p>
          {waitReport.longestOpen ? (
            <p className="muted">
              Longest: <span className="mono">{waitReport.longestOpen.id}</span> ·{' '}
              {formatDwell(waitReport.longestOpen.arrivedAt, now)}
            </p>
          ) : (
            <p className="muted">No drivers waiting.</p>
          )}
        </div>
      </div>

      <div className="overview-grid">
        {overview.map((row) => (
          <div key={row.dept} className="overview-item">
            <h3>{row.dept}</h3>
            <p>
              <strong>{row.ready}</strong> ready
            </p>
            <p>
              <strong>{row.waiting}</strong> driver waiting
            </p>
            <p>
              <strong>{row.collectedToday}</strong> collected today
            </p>
          </div>
        ))}
      </div>

      {waiting.length > 0 && (
        <div className="list-block">
          <h3>Drivers waiting (oldest first)</h3>
          <ul className="order-list">
            {waiting.map((order) => (
              <li
                key={order.id}
                className={
                  now - (order.arrivedAt ?? 0) >= STALE_WAIT_MS ? 'arrived stale' : 'arrived'
                }
              >
                <div className="order-main">
                  <span className="mono order-id">{order.id}</span>
                  <span>
                    {order.department}
                    {order.ackBy ? ` · Ack ${order.ackBy}` : ' · Not acknowledged'}
                  </span>
                  <span className="muted">
                    waiting {formatDwell(order.arrivedAt, now)} · {formatTime(order.arrivedAt)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="list-block">
        <h3>Live orders — edit ready pallets / bay / collection date</h3>
      </div>
      <CollectionDateTables
        orders={liveByDate}
        now={now}
        emptyText="No live orders."
        headers={
          <>
            <th>Order</th>
            <th>Status</th>
            <th>Pallets</th>
            <th>Bay</th>
            <th>Collect</th>
            <th>Dept</th>
            <th>Ready</th>
            <th>Actions</th>
          </>
        }
        renderRow={(o) => {
          const editing = editingId === o.id;
          return (
            <Fragment key={o.id}>
              <tr
                className={[
                  o.status === 'arrived' ? 'arrived' : '',
                  editing ? 'editing' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <td className="mono">{o.id}</td>
                <td>
                  <span className={`status-pill ${o.status}`}>{statusLabel(o.status)}</span>
                </td>
                <td>{o.pallets}</td>
                <td>{o.bay || <span className="muted">—</span>}</td>
                <td>
                  {collectionDateLabel(o.collectionDate, now) || <span className="muted">—</span>}
                </td>
                <td>{o.department}</td>
                <td>
                  {o.readyBy}
                  <br />
                  <span className="muted">{formatTime(o.readyAt)}</span>
                </td>
                <td className="table-actions">
                  {canEditReady(o) && (
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => {
                        setEditingId(o.id);
                        setEditError(null);
                      }}
                    >
                      Edit
                    </button>
                  )}
                </td>
              </tr>
              {editing && (
                <tr className="editing">
                  <td colSpan={8}>
                    <ReadyOrderEditForm
                      order={o}
                      busy={editBusy}
                      error={editError}
                      onSave={async (patch) => {
                        setEditBusy(true);
                        setEditError(null);
                        const result = await updateReady(o, patch);
                        setEditBusy(false);
                        if (!result.ok) {
                          setEditError(result.error);
                          return false;
                        }
                        setEditingId(null);
                        setMsg(`Updated ${o.id}`);
                        return true;
                      }}
                      onCancel={() => {
                        setEditingId(null);
                        setEditError(null);
                      }}
                    />
                  </td>
                </tr>
              )}
            </Fragment>
          );
        }}
      />

      <div className="admin-block">
        <h3>Order correction</h3>
        <label className="field">
          <span>Order ID</span>
          <input
            className="mono"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value.toUpperCase())}
          />
        </label>
        <label className="field">
          <span>Exception reason</span>
          <input
            value={exceptionReason}
            onChange={(e) => setExceptionReason(e.target.value)}
            placeholder="Required for exception handover"
          />
        </label>
        <label className="field">
          <span>Admin PIN (required for reopen / delete)</span>
          <input
            type="password"
            value={adminPin}
            onChange={(e) => setAdminPin(e.target.value)}
            autoComplete="off"
          />
        </label>
        <div className="row-actions">
          <button type="button" className="btn primary" disabled={busy} onClick={() => void reopen()}>
            Reopen as ready
          </button>
          <button
            type="button"
            className="btn solid"
            disabled={busy}
            onClick={() => void exceptionCollect()}
          >
            Exception handover
          </button>
          <button type="button" className="btn ghost danger" disabled={busy} onClick={() => void remove()}>
            Delete order
          </button>
        </div>
      </div>

      <div className="admin-block">
        <h3>Departments</h3>
        <p className="muted">Comma-separated list. Changing names may force department PCs to reassign.</p>
        <label className="field">
          <span>Department names</span>
          <input value={deptDraft} onChange={(e) => setDeptDraft(e.target.value)} />
        </label>
        <button type="button" className="btn solid" disabled={busy} onClick={() => void saveDepartments()}>
          Save departments
        </button>
      </div>

      <div className="admin-block">
        <h3>Change admin PIN</h3>
        <label className="field">
          <span>Current PIN</span>
          <input
            type="password"
            value={currentPin}
            onChange={(e) => setCurrentPin(e.target.value)}
          />
        </label>
        <label className="field">
          <span>New PIN</span>
          <input type="password" value={nextPin} onChange={(e) => setNextPin(e.target.value)} />
        </label>
        <button type="button" className="btn solid" disabled={busy} onClick={() => void changePin()}>
          Update PIN
        </button>
      </div>

      {msg && <p className="form-ok">{msg}</p>}
      {err && <p className="form-error">{err}</p>}
    </section>
  );
}
