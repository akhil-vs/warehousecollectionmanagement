import { useMemo, useState } from 'react';
import type { Order } from '../types';
import { DEPARTMENTS } from '../types';
import { formatDwell, formatTime, startOfLocalDay, statusLabel } from '../lib/format';
import { useNow } from '../hooks/useNow';
import { CollectionDateTables } from './CollectionDateTables';

interface Props {
  orders: Order[];
  openLookupCount: number;
  busy: boolean;
  onReopen: (orderId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  onDelete: (orderId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  onExceptionHandover: (
    orderId: string,
    reason: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  onChangePin: (current: string, next: string) => Promise<boolean>;
}

export function AdminPanel({
  orders,
  openLookupCount,
  busy,
  onReopen,
  onDelete,
  onExceptionHandover,
  onChangePin,
}: Props) {
  const now = useNow();
  const dayStart = startOfLocalDay(now);
  const [orderId, setOrderId] = useState('');
  const [exceptionReason, setExceptionReason] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [currentPin, setCurrentPin] = useState('');
  const [nextPin, setNextPin] = useState('');

  const waiting = useMemo(
    () => orders.filter((o) => o.status === 'arrived').sort((a, b) => (a.arrivedAt ?? 0) - (b.arrivedAt ?? 0)),
    [orders],
  );
  const unacked = waiting.filter((o) => !o.ackBy);
  const oldestWaiting = waiting[0];
  const collectedToday = orders.filter(
    (o) => o.status === 'collected' && (o.collectedAt ?? 0) >= dayStart,
  ).length;
  const cancelledToday = orders.filter(
    (o) => o.status === 'cancelled' && (o.cancelledAt ?? 0) >= dayStart,
  ).length;
  const readyNow = orders.filter((o) => o.status === 'ready').length;
  const liveByDate = useMemo(
    () => orders.filter((o) => o.status === 'ready' || o.status === 'arrived'),
    [orders],
  );

  const overview = useMemo(() => {
    return DEPARTMENTS.map((dept) => {
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
  }, [orders, dayStart]);

  async function reopen() {
    setMsg(null);
    setErr(null);
    const r = await onReopen(orderId);
    if (!r.ok) setErr(r.error);
    else {
      setMsg(`Reopened ${orderId.trim().toUpperCase()} as ready.`);
      setOrderId('');
    }
  }

  async function remove() {
    setMsg(null);
    setErr(null);
    if (!window.confirm(`Permanently delete order ${orderId.trim().toUpperCase()}?`)) return;
    const r = await onDelete(orderId);
    if (!r.ok) setErr(r.error);
    else {
      setMsg(`Deleted ${orderId.trim().toUpperCase()}.`);
      setOrderId('');
    }
  }

  async function exceptionCollect() {
    setMsg(null);
    setErr(null);
    const r = await onExceptionHandover(orderId, exceptionReason);
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

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Admin</h2>
        <p>Today’s board, corrections, and PIN.</p>
      </div>

      <div className="overview-grid shift-kpis">
        <div className="overview-item">
          <h3>Today</h3>
          <p>
            <strong>{collectedToday}</strong> collected
          </p>
          <p>
            <strong>{cancelledToday}</strong> cancelled
          </p>
          <p>
            <strong>{readyNow}</strong> still ready
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
          <h3>Oldest wait</h3>
          {oldestWaiting ? (
            <>
              <p>
                <strong className="mono">{oldestWaiting.id}</strong>
              </p>
              <p>{oldestWaiting.department}</p>
              <p>
                waiting {formatDwell(oldestWaiting.arrivedAt, now)} ·{' '}
                {formatTime(oldestWaiting.arrivedAt)}
              </p>
            </>
          ) : (
            <p>None waiting.</p>
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
            <th>Dept</th>
            <th>Ready</th>
          </>
        }
        renderRow={(o) => (
          <tr key={o.id} className={o.status === 'arrived' ? 'arrived' : undefined}>
            <td className="mono">{o.id}</td>
            <td>
              <span className={`status-pill ${o.status}`}>{statusLabel(o.status)}</span>
            </td>
            <td>{o.pallets}</td>
            <td>{o.bay || <span className="muted">—</span>}</td>
            <td>{o.department}</td>
            <td>
              {o.readyBy}
              <br />
              <span className="muted">{formatTime(o.readyAt)}</span>
            </td>
          </tr>
        )}
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
