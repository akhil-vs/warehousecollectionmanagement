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
  runTransaction,
  type Unsubscribe,
} from 'firebase/firestore';
import type {
  AppEvent,
  Department,
  EventType,
  Lookup,
  LookupResponse,
  LookupStatus,
  Order,
} from '../types';
import { getDb, isFirebaseConfigured } from './firebase';
import { parseDateInput } from './format';
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
import {
  UserFacingError,
  markReadyConflict,
  toUserError,
  withLookupResponse,
} from './orderState';

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
    collectionDate: parseDateInput(
      typeof data.collectionDate === 'string' ? data.collectionDate : undefined,
    ),
    readyBy: String(data.readyBy ?? ''),
    readyAt: Number(data.readyAt ?? 0),
    arrivedBy: data.arrivedBy ? String(data.arrivedBy) : undefined,
    arrivedAt: data.arrivedAt ? Number(data.arrivedAt) : undefined,
    ackBy: data.ackBy ? String(data.ackBy) : undefined,
    collectedBy: data.collectedBy ? String(data.collectedBy) : undefined,
    collectedAt: data.collectedAt ? Number(data.collectedAt) : undefined,
    door: data.door ? String(data.door) : undefined,
    haulier: data.haulier ? String(data.haulier) : undefined,
    exceptionReason: data.exceptionReason ? String(data.exceptionReason) : undefined,
    cancelledBy: data.cancelledBy ? String(data.cancelledBy) : undefined,
    cancelledAt: data.cancelledAt ? Number(data.cancelledAt) : undefined,
  };
}

function mapLookup(id: string, data: Record<string, unknown>): Lookup {
  return {
    id,
    orderId: String(data.orderId),
    sentBy: String(data.sentBy),
    at: Number(data.at),
    status: data.status as LookupStatus,
    responses: (data.responses as Lookup['responses']) || {},
  };
}

