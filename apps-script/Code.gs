/**
 * Daily Tracker — Google Apps Script backend
 * ------------------------------------------------------------
 * Stores DailyLog rows in a Google Sheet. One row per date.
 *
 * SETUP (see apps-script/README.md for the full walkthrough):
 *   1. Create a Google Sheet. Copy its ID from the URL.
 *   2. Extensions > Apps Script. Paste this file as Code.gs.
 *   3. Fill in SHEET_ID and APP_SECRET below.
 *   4. Deploy > New deployment > Web app
 *        Execute as:      Me
 *        Who has access:  Anyone
 *   5. Copy the Web App URL (ends with /exec) into the frontend .env.
 *
 * SECURITY: APP_SECRET is a simple shared token. Anyone who obtains it can
 * read/write the sheet through this script. It is basic protection for a
 * personal app, not enterprise authentication. Never commit the real value.
 */

// ============ CONFIGURATION ============
var SHEET_ID = 'PASTE_YOUR_SHEET_ID_HERE';
var APP_SECRET = 'PASTE_A_LONG_RANDOM_SECRET_HERE';
var SHEET_NAME = 'DailyLogs';
// =======================================

var HEADERS = [
  'id',
  'date',
  'workout',
  'cigarettes',
  'water_enough',
  'alcohol',
  'healthy_diet',
  'weight',
  'created_at',
  'updated_at',
  'device_id',
];

var WORKOUTS = ['push', 'pull', 'legs_core', 'cardio', 'none'];

// ---------- HTTP entry points ----------

function doGet(e) {
  // GET is only used for a friendly health-check; all data operations use POST.
  return jsonResponse({ success: true, data: { ok: true, message: 'Daily Tracker API. Use POST.' } });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    // Serialize writes so concurrent syncs can never create duplicate rows.
    lock.waitLock(30000);

    var body = parseBody(e);
    if (!isAuthorized(body)) {
      return jsonResponse({ success: false, error: 'Unauthorized' });
    }

    var action = String(body.action || '');
    var data;
    switch (action) {
      case 'ping':
        data = { ok: true };
        break;
      case 'getAll':
        data = getAllRecords();
        break;
      case 'getByDate':
        data = getRecordByDate(body.date);
        break;
      case 'upsert':
        data = upsertRecord(body.data);
        break;
      case 'upsertMany':
        data = upsertMany(body.data);
        break;
      case 'delete':
        data = deleteRecord(body.date);
        break;
      case 'deleteAll':
        if (body.confirm !== 'DELETE_ALL') throw new Error('Confirmation missing');
        data = deleteAllRecords();
        break;
      default:
        throw new Error('Unknown action: ' + action);
    }
    return jsonResponse({ success: true, data: data });
  } catch (err) {
    // Never expose stack traces to the client.
    return jsonResponse({ success: false, error: safeMessage(err) });
  } finally {
    try {
      lock.releaseLock();
    } catch (ignored) {}
  }
}

// ---------- helpers ----------

function parseBody(e) {
  if (!e || !e.postData || !e.postData.contents) throw new Error('Empty request body');
  var parsed = JSON.parse(e.postData.contents);
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid JSON body');
  return parsed;
}

