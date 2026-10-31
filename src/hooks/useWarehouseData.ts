import { useEffect, useMemo, useState } from 'react';
import type { AppEvent, Lookup, Order } from '../types';
import {
  subscribeEvents,
  subscribeLookups,
  subscribeOrders,
} from '../lib/ordersApi';

export function useWarehouseData() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [lookups, setLookups] = useState<Lookup[]>([]);
  const [listenError, setListenError] = useState<string | null>(null);

  useEffect(() => {
    const onError = (err: Error) => {
      setListenError(err.message || 'Could not load warehouse data from Firebase.');
    };
    const u1 = subscribeOrders(setOrders, onError);
    const u2 = subscribeEvents(setEvents, onError);
    const u3 = subscribeLookups(setLookups, onError);
    return () => {
      u1();
      u2();
      u3();
    };
  }, []);

  const readyOrders = useMemo(
    () => orders.filter((o) => o.status === 'ready').sort((a, b) => b.readyAt - a.readyAt),
    [orders],
  );
  const arrivedOrders = useMemo(
    () =>
      orders
        .filter((o) => o.status === 'arrived')
        .sort((a, b) => (b.arrivedAt ?? 0) - (a.arrivedAt ?? 0)),
    [orders],
  );
  const collectedOrders = useMemo(
    () =>
      orders
        .filter((o) => o.status === 'collected')
        .sort((a, b) => (b.collectedAt ?? 0) - (a.collectedAt ?? 0)),
    [orders],
  );
  const cancelledOrders = useMemo(
    () =>
      orders
        .filter((o) => o.status === 'cancelled')
        .sort((a, b) => (b.cancelledAt ?? 0) - (a.cancelledAt ?? 0)),
    [orders],
  );
  const openLookups = useMemo(
    () => lookups.filter((l) => l.status === 'open'),
    [lookups],
  );

  return {
    orders,
    events,
    lookups,
    readyOrders,
    arrivedOrders,
    collectedOrders,
    cancelledOrders,
    openLookups,
    listenError,
  };
}
