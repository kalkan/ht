# Daily — kişisel günlük takip PWA

**Daily** is a single-user, offline-first Progressive Web App for tracking a few daily habits: workout, cigarettes, water, alcohol, healthy eating and weight. It is built for iPhone Safari and feels like a native app once added to the Home Screen.

Everything runs on free tiers:

- the app is static and hosted on **Netlify**;
- data lives in the browser's **IndexedDB** (via Dexie) and works fully offline;
- cloud backup and cross-device sync go through a **Netlify Function** backed by **Neon Postgres** (Netlify DB).

No analytics, no telemetry, no third-party trackers. Records leave the device only when they are synchronised to *your* database.

```
iPhone PWA
  └─ IndexedDB (Dexie)          ← primary working storage, always available offline
       └─ sync layer            ← pending queue, retry, last-write-wins merge
            └─ POST /api/logs   ← Netlify Function (netlify/functions/logs.mts)
                 └─ Neon Postgres (table daily_logs, one row per date)
```

---

## Contents

1. [Features](#features)
2. [Tech stack](#tech-stack)
3. [Local development](#local-development)
4. [Deploying to Netlify](#deploying-to-netlify)
5. [Database setup (Neon)](#database-setup-neon)
6. [Connecting the app (PIN)](#connecting-the-app-pin)
7. [Installing on iPhone](#installing-on-iphone)
8. [Offline behaviour](#offline-behaviour)
9. [Synchronisation and conflict resolution](#synchronisation-and-conflict-resolution)
10. [Backups and export](#backups-and-export)
11. [Data rules](#data-rules)
12. [API reference](#api-reference)
13. [Security limitations](#security-limitations)
14. [Browser / PWA limitations](#browser--pwa-limitations)
15. [Troubleshooting](#troubleshooting)
16. [Project structure](#project-structure)
17. [Development-only seed data](#development-only-seed-data)

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

**Ayarlar (Settings)** — cloud connection (PIN), sync status, last sync time, pending count, manual sync, Light/Dark/System theme, JSON backup & restore, CSV export, record counts, and two separately confirmed delete operations (local only, or local + cloud).

Also: installable PWA with offline shell, update banner ("Yeni sürüm mevcut" → "Güncelle"), install hint when opened in Safari, toasts, safe-area aware bottom navigation.

## Tech stack

React 18 · TypeScript · Vite 6 · Tailwind CSS 3 · Dexie 4 (IndexedDB) · Recharts 2 · vite-plugin-pwa (Workbox) · Vitest · Netlify (hosting + Functions) · Neon Postgres via `@neondatabase/serverless`.

## Local development

Requirements: Node.js 20+ (22 recommended) and npm.

```bash
npm install
npm run dev               # http://localhost:5173  (frontend only, local-only mode)
```

To run the cloud API locally as well, use the Netlify CLI, which starts Vite and serves the function on the same origin:

```bash
npx netlify login         # once
npx netlify link          # once, picks the Netlify site
npx netlify dev           # http://localhost:8888  (Vite + /api/logs)
```

`netlify dev` pulls `APP_SECRET` and `NETLIFY_DATABASE_URL`/`DATABASE_URL` from the linked site, or you can put them in a local `.env` (see `.env.example`). `VITE_APP_SECRET` in `.env` prefills the PIN so you don't have to type it in Settings during development.

Other scripts:

```bash
npm run typecheck   # tsc -b (app + netlify function)
npm run lint        # eslint
npm test            # vitest: analytics, backup/CSV, IndexedDB merge, and the API against PGlite (in-process Postgres)
npm run build       # production build into dist/
npm run preview     # serve dist/ locally (service worker enabled, no API)
```

Without a PIN the app runs in **local-only mode**: everything works, and the header shows *Yalnızca yerel*.

## Deploying to Netlify

1. Push this repository to GitHub.
2. In Netlify: **Add new site → Import an existing project → GitHub → pick the repo.** Netlify reads [`netlify.toml`](netlify.toml): build command `npm run build`, publish directory `dist`, functions directory `netlify/functions`. Leave the defaults.
3. Before the first deploy (or right after), open **Site configuration → Environment variables** and add:
   - `APP_SECRET` — a long random string (see below). This is the PIN you will enter in the app.
   - `DATABASE_URL` — your Neon connection string (skip if you use Netlify DB, which sets `NETLIFY_DATABASE_URL` for you).
4. Trigger a deploy (**Deploys → Trigger deploy**). Every push to `main` deploys automatically afterwards.
5. Your site is served at `https://<site-name>.netlify.app/`. You can rename the site under **Site configuration → Site details → Change site name**.

Generate a secret locally:

```bash
openssl rand -hex 24
# or
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

The function refuses to run with an `APP_SECRET` shorter than 6 characters.

The repository's GitHub Actions workflow ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) only runs checks (typecheck, lint, tests, build); Netlify does the deploy.

## Database setup (Neon)

Pick one of the two routes. Both are free.

**Route A — Netlify DB (fastest).** In your Netlify site open the **Database** tab (Netlify DB, powered by Neon) and click **Add database** — or run `npx netlify db init` from the project. Netlify creates a Neon database and sets `NETLIFY_DATABASE_URL` on the site automatically; the function picks it up with no further config. Netlify DB databases created this way are provisional: **claim** them to a free Neon account from the same Database tab within 7 days, otherwise they are deleted.

**Route B — your own Neon project.**

1. Sign up at <https://neon.tech> (free plan).
2. **New project**, any name, region close to you.
3. In the project dashboard click **Connect**, choose the *pooled* connection string, copy it. It looks like `postgresql://user:password@ep-...-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require`.
4. In Netlify add it as `DATABASE_URL`.

The function creates the `daily_logs` table itself on first use:

| column | type | note |
| --- | --- | --- |
| `date` | `TEXT PRIMARY KEY` | YYYY-MM-DD, the logical key — one row per day |
| `id` | `TEXT` | UUID generated by the device that first created the day |
| `workout` | `TEXT` | push / pull / legs_core / cardio / none |
| `cigarettes` | `INTEGER` | |
| `water_enough`, `alcohol`, `healthy_diet` | `BOOLEAN` | |
| `weight` | `NUMERIC(5,1)` | `NULL` when not weighed, never 0 |
| `created_at`, `updated_at` | `TIMESTAMPTZ` | `updated_at` drives last-write-wins |
| `device_id` | `TEXT` | random per-install id, informational |

Neon's free tier auto-suspends the compute after inactivity and wakes it on the next query; the first sync after a pause can take a second or two. Nothing is deleted.

## Connecting the app (PIN)

The app does not ship with the secret baked in. On each device:

1. Open the site (or the installed Home Screen app) → **Ayarlar**.
2. Under **Bulut senkronizasyonu** enter the `APP_SECRET` value into **Bulut anahtarı** and tap **Bağlan**.
3. The app immediately syncs: it pulls everything already in the database and pushes local records.

The key is stored in that device's `localStorage` only. **Anahtarı değiştir** replaces it, **Bağlantıyı kaldır** removes it (local data stays). A rejected key is not kept, so a typo just shows *Bulut anahtarı hatalı.* and lets you try again.

## Installing on iPhone

1. Open the deployed URL in **Safari** on your iPhone (not Chrome — only Safari can install PWAs on iOS).
2. Tap the **Share** button (square with an arrow).
3. Tap **Add to Home Screen** (*Ana Ekrana Ekle*).
4. Confirm the name **Daily** and tap **Add**.
5. Launch **Daily** from the Home Screen.

The installed app runs in standalone mode: no Safari toolbar, its own icon, safe-area padding for the notch and Home Indicator, and it opens offline.

## Offline behaviour

- The application shell (HTML, JS, CSS, icons, manifest) is precached by a Workbox service worker, so the app opens without a connection.
- Every save goes to IndexedDB first and is marked `syncStatus: "pending"`. The UI shows success immediately; the network is never awaited.
- If the device is online, a background sync starts right after saving. If it fails, the record stays local with `pending`/`error` status and is retried:
  - on the next app start,
  - when the browser goes from offline to online,
  - when the app returns to the foreground with pending records,
  - when you tap **Şimdi Senkronize Et** in Settings.
- The header badge shows the state subtly: *Bulut ile senkronize*, *Senkronizasyon bekliyor*, *Senkronizasyon hatası*, *Çevrimdışı*, or *Yalnızca yerel* when no key is set.
- API requests time out after 20 s; timeouts, HTTP errors, non-JSON responses and rejected requests are all reported as sync errors without affecting local data.

### PWA updates

The service worker is registered in *prompt* mode. When a new build is deployed, the app shows **"Yeni sürüm mevcut."** with a **Güncelle** button. Nothing reloads until you tap it, so an unsaved form is never lost. The app also checks for updates once an hour while open. `netlify.toml` sends `Cache-Control: no-cache` for `sw.js` so new versions are noticed promptly.

## Synchronisation and conflict resolution

`date` (YYYY-MM-DD, local timezone) is the logical primary key everywhere: the IndexedDB table has a unique index on it and the Postgres table uses it as primary key, so neither side can ever hold two rows for the same day.

A sync run does:

1. **Pull** all rows from the database and merge them into IndexedDB.
2. **Push** every local row that is still `pending`/`error` with `upsertMany`.
3. Mark pushed rows `synced` and record the sync time.

**Last-write-wins on `updatedAt`** (ISO 8601, set by the device at save time):

| Situation | Result |
| --- | --- |
| Date exists only remotely | Added locally as `synced` |
| Date exists only locally | Pushed (`INSERT`) |
| Remote `updatedAt` is newer | Remote overwrites local (local `id` is kept) |
| Local `updatedAt` is newer | Local is pushed; the SQL upsert only updates `WHERE EXCLUDED.updated_at > daily_logs.updated_at`, so an old client can never overwrite a newer row |
| Same `updatedAt` | Local marked `synced`, nothing written |

This is intentionally simple. If you edit the same day on two devices while both are offline, the edit saved *last* wins when both come online; the other edit is discarded. The `device_id` column is a random UUID generated per install (no hardware identifiers) and is informational only.

Deleting a day in History deletes it locally at once and, when online, also from the database. Deleting local data in Settings never touches the cloud unless you explicitly choose **Yerel + bulut verilerini sil**; that option deletes the cloud copy first and keeps local data if the cloud call fails.

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

**JSON Yedeğinden Geri Yükle** validates every record (date format, workout value, non-negative cigarettes, boolean fields, positive weight, timestamps). Malformed records are skipped and counted; a structurally invalid file is rejected with a message. Import merges by date with last-write-wins, so restoring the same backup twice never duplicates a day. Imported rows are marked `pending` and synced to the cloud. `version` is checked so future schema migrations can be added in `utils/backup.ts`. Files with a bare array of records, and files using the database's snake_case column names, are accepted too.

**CSV Dışa Aktar** produces a UTF-8 file with a BOM (so Excel shows Turkish characters correctly), CRLF line endings, and the columns `date, workout, cigarettes, water_enough, alcohol, healthy_diet, weight, created_at, updated_at`.

On iPhone, downloads open the share sheet — choose *Save to Files*.

## Data rules

- A missing day means **no record**. Days are never filled in automatically.
- A missing weight means **no measurement**: `weight` is absent locally and `NULL` in Postgres, never `0`, and yesterday's weight is never carried forward.
- Charts and statistics use recorded days only. Denominators are actual counts, e.g. *12 / 15 kayıtlı gün*, never the number of days in the month.
- The 7-day moving average runs over the last seven *recorded* days.
- The weight chart draws only real measurements; there is no interpolation across unmeasured days.
- Streaks count consecutive calendar days that have a record (today or yesterday may be the last day).

## API reference

`POST /api/logs` with `Authorization: Bearer <APP_SECRET>` and a JSON body `{ "action": "...", ... }`. `GET /api/logs` is a health check.

| action | payload | data returned |
| --- | --- | --- |
| `ping` | — | `{ ok: true }` (no database access) |
| `getAll` | — | array of records, sorted by date |
| `getByDate` | `date` | record or `null` |
| `upsert` | `data` (record) | `{ action: "inserted" \| "updated" \| "skipped", record }` |
| `upsertMany` | `data` (array, max 500) | `{ count, results }` |
| `delete` | `date` | `{ deleted }` |
| `deleteAll` | `confirm: "DELETE_ALL"` | `{ deleted }` |

Responses are `{ "success": true, "data": … }` or `{ "success": false, "error": "…" }` with HTTP 400/401/405/500. Stack traces and connection details are never returned. The core logic lives in [`netlify/lib/logsApi.ts`](netlify/lib/logsApi.ts) and is unit-tested against PGlite.

## Security limitations

- **`APP_SECRET` is a shared PIN.** Anyone who has both the site URL and the PIN can read and write your data. It is compared in constant time and a wrong attempt is delayed 400 ms, but there is no lockout. Use a long random value, not a 4-digit number.
- The PIN is stored in the browser's `localStorage` on each device you connect. Clearing site data removes it.
- The database connection string and the PIN live only in Netlify environment variables; they never reach the browser. This is the main improvement over embedding a secret in the frontend bundle.
- Rotate the key by changing `APP_SECRET` in Netlify (redeploy not required for functions to pick it up on the next invocation) and entering the new value in the app on each device.
- No cookies, no login, no third-party requests except to your own site's `/api/logs`.

## Browser / PWA limitations

- **iOS storage eviction:** Safari can delete IndexedDB and `localStorage` for sites not used for a while (roughly 7 days for a non-installed web page). Installed Home Screen apps are exempt in practice, but the OS may still evict data under storage pressure. Keep the cloud connected or download JSON backups.
- **Sync needs the app open.** iOS does not run background sync for web apps; pending rows are pushed when the app is opened or brought to the foreground.
- **No push notifications / reminders** are implemented.
- **Neon cold start:** after inactivity the first request may take 1–3 s.
- Chrome on iOS uses the Safari engine but cannot install PWAs; use Safari for installation.

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| *Yalnızca yerel* in the header | No PIN entered yet on this device. Ayarlar → Bulut anahtarı → Bağlan. |
| *Bulut anahtarı hatalı.* | The value differs from `APP_SECRET` in Netlify, or `APP_SECRET` is not set / shorter than 6 characters. |
| *Sunucu hatası: Database is not configured* | Neither `NETLIFY_DATABASE_URL` nor `DATABASE_URL` is set on the Netlify site. Add it and redeploy. |
| *Sunucu hatası: Internal error* | Check Netlify → Logs → Functions → `logs` for the real message (usually a bad connection string or a paused/deleted Neon project). |
| *Bulut sunucusuna ulaşılamadı.* | Offline, or the site is not deployed with functions (check that `netlify/functions/logs.mts` exists in the deploy log). |
| App shows an old version | Wait for *Yeni sürüm mevcut* and tap **Güncelle**. On iOS, fully closing and reopening the app also helps. |
| Restore says records are invalid | The file was edited by hand or comes from another app. Each record needs `id`, `date` (YYYY-MM-DD), a valid `workout`, booleans and timestamps. |
| Netlify DB database disappeared | Unclaimed Netlify DB databases expire after 7 days; claim it to a Neon account or use Route B above. |

## Project structure

```
netlify/
  functions/logs.mts     Netlify Function: auth, JSON envelope, Neon connection
  lib/logsApi.ts         pure API core: validation, SQL, last-write-wins upsert
  lib/logsApi.test.ts    tests against PGlite (real Postgres semantics, in-process)
netlify.toml             build/publish/functions config, SPA redirect, cache headers
public/icons/            PWA icons, Apple touch icon, favicon
src/
  App.tsx                tab shell, update banner, error boundary
  main.tsx               entry, applies persisted theme before first paint
  index.css              Tailwind + colour tokens (light/dark)
  components/            ui.tsx (Card, Button, SegmentedControl, YesNo, Stepper…), LogForm,
                         BottomNav, ConfirmDialog, charts, SyncBadge, ToastHost, UpdateBanner…
  pages/                 TodayPage, HistoryPage, DashboardPage, SettingsPage
  db/database.ts         Dexie schema (unique date index), upsert, helpers
  services/
    config.ts            cloud API URL + PIN storage (localStorage)
    cloudApi.ts          fetch client for /api/logs (timeouts, validation, mapping)
    syncService.ts       pending queue, retry triggers, last-write-wins merge
    deviceId.ts          random per-install id
    seed.ts              development-only sample data
  hooks/                 useLogs (live queries), useSyncState, useTheme, usePwaUpdate, useToast…
  utils/
    analytics.ts         pure statistics helpers (streaks, averages, ratios, weight)
    backup.ts            JSON backup/restore validation, CSV
    dateUtils.ts         local-timezone YYYY-MM-DD helpers, Turkish formatting
    labels.ts, cx.ts, download.ts, logForm.ts
  types/DailyLog.ts      DailyLog / RemoteDailyLog interfaces
.github/workflows/ci.yml GitHub Actions: typecheck, lint, test, build
```

## Development-only seed data

In `npm run dev` the Settings screen shows a **Geliştirici** card with *Örnek veri ekle* (≈75 days of realistic sample data with all workout types, a downward cigarette trend, ~60 % weigh-in days and a weight trend) and *Örnek veriyi sil*. Seed records have ids prefixed `seed-` and are never created automatically; the card and the code path are excluded from production builds.

## Tests

```bash
npm test
```

Covers streak/average/moving-average/month-comparison/weight helpers, backup validation and CSV output, Dexie upsert uniqueness (including concurrent saves for one date), the last-write-wins merge, and the whole API core (schema creation, upsert semantics, validation, delete) against PGlite. The build also ran an end-to-end browser check of PIN entry, offline save, reconnect sync, conflict resolution, backup, restore, CSV export and offline shell loading.
