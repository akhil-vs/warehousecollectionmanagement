import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import type { Department, DeviceRole, Order } from '../types';
import {
  collectionDateKind,
  collectionDateLabel,
  formatDwell,
  formatTime,
  isCollectionOverdue,
  isStaleWait,
  statusLabel,
} from '../lib/format';
import { isDepartmentRole } from '../hooks/useDeviceRole';
import { useNow } from '../hooks/useNow';
import {
  canAcknowledge,
  canCancelReady,
  canConfirmHandover,
  canEditReady,
  parseJiraTicket,
} from '../lib/orderState';
import { CollectionDateTables } from './CollectionDateTables';
import { CollectionDateField } from './CollectionDateField';
import { JiraTicketField } from './JiraTicketField';
import { JiraTicketText } from './JiraTicketText';
import {
  IconBarcode,
  IconBay,
  IconCancel,
  IconCheck,
  IconDept,
  IconEdit,
  IconPallet,
} from './Icons';

export interface ReadyOrderPatch {
  pallets: number;
  bay?: string;
  jiraTicket?: string;
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
    jiraTicket?: string;
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

function CollectCell({ order, now }: { order: Order; now: number }) {
  const label = collectionDateLabel(order.collectionDate, now);
  if (!label) return <span className="muted">—</span>;
  const kind = collectionDateKind(order.collectionDate, now);
  return (
    <span className={`collect-cell collect-${kind}`}>
      <span className="collect-dot" aria-hidden />
      {label}
    </span>
  );
}

function BayCell({ bay }: { bay?: string }) {
  if (!bay) return <span className="muted">—</span>;
  return <span className="bay-pill">{bay.startsWith('Bay') ? bay : `Bay ${bay}`}</span>;
}

export function ReadyOrderEditForm({
  order,
  busy,
  error,
  onSave,
  onCancel,
  jiraFieldId,
}: {
  order: Order;
  busy: boolean;
  error: string | null;
  onSave: (patch: ReadyOrderPatch) => Promise<boolean>;
  onCancel: () => void;
  jiraFieldId?: string;
}) {
  const [pallets, setPallets] = useState(String(order.pallets));
  const [bay, setBay] = useState(order.bay ?? '');
  const [jiraTicket, setJiraTicket] = useState(order.jiraTicket ?? '');
  const [collectionDate, setCollectionDate] = useState(order.collectionDate ?? '');
  const [localError, setLocalError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const n = Number(pallets);
    if (!Number.isFinite(n) || n < 1) {
      setLocalError('Pallet count must be at least 1.');
      return;
    }
    const jira = parseJiraTicket(jiraTicket);
    if (!jira.ok) {
      setLocalError(jira.error);
      return;
    }
    setLocalError(null);
    await onSave({
      pallets: Math.floor(n),
      bay: bay.trim() || undefined,
      jiraTicket: jira.ticket,
      collectionDate: collectionDate.trim() || undefined,
    });
  }

  return (
    <form className="ready-edit-form" onSubmit={(e) => void submit(e)}>
      <label className="field">
        <span className="icon-label">
          <IconPallet />
          Pallets
        </span>
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
        <span className="icon-label">
          <IconBay />
          Bay (opt)
        </span>
        <input value={bay} onChange={(e) => setBay(e.target.value)} placeholder="e.g. Bay 2" />
      </label>
      <JiraTicketField
        value={jiraTicket}
        onChange={setJiraTicket}
        id={jiraFieldId ?? `ready-edit-jira-${order.id}`}
      />
      <CollectionDateField value={collectionDate} onChange={setCollectionDate} optional={false} />
      <div className="row-actions">
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save changes'}
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
  const [pallets, setPallets] = useState('1');
  const [bay, setBay] = useState('');
  const [jiraTicket, setJiraTicket] = useState('');
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

  const awaiting = useMemo(() => {
    const ready = visible.filter((o) => o.status === 'ready' || o.status === 'arrived');
    const plt = ready.reduce((n, o) => n + (Number.isFinite(o.pallets) ? o.pallets : 0), 0);
    return { orders: ready.length, pallets: plt };
  }, [visible]);

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
    setPallets('1');
    setBay('');
    setJiraTicket('');
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
    const jira = parseJiraTicket(jiraTicket);
    if (!jira.ok) {
      setError(jira.error);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError(null);
    const result = await markReady({
      orderId: id,
      pallets: parsedPallets(),
      bay: bay || undefined,
      jiraTicket: jira.ticket,
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

  function onFormKeyDown(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key !== 'Enter') return;
    const target = e.target as HTMLElement | null;
    if (target?.tagName === 'TEXTAREA') return;
    if (target?.tagName === 'BUTTON' && (target as HTMLButtonElement).type === 'button') return;
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

  function startEdit(order: Order) {
    setEditingId(order.id);
    setEditError(null);
  }

  function renderActions(order: Order) {
    return (
      <div className="order-actions table-actions">
        {canAck && canAcknowledge(order) && (
          <button type="button" className="btn primary" onClick={() => onAcknowledge(order)}>
            <IconCheck />
            Acknowledge
          </button>
        )}
        {canHandover && canConfirmHandover(order) && (
          <button type="button" className="btn solid" onClick={() => onConfirmHandover(order)}>
            <IconCheck />
            Confirm handover
          </button>
        )}
        {canEdit && canEditReady(order) && (
          <button type="button" className="btn ghost" onClick={() => startEdit(order)}>
            <IconEdit />
            Edit
          </button>
        )}
        {canCancelReady(order) && canEdit && (
          <button type="button" className="btn ghost danger" onClick={() => onCancel(order)}>
            <IconCancel />
            Cancel
          </button>
        )}
      </div>
    );
  }

  const colSpan = role === 'admin' ? 9 : 8;

  return (
    <section className="panel">
      <div className="panel-head panel-head-split">
        <div>
          <div className="panel-title">
            <IconPallet />
            <h2>Pallet ready</h2>
          </div>
          <p>
            Mark orders ready with optional pallets, bay, Jira ticket number, and collection date.
            Use <strong>Edit</strong> on any ready row to change those fields before the driver
            arrives.
          </p>
        </div>
        <div className="awaiting-summary" aria-live="polite">
          <span className="awaiting-label">Awaiting pickup</span>
          <strong>
            {awaiting.orders} Order{awaiting.orders === 1 ? '' : 's'}
          </strong>
          <span className="awaiting-plt">{awaiting.pallets} PLT</span>
        </div>
      </div>

      <form className="ready-form stage-form" onSubmit={submit} onKeyDown={onFormKeyDown} noValidate>
        <div className="stage-form-head">
          <h3 className="stage-form-title">+ Stage new ready order</h3>
          <p className="stage-form-status">
            <span className="live-dot" aria-hidden />
            Barcode scanner auto-detection active
          </p>
        </div>

        <div className="stage-form-fields">
          <label className="field field-order">
            <span className="icon-label">
              <IconBarcode />
              Order ID *
            </span>
            <input
              ref={orderIdRef}
              className="mono"
              value={orderId}
              onChange={(e) => onOrderIdChange(e.target.value)}
              onKeyDown={onOrderIdKeyDown}
              required
              autoComplete="off"
              autoFocus
              placeholder="Scan or type order ID"
            />
          </label>
          <label className="field field-pallets">
            <span className="icon-label">
              <IconPallet />
              Pallets (opt)
            </span>
            <input
              type="number"
              min={1}
              value={pallets}
              onChange={(e) => setPallets(e.target.value)}
            />
          </label>
          <label className="field field-bay">
            <span className="icon-label">
              <IconBay />
              Bay (opt)
            </span>
            <input
              value={bay}
              onChange={(e) => setBay(e.target.value)}
              placeholder="e.g. Bay 2"
            />
          </label>
          <JiraTicketField value={jiraTicket} onChange={setJiraTicket} id="mark-ready-jira" />
          <CollectionDateField value={collectionDate} onChange={setCollectionDate} />
          {role === 'admin' && (
            <label className="field">
              <span className="icon-label">
                <IconDept />
                Department
              </span>
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
        </div>

        <div className="stage-form-foot">
          <p className="enter-hint">
            <kbd>Enter</kbd> Press ENTER anywhere in form to submit
          </p>
          <button type="submit" className="btn primary mark-ready-btn" disabled={busy}>
            <IconCheck />
            {busy ? 'Saving…' : 'Mark ready'}
          </button>
        </div>
      </form>
      {error && <p className="form-error">{error}</p>}

      <div className="ready-mobile-cards" aria-label="Active orders">
        {visible.length === 0 && <p className="empty">No active orders.</p>}
        {visible.map((order) => {
          const dwellFrom = order.status === 'arrived' ? order.arrivedAt : order.readyAt;
          const stale =
            (order.status === 'arrived' && isStaleWait(dwellFrom, now)) ||
            (order.status === 'ready' && isCollectionOverdue(order.collectionDate, now));
          const editing = editingId === order.id;
          return (
            <article
              key={order.id}
              className={['dock-card', order.status === 'arrived' ? 'arrived' : '', stale ? 'stale' : '']
                .filter(Boolean)
                .join(' ')}
            >
              <div className="dock-card-main">
                <span className="mono order-id">{order.id}</span>
                <span className={`status-pill ${order.status}`}>{statusLabel(order.status)}</span>
                <JiraTicketText value={order.jiraTicket} fallback={false} />
                <span>
                  {order.pallets} plt{order.bay ? ` · Bay ${order.bay}` : ''}
                  {role === 'admin' ? ` · ${order.department}` : ''}
                </span>
                <span className="muted">
                  <CollectCell order={order} now={now} />
                  {' · '}
                  {order.readyBy} · {formatTime(order.readyAt)}
                </span>
              </div>
              {editing ? (
                <ReadyOrderEditForm
                  order={order}
                  busy={editBusy}
                  error={editError}
                  jiraFieldId={`ready-edit-jira-mobile-${order.id}`}
                  onSave={(patch) => saveEdit(order, patch)}
                  onCancel={() => {
                    setEditingId(null);
                    setEditError(null);
                  }}
                />
              ) : (
                renderActions(order)
              )}
            </article>
          );
        })}
      </div>

      <div className="ready-desktop-tables">
        <CollectionDateTables
          orders={visible}
          now={now}
          emptyText="No active orders."
          headers={
            <>
              <th>Order</th>
              <th>Jira</th>
              <th>Status</th>
              <th>Pallets</th>
              <th>Bay</th>
              <th>Collect</th>
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
                  <td className="mono order-id-cell">{order.id}</td>
                  <td>
                    <JiraTicketText value={order.jiraTicket} />
                  </td>
                  <td>
                    <span className={`status-pill ${order.status}`}>{statusLabel(order.status)}</span>
                    {order.door ? <span className="muted"> · Door {order.door}</span> : null}
                  </td>
                  <td>{order.pallets}</td>
                  <td>
                    <BayCell bay={order.bay} />
                  </td>
                  <td>
                    <CollectCell order={order} now={now} />
                  </td>
                  {role === 'admin' && <td>{order.department}</td>}
                  <td className="ready-meta">
                    <span className="ready-by">{order.readyBy}</span>
                    <span className="mono ready-dwell">
                      {formatTime(order.readyAt)}
                      {order.status === 'arrived'
                        ? ` · waiting ${formatDwell(order.arrivedAt, now)}`
                        : ` · ready ${formatDwell(order.readyAt, now)}`}
                    </span>
                  </td>
                  <td className="table-actions">{renderActions(order)}</td>
                </tr>
                {editing && (
                  <tr className="editing">
                    <td colSpan={colSpan}>
                      <ReadyOrderEditForm
                        order={order}
                        busy={editBusy}
                        error={editError}
                        jiraFieldId={`ready-edit-jira-desktop-${order.id}`}
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
      </div>
    </section>
  );
}
