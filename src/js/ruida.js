// Ruida .rd job files.
//
// ---------------------------------------------------------------------------
// NOT VERIFIED AGAINST A MACHINE OR AGAINST RDWORKS.
//
// There is no published specification for this format. Everything here is
// built from the community's reverse-engineering notes, and no Ruida
// controller was available to check it against. Two layers of confidence are
// worth keeping apart, and the comments below say which is which:
//
//   attested  the byte scrambling, the number encodings and the move, layer,
//             speed and power opcodes. These agree across every independent
//             description of the format, and the round-trip tests cover them.
//
//   assumed   the file's surrounding container — the opening bytes, the order
//             of the per-layer parameter block, and the trailer. A single
//             reference .rd file exported by RDWorks or LightBurn would settle
//             it; until then this is a reconstruction.
//
// The failure that matters is therefore "RDWorks refuses to open the file",
// which costs nothing. The user is told to open the file and look at the
// geometry before running it, and describeRuida() below reads the bytes back
// out so they can check what was actually written rather than what was meant.
// ---------------------------------------------------------------------------

import { K_RAPID, K_FEED, K_LAYER, machineMapper, rotaryConfig } from './gcode.js';

/** Default scrambling key. Some vendors ship a different one. */
export const DEFAULT_MAGIC = 0x88;

// ------------------------------------------------------------------ scrambling
// attested: swap bit 0 with bit 7, exclusive-or with the magic, add one.
// The three xor-shifts are the usual branchless way to swap two bits.

export function swizzle(b, magic = DEFAULT_MAGIC) {
  b &= 0xFF;
  b ^= (b >> 7) & 0xFF;
  b ^= (b << 7) & 0xFF;
  b ^= (b >> 7) & 0xFF;
  b ^= magic;
  return (b + 1) & 0xFF;
}

export function unswizzle(b, magic = DEFAULT_MAGIC) {
  b = (b - 1) & 0xFF;
  b ^= magic;
  b ^= (b >> 7) & 0xFF;
  b ^= (b << 7) & 0xFF;
  b ^= (b >> 7) & 0xFF;
  return b & 0xFF;
}

export function swizzleAll(bytes, magic = DEFAULT_MAGIC) {
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = swizzle(bytes[i], magic);
  return out;
}

export function unswizzleAll(bytes, magic = DEFAULT_MAGIC) {
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = unswizzle(bytes[i], magic);
  return out;
}

// ------------------------------------------------------------------ numbers
// attested: values travel as groups of 7 bits, most significant first, so that
// no byte can collide with an opcode (every opcode has its top bit set).

const POW2_35 = 2 ** 35;

/** 35-bit absolute value, five bytes. Coordinates are micrometres. */
export function abs35(v) {
  let n = Math.round(v);
  if (n < 0) n += POW2_35;                     // two's complement in 35 bits
  n = ((n % POW2_35) + POW2_35) % POW2_35;
  const out = new Uint8Array(5);
  for (let i = 4; i >= 0; i--) { out[i] = n % 128; n = Math.floor(n / 128); }
  return out;
}

export function readAbs35(b, i) {
  let n = 0;
  for (let k = 0; k < 5; k++) n = n * 128 + (b[i + k] & 0x7F);
  return n >= POW2_35 / 2 ? n - POW2_35 : n;
}

/** 14-bit signed value, two bytes. Used for relative moves: ±8.191 mm. */
export const REL_LIMIT = 8191;

export function rel14(v) {
  const n = Math.round(v) & 0x3FFF;
  return new Uint8Array([(n >> 7) & 0x7F, n & 0x7F]);
}

export function readRel14(b, i) {
  const n = ((b[i] & 0x7F) << 7) | (b[i + 1] & 0x7F);
  return n & 0x2000 ? n - 0x4000 : n;
}

/** 14-bit unsigned value, two bytes. Used for power and small counts. */
export function u14(v) {
  const n = Math.max(0, Math.min(0x3FFF, Math.round(v)));
  return new Uint8Array([(n >> 7) & 0x7F, n & 0x7F]);
}

export function readU14(b, i) {
  return ((b[i] & 0x7F) << 7) | (b[i + 1] & 0x7F);
}

/** Power is a fraction of full scale, where full scale is 14 bits. */
export const powerValue = frac => u14(Math.max(0, Math.min(1, frac)) * 0x3FFF);
export const powerPercent = v => (v / 0x3FFF) * 100;

