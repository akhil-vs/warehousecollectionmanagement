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
