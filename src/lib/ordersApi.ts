import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  orderBy,
  type Unsubscribe,
} from 'firebase/firestore';
import type {
  AppEvent,
  Department,
  Lookup,
  LookupResponse,
  LookupStatus,
  Order,
} from '../types';
import { DEFAULT_DEPARTMENTS } from '../types';
import { getDb, isFirebaseConfigured } from './firebase';
import { parseDateInput } from './format';
import { callMutation, callTyped } from './callables';
import {
  demoCloseLookupsForOrder,
  demoDeleteOrder,
  demoGetEvents,
  demoGetLookups,
  demoGetOrders,
  demoGetPinHash,
  demoGetDepartments,
  demoLogEvent,
  demoAddLookup,
  demoSetPinHash,
  demoSetDepartments,
  demoUpdateLookup,
  demoUpsertOrder,
  subscribeDemo,
} from './demoStore';
import {
  markReadyConflict,
  normalizeDepartments,
  isKnownDepartment,
  resolvePalletCount,
  readyEditNote,
  toUserError,
  withLookupResponse,
} from './orderState';
import { hashPin, verifyPin } from './pin';

function ordersCol() {
  return collection(getDb(), 'orders');
}

function eventsCol() {
  return collection(getDb(), 'events');
}

function lookupsCol() {
  return collection(getDb(), 'lookups');
}

function mapOrder(id: string, data: Record<string, unknown>): Order {
  return {
    id,
    status: data.status as Order['status'],
    pallets: Number(data.pallets),
    bay: (data.bay as string | undefined) || undefined,
    department: String(data.department),
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

function resolveCollectionDate(
  value: string | undefined,
): { ok: true; date?: string } | { ok: false; error: string } {
  if (!value || !value.trim()) return { ok: true };
  const parsed = parseDateInput(value);
  if (!parsed) return { ok: false, error: 'Enter a valid collection date.' };
  return { ok: true, date: parsed };
}

type SnapshotErrorHandler = (error: Error) => void;

function toListenError(err: unknown, fallback: string): Error {
  return err instanceof Error ? err : new Error(fallback);
}

export function subscribeOrders(
  cb: (orders: Order[]) => void,
  onError?: SnapshotErrorHandler,
): Unsubscribe {
  if (!isFirebaseConfigured()) {
    const push = () => cb(demoGetOrders());
    push();
    return subscribeDemo(push);
  }
  return onSnapshot(
    ordersCol(),
    (snap) => {
      const list = snap.docs.map((d) => mapOrder(d.id, d.data()));
      cb(list);
    },
    (err) => onError?.(toListenError(err, 'Could not load orders.')),
  );
}

export function subscribeEvents(
  cb: (events: AppEvent[]) => void,
  onError?: SnapshotErrorHandler,
): Unsubscribe {
  if (!isFirebaseConfigured()) {
    const push = () => cb(demoGetEvents());
    push();
    return subscribeDemo(push);
  }
  const q = query(eventsCol(), orderBy('at', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      cb(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            type: data.type as AppEvent['type'],
            orderId: String(data.orderId),
            department: data.department ?? undefined,
            operator: String(data.operator),
            at: Number(data.at),
            note: data.note ? String(data.note) : undefined,
          };
        }),
      );
    },
    (err) => onError?.(toListenError(err, 'Could not load events.')),
  );
}

export function subscribeLookups(
  cb: (lookups: Lookup[]) => void,
  onError?: SnapshotErrorHandler,
): Unsubscribe {
  if (!isFirebaseConfigured()) {
    const push = () => cb(demoGetLookups());
    push();
    return subscribeDemo(push);
  }
  const q = query(lookupsCol(), orderBy('at', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      cb(snap.docs.map((d) => mapLookup(d.id, d.data())));
    },
    (err) => onError?.(toListenError(err, 'Could not load lookups.')),
  );
}

export function subscribeDepartments(
  cb: (departments: Department[]) => void,
  onError?: SnapshotErrorHandler,
): Unsubscribe {
  if (!isFirebaseConfigured()) {
    const push = () => cb(demoGetDepartments());
    push();
    return subscribeDemo(push);
  }
  return onSnapshot(
    doc(getDb(), 'config', 'settings'),
    (snap) => {
      if (!snap.exists()) {
        cb([...DEFAULT_DEPARTMENTS]);
        return;
      }
      cb(normalizeDepartments(snap.data().departments));
    },
    (err) => onError?.(toListenError(err, 'Could not load departments.')),
  );
}

