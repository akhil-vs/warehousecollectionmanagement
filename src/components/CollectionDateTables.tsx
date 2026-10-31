import { useMemo, type ReactNode } from 'react';
import type { Order } from '../types';
import { groupOrdersByCollectionDate } from '../lib/format';
import { IconCalendar, IconPallet, IconTruck } from './Icons';

interface Props {
  orders: Order[];
  now: number;
  emptyText?: string;
  headers: ReactNode;
  renderRow: (order: Order) => ReactNode;
  /** When set, cards show below the tablet breakpoint and tables stay on larger screens. */
  renderCard?: (order: Order) => ReactNode;
}

function GroupIcon({ kind }: { kind: string }) {
  if (kind === 'undated') return <IconPallet />;
  if (kind === 'overdue' || kind === 'today') return <IconTruck />;
  return <IconCalendar />;
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
  return (
    <div className="collection-date-head">
      <h3>
        <GroupIcon kind={group.kind} />
        {group.heading}
      </h3>
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
