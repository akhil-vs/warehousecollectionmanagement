import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
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
    pallets?: number;
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
  const orderIdRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const [orderId, setOrderId] = useState('');
  const [pallets, setPallets] = useState('');
  const [bay, setBay] = useState('');
  const [department, setDepartment] = useState<Department>(deptDefault);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (prefillOrderId) {
      setOrderId(prefillOrderId);
      onClearPrefill();
      orderIdRef.current?.focus();
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

  function parsedPallets(): number | undefined {
    const raw = pallets.trim();
    if (!raw) return undefined;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 1) return undefined;
    return Math.floor(n);
  }

  function clearFields() {
    setOrderId('');
    setPallets('');
    setBay('');
    setError(null);
    orderIdRef.current?.focus();
  }

  async function save(overrideOrderId?: string) {
    if (busyRef.current) return;
    const id = (overrideOrderId ?? orderIdRef.current?.value ?? orderId)
      .replace(/[\r\n]+/g, '')
      .trim()
      .toUpperCase();
    if (!id) {
      setError('Enter an order ID.');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError(null);
    const result = await markReady({
      orderId: id,
      pallets: parsedPallets(),
      bay: bay || undefined,
      department: role === 'admin' ? department : deptDefault,
      operator,
    });
    busyRef.current = false;
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    clearFields();
    onMarkedReady();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void save();
  }

  function onOrderIdKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    void save();
  }

  function onOrderIdChange(value: string) {
    const scannedSubmit = /[\r\n]/.test(value);
    const next = value.toUpperCase().replace(/[\r\n]+/g, '');
    setOrderId(next);
    if (scannedSubmit && next.trim()) void save(next);
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Pallet ready</h2>
        <p>Scan or type an order ID to mark it ready. Pallet count is optional and defaults to 1.</p>
      </div>

      <form className="ready-form" onSubmit={submit} noValidate>
        <label className="field">
          <span>Order ID</span>
          <input
            ref={orderIdRef}
            className="mono"
            value={orderId}
            onChange={(e) => onOrderIdChange(e.target.value)}
            onKeyDown={onOrderIdKeyDown}
            required
            autoComplete="off"
            autoFocus
            placeholder="Scan or type"
          />
        </label>
        <label className="field">
          <span>Pallets (optional)</span>
          <input
            type="number"
            min={1}
            value={pallets}
            onChange={(e) => setPallets(e.target.value)}
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
