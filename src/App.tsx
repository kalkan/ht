import { Suspense, lazy, useEffect, useState } from 'react';
import { BottomNav, type Tab } from './components/BottomNav';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastHost } from './components/ToastHost';
import { UpdateBanner } from './components/UpdateBanner';
import { usePwaUpdate } from './hooks/usePwaUpdate';
import { ToastProvider } from './components/ToastProvider';
import { HistoryPage } from './pages/HistoryPage';
import { SettingsPage } from './pages/SettingsPage';
import { TodayPage } from './pages/TodayPage';
import { startSyncService } from './services/syncService';

// Recharts is heavy; load the dashboard on demand (still precached for offline use).
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));

const TAB_KEY = 'daily-tracker:tab';

function readTab(): Tab {
  try {
    const v = sessionStorage.getItem(TAB_KEY);
    if (v === 'today' || v === 'history' || v === 'dashboard' || v === 'settings') return v;
  } catch {
    /* ignore */
  }
  return 'today';
}

export default function App() {
  const [tab, setTab] = useState<Tab>(readTab);
  const pwa = usePwaUpdate();
  const [updateDismissed, setUpdateDismissed] = useState(false);

  useEffect(() => {
    startSyncService();
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(TAB_KEY, tab);
    } catch {
      /* ignore */
    }
    window.scrollTo({ top: 0 });
  }, [tab]);

  return (
    <ToastProvider>
      <div className="min-h-dvh bg-bg text-ink">
        <main className="mx-auto w-full max-w-lg px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[calc(88px+env(safe-area-inset-bottom))]">
          <ErrorBoundary resetKey={tab}>
            {tab === 'today' && <TodayPage />}
            {tab === 'history' && <HistoryPage />}
            {tab === 'dashboard' && (
              <Suspense fallback={<p className="py-10 text-center text-[14px] text-muted">Yükleniyor…</p>}>
                <DashboardPage />
              </Suspense>
            )}
            {tab === 'settings' && <SettingsPage />}
          </ErrorBoundary>
        </main>
        <BottomNav active={tab} onChange={setTab} />
        <ToastHost />
        {pwa.updateAvailable && !updateDismissed && (
          <UpdateBanner onUpdate={pwa.update} onDismiss={() => setUpdateDismissed(true)} />
        )}
      </div>
    </ToastProvider>
  );
}
