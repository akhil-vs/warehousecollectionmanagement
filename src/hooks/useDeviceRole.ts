import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DeviceRole } from '../types';
import { DEPARTMENTS } from '../types';
import { getAdminPinHash, setAdminPinHash } from '../lib/ordersApi';
import { hashPin, verifyPin } from '../lib/pin';
import { SHIFT_MS } from '../lib/orderState';
import { useNow } from './useNow';

const ROLE_KEY = 'wc_device_role';
const OPERATOR_KEY = 'wc_operator_name';
const CONFIRMED_NAME_KEY = 'wc_operator_confirmed_name';
const CONFIRMED_AT_KEY = 'wc_operator_confirmed_at';

export function isDepartmentRole(role: DeviceRole | null): role is (typeof DEPARTMENTS)[number] {
  return role === 'B2B' || role === 'Therabody';
}

export function useDeviceRole() {
  const [role, setRoleState] = useState<DeviceRole | null>(() => {
    const saved = localStorage.getItem(ROLE_KEY);
    if (saved === 'admin' || saved === 'dock' || saved === 'B2B' || saved === 'Therabody') {
      return saved;
    }
    return null;
  });
  const [operator, setOperatorState] = useState(() => localStorage.getItem(OPERATOR_KEY) || '');
  const [confirmedName, setConfirmedName] = useState(
    () => localStorage.getItem(CONFIRMED_NAME_KEY) || '',
  );
  const [confirmedAt, setConfirmedAt] = useState(() => {
    const raw = localStorage.getItem(CONFIRMED_AT_KEY);
    return raw ? Number(raw) : 0;
  });
  const [pinConfigured, setPinConfigured] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const now = useNow(60_000);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const hash = await getAdminPinHash();
        if (!cancelled) setPinConfigured(Boolean(hash));
      } catch {
        if (!cancelled) setPinConfigured(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setOperator = useCallback((name: string) => {
    setOperatorState(name);
    localStorage.setItem(OPERATOR_KEY, name);
  }, []);

  const confirmShift = useCallback(() => {
    const name = operator.trim();
    if (!name) {
      setError('Enter your name at the top first.');
      return false;
    }
    const at = Date.now();
    setConfirmedName(name);
    setConfirmedAt(at);
    localStorage.setItem(CONFIRMED_NAME_KEY, name);
    localStorage.setItem(CONFIRMED_AT_KEY, String(at));
    setError(null);
    return true;
  }, [operator]);

  const shiftStale = useMemo(() => {
    const name = operator.trim();
    if (!name) return true;
    if (name !== confirmedName.trim()) return true;
    if (!confirmedAt) return true;
    return now - confirmedAt > SHIFT_MS;
  }, [operator, confirmedName, confirmedAt, now]);

  const assignRole = useCallback(async (nextRole: DeviceRole, pin: string) => {
    setBusy(true);
    setError(null);
    try {
      const existing = await getAdminPinHash();
      if (!existing) {
        if (pin.trim().length < 4) {
          setError('Choose an admin PIN with at least 4 digits.');
          return false;
        }
        const hash = await hashPin(pin.trim());
        await setAdminPinHash(hash);
        setPinConfigured(true);
      } else {
        const ok = await verifyPin(pin.trim(), existing);
        if (!ok) {
          setError('Incorrect admin PIN.');
          return false;
        }
      }
      localStorage.setItem(ROLE_KEY, nextRole);
      setRoleState(nextRole);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not assign this device.');
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const changePin = useCallback(async (currentPin: string, nextPin: string) => {
    setBusy(true);
    setError(null);
    try {
      const existing = await getAdminPinHash();
      if (!existing) {
        setError('No admin PIN is set yet.');
        return false;
      }
      const ok = await verifyPin(currentPin.trim(), existing);
      if (!ok) {
        setError('Current PIN is incorrect.');
        return false;
      }
      if (nextPin.trim().length < 4) {
        setError('New PIN must be at least 4 characters.');
        return false;
      }
      await setAdminPinHash(await hashPin(nextPin.trim()));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change PIN.');
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const clearRole = useCallback(() => {
    localStorage.removeItem(ROLE_KEY);
    setRoleState(null);
  }, []);

  const reassignWithPin = useCallback(async (pin: string) => {
    setBusy(true);
    setError(null);
    try {
      const existing = await getAdminPinHash();
      if (!existing) {
        clearRole();
        return true;
      }
      const ok = await verifyPin(pin.trim(), existing);
      if (!ok) {
        setError('Incorrect admin PIN.');
        return false;
      }
      clearRole();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reassign this device.');
      return false;
    } finally {
      setBusy(false);
    }
  }, [clearRole]);

  return {
    role,
    operator,
    setOperator,
    confirmShift,
    shiftStale,
    pinConfigured,
    busy,
    error,
    setError,
    assignRole,
    changePin,
    clearRole,
    reassignWithPin,
  };
}
