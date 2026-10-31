import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, type DocumentData } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import { parseDateInput } from '../../shared/dates';
import {
  UserFacingError,
  markReadyConflict,
  normalizeDepartments,
  isKnownDepartment,
  resolvePalletCount,
  readyEditNote,
  withLookupResponse,
  toUserError,
} from '../../shared/orderState';
import { hashPin, verifyPin } from '../../shared/pin';
import { DEFAULT_DEPARTMENTS } from '../../shared/types';
import type {
  Department,
  EventType,
  Lookup,
  LookupResponse,
  LookupStatus,
  Order,
  OrderStatus,
} from '../../shared/types';

setGlobalOptions({ region: 'europe-west2', maxInstances: 20 });
initializeApp();

const db = getFirestore();

type Ok = { ok: true };
type Fail = { ok: false; error: string };

function requireAuth(uid: string | undefined): string {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  return uid;
}

function requireOperator(operator: unknown): string {
  if (typeof operator !== 'string' || !operator.trim()) {
    throw new UserFacingError('Enter your name at the top.');
  }
  return operator.trim();
}

function mapOrder(id: string, data: DocumentData): Order {
  return {
    id,
    status: data.status as OrderStatus,
    pallets: Number(data.pallets),
    bay: data.bay ? String(data.bay) : undefined,
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

function mapLookup(id: string, data: DocumentData): Lookup {
  return {
    id,
    orderId: String(data.orderId),
    sentBy: String(data.sentBy),
    at: Number(data.at),
    status: data.status as LookupStatus,
    responses: (data.responses as Lookup['responses']) || {},
  };
}

async function loadDepartments(): Promise<Department[]> {
  const snap = await db.doc('config/settings').get();
  if (!snap.exists) return [...DEFAULT_DEPARTMENTS];
  return normalizeDepartments(snap.data()?.departments);
}

async function logEvent(
  type: EventType,
  orderId: string,
  operator: string,
  department?: Department | string,
  note?: string,
): Promise<void> {
  await db.collection('events').add({
    type,
    orderId,
    operator,
    department: department ?? null,
    at: Date.now(),
    note: note ?? null,
  });
}

async function requireAdminPin(pin: unknown): Promise<void> {
  if (typeof pin !== 'string' || !pin.trim()) {
    throw new UserFacingError('Admin PIN required.');
  }
  const snap = await db.doc('config/admin').get();
  const hash = snap.exists ? (snap.data()?.pinHash as string | undefined) : undefined;
  if (!hash) throw new UserFacingError('No admin PIN is set yet.');
  const ok = await verifyPin(pin.trim(), hash);
  if (!ok) throw new UserFacingError('Incorrect admin PIN.');
}

function wrap<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((err) => {
    if (err instanceof HttpsError) throw err;
    const message = toUserError(err, 'Request failed.');
    throw new HttpsError('failed-precondition', message);
  });
}

function ok(): Ok {
  return { ok: true };
}

function fail(error: string): Fail {
  return { ok: false, error };
}

export const getBootstrapState = onCall(async (request) => {
  requireAuth(request.auth?.uid);
  return wrap(async () => {
    const [adminSnap, departments] = await Promise.all([
      db.doc('config/admin').get(),
      loadDepartments(),
    ]);
    const pinConfigured = Boolean(adminSnap.exists && adminSnap.data()?.pinHash);
    return { pinConfigured, departments };
  });
});

export const bootstrapAdminPin = onCall(async (request) => {
  requireAuth(request.auth?.uid);
  return wrap(async () => {
    const pin = typeof request.data?.pin === 'string' ? request.data.pin.trim() : '';
    if (pin.length < 4) return fail('Choose an admin PIN with at least 4 characters.');
    const ref = db.doc('config/admin');
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists && snap.data()?.pinHash) {
        throw new UserFacingError('Admin PIN is already configured.');
      }
      tx.set(ref, { pinHash: await hashPin(pin) }, { merge: true });
    });
    return ok();
  });
});

export const verifyAdminPin = onCall(async (request) => {
  requireAuth(request.auth?.uid);
  return wrap(async () => {
    try {
      await requireAdminPin(request.data?.pin);
      return ok();
    } catch (err) {
      return fail(toUserError(err, 'Incorrect admin PIN.'));
    }
  });
});

