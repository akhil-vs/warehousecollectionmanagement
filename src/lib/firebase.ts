import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  type Auth,
} from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getFunctions, type Functions } from 'firebase/functions';
import { firebaseWebConfig } from './firebaseWebConfig';

function envKey(name: keyof typeof firebaseWebConfig): string {
  switch (name) {
    case 'apiKey':
      return 'API_KEY';
    case 'authDomain':
      return 'AUTH_DOMAIN';
    case 'projectId':
      return 'PROJECT_ID';
    case 'storageBucket':
      return 'STORAGE_BUCKET';
    case 'messagingSenderId':
      return 'MESSAGING_SENDER_ID';
    case 'appId':
      return 'APP_ID';
  }
}

function readConfigured(name: keyof typeof firebaseWebConfig): string | undefined {
  const fromEnv = import.meta.env[`VITE_FIREBASE_${envKey(name)}`] as string | undefined;
  if (typeof fromEnv === 'string') {
    const trimmed = fromEnv.trim();
    if (trimmed && !trimmed.startsWith('your-')) return trimmed;
  }
  // Production/Vercel builds must not depend on dashboard env — ship public web config.
  if (import.meta.env.PROD) {
    const baked = firebaseWebConfig[name]?.trim();
    if (baked && !baked.startsWith('your-')) return baked;
  }
  return undefined;
}

const firebaseConfig = {
  apiKey: readConfigured('apiKey'),
  authDomain: readConfigured('authDomain'),
  projectId: readConfigured('projectId'),
  storageBucket: readConfigured('storageBucket'),
  messagingSenderId: readConfigured('messagingSenderId'),
  appId: readConfigured('appId'),
};

const FUNCTIONS_REGION = 'europe-west2';

export function isFirebaseConfigured(): boolean {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId &&
      firebaseConfig.appId,
  );
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let functions: Functions | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured. Set VITE_FIREBASE_* env vars.');
  }
  if (!app) {
    app = initializeApp(firebaseConfig);
  }
  return app;
}

export function getFirebaseAuth(): Auth {
  if (!auth) {
    auth = getAuth(getFirebaseApp());
  }
  return auth;
}

export function getDb(): Firestore {
  if (!db) {
    db = getFirestore(getFirebaseApp());
  }
  return db;
}

export function getFirebaseFunctions(): Functions {
  if (!functions) {
    functions = getFunctions(getFirebaseApp(), FUNCTIONS_REGION);
  }
  return functions;
}

export function ensureAnonymousAuth(): Promise<void> {
  const a = getFirebaseAuth();
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(
      a,
      async (user) => {
        unsub();
        try {
          if (!user) {
            await signInAnonymously(a);
          }
          resolve();
        } catch (err) {
          reject(err);
        }
      },
      reject,
    );
  });
}
