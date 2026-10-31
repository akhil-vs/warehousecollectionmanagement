import { useState } from 'react';
import type { DeviceRole } from '../types';

interface Props {
  role: DeviceRole;
  operator: string;
  onOperatorChange: (name: string) => void;
  alertsEnabled: boolean;
  onEnableAlerts: () => void;
  soundBlocked: boolean;
  onUnlockSound: () => void;
  hideReassign?: boolean;
  reassignBusy?: boolean;
  reassignError?: string | null;
  onReassign: (pin: string) => Promise<boolean>;
}

export function AppHeader({
  role,
  operator,
  onOperatorChange,
  alertsEnabled,
  onEnableAlerts,
  soundBlocked,
  onUnlockSound,
  hideReassign,
  reassignBusy,
  reassignError,
  onReassign,
}: Props) {
  const [reassignOpen, setReassignOpen] = useState(false);
  const [pin, setPin] = useState('');
  const roleLabel =
    role === 'admin' ? 'Admin' : role === 'dock' ? 'Dock / Gate' : `Dept · ${role}`;

  return (
    <header className="app-header">
      <div className="header-brand">
        <p className="brand-mark">FreightFetch</p>
        <span className="role-chip">{roleLabel}</span>
      </div>
      <div className="header-actions">
        <label className="operator-field">
          <span>Operator</span>
          <input
            value={operator}
            onChange={(e) => onOperatorChange(e.target.value)}
            placeholder="Your name"
            maxLength={40}
          />
        </label>
        {!alertsEnabled && (
          <button type="button" className="btn ghost" onClick={onEnableAlerts}>
            Enable alerts
          </button>
        )}
        {soundBlocked && (
          <button type="button" className="btn warn-soft" onClick={onUnlockSound}>
            Tap to enable sound
          </button>
        )}
        {!hideReassign && !reassignOpen && (
          <button type="button" className="btn ghost subtle" onClick={() => setReassignOpen(true)}>
            Reassign device
          </button>
        )}
        {!hideReassign && reassignOpen && (
          <form
            className="reassign-row"
            onSubmit={(e) => {
              e.preventDefault();
              void onReassign(pin).then((ok) => {
                if (ok) {
                  setPin('');
                  setReassignOpen(false);
                }
              });
            }}
          >
            <label className="operator-field">
              <span>Admin PIN</span>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                autoComplete="off"
                placeholder="PIN to reassign"
              />
            </label>
            <button type="submit" className="btn ghost" disabled={reassignBusy || !pin.trim()}>
              Confirm
            </button>
            <button
              type="button"
              className="btn ghost subtle"
              onClick={() => {
                setReassignOpen(false);
                setPin('');
              }}
            >
              Cancel
            </button>
          </form>
        )}
      </div>
      {reassignError && <p className="form-error header-error">{reassignError}</p>}
    </header>
  );
}
