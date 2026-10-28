import { useMemo, useState } from 'react';
import type { AppEvent, DeviceRole, Order, OrderStatus } from '../types';
import { formatTime, statusLabel } from '../lib/format';
import { isDepartmentRole } from '../hooks/useDeviceRole';

interface Props {
  role: DeviceRole;
  orders: Order[];
  events: AppEvent[];
}

export function HistoryPanel({ role, orders, events }: Props) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | OrderStatus>('all');

  const scopedOrders = useMemo(() => {
    let list = [...orders].sort(
      (a, b) => (b.collectedAt || b.arrivedAt || b.readyAt) - (a.collectedAt || a.arrivedAt || a.readyAt),
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
          (o.collectedBy || '').toLowerCase().includes(term),
      );
    }
    return list;
  }, [orders, role, q, status]);

  const scopedEvents = useMemo(() => {
    if (isDepartmentRole(role)) {
      return events.filter((e) => e.department === role || !e.department);
    }
    return events;
  }, [events, role]);

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
          </select>
        </label>
      </div>

      <div className="list-block">
        <h3>Orders</h3>
        {scopedOrders.length === 0 && <p className="empty">No matching orders.</p>}
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Status</th>
                <th>Pallets</th>
                <th>Dept</th>
                <th>Ready</th>
                <th>Driver / collected</th>
              </tr>
            </thead>
            <tbody>
              {scopedOrders.map((o) => (
                <tr key={o.id}>
                  <td className="mono">{o.id}</td>
                  <td>{statusLabel(o.status)}</td>
                  <td>
                    {o.pallets}
                    {o.bay ? ` · ${o.bay}` : ''}
                  </td>
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
                        <br />
                      </>
                    )}
                    {o.collectedBy ? (
                      <>
                        Collected {o.collectedBy} · {formatTime(o.collectedAt)}
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="list-block">
        <h3>Activity log</h3>
        {scopedEvents.length === 0 && <p className="empty">No activity yet.</p>}
        <ul className="event-list">
          {scopedEvents.slice(0, 100).map((e) => (
            <li key={e.id}>
              <span className="mono">{e.orderId}</span>
              <span className="event-type">{e.type.replace(/_/g, ' ')}</span>
              <span>
                {e.operator}
                {e.department ? ` · ${e.department}` : ''}
              </span>
              <span className="muted">{formatTime(e.at)}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
