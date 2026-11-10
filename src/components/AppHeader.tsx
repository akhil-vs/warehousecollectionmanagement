import type { ReactNode } from 'react';
import type { DeviceRole } from '../types';
import { roleLabel } from '../lib/reassignAuth';
import {
  IconAlert,
  IconSound,
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
  tabs?: ReactNode;
  hubLabel?: string;
}

function operatorInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
}

function hubForRole(role: DeviceRole): string {
  if (role === 'admin') return 'Control';
  if (role === 'dock') return 'Dock Gate';
  return `Hub ${role}`;
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
  tabs,
  hubLabel,
}: Props) {
  const hub = hubLabel ?? hubForRole(role);
  const displayName = operator.trim() || 'Operator';
  const shiftLine =
    role === 'dock'
      ? 'Dock / Gate · Live shift'
      : role === 'admin'
        ? 'Admin · Live shift'
        : `${roleLabel(role)} · Shift`;

  return (
    <header className="app-header">
      <div className="header-brand">
        <div className="brand-row">
          <span className="brand-icon" aria-hidden>
            <IconWarehouse />
          </span>
          <div className="brand-copy">
            <p className="brand-crumb">
              Warehouse Ops <span aria-hidden>/</span> {hub}
            </p>
            <h1 className="brand-mark">Dispatch Center</h1>
          </div>
        </div>
      </div>

      {tabs ? <div className="header-tabs">{tabs}</div> : null}

      <div className="header-actions">
        {!alertsEnabled && (
          <button type="button" className="btn ghost compact" onClick={onEnableAlerts}>
            <IconAlert />
            Enable alerts
          </button>
        )}
        {soundBlocked && (
          <button type="button" className="btn warn-soft compact" onClick={onUnlockSound}>
            <IconSound />
            Enable sound
          </button>
        )}

        <div className="user-chip">
          <label className="operator-field user-chip-fields">
            <span className="visually-hidden">Operator</span>
            <input
              value={operator}
              onChange={(e) => onOperatorChange(e.target.value)}
              placeholder="Your name"
              maxLength={40}
              aria-label="Operator name"
            />
            <span className="user-role-line">{shiftLine}</span>
          </label>
          <span className="user-avatar" aria-hidden>
            {operatorInitials(displayName)}
          </span>
        </div>

        {!hideReassign && (
          <button type="button" className="btn ghost subtle compact" onClick={onReassignRequest}>
            Reassign
          </button>
        )}
      </div>
    </header>
  );
}
