import { describe, expect, it } from 'vitest';
import { isFirebaseConfigured } from '../lib/firebase';

describe('isFirebaseConfigured', () => {
  it('is true when Vitest/Vite loads the local Firebase web env', () => {
    // Local Cloud Agent / developer .env (and committed .env.production for builds)
    // must be present for warehouse prod — otherwise the SPA falls into demo mode.
    expect(isFirebaseConfigured()).toBe(true);
  });
});
