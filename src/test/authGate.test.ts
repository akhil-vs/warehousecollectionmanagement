import { describe, expect, it } from 'vitest';
import { isFirebaseConfigured } from '../lib/firebase';

/**
 * Warehouse reads require Anonymous Auth (firestore.rules: signedIn()).
 * App must finish ensureAnonymousAuth before mounting useWarehouseData /
 * useDepartments listeners — otherwise onSnapshot fails once with
 * permission-denied and the UI stays empty while Firestore still has rows.
 */
describe('Firebase data path', () => {
  it('uses Firebase (not in-browser demo store) when configured', () => {
    expect(isFirebaseConfigured()).toBe(true);
  });
});
