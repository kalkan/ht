import { useCallback, useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

/**
 * Registers the service worker and exposes an "update available" flag.
 * The new worker is only activated when the user taps "Güncelle", so an
 * in-progress form is never interrupted by an automatic reload.
 */
export function usePwaUpdate(): { updateAvailable: boolean; offlineReady: boolean; update: () => void } {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [updateFn, setUpdateFn] = useState<((reload?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const fn = registerSW({
      immediate: true,
      onNeedRefresh() {
        setUpdateAvailable(true);
      },
      onOfflineReady() {
        setOfflineReady(true);
      },
      onRegisteredSW(_url, registration) {
        // Check for a new version every hour while the app stays open.
        if (!registration) return;
        setInterval(() => {
          void registration.update().catch(() => undefined);
        }, 60 * 60 * 1000);
      },
      onRegisterError() {
        /* offline caching unavailable; app still works */
      },
    });
    setUpdateFn(() => fn);
  }, []);

  const update = useCallback(() => {
    if (updateFn) void updateFn(true);
    else window.location.reload();
  }, [updateFn]);

  return { updateAvailable, offlineReady, update };
}
