import { FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";
import { Analytics, getAnalytics, isSupported } from "firebase/analytics";
import { Auth, getAuth, GoogleAuthProvider } from "firebase/auth";
import { Firestore, getFirestore } from "firebase/firestore";

const firebaseEnv = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
} as const;

const firebaseConfig = {
  apiKey: firebaseEnv.apiKey,
  authDomain: firebaseEnv.authDomain,
  projectId: firebaseEnv.projectId,
  storageBucket: firebaseEnv.storageBucket,
  messagingSenderId: firebaseEnv.messagingSenderId,
  appId: firebaseEnv.appId,
  measurementId: firebaseEnv.measurementId
};

const missingFirebaseEnvVars = [
  !firebaseEnv.apiKey ? "NEXT_PUBLIC_FIREBASE_API_KEY" : null,
  !firebaseEnv.authDomain ? "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN" : null,
  !firebaseEnv.projectId ? "NEXT_PUBLIC_FIREBASE_PROJECT_ID" : null,
  !firebaseEnv.storageBucket ? "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET" : null,
  !firebaseEnv.messagingSenderId ? "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID" : null,
  !firebaseEnv.appId ? "NEXT_PUBLIC_FIREBASE_APP_ID" : null
].filter(Boolean) as string[];

export const isFirebaseConfigured = missingFirebaseEnvVars.length === 0;
export const firebaseProjectId = firebaseEnv.projectId || "";
export const firebaseAuthDomain = firebaseEnv.authDomain || "";

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let googleProvider: GoogleAuthProvider | null = null;
let analyticsPromise: Promise<Analytics | null> | null = null;

const firebaseDebugSnapshot = {
  hasApiKey: Boolean(firebaseEnv.apiKey),
  hasAuthDomain: Boolean(firebaseEnv.authDomain),
  hasProjectId: Boolean(firebaseEnv.projectId),
  hasStorageBucket: Boolean(firebaseEnv.storageBucket),
  hasMessagingSenderId: Boolean(firebaseEnv.messagingSenderId),
  hasAppId: Boolean(firebaseEnv.appId),
  hasMeasurementId: Boolean(firebaseEnv.measurementId),
  configured: isFirebaseConfigured,
  projectId: firebaseEnv.projectId || "missing"
};

if (typeof window !== "undefined") {
  console.info("[Firebase] env check", firebaseDebugSnapshot);
} else {
  console.info("[Firebase] server env check", firebaseDebugSnapshot);
}

if (isFirebaseConfigured) {
  app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  googleProvider = new GoogleAuthProvider();
  googleProvider.setCustomParameters({
    prompt: "select_account"
  });
}

function missingFirebaseConfigError() {
  return new Error(
    `Firebase env vars are missing: ${missingFirebaseEnvVars.join(", ")}. Check .env.local, restart the Next.js dev server, and confirm the debug log shows configured: true.`
  );
}

export function getFirebaseApp() {
  if (!app) throw missingFirebaseConfigError();
  return app;
}

export function getFirebaseAuth() {
  if (!auth) throw missingFirebaseConfigError();
  return auth;
}

export function getFirebaseDb() {
  if (!db) throw missingFirebaseConfigError();
  return db;
}

export function getGoogleProvider() {
  if (!googleProvider) throw missingFirebaseConfigError();
  return googleProvider;
}

export async function getFirebaseAnalytics() {
  if (!isFirebaseConfigured || !app) {
    throw missingFirebaseConfigError();
  }

  if (!firebaseConfig.measurementId) {
    return null;
  }

  if (typeof window === "undefined") {
    return null;
  }

  if (!analyticsPromise) {
    analyticsPromise = isSupported()
      .then((supported) => (supported ? getAnalytics(app) : null))
      .catch(() => null);
  }

  return analyticsPromise;
}
