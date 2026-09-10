# Daily — kişisel günlük takip PWA

**Daily** is a single-user, offline-first Progressive Web App for tracking a few daily habits: workout, cigarettes, water, alcohol, healthy eating and weight. It is built for iPhone Safari and feels like a native app once added to the Home Screen.

Everything runs on Firebase's free Spark plan:

- the app is static and served by **Firebase Hosting**;
- data lives in the browser's **IndexedDB** (via Dexie) and works fully offline;
- cloud backup and cross-device sync go to **Cloud Firestore**, protected by **Firebase Authentication** (email + password) and Firestore security rules.

The app talks to Firebase through its REST APIs, so **no Firebase SDK ships in the bundle** (the whole app is ~60 KB gzipped without charts). No analytics, no telemetry, no third-party trackers. Records leave the device only when they are synchronised to *your* Firestore database.

```
iPhone PWA
  └─ IndexedDB (Dexie)          ← primary working storage, always available offline
       └─ sync layer            ← pending queue, retry, last-write-wins merge
            └─ Firestore REST   ← users/{uid}/dailyLogs/{date}, owner-only rules
                 └─ Firebase Auth (email + password, REST, token auto-refresh)
```

---

## Contents

1. [Features](#features)
2. [Tech stack](#tech-stack)
3. [Local development](#local-development)
4. [Firebase project setup](#firebase-project-setup)
5. [Environment configuration](#environment-configuration)
6. [Deploying to Firebase Hosting](#deploying-to-firebase-hosting)
7. [Signing in on a device](#signing-in-on-a-device)
8. [Installing on iPhone](#installing-on-iphone)
9. [Offline behaviour](#offline-behaviour)
10. [Synchronisation and conflict resolution](#synchronisation-and-conflict-resolution)
11. [Backups and export](#backups-and-export)
12. [Data rules](#data-rules)
13. [Security notes](#security-notes)
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

**Ayarlar (Settings)** — Firebase sign-in / sign-out, sync status, last sync time, pending count, manual sync, Light/Dark/System theme, JSON backup & restore, CSV export, record counts, and two separately confirmed delete operations (local only, or local + cloud).

Also: installable PWA with offline shell, update banner ("Yeni sürüm mevcut" → "Güncelle"), install hint when opened in Safari, toasts, safe-area aware bottom navigation.

## Tech stack

React 18 · TypeScript · Vite 6 · Tailwind CSS 3 · Dexie 4 (IndexedDB) · Recharts 2 · vite-plugin-pwa (Workbox) · Vitest · Firebase Hosting · Cloud Firestore (REST) · Firebase Authentication (REST) · GitHub Actions.

## Local development

Requirements: Node.js 20+ (22 recommended) and npm.

```bash
npm install
cp .env.example .env      # fill in the two Firebase values, or leave empty for local-only mode
npm run dev               # http://localhost:5173
```

Other scripts:

```bash
npm run typecheck   # tsc -b
npm run lint        # eslint
npm test            # vitest: analytics, backup/CSV, IndexedDB merge, Firestore mapping, auth session
npm run build       # production build into dist/
npm run preview     # serve dist/ locally (service worker enabled)
```

Without the Firebase values the app runs in **local-only mode**: everything works, and the header shows *Yalnızca yerel*.

## Firebase project setup

All of this is in the Firebase console, <https://console.firebase.google.com>, on the free Spark plan.

### 1. Create the project

**Add project** → name it (e.g. *daily-tracker*) → you can disable Google Analytics → **Create project**.

### 2. Register a web app and copy the two identifiers

Project overview → **</> (Web)** → nickname *Daily* → **Register app**. From the config shown copy:

- `apiKey` → `VITE_FIREBASE_API_KEY`
- `projectId` → `VITE_FIREBASE_PROJECT_ID`

(You can always find them again under **Project settings → General → Your apps**.) These are public identifiers, not secrets; access control is done by rules and sign-in.

### 3. Enable Email/Password sign-in and create your user

1. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable → Save.**
2. **Users → Add user** → your e-mail and a strong password. This is the account you will sign in with on every device.
3. Prevent anyone else from creating accounts: **Authentication → Settings → User actions → uncheck "Enable create (sign-up)"** → Save.

### 4. Create the Firestore database

**Build → Firestore Database → Create database** → choose a location near you → start in **production mode** → Create.

### 5. Publish the security rules

**Firestore Database → Rules** → replace the contents with [`firestore.rules`](firestore.rules) from this repository → **Publish**.

The rules allow each signed-in user to read and write only `users/{their uid}/dailyLogs/{date}`, validate every field, and reject any write whose `updatedAt` is older than the stored one (last-write-wins enforced server-side).

Alternatively deploy them from the CLI: `npx firebase-tools deploy --only firestore:rules --project <projectId>`.

### 6. (Optional) API key restrictions

The web API key can be restricted to your hosting domain under Google Cloud console → APIs & Services → Credentials → the *Browser key (auto created by Firebase)* → Website restrictions → `https://<projectId>.web.app/*`. Not required.

## Environment configuration

`.env` (never committed) for local builds, repository secrets for GitHub Actions:

```env
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_PROJECT_ID=daily-tracker-12345
```

See [`.env.example`](.env.example).

## Deploying to Firebase Hosting

### Option A — from your computer (simplest)

```bash
npm install -g firebase-tools     # once
firebase login                    # once
firebase use --add                # pick the project, alias "default"
npm run build                     # uses .env
firebase deploy                   # hosting + firestore rules
```

The site is served at `https://<projectId>.web.app/` (and `https://<projectId>.firebaseapp.com/`).

### Option B — automatic deploys from GitHub (`.github/workflows/deploy.yml`)

Every push to `main` runs typecheck, lint, tests, build and then deploys to Hosting. Pull requests only build.

1. Create a service account secret. Easiest: run `firebase init hosting:github` locally once — it creates the service account and adds the `FIREBASE_SERVICE_ACCOUNT_<PROJECT>` secret to the GitHub repo for you (you can delete the workflow files it generates; this repo already has one). Rename that secret to `FIREBASE_SERVICE_ACCOUNT`, or edit the workflow to match.
   - Manual alternative: Google Cloud console → IAM & Admin → Service Accounts → create one with the roles *Firebase Hosting Admin*, *Cloud Run Viewer* and *API Keys Viewer* → Keys → Add key (JSON) → paste the JSON as the `FIREBASE_SERVICE_ACCOUNT` secret.
2. In the GitHub repo add **Settings → Secrets and variables → Actions**:
   - `FIREBASE_SERVICE_ACCOUNT` — the JSON from step 1
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_PROJECT_ID`
3. Push to `main` (or Actions → *Build and deploy to Firebase Hosting* → Run workflow).

The workflow deploys hosting only; Firestore rules are published from the console or CLI as described above.

`firebase.json` rewrites every path to `index.html` (SPA), disables caching for `sw.js` so updates are noticed promptly, and marks hashed assets immutable.

## Signing in on a device

1. Open the site (or the installed Home Screen app) → **Ayarlar**.
2. Under **Bulut senkronizasyonu** enter the e-mail and password of the user you created in Firebase → **Giriş Yap**.
3. The app immediately syncs: it pulls everything already in Firestore and pushes local records.

The session (refresh token) is stored in that device's `localStorage`; ID tokens are refreshed automatically every hour. **Çıkış Yap** signs out and keeps the local data.

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
- If the device is online and signed in, a background sync starts right after saving. If it fails, the record stays local with `pending`/`error` status and is retried:
  - on the next app start,
  - when the browser goes from offline to online,
  - when the app returns to the foreground with pending records,
  - when you tap **Şimdi Senkronize Et** in Settings.
- The header badge shows the state subtly: *Bulut ile senkronize*, *Senkronizasyon bekliyor*, *Senkronizasyon hatası*, *Çevrimdışı*, *Giriş yapılmadı*, or *Yalnızca yerel* when Firebase is not configured.
- Requests time out after 20 s; timeouts, HTTP errors, non-JSON responses and rejected requests are all reported as sync errors without affecting local data. An expired ID token is refreshed and the request retried once, transparently.

### PWA updates

The service worker is registered in *prompt* mode. When a new build is deployed, the app shows **"Yeni sürüm mevcut."** with a **Güncelle** button. Nothing reloads until you tap it, so an unsaved form is never lost. The app also checks for updates once an hour while open.

## Synchronisation and conflict resolution

`date` (YYYY-MM-DD, local timezone) is the logical primary key everywhere: the IndexedDB table has a unique index on it and the Firestore document ID *is* the date, so neither side can ever hold two records for the same day.

A sync run does:

1. **Pull** all documents from `users/{uid}/dailyLogs` (paged, 300 per request) and merge them into IndexedDB.
2. **Push** every local row that is still `pending`/`error` in commits of up to 400 writes.
3. Mark pushed rows `synced` and record the sync time.

**Last-write-wins on `updatedAt`** (ISO 8601, set by the device at save time):

| Situation | Result |
| --- | --- |
| Date exists only remotely | Added locally as `synced` |
| Date exists only locally | Pushed (document created) |
| Remote `updatedAt` is newer | Remote overwrites local (local `id` is kept) |
| Local `updatedAt` is newer | Local is pushed; the rules also reject any update whose `updatedAt` is older than the stored one, so an old client can never overwrite a newer document |
| Same `updatedAt` | Local marked `synced`, nothing written |

This is intentionally simple. If you edit the same day on two devices while both are offline, the edit saved *last* wins when both come online; the other edit is discarded. The `deviceId` field is a random UUID generated per install (no hardware identifiers) and is informational only.

Deleting a day in History deletes it locally at once and, when online, also from Firestore. Deleting local data in Settings never touches the cloud unless you explicitly choose **Yerel + bulut verilerini sil**; that option deletes the cloud copy first and keeps local data if the cloud call fails.

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

**JSON Yedeğinden Geri Yükle** validates every record (date format, workout value, non-negative cigarettes, boolean fields, positive weight, timestamps). Malformed records are skipped and counted; a structurally invalid file is rejected with a message. Import merges by date with last-write-wins, so restoring the same backup twice never duplicates a day. Imported rows are marked `pending` and synced to Firestore. `version` is checked so future schema migrations can be added in `utils/backup.ts`.

**CSV Dışa Aktar** produces a UTF-8 file with a BOM (so Excel shows Turkish characters correctly), CRLF line endings, and the columns `date, workout, cigarettes, water_enough, alcohol, healthy_diet, weight, created_at, updated_at`.

On iPhone, downloads open the share sheet — choose *Save to Files*.

## Data rules

- A missing day means **no record**. Days are never filled in automatically.
- A missing weight means **no measurement**: `weight` is absent locally and `null` in Firestore, never `0`, and yesterday's weight is never carried forward.
- Charts and statistics use recorded days only. Denominators are actual counts, e.g. *12 / 15 kayıtlı gün*, never the number of days in the month.
- The 7-day moving average runs over the last seven *recorded* days.
- The weight chart draws only real measurements; there is no interpolation across unmeasured days.
- Streaks count consecutive calendar days that have a record (today or yesterday may be the last day).

## Security notes

- Access is per Firebase user: the rules only allow `request.auth.uid == uid` on `users/{uid}/…`, and sign-up is disabled in the console, so only the account you created can use the database.
- The web API key and project ID are public by design (they are in every Firebase web app). They identify the project; they do not grant data access.
- The refresh token is stored in the browser's `localStorage` on each device you sign in. Clearing site data signs that device out.
- If a device is lost, change the password in Firebase console → Authentication → Users → ⋮ → Reset password (this revokes existing refresh tokens).
- Firebase Auth rate-limits password attempts (`TOO_MANY_ATTEMPTS_TRY_LATER`).
- No cookies, no third-party requests except to `identitytoolkit.googleapis.com`, `securetoken.googleapis.com` and `firestore.googleapis.com`.

## Browser / PWA limitations

- **iOS storage eviction:** Safari can delete IndexedDB and `localStorage` for sites not used for a while (roughly 7 days for a non-installed web page). Installed Home Screen apps are exempt in practice, but the OS may still evict data under storage pressure. Stay signed in so the cloud copy is current, or download JSON backups.
- **Sync needs the app open.** iOS does not run background sync for web apps; pending rows are pushed when the app is opened or brought to the foreground.
- **No push notifications / reminders** are implemented.
- **Spark plan quotas** (50k reads, 20k writes per day) are far beyond what one person's daily log needs; each sync reads all documents, which after 3 years is still ~1,100 reads.
- Chrome on iOS uses the Safari engine but cannot install PWAs; use Safari for installation.

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| *Yalnızca yerel* in the header | Firebase values were missing at **build** time. Set `VITE_FIREBASE_API_KEY` / `VITE_FIREBASE_PROJECT_ID` (in `.env` or repo secrets) and rebuild. |
| *E-posta veya şifre hatalı.* | Wrong credentials, or the user was not created under Authentication → Users. |
| *E-posta/şifre girişi Firebase projesinde etkin değil.* | Authentication → Sign-in method → Email/Password is not enabled. |
| *Erişim reddedildi. Firestore kurallarını kontrol edin.* | Rules not published, or edited so the owner check fails. Re-paste `firestore.rules` and Publish. |
| *Firestore hatası: … NOT_FOUND* | Firestore database not created yet (step 4). |
| *Oturum süresi doldu.* | Refresh token revoked (password changed, user disabled). Sign in again. |
| App shows an old version | Wait for *Yeni sürüm mevcut* and tap **Güncelle**. On iOS, fully closing and reopening the app also helps. |
| GitHub deploy fails at "Deploy hosting" | `FIREBASE_SERVICE_ACCOUNT` secret missing/invalid, or the service account lacks *Firebase Hosting Admin*. |
| Restore says records are invalid | The file was edited by hand or comes from another app. Each record needs `id`, `date` (YYYY-MM-DD), a valid `workout`, booleans and timestamps. |

## Project structure

```
firebase.json            Hosting config (SPA rewrite, cache headers) + rules/indexes paths
firestore.rules          owner-only access, field validation, last-write-wins
firestore.indexes.json   (none needed)
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
    config.ts            Firebase project identifiers from env
    firebaseAuth.ts      Email/Password sign-in, session persistence, token refresh (REST)
    cloudApi.ts          Firestore REST client (list, commit, delete) + field mapping
    syncService.ts       pending queue, retry triggers, last-write-wins merge, sign-in/out
    deviceId.ts          random per-install id
    seed.ts              development-only sample data
  hooks/                 useLogs (live queries), useSyncState, useTheme, usePwaUpdate, useToast…
  utils/
    analytics.ts         pure statistics helpers (streaks, averages, ratios, weight)
    backup.ts            JSON backup/restore validation, CSV
    dateUtils.ts         local-timezone YYYY-MM-DD helpers, Turkish formatting
    labels.ts, cx.ts, download.ts, logForm.ts
  types/DailyLog.ts      DailyLog interface
.github/workflows/deploy.yml   checks + build on PRs; deploy to Firebase Hosting on main
```

## Development-only seed data

In `npm run dev` the Settings screen shows a **Geliştirici** card with *Örnek veri ekle* (≈75 days of realistic sample data with all workout types, a downward cigarette trend, ~60 % weigh-in days and a weight trend) and *Örnek veriyi sil*. Seed records have ids prefixed `seed-` and are never created automatically; the card and the code path are excluded from production builds.

## Tests

```bash
npm test
```

Covers streak/average/moving-average/month-comparison/weight helpers, backup validation and CSV output, Dexie upsert uniqueness (including concurrent saves for one date), the last-write-wins merge, Firestore field mapping, and auth session handling (sign-in, error mapping, token refresh, sign-out on revoked token). The build also ran an end-to-end browser check against mocked Firebase endpoints: sign-in errors, offline save, reconnect sync, stale-token refresh, conflict resolution, backup, restore, CSV export, sign-out and offline shell loading.