async function logEventFb(
  type: EventType,
  orderId: string,
  operator: string,
  department?: Department | string,
  note?: string,
): Promise<void> {
  await addDoc(eventsCol(), {
    type,
    orderId,
    operator,
    department: department ?? null,
    at: Date.now(),
    note: note ?? null,
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
          note: data.note ? String(data.note) : undefined,
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
    cb(snap.docs.map((d) => mapLookup(d.id, d.data())));
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

function resolvePalletCount(pallets: number | undefined): number {
  if (!Number.isFinite(pallets) || pallets === undefined || pallets < 1) return 1;
  return Math.floor(pallets);
}

function resolveCollectionDate(
  value: string | undefined,
): { ok: true; date?: string } | { ok: false; error: string } {
  if (!value || !value.trim()) return { ok: true };
  const parsed = parseDateInput(value);
  if (!parsed) return { ok: false, error: 'Enter a valid collection date.' };
  return { ok: true, date: parsed };
}

function readyEditNote(pallets: number, bay?: string, collectionDate?: string): string {
  const parts = [`${pallets} plt`];
  if (bay) parts.push(`Bay ${bay}`);
  if (collectionDate) parts.push(`collect ${collectionDate}`);
  return parts.join(' · ');
}

export async function markOrderReady(input: {
  orderId: string;
  pallets?: number;
  bay?: string;
  collectionDate?: string;
  department: Department;
  operator: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = input.orderId.trim().toUpperCase();
  if (!id) return { ok: false, error: 'Enter an order ID.' };
  if (!input.operator.trim()) return { ok: false, error: 'Enter your name at the top.' };
  const pallets = resolvePalletCount(input.pallets);
  const collection = resolveCollectionDate(input.collectionDate);
  if (!collection.ok) return collection;

  const payload = {
    status: 'ready' as const,
    pallets,
    bay: input.bay?.trim() || undefined,
    collectionDate: collection.date,
    department: input.department,
    readyBy: input.operator.trim(),
    readyAt: Date.now(),
  };

  if (!isFirebaseConfigured()) {
    const existing = demoGetOrders().find((o) => o.id === id);
    const conflict = markReadyConflict(existing, input.department);
    if (conflict) return { ok: false, error: conflict };
    demoUpsertOrder({ id, ...payload });
    demoLogEvent('ready', id, input.operator.trim(), input.department);
    demoCloseLookupsForOrder(id, 'found');
    return { ok: true };
  }

  try {
    await runTransaction(getDb(), async (tx) => {
      const ref = doc(ordersCol(), id);
      const snap = await tx.get(ref);
      const existing = snap.exists() ? mapOrder(snap.id, snap.data()) : undefined;
      const conflict = markReadyConflict(existing, input.department);
      if (conflict) throw new UserFacingError(conflict);
      tx.set(ref, {
        status: payload.status,
        pallets: payload.pallets,
        bay: payload.bay || null,
        collectionDate: payload.collectionDate || null,
        department: payload.department,
        readyBy: payload.readyBy,
        readyAt: payload.readyAt,
      });
    });
    await logEventFb('ready', id, input.operator.trim(), input.department);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toUserError(err, 'Could not mark ready.') };
  }
}

export async function updateReadyOrder(
  order: Order,
  operator: string,
  patch: { pallets: number; bay?: string; collectionDate?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!operator.trim()) return { ok: false, error: 'Enter your name at the top.' };
  if (!Number.isFinite(patch.pallets) || patch.pallets < 1) {
    return { ok: false, error: 'Pallet count must be at least 1.' };
  }
  const pallets = Math.floor(patch.pallets);
  const collection = resolveCollectionDate(patch.collectionDate);
  if (!collection.ok) return collection;
  const bay = patch.bay?.trim() || undefined;
  const note = readyEditNote(pallets, bay, collection.date);

  if (!isFirebaseConfigured()) {
    const existing = demoGetOrders().find((o) => o.id === order.id);
    if (!existing) return { ok: false, error: 'Order not found.' };
    if (existing.status !== 'ready') {
      return { ok: false, error: 'Only ready orders can be edited.' };
    }
    demoUpsertOrder({
      ...existing,
      pallets,
      bay,
      collectionDate: collection.date,
    });
    demoLogEvent('updated', order.id, operator.trim(), existing.department, note);
    return { ok: true };
  }

  try {
    await runTransaction(getDb(), async (tx) => {
      const ref = doc(ordersCol(), order.id);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new UserFacingError('Order not found.');
      const existing = mapOrder(snap.id, snap.data());
      if (existing.status !== 'ready') {
        throw new UserFacingError('Only ready orders can be edited.');
      }
      tx.update(ref, {
        pallets,
        bay: bay || deleteField(),
        collectionDate: collection.date || deleteField(),
      });
    });
    await logEventFb('updated', order.id, operator.trim(), order.department, note);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toUserError(err, 'Could not update order.') };
  }
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
    await updateLookupStatus(l.id, 'found', operator, l.orderId);
  }
}

export async function driverCollection(
  order: Order,
  operator: string,
  extras?: { door?: string; haulier?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!operator.trim()) return { ok: false, error: 'Enter your name at the top.' };
  const door = extras?.door?.trim() || undefined;
  const haulier = extras?.haulier?.trim() || undefined;

  if (!isFirebaseConfigured()) {
    if (order.status !== 'ready') {
      return { ok: false, error: 'Order is not ready for collection.' };
    }
    demoUpsertOrder({
      ...order,
      status: 'arrived',
      arrivedBy: operator.trim(),
      arrivedAt: Date.now(),
      ackBy: undefined,
      door,
      haulier,
      exceptionReason: undefined,
    });
    demoLogEvent('driver_collection', order.id, operator.trim(), order.department);
    return { ok: true };
  }

  try {
    await runTransaction(getDb(), async (tx) => {
      const ref = doc(ordersCol(), order.id);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new UserFacingError('Order not found.');
      const existing = mapOrder(snap.id, snap.data());
      if (existing.status !== 'ready') {
        throw new UserFacingError('Order is not ready for collection.');
      }
      tx.update(ref, {
        status: 'arrived',
        arrivedBy: operator.trim(),
        arrivedAt: Date.now(),
        ackBy: deleteField(),
        door: door || deleteField(),
        haulier: haulier || deleteField(),
        exceptionReason: deleteField(),
      });
    });
    await logEventFb('driver_collection', order.id, operator.trim(), order.department);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toUserError(err, 'Could not record driver collection.') };
  }
}

