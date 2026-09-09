# Daily — kişisel günlük takip PWA

**Daily** is a single-user, offline-first Progressive Web App for tracking a few daily habits: workout, cigarettes, water, alcohol, healthy eating and weight. It is built for iPhone Safari and feels like a native app once added to the Home Screen.

Everything runs for free:

- the app is static and hosted on **GitHub Pages**;
- data lives in the browser's **IndexedDB** (via Dexie);
- cloud backup and cross-device sync go through a **Google Apps Script** Web App that writes to a **Google Sheet** in your own Google Drive.

No analytics, no telemetry, no third-party services. Records leave the device only when they are synchronised to *your* sheet.

```
iPhone PWA
  └─ IndexedDB (Dexie)          ← primary working storage, always available offline
       └─ sync layer            ← pending queue, retry, last-write-wins merge
            └─ Google Apps Script Web App
                 └─ Google Sheet ("DailyLogs" worksheet) in your Drive
```

---

## Contents

1. [Features](#features)
2. [Tech stack](#tech-stack)
3. [Local development](#local-development)
4. [Google Sheet + Apps Script setup](#google-sheet--apps-script-setup)
5. [Environment configuration](#environment-configuration)
6. [GitHub Pages deployment](#github-pages-deployment)
7. [Installing on iPhone](#installing-on-iphone)
8. [Offline behaviour](#offline-behaviour)
9. [Synchronisation and conflict resolution](#synchronisation-and-conflict-resolution)
10. [Backups and export](#backups-and-export)
11. [Data rules](#data-rules)
12. [Security limitations](#security-limitations)
13. [Browser / PWA limitations](#browser--pwa-limitations)
14. [Troubleshooting](#troubleshooting)
15. [Project structure](#project-structure)
16. [Development-only seed data](#development-only-seed-data)

---

## Features

**Bugün (Today)** — a card-based form that takes 15–30 seconds:

| Question | Control | Stored as |
| --- | --- | --- |
| Bugün spor yaptın mı? | Push / Pull / Bacak + Core / Kardiyo / Yapmadım | `workout: push \| pull \| legs_core \| cardio \| none` |
| Bugün kaç sigara içtin? | `[-] 3 [+]` stepper, min 0 | `cigarettes: number` |
| Yeterli su içtin mi? | Evet / Hayır | `waterEnough: boolean` |
| Bugün alkol aldın mı? | Evet / Hayır | `alcohol: boolean` |
| Sağlıklı beslenme rutinine uydun mu? | Evet / Hayır | `healthyDiet: boolean` |
| Bugünkü kilon? | decimal kg, optional, "Bugün tartılmadım" | `weight?: number` |

The previous weight is shown as *Son kayıt: 78,2 kg* for reference; it is never copied into today's record. One record per calendar day: opening the app again loads today's record for editing, and saving updates it in place.

**Geçmiş (History)** — month calendar with dots on logged days, day details, previous/next day navigation, edit and delete.

**İstatistik (Dashboard)** — logging streak, monthly completion, workout distribution, cigarette average / total / 7-day moving average / previous-month comparison with percentage change, water / alcohol-free / healthy-eating percentages, weight trend (latest, first, total change, last-30-day change). Period filters: 7 gün, 30 gün, Bu ay, 3 ay, 6 ay, 1 yıl, Tümü.

**Ayarlar (Settings)** — sync status, last sync time, pending count, manual sync, Light/Dark/System theme, JSON backup & restore, CSV export, record counts, and two separately confirmed delete operations (local only, or local + cloud).

Also: installable PWA with offline shell, update banner ("Yeni sürüm mevcut" → "Güncelle"), install hint when opened in Safari, toasts, safe-area aware bottom navigation.

## Tech stack

React 18 · TypeScript · Vite 6 · Tailwind CSS 3 · Dexie 4 (IndexedDB) · Recharts 2 · vite-plugin-pwa (Workbox) · Vitest · Google Apps Script · Google Sheets · GitHub Pages / GitHub Actions.

## Local development

Requirements: Node.js 20+ (22 recommended) and npm.

```bash
npm install
cp .env.example .env      # optional – leave empty for local-only mode
npm run dev               # http://localhost:5173
```

Other scripts:

```bash
npm run typecheck   # tsc -b
npm run lint        # eslint
npm test            # vitest (analytics, backup/CSV, database + merge tests)
npm run build       # production build into dist/
npm run preview     # serve dist/ locally (service worker enabled)
```

Without `VITE_APPS_SCRIPT_URL` / `VITE_APP_SECRET` the app runs in **local-only mode**: everything works, and Settings shows *"Bulut senkronizasyonu yapılandırılmadı."*

## Google Sheet + Apps Script setup

The backend is a single file, [`apps-script/Code.gs`](apps-script/Code.gs). A step-by-step guide with screenshots-in-words lives in [`apps-script/README.md`](apps-script/README.md). Short version:

1. **Create a Google Sheet** at <https://sheets.new>. Name it e.g. *Daily Tracker*. The `DailyLogs` worksheet and its headers are created automatically on first use.
2. **Copy the Sheet ID** from the URL: `https://docs.google.com/spreadsheets/d/`**`<SHEET_ID>`**`/edit`.
3. In the sheet open **Extensions → Apps Script**.
4. Delete the default content of `Code.gs` and **paste the contents of `apps-script/Code.gs`**.
5. Set `SHEET_ID` to the ID from step 2.
6. Set `APP_SECRET` to a long random string (e.g. run `openssl rand -hex 24` locally). Keep it private.
7. Save, then **Deploy → New deployment**. Click the gear next to *Select type* and pick **Web app**.
8. Deployment settings — these are essential:
   - **Execute as:** `Me` (your account — so the script can write to your sheet)
   - **Who has access:** `Anyone` (the app calls it anonymously; the `APP_SECRET` in the body is the gate)
9. Click **Deploy**, approve the permission prompt (*Advanced → Go to … (unsafe)* is normal for your own script), and **copy the Web App URL**. It ends with `/exec`.
10. Put that URL and your secret into the frontend configuration (next section).

Every time you change `Code.gs` you must create a **new deployment version** (Deploy → Manage deployments → edit → *New version*), otherwise the `/exec` URL keeps serving the old code.

The API is JSON over `POST` with `{ "action": "...", "secret": "...", ... }`. Actions: `ping`, `getAll`, `getByDate`, `upsert`, `upsertMany`, `delete`, `deleteAll`. Responses are `{ "success": true, "data": … }` or `{ "success": false, "error": "…" }`; stack traces are never returned. The sheet ID stays inside the script and is never exposed to the frontend.

## Environment configuration

`.env` (never committed) or GitHub Actions secrets:

```env
VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/XXXX/exec
VITE_APP_SECRET=the-same-value-as-APP_SECRET-in-Code.gs
VITE_BASE_PATH=/daily-tracker/      # only needed for GitHub Pages project sites
```

See [`.env.example`](.env.example). Vite inlines `VITE_*` variables into the built JavaScript, which is why the secret is only *basic* protection (see [Security limitations](#security-limitations)).

## GitHub Pages deployment

The workflow in [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) builds and deploys on every push to `main`.

1. Push this repository to GitHub (this project lives at `kalkan/ht`; the examples below use `daily-tracker` as a generic name).
2. **Settings → Pages → Build and deployment → Source:** choose **GitHub Actions**.
3. **Settings → Secrets and variables → Actions → New repository secret**, add:
   - `VITE_APPS_SCRIPT_URL`
   - `VITE_APP_SECRET`
   (Skip these for a local-only deployment.)
4. Push to `main` (or run the workflow manually under **Actions → Deploy to GitHub Pages → Run workflow**).
5. The app is served at `https://USERNAME.github.io/<repository-name>/`, for this repository `https://kalkan.github.io/ht/`.

The workflow sets `VITE_BASE_PATH=/<repository-name>/` automatically, so Vite's `base`, the manifest `start_url`/`scope`, and the service worker navigation fallback all use the correct sub-path. If you deploy to a user site (`USERNAME.github.io` repository), change that env line to `VITE_BASE_PATH: /`. A `404.html` copy of `index.html` is added so deep links work on Pages.

Local check of the Pages build:

```bash
VITE_BASE_PATH=/daily-tracker/ npm run build && npx vite preview
```

## Installing on iPhone

1. Open the deployed URL in **Safari** on your iPhone (not Chrome — only Safari can install PWAs on iOS).
2. Tap the **Share** button (square with an arrow).
3. Tap **Add to Home Screen** (*Ana Ekrana Ekle*).
4. Confirm the name **Daily** and tap **Add**.
5. Launch **Daily** from the Home Screen.

The installed app runs in standalone mode: no Safari toolbar, its own icon, safe-area padding for the notch and Home Indicator, and it opens offline.

## Offline behaviour

- The application shell (HTML, JS, CSS, icons, manifest) is precached by a Workbox service worker, so the app opens without a connection.
- Every save goes to IndexedDB first and is marked `syncStatus: "pending"`. The UI shows success immediately; Google is never awaited.
- If the device is online, a background sync starts right after saving. If it fails, the record stays local with `pending`/`error` status and is retried:
  - on the next app start,
  - when the browser goes from offline to online,
  - when the app returns to the foreground with pending records,
  - when you tap **Şimdi Senkronize Et** in Settings.
- The header badge shows the state subtly: *Bulut ile senkronize*, *Senkronizasyon bekliyor*, *Senkronizasyon hatası*, *Çevrimdışı*, or *Yalnızca yerel* when sync is not configured.
- Apps Script requests time out after 20 s; timeouts, HTTP errors, non-JSON responses (e.g. a Google login page when the deployment is misconfigured) and rejected requests are all reported as sync errors without affecting local data.

### PWA updates

The service worker is registered in *prompt* mode. When a new build is deployed, the app shows **"Yeni sürüm mevcut."** with a **Güncelle** button. Nothing reloads until you tap it, so an unsaved form is never lost. The app also checks for updates once an hour while open.

## Synchronisation and conflict resolution

`date` (YYYY-MM-DD, local timezone) is the logical primary key everywhere: the IndexedDB table has a unique index on it, the Apps Script upsert looks rows up by it, and the sheet never gets two rows for the same date.

A sync run does:

1. **Pull** all rows from the sheet and merge them into IndexedDB.
2. **Push** every local row that is still `pending`/`error` in one `upsertMany` call.
3. Mark pushed rows `synced` and record the sync time.

**Last-write-wins on `updatedAt`** (ISO 8601, set by the device at save time):

| Situation | Result |
| --- | --- |
| Date exists only remotely | Added locally as `synced` |
| Date exists only locally | Pushed |
| Remote `updatedAt` is newer | Remote overwrites local (local `id` is kept) |
| Local `updatedAt` is newer | Local is pushed; the script also refuses to overwrite a newer sheet row with an older client version |
| Same `updatedAt` | Local marked `synced`, nothing written |

This is intentionally simple. If you edit the same day on two devices while both are offline, the edit saved *last* wins when both come online; the other edit is discarded. The `device_id` column in the sheet is a random UUID generated per install (no hardware identifiers) and is informational only.

Deleting a day in History deletes it locally at once and, when online, also from the sheet. Deleting local data in Settings never touches the sheet unless you explicitly choose **Yerel + bulut verilerini sil**; that option deletes the cloud copy first and keeps local data if the cloud call fails.

## Backups and export

**JSON Yedeği İndir** downloads:

```json
{
  "version": 1,
  "exportedAt": "2026-09-09T18:00:00.000Z",
  "app": "daily-tracker",
  "records": [ { "id": "…", "date": "2026-09-09", "workout": "push", … } ]
}
```

**JSON Yedeğinden Geri Yükle** validates every record (date format, workout value, non-negative cigarettes, boolean fields, positive weight, timestamps). Malformed records are skipped and counted; a structurally invalid file is rejected with a message. Import merges by date with last-write-wins, so restoring the same backup twice never duplicates a day. Imported rows are marked `pending` and synced to the sheet. `version` is checked so future schema migrations can be added in `utils/backup.ts`. Files with a bare array of records, and files using the sheet's snake_case column names, are accepted too.

**CSV Dışa Aktar** produces a UTF-8 file with a BOM (so Excel shows Turkish characters correctly), CRLF line endings, and the columns `date, workout, cigarettes, water_enough, alcohol, healthy_diet, weight, created_at, updated_at`.

On iPhone, downloads open the share sheet — choose *Save to Files*.

## Data rules

- A missing day means **no record**. Days are never filled in automatically.
- A missing weight means **no measurement**: `weight` is absent, never `0`, and yesterday's weight is never carried forward.
- Charts and statistics use recorded days only. Denominators are actual counts, e.g. *12 / 15 kayıtlı gün*, never the number of days in the month.
- The 7-day moving average runs over the last seven *recorded* days.
- The weight chart draws only real measurements; there is no interpolation across unmeasured days.
- Streaks count consecutive calendar days that have a record (today or yesterday may be the last day).

## Security limitations

Read this before relying on the cloud layer.

- **`APP_SECRET` is a shared token embedded in the built JavaScript.** Anyone who can read your deployed site's JS bundle (i.e. anyone who knows the URL, since GitHub Pages is public) can extract the secret and the Apps Script URL, and then read, modify or delete rows in your sheet. This is deliberate simplicity for a single-user personal app, not real authentication.
- Mitigations: keep the repository private if you can (GitHub Pages for private repos needs a paid plan, so the *site* stays public either way), do not share the URL, rotate the secret occasionally (update `Code.gs`, redeploy, update the GitHub secret, redeploy the site), and keep JSON backups.
- The Apps Script runs as *you* with access only to the sheet whose ID is hard-coded in the script. It cannot reach other files in your Drive.
- No cookies, no login, no third-party requests except to your own Apps Script URL.

## Browser / PWA limitations

- **iOS storage eviction:** Safari can delete IndexedDB for sites not used for a while (roughly 7 days for a non-installed web page). Installed Home Screen apps are exempt from that rule in practice, but the OS may still evict data under storage pressure. Keep sync configured or download JSON backups.
- **Sync needs the app open.** iOS does not run background sync for web apps; pending rows are pushed when the app is opened or brought to the foreground.
- **No push notifications / reminders** are implemented (they would need a server).
- **Apps Script cold starts** can take 1–3 s, and the free quota is more than enough for one user but not unlimited.
- **CORS:** the client sends `text/plain` bodies so the browser does not send a preflight, which Apps Script cannot answer. Do not change the request headers.
- Chrome on iOS uses the Safari engine but cannot install PWAs; use Safari for installation.

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| *Bulut senkronizasyonu yapılandırılmadı.* | `VITE_APPS_SCRIPT_URL` or `VITE_APP_SECRET` missing at **build** time. Set them in `.env` (local) or repository secrets (Pages) and rebuild. |
| *Geçersiz sunucu yanıtı (JSON değil)* | The Web App is not deployed with *Anyone* access, or the URL is the `/dev` URL instead of `/exec`, so Google returns an HTML login page. Redeploy with the settings above. |
| *Unauthorized* | `VITE_APP_SECRET` and `APP_SECRET` differ, or `APP_SECRET` still has the placeholder value. |
| *SHEET_ID is not configured* | Fill `SHEET_ID` in `Code.gs` and create a new deployment version. |
| Changes to `Code.gs` have no effect | Apps Script serves the deployed *version*. Deploy → Manage deployments → pencil → Version: *New version*. |
| *Senkronizasyon hatası* while online | Tap **Test** in Settings for the exact message. Check Apps Script → Executions for server-side errors. |
| App shows an old version | Open it, wait for *Yeni sürüm mevcut* and tap **Güncelle**. On iOS, fully closing and reopening the app also helps. |
| Blank page on GitHub Pages | Base path mismatch. The repo name must match `VITE_BASE_PATH`; for user sites use `/`. |
| Restore says records are invalid | The file was edited by hand or comes from another app. Each record needs `id`, `date` (YYYY-MM-DD), a valid `workout`, booleans and timestamps. |
| Duplicate dates in the sheet after manual edits | Run `dedupeSheet()` from the Apps Script editor; it keeps the newest `updated_at` per date. |

## Project structure

```
apps-script/
  Code.gs               Google Apps Script backend (paste into Apps Script)
  appsscript.json       manifest (V8 runtime, web app settings)
  README.md             detailed setup walkthrough
public/icons/           PWA icons, Apple touch icon, favicon
src/
  App.tsx               tab shell, update banner, error boundary
  main.tsx              entry, applies persisted theme before first paint
  index.css             Tailwind + colour tokens (light/dark)
  components/           ui.tsx (Card, Button, SegmentedControl, YesNo, Stepper…), LogForm,
                        BottomNav, ConfirmDialog, charts, SyncBadge, ToastHost, UpdateBanner…
  pages/                TodayPage, HistoryPage, DashboardPage, SettingsPage
  db/database.ts        Dexie schema (unique date index), upsert, helpers
  services/
    config.ts           env → runtime config, local-only detection
    googleApi.ts        Apps Script client (timeouts, validation, mapping)
    syncService.ts      pending queue, retry triggers, last-write-wins merge
    deviceId.ts         random per-install id
    seed.ts             development-only sample data
  hooks/                useLogs (live queries), useSyncState, useTheme, usePwaUpdate, useToast…
  utils/
    analytics.ts        pure statistics helpers (streaks, averages, ratios, weight)
    backup.ts           JSON backup/restore validation, CSV
    dateUtils.ts        local-timezone YYYY-MM-DD helpers, Turkish formatting
    labels.ts, cx.ts, download.ts, logForm.ts
  types/DailyLog.ts     DailyLog / RemoteDailyLog interfaces
.github/workflows/deploy.yml   GitHub Pages CI
```

## Development-only seed data

In `npm run dev` the Settings screen shows a **Geliştirici** card with *Örnek veri ekle* (≈75 days of realistic sample data with all workout types, a downward cigarette trend, ~60 % weigh-in days and a weight trend) and *Örnek veriyi sil*. Seed records have ids prefixed `seed-` and are never created automatically; the card and the code path are excluded from production builds.

## Tests

```bash
npm test
```

Covers streak/average/moving-average/month-comparison/weight helpers, backup validation and CSV output, Dexie upsert uniqueness (including concurrent saves for one date) and the last-write-wins merge. The build also ran an end-to-end browser check of offline save, reconnect sync, conflict resolution, backup, restore, CSV export and offline shell loading.