/** The controller works in micrometres per second; layers are in mm/min. */
export const speedValue = mmPerMin => abs35(mmPerMin * 1000 / 60);
export const speedMmPerMin = um => um * 60 / 1000;

// ------------------------------------------------------------------ writer
class Writer {
  constructor() { this.parts = []; this.len = 0; }
  push(...vals) {
    for (const v of vals) {
      const a = typeof v === 'number' ? new Uint8Array([v & 0xFF]) : v;
      this.parts.push(a);
      this.len += a.length;
    }
    return this;
  }
  bytes() {
    const out = new Uint8Array(this.len);
    let o = 0;
    for (const p of this.parts) { out.set(p, o); o += p.length; }
    return out;
  }
}

// Opcode names, kept in one place so the writer and the reader cannot drift.
export const OPS = {
  MOVE_ABS: 0x88, MOVE_REL: 0x89, MOVE_REL_X: 0x8A, MOVE_REL_Y: 0x8B,
  CUT_ABS: 0xA8, CUT_REL: 0xA9, CUT_REL_X: 0xAA, CUT_REL_Y: 0xAB,
  SPEED: 0xC9, POWER: 0xC6, LAYER: 0xCA, BOUNDS: 0xE7, FILE: 0xE8,
  END: 0xD7, START: 0xD8
};

// ------------------------------------------------------------------ emitter
/**
 * Build a .rd file from a planned job.
 *
 * Returns { bytes, warnings, stats }. `bytes` is already scrambled, which is
 * what both the machine and a .rd file on a USB stick expect.
 */
