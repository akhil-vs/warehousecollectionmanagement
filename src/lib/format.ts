import { STALE_WAIT_MS } from './orderState';

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

const DATE_INPUT_RE = /^\d{4}-\d{2}-\d{2}$/;

export function todayInputValue(now = Date.now()): string {
  const d = new Date(now);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDateInput(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const v = value.trim();
  if (!v) return undefined;
  if (!DATE_INPUT_RE.test(v)) return undefined;
  const [ys, ms, ds] = v.split('-');
  const y = Number(ys);
  const m = Number(ms);
  const d = Number(ds);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return undefined;
  return v;
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
