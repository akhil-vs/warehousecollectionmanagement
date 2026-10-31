/**
 * Public Firebase web app config (safe to ship in the client).
 * Used as production fallback when Vercel does not inject VITE_FIREBASE_*.
 * Security is Anonymous Auth + Firestore rules + callables — not hiding these values.
 */
export const firebaseWebConfig = {
  apiKey: 'AIzaSyBkpH4BD2swIQFvKvy2xFp15cJb1ovWCqI', // pragma: allowlist secret
  authDomain: 'collecto-b1ca7.firebaseapp.com', // pragma: allowlist secret
  projectId: 'collecto-b1ca7', // pragma: allowlist secret
  storageBucket: 'collecto-b1ca7.firebasestorage.app', // pragma: allowlist secret
  messagingSenderId: '511664097233', // pragma: allowlist secret
  appId: '1:511664097233:web:4974a3a6390eb70ae102f0', // pragma: allowlist secret
} as const;
