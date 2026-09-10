/**
 * Runtime configuration.
 *
 * Cloud sync talks to the Netlify Function at /api/logs (same origin) and
 * authenticates with a PIN/secret that the user enters once in Settings. The
 * secret is stored on the device only. `VITE_APP_SECRET` may prefill it during
 * local development; `VITE_CLOUD_API_URL` can point to another deployment.
 */
const LS_SECRET_KEY = 'daily-tracker:cloudSecret';

const envSecret = (import.meta.env.VITE_APP_SECRET ?? '').trim();
const envUrl = (import.meta.env.VITE_CLOUD_API_URL ?? '').trim();

export const CLOUD_API_URL = envUrl || `${import.meta.env.BASE_URL.replace(/\/$/, '')}/api/logs`;

export const IS_DEV = import.meta.env.DEV;

type Listener = (secret: string) => void;
const listeners = new Set<Listener>();
let cachedSecret: string | null = null;

export function getCloudSecret(): string {
  if (cachedSecret !== null) return cachedSecret;
  let stored = '';
  try {
    stored = localStorage.getItem(LS_SECRET_KEY) ?? '';
  } catch {
    /* localStorage unavailable */
  }
  cachedSecret = stored || envSecret;
  return cachedSecret;
}

export function setCloudSecret(secret: string): void {
  const clean = secret.trim();
  cachedSecret = clean;
  try {
    if (clean) localStorage.setItem(LS_SECRET_KEY, clean);
    else localStorage.removeItem(LS_SECRET_KEY);
  } catch {
    /* ignore */
  }
  for (const l of listeners) l(clean);
}

export function onCloudSecretChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Cloud sync is enabled once a secret is present. */
export function isCloudConfigured(): boolean {
  return getCloudSecret().length > 0;
}
