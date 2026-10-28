import {
  collection,
  doc,
  deleteField,
  deleteDoc,
  getDoc,
  onSnapshot,
  setDoc,
  updateDoc,
  addDoc,
  query,
  orderBy,
  type Unsubscribe,
} from 'firebase/firestore';
import type {
  AppEvent,
  Department,
  EventType,
  Lookup,
  LookupStatus,
  Order,
} from '../types';
import { getDb, isFirebaseConfigured } from './firebase';
import {
  demoCloseLookupsForOrder,
  demoDeleteOrder,
  demoGetEvents,
  demoGetLookups,
  demoGetOrders,
  demoGetPinHash,
  demoLogEvent,
  demoAddLookup,
  demoSetPinHash,
  demoUpdateLookup,
  demoUpsertOrder,
  subscribeDemo,
} from './demoStore';

function ordersCol() {
  return collection(getDb(), 'orders');
}

function eventsCol() {
  return collection(getDb(), 'events');
}

function lookupsCol() {
  return collection(getDb(), 'lookups');
}

function adminDoc() {
  return doc(getDb(), 'config', 'admin');
}

function mapOrder(id: string, data: Record<string, unknown>): Order {
  return {
    id,
    status: data.status as Order['status'],
    pallets: Number(data.pallets),
    bay: (data.bay as string | undefined) || undefined,
    department: data.department as Department,
    readyBy: String(data.readyBy ?? ''),
    readyAt: Number(data.readyAt ?? 0),
    arrivedBy: data.arrivedBy ? String(data.arrivedBy) : undefined,
    arrivedAt: data.arrivedAt ? Number(data.arrivedAt) : undefined,
    ackBy: data.ackBy ? String(data.ackBy) : undefined,
    collectedBy: data.collectedBy ? String(data.collectedBy) : undefined,
    collectedAt: data.collectedAt ? Number(data.collectedAt) : undefined,
  };
}

async function logEventFb(
  type: EventType,
  orderId: string,
  operator: string,
  department?: Department | string,
): Promise<void> {
  await addDoc(eventsCol(), {
    type,
    orderId,
    operator,
    department: department ?? null,
    at: Date.now(),
  });
}

export function subscribeOrders(cb: (orders: Order[]) => void): Unsubscribe {
  if (!isFirebaseConfigured()) {
    const push = () => cb(demoGetOrders());
    push();
    return subscribeDemo(push);
  }
  return onSnapshot(ordersCol(), (snap) => {
    const list = snap.docs.map((d) => mapOrder(d.id, d.data()));
    cb(list);
  });
}

export function subscribeEvents(cb: (events: AppEvent[]) => void): Unsubscribe {
  if (!isFirebaseConfigured()) {
    const push = () => cb(demoGetEvents());
    push();
    return subscribeDemo(push);
  }
  const q = query(eventsCol(), orderBy('at', 'desc'));
  return onSnapshot(q, (snap) => {
    cb(
      snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          type: data.type as EventType,
          orderId: String(data.orderId),
          department: data.department ?? undefined,
          operator: String(data.operator),
          at: Number(data.at),
        };
      }),
    );
  });
}

export function subscribeLookups(cb: (lookups: Lookup[]) => void): Unsubscribe {
  if (!isFirebaseConfigured()) {
    const push = () => cb(demoGetLookups());
    push();
    return subscribeDemo(push);
  }
  const q = query(lookupsCol(), orderBy('at', 'desc'));
  return onSnapshot(q, (snap) => {
    cb(
      snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          orderId: String(data.orderId),
          sentBy: String(data.sentBy),
          at: Number(data.at),
          status: data.status as LookupStatus,
        };
      }),
    );
  });
}

export async function getAdminPinHash(): Promise<string | null> {
  if (!isFirebaseConfigured()) return demoGetPinHash();
  const snap = await getDoc(adminDoc());
  if (!snap.exists()) return null;
  return (snap.data().pinHash as string) || null;
}

export async function setAdminPinHash(pinHash: string): Promise<void> {
  if (!isFirebaseConfigured()) {
    demoSetPinHash(pinHash);
    return;
  }
  await setDoc(adminDoc(), { pinHash }, { merge: true });
}

