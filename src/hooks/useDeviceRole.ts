import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DeviceRole } from '../types';
import {
  bootstrapAdminPin,
  changeAdminPin,
  getBootstrapState,
  verifyAdminPin,
} from '../lib/ordersApi';
import { isReassignAuthValid } from '../lib/reassignAuth';
import { SHIFT_MS } from '../lib/orderState';
import { useNow } from './useNow';
import { useDepartments, isDepartmentRole } from './useDepartments';

export { isDepartmentRole } from './useDepartments';

const ROLE_KEY = 'wc_device_role';
const OPERATOR_KEY = 'wc_operator_name';
const CONFIRMED_NAME_KEY = 'wc_operator_confirmed_name';
const CONFIRMED_AT_KEY = 'wc_operator_confirmed_at';

function readSavedRole(): DeviceRole | null {
  const saved = localStorage.getItem(ROLE_KEY);
  if (!saved) return null;
  if (saved === 'admin' || saved === 'dock') return saved;
  return saved;
}

export function useDeviceRole() {
  const departments = useDepartments();
  const [role, setRoleState] = useState<DeviceRole | null>(() => readSavedRole());
  const [operator, setOperatorState] = useState(() => localStorage.getItem(OPERATOR_KEY) || '');
  const [confirmedName, setConfirmedName] = useState(
    () => localStorage.getItem(CONFIRMED_NAME_KEY) || '',
  );
  const [confirmedAt, setConfirmedAt] = useState(() => {
    const raw = localStorage.getItem(CONFIRMED_AT_KEY);
    return raw ? Number(raw) : 0;
  });
  const [pinConfigured, setPinConfigured] = useState<boolean | null>(null);
  const [reassignAuthorizedAt, setReassignAuthorizedAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const now = useNow(60_000);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const state = await getBootstrapState();
        if (!cancelled) setPinConfigured(state.pinConfigured);
      } catch {
        if (!cancelled) setPinConfigured(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!role || role === 'admin' || role === 'dock') return;
    if (departments.length > 0 && !departments.includes(role)) {
      // Stale department assignment after config change — force reassign.
      localStorage.removeItem(ROLE_KEY);
      setRoleState(null);
      setReassignAuthorizedAt(0);
    }
  }, [role, departments]);

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

  const reassignAuthorized = isReassignAuthValid(reassignAuthorizedAt, now);

  const clearRole = useCallback(() => {
    localStorage.removeItem(ROLE_KEY);
    setRoleState(null);
  }, []);

  const invalidateShift = useCallback(() => {
    setConfirmedName('');
    setConfirmedAt(0);
    localStorage.removeItem(CONFIRMED_NAME_KEY);
    localStorage.removeItem(CONFIRMED_AT_KEY);
  }, []);

  const assignRole = useCallback(
    async (nextRole: DeviceRole, pin: string) => {
      setBusy(true);
      setError(null);
      try {
        const state = await getBootstrapState();
        const authorized = isReassignAuthValid(reassignAuthorizedAt);

        if (!state.pinConfigured) {
          const boot = await bootstrapAdminPin(pin);
          if (!boot.ok) {
            setError(boot.error);
            return false;
          }
          setPinConfigured(true);
        } else if (!authorized) {
          const verified = await verifyAdminPin(pin);
          if (!verified.ok) {
            setError(verified.error);
            return false;
          }
        }

        if (
          nextRole !== 'admin' &&
          nextRole !== 'dock' &&
          !isDepartmentRole(nextRole, state.departments.length ? state.departments : departments)
        ) {
          setError('Unknown department role.');
          return false;
        }
        localStorage.setItem(ROLE_KEY, nextRole);
        setRoleState(nextRole);
        setReassignAuthorizedAt(0);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not assign this device.');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [departments, reassignAuthorizedAt],
  );

  const changePin = useCallback(async (currentPin: string, nextPin: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await changeAdminPin(currentPin, nextPin);
      if (!result.ok) {
        setError(result.error);
        return false;
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change PIN.');
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const reassignWithPin = useCallback(
    async (pin: string) => {
      setBusy(true);
      setError(null);
      try {
        const state = await getBootstrapState();
        if (!state.pinConfigured) {
          clearRole();
          invalidateShift();
          setReassignAuthorizedAt(0);
          return true;
        }
        const verified = await verifyAdminPin(pin);
        if (!verified.ok) {
          setError(verified.error);
          return false;
        }
        clearRole();
        invalidateShift();
        setReassignAuthorizedAt(Date.now());
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not reassign this device.');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [clearRole, invalidateShift],
  );

  return {
    role,
    operator,
    setOperator,
    confirmShift,
    shiftStale,
    pinConfigured,
    reassignAuthorized,
    busy,
    error,
    setError,
    assignRole,
    changePin,
    clearRole,
    reassignWithPin,
    departments,
  };
}
