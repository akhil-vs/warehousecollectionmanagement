import { useEffect, useMemo, useRef } from 'react';
import type { DeviceRole, Lookup, Order } from '../types';
import { SoundPatterns } from '../lib/sound';
import { showBrowserNotification, updateTabTitle } from '../lib/notifications';
import { isDepartmentRole } from './useDepartments';

interface Args {
  role: DeviceRole | null;
  departments: readonly string[];
  orders: Order[];
  arrivedOrders: Order[];
  openLookups: Lookup[];
  onToast: (message: string) => void;
  resetKey?: number;
}

export function useAlerts({
  role,
  departments,
  orders,
  arrivedOrders,
  openLookups,
  onToast,
  resetKey = 0,
}: Args) {
  const seenReady = useRef<Set<string>>(new Set());
  const seenArrived = useRef<Set<string>>(new Set());
  const seenCollected = useRef<Set<string>>(new Set());
  const seenLookups = useRef<Set<string>>(new Set());
  const seenAck = useRef<Set<string>>(new Set());
  const primed = useRef(false);

  useEffect(() => {
    primed.current = false;
    seenReady.current.clear();
    seenArrived.current.clear();
    seenCollected.current.clear();
    seenLookups.current.clear();
    seenAck.current.clear();
  }, [resetKey]);

  const waitingForUs = useMemo(() => {
    if (!role || role === 'dock') return [];
    if (isDepartmentRole(role, departments)) {
      return arrivedOrders.filter((o) => o.department === role);
    }
    return arrivedOrders;
  }, [arrivedOrders, role, departments]);

  const waitingTitleCount = useMemo(() => {
    if (!role) return 0;
    if (role === 'dock') return arrivedOrders.length;
    return waitingForUs.length;
  }, [role, arrivedOrders, waitingForUs]);

  useEffect(() => {
    updateTabTitle(waitingTitleCount);
  }, [waitingTitleCount]);

  useEffect(() => {
    if (!role || role === 'dock') return;
    const unacked = waitingForUs.filter((o) => !o.ackBy);
    if (unacked.length === 0) return;
    const id = window.setInterval(() => {
      void SoundPatterns.nagUnacked();
    }, 30_000);
    return () => window.clearInterval(id);
  }, [role, waitingForUs]);

  useEffect(() => {
    if (!role) return;
    const currentRole = role;

    if (!primed.current) {
      orders.forEach((o) => {
        if (o.status === 'ready') seenReady.current.add(o.id);
        if (o.status === 'arrived') {
          seenArrived.current.add(o.id);
          if (o.ackBy) seenAck.current.add(o.id);
        }
        if (o.status === 'collected') seenCollected.current.add(o.id);
      });
      openLookups.forEach((l) => seenLookups.current.add(`${l.id}:${l.at}`));
      primed.current = true;
      return;
    }

    for (const o of orders) {
      if (o.status === 'ready' && !seenReady.current.has(o.id)) {
        seenReady.current.add(o.id);
        const visible =
          currentRole === 'admin' ||
          currentRole === 'dock' ||
          (isDepartmentRole(currentRole, departments) && o.department === currentRole);
        if (visible) {
          void SoundPatterns.markedReady();
          onToast(`Order ${o.id} marked ready (${o.department})`);
          showBrowserNotification('Pallets ready', `${o.id} · ${o.department}`);
        }
      }
      if (o.status === 'arrived' && !seenArrived.current.has(o.id)) {
        seenArrived.current.add(o.id);
        const owning =
          isDepartmentRole(currentRole, departments) && o.department === currentRole;
        if (owning || currentRole === 'admin') {
          void SoundPatterns.driverOwning();
          onToast(`Driver waiting on ${o.id}`);
          showBrowserNotification('Driver waiting', `Order ${o.id}`);
        } else if (currentRole === 'dock' || isDepartmentRole(currentRole, departments)) {
          void SoundPatterns.driverOther();
        }
      }
      if (o.ackBy && o.status === 'arrived' && !seenAck.current.has(o.id)) {
        seenAck.current.add(o.id);
        void SoundPatterns.softAck();
      }
      if (o.status === 'collected' && !seenCollected.current.has(o.id)) {
        seenCollected.current.add(o.id);
        void SoundPatterns.softAck();
      }
      if (o.status !== 'ready') seenReady.current.delete(o.id);
      if (o.status !== 'arrived') {
        seenArrived.current.delete(o.id);
        seenAck.current.delete(o.id);
      }
    }

    for (const l of openLookups) {
      const key = `${l.id}:${l.at}`;
      if (!seenLookups.current.has(key)) {
        seenLookups.current.add(key);
        if (isDepartmentRole(currentRole, departments) || currentRole === 'admin') {
          void SoundPatterns.dockLookup();
          onToast(`Dock lookup: ${l.orderId}`);
          showBrowserNotification('Dock lookup', `Is order ${l.orderId} yours?`);
        }
      }
    }
  }, [orders, openLookups, role, departments, onToast]);

  return { waitingForUs };
}