export function emitRuida(job, device, { magic = DEFAULT_MAGIC, name = 'Crafter' } = {}) {
  const warnings = [];
  const w = new Writer();
  const map = machineMapper(device, job.bounds);
  const um = mm => Math.round(mm * 1000);

  // The planner expands passes into repeated geometry, so the file must say
  // one pass per layer or every cut would be doubled.
  if (rotaryConfig(device)) {
    warnings.push('Rotary is set up in Crafter Studio, but a Ruida controller does its own rotary conversion. ' +
      'The file was written with the design flat — set the rotary up on the machine instead.');
  }

  const layers = job.layers || [];
  if (!layers.length) return { bytes: new Uint8Array(0), warnings: ['Nothing to export.'], stats: null };
  if (layers.length > 8) {
    warnings.push(`${layers.length} layers: Ruida controllers show eight. The rest are in the file but may not be listed on the panel.`);
  }

  // Walk the plan once to find each layer's own extent, which the header has
  // to state before any geometry is written.
  const a = job.buf.a;
  const ext = layers.map(() => ({ x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }));
  let all = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const grow = (e, x, y) => {
    if (x < e.x0) e.x0 = x; if (x > e.x1) e.x1 = x;
    if (y < e.y0) e.y0 = y; if (y > e.y1) e.y1 = y;
  };
  for (let i = 0; i < job.buf.n; i++) {
    const k = a[i * 6];
    if (k === K_LAYER) continue;
    const li = a[i * 6 + 5] | 0;
    const [mx, my] = map(a[i * 6 + 1], a[i * 6 + 2]);
    if (ext[li]) grow(ext[li], um(mx), um(my));
    grow(all, um(mx), um(my));
  }
  const finite = v => (isFinite(v) ? v : 0);

  // --- header (assumed) -----------------------------------------------------
  w.push(OPS.START, 0x12);                               // begin file
  w.push(OPS.FILE, 0x02, 0x00);                          // file number slot
  w.push(OPS.BOUNDS, 0x50, abs35(finite(all.x0)), abs35(finite(all.y0)));
  w.push(OPS.BOUNDS, 0x51, abs35(finite(all.x1)), abs35(finite(all.y1)));
  w.push(OPS.BOUNDS, 0x04, abs35(finite(all.x0)), abs35(finite(all.y0)),
                           abs35(finite(all.x1)), abs35(finite(all.y1)));
  w.push(OPS.LAYER, 0x22, layers.length & 0x7F);         // layer count

  // --- per-layer parameter block (opcodes attested, order assumed) ----------
  layers.forEach((L, i) => {
    const n = i & 0x7F;
    const e = ext[i];
    w.push(OPS.LAYER, 0x06, n, abs35(colourValue(L.color)));
    w.push(OPS.SPEED, 0x04, n, speedValue(L.speed));
    w.push(OPS.POWER, 0x31, n, powerValue((L.minPower || 0) / 100));
    w.push(OPS.POWER, 0x32, n, powerValue((L.power || 0) / 100));
    w.push(OPS.POWER, 0x41, n, powerValue((L.minPower || 0) / 100));
    w.push(OPS.POWER, 0x42, n, powerValue((L.power || 0) / 100));
    w.push(OPS.LAYER, 0x41, n, 0x00);                    // one pass: see above
    w.push(OPS.BOUNDS, 0x52, n, abs35(finite(e.x0)), abs35(finite(e.y0)));
    w.push(OPS.BOUNDS, 0x53, n, abs35(finite(e.x1)), abs35(finite(e.y1)));
  });

  // --- geometry -------------------------------------------------------------
  w.push(OPS.LAYER, 0x01, 0x00);

  // Relative moves are three to four bytes against ten, which matters on a
  // fill with a hundred thousand points. Deltas are taken from the position
  // already written rather than from the ideal one, so rounding cannot
  // accumulate into a drift down the sheet.
  let curX = null, curY = null;
  let curLayer = -1, curPower = null, curSpeed = null;
  let moves = 0, cuts = 0, absolutes = 0;

  const goto = (x, y, cutting) => {
    if (curX === null || curY === null) {
      w.push(cutting ? OPS.CUT_ABS : OPS.MOVE_ABS, abs35(x), abs35(y));
      absolutes++;
    } else {
      const dx = x - curX, dy = y - curY;
      if (dx === 0 && dy === 0) return;
      const near = Math.abs(dx) <= REL_LIMIT && Math.abs(dy) <= REL_LIMIT;
      if (near && dy === 0) w.push(cutting ? OPS.CUT_REL_X : OPS.MOVE_REL_X, rel14(dx));
      else if (near && dx === 0) w.push(cutting ? OPS.CUT_REL_Y : OPS.MOVE_REL_Y, rel14(dy));
      else if (near) w.push(cutting ? OPS.CUT_REL : OPS.MOVE_REL, rel14(dx), rel14(dy));
      else { w.push(cutting ? OPS.CUT_ABS : OPS.MOVE_ABS, abs35(x), abs35(y)); absolutes++; }
    }
    curX = x; curY = y;
    cutting ? cuts++ : moves++;
  };

  for (let i = 0; i < job.buf.n; i++) {
    const k = a[i * 6];
    if (k === K_LAYER) continue;
    const li = a[i * 6 + 5] | 0;
    if (li !== curLayer) {
      curLayer = li;
      curPower = curSpeed = null;
      w.push(OPS.LAYER, 0x02, li & 0x7F);
    }
    // Per-object overrides change power and speed inside a layer; write them
    // only where they actually change.
    const p = a[i * 6 + 3], f = a[i * 6 + 4];
    if (k === K_FEED) {
      if (p !== curPower) {
        w.push(OPS.POWER, 0x01, powerValue(p));
        w.push(OPS.POWER, 0x02, powerValue(p));
        curPower = p;
      }
      if (f !== curSpeed) { w.push(OPS.SPEED, 0x02, speedValue(f)); curSpeed = f; }
    }
    const [mx, my] = map(a[i * 6 + 1], a[i * 6 + 2]);
    goto(um(mx), um(my), k === K_FEED && p > 0);
  }

  // --- trailer (assumed) ----------------------------------------------------
  w.push(OPS.END);

  const plain = w.bytes();
  return {
    bytes: swizzleAll(plain, magic),
    plain,
    warnings,
    stats: { bytes: plain.length, moves, cuts, absolutes, layers: layers.length }
  };
}

/** Layer colour as the controller stores it: blue, green, red. */
export function colourValue(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '#000000'));
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xFF, g = (n >> 8) & 0xFF, b = n & 0xFF;
  return (b << 16) | (g << 8) | r;
}

// ------------------------------------------------------------------ reader
// The point of reading the file back is that it checks the bytes rather than
// the intention. If the writer and the reader disagree the test fails, and if
// they agree the summary shown after an export is true of the actual file.

const OPERANDS = {
  0x88: 10, 0xA8: 10, 0x89: 4, 0xA9: 4, 0x8A: 2, 0xAA: 2, 0x8B: 2, 0xAB: 2, 0xD7: 0
};

