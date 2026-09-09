import { useEffect, useState } from 'react';

const LS_KEY = 'daily-tracker:installHintDismissed';

export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
}

export function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  const isIos = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return isIos && isSafari;
}

/** Shows an "Add to Home Screen" hint when running in iOS Safari but not installed. */
export function useInstallHint(): { show: boolean; dismiss: () => void } {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(LS_KEY) === '1') return;
    } catch {
      /* ignore */
    }
    if (isIosSafari() && !isStandalone()) setShow(true);
  }, []);
  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(LS_KEY, '1');
    } catch {
      /* ignore */
    }
  };
  return { show, dismiss };
}
