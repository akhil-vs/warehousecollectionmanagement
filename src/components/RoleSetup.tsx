import { useState } from 'react';
import type { Department, DeviceRole } from '../types';

interface Props {
  pinConfigured: boolean | null;
  departments: Department[];
  busy: boolean;
  error: string | null;
  onAssign: (role: DeviceRole, pin: string) => Promise<boolean>;
}

export function RoleSetup({ pinConfigured, departments, busy, error, onAssign }: Props) {
  const [role, setRole] = useState<DeviceRole>(departments[0] ?? 'admin');
  const [pin, setPin] = useState('');

  return (
    <div className="setup-screen">
      <div className="setup-panel">
        <p className="brand-mark">FreightFetch</p>
        <h1>Assign this computer</h1>
        <p className="lede">
          {pinConfigured
            ? 'Enter the admin PIN to set this device’s role. The assignment stays on this computer.'
            : 'First open: choose Admin, set a PIN, and keep that PIN with managers.'}
        </p>

        <ol className="setup-checklist">
          <li>Assign Admin first and store the PIN with managers.</li>
          <li>Assign each department PC and the dock / gate PC.</li>
          <li>After assign: type your name → Confirm shift → unlock sound → Enable alerts.</li>
        </ol>

        <label className="field">
          <span>Role</span>
          <select value={role} onChange={(e) => setRole(e.target.value as DeviceRole)}>
            <option value="admin">Admin</option>
            <option value="dock">Dock / Gate</option>
            {departments.map((d) => (
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