export const changeAdminPin = onCall(async (request) => {
  requireAuth(request.auth?.uid);
  return wrap(async () => {
    const current = typeof request.data?.currentPin === 'string' ? request.data.currentPin : '';
    const next = typeof request.data?.nextPin === 'string' ? request.data.nextPin.trim() : '';
    if (next.length < 4) return fail('New PIN must be at least 4 characters.');
    await requireAdminPin(current);
    await db.doc('config/admin').set({ pinHash: await hashPin(next) }, { merge: true });
    return ok();
  });
});

export const setDepartments = onCall(async (request) => {
  requireAuth(request.auth?.uid);
  return wrap(async () => {
    await requireAdminPin(request.data?.pin);
    const departments = normalizeDepartments(request.data?.departments);
    await db.doc('config/settings').set({ departments }, { merge: true });
    return { ok: true as const, departments };
  });
});

async function closeOpenLookups(orderId: string, operator: string): Promise<void> {
  const q = await db
    .collection('lookups')
    .where('orderId', '==', orderId)
    .where('status', '==', 'open')
    .get();
  for (const doc of q.docs) {
    await doc.ref.update({ status: 'found' });
    await logEvent('lookup_found', orderId, operator);
  }
}

export const markOrderReady = onCall(async (request) => {
  requireAuth(request.auth?.uid);
  return wrap(async () => {
    const data = request.data ?? {};
    const id = typeof data.orderId === 'string' ? data.orderId.trim().toUpperCase() : '';
    if (!id) return fail('Enter an order ID.');
    const operator = requireOperator(data.operator);
    const departments = await loadDepartments();
    const department = typeof data.department === 'string' ? data.department.trim() : '';
    if (!isKnownDepartment(department, departments)) {
      return fail('Unknown department.');
    }
    const pallets = resolvePalletCount(
      typeof data.pallets === 'number' ? data.pallets : Number(data.pallets),
    );
    const collectionDate =
      typeof data.collectionDate === 'string' ? parseDateInput(data.collectionDate) : undefined;
    if (data.collectionDate && String(data.collectionDate).trim() && !collectionDate) {
      return fail('Enter a valid collection date.');
    }
    const bay = typeof data.bay === 'string' && data.bay.trim() ? data.bay.trim() : undefined;

    await db.runTransaction(async (tx) => {
      const ref = db.collection('orders').doc(id);
      const snap = await tx.get(ref);
      const existing = snap.exists ? mapOrder(snap.id, snap.data()!) : undefined;
      const conflict = markReadyConflict(existing, department);
      if (conflict) throw new UserFacingError(conflict);
      tx.set(ref, {
        status: 'ready',
        pallets,
        bay: bay || null,
        collectionDate: collectionDate || null,
        department,
        readyBy: operator,
        readyAt: Date.now(),
      });
    });
    await logEvent('ready', id, operator, department);
    await closeOpenLookups(id, operator);
    return ok();
  });
});

export const updateReadyOrder = onCall(async (request) => {
  requireAuth(request.auth?.uid);
  return wrap(async () => {
    const data = request.data ?? {};
    const id = typeof data.orderId === 'string' ? data.orderId.trim().toUpperCase() : '';
    if (!id) return fail('Enter an order ID.');
    const operator = requireOperator(data.operator);
    const pallets = Number(data.pallets);
    if (!Number.isFinite(pallets) || pallets < 1) {
      return fail('Pallet count must be at least 1.');
    }
    const floor = Math.floor(pallets);
    const collectionDate =
      typeof data.collectionDate === 'string' ? parseDateInput(data.collectionDate) : undefined;
    if (data.collectionDate && String(data.collectionDate).trim() && !collectionDate) {
      return fail('Enter a valid collection date.');
    }
    const bay = typeof data.bay === 'string' && data.bay.trim() ? data.bay.trim() : undefined;
    const note = readyEditNote(floor, bay, collectionDate);
    let department: Department = '';

    await db.runTransaction(async (tx) => {
      const ref = db.collection('orders').doc(id);
      const snap = await tx.get(ref);
      if (!snap.exists) throw new UserFacingError('Order not found.');
      const existing = mapOrder(snap.id, snap.data()!);
      if (existing.status !== 'ready') {
        throw new UserFacingError('Only ready orders can be edited.');
      }
      department = existing.department;
      tx.update(ref, {
        pallets: floor,
        bay: bay || FieldValue.delete(),
        collectionDate: collectionDate || FieldValue.delete(),
      });
    });
    await logEvent('updated', id, operator, department, note);
    return ok();
  });
});

