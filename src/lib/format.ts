export function formatTime(ts?: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function statusLabel(status: string): string {
  switch (status) {
    case 'ready':
      return 'Ready';
    case 'arrived':
      return 'Driver waiting';
    case 'collected':
      return 'Collected';
    default:
      return status;
  }
}
