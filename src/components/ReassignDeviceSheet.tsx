import { useEffect, useId, useRef, useState } from 'react';
import type { DeviceRole } from '../types';
import { roleLabel } from '../lib/reassignAuth';

interface Props {
  currentRole: DeviceRole;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (pin: string) => Promise<boolean>;
}

export function ReassignDeviceSheet({
  currentRole,
  busy,
  error,
  onCancel,
  onConfirm,
}: Props) {
  const [pin, setPin] = useState('');
  const titleId = useId();
  const descId = useId();
  const pinRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    pinRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  return (
    <div
      className="confirm-backdrop reassign-backdrop"
      role="presentation"
      onClick={() => !busy && onCancel()}
    >
      <div
        className="confirm-dialog reassign-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId}>Reassign this computer</h2>
        <p id={descId} className="reassign-current">
          Current role: <strong>{roleLabel(currentRole)}</strong>
        </p>
        <ul className="reassign-impact">
          <li>Clears the device role stored on this computer.</li>
          <li>Keeps the typed operator name; shift must be confirmed again.</li>
          <li>Warehouse actions stay blocked until the next shift checklist.</li>
        </ul>

        <form
          className="reassign-sheet-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!pin.trim() || busy) return;
            void onConfirm(pin.trim());
          }}
        >
          <label className="field">
            <span>Admin PIN</span>
            <input
              ref={pinRef}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••"
              disabled={busy}
            />
          </label>

          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="confirm-actions">
            <button type="button" className="btn ghost" disabled={busy} onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={busy || !pin.trim()}>
              {busy ? 'Checking…' : 'Continue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
