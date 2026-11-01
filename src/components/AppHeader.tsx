import type { DeviceRole } from '../types';
import { roleLabel } from '../lib/reassignAuth';
import {
  IconAlert,
  IconClipboard,
  IconDept,
  IconOperator,
  IconSound,
  IconTruck,
  IconWarehouse,
} from './Icons';

interface Props {
  role: DeviceRole;
  operator: string;
  onOperatorChange: (name: string) => void;
  alertsEnabled: boolean;
  onEnableAlerts: () => void;
  soundBlocked: boolean;
  onUnlockSound: () => void;
  hideReassign?: boolean;
  onReassignRequest: () => void;
}

function RoleIcon({ role }: { role: DeviceRole }) {
  if (role === 'admin') return <IconClipboard />;
  if (role === 'dock') return <IconTruck />;
  return <IconDept />;
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
  onReassignRequest,
}: Props) {
  return (
    <header className="app-header">
      <div className="header-brand">
        <div className="brand-row">
          <span className="brand-icon" aria-hidden>
            <IconWarehouse />
          </span>
          <p className="brand-mark">FreightFetch</p>
        </div>
        <span className="role-chip">
          <RoleIcon role={role} />
          {roleLabel(role)}
        </span>
      </div>
      <div className="header-actions">
        <label className="operator-field">
          <span className="icon-label">
            <IconOperator />
            Operator
          </span>
          <input
            value={operator}
            onChange={(e) => onOperatorChange(e.target.value)}
            placeholder="Your name"
            maxLength={40}
          />
        </label>
        {!alertsEnabled && (
          <button type="button" className="btn ghost" onClick={onEnableAlerts}>
            <IconAlert />
            Enable alerts
          </button>
        )}
        {soundBlocked && (
          <button type="button" className="btn warn-soft" onClick={onUnlockSound}>
            <IconSound />
            Tap to enable sound
          </button>
        )}
        {!hideReassign && (
          <button type="button" className="btn ghost subtle" onClick={onReassignRequest}>
            Reassign device
          </button>
        )}
      </div>
    </header>
  );
}
