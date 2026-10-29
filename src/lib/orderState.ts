import { DEPARTMENTS } from '../types';
import type { Department, Lookup, LookupResponse, Order } from '../types';

export const SHIFT_MS = 8 * 60 * 60 * 1000;
export const STALE_WAIT_MS = 15 * 60 * 1000;

export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserFacingError';
  }
}

export function toUserError(err: unknown, fallback = 'Save failed.'): string {
  if (err instanceof UserFacingError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export function markReadyConflict(
  existing: Order | undefined,
  department: Department,
): string | null {
  if (!existing || existing.status === 'cancelled') return null;
  if (existing.status === 'collected') return 'This order was already collected.';
  if (existing.department !== department) return 'already in use';
  return 'This order is already on the ready list.';
}

export function canAcknowledge(order: Order): boolean {
  return order.status === 'arrived' && !order.ackBy;
}

export function canConfirmHandover(order: Order): boolean {
  return order.status === 'arrived' && Boolean(order.ackBy);
}

export function canExceptionHandover(order: Order): boolean {
  return order.status === 'arrived';
}

export function canUndoDriverCollection(order: Order): boolean {
  return order.status === 'arrived';
}

export function canCancelReady(order: Order): boolean {
  return order.status === 'ready';
}

export function isLiveStatus(status: Order['status']): boolean {
  return status === 'ready' || status === 'arrived';
}

export function lookupResponseFor(
  lookup: Lookup,
  department: Department,
): LookupResponse | undefined {
  return lookup.responses?.[department];
}

export function lookupNeedsDepartment(lookup: Lookup, department: Department): boolean {
  return lookup.status === 'open' && !lookupResponseFor(lookup, department);
}

export function allDepartmentsNotOurs(lookup: Lookup): boolean {
  return DEPARTMENTS.every((dept) => lookup.responses?.[dept] === 'not_ours');
}

export function lookupClaimedBy(lookup: Lookup): Department[] {
  return DEPARTMENTS.filter((dept) => lookup.responses?.[dept] === 'ours');
}

export function withLookupResponse(
  lookup: Lookup,
  department: Department,
  response: LookupResponse,
): Lookup {
  const responses = { ...lookup.responses, [department]: response };
  const next: Lookup = { ...lookup, responses };
  if (response === 'not_ours' && allDepartmentsNotOurs(next)) {
    next.status = 'closed';
  }
  return next;
}
