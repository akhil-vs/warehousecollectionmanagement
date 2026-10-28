import { useMemo, useState } from 'react';
import type { Order } from '../types';
import { DEPARTMENTS } from '../types';

interface Props {
  orders: Order[];
  busy: boolean;
  onReopen: (orderId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  onDelete: (orderId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  onChangePin: (current: string, next: string) => Promise<boolean>;
}

export function AdminPanel({ orders, busy, onReopen, onDelete, onChangePin }: Props) {
  const [orderId, setOrderId] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [currentPin, setCurrentPin] = useState('');
  const [nextPin, setNextPin] = useState('');

  const overview = useMemo(() => {
    return DEPARTMENTS.map((dept) => {
      const mine = orders.filter((o) => o.department === dept);
      return {
        dept,
        ready: mine.filter((o) => o.status === 'ready').length,
        waiting: mine.filter((o) => o.status === 'arrived').length,
        collected: mine.filter((o) => o.status === 'collected').length,
      };
    });
  }, [orders]);

  async function reopen() {
    setMsg(null);
    setErr(null);
    const r = await onReopen(orderId);
    if (!r.ok) setErr(r.error);
    else {
      setMsg(`Reopened ${orderId.trim().toUpperCase()} as ready.`);
      setOrderId('');
    }
  }

  async function remove() {
    setMsg(null);
    setErr(null);
    if (!window.confirm(`Delete order ${orderId.trim().toUpperCase()}?`)) return;
    const r = await onDelete(orderId);
    if (!r.ok) setErr(r.error);
    else {
      setMsg(`Deleted ${orderId.trim().toUpperCase()}.`);
      setOrderId('');
    }
  }

  async function changePin() {
    setMsg(null);
    setErr(null);
    const ok = await onChangePin(currentPin, nextPin);
    if (ok) {
      setMsg('Admin PIN updated.');
      setCurrentPin('');
      setNextPin('');
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Admin</h2>
        <p>Overview, corrections, and PIN.</p>
      </div>

      <div className="overview-grid">
        {overview.map((row) => (
          <div key={row.dept} className="overview-item">
            <h3>{row.dept}</h3>
            <p>
              <strong>{row.ready}</strong> ready
            </p>
            <p>
              <strong>{row.waiting}</strong> driver waiting
            </p>
            <p>
              <strong>{row.collected}</strong> collected
            </p>
          </div>
        ))}
      </div>

      <div className="admin-block">
        <h3>Order correction</h3>
        <label className="field">
          <span>Order ID</span>
          <input
            className="mono"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value.toUpperCase())}
          />
        </label>
        <div className="row-actions">
          <button type="button" className="btn primary" disabled={busy} onClick={() => void reopen()}>
            Reopen as ready
          </button>
          <button type="button" className="btn ghost danger" disabled={busy} onClick={() => void remove()}>
            Delete order
          </button>
        </div>
      </div>

      <div className="admin-block">
        <h3>Change admin PIN</h3>
        <label className="field">
          <span>Current PIN</span>
          <input
            type="password"
            value={currentPin}
            onChange={(e) => setCurrentPin(e.target.value)}
          />
        </label>
        <label className="field">
          <span>New PIN</span>
          <input type="password" value={nextPin} onChange={(e) => setNextPin(e.target.value)} />
        </label>
        <button type="button" className="btn solid" disabled={busy} onClick={() => void changePin()}>
          Update PIN
        </button>
      </div>

      {msg && <p className="form-ok">{msg}</p>}
      {err && <p className="form-error">{err}</p>}
    </section>
  );
}
