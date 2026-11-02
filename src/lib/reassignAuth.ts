/** How long a successful reassign PIN unlock may skip RoleSetup’s second PIN. */
export const REASSIGN_AUTH_MS = 5 * 60 * 1000;

export function isReassignAuthValid(authorizedAt: number, now = Date.now()): boolean {
  if (!authorizedAt || authorizedAt <= 0) return false;
  return now - authorizedAt <= REASSIGN_AUTH_MS;
}

export function roleLabel(role: string): string {
  if (role === 'admin') return 'Admin';
  if (role === 'dock') return 'Dock / Gate';
  return `Dept · ${role}`;
}