export function describeRuida(bytes, magic = DEFAULT_MAGIC) {
  const b = unswizzleAll(bytes, magic);
  const layers = new Map();
  const out = {
    layers: [], bounds: null, counts: { move: 0, cut: 0, abs: 0, rel: 0 },
    end: false, unknown: [], bytes: b.length
  };
  let x = 0, y = 0;
  let ext = null;
  const layer = n => {
    if (!layers.has(n)) layers.set(n, { index: n, speed: null, power: null, minPower: null, colour: null, bounds: null });
    return layers.get(n);
  };

  let i = 0;
  while (i < b.length) {
    const op = b[i];
    if (op === OPS.END) { out.end = true; i += 1; continue; }

    if (op in OPERANDS) {
      const n = OPERANDS[op];
      const cutting = op >= 0xA8;
      if (op === 0x88 || op === 0xA8) { x = readAbs35(b, i + 1); y = readAbs35(b, i + 6); out.counts.abs++; }
      else if (op === 0x89 || op === 0xA9) { x += readRel14(b, i + 1); y += readRel14(b, i + 3); out.counts.rel++; }
      else if (op === 0x8A || op === 0xAA) { x += readRel14(b, i + 1); out.counts.rel++; }
      else { y += readRel14(b, i + 1); out.counts.rel++; }
      cutting ? out.counts.cut++ : out.counts.move++;
      if (!ext) ext = { x0: x, y0: y, x1: x, y1: y };
      ext.x0 = Math.min(ext.x0, x); ext.x1 = Math.max(ext.x1, x);
      ext.y0 = Math.min(ext.y0, y); ext.y1 = Math.max(ext.y1, y);
      i += 1 + n;
      continue;
    }

    const sub = b[i + 1];
    if (op === OPS.START && sub === 0x12) { i += 2; continue; }
    if (op === OPS.FILE && sub === 0x02) { i += 3; continue; }
    if (op === OPS.BOUNDS && sub === 0x50) { out.bounds = { ...(out.bounds || {}), x0: readAbs35(b, i + 2), y0: readAbs35(b, i + 7) }; i += 12; continue; }
    if (op === OPS.BOUNDS && sub === 0x51) { out.bounds = { ...(out.bounds || {}), x1: readAbs35(b, i + 2), y1: readAbs35(b, i + 7) }; i += 12; continue; }
    if (op === OPS.BOUNDS && sub === 0x04) { i += 22; continue; }
    if (op === OPS.BOUNDS && (sub === 0x52 || sub === 0x53)) {
      const L = layer(b[i + 2]);
      const px = readAbs35(b, i + 3), py = readAbs35(b, i + 8);
      L.bounds = { ...(L.bounds || {}), ...(sub === 0x52 ? { x0: px, y0: py } : { x1: px, y1: py }) };
      i += 13; continue;
    }
    if (op === OPS.LAYER && sub === 0x22) { i += 3; continue; }
    if (op === OPS.LAYER && sub === 0x06) { layer(b[i + 2]).colour = readAbs35(b, i + 3); i += 8; continue; }
    if (op === OPS.LAYER && sub === 0x41) { layer(b[i + 2]).passByte = b[i + 3]; i += 4; continue; }
    if (op === OPS.LAYER && sub === 0x01) { i += 3; continue; }
    if (op === OPS.LAYER && sub === 0x02) { i += 3; continue; }
    if (op === OPS.SPEED && sub === 0x04) { layer(b[i + 2]).speed = speedMmPerMin(readAbs35(b, i + 3)); i += 8; continue; }
    if (op === OPS.SPEED && sub === 0x02) { i += 7; continue; }
    if (op === OPS.POWER && (sub === 0x31 || sub === 0x41)) { layer(b[i + 2]).minPower = powerPercent(readU14(b, i + 3)); i += 5; continue; }
    if (op === OPS.POWER && (sub === 0x32 || sub === 0x42)) { layer(b[i + 2]).power = powerPercent(readU14(b, i + 3)); i += 5; continue; }
    if (op === OPS.POWER && (sub === 0x01 || sub === 0x02)) { i += 4; continue; }

    out.unknown.push({ at: i, op, sub });
    i += 1;
    if (out.unknown.length > 32) break;      // stop rather than flail
  }

  out.layers = [...layers.values()].sort((p, q) => p.index - q.index);
  out.extent = ext;
  return out;
}
