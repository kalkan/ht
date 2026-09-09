# Google Apps Script backend — setup guide

This folder contains the whole cloud layer of Daily: one script that turns a Google Sheet into a tiny JSON API. It runs on Google's free Apps Script quota, needs no server, and stores data in your own Google Drive.

## 1. Create the Google Sheet

1. Go to <https://sheets.new> (signed in with the Google account whose Drive should hold the data).
2. Rename the spreadsheet, e.g. **Daily Tracker**. Leave the sheet empty — the script creates a worksheet named `DailyLogs` with these headers on first use:

   | A | B | C | D | E | F | G | H | I | J | K |
   |---|---|---|---|---|---|---|---|---|---|---|
   | id | date | workout | cigarettes | water_enough | alcohol | healthy_diet | weight | created_at | updated_at | device_id |

## 2. Get the Sheet ID

The URL looks like

```
https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890/edit#gid=0
                                       └──────────────── SHEET_ID ────────────────┘
```

Copy the long segment between `/d/` and `/edit`.

## 3. Open Apps Script

In the spreadsheet: **Extensions → Apps Script**. A new project opens with an empty `Code.gs`.

## 4. Paste the code

Select everything in the editor's `Code.gs`, delete it, and paste the full contents of [`Code.gs`](Code.gs) from this folder. Optionally rename the project (top-left) to *Daily Tracker API*.

(The `appsscript.json` here is only for reference / `clasp` users; the editor generates its own.)

## 5. Configure `SHEET_ID`

At the top of the file replace

```js
var SHEET_ID = 'PASTE_YOUR_SHEET_ID_HERE';
```

with your ID from step 2.

## 6. Configure `APP_SECRET`

Replace

```js
var APP_SECRET = 'PASTE_A_LONG_RANDOM_SECRET_HERE';
```

with a long random string. Generate one locally, for example:

```bash
openssl rand -hex 24
# or
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

The script refuses every request while the placeholder value is still in place. **Never commit the real secret** anywhere; it also goes into the frontend `.env` / GitHub secret as `VITE_APP_SECRET`.

Save with **Ctrl/Cmd + S**.

## 7. Deploy as a Web App

1. Click **Deploy → New deployment**.
2. Next to *Select type* click the gear icon and choose **Web app**.
3. Fill in:
   - **Description:** anything, e.g. `v1`
   - **Execute as:** **Me (your@gmail.com)**
   - **Who has access:** **Anyone**
4. Click **Deploy**.

## 8. Execution permissions

The first deployment asks you to authorise the script:

1. Click **Authorize access**.
2. Pick your Google account.
3. Google shows *"Google hasn't verified this app"* because it is your own private script. Click **Advanced → Go to Daily Tracker API (unsafe)**.
4. Click **Allow** for the Spreadsheets permission.

Why these settings:

- *Execute as: Me* — the script writes to your sheet with your permissions; the phone never signs in to Google.
- *Who has access: Anyone* — the PWA calls the endpoint anonymously. Access control is the `secret` field checked inside `doPost`. If you pick *Anyone with Google account* instead, browsers get a login page (HTML) and the app reports *Geçersiz sunucu yanıtı*.

## 9. Get the Web App URL

After deploying, copy the **Web app URL**. It looks like

```
https://script.google.com/macros/s/AKfycb.../exec
```

Use the `/exec` URL, not the `/dev` URL. You can test it by opening it in a browser: `GET` returns `{"success":true,"data":{"ok":true,...}}`.

## 10. Configure the frontend

Locally, in the project root:

```env
# .env  (never commit this file)
VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/AKfycb.../exec
VITE_APP_SECRET=<the same value as APP_SECRET>
```

For GitHub Pages add the same two values as **repository secrets** (Settings → Secrets and variables → Actions). Rebuild/redeploy; then open **Ayarlar** in the app and tap **Test** — you should see *Google Sheets bağlantısı çalışıyor.*

## Updating the script later

Apps Script serves a frozen *version*. After editing `Code.gs`: **Deploy → Manage deployments → ✎ (edit) → Version: New version → Deploy**. The URL stays the same.

## API reference

All requests: `POST <url>` with a JSON body (sent as `text/plain` to avoid CORS preflight).

```json
{ "action": "upsert", "secret": "…", "data": { "id": "…", "date": "2026-09-09", "workout": "push", "cigarettes": 3, "water_enough": true, "alcohol": false, "healthy_diet": true, "weight": 78.2, "created_at": "…", "updated_at": "…", "device_id": "…" } }
```

| action | payload | data returned |
| --- | --- | --- |
| `ping` | — | `{ ok: true }` |
| `getAll` | — | array of records |
| `getByDate` | `date` | record or `null` |
| `upsert` | `data` (record) | `{ action: "inserted" \| "updated" \| "skipped", record }` |
| `upsertMany` | `data` (array) | `{ count, results }` |
| `delete` | `date` | `{ deleted }` |
| `deleteAll` | `confirm: "DELETE_ALL"` | `{ deleted }` |

Responses: `{ "success": true, "data": … }` or `{ "success": false, "error": "message" }`. Errors are short messages; stack traces are never returned.

Guarantees:

- `date` is the primary key — `upsert` updates the existing row for that date or appends one; it never creates duplicates. A script lock serialises concurrent requests.
- `upsert` keeps the original `id` and `created_at` of an existing row and skips the write if the sheet row has a newer `updated_at` than the incoming one (last-write-wins).
- `date`, `created_at`, `updated_at` columns are formatted as plain text so Sheets does not reinterpret them as dates.
- `dedupeSheet()` can be run manually from the editor to collapse duplicates created by hand-editing.

## Security note

This is a shared-secret scheme: whoever has the URL **and** the secret can read and write your sheet. The secret is compiled into the public frontend bundle, so treat it as *basic* protection suited to a personal single-user tool, not as authentication. Rotate it by changing `APP_SECRET`, creating a new deployment version, and updating `VITE_APP_SECRET`.
