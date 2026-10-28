import { useMemo, useState } from 'react';
import type { Lookup, Order } from '../types';
import { formatTime, statusLabel } from '../lib/format';

interface Props {
  readyOrders: Order[];
  arrivedOrders: Order[];
  allOrders: Order[];
  openLookups: Lookup[];
  operator: string;
  onDriverCollection: (order: Order) => void;
  onSendLookup: (orderId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  onResendLookup: (lookup: Lookup) => void;
  onCloseLookup: (lookup: Lookup) => void;
}

export function DockPanel({
  readyOrders,
  arrivedOrders,
  allOrders,
  openLookups,
  operator,
  onDriverCollection,
  onSendLookup,
  onResendLookup,
  onCloseLookup,
}: Props) {
  const [q, setQ] = useState('');
  const [lookupMsg, setLookupMsg] = useState<string | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return readyOrders;
    return readyOrders.filter(
      (o) =>
        o.id.toLowerCase().includes(term) ||
        o.department.toLowerCase().includes(term) ||
        (o.bay || '').toLowerCase().includes(term) ||
        o.readyBy.toLowerCase().includes(term),
    );
  }, [readyOrders, q]);

  const exactId = q.trim().toUpperCase();
  const exactExisting = exactId
    ? allOrders.find((o) => o.id === exactId)
    : undefined;
  const noReadyMatch = Boolean(exactId) && filtered.length === 0;

  async function sendToDepartments() {
    setLookupBusy(true);
    setLookupMsg(null);
    const result = await onSendLookup(exactId);
    setLookupBusy(false);
    if (!result.ok) setLookupMsg(result.error);
    else setLookupMsg(`Sent ${exactId} to all departments.`);
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Driver collection</h2>
        <p>Find a ready order, alert the department, then wait for handover.</p>
      </div>

      <label className="field search-field">
        <span>Search ready list</span>
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setLookupMsg(null);
          }}
          placeholder="Order ID, department, bay, or who marked ready"
        />
      </label>

      {noReadyMatch && (
        <div className="notice-block">
          {exactExisting?.status === 'collected' && (
            <p>
              Order <span className="mono">{exactId}</span> was already collected by{' '}
              {exactExisting.collectedBy} at {formatTime(exactExisting.collectedAt)}.
            </p>
          )}
          {exactExisting?.status === 'arrived' && (
            <p>
              Driver already waiting on <span className="mono">{exactId}</span>
              {exactExisting.arrivedBy
                ? ` (pressed by ${exactExisting.arrivedBy} at ${formatTime(exactExisting.arrivedAt)})`
                : ''}
              .
            </p>
          )}
          {!exactExisting && (
            <>
              <p>No ready order matches “{exactId}”.</p>
              <button
                type="button"
                className="btn primary"
                disabled={lookupBusy || !operator.trim()}
                onClick={() => void sendToDepartments()}
              >
                Send to all departments to verify
              </button>
            </>
          )}
          {lookupMsg && <p className="muted">{lookupMsg}</p>}
        </div>
      )}

      <div className="list-block">
        <h3>Ready for collection</h3>
        {filtered.length === 0 && !noReadyMatch && <p className="empty">No ready pallets.</p>}
        <ul className="order-list">
          {filtered.map((order) => (
            <li key={order.id}>
              <div className="order-main">
                <span className="mono order-id">{order.id}</span>
                <span className="status-pill ready">{statusLabel(order.status)}</span>
                <span>
                  {order.pallets} plt{order.bay ? ` · Bay ${order.bay}` : ''} · {order.department}
                </span>
                <span className="muted">
                  Ready by {order.readyBy} · {formatTime(order.readyAt)}
                </span>
              </div>
              <div className="order-actions">
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => onDriverCollection(order)}
                >
                  Driver collection
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="list-block">
        <h3>Verified — awaiting handover</h3>
        {arrivedOrders.length === 0 && <p className="empty">None waiting.</p>}
        <ul className="order-list readonly">
          {arrivedOrders.map((order) => (
            <li key={order.id} className="arrived">
              <div className="order-main">
                <span className="mono order-id">{order.id}</span>
                <span className="status-pill arrived">Driver waiting</span>
                <span>
                  {order.department}
                  {order.ackBy ? ` · Ack ${order.ackBy}` : ' · Not acknowledged'}
                </span>
                <span className="muted">
                  Dock {order.arrivedBy} · {formatTime(order.arrivedAt)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {openLookups.length > 0 && (
        <div className="list-block">
          <h3>Open department lookups</h3>
          <ul className="order-list">
            {openLookups.map((lookup) => (
              <li key={lookup.id}>
                <div className="order-main">
                  <span className="mono order-id">{lookup.orderId}</span>
                  <span className="muted">
                    Sent by {lookup.sentBy} · {formatTime(lookup.at)}
                  </span>
                </div>
                <div className="order-actions">
                  <button type="button" className="btn ghost" onClick={() => onResendLookup(lookup)}>
                    Resend
                  </button>
                  <button type="button" className="btn ghost" onClick={() => onCloseLookup(lookup)}>
                    Close
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
