import { useState } from 'react';
import type { Department, DeviceRole } from '../types';
import { IconClipboard, IconDept, IconTruck, IconWarehouse } from './Icons';

interface Props {
  pinConfigured: boolean | null;
  reassignAuthorized?: boolean;
  departments: Department[];
  busy: boolean;
  error: string | null;
  onAssign: (role: DeviceRole, pin: string) => Promise<boolean>;
}

export function RoleSetup({
  pinConfigured,
  reassignAuthorized = false,
  departments,
  busy,
  error,
  onAssign,
}: Props) {
  const [role, setRole] = useState<DeviceRole>('admin');
  const [pin, setPin] = useState('');
  const skipPin = Boolean(pinConfigured && reassignAuthorized);
  const needsPin = !skipPin;

  return (
    <div className="setup-screen">
      <div className="setup-panel">
        <div className="setup-brand">
          <span className="brand-icon" aria-hidden>
            <IconWarehouse />
          </span>
          <p className="brand-mark">FreightFetch</p>
        </div>
        <h1>
          <IconClipboard />
          Assign this computer
        </h1>
        <p className="lede">
          {skipPin
            ? 'PIN verified. Choose the new role for this computer.'
            : pinConfigured
              ? 'Enter the admin PIN to set this device’s role. The assignment stays on this computer.'
              : 'First open: choose Admin, set a PIN, and keep that PIN with managers.'}
        </p>

        {skipPin ? (
          <p className="auth-pill" role="status">
            Authorized — choose a role
          </p>
        ) : (
          <ol className="setup-checklist">
            <li>Assign Admin first and store the PIN with managers.</li>
            <li>Assign each department PC and the dock / gate PC.</li>
            <li>After assign: type your name → Confirm shift → unlock sound → Enable alerts.</li>
          </ol>
        )}

        <fieldset className="role-targets" disabled={busy}>
          <legend className="field-legend">Role</legend>
          <div className="role-target-grid" role="radiogroup" aria-label="Device role">
            <button
              type="button"
              role="radio"
              aria-checked={role === 'admin'}
              className={role === 'admin' ? 'role-target active' : 'role-target'}
              onClick={() => setRole('admin')}
            >
              <IconClipboard />
              <span>Admin</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={role === 'dock'}
              className={role === 'dock' ? 'role-target active' : 'role-target'}
              onClick={() => setRole('dock')}
            >
              <IconTruck />
              <span>Dock / Gate</span>
            </button>
            {departments.map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={role === d}
                className={role === d ? 'role-target active' : 'role-target'}
                onClick={() => setRole(d)}
              >
                <IconDept />
                <span>Department — {d}</span>
              </button>
            ))}
          </div>
        </fieldset>

        {needsPin && (
          <label className="field">
            <span>{pinConfigured ? 'Admin PIN' : 'Create admin PIN'}</span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder={pinConfigured ? '••••' : 'At least 4 characters'}
            />
          </label>
        )}

        {error && <p className="form-error">{error}</p>}

        <button
          type="button"
          className="btn primary"
          disabled={busy || (needsPin && !pin.trim())}
          onClick={() => void onAssign(role, pin)}
        >
          {busy ? 'Saving…' : 'Save assignment'}
        </button>
      </div>
    </div>
  );
}
