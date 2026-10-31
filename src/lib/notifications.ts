const BASE_TITLE = 'FreightFetch';

export function updateTabTitle(waitingCount: number): void {
  if (typeof document === 'undefined') return;
  document.title =
    waitingCount > 0 ? `(${waitingCount}) ${BASE_TITLE}` : BASE_TITLE;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.requestPermission();
}

export function showBrowserNotification(title: string, body: string): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body });
  } catch {
    // Ignore — some browsers block without service worker
  }
}