export async function getBootstrapState(): Promise<{
  pinConfigured: boolean;
  departments: Department[];
}> {
  if (!isFirebaseConfigured()) {
    return {
      pinConfigured: Boolean(demoGetPinHash()),
      departments: demoGetDepartments(),
    };
  }
  return callTyped('getBootstrapState', {});
}

export async function bootstrapAdminPin(
  pin: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isFirebaseConfigured()) {
    if (pin.trim().length < 4) {
      return { ok: false, error: 'Choose an admin PIN with at least 4 characters.' };
    }
    if (demoGetPinHash()) return { ok: false, error: 'Admin PIN is already configured.' };
    demoSetPinHash(await hashPin(pin.trim()));
    return { ok: true };
  }
  return callMutation('bootstrapAdminPin', { pin });
}

export async function verifyAdminPin(
  pin: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isFirebaseConfigured()) {
    const existing = demoGetPinHash();
    if (!existing) return { ok: false, error: 'No admin PIN is set yet.' };
    const ok = await verifyPin(pin.trim(), existing);
    return ok ? { ok: true } : { ok: false, error: 'Incorrect admin PIN.' };
  }
  return callMutation('verifyAdminPin', { pin });
}

export async function changeAdminPin(
  currentPin: string,
  nextPin: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isFirebaseConfigured()) {
    const existing = demoGetPinHash();
    if (!existing) return { ok: false, error: 'No admin PIN is set yet.' };
    if (!(await verifyPin(currentPin.trim(), existing))) {
      return { ok: false, error: 'Current PIN is incorrect.' };
    }
    if (nextPin.trim().length < 4) {
      return { ok: false, error: 'New PIN must be at least 4 characters.' };
    }
    demoSetPinHash(await hashPin(nextPin.trim()));
    return { ok: true };
  }
  return callMutation('changeAdminPin', { currentPin, nextPin });
}

export async function setDepartments(
  departments: string[],
  pin: string,
): Promise<{ ok: true; departments: Department[] } | { ok: false; error: string }> {
  const next = normalizeDepartments(departments);
  if (!isFirebaseConfigured()) {
    const existing = demoGetPinHash();
    if (!existing) return { ok: false, error: 'No admin PIN is set yet.' };
    if (!(await verifyPin(pin.trim(), existing))) {
      return { ok: false, error: 'Incorrect admin PIN.' };
    }
    demoSetDepartments(next);
    return { ok: true, departments: next };
  }
  try {
    return await callTyped('setDepartments', { departments: next, pin });
  } catch (err) {
    return { ok: false, error: toUserError(err, 'Could not update departments.') };
  }
}

/** @deprecated Prefer getBootstrapState — kept for transitional call sites. */
export async function getAdminPinHash(): Promise<string | null> {
  if (!isFirebaseConfigured()) return demoGetPinHash();
  const state = await getBootstrapState();
  return state.pinConfigured ? 'configured' : null;
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
  const collection = resolveCollectionDate(input.collectionDate);
  if (!collection.ok) return collection;

  if (!isFirebaseConfigured()) {
    const departments = demoGetDepartments();
    if (!isKnownDepartment(input.department, departments)) {
      return { ok: false, error: 'Unknown department.' };
    }
    const pallets = resolvePalletCount(input.pallets);
    const existing = demoGetOrders().find((o) => o.id === id);
    const conflict = markReadyConflict(existing, input.department);
    if (conflict) return { ok: false, error: conflict };
    demoUpsertOrder({
      id,
      status: 'ready',
      pallets,
      bay: input.bay?.trim() || undefined,
      collectionDate: collection.date,
      department: input.department,
      readyBy: input.operator.trim(),
      readyAt: Date.now(),
    });
    demoLogEvent('ready', id, input.operator.trim(), input.department);
    demoCloseLookupsForOrder(id, 'found');
    return { ok: true };
  }

  return callMutation('markOrderReady', {
    orderId: id,
    pallets: input.pallets,
    bay: input.bay,
    collectionDate: input.collectionDate,
    department: input.department,
    operator: input.operator,
  });
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

  if (!isFirebaseConfigured()) {
    const existing = demoGetOrders().find((o) => o.id === order.id);
    if (!existing) return { ok: false, error: 'Order not found.' };
    if (existing.status !== 'ready') {
      return { ok: false, error: 'Only ready orders can be edited.' };
    }
    const note = readyEditNote(pallets, bay, collection.date);
    demoUpsertOrder({
      ...existing,
      pallets,
      bay,
      collectionDate: collection.date,
    });
    demoLogEvent('updated', order.id, operator.trim(), existing.department, note);
    return { ok: true };
  }

  return callMutation('updateReadyOrder', {
    orderId: order.id,
    operator,
    pallets,
    bay,
    collectionDate: patch.collectionDate,
  });
}