export async function undoDriverCollection(
  order: Order,
  operator: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!operator.trim()) return { ok: false, error: 'Enter your name at the top.' };

  if (!isFirebaseConfigured()) {
    if (order.status !== 'arrived') {
      return { ok: false, error: 'Order is not awaiting handover.' };
    }
    demoUpsertOrder({
      ...order,
      status: 'ready',
      arrivedBy: undefined,
      arrivedAt: undefined,
      ackBy: undefined,
      door: undefined,
      haulier: undefined,
    });
    demoLogEvent('driver_collection_cancelled', order.id, operator.trim(), order.department);
    return { ok: true };
  }

  try {
    await runTransaction(getDb(), async (tx) => {
      const ref = doc(ordersCol(), order.id);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new UserFacingError('Order not found.');
      const existing = mapOrder(snap.id, snap.data());
      if (existing.status !== 'arrived') {
        throw new UserFacingError('Order is not awaiting handover.');
      }
      tx.update(ref, {
        status: 'ready',
        arrivedBy: deleteField(),
        arrivedAt: deleteField(),
        ackBy: deleteField(),
        door: deleteField(),
        haulier: deleteField(),
      });
    });
    await logEventFb(
      'driver_collection_cancelled',
      order.id,
      operator.trim(),
      order.department,
    );
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toUserError(err, 'Could not undo collection.') };
  }
}

export async function acknowledgeOrder(
  order: Order,
  operator: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!operator.trim()) return { ok: false, error: 'Enter your name at the top.' };

  if (!isFirebaseConfigured()) {
    if (order.status !== 'arrived') {
      return { ok: false, error: 'No driver waiting on this order.' };
    }
    if (order.ackBy) return { ok: true };
    demoUpsertOrder({ ...order, ackBy: operator.trim() });
    demoLogEvent('acknowledged', order.id, operator.trim(), order.department);
    return { ok: true };
  }

  try {
    let alreadyAcked = false;
    await runTransaction(getDb(), async (tx) => {
      const ref = doc(ordersCol(), order.id);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new UserFacingError('Order not found.');
      const existing = mapOrder(snap.id, snap.data());
      if (existing.status !== 'arrived') {
        throw new UserFacingError('No driver waiting on this order.');
      }
      if (existing.ackBy) {
        alreadyAcked = true;
        return;
      }
      tx.update(ref, { ackBy: operator.trim() });
    });
    if (!alreadyAcked) {
      await logEventFb('acknowledged', order.id, operator.trim(), order.department);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toUserError(err, 'Could not acknowledge.') };
  }
}

export async function confirmHandover(
  order: Order,
  operator: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!operator.trim()) return { ok: false, error: 'Enter your name at the top.' };

  if (!isFirebaseConfigured()) {
    if (order.status !== 'arrived') {
      return { ok: false, error: 'Order is not awaiting handover.' };
    }
    if (!order.ackBy) {
      return { ok: false, error: 'Acknowledge the driver first.' };
    }
    demoUpsertOrder({
      ...order,
      status: 'collected',
      collectedBy: operator.trim(),
      collectedAt: Date.now(),
    });
    demoLogEvent('collected', order.id, operator.trim(), order.department);
    return { ok: true };
  }

  try {
    await runTransaction(getDb(), async (tx) => {
      const ref = doc(ordersCol(), order.id);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new UserFacingError('Order not found.');
      const existing = mapOrder(snap.id, snap.data());
      if (existing.status !== 'arrived') {
        throw new UserFacingError('Order is not awaiting handover.');
      }
      if (!existing.ackBy) {
        throw new UserFacingError('Acknowledge the driver first.');
      }
      tx.update(ref, {
        status: 'collected',
        collectedBy: operator.trim(),
        collectedAt: Date.now(),
      });
    });
    await logEventFb('collected', order.id, operator.trim(), order.department);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toUserError(err, 'Could not confirm handover.') };
  }
}

export async function exceptionHandover(
  order: Order,
  operator: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!operator.trim()) return { ok: false, error: 'Enter your name at the top.' };
  const note = reason.trim();
  if (!note) return { ok: false, error: 'Enter a reason for the exception handover.' };

  if (!isFirebaseConfigured()) {
    if (order.status !== 'arrived') {
      return { ok: false, error: 'Order is not awaiting handover.' };
    }
    demoUpsertOrder({
      ...order,
      status: 'collected',
      collectedBy: operator.trim(),
      collectedAt: Date.now(),
      exceptionReason: note,
    });
    demoLogEvent('handover_exception', order.id, operator.trim(), order.department, note);
    demoLogEvent('collected', order.id, operator.trim(), order.department, note);
    return { ok: true };
  }

  try {
    await runTransaction(getDb(), async (tx) => {
      const ref = doc(ordersCol(), order.id);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new UserFacingError('Order not found.');
      const existing = mapOrder(snap.id, snap.data());
      if (existing.status !== 'arrived') {
        throw new UserFacingError('Order is not awaiting handover.');
      }
      tx.update(ref, {
        status: 'collected',
        collectedBy: operator.trim(),
        collectedAt: Date.now(),
        exceptionReason: note,
      });
    });
    await logEventFb(
      'handover_exception',
      order.id,
      operator.trim(),
      order.department,
      note,
    );
    await logEventFb('collected', order.id, operator.trim(), order.department, note);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toUserError(err, 'Could not complete exception handover.') };
  }
}

