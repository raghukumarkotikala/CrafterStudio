// Variable text: placeholders in a text object that resolve to a CSV column,
// a running serial number, or the date.
//
// The text object keeps the *template* as its content. Resolution happens when
// the outlines are built, so stepping to the next row re-renders every piece of
// variable text without the user retyping anything.

const TOKEN = /\{\{\s*([^}]+?)\s*\}\}/g;

/** True if a string contains anything that needs resolving. */
export function hasVariables(text) {
  TOKEN.lastIndex = 0;
  return TOKEN.test(String(text || ''));
}

// ---------------------------------------------------------------- CSV
/**
 * Minimal RFC4180 parser: quoted fields, embedded commas, doubled quotes,
 * and both line endings. Enough for a spreadsheet export, which is where
 * these files come from.
 */
export function parseCSV(text) {
  const src = String(text || '').replace(/^﻿/, '');   // strip a BOM from Excel
  const rows = [];
  let row = [], field = '', quoted = false, i = 0;

  const endField = () => { row.push(field); field = ''; };
  const endRow = () => { endField(); if (row.some(c => c !== '')) rows.push(row); row = []; };

  while (i < src.length) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { quoted = true; i++; continue; }
    if (c === ',') { endField(); i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { endRow(); i++; continue; }
    field += c; i++;
  }
  endRow();

  if (!rows.length) return { headers: [], rows: [] };
  const headers = rows[0].map(h => h.trim());
  const body = rows.slice(1).map(r => {
    const o = {};
    headers.forEach((h, k) => { o[h] = (r[k] !== undefined ? r[k] : '').trim(); });
    return o;
  });
  return { headers, rows: body };
}

// ---------------------------------------------------------------- dates
function pad(n, w = 2) { return String(n).padStart(w, '0'); }

export function formatDate(d, fmt) {
  const map = {
    YYYY: d.getFullYear(), YY: pad(d.getFullYear() % 100),
    MM: pad(d.getMonth() + 1), DD: pad(d.getDate()),
    HH: pad(d.getHours()), mm: pad(d.getMinutes()), ss: pad(d.getSeconds())
  };
  // Longest tokens first so YYYY is not eaten by YY.
  return String(fmt).replace(/YYYY|YY|MM|DD|HH|mm|ss/g, t => map[t]);
}

// ---------------------------------------------------------------- context
const ctx = {
  headers: [],
  rows: [],
  index: 0,
  serialStart: 1,
  serialStep: 1,
  serialPad: 0,
  fileName: ''
};

export function mergeState() { return ctx; }

export function setRows(headers, rows, fileName = '') {
  ctx.headers = headers;
  ctx.rows = rows;
  ctx.index = 0;
  ctx.fileName = fileName;
}

export function clearRows() {
  ctx.headers = [];
  ctx.rows = [];
  ctx.index = 0;
  ctx.fileName = '';
}

export function setIndex(i) {
  const n = ctx.rows.length;
  // Wrap, so stepping past the end returns to the first row rather than
  // silently engraving blanks.
  ctx.index = n ? ((i % n) + n) % n : Math.max(0, i);
}

export function setSerial({ start, step, padding }) {
  if (start !== undefined) ctx.serialStart = +start || 0;
  if (step !== undefined) ctx.serialStep = +step || 0;
  if (padding !== undefined) ctx.serialPad = Math.max(0, Math.min(12, Math.round(+padding || 0)));
}

export function currentSerial(index = ctx.index) {
  const n = ctx.serialStart + index * ctx.serialStep;
  const s = String(Math.abs(n));
  return (n < 0 ? '-' : '') + (ctx.serialPad ? s.padStart(ctx.serialPad, '0') : s);
}

/**
 * Replace every {{token}} in `template`.
 *
 * {{Column}}        value from the current CSV row
 * {{serial}}        running number
 * {{index}}         1-based row number
 * {{count}}         total rows
 * {{date}} {{time}} today, in a sensible default
 * {{date:YYYY-MM}}  explicit format
 *
 * An unknown token is left exactly as written. Blanking it would quietly
 * engrave a gap where a name should be, and the operator would not notice
 * until the piece came off the bed.
 */
export function resolve(template, index = ctx.index, now = new Date()) {
  const text = String(template == null ? '' : template);
  if (!hasVariables(text)) return text;
  const row = ctx.rows[index] || {};
  return text.replace(TOKEN, (whole, raw) => {
    const name = raw.trim();
    const lower = name.toLowerCase();
    if (lower === 'serial') return currentSerial(index);
    if (lower === 'index') return String(index + 1);
    if (lower === 'count') return String(ctx.rows.length);
    if (lower === 'date') return formatDate(now, 'YYYY-MM-DD');
    if (lower === 'time') return formatDate(now, 'HH:mm');
    if (lower.startsWith('date:')) return formatDate(now, name.slice(5));
    // Column names are matched case-insensitively; spreadsheet headers are
    // rarely typed the same way twice.
    if (Object.prototype.hasOwnProperty.call(row, name)) return row[name];
    const key = Object.keys(row).find(k => k.toLowerCase() === lower);
    if (key !== undefined) return row[key];
    return whole;
  });
}

/** Every distinct token used in a template, for reporting unresolved ones. */
export function tokensIn(template) {
  const out = [];
  String(template || '').replace(TOKEN, (w, raw) => { out.push(raw.trim()); return w; });
  return [...new Set(out)];
}

export function unknownTokens(template) {
  const known = new Set(['serial', 'index', 'count', 'date', 'time']);
  return tokensIn(template).filter(t => {
    const l = t.toLowerCase();
    if (known.has(l) || l.startsWith('date:')) return false;
    return !ctx.headers.some(h => h.toLowerCase() === l);
  });
}
