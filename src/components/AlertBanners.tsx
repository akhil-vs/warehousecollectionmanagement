import { useState } from 'react';
import type { Department, Lookup, Order } from '../types';
import { formatDwell, formatTime } from '../lib/format';
import { canAcknowledge, canConfirmHandover, lookupNeedsDepartment } from '../lib/orderState';
import { useNow } from '../hooks/useNow';
import { IconAlert, IconCheck, IconSearch, IconTruck } from './Icons';

interface Props {
  waitingForUs: Order[];
  openLookups: Lookup[];
  department?: Department;
  canRespondLookup: boolean;
  canAck: boolean;
  canConfirmHandoverAction: boolean;
  canExceptionHandover: boolean;
  onAcknowledge: (order: Order) => void;
  onConfirmHandover: (order: Order) => void;
  onExceptionHandover: (order: Order, reason: string) => void;
  onLookupOurs: (lookup: Lookup) => void;
  onLookupNotOurs: (lookup: Lookup) => void;
}

export function AlertBanners({
  waitingForUs,
  openLookups,
  department,
  canRespondLookup,
  canAck,
  canConfirmHandoverAction,
  canExceptionHandover,
  onAcknowledge,
  onConfirmHandover,
  onExceptionHandover,
  onLookupOurs,
  onLookupNotOurs,
}: Props) {
  const now = useNow();
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const visibleLookups = canRespondLookup
    ? openLookups.filter((l) => (department ? lookupNeedsDepartment(l, department) : true))
    : [];

  if (waitingForUs.length === 0 && visibleLookups.length === 0) return null;

  return (
    <div className="banner-stack" role="alert">
      {waitingForUs.map((order) => (
        <div key={order.id} className="pulse-banner driver">
          <div>
            <strong className="icon-inline">
              <IconTruck />
              Driver waiting
            </strong>
            <p>
              Order <span className="mono">{order.id}</span> · {order.pallets} pallet
              {order.pallets === 1 ? '' : 's'}
              {order.bay ? ` · Bay ${order.bay}` : ''}
              {order.door ? ` · Door ${order.door}` : ''}
              {order.haulier ? ` · ${order.haulier}` : ''} · marked by {order.readyBy} · dock{' '}
              {order.arrivedBy} at {formatTime(order.arrivedAt)} · waiting{' '}
              {formatDwell(order.arrivedAt, now)}
              {!order.ackBy ? ' · not acknowledged' : ` · ack ${order.ackBy}`}
            </p>
          </div>
          <div className="banner-actions">
            {canAck && canAcknowledge(order) && (
              <button type="button" className="btn primary" onClick={() => onAcknowledge(order)}>
                <IconCheck />
                Acknowledge
              </button>
            )}
            {canConfirmHandoverAction && canConfirmHandover(order) && (
              <button type="button" className="btn solid" onClick={() => onConfirmHandover(order)}>
                <IconCheck />
                Confirm handover
              </button>
            )}
            {canExceptionHandover && (
              <form
                className="exception-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  onExceptionHandover(order, reasons[order.id] || '');
                }}
              >
                <input
                  value={reasons[order.id] || ''}
                  onChange={(e) =>
                    setReasons((prev) => ({ ...prev, [order.id]: e.target.value }))
                  }
                  placeholder="Exception reason"
                  aria-label={`Exception reason for ${order.id}`}
                />
                <button type="submit" className="btn ghost">
                  Exception handover
                </button>
              </form>
            )}
          </div>
        </div>
      ))}

      {canRespondLookup &&
        visibleLookups.map((lookup) => (
          <div key={lookup.id} className="pulse-banner lookup">
            <div>
              <strong className="icon-inline">
                <IconSearch />
                Dock lookup
              </strong>
              <p>
                Is order <span className="mono">{lookup.orderId}</span> yours? Sent by{' '}
                {lookup.sentBy} at {formatTime(lookup.at)} · open {formatDwell(lookup.at, now)}
              </p>
            </div>
            <div className="banner-actions">
              <button type="button" className="btn primary" onClick={() => onLookupOurs(lookup)}>
                <IconCheck />
                It is ours
              </button>
              <button type="button" className="btn ghost" onClick={() => onLookupNotOurs(lookup)}>
                <IconAlert />
                Not ours
              </button>
            </div>
          </div>
        ))}
    </div>
  );
}