export async function markOrderReady(input: {
  orderId: string;
  pallets: number;
  bay?: string;
  department: Department;
  operator: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = input.orderId.trim().toUpperCase();
  if (!id) return { ok: false, error: 'Enter an order ID.' };
  if (!input.operator.trim()) return { ok: false, error: 'Enter your name at the top.' };
  if (!Number.isFinite(input.pallets) || input.pallets < 1) {
    return { ok: false, error: 'Pallet count must be at least 1.' };
  }

  if (!isFirebaseConfigured()) {
    const existing = demoGetOrders().find((o) => o.id === id);
    if (existing) {
      if (existing.status === 'collected') {
        return { ok: false, error: 'This order was already collected.' };
      }
      if (existing.department !== input.department) {
        return { ok: false, error: 'already in use' };
      }
      return { ok: false, error: 'This order is already on the ready list.' };
    }
    const order: Order = {
      id,
      status: 'ready',
      pallets: input.pallets,
      bay: input.bay?.trim() || undefined,
      department: input.department,
      readyBy: input.operator.trim(),
      readyAt: Date.now(),
    };
    demoUpsertOrder(order);
    demoLogEvent('ready', id, input.operator.trim(), input.department);
    demoCloseLookupsForOrder(id, 'found');
    return { ok: true };
  }

  const ref = doc(ordersCol(), id);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const existing = mapOrder(snap.id, snap.data());
    if (existing.status === 'collected') {
      return { ok: false, error: 'This order was already collected.' };
    }
    if (existing.department !== input.department) {
      return { ok: false, error: 'already in use' };
    }
    return { ok: false, error: 'This order is already on the ready list.' };
  }

  await setDoc(ref, {
    status: 'ready',
    pallets: input.pallets,
    bay: input.bay?.trim() || null,
    department: input.department,
    readyBy: input.operator.trim(),
    readyAt: Date.now(),
  });
  await logEventFb('ready', id, input.operator.trim(), input.department);

  // Close open lookups for this order
  // Client-side: listeners will also see; we update via a lightweight query on known open lookups
  // Handled in markReadyCloseLookups helper called by UI with known lookups.
  return { ok: true };
}

export async function closeOpenLookupsForOrder(
  orderId: string,
  openLookups: Lookup[],
  operator: string,
): Promise<void> {
  const targets = openLookups.filter(
    (l) => l.orderId.toUpperCase() === orderId.toUpperCase() && l.status === 'open',
  );
  for (const l of targets) {
    // eslint-disable-next-line no-await-in-loop
    await updateLookupStatus(l.id, 'found', operator);
  }
}

export async function driverCollection(
  order: Order,
  operator: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!operator.trim()) return { ok: false, error: 'Enter your name at the top.' };
  if (order.status !== 'ready') {
    return { ok: false, error: 'Order is not ready for collection.' };
  }

  if (!isFirebaseConfigured()) {
    demoUpsertOrder({
      ...order,
      status: 'arrived',
      arrivedBy: operator.trim(),
      arrivedAt: Date.now(),
      ackBy: undefined,
    });
    demoLogEvent('driver_collection', order.id, operator.trim(), order.department);
    return { ok: true };
  }

  await updateDoc(doc(ordersCol(), order.id), {
    status: 'arrived',
    arrivedBy: operator.trim(),
    arrivedAt: Date.now(),
    ackBy: deleteField(),
  });
  await logEventFb('driver_collection', order.id, operator.trim(), order.department);
  return { ok: true };
}

export async function acknowledgeOrder(
  order: Order,
  operator: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!operator.trim()) return { ok: false, error: 'Enter your name at the top.' };
  if (order.status !== 'arrived') {
    return { ok: false, error: 'No driver waiting on this order.' };
  }

  if (!isFirebaseConfigured()) {
    demoUpsertOrder({ ...order, ackBy: operator.trim() });
    demoLogEvent('acknowledged', order.id, operator.trim(), order.department);
    return { ok: true };
  }

  await updateDoc(doc(ordersCol(), order.id), { ackBy: operator.trim() });
  await logEventFb('acknowledged', order.id, operator.trim(), order.department);
  return { ok: true };
}

export async function confirmHandover(
  order: Order,
  operator: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!operator.trim()) return { ok: false, error: 'Enter your name at the top.' };
  if (order.status !== 'arrived') {
    return { ok: false, error: 'Order is not awaiting handover.' };
  }

  if (!isFirebaseConfigured()) {
    demoUpsertOrder({
      ...order,
      status: 'collected',
      collectedBy: operator.trim(),
      collectedAt: Date.now(),
      ackBy: order.ackBy || operator.trim(),
    });
    demoLogEvent('collected', order.id, operator.trim(), order.department);
    return { ok: true };
  }

  await updateDoc(doc(ordersCol(), order.id), {
    status: 'collected',
    collectedBy: operator.trim(),
    collectedAt: Date.now(),
    ackBy: order.ackBy || operator.trim(),
  });
  await logEventFb('collected', order.id, operator.trim(), order.department);
  return { ok: true };
}

export async function removeOrder(
  order: Order,
  operator: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!operator.trim()) return { ok: false, error: 'Enter your name at the top.' };

  if (!isFirebaseConfigured()) {
    demoDeleteOrder(order.id);
    demoLogEvent('removed', order.id, operator.trim(), order.department);
    return { ok: true };
  }

  await deleteDoc(doc(ordersCol(), order.id));
  await logEventFb('removed', order.id, operator.trim(), order.department);
  return { ok: true };
}

