import { Fragment, useEffect, useMemo, useState } from 'react';
import type { Department, Order } from '../types';
import {
  collectionDateKind,
  collectionDateLabel,
  formatDwell,
  formatTime,
  isCollectionOverdue,
  startOfLocalDay,
  statusLabel,
} from '../lib/format';
import { canEditReady, STALE_WAIT_MS } from '../lib/orderState';
import { useNow } from '../hooks/useNow';
import { JiraTicketText } from './JiraTicketText';
import { useConfirm } from './ConfirmDialog';
import { ReadyOrderEditForm, type ReadyOrderPatch } from './PalletReadyPanel';
import {
  IconAlert,
  IconBarcode,
  IconCancel,
  IconClipboard,
  IconDept,
  IconEdit,
  IconHistory,
  IconPallet,
  IconTruck,
} from './Icons';

type AdminSection = 'board' | 'corrections' | 'settings';

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
  const [section, setSection] = useState<AdminSection>('board');
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
  const overdueReady = useMemo(
    () =>
      readyNow
        .filter((o) => isCollectionOverdue(o.collectionDate, now))
        .sort((a, b) => (a.collectionDate ?? '').localeCompare(b.collectionDate ?? '') || a.readyAt - b.readyAt),
    [readyNow, now],
  );
  const overduePlt = overdueReady.reduce(
    (sum, o) => sum + (Number.isFinite(o.pallets) ? o.pallets : 0),
    0,
  );
  const staleWaiting = waiting.filter(
    (o) => (o.arrivedAt ?? 0) > 0 && now - (o.arrivedAt ?? 0) >= STALE_WAIT_MS,
  );
  const attentionWaiting = waiting.filter(
    (o) =>
      !o.ackBy ||
      ((o.arrivedAt ?? 0) > 0 && now - (o.arrivedAt ?? 0) >= STALE_WAIT_MS),
  );
  const attentionCount = overdueReady.length + attentionWaiting.length;

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
    return {
      avgOpenMin: averageMinutes(openWaits.map((ms) => ms / 60_000)),
      avgCompletedMin: averageMinutes(completedWaits.map((ms) => ms / 60_000)),
      longestOpen: oldestWaiting,
    };
  }, [waiting, collectedToday, now, oldestWaiting]);

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

  const recentForCorrection = useMemo(() => {
    return [...orders]
      .filter((o) => o.status === 'ready' || o.status === 'arrived' || o.status === 'collected')
      .sort((a, b) => {
        const aTs = a.collectedAt ?? a.arrivedAt ?? a.readyAt;
        const bTs = b.collectedAt ?? b.arrivedAt ?? b.readyAt;
        return bTs - aTs;
      })
      .slice(0, 8);
  }, [orders]);

  function clearFeedback() {
    setMsg(null);
    setErr(null);
  }

  function openCorrection(id: string) {
    setOrderId(id);
    setSection('corrections');
    clearFeedback();
  }

  async function reopen() {
    clearFeedback();
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
    clearFeedback();
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
    clearFeedback();
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
    clearFeedback();
    const ok = await onChangePin(currentPin, nextPin);
    if (ok) {
      setMsg('Admin PIN updated.');
      setCurrentPin('');
      setNextPin('');
    } else {
      setErr('Could not update PIN. Check the current PIN and try again.');
    }
  }

  async function saveDepartments() {
    clearFeedback();
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
    setMsg(`Updated ${order.id}`);
    return true;
  }

  return (
    <section className="panel admin-panel">
      <div className="panel-head panel-head-split">
        <div>
          <div className="panel-title">
            <IconClipboard />
            <h2>Admin</h2>
          </div>
          <p>Shift board, PIN-gated corrections, and warehouse settings.</p>
        </div>
        <div
          className={
            attentionCount > 0 ? 'awaiting-summary admin-attention warn' : 'awaiting-summary'
          }
          aria-live="polite"
        >
          <span className="awaiting-label">Needs attention</span>
          <strong>
            {attentionCount} item{attentionCount === 1 ? '' : 's'}
          </strong>
          <span className="awaiting-plt">
            {overdueReady.length} overdue · {staleWaiting.length} stale · {unacked.length} unacked
          </span>
        </div>
      </div>

      <div className="admin-subnav" role="tablist" aria-label="Admin sections">
        <button
          type="button"
          role="tab"
          aria-selected={section === 'board'}
          className={section === 'board' ? 'admin-subnav-btn active' : 'admin-subnav-btn'}
          onClick={() => setSection('board')}
        >
          <IconAlert />
          Board
          {attentionCount > 0 ? <span className="tab-badge">{attentionCount}</span> : null}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={section === 'corrections'}
          className={section === 'corrections' ? 'admin-subnav-btn active' : 'admin-subnav-btn'}
          onClick={() => setSection('corrections')}
        >
          <IconBarcode />
          Corrections
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={section === 'settings'}
          className={section === 'settings' ? 'admin-subnav-btn active' : 'admin-subnav-btn'}
          onClick={() => setSection('settings')}
        >
          <IconDept />
          Settings
        </button>
      </div>

      {section === 'board' && (
        <div className="admin-section" role="tabpanel">
          <div className="admin-kpi-strip" aria-label="Shift metrics">
            <div className="admin-kpi">
              <span className="admin-kpi-label">
                <IconHistory /> Today
              </span>
              <strong>{collectedToday.length}</strong>
              <span className="muted">collected · {cancelledToday} cancelled</span>
            </div>
            <div className="admin-kpi">
              <span className="admin-kpi-label">
                <IconPallet /> Ready
              </span>
              <strong>{readyNow.length}</strong>
              <span className="muted">{overdueReady.length} overdue</span>
            </div>
            <div className="admin-kpi">
              <span className="admin-kpi-label">
                <IconTruck /> Waiting
              </span>
              <strong>{waiting.length}</strong>
              <span className="muted">
                {unacked.length} unacked · {openLookupCount} lookups
              </span>
            </div>
            <div className="admin-kpi">
              <span className="admin-kpi-label">
                <IconAlert /> Wait time
              </span>
              <strong>
                {waitReport.avgOpenMin == null ? '—' : `${waitReport.avgOpenMin}m`}
              </strong>
              <span className="muted">
                avg open
                {waitReport.avgCompletedMin != null
                  ? ` · ${waitReport.avgCompletedMin}m done today`
                  : ''}
              </span>
            </div>
          </div>

          <div className="admin-dept-strip" aria-label="Departments">
            {overview.map((row) => (
              <div key={row.dept} className="admin-dept-chip">
                <span className="admin-dept-name">
                  <IconDept />
                  {row.dept}
                </span>
                <span>
                  <strong>{row.ready}</strong> ready
                </span>
                <span>
                  <strong>{row.waiting}</strong> waiting
                </span>
                <span>
                  <strong>{row.collectedToday}</strong> today
                </span>
              </div>
            ))}
          </div>

          {waiting.length > 0 ? (
            <div className="list-block collection-date-block today admin-attention-block">
              <div className="collection-date-head kind-today">
                <div className="collection-date-title">
                  <h3>
                    <IconTruck />
                    Drivers waiting
                  </h3>
                  {staleWaiting.length > 0 ? (
                    <span className="group-badge warn">Stale waits</span>
                  ) : (
                    <span className="group-badge ok">Live</span>
                  )}
                </div>
                <p className="muted">
                  {waiting.length} driver{waiting.length === 1 ? '' : 's'} · oldest first
                  {waitReport.longestOpen
                    ? ` · longest ${formatDwell(waitReport.longestOpen.arrivedAt, now)}`
                    : ''}
                </p>
              </div>
              <ul className="order-list admin-wait-list">
                {waiting.map((order) => {
                  const stale = now - (order.arrivedAt ?? 0) >= STALE_WAIT_MS;
                  return (
                    <li key={order.id} className={stale ? 'arrived stale' : 'arrived'}>
                      <div className="order-main">
                        <span className="mono order-id">{order.id}</span>
                        <span className={`status-pill ${order.status}`}>
                          {statusLabel(order.status)}
                        </span>
                        <span>
                          {order.department}
                          {order.ackBy ? ` · Ack ${order.ackBy}` : ' · Not acknowledged'}
                        </span>
                        <span className="muted">
                          waiting {formatDwell(order.arrivedAt, now)} · {formatTime(order.arrivedAt)}
                        </span>
                      </div>
                      <div className="order-actions">
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() => openCorrection(order.id)}
                        >
                          <IconBarcode />
                          Correct
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <p className="empty admin-empty-ok">No drivers waiting.</p>
          )}

          {overdueReady.length > 0 ? (
            <div className="list-block collection-date-block overdue admin-attention-block">
              <div className="collection-date-head kind-overdue">
                <div className="collection-date-title">
                  <h3>
                    <IconPallet />
                    Overdue ready
                  </h3>
                  <span className="group-badge warn">Needs attention</span>
                </div>
                <p className="muted">
                  {overdueReady.length} order{overdueReady.length === 1 ? '' : 's'} · {overduePlt}{' '}
                  plt
                </p>
              </div>

              <div className="ready-mobile-cards admin-overdue-cards" aria-label="Overdue ready orders">
                {overdueReady.map((order) => {
                  const editing = editingId === order.id;
                  return (
                    <article
                      key={order.id}
                      className={['dock-card', 'stale', editing ? 'editing' : '']
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <div className="dock-card-main">
                        <span className="mono order-id">{order.id}</span>
                        <span className={`status-pill ${order.status}`}>
                          {statusLabel(order.status)}
                        </span>
                        <JiraTicketText value={order.jiraTicket} fallback={false} />
                        <span>
                          {order.pallets} plt{order.bay ? ` · Bay ${order.bay}` : ''} ·{' '}
                          {order.department}
                        </span>
                        <span className="muted">
                          <CollectCell order={order} now={now} />
                          {' · '}
                          {order.readyBy} · ready {formatDwell(order.readyAt, now)}
                        </span>
                      </div>
                      {editing ? (
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
                      ) : (
                        <div className="order-actions">
                          {canEditReady(order) && (
                            <button
                              type="button"
                              className="btn ghost"
                              onClick={() => {
                                setEditingId(order.id);
                                setEditError(null);
                              }}
                            >
                              <IconEdit />
                              Edit
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn ghost"
                            onClick={() => openCorrection(order.id)}
                          >
                            <IconBarcode />
                            Correct
                          </button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>

              <div className="table-wrap admin-overdue-table">
                <table className="data-table collection-date-table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Jira</th>
                      <th>Status</th>
                      <th>Pallets</th>
                      <th>Bay</th>
                      <th>Collect</th>
                      <th>Dept</th>
                      <th>Ready</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overdueReady.map((order) => {
                      const editing = editingId === order.id;
                      return (
                        <Fragment key={order.id}>
                          <tr className={['stale', editing ? 'editing' : ''].filter(Boolean).join(' ')}>
                            <td className="mono">{order.id}</td>
                            <td>
                              <JiraTicketText value={order.jiraTicket} />
                            </td>
                            <td>
                              <span className={`status-pill ${order.status}`}>
                                {statusLabel(order.status)}
                              </span>
                            </td>
                            <td>{order.pallets}</td>
                            <td>
                              <BayCell bay={order.bay} />
                            </td>
                            <td>
                              <CollectCell order={order} now={now} />
                            </td>
                            <td>{order.department}</td>
                            <td>
                              {order.readyBy}
                              <br />
                              <span className="muted">
                                {formatTime(order.readyAt)} · ready {formatDwell(order.readyAt, now)}
                              </span>
                            </td>
                            <td className="table-actions">
                              {editing ? (
                                <span className="editing-indicator" aria-live="polite">
                                  Editing…
                                </span>
                              ) : (
                                <div className="order-actions table-actions">
                                  {canEditReady(order) && (
                                    <button
                                      type="button"
                                      className="btn ghost"
                                      onClick={() => {
                                        setEditingId(order.id);
                                        setEditError(null);
                                      }}
                                    >
                                      <IconEdit />
                                      Edit
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className="btn ghost"
                                    onClick={() => openCorrection(order.id)}
                                  >
                                    <IconBarcode />
                                    Correct
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                          {editing && (
                            <tr className="edit-row">
                              <td colSpan={9}>
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
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="empty admin-empty-ok">No overdue ready orders.</p>
          )}
        </div>
      )}

      {section === 'corrections' && (
        <div className="admin-section" role="tabpanel">
          <form
            className="stage-form admin-tool-form"
            onSubmit={(e) => {
              e.preventDefault();
            }}
          >
            <div className="stage-form-head">
              <h3 className="stage-form-title">Order correction</h3>
              <span className="stage-form-status">PIN required</span>
            </div>
            <div className="stage-form-fields admin-correction-fields">
              <label className="field field-order">
                <span className="icon-label">
                  <IconBarcode />
                  Order ID
                </span>
                <input
                  className="mono"
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value.toUpperCase())}
                  placeholder="Scan or type order ID"
                  autoComplete="off"
                />
              </label>
              <label className="field field-span-2">
                <span>Exception reason</span>
                <input
                  value={exceptionReason}
                  onChange={(e) => setExceptionReason(e.target.value)}
                  placeholder="Required for exception handover"
                />
              </label>
              <label className="field">
                <span>Admin PIN</span>
                <input
                  type="password"
                  value={adminPin}
                  onChange={(e) => setAdminPin(e.target.value)}
                  autoComplete="off"
                  placeholder="Required for all corrections"
                />
              </label>
            </div>
            <div className="stage-form-foot admin-correction-actions">
              <button
                type="button"
                className="btn primary"
                disabled={busy}
                onClick={() => void reopen()}
              >
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
              <button
                type="button"
                className="btn ghost danger"
                disabled={busy}
                onClick={() => void remove()}
              >
                <IconCancel />
                Delete order
              </button>
            </div>
          </form>

          {recentForCorrection.length > 0 && (
            <div className="admin-recent">
              <h3 className="admin-recent-title">Recent orders — tap to fill</h3>
              <div className="admin-recent-chips">
                {recentForCorrection.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className={
                      orderId.trim().toUpperCase() === o.id
                        ? 'admin-recent-chip active'
                        : 'admin-recent-chip'
                    }
                    onClick={() => {
                      setOrderId(o.id);
                      clearFeedback();
                    }}
                  >
                    <span className="mono">{o.id}</span>
                    <span className={`status-pill ${o.status}`}>{statusLabel(o.status)}</span>
                    <span className="muted">{o.department}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {section === 'settings' && (
        <div className="admin-section admin-settings" role="tabpanel">
          <form
            className="stage-form admin-tool-form"
            onSubmit={(e) => {
              e.preventDefault();
              void saveDepartments();
            }}
          >
            <div className="stage-form-head">
              <h3 className="stage-form-title">
                <IconDept /> Departments
              </h3>
            </div>
            <p className="admin-tool-lede muted">
              Comma-separated list. Changing names may force department PCs to reassign.
            </p>
            <div className="stage-form-fields">
              <label className="field field-span-full">
                <span>Department names</span>
                <input
                  value={deptDraft}
                  onChange={(e) => setDeptDraft(e.target.value)}
                  placeholder="B2B, Therabody"
                />
              </label>
              <label className="field">
                <span>Admin PIN</span>
                <input
                  type="password"
                  value={adminPin}
                  onChange={(e) => setAdminPin(e.target.value)}
                  autoComplete="off"
                  placeholder="Required to save"
                />
              </label>
            </div>
            <div className="stage-form-foot">
              <button type="submit" className="btn solid" disabled={busy}>
                Save departments
              </button>
            </div>
          </form>

          <form
            className="stage-form admin-tool-form"
            onSubmit={(e) => {
              e.preventDefault();
              void changePin();
            }}
          >
            <div className="stage-form-head">
              <h3 className="stage-form-title">Change admin PIN</h3>
            </div>
            <div className="stage-form-fields">
              <label className="field">
                <span>Current PIN</span>
                <input
                  type="password"
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value)}
                  autoComplete="off"
                />
              </label>
              <label className="field">
                <span>New PIN</span>
                <input
                  type="password"
                  value={nextPin}
                  onChange={(e) => setNextPin(e.target.value)}
                  autoComplete="off"
                />
              </label>
            </div>
            <div className="stage-form-foot">
              <button type="submit" className="btn solid" disabled={busy}>
                Update PIN
              </button>
            </div>
          </form>
        </div>
      )}

      {msg && (
        <p className="form-ok" role="status">
          {msg}
        </p>
      )}
      {err && (
        <p className="form-error" role="alert">
          {err}
        </p>
      )}
    </section>
  );
}
