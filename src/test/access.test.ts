import { describe, expect, it } from 'vitest';
import { canAccessCollectedList } from '../lib/access';

describe('canAccessCollectedList', () => {
  it('is available to admin', () => {
    expect(canAccessCollectedList('admin')).toBe(true);
  });

  it('is available to every department role', () => {
    expect(canAccessCollectedList('B2B')).toBe(true);
    expect(canAccessCollectedList('Therabody')).toBe(true);
    expect(canAccessCollectedList('Outbound')).toBe(true);
  });

  it('stays hidden for dock / gate', () => {
    expect(canAccessCollectedList('dock')).toBe(false);
  });
});