export async function reopenOrder(
  orderId: string,
  operator: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = orderId.trim().toUpperCase();
  if (!id) return { ok: false, error: 'Enter an order ID.' };
  if (!operator.trim()) return { ok: false, error: 'Enter your name at the top.' };

  if (!isFirebaseConfigured()) {
    const existing = demoGetOrders().find((o) => o.id === id);
    if (!existing) return { ok: false, error: 'Order not found.' };
    demoUpsertOrder({
      ...existing,
      status: 'ready',
      arrivedBy: undefined,
      arrivedAt: undefined,
      ackBy: undefined,
      collectedBy: undefined,
      collectedAt: undefined,
    });
    demoLogEvent('reopened', id, operator.trim(), existing.department);
    return { ok: true };
  }

  const ref = doc(ordersCol(), id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { ok: false, error: 'Order not found.' };
  const existing = mapOrder(snap.id, snap.data());
  await updateDoc(ref, {
    status: 'ready',
    arrivedBy: deleteField(),
    arrivedAt: deleteField(),
    ackBy: deleteField(),
    collectedBy: deleteField(),
    collectedAt: deleteField(),
  });
  await logEventFb('reopened', id, operator.trim(), existing.department);
  return { ok: true };
}

export async function deleteOrderAdmin(
  orderId: string,
  operator: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = orderId.trim().toUpperCase();
  if (!id) return { ok: false, error: 'Enter an order ID.' };
  if (!operator.trim()) return { ok: false, error: 'Enter your name at the top.' };

  if (!isFirebaseConfigured()) {
    const existing = demoGetOrders().find((o) => o.id === id);
    if (!existing) return { ok: false, error: 'Order not found.' };
    demoDeleteOrder(id);
    demoLogEvent('removed', id, operator.trim(), existing.department);
    return { ok: true };
  }

  const ref = doc(ordersCol(), id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { ok: false, error: 'Order not found.' };
  const existing = mapOrder(snap.id, snap.data());
  await deleteDoc(ref);
  await logEventFb('removed', id, operator.trim(), existing.department);
  return { ok: true };
}

export async function sendLookup(
  orderId: string,
  operator: string,
): Promise<{ ok: true; lookup: Lookup } | { ok: false; error: string }> {
  const id = orderId.trim().toUpperCase();
  if (!id) return { ok: false, error: 'Enter an order ID.' };
  if (!operator.trim()) return { ok: false, error: 'Enter your name at the top.' };

  if (!isFirebaseConfigured()) {
    const lookup = demoAddLookup({
      orderId: id,
      sentBy: operator.trim(),
      at: Date.now(),
      status: 'open',
    });
    demoLogEvent('lookup_sent', id, operator.trim());
    return { ok: true, lookup };
  }

  const ref = await addDoc(lookupsCol(), {
    orderId: id,
    sentBy: operator.trim(),
    at: Date.now(),
    status: 'open',
  });
  await logEventFb('lookup_sent', id, operator.trim());
  return {
    ok: true,
    lookup: {
      id: ref.id,
      orderId: id,
      sentBy: operator.trim(),
      at: Date.now(),
      status: 'open',
    },
  };
}

export async function updateLookupStatus(
  lookupId: string,
  status: LookupStatus,
  operator: string,
  orderId?: string,
): Promise<void> {
  if (!isFirebaseConfigured()) {
    demoUpdateLookup(lookupId, { status });
    if (status === 'closed' && orderId) {
      demoLogEvent('lookup_closed', orderId, operator);
    } else if (status === 'found' && orderId) {
      demoLogEvent('lookup_found', orderId, operator);
    }
    return;
  }

  await updateDoc(doc(lookupsCol(), lookupId), { status });
  if (status === 'closed' && orderId) {
    await logEventFb('lookup_closed', orderId, operator);
  } else if (status === 'found' && orderId) {
    await logEventFb('lookup_found', orderId, operator);
  }
}

export async function resendLookup(
  lookup: Lookup,
  operator: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!operator.trim()) return { ok: false, error: 'Enter your name at the top.' };

  if (!isFirebaseConfigured()) {
    demoUpdateLookup(lookup.id, {
      at: Date.now(),
      sentBy: operator.trim(),
      status: 'open',
    });
    demoLogEvent('lookup_sent', lookup.orderId, operator.trim());
    return { ok: true };
  }

  await updateDoc(doc(lookupsCol(), lookup.id), {
    at: Date.now(),
    sentBy: operator.trim(),
    status: 'open',
  });
  await logEventFb('lookup_sent', lookup.orderId, operator.trim());
  return { ok: true };
}

export async function getOrderById(orderId: string): Promise<Order | null> {
  const id = orderId.trim().toUpperCase();
  if (!isFirebaseConfigured()) {
    return demoGetOrders().find((o) => o.id === id) ?? null;
  }
  const snap = await getDoc(doc(ordersCol(), id));
  if (!snap.exists()) return null;
  return mapOrder(snap.id, snap.data());
}