function isAuthorized(body) {
  if (!APP_SECRET || APP_SECRET === 'PASTE_A_LONG_RANDOM_SECRET_HERE') return false;
  return typeof body.secret === 'string' && body.secret === APP_SECRET;
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function safeMessage(err) {
  var msg = err && err.message ? String(err.message) : 'Internal error';
  // Keep messages short and free of internal details.
  return msg.length > 200 ? msg.slice(0, 200) : msg;
}

function getSheet() {
  if (!SHEET_ID || SHEET_ID === 'PASTE_YOUR_SHEET_ID_HERE') throw new Error('SHEET_ID is not configured');
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  ensureHeaders(sheet);
  return sheet;
}

function ensureHeaders(sheet) {
  var lastCol = sheet.getLastColumn();
  var existing = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  var matches = existing.length >= HEADERS.length;
  if (matches) {
    for (var i = 0; i < HEADERS.length; i++) {
      if (String(existing[i]) !== HEADERS[i]) {
        matches = false;
        break;
      }
    }
  }
  if (!matches) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    // Store dates and timestamps as plain text so Sheets never re-interprets them.
    sheet.getRange(2, 2, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat('@');
    sheet.getRange(2, 9, Math.max(sheet.getMaxRows() - 1, 1), 2).setNumberFormat('@');
  }
}

/** Returns { rows: [[...]], index: { date -> rowNumber } } */
function readAll(sheet) {
  var lastRow = sheet.getLastRow();
  var rows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues() : [];
  var index = {};
  for (var i = 0; i < rows.length; i++) {
    var date = normalizeDate(rows[i][1]);
    if (date && !index[date]) index[date] = i + 2; // first occurrence wins
  }
  return { rows: rows, index: index };
}

function normalizeDate(value) {
  if (value instanceof Date) {
    var y = value.getFullYear();
    var m = value.getMonth() + 1;
    var d = value.getDate();
    return y + '-' + (m < 10 ? '0' + m : m) + '-' + (d < 10 ? '0' + d : d);
  }
  var s = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

function toBool(v) {
  if (typeof v === 'boolean') return v;
  var s = String(v).toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

function toIso(v) {
  if (v instanceof Date) return v.toISOString();
  var s = String(v || '');
  if (!s) return '';
  var d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toISOString();
}

function rowToRecord(row) {
  var weight = row[7];
  var weightNum = weight === '' || weight === null || weight === undefined ? null : Number(weight);
  return {
    id: String(row[0] || ''),
    date: normalizeDate(row[1]),
    workout: String(row[2] || 'none'),
    cigarettes: Number(row[3]) || 0,
    water_enough: toBool(row[4]),
    alcohol: toBool(row[5]),
    healthy_diet: toBool(row[6]),
    weight: weightNum !== null && isFinite(weightNum) && weightNum > 0 ? weightNum : null,
    created_at: toIso(row[8]),
    updated_at: toIso(row[9]),
    device_id: String(row[10] || ''),
  };
}

function validateRecord(data) {
  if (!data || typeof data !== 'object') throw new Error('Record missing');
  var date = normalizeDate(data.date);
  if (!date) throw new Error('Invalid date');
  var workout = String(data.workout || '');
  if (WORKOUTS.indexOf(workout) === -1) throw new Error('Invalid workout');
  var cigarettes = Number(data.cigarettes);
  if (!isFinite(cigarettes) || cigarettes < 0) throw new Error('Invalid cigarettes');
  var weight = null;
  if (data.weight !== null && data.weight !== undefined && data.weight !== '') {
    weight = Number(data.weight);
    if (!isFinite(weight) || weight <= 0) throw new Error('Invalid weight');
  }
  var nowIso = new Date().toISOString();
  var id = String(data.id || '');
  if (!id) id = Utilities.getUuid();
  return {
    id: id,
    date: date,
    workout: workout,
    cigarettes: Math.round(cigarettes),
    water_enough: toBool(data.water_enough),
    alcohol: toBool(data.alcohol),
    healthy_diet: toBool(data.healthy_diet),
    weight: weight,
    created_at: toIso(data.created_at) || nowIso,
    updated_at: toIso(data.updated_at) || nowIso,
    device_id: String(data.device_id || ''),
  };
}

function recordToRow(rec) {
  return [
    rec.id,
    rec.date,
    rec.workout,
    rec.cigarettes,
    rec.water_enough,
    rec.alcohol,
    rec.healthy_diet,
    rec.weight === null ? '' : rec.weight,
    rec.created_at,
    rec.updated_at,
    rec.device_id,
  ];
}

// ---------- operations ----------

function getAllRecords() {
  var sheet = getSheet();
  var all = readAll(sheet);
  var out = [];
  for (var i = 0; i < all.rows.length; i++) {
    var rec = rowToRecord(all.rows[i]);
    if (rec.date && rec.id) out.push(rec);
  }
  return out;
}

function getRecordByDate(date) {
  var d = normalizeDate(date);
  if (!d) throw new Error('Invalid date');
  var sheet = getSheet();
  var all = readAll(sheet);
  var rowNumber = all.index[d];
  if (!rowNumber) return null;
  return rowToRecord(all.rows[rowNumber - 2]);
}

/**
 * Insert or update the row for rec.date. Uses last-write-wins on updated_at:
 * an older client version never overwrites a newer row already in the sheet.
 */
function upsertOne(sheet, all, rec) {
  var rowNumber = all.index[rec.date];
  if (rowNumber) {
    var existing = rowToRecord(all.rows[rowNumber - 2]);
    if (existing.updated_at && rec.updated_at && existing.updated_at > rec.updated_at) {
      return { action: 'skipped', record: existing };
    }
    // Keep the original id and created_at so all devices agree.
    if (existing.id) rec.id = existing.id;
    if (existing.created_at) rec.created_at = existing.created_at;
    sheet.getRange(rowNumber, 1, 1, HEADERS.length).setValues([recordToRow(rec)]);
    all.rows[rowNumber - 2] = recordToRow(rec);
    return { action: 'updated', record: rec };
  }
  sheet.appendRow(recordToRow(rec));
  var newRow = sheet.getLastRow();
  all.index[rec.date] = newRow;
  all.rows.push(recordToRow(rec));
  return { action: 'inserted', record: rec };
}

function upsertRecord(data) {
  var rec = validateRecord(data);
  var sheet = getSheet();
  var all = readAll(sheet);
  return upsertOne(sheet, all, rec);
}

function upsertMany(list) {
  if (!Array.isArray(list)) throw new Error('Expected an array');
  var sheet = getSheet();
  var all = readAll(sheet);
  var results = [];
  for (var i = 0; i < list.length; i++) {
    var rec = validateRecord(list[i]);
    results.push(upsertOne(sheet, all, rec).action);
  }
  return { count: results.length, results: results };
}

function deleteRecord(date) {
  var d = normalizeDate(date);
  if (!d) throw new Error('Invalid date');
  var sheet = getSheet();
  var all = readAll(sheet);
  // Delete every row with that date (defensive against manual duplicates), bottom-up.
  var deleted = 0;
  for (var i = all.rows.length - 1; i >= 0; i--) {
    if (normalizeDate(all.rows[i][1]) === d) {
      sheet.deleteRow(i + 2);
      deleted++;
    }
  }
  return { deleted: deleted };
}

function deleteAllRecords() {
  var sheet = getSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.deleteRows(2, lastRow - 1);
  return { deleted: Math.max(lastRow - 1, 0) };
}

/**
 * Optional maintenance helper: run manually from the Apps Script editor to
 * collapse accidental duplicate dates (keeps the newest updated_at).
 */
function dedupeSheet() {
  var sheet = getSheet();
  var all = readAll(sheet);
  var best = {};
  for (var i = 0; i < all.rows.length; i++) {
    var rec = rowToRecord(all.rows[i]);
    if (!rec.date) continue;
    if (!best[rec.date] || best[rec.date].updated_at < rec.updated_at) best[rec.date] = rec;
  }
  var dates = Object.keys(best).sort();
  var rows = dates.map(function (d) {
    return recordToRow(best[d]);
  });
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.deleteRows(2, lastRow - 1);
  if (rows.length) sheet.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
  return rows.length;
}
