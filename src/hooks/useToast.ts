import { useCallback, useEffect, useState } from 'react';

export function useToast(durationMs = 5000) {
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), durationMs);
    return () => window.clearTimeout(t);
  }, [toast, durationMs]);

  const showToast = useCallback((message: string) => {
    setToast(message);
  }, []);

  return { toast, showToast, setToast };
}