export const driverCollection = onCall(async (request) => {
  requireAuth(request.auth?.uid);
  return wrap(async () => {
    const data = request.data ?? {};
    const id = typeof data.orderId === 'string' ? data.orderId.trim().toUpperCase() : '';
    if (!id) return fail('Enter an order ID.');
    const operator = requireOperator(data.operator);
    const door = typeof data.door === 'string' && data.door.trim() ? data.door.trim() : undefined;
    const haulier =
      typeof data.haulier === 'string' && data.haulier.trim() ? data.haulier.trim() : undefined;
    let department: Department = '';

    await db.runTransaction(async (tx) => {
      const ref = db.collection('orders').doc(id);
      const snap = await tx.get(ref);
      if (!snap.exists) throw new UserFacingError('Order not found.');
      const existing = mapOrder(snap.id, snap.data()!);
      if (existing.status !== 'ready') {
        throw new UserFacingError('Order is not ready for collection.');
      }
      department = existing.department;
      tx.update(ref, {
        status: 'arrived',
        arrivedBy: operator,
        arrivedAt: Date.now(),
        ackBy: FieldValue.delete(),
        door: door || FieldValue.delete(),
        haulier: haulier || FieldValue.delete(),
        exceptionReason: FieldValue.delete(),
      });
    });
    await logEvent('driver_collection', id, operator, department);
    return ok();
  });
});

export const undoDriverCollection = onCall(async (request) => {
  requireAuth(request.auth?.uid);
  return wrap(async () => {
    const data = request.data ?? {};
    const id = typeof data.orderId === 'string' ? data.orderId.trim().toUpperCase() : '';
    if (!id) return fail('Enter an order ID.');
    const operator = requireOperator(data.operator);
    let department: Department = '';

    await db.runTransaction(async (tx) => {
      const ref = db.collection('orders').doc(id);
      const snap = await tx.get(ref);
      if (!snap.exists) throw new UserFacingError('Order not found.');
      const existing = mapOrder(snap.id, snap.data()!);
      if (existing.status !== 'arrived') {
        throw new UserFacingError('Order is not awaiting handover.');
      }
      department = existing.department;
      tx.update(ref, {
        status: 'ready',
        arrivedBy: FieldValue.delete(),
        arrivedAt: FieldValue.delete(),
        ackBy: FieldValue.delete(),
        door: FieldValue.delete(),
        haulier: FieldValue.delete(),
      });
    });
    await logEvent('driver_collection_cancelled', id, operator, department);
    return ok();
  });
});

export const acknowledgeOrder = onCall(async (request) => {
  requireAuth(request.auth?.uid);
  return wrap(async () => {
    const data = request.data ?? {};
    const id = typeof data.orderId === 'string' ? data.orderId.trim().toUpperCase() : '';
    if (!id) return fail('Enter an order ID.');
    const operator = requireOperator(data.operator);
    let alreadyAcked = false;
    let department: Department = '';

    await db.runTransaction(async (tx) => {
      const ref = db.collection('orders').doc(id);
      const snap = await tx.get(ref);
      if (!snap.exists) throw new UserFacingError('Order not found.');
      const existing = mapOrder(snap.id, snap.data()!);
      if (existing.status !== 'arrived') {
        throw new UserFacingError('No driver waiting on this order.');
      }
      department = existing.department;
      if (existing.ackBy) {
        alreadyAcked = true;
        return;
      }
      tx.update(ref, { ackBy: operator });
    });
    if (!alreadyAcked) await logEvent('acknowledged', id, operator, department);
    return ok();
  });
});

export const confirmHandover = onCall(async (request) => {
  requireAuth(request.auth?.uid);
  return wrap(async () => {
    const data = request.data ?? {};
    const id = typeof data.orderId === 'string' ? data.orderId.trim().toUpperCase() : '';
    if (!id) return fail('Enter an order ID.');
    const operator = requireOperator(data.operator);
    let department: Department = '';

    await db.runTransaction(async (tx) => {
      const ref = db.collection('orders').doc(id);
      const snap = await tx.get(ref);
      if (!snap.exists) throw new UserFacingError('Order not found.');
      const existing = mapOrder(snap.id, snap.data()!);
      if (existing.status !== 'arrived') {
        throw new UserFacingError('Order is not awaiting handover.');
      }
      if (!existing.ackBy) throw new UserFacingError('Acknowledge the driver first.');
      department = existing.department;
      tx.update(ref, {
        status: 'collected',
        collectedBy: operator,
        collectedAt: Date.now(),
      });
    });
    await logEvent('collected', id, operator, department);
    return ok();
  });
});

