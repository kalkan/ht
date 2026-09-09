import { useCallback, useEffect, useState } from 'react';

export type ThemeSetting = 'light' | 'dark' | 'system';

const LS_KEY = 'daily-tracker:theme';

function readSetting(): ThemeSetting {
  try {
    const v = localStorage.getItem(LS_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* ignore */
  }
  return 'system';
}

function resolve(setting: ThemeSetting): 'light' | 'dark' {
  if (setting !== 'system') return setting;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Apply the theme to <html> and keep the iOS status bar colour in sync. */
export function applyTheme(setting: ThemeSetting): void {
  const resolved = resolve(setting);
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = resolved === 'dark' ? '#000000' : '#f5f5f7';
}

export function useTheme(): { setting: ThemeSetting; resolved: 'light' | 'dark'; setSetting: (s: ThemeSetting) => void } {
  const [setting, setSettingState] = useState<ThemeSetting>(readSetting);
  const [resolved, setResolved] = useState<'light' | 'dark'>(() => resolve(readSetting()));

  useEffect(() => {
    applyTheme(setting);
    setResolved(resolve(setting));
    if (setting !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      applyTheme('system');
      setResolved(resolve('system'));
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [setting]);

  const setSetting = useCallback((s: ThemeSetting) => {
    setSettingState(s);
    try {
      localStorage.setItem(LS_KEY, s);
    } catch {
      /* ignore */
    }
  }, []);

  return { setting, resolved, setSetting };
}
