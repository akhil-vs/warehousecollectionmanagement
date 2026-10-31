/**
 * In-memory fallback when Firebase env vars are missing.
 * Lets the UI be exercised locally; data is not shared across computers.
 */
import type {
  AppEvent,
  Department,
  Lookup,
  LookupStatus,
  Order,
  OrderStatus,
  EventType,
  LookupResponse,
} from '../types';
import { DEFAULT_DEPARTMENTS } from '../types';
import { normalizeDepartments } from './orderState';

type Listener = () => void;

let orders = new Map<string, Order>();
let events: AppEvent[] = [];
let lookups: Lookup[] = [];
let pinHash: string | null = null;
let departments: Department[] = [...DEFAULT_DEPARTMENTS];
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
}

export function subscribeDemo(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function demoGetOrders(): Order[] {
  return Array.from(orders.values());
}

export function demoGetEvents(): AppEvent[] {
  return [...events].sort((a, b) => b.at - a.at);
}

export function demoGetLookups(): Lookup[] {
  return [...lookups].sort((a, b) => b.at - a.at);
}

export function demoGetPinHash(): string | null {
  return pinHash;
}

export function demoSetPinHash(hash: string): void {
  pinHash = hash;
  emit();
}

export function demoGetDepartments(): Department[] {
  return [...departments];
}

export function demoSetDepartments(next: Department[]): void {
  departments = normalizeDepartments(next);
  emit();
}

function addEvent(
  type: EventType,
  orderId: string,
  operator: string,
  department?: Department | string,
  note?: string,
): void {
  events = [
    {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type,
      orderId,
      operator,
      department,
      at: Date.now(),
      note,
    },
    ...events,
  ];
}

export function demoUpsertOrder(order: Order): void {
  orders.set(order.id, order);
  emit();
}

export function demoDeleteOrder(orderId: string): void {
  orders.delete(orderId);
  emit();
}

export function demoLogEvent(
  type: EventType,
  orderId: string,
  operator: string,
  department?: Department | string,
  note?: string,
): void {
  addEvent(type, orderId, operator, department, note);
  emit();
}

export function demoAddLookup(lookup: Omit<Lookup, 'id'>): Lookup {
  const full: Lookup = {
    ...lookup,
    id: `lk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    responses: lookup.responses ?? {},
  };
  lookups = [full, ...lookups];
  emit();
  return full;
}

export function demoUpdateLookup(
  id: string,
  patch: Partial<Pick<Lookup, 'status' | 'at' | 'sentBy' | 'responses'>>,
): void {
  lookups = lookups.map((l) => (l.id === id ? { ...l, ...patch } : l));
  emit();
}

export function demoCloseLookupsForOrder(
  orderId: string,
  status: LookupStatus = 'found',
): void {
  lookups = lookups.map((l) =>
    l.orderId === orderId && l.status === 'open' ? { ...l, status } : l,
  );
  emit();
}

export type { OrderStatus, LookupResponse };
