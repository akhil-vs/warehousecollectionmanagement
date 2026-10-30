const DATE_INPUT_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseDateInput(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const v = value.trim();
  if (!v) return undefined;
  if (!DATE_INPUT_RE.test(v)) return undefined;
  const [ys, ms, ds] = v.split('-');
  const y = Number(ys);
  const m = Number(ms);
  const d = Number(ds);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return undefined;
  return v;
}

export function todayInputValue(now = Date.now()): string {
  const d = new Date(now);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
