import type { Lookup, Order } from '../types';
import { formatTime } from '../lib/format';

interface Props {
  waitingForUs: Order[];
  openLookups: Lookup[];
  dismissedLookupIds: Set<string>;
  canRespondLookup: boolean;
  canAck: boolean;
  canConfirmHandover: boolean;
  onAcknowledge: (order: Order) => void;
  onConfirmHandover: (order: Order) => void;
  onLookupOurs: (lookup: Lookup) => void;
  onLookupNotOurs: (lookup: Lookup) => void;
}

export function AlertBanners({
  waitingForUs,
  openLookups,
  dismissedLookupIds,
  canRespondLookup,
  canAck,
  canConfirmHandover,
  onAcknowledge,
  onConfirmHandover,
  onLookupOurs,
  onLookupNotOurs,
}: Props) {
  const visibleLookups = openLookups.filter((l) => !dismissedLookupIds.has(l.id));

  if (waitingForUs.length === 0 && visibleLookups.length === 0) return null;

  return (
    <div className="banner-stack" role="alert">
      {waitingForUs.map((order) => (
        <div key={order.id} className="pulse-banner driver">
          <div>
            <strong>Driver waiting</strong>
            <p>
              Order <span className="mono">{order.id}</span> · {order.pallets} pallet
              {order.pallets === 1 ? '' : 's'}
              {order.bay ? ` · Bay ${order.bay}` : ''} · marked by {order.readyBy} · dock{' '}
              {order.arrivedBy} at {formatTime(order.arrivedAt)}
              {!order.ackBy ? ' · not acknowledged' : ` · ack ${order.ackBy}`}
            </p>
          </div>
          <div className="banner-actions">
            {canAck && !order.ackBy && (
              <button type="button" className="btn primary" onClick={() => onAcknowledge(order)}>
                Acknowledge
              </button>
            )}
            {canConfirmHandover && (
              <button type="button" className="btn solid" onClick={() => onConfirmHandover(order)}>
                Confirm handover
              </button>
            )}
          </div>
        </div>
      ))}

      {canRespondLookup &&
        visibleLookups.map((lookup) => (
          <div key={lookup.id} className="pulse-banner lookup">
            <div>
              <strong>Dock lookup</strong>
              <p>
                Is order <span className="mono">{lookup.orderId}</span> yours? Sent by{' '}
                {lookup.sentBy} at {formatTime(lookup.at)}
              </p>
            </div>
            <div className="banner-actions">
              <button type="button" className="btn primary" onClick={() => onLookupOurs(lookup)}>
                It is ours
              </button>
              <button type="button" className="btn ghost" onClick={() => onLookupNotOurs(lookup)}>
                Not ours
              </button>
            </div>
          </div>
        ))}
    </div>
  );
}
