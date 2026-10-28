import { useState } from 'react';
import type { DeviceRole } from '../types';
import { DEPARTMENTS } from '../types';

interface Props {
  pinConfigured: boolean | null;
  busy: boolean;
  error: string | null;
  onAssign: (role: DeviceRole, pin: string) => Promise<boolean>;
}

export function RoleSetup({ pinConfigured, busy, error, onAssign }: Props) {
  const [role, setRole] = useState<DeviceRole>('B2B');
  const [pin, setPin] = useState('');

  return (
    <div className="setup-screen">
      <div className="setup-panel">
        <p className="brand-mark">Warehouse Collections</p>
        <h1>Assign this computer</h1>
        <p className="lede">
          {pinConfigured
            ? 'Enter the admin PIN to set this device’s role. The assignment stays on this computer.'
            : 'First open: choose Admin, set a PIN, and keep that PIN with managers.'}
        </p>

        <label className="field">
          <span>Role</span>
          <select value={role} onChange={(e) => setRole(e.target.value as DeviceRole)}>
            <option value="admin">Admin</option>
            <option value="dock">Dock / Gate</option>
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                Department — {d}
              </option>
            ))}
          </select>
        </label>

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

        {error && <p className="form-error">{error}</p>}

        <button
          type="button"
          className="btn primary"
          disabled={busy || !pin.trim()}
          onClick={() => void onAssign(role, pin)}
        >
          {busy ? 'Saving…' : 'Save assignment'}
        </button>
      </div>
    </div>
  );
}
