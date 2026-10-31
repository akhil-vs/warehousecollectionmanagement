import { useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Department, Lookup, Order } from '../types';
import { formatDwell, formatTime, isCollectionOverdue, isStaleWait } from '../lib/format';
import { allDepartmentsNotOurs, lookupDockStatusLabel } from '../lib/orderState';
import { useNow } from '../hooks/useNow';
import { CollectionDateTables } from './CollectionDateTables';
import {
  IconAlert,
  IconBarcode,
  IconCancel,
  IconDoor,
  IconSearch,
  IconTruck,
} from './Icons';

interface Props {
  readyOrders: Order[];
  arrivedOrders: Order[];
  allOrders: Order[];
  openLookups: Lookup[];
  departments: Department[];
  operator: string;
  onDriverCollection: (order: Order, extras: { door?: string; haulier?: string }) => void;
  onUndoCollection: (order: Order) => void;
  onSendLookup: (orderId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  onResendLookup: (lookup: Lookup) => void;
  onCloseLookup: (lookup: Lookup) => void;
}

export function DockPanel({
  readyOrders,
  arrivedOrders,
  allOrders,
  openLookups,
  departments,
  operator,
  onDriverCollection,
  onUndoCollection,
  onSendLookup,
  onResendLookup,
  onCloseLookup,
}: Props) {
  const now = useNow();
  const searchRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [door, setDoor] = useState('');
  const [haulier, setHaulier] = useState('');
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
        (o.collectionDate || '').includes(term) ||
        o.readyBy.toLowerCase().includes(term),
    );
  }, [readyOrders, q]);

  const exactId = q.trim().toUpperCase();
  const exactExisting = exactId ? allOrders.find((o) => o.id === exactId) : undefined;
  const exactReady = exactId ? readyOrders.find((o) => o.id === exactId) : undefined;
  const noReadyMatch = Boolean(exactId) && filtered.length === 0;

  async function sendToDepartments() {
    setLookupBusy(true);
    setLookupMsg(null);
    const result = await onSendLookup(exactId);
    setLookupBusy(false);
    if (!result.ok) setLookupMsg(result.error);
    else setLookupMsg(`Sent ${exactId} to all departments.`);
  }

  function collect(order: Order) {
    onDriverCollection(order, {
      door: door || undefined,
      haulier: haulier || undefined,
    });
  }

  async function onSearchSubmit(e: FormEvent) {
    e.preventDefault();
    if (exactReady) {
      collect(exactReady);
      return;
    }
    if (noReadyMatch && !exactExisting && operator.trim()) {
      await sendToDepartments();
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div className="panel-title">
          <IconTruck />
          <h2>Driver collection</h2>
        </div>
        <p>Find a ready order, alert the department, then wait for handover.</p>
      </div>

      <form className="dock-meta" onSubmit={(e) => void onSearchSubmit(e)}>
        <label className="field search-field">
          <span className="icon-label">
            <IconSearch />
            Search ready list
          </span>
          <input
            ref={searchRef}
            value={q}
            autoFocus
            onChange={(e) => {
              setQ(e.target.value);
              setLookupMsg(null);
            }}
            placeholder="Scan or type order ID, department, bay, or who marked ready"
          />
        </label>
        <label className="field">
          <span className="icon-label">
            <IconDoor />
            Door (optional)
          </span>
          <input value={door} onChange={(e) => setDoor(e.target.value)} placeholder="e.g. 3" />
        </label>
        <label className="field">
          <span className="icon-label">
            <IconTruck />
            Haulier (optional)
          </span>
          <input
            value={haulier}
            onChange={(e) => setHaulier(e.target.value)}
            placeholder="Driver / haulier"
          />
        </label>
        <button type="submit" className="btn ghost">
          <IconBarcode />
          Go
        </button>
      </form>

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
          {exactExisting?.status === 'cancelled' && (
            <p>
              Order <span className="mono">{exactId}</span> was cancelled
              {exactExisting.cancelledBy ? ` by ${exactExisting.cancelledBy}` : ''}.
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

      <div className="dock-ready-cards" aria-label="Ready orders">
        {filtered.length === 0 && !noReadyMatch && <p className="empty">No ready pallets.</p>}
        {filtered.map((order) => {
          const stale =
            isStaleWait(order.readyAt, now) || isCollectionOverdue(order.collectionDate, now);
          return (
            <article
              key={order.id}
              className={['dock-card', stale ? 'stale' : ''].filter(Boolean).join(' ')}
            >
              <div className="dock-card-main">
                <span className="mono order-id">{order.id}</span>
                <span>
                  {order.pallets} plt{order.bay ? ` · Bay ${order.bay}` : ''} · {order.department}
                </span>
                <span className="muted">
                  {order.readyBy} · {formatTime(order.readyAt)} · ready{' '}
                  {formatDwell(order.readyAt, now)}
                </span>
              </div>
              <button type="button" className="btn primary" onClick={() => collect(order)}>
                <IconTruck />
                Driver collection
              </button>
            </article>
          );
        })}
      </div>

      <div className="dock-ready-tables">
        <CollectionDateTables
          orders={filtered}
          now={now}
          emptyText={noReadyMatch ? undefined : 'No ready pallets.'}
          headers={
            <>
              <th>Order</th>
              <th>Pallets</th>
              <th>Bay</th>
              <th>Dept</th>
              <th>Ready</th>
              <th>Actions</th>
            </>
          }
          renderRow={(order) => {
            const stale =
              isStaleWait(order.readyAt, now) || isCollectionOverdue(order.collectionDate, now);
            return (
              <tr key={order.id} className={stale ? 'stale' : undefined}>
                <td className="mono">{order.id}</td>
                <td>{order.pallets}</td>
                <td>{order.bay || <span className="muted">—</span>}</td>
                <td>{order.department}</td>
                <td>
                  {order.readyBy}
                  <br />
                  <span className="muted">
                    {formatTime(order.readyAt)} · ready {formatDwell(order.readyAt, now)}
                  </span>
                </td>
                <td className="table-actions">
                  <button type="button" className="btn primary" onClick={() => collect(order)}>
                    <IconTruck />
                    Driver collection
                  </button>
                </td>
              </tr>
            );
          }}
        />
      </div>

      <div className="list-block">
        <h3 className="icon-inline">
          <IconAlert />
          Verified — awaiting handover
        </h3>
        {arrivedOrders.length === 0 && <p className="empty">None waiting.</p>}
        <ul className="order-list">
          {arrivedOrders.map((order) => (
            <li
              key={order.id}
              className={['arrived', isStaleWait(order.arrivedAt, now) ? 'stale' : '']
                .filter(Boolean)
                .join(' ')}
            >
              <div className="order-main">
                <span className="mono order-id">{order.id}</span>
                <span className="status-pill arrived">Driver waiting</span>
                <span>
                  {order.department}
                  {order.ackBy ? ` · Ack ${order.ackBy}` : ' · Not acknowledged'}
                  {order.door ? ` · Door ${order.door}` : ''}
                  {order.haulier ? ` · ${order.haulier}` : ''}
                </span>
                <span className="muted">
                  Dock {order.arrivedBy} · {formatTime(order.arrivedAt)} · waiting{' '}
                  {formatDwell(order.arrivedAt, now)}
                </span>
              </div>
              <div className="order-actions">
                <button type="button" className="btn ghost" onClick={() => onUndoCollection(order)}>
                  <IconCancel />
                  Undo collection
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {openLookups.length > 0 && (
        <div className="list-block">
          <h3 className="icon-inline">
            <IconAlert />
            Department lookups
          </h3>
          <ul className="order-list">
            {openLookups.map((lookup) => {
              const rejected = allDepartmentsNotOurs(lookup, departments);
              return (
                <li key={lookup.id} className={rejected ? 'stale' : undefined}>
                  <div className="order-main">
                    <span className="mono order-id">{lookup.orderId}</span>
                    {rejected && (
                      <span className="status-pill arrived">Not ours</span>
                    )}
                    <span className="muted">
                      Sent by {lookup.sentBy} · {formatTime(lookup.at)} ·{' '}
                      {lookup.status === 'open' ? 'open' : 'closed'}{' '}
                      {formatDwell(lookup.at, now)}
                    </span>
                    <span className={rejected ? undefined : 'muted'}>
                      {lookupDockStatusLabel(lookup, departments)}
                    </span>
                  </div>
                  <div className="order-actions">
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => onResendLookup(lookup)}
                    >
                      Resend
                    </button>
                    {lookup.status === 'open' && (
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => onCloseLookup(lookup)}
                      >
                        Close
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
