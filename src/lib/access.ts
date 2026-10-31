import type { DeviceRole } from '../types';

/**
 * Collected list access: admin and every department PC.
 * Dock / gate keeps collected orders off its board (ready list only).
 */
export function canAccessCollectedList(role: DeviceRole): boolean {
  return role !== 'dock';
}
