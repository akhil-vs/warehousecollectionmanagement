import { describe, expect, it } from 'vitest';
import {
  allDepartmentsNotOurs,
  canAcknowledge,
  canConfirmHandover,
  dockRelevantLookups,
  lookupClaimedBy,
  lookupDockStatusLabel,
  markReadyConflict,
  normalizeDepartments,
  JIRA_TICKET_ERROR,
  normalizeJiraTicket,
  jiraTicketDigits,
  readJiraTicket,
  parseJiraTicket,
  readyEditNote,
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
    expect(lookupDockStatusLabel(afterB2B, depts)).toBe('B2B said not ours');

    const afterBoth = withLookupResponse(afterB2B, 'Therabody', 'not_ours', depts);
    expect(allDepartmentsNotOurs(afterBoth, depts)).toBe(true);
    // Stay open so dock / gate still sees the not-ours result until they close it.
    expect(afterBoth.status).toBe('open');
    expect(lookupDockStatusLabel(afterBoth, depts)).toBe('All departments said not ours');
  });

  it('tracks claims', () => {
    const claimed = withLookupResponse(base, 'Therabody', 'ours', depts);
    expect(lookupClaimedBy(claimed, depts)).toEqual(['Therabody']);
    expect(lookupDockStatusLabel(claimed, depts)).toBe('Claimed by Therabody');
  });

  it('keeps recent all-not-ours closed lookups visible to dock', () => {
    const rejected: Lookup = {
      ...base,
      status: 'closed',
      responses: { B2B: 'not_ours', Therabody: 'not_ours' },
      at: 1_000,
    };
    const found: Lookup = { ...base, id: 'lk2', status: 'found', at: 1_000 };
    const stale: Lookup = {
      ...rejected,
      id: 'lk3',
      at: 1_000 - 9 * 60 * 60 * 1000,
    };
    const visible = dockRelevantLookups([rejected, found, stale], depts, 1_000);
    expect(visible.map((l) => l.id)).toEqual(['lk1']);
  });
});

describe('normalizeDepartments', () => {
  it('falls back to defaults and dedupes', () => {
    expect(normalizeDepartments(null)).toEqual(['B2B', 'Therabody']);
    expect(normalizeDepartments(['  Acme ', 'Acme', 'Beta'])).toEqual(['Acme', 'Beta']);
  });
});

describe('normalizeJiraTicket', () => {
  it('canonicalizes a COPS ticket number of any typical length', () => {
    expect(normalizeJiraTicket(undefined)).toBeUndefined();
    expect(normalizeJiraTicket('')).toBeUndefined();
    expect(normalizeJiraTicket('  ')).toBeUndefined();
    expect(normalizeJiraTicket('4')).toBe('COPS-4');
    expect(normalizeJiraTicket('1234')).toBe('COPS-1234');
    expect(normalizeJiraTicket(' cops-99 ')).toBe('COPS-99');
    expect(normalizeJiraTicket('COPS12345')).toBe('COPS-12345');
    expect(normalizeJiraTicket('123456')).toBe('COPS-123456');
    expect(normalizeJiraTicket(123456)).toBe('COPS-123456');
    expect(normalizeJiraTicket('COPS-1234567')).toBe('COPS-1234567');
    expect(normalizeJiraTicket('https://jira.example/browse/COPS-88')).toBe('COPS-88');
    expect(normalizeJiraTicket(']C106COPS-123456')).toBe('COPS-123456');
    expect(normalizeJiraTicket('PROJ-12')).toBeUndefined();
    expect(normalizeJiraTicket('COPS')).toBeUndefined();
    expect(normalizeJiraTicket('12345678901')).toBeUndefined();
  });
});

describe('jiraTicketDigits', () => {
  it('shows only the ticket number in the input', () => {
    expect(jiraTicketDigits('')).toBe('');
    expect(jiraTicketDigits('1234')).toBe('1234');
    expect(jiraTicketDigits('COPS-99')).toBe('99');
    expect(jiraTicketDigits('abc')).toBe('');
  });
});

describe('readJiraTicket', () => {
  it('canonicalizes COPS numbers and still displays leftover stored values', () => {
    expect(readJiraTicket(undefined)).toBeUndefined();
    expect(readJiraTicket('')).toBeUndefined();
    expect(readJiraTicket('  ')).toBeUndefined();
    expect(readJiraTicket('1234')).toBe('COPS-1234');
    expect(readJiraTicket(88)).toBe('COPS-88');
    expect(readJiraTicket('COPS-12')).toBe('COPS-12');
    expect(readJiraTicket('WH-99')).toBe('WH-99');
  });
});

describe('parseJiraTicket', () => {
  it('treats empty as optional and rejects non-numeric keys', () => {
    expect(parseJiraTicket(undefined)).toEqual({ ok: true });
    expect(parseJiraTicket('')).toEqual({ ok: true });
    expect(parseJiraTicket('1234')).toEqual({ ok: true, ticket: 'COPS-1234' });
    expect(parseJiraTicket('PROJ-12')).toEqual({ ok: false, error: JIRA_TICKET_ERROR });
  });
});

describe('readyEditNote', () => {
  it('includes optional bay, collection date, and jira ticket', () => {
    expect(readyEditNote(2)).toBe('2 plt');
    expect(readyEditNote(3, 'A1', '2026-11-10', 'WH-42')).toBe(
      '3 plt · Bay A1 · collect 2026-11-10 · Jira WH-42',
    );
  });
});