export const exceptionHandover = onCall(async (request) => {
  requireAuth(request.auth?.uid);
  return wrap(async () => {
    const data = request.data ?? {};
    const id = typeof data.orderId === 'string' ? data.orderId.trim().toUpperCase() : '';
    if (!id) return fail('Enter an order ID.');
    const operator = requireOperator(data.operator);
    await requireAdminPin(data.pin);
    const note = typeof data.reason === 'string' ? data.reason.trim() : '';
    if (!note) return fail('Enter a reason for the exception handover.');
    let department: Department = '';

    await db.runTransaction(async (tx) => {
      const ref = db.collection('orders').doc(id);
      const snap = await tx.get(ref);
      if (!snap.exists) throw new UserFacingError('Order not found.');
      const existing = mapOrder(snap.id, snap.data()!);
      if (existing.status !== 'arrived') {
        throw new UserFacingError('Order is not awaiting handover.');
      }
      department = existing.department;
      tx.update(ref, {
        status: 'collected',
        collectedBy: operator,
        collectedAt: Date.now(),
        exceptionReason: note,
      });
    });
    await logEvent('handover_exception', id, operator, department, note);
    await logEvent('collected', id, operator, department, note);
    return ok();
  });
});

export const cancelOrder = onCall(async (request) => {
  requireAuth(request.auth?.uid);
  return wrap(async () => {
    const data = request.data ?? {};
    const id = typeof data.orderId === 'string' ? data.orderId.trim().toUpperCase() : '';
    if (!id) return fail('Enter an order ID.');
    const operator = requireOperator(data.operator);
    let department: Department = '';

    await db.runTransaction(async (tx) => {
      const ref = db.collection('orders').doc(id);
      const snap = await tx.get(ref);
      if (!snap.exists) throw new UserFacingError('Order not found.');
      const existing = mapOrder(snap.id, snap.data()!);
      if (existing.status !== 'ready') {
        throw new UserFacingError('Only ready orders can be cancelled.');
      }
      department = existing.department;
      tx.update(ref, {
        status: 'cancelled',
        cancelledBy: operator,
        cancelledAt: Date.now(),
      });
    });
    await logEvent('cancelled', id, operator, department);
    return ok();
  });
});

export const reopenOrder = onCall(async (request) => {
  requireAuth(request.auth?.uid);
  return wrap(async () => {
    const data = request.data ?? {};
    const id = typeof data.orderId === 'string' ? data.orderId.trim().toUpperCase() : '';
    if (!id) return fail('Enter an order ID.');
    const operator = requireOperator(data.operator);
    await requireAdminPin(data.pin);
    let department: Department = '';

    await db.runTransaction(async (tx) => {
      const ref = db.collection('orders').doc(id);
      const snap = await tx.get(ref);
      if (!snap.exists) throw new UserFacingError('Order not found.');
      const existing = mapOrder(snap.id, snap.data()!);
      department = existing.department;
      tx.update(ref, {
        status: 'ready',
        arrivedBy: FieldValue.delete(),
        arrivedAt: FieldValue.delete(),
        ackBy: FieldValue.delete(),
        collectedBy: FieldValue.delete(),
        collectedAt: FieldValue.delete(),
        door: FieldValue.delete(),
        haulier: FieldValue.delete(),
        exceptionReason: FieldValue.delete(),
        cancelledBy: FieldValue.delete(),
        cancelledAt: FieldValue.delete(),
      });
    });
    await logEvent('reopened', id, operator, department);
    return ok();
  });
});

