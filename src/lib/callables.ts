import { httpsCallable, type HttpsCallableResult } from 'firebase/functions';
import { getFirebaseFunctions, isFirebaseConfigured } from './firebase';
import { toUserError } from './orderState';

type Result = { ok: true } | { ok: false; error: string };

async function call<TData, TResult>(name: string, data: TData): Promise<TResult> {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured.');
  }
  try {
    const fn = httpsCallable<TData, TResult>(getFirebaseFunctions(), name);
    const res: HttpsCallableResult<TResult> = await fn(data);
    return res.data;
  } catch (err) {
    const message = toUserError(err, 'Request failed.');
    // Firebase HttpsError puts message on err.message
    throw new Error(message);
  }
}

export async function callMutation(
  name: string,
  data: Record<string, unknown>,
): Promise<Result> {
  try {
    const result = await call<Record<string, unknown>, Result>(name, data);
    if (result && typeof result === 'object' && 'ok' in result) return result;
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toUserError(err, 'Request failed.') };
  }
}

export async function callTyped<T>(
  name: string,
  data: Record<string, unknown>,
): Promise<T> {
  return call(name, data);
}
