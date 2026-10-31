import type { Order } from '../types';
import { STALE_WAIT_MS } from './orderState';
import { parseDateInput as parseSharedDate, todayInputValue as todayShared } from '../../shared/dates';

export function parseDateInput(value: string | undefined | null): string | undefined {
  return parseSharedDate(value);
}

export function todayInputValue(now = Date.now()): string {
  return todayShared(now);
}

/** YYYY-MM-DD for a local calendar day offset from `now` (0 = today). */
export function dateInputValueOffset(days: number, now = Date.now()): string {
  const d = new Date(now);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return todayInputValue(d.getTime());
}

export function formatTime(ts?: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDwell(fromTs: number | undefined, now = Date.now()): string {
  if (!fromTs) return '—';
  const mins = Math.max(0, Math.floor((now - fromTs) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem ? `${hours}h ${rem}m` : `${hours}h`;
}

export function isStaleWait(fromTs: number | undefined, now = Date.now()): boolean {
  if (!fromTs) return false;
  return now - fromTs >= STALE_WAIT_MS;
}

export function statusLabel(status: string): string {
  switch (status) {
    case 'ready':
      return 'Ready';
    case 'arrived':
      return 'Driver waiting';
    case 'collected':
      return 'Collected';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status;
  }
}

export function eventLabel(type: string): string {
  return type.replace(/_/g, ' ');
}

export function startOfLocalDay(now = Date.now()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function formatDate(date?: string): string {
  const parsed = parseDateInput(date);
  if (!parsed) return '—';
  const [y, m, d] = parsed.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
  });
}

export function collectionDateLabel(date: string | undefined, now = Date.now()): string | undefined {
  const parsed = parseDateInput(date);
  if (!parsed) return undefined;
  const today = todayInputValue(now);
  if (parsed === today) return 'Collect today';
  if (parsed < today) return `Collect ${formatDate(parsed)} (overdue)`;
  return `Collect ${formatDate(parsed)}`;
}

export function isCollectionOverdue(date: string | undefined, now = Date.now()): boolean {
  const parsed = parseDateInput(date);
  if (!parsed) return false;
  return parsed < todayInputValue(now);
}

export type CollectionDateKind = 'overdue' | 'today' | 'upcoming' | 'none';

export interface CollectionDateGroup {
  key: string;
  date?: string;
  kind: CollectionDateKind;
  heading: string;
  pallets: number;
  orders: Order[];
}

export function collectionDateKind(date: string | undefined, now = Date.now()): CollectionDateKind {
  const parsed = parseDateInput(date);
  if (!parsed) return 'none';
  const today = todayInputValue(now);
  if (parsed === today) return 'today';
  if (parsed < today) return 'overdue';
  return 'upcoming';
}

export function collectionDateHeading(date: string | undefined, now = Date.now()): string {
  const parsed = parseDateInput(date);
  if (!parsed) return 'No collection date';
  const pretty = formatDate(parsed);
  const kind = collectionDateKind(parsed, now);
  if (kind === 'today') return `Collect today · ${pretty}`;
  if (kind === 'overdue') return `Overdue · ${pretty}`;
  return `Collect ${pretty}`;
}

export function groupOrdersByCollectionDate(
  orders: Order[],
  now = Date.now(),
): CollectionDateGroup[] {
  const buckets = new Map<string, Order[]>();
  for (const o of orders) {
    const key = parseDateInput(o.collectionDate) ?? '';
    const list = buckets.get(key) ?? [];
    list.push(o);
    buckets.set(key, list);
  }

  const keys = [...buckets.keys()].sort((a, b) => {
    if (a === b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    return a.localeCompare(b);
  });

  return keys.map((key) => {
    const date = key || undefined;
    const list = [...(buckets.get(key) ?? [])].sort((a, b) => {
      if (a.status !== b.status) {
        if (a.status === 'arrived') return -1;
        if (b.status === 'arrived') return 1;
      }
      const aTs = a.status === 'arrived' ? (a.arrivedAt ?? 0) : a.readyAt;
      const bTs = b.status === 'arrived' ? (b.arrivedAt ?? 0) : b.readyAt;
      return bTs - aTs;
    });
    const pallets = list.reduce((n, o) => n + (Number.isFinite(o.pallets) ? o.pallets : 0), 0);
    return {
      key: key || 'none',
      date,
      kind: collectionDateKind(date, now),
      heading: collectionDateHeading(date, now),
      pallets,
      orders: list,
    };
  });
}
