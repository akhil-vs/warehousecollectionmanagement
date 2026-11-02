import { describe, expect, it } from 'vitest';
import {
  REASSIGN_AUTH_MS,
  isReassignAuthValid,
  roleLabel,
} from '../lib/reassignAuth';

describe('reassignAuth', () => {
  it('rejects missing or zero timestamps', () => {
    expect(isReassignAuthValid(0, 1_000)).toBe(false);
    expect(isReassignAuthValid(-1, 1_000)).toBe(false);
  });

  it('accepts authorization within the handoff window', () => {
    const at = 10_000;
    expect(isReassignAuthValid(at, at)).toBe(true);
    expect(isReassignAuthValid(at, at + REASSIGN_AUTH_MS)).toBe(true);
  });

  it('expires after the handoff window', () => {
    const at = 10_000;
    expect(isReassignAuthValid(at, at + REASSIGN_AUTH_MS + 1)).toBe(false);
  });

  it('labels device roles for operators', () => {
    expect(roleLabel('admin')).toBe('Admin');
    expect(roleLabel('dock')).toBe('Dock / Gate');
    expect(roleLabel('B2B')).toBe('Dept · B2B');
  });
});