export async function cancelOrder(
  order: Order,
  operator: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!operator.trim()) return { ok: false, error: 'Enter your name at the top.' };

  if (!isFirebaseConfigured()) {
    if (order.status !== 'ready') {
      return { ok: false, error: 'Only ready orders can be cancelled.' };
    }
    demoUpsertOrder({
      ...order,
      status: 'cancelled',
      cancelledBy: operator.trim(),
      cancelledAt: Date.now(),
    });
    demoLogEvent('cancelled', order.id, operator.trim(), order.department);
    return { ok: true };
  }

  try {
    await runTransaction(getDb(), async (tx) => {
      const ref = doc(ordersCol(), order.id);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new UserFacingError('Order not found.');
      const existing = mapOrder(snap.id, snap.data());
      if (existing.status !== 'ready') {
        throw new UserFacingError('Only ready orders can be cancelled.');
      }
      tx.update(ref, {
        status: 'cancelled',
        cancelledBy: operator.trim(),
        cancelledAt: Date.now(),
      });
    });
    await logEventFb('cancelled', order.id, operator.trim(), order.department);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toUserError(err, 'Could not cancel order.') };
  }
}

export async function removeOrder(
  order: Order,
  operator: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return cancelOrder(order, operator);
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
      id: existing.id,
      status: 'ready',
      pallets: existing.pallets,
      bay: existing.bay,
      collectionDate: existing.collectionDate,
      department: existing.department,
      readyBy: existing.readyBy,
      readyAt: existing.readyAt,
    });
    demoLogEvent('reopened', id, operator.trim(), existing.department);
    return { ok: true };
  }

  try {
    let department: Department | string = '';
    await runTransaction(getDb(), async (tx) => {
      const ref = doc(ordersCol(), id);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new UserFacingError('Order not found.');
      const existing = mapOrder(snap.id, snap.data());
      department = existing.department;
      tx.update(ref, {
        status: 'ready',
        arrivedBy: deleteField(),
        arrivedAt: deleteField(),
        ackBy: deleteField(),
        collectedBy: deleteField(),
        collectedAt: deleteField(),
        door: deleteField(),
        haulier: deleteField(),
        exceptionReason: deleteField(),
        cancelledBy: deleteField(),
        cancelledAt: deleteField(),
      });
    });
    await logEventFb('reopened', id, operator.trim(), department);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toUserError(err, 'Could not reopen order.') };
  }
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
      responses: {},
    });
    demoLogEvent('lookup_sent', id, operator.trim());
    return { ok: true, lookup };
  }

  const ref = await addDoc(lookupsCol(), {
    orderId: id,
    sentBy: operator.trim(),
    at: Date.now(),
    status: 'open',
    responses: {},
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
      responses: {},
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

export async function respondToLookup(
  lookup: Lookup,
  department: Department,
  response: LookupResponse,
  operator: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!operator.trim()) return { ok: false, error: 'Enter your name at the top.' };

  const next = withLookupResponse(lookup, department, response);
  const eventType = response === 'ours' ? 'lookup_ours' : 'lookup_not_ours';

  if (!isFirebaseConfigured()) {
    demoUpdateLookup(lookup.id, {
      responses: next.responses,
      status: next.status,
    });
    demoLogEvent(eventType, lookup.orderId, operator.trim(), department);
    if (next.status === 'closed' && lookup.status === 'open') {
      demoLogEvent('lookup_closed', lookup.orderId, operator.trim(), department);
    }
    return { ok: true };
  }

  await updateDoc(doc(lookupsCol(), lookup.id), {
    responses: next.responses ?? {},
    status: next.status,
  });
  await logEventFb(eventType, lookup.orderId, operator.trim(), department);
  if (next.status === 'closed' && lookup.status === 'open') {
    await logEventFb('lookup_closed', lookup.orderId, operator.trim(), department);
  }
  return { ok: true };
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
      responses: {},
    });
    demoLogEvent('lookup_sent', lookup.orderId, operator.trim());
    return { ok: true };
  }

  await updateDoc(doc(lookupsCol(), lookup.id), {
    at: Date.now(),
    sentBy: operator.trim(),
    status: 'open',
    responses: {},
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
