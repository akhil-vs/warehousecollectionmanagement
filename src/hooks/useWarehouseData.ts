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

  useEffect(() => {
    const u1 = subscribeOrders(setOrders);
    const u2 = subscribeEvents(setEvents);
    const u3 = subscribeLookups(setLookups);
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
    openLookups,
  };
}
