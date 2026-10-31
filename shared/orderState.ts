import { DEFAULT_DEPARTMENTS } from './types';
import type { Department, Lookup, LookupResponse, Order } from './types';

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

export function normalizeDepartments(list: unknown): Department[] {
  if (!Array.isArray(list)) return [...DEFAULT_DEPARTMENTS];
  const cleaned = list
    .map((d) => (typeof d === 'string' ? d.trim() : ''))
    .filter(Boolean);
  const unique = [...new Set(cleaned)];
  return unique.length > 0 ? unique : [...DEFAULT_DEPARTMENTS];
}

export function isKnownDepartment(
  value: string,
  departments: readonly string[] = DEFAULT_DEPARTMENTS,
): boolean {
  return departments.includes(value);
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

export function canEditReady(order: Order): boolean {
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

export function allDepartmentsNotOurs(
  lookup: Lookup,
  departments: readonly string[],
): boolean {
  return departments.every((dept) => lookup.responses?.[dept] === 'not_ours');
}

export function lookupClaimedBy(
  lookup: Lookup,
  departments: readonly string[],
): Department[] {
  return departments.filter((dept) => lookup.responses?.[dept] === 'ours');
}

export function withLookupResponse(
  lookup: Lookup,
  department: Department,
  response: LookupResponse,
  _departments: readonly string[],
): Lookup {
  // Keep status open when every department says not_ours so dock / gate still
  // sees the result and can dismiss it. Departments already answered, so their
  // banners disappear via lookupNeedsDepartment.
  void _departments;
  return {
    ...lookup,
    responses: { ...lookup.responses, [department]: response },
  };
}

export function lookupDockStatusLabel(
  lookup: Lookup,
  departments: readonly string[],
): string {
  const claimed = lookupClaimedBy(lookup, departments);
  if (claimed.length > 0) return `Claimed by ${claimed.join(', ')}`;
  if (allDepartmentsNotOurs(lookup, departments)) {
    return 'All departments said not ours';
  }
  const passed = departments.filter((d) => lookup.responses?.[d] === 'not_ours');
  if (passed.length > 0) return `${passed.join(', ')} said not ours`;
  return 'No department has answered yet';
}

/** Lookups the dock / gate should still see, including recent all-not-ours results. */
export function dockRelevantLookups(
  lookups: Lookup[],
  departments: readonly string[],
  now = Date.now(),
): Lookup[] {
  return lookups
    .filter((l) => {
      if (l.status === 'open') return true;
      return (
        l.status === 'closed' &&
        allDepartmentsNotOurs(l, departments) &&
        now - l.at <= SHIFT_MS
      );
    })
    .sort((a, b) => b.at - a.at);
}

export function resolvePalletCount(pallets: number | undefined): number {
  if (!Number.isFinite(pallets) || pallets === undefined || pallets < 1) return 1;
  return Math.floor(pallets);
}

export function readyEditNote(pallets: number, bay?: string, collectionDate?: string): string {
  const parts = [`${pallets} plt`];
  if (bay) parts.push(`Bay ${bay}`);
  if (collectionDate) parts.push(`collect ${collectionDate}`);
  return parts.join(' · ');
}
