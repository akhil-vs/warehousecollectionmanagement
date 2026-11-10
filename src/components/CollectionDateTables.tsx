import { useMemo, type ReactNode } from 'react';
import type { Order } from '../types';
import { groupOrdersByCollectionDate } from '../lib/format';

interface Props {
  orders: Order[];
  now: number;
  emptyText?: string;
  headers: ReactNode;
  renderRow: (order: Order) => ReactNode;
  /** When set, cards show below the tablet breakpoint and tables stay on larger screens. */
  renderCard?: (order: Order) => ReactNode;
}

function groupBadge(kind: string): { label: string; className: string } | null {
  if (kind === 'overdue') return { label: 'Needs attention', className: 'group-badge warn' };
  if (kind === 'today') return { label: 'Active shift', className: 'group-badge ok' };
  if (kind === 'upcoming') return { label: 'Scheduled', className: 'group-badge info' };
  if (kind === 'none') return { label: 'No date', className: 'group-badge muted' };
  return null;
}

function GroupHeading({
  group,
}: {
  group: {
    key: string;
    kind: string;
    heading: string;
    orders: Order[];
    pallets: number;
  };
}) {
  const badge = groupBadge(group.kind);
  return (
    <div className={`collection-date-head kind-${group.kind}`}>
      <div className="collection-date-title">
        <h3>{group.heading}</h3>
        {badge ? <span className={badge.className}>{badge.label}</span> : null}
      </div>
      <p className="muted">
        {group.orders.length} order{group.orders.length === 1 ? '' : 's'} · {group.pallets} plt
      </p>
    </div>
  );
}

export function CollectionDateTables({
  orders,
  now,
  emptyText = 'No orders.',
  headers,
  renderRow,
  renderCard,
}: Props) {
  const groups = useMemo(() => groupOrdersByCollectionDate(orders, now), [orders, now]);

  if (orders.length === 0) {
    return emptyText ? <p className="empty">{emptyText}</p> : null;
  }

  const tables = (
    <>
      {groups.map((group) => (
        <div key={group.key} className={`list-block collection-date-block ${group.kind}`}>
          <GroupHeading group={group} />
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

  if (!renderCard) {
    return tables;
  }

  return (
    <>
      <div className="date-mobile-cards" aria-label="Orders">
        {groups.map((group) => (
          <div key={group.key} className={`list-block collection-date-block ${group.kind}`}>
            <GroupHeading group={group} />
            <div className="order-cards">
              {group.orders.map((order) => (
                <div key={order.id} className="order-card-slot">
                  {renderCard(order)}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="date-desktop-tables">{tables}</div>
    </>
  );
}
