interface Props {
  operator: string;
  soundBlocked?: boolean;
  alertsEnabled?: boolean;
  onConfirm: () => boolean;
  onUnlockSound?: () => void;
  onEnableAlerts?: () => void;
}

export function ShiftBanner({
  operator,
  soundBlocked,
  alertsEnabled,
  onConfirm,
  onUnlockSound,
  onEnableAlerts,
}: Props) {
  const missing = !operator.trim();
  return (
    <div className="shift-banner" role="status">
      <div>
        <strong>{missing ? 'Start-of-shift checklist' : 'Confirm operator for this shift'}</strong>
        <p>
          {missing
            ? 'Type your name above, then confirm. Actions stay blocked until you do.'
            : `Names expire after 8 hours. Confirm you are ${operator.trim()}, then unlock sound and alerts so dock calls are heard.`}
        </p>
        <ol className="shift-checklist">
          <li>Confirm your name</li>
          <li className={!soundBlocked ? 'done' : undefined}>
            Tap once to unlock sound{!soundBlocked ? ' ✓' : ''}
          </li>
          <li className={alertsEnabled ? 'done' : undefined}>
            Enable browser alerts{alertsEnabled ? ' ✓' : ''}
          </li>
        </ol>
      </div>
      <div className="shift-actions">
        {soundBlocked && onUnlockSound && (
          <button type="button" className="btn warn-soft" onClick={onUnlockSound}>
            Unlock sound
          </button>
        )}
        {!alertsEnabled && onEnableAlerts && (
          <button type="button" className="btn ghost" onClick={onEnableAlerts}>
            Enable alerts
          </button>
        )}
        <button type="button" className="btn primary" disabled={missing} onClick={() => onConfirm()}>
          Confirm shift
        </button>
      </div>
    </div>
  );
}