export const deleteOrderAdmin = onCall(async (request) => {
  requireAuth(request.auth?.uid);
  return wrap(async () => {
    const data = request.data ?? {};
    const id = typeof data.orderId === 'string' ? data.orderId.trim().toUpperCase() : '';
    if (!id) return fail('Enter an order ID.');
    const operator = requireOperator(data.operator);
    await requireAdminPin(data.pin);

    await db.runTransaction(async (tx) => {
      const ref = db.collection('orders').doc(id);
      const snap = await tx.get(ref);
      if (!snap.exists) throw new UserFacingError('Order not found.');
      const existing = mapOrder(snap.id, snap.data()!);
      tx.delete(ref);
      const eventRef = db.collection('events').doc();
      tx.set(eventRef, {
        type: 'removed',
        orderId: id,
        operator,
        department: existing.department,
        at: Date.now(),
        note: null,
      });
    });
    return ok();
  });
});

export const sendLookup = onCall(async (request) => {
  requireAuth(request.auth?.uid);
  return wrap(async () => {
    const data = request.data ?? {};
    const id = typeof data.orderId === 'string' ? data.orderId.trim().toUpperCase() : '';
    if (!id) return fail('Enter an order ID.');
    const operator = requireOperator(data.operator);
    const ref = await db.collection('lookups').add({
      orderId: id,
      sentBy: operator,
      at: Date.now(),
      status: 'open',
      responses: {},
    });
    await logEvent('lookup_sent', id, operator);
    return {
      ok: true as const,
      lookup: {
        id: ref.id,
        orderId: id,
        sentBy: operator,
        at: Date.now(),
        status: 'open' as const,
        responses: {},
      },
    };
  });
});

export const updateLookupStatus = onCall(async (request) => {
  requireAuth(request.auth?.uid);
  return wrap(async () => {
    const data = request.data ?? {};
    const lookupId = typeof data.lookupId === 'string' ? data.lookupId : '';
    const status = data.status as LookupStatus;
    const operator = requireOperator(data.operator);
    const orderId = typeof data.orderId === 'string' ? data.orderId : undefined;
    if (!lookupId) return fail('Missing lookup.');
    if (status !== 'open' && status !== 'found' && status !== 'closed') {
      return fail('Invalid lookup status.');
    }
    await db.collection('lookups').doc(lookupId).update({ status });
    if (status === 'closed' && orderId) await logEvent('lookup_closed', orderId, operator);
    if (status === 'found' && orderId) await logEvent('lookup_found', orderId, operator);
    return ok();
  });
});

export const respondToLookup = onCall(async (request) => {
  requireAuth(request.auth?.uid);
  return wrap(async () => {
    const data = request.data ?? {};
    const lookupId = typeof data.lookupId === 'string' ? data.lookupId : '';
    const department = typeof data.department === 'string' ? data.department.trim() : '';
    const response = data.response as LookupResponse;
    const operator = requireOperator(data.operator);
    if (!lookupId) return fail('Missing lookup.');
    if (response !== 'ours' && response !== 'not_ours') return fail('Invalid response.');
    const departments = await loadDepartments();
    if (!isKnownDepartment(department, departments)) return fail('Unknown department.');

    let orderId = '';
    const eventType: EventType = response === 'ours' ? 'lookup_ours' : 'lookup_not_ours';

    await db.runTransaction(async (tx) => {
      const ref = db.collection('lookups').doc(lookupId);
      const snap = await tx.get(ref);
      if (!snap.exists) throw new UserFacingError('Lookup not found.');
      const existing = mapLookup(snap.id, snap.data()!);
      orderId = existing.orderId;
      const next = withLookupResponse(existing, department, response, departments);
      tx.update(ref, {
        responses: next.responses ?? {},
        status: next.status,
      });
    });

    await logEvent(eventType, orderId, operator, department);
    return ok();
  });
});

export const resendLookup = onCall(async (request) => {
  requireAuth(request.auth?.uid);
  return wrap(async () => {
    const data = request.data ?? {};
    const lookupId = typeof data.lookupId === 'string' ? data.lookupId : '';
    const operator = requireOperator(data.operator);
    if (!lookupId) return fail('Missing lookup.');
    const ref = db.collection('lookups').doc(lookupId);
    const snap = await ref.get();
    if (!snap.exists) return fail('Lookup not found.');
    const existing = mapLookup(snap.id, snap.data()!);
    await ref.update({
      at: Date.now(),
      sentBy: operator,
      status: 'open',
      responses: {},
    });
    await logEvent('lookup_sent', existing.orderId, operator);
    return ok();
  });
});
