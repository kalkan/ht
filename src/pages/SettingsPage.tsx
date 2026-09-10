import { useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PageHeader } from '../components/PageHeader';
import { Button, Card, Row } from '../components/ui';
import { cx } from '../utils/cx';
import { useAllLogs } from '../hooks/useLogs';
import { useSyncState } from '../hooks/useSyncState';
import { useTheme, type ThemeSetting } from '../hooks/useTheme';
import { useToast } from '../hooks/useToast';
import { META_KEYS, clearAllLocalData, db, getMeta, setMeta } from '../db/database';
import { IS_DEV } from '../services/config';
import { isSeeded, removeSeedData, seedDatabase } from '../services/seed';
import { deleteAllCloudData, syncNow, testConnection, updateCloudSecret } from '../services/syncService';
import { createBackup, parseBackup, serializeBackup, toCsv } from '../utils/backup';
import { formatDateTimeTr, formatLongDateTr, nowIso, todayKey } from '../utils/dateUtils';
import { downloadTextFile, readFileAsText } from '../utils/download';

const THEME_OPTIONS: { value: ThemeSetting; label: string }[] = [
  { value: 'light', label: 'Açık' },
  { value: 'dark', label: 'Koyu' },
  { value: 'system', label: 'Sistem' },
];

export function SettingsPage() {
  const { logs } = useAllLogs();
  const sync = useSyncState();
  const theme = useTheme();
  const { show } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  const [syncing, setSyncing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [secretInput, setSecretInput] = useState('');
  const [editingSecret, setEditingSecret] = useState(false);
  const [savingSecret, setSavingSecret] = useState(false);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'local' | 'all' | 'import' | null>(null);
  const [pendingImport, setPendingImport] = useState<ReturnType<typeof parseBackup> | null>(null);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    getMeta(META_KEYS.lastBackupAt).then((v) => setLastBackupAt(v ?? null)).catch(() => undefined);
    if (IS_DEV) isSeeded().then(setSeeded).catch(() => undefined);
  }, [logs.length]);

  const first = logs[0];
  const last = logs[logs.length - 1];

  const onSync = async () => {
    setSyncing(true);
    const r = await syncNow();
    setSyncing(false);
    if (r.ok) show(`Senkronize edildi (${r.pushed} gönderildi, ${r.pulled} alındı).`, 'success');
    else show(r.error ?? 'Senkronizasyon başarısız.', 'error');
  };

  const onSaveSecret = async () => {
    const value = secretInput.trim();
    if (value.length < 6) {
      show('Anahtar en az 6 karakter olmalı.', 'error');
      return;
    }
    setSavingSecret(true);
    try {
      const r = await updateCloudSecret(value);
      if (r?.ok) {
        show('Bulut bağlantısı kuruldu ve senkronize edildi.', 'success');
      } else if (r?.error?.includes('anahtarı hatalı')) {
        // Server rejected the key: do not keep it, let the user try again.
        await updateCloudSecret('');
        show(r.error, 'error');
        return;
      } else {
        show(r?.error ? `Anahtar kaydedildi. ${r.error}` : 'Anahtar kaydedildi, senkronizasyon başarısız.', 'info');
      }
      setEditingSecret(false);
      setSecretInput('');
    } finally {
      setSavingSecret(false);
    }
  };

  const onRemoveSecret = async () => {
    await updateCloudSecret('');
    setEditingSecret(false);
    setSecretInput('');
    show('Bulut bağlantısı kaldırıldı. Veriler cihazda kalmaya devam eder.', 'info');
  };

  const onTest = async () => {
    setTesting(true);
    try {
      const ok = await testConnection();
      show(ok ? 'Google Sheets bağlantısı çalışıyor.' : 'Beklenmeyen yanıt.', ok ? 'success' : 'error');
    } catch (e) {
      show(e instanceof Error ? e.message : 'Bağlantı başarısız.', 'error');
    } finally {
      setTesting(false);
    }
  };

  const onExportJson = async () => {
    try {
      const backup = createBackup(logs);
      downloadTextFile(`daily-backup-${todayKey()}.json`, serializeBackup(backup), 'application/json;charset=utf-8');
      const at = nowIso();
      await setMeta(META_KEYS.lastBackupAt, at);
      setLastBackupAt(at);
      show('JSON yedeği hazırlandı.', 'success');
    } catch (e) {
      show(e instanceof Error ? e.message : 'Yedek oluşturulamadı.', 'error');
    }
  };

  const onExportCsv = () => {
    try {
      downloadTextFile(`daily-export-${todayKey()}.csv`, toCsv(logs), 'text/csv;charset=utf-8');
      show('CSV dosyası hazırlandı.', 'success');
    } catch (e) {
      show(e instanceof Error ? e.message : 'CSV oluşturulamadı.', 'error');
    }
  };

  const onPickFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      const parsed = parseBackup(text);
      if (parsed.records.length === 0) {
        show('Dosyada geçerli kayıt bulunamadı.', 'error');
        return;
      }
      setPendingImport(parsed);
      setConfirm('import');
    } catch (e) {
      show(e instanceof Error ? e.message : 'Yedek okunamadı.', 'error');
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  /** Import merges by date with last-write-wins so a restore never duplicates a day. */
  const onImport = async () => {
    if (!pendingImport) return;
    let added = 0;
    let updated = 0;
    let skipped = 0;
    try {
      await db.transaction('rw', db.dailyLogs, async () => {
        for (const rec of pendingImport.records) {
          const existing = await db.dailyLogs.where('date').equals(rec.date).first();
          if (!existing) {
            await db.dailyLogs.add(rec);
            added += 1;
          } else if (rec.updatedAt > existing.updatedAt) {
            await db.dailyLogs.put({ ...rec, id: existing.id });
            updated += 1;
          } else {
            skipped += 1;
          }
        }
      });
      const rejected = pendingImport.rejected.length;
      show(`Geri yüklendi: ${added} yeni, ${updated} güncellendi, ${skipped} atlandı${rejected ? `, ${rejected} geçersiz` : ''}.`, 'success');
      void syncNow();
    } catch (e) {
      show(e instanceof Error ? e.message : 'Geri yükleme başarısız.', 'error');
    } finally {
      setConfirm(null);
      setPendingImport(null);
    }
  };

  const onDeleteLocal = async () => {
    try {
      await clearAllLocalData();
      show('Yerel veriler silindi.', 'success');
    } catch (e) {
      show(e instanceof Error ? e.message : 'Silinemedi.', 'error');
    } finally {
      setConfirm(null);
    }
  };

  const onDeleteAll = async () => {
    try {
      // Cloud first: if it fails, local data is kept so nothing is lost.
      await deleteAllCloudData();
      await clearAllLocalData();
      show('Yerel ve bulut verileri silindi.', 'success');
    } catch (e) {
      show(e instanceof Error ? `Bulut silinemedi: ${e.message}` : 'Bulut verileri silinemedi.', 'error');
    } finally {
      setConfirm(null);
    }
  };

  const syncLabel = !sync.configured
    ? 'Bulut senkronizasyonu yapılandırılmadı.'
    : sync.phase === 'syncing'
      ? 'Senkronize ediliyor…'
      : sync.phase === 'offline'
        ? 'Çevrimdışı'
        : sync.phase === 'error'
          ? 'Senkronizasyon hatası'
          : sync.pendingCount > 0
            ? 'Senkronizasyon bekliyor'
            : 'Bulut ile senkronize';

  return (
    <div className="flex flex-col gap-3">
      <PageHeader eyebrow="Ayarlar" title="Ayarlar" />

      <Card title="Bulut senkronizasyonu">
        <Row
          label="Bağlantı"
          value={
            <span className={cx(sync.configured ? (sync.phase === 'error' ? 'text-danger' : 'text-success') : 'text-muted')}>
              {sync.configured ? (sync.phase === 'error' ? 'Hata' : 'Bağlı') : 'Yapılandırılmadı'}
            </span>
          }
        />
        <Row label="Durum" value={syncLabel} />
        <Row label="Son senkronizasyon" value={formatDateTimeTr(sync.lastSyncAt)} />
        <Row label="Bekleyen kayıt" value={sync.pendingCount} />
        {sync.lastError && <p className="mt-2 text-[13px] text-danger">{sync.lastError}</p>}

        {(!sync.configured || editingSecret) && (
          <div className="mt-4">
            {!sync.configured && (
              <p className="mb-3 text-[13px] leading-relaxed text-muted">
                Uygulama şu an yalnızca bu cihazda çalışıyor. Yedekleme ve diğer cihazlarla eşitleme için Netlify'da
                tanımladığınız <code className="rounded bg-elevated px-1">APP_SECRET</code> değerini girin.
              </p>
            )}
            <label className="block">
              <span className="text-[13px] font-medium text-muted">Bulut anahtarı</span>
              <input
                type="password"
                value={secretInput}
                onChange={(e) => setSecretInput(e.target.value)}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="APP_SECRET"
                className="mt-1.5 w-full rounded-2xl border border-line bg-elevated px-4 py-3 text-[16px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/60"
              />
            </label>
            <div className={cx('mt-2 grid gap-2', editingSecret ? 'grid-cols-2' : 'grid-cols-1')}>
              <Button onClick={onSaveSecret} loading={savingSecret}>
                Bağlan
              </Button>
              {editingSecret && (
                <Button variant="secondary" onClick={() => { setEditingSecret(false); setSecretInput(''); }}>
                  Vazgeç
                </Button>
              )}
            </div>
          </div>
        )}

        {sync.configured && !editingSecret && (
          <>
            <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
              <Button onClick={onSync} loading={syncing || sync.phase === 'syncing'}>
                Şimdi Senkronize Et
              </Button>
              <Button variant="secondary" onClick={onTest} loading={testing}>
                Test
              </Button>
            </div>
            <div className="mt-2 flex justify-between text-[13px]">
              <button type="button" onClick={() => setEditingSecret(true)} className="font-semibold text-accent">
                Anahtarı değiştir
              </button>
              <button type="button" onClick={onRemoveSecret} className="font-semibold text-danger">
                Bağlantıyı kaldır
              </button>
            </div>
          </>
        )}
      </Card>

      <Card title="Görünüm">
        <div role="radiogroup" aria-label="Tema" className="grid grid-cols-3 gap-2">
          {THEME_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={theme.setting === o.value}
              onClick={() => theme.setSetting(o.value)}
              className={cx(
                'min-h-[48px] rounded-2xl text-[15px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                theme.setting === o.value ? 'bg-accent text-accent-ink' : 'bg-elevated text-ink',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </Card>

      <Card title="Veri">
        <Row label="Toplam kayıt" value={logs.length} />
        <Row label="İlk kayıt tarihi" value={first ? formatLongDateTr(first.date) : '—'} />
        <Row label="Son kayıt tarihi" value={last ? formatLongDateTr(last.date) : '—'} />
        <Row label="Son yedek tarihi" value={formatDateTimeTr(lastBackupAt)} />
        <div className="mt-4 flex flex-col gap-2">
          <Button variant="secondary" fullWidth onClick={onExportJson} disabled={logs.length === 0}>
            JSON Yedeği İndir
          </Button>
          <Button variant="secondary" fullWidth onClick={() => fileInput.current?.click()}>
            JSON Yedeğinden Geri Yükle
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="Yedek dosyası seç"
            onChange={(e) => void onPickFile(e.target.files?.[0])}
          />
          <Button variant="secondary" fullWidth onClick={onExportCsv} disabled={logs.length === 0}>
            CSV Dışa Aktar
          </Button>
        </div>
      </Card>

      <Card title="Tehlikeli bölge">
        <p className="mb-3 text-[13px] text-muted">
          Silme işlemleri geri alınamaz. Önce bir JSON yedeği indirmeniz önerilir.
        </p>
        <div className="flex flex-col gap-2">
          <Button variant="danger-outline" fullWidth onClick={() => setConfirm('local')} disabled={logs.length === 0}>
            Yerel verileri sil
          </Button>
          <Button variant="danger" fullWidth onClick={() => setConfirm('all')} disabled={!sync.configured}>
            Yerel + bulut verilerini sil
          </Button>
        </div>
      </Card>

      {IS_DEV && (
        <Card title="Geliştirici (yalnızca dev)">
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              onClick={async () => {
                const n = await seedDatabase();
                setSeeded(true);
                show(`${n} örnek kayıt eklendi.`, 'success');
              }}
            >
              Örnek veri ekle
            </Button>
            <Button
              variant="danger-outline"
              disabled={!seeded}
              onClick={async () => {
                const n = await removeSeedData();
                setSeeded(false);
                show(`${n} örnek kayıt silindi.`, 'success');
              }}
            >
              Örnek veriyi sil
            </Button>
          </div>
        </Card>
      )}

      <p className="pb-2 text-center text-[12px] text-faint">Daily v{__APP_VERSION__} · Veriler yalnızca bu cihazda ve kendi veritabanınızda tutulur.</p>

      <ConfirmDialog
        open={confirm === 'local'}
        title="Yerel verileri sil"
        message={`Bu cihazdaki ${logs.length} kayıt silinecek. Buluttaki veriler korunur ve bir sonraki senkronizasyonda geri gelir.`}
        confirmLabel="Yerel Verileri Sil"
        typeToConfirm="SİL"
        danger
        onConfirm={onDeleteLocal}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'all'}
        title="Tüm verileri sil"
        message={'Hem bu cihazdaki hem de buluttaki TÜM kayıtlar kalıcı olarak silinecek.\n\nBu işlem geri alınamaz.'}
        confirmLabel="Hepsini Sil"
        typeToConfirm="HEPSİNİ SİL"
        danger
        onConfirm={onDeleteAll}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'import'}
        title="Yedeği geri yükle"
        message={
          pendingImport
            ? `${pendingImport.records.length} kayıt bulundu${pendingImport.rejected.length ? `, ${pendingImport.rejected.length} geçersiz kayıt atlanacak` : ''}.\n\nAynı tarihe ait kayıtlarda daha yeni olan korunur; mevcut veriler silinmez.`
            : ''
        }
        confirmLabel="Geri Yükle"
        onConfirm={onImport}
        onCancel={() => {
          setConfirm(null);
          setPendingImport(null);
        }}
      />
    </div>
  );
}
