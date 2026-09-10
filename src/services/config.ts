/**
 * Runtime configuration.
 *
 * Cloud sync uses Firebase (Firestore + Email/Password auth) through their REST
 * APIs, so no Firebase SDK ships in the bundle. The two values below are the
 * public identifiers of your Firebase project; security comes from Firestore
 * rules and the signed-in user, not from hiding these.
 */
export const FIREBASE_API_KEY = (import.meta.env.VITE_FIREBASE_API_KEY ?? '').trim();
export const FIREBASE_PROJECT_ID = (import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '').trim();

/** Cloud sync is available only when the Firebase project is configured at build time. */
export const CLOUD_CONFIGURED = FIREBASE_API_KEY.length > 0 && FIREBASE_PROJECT_ID.length > 0;

export const IS_DEV = import.meta.env.DEV;

/** Endpoints (overridable for tests / emulators). */
export const IDENTITY_TOOLKIT_URL =
  (import.meta.env.VITE_FIREBASE_AUTH_URL ?? '').trim() || 'https://identitytoolkit.googleapis.com/v1';
export const SECURE_TOKEN_URL =
  (import.meta.env.VITE_FIREBASE_TOKEN_URL ?? '').trim() || 'https://securetoken.googleapis.com/v1';
export const FIRESTORE_URL =
  (import.meta.env.VITE_FIREBASE_FIRESTORE_URL ?? '').trim() || 'https://firestore.googleapis.com/v1';
