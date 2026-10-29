import { useMemo, useState } from 'react';
import type { AppEvent, DeviceRole, Order, OrderStatus } from '../types';
import { eventLabel, formatTime, statusLabel } from '../lib/format';
import { isDepartmentRole } from '../hooks/useDeviceRole';
import { useNow } from '../hooks/useNow';
import { CollectionDateTables } from './CollectionDateTables';

interface Props {
  role: DeviceRole;
  orders: Order[];
  events: AppEvent[];
}

interface OrderActivityGroup {
  orderId: string;
  events: AppEvent[];
  latestAt: number;
}

export function HistoryPanel({ role, orders, events }: Props) {
  const now = useNow();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | OrderStatus>('all');

  const scopedOrders = useMemo(() => {
    let list = [...orders].sort(
      (a, b) =>
        (b.collectedAt || b.cancelledAt || b.arrivedAt || b.readyAt) -
        (a.collectedAt || a.cancelledAt || a.arrivedAt || a.readyAt),
    );
    if (isDepartmentRole(role)) {
      list = list.filter((o) => o.department === role);
    }
    if (status !== 'all') list = list.filter((o) => o.status === status);
    const term = q.trim().toLowerCase();
    if (term) {
      list = list.filter(
        (o) =>
          o.id.toLowerCase().includes(term) ||
          o.department.toLowerCase().includes(term) ||
          o.readyBy.toLowerCase().includes(term) ||
          (o.collectionDate || '').includes(term) ||
          (o.collectedBy || '').toLowerCase().includes(term) ||
          (o.cancelledBy || '').toLowerCase().includes(term),
      );
    }
    return list;
  }, [orders, role, q, status]);

  const scopedEvents = useMemo(() => {
    if (isDepartmentRole(role)) {
      return events.filter((e) => e.department === role);
    }
    return events;
  }, [events, role]);

  const activityByOrder = useMemo(() => {
    const term = q.trim().toLowerCase();
    const scopedOrderIds = new Set(scopedOrders.map((o) => o.id));
    const byOrder = new Map<string, AppEvent[]>();

    for (const e of scopedEvents) {
      const list = byOrder.get(e.orderId) || [];
      list.push(e);
      byOrder.set(e.orderId, list);
    }

    const groups: OrderActivityGroup[] = [];
    for (const [orderId, list] of byOrder) {
      const inScopedOrders = scopedOrderIds.has(orderId);
      if (status !== 'all' && !inScopedOrders) continue;
      if (term) {
        const matches =
          inScopedOrders ||
          orderId.toLowerCase().includes(term) ||
          list.some((e) => e.operator.toLowerCase().includes(term));
        if (!matches) continue;
      }

      const sorted = [...list].sort((a, b) => b.at - a.at);
      groups.push({
        orderId,
        events: sorted,
        latestAt: sorted[0]?.at ?? 0,
      });
    }

    groups.sort((a, b) => b.latestAt - a.latestAt);
    return groups;
  }, [scopedEvents, scopedOrders, q, status]);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>History</h2>
        <p>Order history and activity for your scope.</p>
      </div>

      <div className="history-filters">
        <label className="field">
          <span>Search</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Order, dept, name" />
        </label>
        <label className="field">
          <span>Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as 'all' | OrderStatus)}>
            <option value="all">All</option>
            <option value="ready">Ready</option>
            <option value="arrived">Driver waiting</option>
            <option value="collected">Collected</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
      </div>

      <CollectionDateTables
        orders={scopedOrders}
        now={now}
        emptyText="No matching orders."
        headers={
          <>
            <th>Order</th>
            <th>Status</th>
            <th>Pallets</th>
            <th>Bay</th>
            <th>Dept</th>
            <th>Ready</th>
            <th>Driver / collected</th>
          </>
        }
        renderRow={(o) => (
          <tr key={o.id}>
            <td className="mono">{o.id}</td>
            <td>{statusLabel(o.status)}</td>
            <td>{o.pallets}</td>
            <td>{o.bay || <span className="muted">—</span>}</td>
            <td>{o.department}</td>
            <td>
              {o.readyBy}
              <br />
              <span className="muted">{formatTime(o.readyAt)}</span>
            </td>
            <td>
              {o.arrivedBy && (
                <>
                  Arrived {o.arrivedBy} · {formatTime(o.arrivedAt)}
                  {o.door ? ` · Door ${o.door}` : ''}
                  <br />
                </>
              )}
              {o.exceptionReason && (
                <>
                  Exception: {o.exceptionReason}
                  <br />
                </>
              )}
              {o.collectedBy ? (
                <>Collected {o.collectedBy} · {formatTime(o.collectedAt)}</>
              ) : o.cancelledBy ? (
                <>Cancelled {o.cancelledBy} · {formatTime(o.cancelledAt)}</>
              ) : (
                <span className="muted">—</span>
              )}
            </td>
          </tr>
        )}
      />

      <div className="list-block">
        <h3>Activity log</h3>
        {activityByOrder.length === 0 && <p className="empty">No activity yet.</p>}
        <div className="activity-accordion">
          {activityByOrder.map((group) => (
            <details key={group.orderId} className="activity-accordion-item">
              <summary>
                <span className="mono">{group.orderId}</span>
                <span className="muted">
                  {group.events.length} event{group.events.length === 1 ? '' : 's'}
                </span>
                <span className="muted activity-accordion-latest">{formatTime(group.latestAt)}</span>
              </summary>
              <ul className="event-list nested">
                {group.events.map((e) => (
                  <li key={e.id}>
                    <span className="event-type">{eventLabel(e.type)}</span>
                    <span>
                      {e.operator}
                      {e.department ? ` · ${e.department}` : ''}
                      {e.note ? ` · ${e.note}` : ''}
                    </span>
                    <span className="muted">{formatTime(e.at)}</span>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
