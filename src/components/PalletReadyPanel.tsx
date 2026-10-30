import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import type { Department, DeviceRole, Order } from '../types';
import { formatDwell, formatTime, isCollectionOverdue, isStaleWait, statusLabel } from '../lib/format';
import { isDepartmentRole } from '../hooks/useDeviceRole';
import { useNow } from '../hooks/useNow';
import { canAcknowledge, canCancelReady, canConfirmHandover, canEditReady } from '../lib/orderState';
import { CollectionDateTables } from './CollectionDateTables';

export interface ReadyOrderPatch {
  pallets: number;
  bay?: string;
  collectionDate?: string;
}

interface Props {
  role: DeviceRole;
  departments: Department[];
  operator: string;
  orders: Order[];
  prefillOrderId?: string;
  onMarkedReady: () => void;
  onClearPrefill: () => void;
  markReady: (input: {
    orderId: string;
    pallets?: number;
    bay?: string;
    collectionDate?: string;
    department: Department;
    operator: string;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
  updateReady: (
    order: Order,
    patch: ReadyOrderPatch,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  onAcknowledge: (order: Order) => void;
  onConfirmHandover: (order: Order) => void;
  onCancel: (order: Order) => void;
}

function ReadyOrderEditForm({
  order,
  busy,
  error,
  onSave,
  onCancel,
}: {
  order: Order;
  busy: boolean;
  error: string | null;
  onSave: (patch: ReadyOrderPatch) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [pallets, setPallets] = useState(String(order.pallets));
  const [bay, setBay] = useState(order.bay ?? '');
  const [collectionDate, setCollectionDate] = useState(order.collectionDate ?? '');
  const [localError, setLocalError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const n = Number(pallets);
    if (!Number.isFinite(n) || n < 1) {
      setLocalError('Pallet count must be at least 1.');
      return;
    }
    setLocalError(null);
    await onSave({
      pallets: Math.floor(n),
      bay: bay.trim() || undefined,
      collectionDate: collectionDate.trim() || undefined,
    });
  }

  return (
    <form className="ready-edit-form" onSubmit={(e) => void submit(e)}>
      <label className="field">
        <span>Pallets</span>
        <input
          type="number"
          min={1}
          value={pallets}
          onChange={(e) => setPallets(e.target.value)}
          required
          autoFocus
        />
      </label>
      <label className="field">
        <span>Bay (optional)</span>
        <input value={bay} onChange={(e) => setBay(e.target.value)} />
      </label>
      <label className="field">
        <span>Collection date</span>
        <input
          type="date"
          value={collectionDate}
          onChange={(e) => setCollectionDate(e.target.value)}
        />
      </label>
      <div className="row-actions">
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="btn ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
      {(localError || error) && <p className="form-error">{localError || error}</p>}
    </form>
  );
}

export function PalletReadyPanel({
  role,
  departments,
  operator,
  orders,
  prefillOrderId,
  onMarkedReady,
  onClearPrefill,
  markReady,
  updateReady,
  onAcknowledge,
  onConfirmHandover,
  onCancel,
}: Props) {
  const now = useNow();
  const deptDefault: Department = isDepartmentRole(role, departments)
    ? role
    : (departments[0] ?? 'B2B');
  const orderIdRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const [orderId, setOrderId] = useState('');
  const [pallets, setPallets] = useState('');
  const [bay, setBay] = useState('');
  const [collectionDate, setCollectionDate] = useState('');
  const [department, setDepartment] = useState<Department>(deptDefault);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    if (prefillOrderId) {
      setOrderId(prefillOrderId);
      onClearPrefill();
      orderIdRef.current?.focus();
    }
  }, [prefillOrderId, onClearPrefill]);

  useEffect(() => {
    if (isDepartmentRole(role, departments)) setDepartment(role);
    else if (!departments.includes(department) && departments[0]) setDepartment(departments[0]);
  }, [role, departments, department]);

  useEffect(() => {
    if (!editingId) return;
    const current = orders.find((o) => o.id === editingId);
    if (!current || current.status !== 'ready') {
      setEditingId(null);
      setEditError(null);
    }
  }, [orders, editingId]);

  const visible = useMemo(() => {
    const live = isDepartmentRole(role, departments)
      ? orders.filter((o) => o.department === role && (o.status === 'ready' || o.status === 'arrived'))
      : orders.filter((o) => o.status === 'ready' || o.status === 'arrived');
    return [...live].sort((a, b) => {
      if (a.status !== b.status) return a.status === 'arrived' ? -1 : 1;
      const aTs = a.status === 'arrived' ? (a.arrivedAt ?? 0) : a.readyAt;
      const bTs = b.status === 'arrived' ? (b.arrivedAt ?? 0) : b.readyAt;
      return bTs - aTs;
    });
  }, [orders, role, departments]);

  const canAck = isDepartmentRole(role, departments) || role === 'admin';
  const canHandover = isDepartmentRole(role, departments);
  const canEdit = isDepartmentRole(role, departments) || role === 'admin';

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
    setCollectionDate('');
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
      collectionDate: collectionDate || undefined,
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

  async function saveEdit(order: Order, patch: ReadyOrderPatch): Promise<boolean> {
    setEditBusy(true);
    setEditError(null);
    const result = await updateReady(order, patch);
    setEditBusy(false);
    if (!result.ok) {
      setEditError(result.error);
      return false;
    }
    setEditingId(null);
    setEditError(null);
    return true;
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Pallet ready</h2>
        <p>
          Scan or type an order ID to mark it ready. Pallet count is optional and defaults to 1. Edit
          a ready order to change pallets, bay, or collection date.
        </p>
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
        <label className="field">
          <span>Collection date (optional)</span>
          <input
            type="date"
            value={collectionDate}
            onChange={(e) => setCollectionDate(e.target.value)}
          />
        </label>
        {role === 'admin' && (
          <label className="field">
            <span>Department</span>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value as Department)}
            >
              {departments.map((d) => (
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

      <CollectionDateTables
        orders={visible}
        now={now}
        emptyText="No active orders."
        headers={
          <>
            <th>Order</th>
            <th>Status</th>
            <th>Pallets</th>
            <th>Bay</th>
            {role === 'admin' && <th>Dept</th>}
            <th>Ready</th>
            <th>Actions</th>
          </>
        }
        renderRow={(order) => {
          const dwellFrom = order.status === 'arrived' ? order.arrivedAt : order.readyAt;
          const stale =
            (order.status === 'arrived' && isStaleWait(dwellFrom, now)) ||
            (order.status === 'ready' && isCollectionOverdue(order.collectionDate, now));
          const editing = editingId === order.id;
          const colSpan = role === 'admin' ? 7 : 6;
          return (
            <Fragment key={order.id}>
              <tr
                className={[
                  order.status === 'arrived' ? 'arrived' : '',
                  stale ? 'stale' : '',
                  editing ? 'editing' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <td className="mono">{order.id}</td>
                <td>
                  <span className={`status-pill ${order.status}`}>{statusLabel(order.status)}</span>
                  {order.door ? <span className="muted"> · Door {order.door}</span> : null}
                </td>
                <td>{order.pallets}</td>
                <td>{order.bay || <span className="muted">—</span>}</td>
                {role === 'admin' && <td>{order.department}</td>}
                <td>
                  {order.readyBy}
                  <br />
                  <span className="muted">
                    {formatTime(order.readyAt)}
                    {order.status === 'arrived'
                      ? ` · waiting ${formatDwell(order.arrivedAt, now)}`
                      : ` · ready ${formatDwell(order.readyAt, now)}`}
                  </span>
                </td>
                <td className="table-actions">
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
                  {canEdit && canEditReady(order) && (
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => {
                        setEditingId(order.id);
                        setEditError(null);
                      }}
                    >
                      Edit
                    </button>
                  )}
                  {canCancelReady(order) && canEdit && (
                    <button type="button" className="btn ghost danger" onClick={() => onCancel(order)}>
                      Cancel
                    </button>
                  )}
                </td>
              </tr>
              {editing && (
                <tr className="editing">
                  <td colSpan={colSpan}>
                    <ReadyOrderEditForm
                      order={order}
                      busy={editBusy}
                      error={editError}
                      onSave={(patch) => saveEdit(order, patch)}
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
    </section>
  );
}
