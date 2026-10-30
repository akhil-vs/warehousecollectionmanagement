import { useMemo, type ReactNode } from 'react';
import type { Order } from '../types';
import { groupOrdersByCollectionDate } from '../lib/format';

interface Props {
  orders: Order[];
  now: number;
  emptyText?: string;
  headers: ReactNode;
  renderRow: (order: Order) => ReactNode;
}

export function CollectionDateTables({
  orders,
  now,
  emptyText = 'No orders.',
  headers,
  renderRow,
}: Props) {
  const groups = useMemo(() => groupOrdersByCollectionDate(orders, now), [orders, now]);

  if (orders.length === 0) {
    return emptyText ? <p className="empty">{emptyText}</p> : null;
  }

  return (
    <>
      {groups.map((group) => (
        <div
          key={group.key}
          className={`list-block collection-date-block ${group.kind}`}
        >
          <div className="collection-date-head">
            <h3>{group.heading}</h3>
            <p className="muted">
              {group.orders.length} order{group.orders.length === 1 ? '' : 's'} · {group.pallets}{' '}
              plt
            </p>
          </div>
          <div className="table-wrap">
            <table className="data-table collection-date-table">
              <thead>
                <tr>{headers}</tr>
              </thead>
              <tbody>{group.orders.map((order) => renderRow(order))}</tbody>
            </table>
          </div>
        </div>
      ))}
    </>
  );
}
