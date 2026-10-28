import type { DeviceRole } from '../types';

interface Props {
  role: DeviceRole;
  operator: string;
  onOperatorChange: (name: string) => void;
  alertsEnabled: boolean;
  onEnableAlerts: () => void;
  soundBlocked: boolean;
  onUnlockSound: () => void;
  onReassign: () => void;
}

export function AppHeader({
  role,
  operator,
  onOperatorChange,
  alertsEnabled,
  onEnableAlerts,
  soundBlocked,
  onUnlockSound,
  onReassign,
}: Props) {
  const roleLabel =
    role === 'admin' ? 'Admin' : role === 'dock' ? 'Dock / Gate' : `Dept · ${role}`;

  return (
    <header className="app-header">
      <div className="header-brand">
        <p className="brand-mark">Warehouse Collections</p>
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
        <button type="button" className="btn ghost subtle" onClick={onReassign}>
          Reassign device
        </button>
      </div>
    </header>
  );
}