export async function closeOpenLookupsForOrder(
  orderId: string,
  openLookups: Lookup[],
  operator: string,
): Promise<void> {
  if (isFirebaseConfigured()) {
    // Server markOrderReady already closes open lookups.
    return;
  }
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

  return callMutation('driverCollection', {
    orderId: order.id,
    operator,
    door,
    haulier,
  });
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

  return callMutation('undoDriverCollection', { orderId: order.id, operator });
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

  return callMutation('acknowledgeOrder', { orderId: order.id, operator });
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

  return callMutation('confirmHandover', { orderId: order.id, operator });
}

export async function exceptionHandover(
  order: Order,
  operator: string,
  reason: string,
  pin: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!operator.trim()) return { ok: false, error: 'Enter your name at the top.' };
  const note = reason.trim();
  if (!note) return { ok: false, error: 'Enter a reason for the exception handover.' };

  if (!isFirebaseConfigured()) {
    const existing = demoGetPinHash();
    if (!existing) return { ok: false, error: 'No admin PIN is set yet.' };
    if (!(await verifyPin(pin.trim(), existing))) {
      return { ok: false, error: 'Incorrect admin PIN.' };
    }
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

  return callMutation('exceptionHandover', {
    orderId: order.id,
    operator,
    reason: note,
    pin,
  });
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

  return callMutation('cancelOrder', { orderId: order.id, operator });
}

export async function reopenOrder(
  orderId: string,
  operator: string,
  pin: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = orderId.trim().toUpperCase();
  if (!id) return { ok: false, error: 'Enter an order ID.' };
  if (!operator.trim()) return { ok: false, error: 'Enter your name at the top.' };

  if (!isFirebaseConfigured()) {
    const existingPin = demoGetPinHash();
    if (!existingPin) return { ok: false, error: 'No admin PIN is set yet.' };
    if (!(await verifyPin(pin.trim(), existingPin))) {
      return { ok: false, error: 'Incorrect admin PIN.' };
    }
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

  return callMutation('reopenOrder', { orderId: id, operator, pin });
}

export async function deleteOrderAdmin(
  orderId: string,
  operator: string,
  pin: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = orderId.trim().toUpperCase();
  if (!id) return { ok: false, error: 'Enter an order ID.' };
  if (!operator.trim()) return { ok: false, error: 'Enter your name at the top.' };

  if (!isFirebaseConfigured()) {
    const existingPin = demoGetPinHash();
    if (!existingPin) return { ok: false, error: 'No admin PIN is set yet.' };
    if (!(await verifyPin(pin.trim(), existingPin))) {
      return { ok: false, error: 'Incorrect admin PIN.' };
    }
    const existing = demoGetOrders().find((o) => o.id === id);
    if (!existing) return { ok: false, error: 'Order not found.' };
    demoDeleteOrder(id);
    demoLogEvent('removed', id, operator.trim(), existing.department);
    return { ok: true };
  }

  return callMutation('deleteOrderAdmin', { orderId: id, operator, pin });
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

  try {
    return await callTyped('sendLookup', { orderId: id, operator });
  } catch (err) {
    return { ok: false, error: toUserError(err, 'Could not send lookup.') };
  }
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

  await callMutation('updateLookupStatus', { lookupId, status, operator, orderId });
}

export async function respondToLookup(
  lookup: Lookup,
  department: Department,
  response: LookupResponse,
  operator: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!operator.trim()) return { ok: false, error: 'Enter your name at the top.' };

  if (!isFirebaseConfigured()) {
    try {
      // Atomic-enough for single-tab demo: merge against latest store copy.
      const latest = demoGetLookups().find((l) => l.id === lookup.id) ?? lookup;
      const departments = demoGetDepartments();
      const next = withLookupResponse(latest, department, response, departments);
      const eventType = response === 'ours' ? 'lookup_ours' : 'lookup_not_ours';
      demoUpdateLookup(lookup.id, {
        responses: next.responses,
        status: next.status,
      });
      demoLogEvent(eventType, lookup.orderId, operator.trim(), department);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: toUserError(err, 'Could not respond.') };
    }
  }

  return callMutation('respondToLookup', {
    lookupId: lookup.id,
    department,
    response,
    operator,
  });
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

  return callMutation('resendLookup', { lookupId: lookup.id, operator });
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
