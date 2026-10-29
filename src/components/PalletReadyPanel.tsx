import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { Department, DeviceRole, Order } from '../types';
import { DEPARTMENTS } from '../types';
import { formatDwell, formatTime, isStaleWait, statusLabel } from '../lib/format';
import { isDepartmentRole } from '../hooks/useDeviceRole';
import { useNow } from '../hooks/useNow';
import { canAcknowledge, canCancelReady, canConfirmHandover } from '../lib/orderState';

interface Props {
  role: DeviceRole;
  operator: string;
  orders: Order[];
  prefillOrderId?: string;
  onMarkedReady: () => void;
  onClearPrefill: () => void;
  markReady: (input: {
    orderId: string;
    pallets: number;
    bay?: string;
    department: Department;
    operator: string;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
  onAcknowledge: (order: Order) => void;
  onConfirmHandover: (order: Order) => void;
  onCancel: (order: Order) => void;
}

export function PalletReadyPanel({
  role,
  operator,
  orders,
  prefillOrderId,
  onMarkedReady,
  onClearPrefill,
  markReady,
  onAcknowledge,
  onConfirmHandover,
  onCancel,
}: Props) {
  const now = useNow();
  const deptDefault: Department = isDepartmentRole(role) ? role : 'B2B';
  const [orderId, setOrderId] = useState('');
  const [pallets, setPallets] = useState('1');
  const [bay, setBay] = useState('');
  const [department, setDepartment] = useState<Department>(deptDefault);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (prefillOrderId) {
      setOrderId(prefillOrderId);
      onClearPrefill();
    }
  }, [prefillOrderId, onClearPrefill]);

  useEffect(() => {
    if (isDepartmentRole(role)) setDepartment(role);
  }, [role]);

  const visible = useMemo(() => {
    const live = isDepartmentRole(role)
      ? orders.filter((o) => o.department === role && (o.status === 'ready' || o.status === 'arrived'))
      : orders.filter((o) => o.status === 'ready' || o.status === 'arrived');
    return [...live].sort((a, b) => {
      if (a.status !== b.status) return a.status === 'arrived' ? -1 : 1;
      const aTs = a.status === 'arrived' ? (a.arrivedAt ?? 0) : a.readyAt;
      const bTs = b.status === 'arrived' ? (b.arrivedAt ?? 0) : b.readyAt;
      return bTs - aTs;
    });
  }, [orders, role]);

  const canAck = isDepartmentRole(role) || role === 'admin';
  const canHandover = isDepartmentRole(role);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await markReady({
      orderId,
      pallets: Number(pallets),
      bay: bay || undefined,
      department: role === 'admin' ? department : deptDefault,
      operator,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOrderId('');
    setPallets('1');
    setBay('');
    onMarkedReady();
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Pallet ready</h2>
        <p>Mark an order ready for dock collection.</p>
      </div>

      <form className="ready-form" onSubmit={(e) => void submit(e)}>
        <label className="field">
          <span>Order ID</span>
          <input
            className="mono"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value.toUpperCase())}
            required
            autoComplete="off"
          />
        </label>
        <label className="field">
          <span>Pallets</span>
          <input
            type="number"
            min={1}
            value={pallets}
            onChange={(e) => setPallets(e.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>Bay (optional)</span>
          <input value={bay} onChange={(e) => setBay(e.target.value)} />
        </label>
        {role === 'admin' && (
          <label className="field">
            <span>Department</span>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value as Department)}
            >
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? 'Saving…' : 'Mark ready'}
        </button>
      </form>
      {error && <p className="form-error">{error}</p>}

      <div className="list-block">
        <h3>Ready &amp; waiting</h3>
        {visible.length === 0 && <p className="empty">No active orders.</p>}
        <ul className="order-list">
          {visible.map((order) => {
            const dwellFrom = order.status === 'arrived' ? order.arrivedAt : order.readyAt;
            const stale = order.status === 'arrived' && isStaleWait(dwellFrom, now);
            return (
              <li
                key={order.id}
                className={[order.status === 'arrived' ? 'arrived' : '', stale ? 'stale' : '']
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className="order-main">
                  <span className="mono order-id">{order.id}</span>
                  <span className={`status-pill ${order.status}`}>{statusLabel(order.status)}</span>
                  <span>
                    {order.pallets} plt{order.bay ? ` · Bay ${order.bay}` : ''} · {order.department}
                    {order.door ? ` · Door ${order.door}` : ''}
                  </span>
                  <span className="muted">
                    Ready by {order.readyBy} · {formatTime(order.readyAt)}
                    {order.status === 'arrived'
                      ? ` · waiting ${formatDwell(order.arrivedAt, now)}`
                      : ` · ready ${formatDwell(order.readyAt, now)}`}
                  </span>
                </div>
                <div className="order-actions">
                  {canAck && canAcknowledge(order) && (
                    <button type="button" className="btn primary" onClick={() => onAcknowledge(order)}>
                      Acknowledge
                    </button>
                  )}
                  {canHandover && canConfirmHandover(order) && (
                    <button
                      type="button"
                      className="btn solid"
                      onClick={() => onConfirmHandover(order)}
                    >
                      Confirm handover
                    </button>
                  )}
                  {canCancelReady(order) && (isDepartmentRole(role) || role === 'admin') && (
                    <button type="button" className="btn ghost danger" onClick={() => onCancel(order)}>
                      Cancel
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
