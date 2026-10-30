const SALT = 'warehouse-collections-v1';

/** SHA-256 hex digest. Works in browsers (crypto.subtle) and Node (webcrypto). */
export async function hashPin(pin: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Web Crypto is not available for PIN hashing.');
  }
  const data = new TextEncoder().encode(`${SALT}:${pin}`);
  const digest = await subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function verifyPin(pin: string, pinHash: string): Promise<boolean> {
  const hashed = await hashPin(pin);
  return hashed === pinHash;
}
