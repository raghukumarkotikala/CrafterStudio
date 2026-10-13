// 2D code objects (QR, Data Matrix, Aztec…) as real vector geometry.
//
// Encoding happens in the main process; this turns the returned module matrix
// into paths. Modules become merged rectangles rather than one square each,
// which keeps the path count — and the G-code — an order of magnitude smaller.
/* global paper */
import { state } from './state.js';

export async function codeTypes() {
  if (!window.api || !window.api.codeTypes) return { qrcode: 'QR Code' };
  return window.api.codeTypes();
}

// Electron prefixes IPC rejections with "Error invoking remote method '…':".
// Encoder messages are shown straight to the user, so strip it.
function unwrapIpc(message) {
  return String(message || '')
    .replace(/^Error invoking remote method '[^']*':\s*(?:Error:\s*)?/, '')
    .replace(/^bwipp\.\w+:\s*/, '');
}

export async function encode(type, text, options) {
  if (!window.api || !window.api.codeEncode) throw new Error('Codes need the desktop app.');
  try {
    return await window.api.codeEncode({ type, text, options });
  } catch (e) {
    throw new Error(unwrapIpc(e && e.message));
  }
}

/**
 * Build geometry for an encoded matrix.
 * size   overall width in mm, excluding the quiet zone
 * quiet  quiet-zone width in modules, added around the symbol
 */
export function matrixToItem(matrix, { size = 25, quiet = 2 } = {}) {
  const { w, h, rows } = matrix;
  if (!w || !h) throw new Error('Empty code matrix.');
  const m = size / w;                       // module size in mm
  const cp = new paper.CompoundPath({ insert: false });

  // Merge horizontally adjacent dark modules into one rectangle per run.
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    let x = 0;
    while (x < w) {
      if (row[x] !== '1') { x++; continue; }
      let end = x;
      while (end + 1 < w && row[end + 1] === '1') end++;
      cp.addChild(new paper.Path.Rectangle({
        point: [x * m, y * m],
        size: [(end - x + 1) * m, m],
        insert: false
      }));
      x = end + 1;
    }
  }
  if (!cp.children.length) throw new Error('Encoded code contained no modules.');

  cp.fillRule = 'nonzero';
  cp.data.code = { type: matrix.type, text: matrix.text, size, quiet, w, h };
  // The quiet zone is empty space scanners rely on; record it so the object can
  // report its true footprint without drawing anything there.
  cp.data.code.footprint = [w * m + 2 * quiet * m, h * m + 2 * quiet * m];
  return cp;
}

/** Encode and build in one step. */
export async function buildCode({ type = 'qrcode', text = '', size = 25, quiet = 2, options } = {}) {
  const matrix = await encode(type, text, options);
  return matrixToItem(matrix, { size, quiet });
}

/** Modules per mm — useful for warning when a code is too fine to cut cleanly. */
export function moduleSize(matrix, size) {
  return size / matrix.w;
}

export function defaultCodeSize() {
  const dev = state.device || {};
  return Math.min(30, Math.max(10, Math.round((dev.workW || 100) * 0.2)));
}
