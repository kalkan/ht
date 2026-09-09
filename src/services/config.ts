/** Runtime configuration read from Vite environment variables. */
export const APPS_SCRIPT_URL = (import.meta.env.VITE_APPS_SCRIPT_URL ?? '').trim();
export const APP_SECRET = (import.meta.env.VITE_APP_SECRET ?? '').trim();

/** Cloud sync is only enabled when both values are present. */
export const CLOUD_SYNC_CONFIGURED = APPS_SCRIPT_URL.length > 0 && APP_SECRET.length > 0;

export const IS_DEV = import.meta.env.DEV;
