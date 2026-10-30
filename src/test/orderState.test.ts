import { describe, expect, it } from 'vitest';
import {
  allDepartmentsNotOurs,
  canAcknowledge,
  canConfirmHandover,
  lookupClaimedBy,
  markReadyConflict,
  normalizeDepartments,
  withLookupResponse,
} from '../../shared/orderState';
import type { Lookup, Order } from '../../shared/types';

const depts = ['B2B', 'Therabody'];

function readyOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'ABC123',
    status: 'ready',
    pallets: 2,
    department: 'B2B',
    readyBy: 'Sam',
    readyAt: 1,
    ...overrides,
  };
}

describe('markReadyConflict', () => {
  it('allows fresh and cancelled orders', () => {
    expect(markReadyConflict(undefined, 'B2B')).toBeNull();
    expect(markReadyConflict(readyOrder({ status: 'cancelled' }), 'B2B')).toBeNull();
  });

  it('blocks collected and same-dept ready', () => {
    expect(markReadyConflict(readyOrder({ status: 'collected' }), 'B2B')).toMatch(/collected/i);
    expect(markReadyConflict(readyOrder(), 'B2B')).toMatch(/already on the ready list/i);
  });

  it('reports already in use across departments', () => {
    expect(markReadyConflict(readyOrder(), 'Therabody')).toBe('already in use');
  });
});

describe('handover guards', () => {
  it('requires ack before confirm', () => {
    const arrived = readyOrder({ status: 'arrived' });
    expect(canAcknowledge(arrived)).toBe(true);
    expect(canConfirmHandover(arrived)).toBe(false);
    expect(canConfirmHandover({ ...arrived, ackBy: 'Alex' })).toBe(true);
  });
});

describe('lookup responses', () => {
  const base: Lookup = {
    id: 'lk1',
    orderId: 'ABC123',
    sentBy: 'Dock',
    at: 1,
    status: 'open',
    responses: {},
  };

  it('merges department answers without dropping siblings', () => {
    const afterB2B = withLookupResponse(base, 'B2B', 'not_ours', depts);
    expect(afterB2B.responses?.B2B).toBe('not_ours');
    expect(afterB2B.status).toBe('open');

    const afterBoth = withLookupResponse(afterB2B, 'Therabody', 'not_ours', depts);
    expect(allDepartmentsNotOurs(afterBoth, depts)).toBe(true);
    expect(afterBoth.status).toBe('closed');
  });

  it('tracks claims', () => {
    const claimed = withLookupResponse(base, 'Therabody', 'ours', depts);
    expect(lookupClaimedBy(claimed, depts)).toEqual(['Therabody']);
  });
});

describe('normalizeDepartments', () => {
  it('falls back to defaults and dedupes', () => {
    expect(normalizeDepartments(null)).toEqual(['B2B', 'Therabody']);
    expect(normalizeDepartments(['  Acme ', 'Acme', 'Beta'])).toEqual(['Acme', 'Beta']);
  });
});
