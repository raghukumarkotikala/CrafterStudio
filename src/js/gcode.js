// Toolpath planning and G-code generation.
// All planning happens in canvas space (mm, Y down, origin top-left of the work area);
// the emitter maps to machine space using the device origin and job-origin settings.
/* global paper */
import { state } from './state.js';
import { ed } from './editor.js';
import { adjustedGray, dither, DEFAULT_ADJ, loadImage, normalizeImage } from './imageproc.js';
import { CONTROLLERS } from './profiles.js';

export const K_RAPID = 0, K_FEED = 1, K_LAYER = 2;

class MoveBuffer {
  constructor() {
    this.a = new Float64Array(6 * 8192);
    this.n = 0;
  }
  push(k, x, y, p = 0, f = 0, l = 0) {
    if ((this.n + 1) * 6 > this.a.length) {
      const b = new Float64Array(this.a.length * 2);
      b.set(this.a);
      this.a = b;
    }
    const i = this.n * 6;
    this.a[i] = k; this.a[i + 1] = x; this.a[i + 2] = y; this.a[i + 3] = p; this.a[i + 4] = f; this.a[i + 5] = l;
    this.n++;
  }
}

// ---------------------------------------------------------------- geometry
function leafItems(root) {
  const out = [];
  const walk = it => {
    if (!it.visible) return;
    if (it.className === 'Group') it.children.forEach(walk);
    else out.push(it);
  };
  root.children.forEach(walk);
  return out;
}

export function itemPolylines(item, tol = 0.02) {
  const paths = item.className === 'CompoundPath' ? item.children : item.className === 'Path' ? [item] : [];
  const res = [];
  for (const p of paths) {
    if (!p.segments || p.segments.length < 2 && !(p.segments.length === 1 && p.closed)) continue;
    const c = p.clone({ insert: false });
    c.transform(p.parent.globalMatrix);
    c.flatten(tol);
    const pts = c.segments.map(s => [s.point.x, s.point.y]);
    if (pts.length < 2) continue;
    if (c.closed) pts.push([pts[0][0], pts[0][1]]);
    res.push({ pts, closed: c.closed });
  }
  return res;
}

function polyBounds(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

function pointInPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ---------------------------------------------------------------- planners
function planLines(polys, s, buf, cur, layerIdx) {
  if (!polys.length) return;
  polys.forEach(p => { p.b = polyBounds(p.pts); p.depth = 0; });
  // Cut inner shapes before the outer ones that contain them.
  const closed = polys.filter(p => p.closed);
  if (closed.length < 4000) {
    for (const a of polys) {
      for (const b of closed) {
        if (a === b) continue;
        if (a.b.x0 >= b.b.x0 && a.b.x1 <= b.b.x1 && a.b.y0 >= b.b.y0 && a.b.y1 <= b.b.y1 &&
            pointInPoly(a.pts[0][0], a.pts[0][1], b.pts)) a.depth++;
      }
    }
  }
  const byDepth = new Map();
  for (const p of polys) {
    if (!byDepth.has(p.depth)) byDepth.set(p.depth, []);
    byDepth.get(p.depth).push(p);
  }
  const depths = [...byDepth.keys()].sort((a, b) => b - a);
  const order = [];
  let cx = cur.x, cy = cur.y;
  for (const d of depths) {
    const rem = byDepth.get(d).slice();
    while (rem.length) {
      let best = 0, bestD = Infinity, bestRev = false, bestStart = 0;
      for (let i = 0; i < rem.length; i++) {
        const p = rem[i];
        if (p.closed && p.pts.length < 1500) {
          for (let k = 0; k < p.pts.length - 1; k++) {
            const dd = (p.pts[k][0] - cx) ** 2 + (p.pts[k][1] - cy) ** 2;
            if (dd < bestD) { bestD = dd; best = i; bestRev = false; bestStart = k; }
          }
        } else {
          const a = p.pts[0], z = p.pts[p.pts.length - 1];
          const da = (a[0] - cx) ** 2 + (a[1] - cy) ** 2;
          const dz = (z[0] - cx) ** 2 + (z[1] - cy) ** 2;
          if (da < bestD) { bestD = da; best = i; bestRev = false; bestStart = 0; }
          if (!p.closed && dz < bestD) { bestD = dz; best = i; bestRev = true; bestStart = 0; }
        }
      }
      const p = rem.splice(best, 1)[0];
      let pts = p.pts;
      if (p.closed && bestStart > 0) {
        const ring = pts.slice(0, -1);
        pts = ring.slice(bestStart).concat(ring.slice(0, bestStart));
        pts.push(pts[0]);
      }
      if (bestRev) pts = pts.slice().reverse();
      order.push(pts);
      const last = pts[pts.length - 1];
      cx = last[0]; cy = last[1];
    }
  }
  const power = s.power / 100;
  for (let pass = 0; pass < s.passes; pass++) {
    for (const pts of order) {
      buf.push(K_RAPID, pts[0][0], pts[0][1], 0, 0, layerIdx);
      for (let i = 1; i < pts.length; i++) buf.push(K_FEED, pts[i][0], pts[i][1], power, s.speed, layerIdx);
    }
  }
  cur.x = cx; cur.y = cy;
}

// polyGroups: one array of polylines per object. Each object is filled even-odd (so holes in
// letters/compound paths stay empty); separate objects are unioned where they overlap.
function planFill(polyGroups, s, buf, cur, layerIdx) {
  const ang = ((s.angle || 0) * Math.PI) / 180;
  const cos = Math.cos(-ang), sin = Math.sin(-ang);
  const rot = (x, y) => [x * cos - y * sin, x * sin + y * cos];
  const cosB = Math.cos(ang), sinB = Math.sin(ang);
  const unrot = (x, y) => [x * cosB - y * sinB, x * sinB + y * cosB];
  const objects = [];
  let minY = Infinity, maxY = -Infinity;
  for (const polys of polyGroups) {
    const edges = [];
    for (const r of polys) {
      if (!r.closed || r.pts.length < 3) continue;
      const pts = r.pts.map(([x, y]) => rot(x, y));
      for (let i = 0; i < pts.length - 1; i++) {
        const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
        if (y1 === y2) continue;
        const e = y1 < y2 ? { ya: y1, yb: y2, x: x1, dx: (x2 - x1) / (y2 - y1) } : { ya: y2, yb: y1, x: x2, dx: (x1 - x2) / (y1 - y2) };
        edges.push(e);
        if (e.ya < minY) minY = e.ya;
        if (e.yb > maxY) maxY = e.yb;
      }
    }
    if (edges.length) objects.push({ edges: edges.sort((a, b) => a.ya - b.ya), ei: 0, active: [] });
  }
  if (!objects.length) return;
  const step = Math.max(0.01, s.interval);
  const os = s.overscan || 0;
  const power = s.power / 100;
  for (let pass = 0; pass < s.passes; pass++) {
    objects.forEach(o => { o.ei = 0; o.active = []; });
    let rowNum = 0;
    for (let y = minY + step / 2; y < maxY; y += step) {
      const spans = [];
      for (const o of objects) {
        while (o.ei < o.edges.length && o.edges[o.ei].ya <= y) o.active.push(o.edges[o.ei++]);
        if (!o.active.length) continue;
        o.active = o.active.filter(e => e.yb > y);
        const xs = [];
        for (const e of o.active) xs.push(e.x + (y - e.ya) * e.dx);
        xs.sort((a, b) => a - b);
        for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > 1e-6) spans.push([xs[i], xs[i + 1]]);
      }
      if (!spans.length) continue;
      spans.sort((a, b) => a[0] - b[0]);
      const segs = [spans[0].slice()];
      for (let i = 1; i < spans.length; i++) {
        const last = segs[segs.length - 1];
        if (spans[i][0] <= last[1] + 1e-6) last[1] = Math.max(last[1], spans[i][1]);
        else segs.push(spans[i].slice());
      }
      const rev = s.bidir && rowNum % 2 === 1;
      rowNum++;
      const list = rev ? segs.reverse().map(([a, b]) => [b, a]) : segs;
      const dir = rev ? -1 : 1;
      const start = unrot(list[0][0] - os * dir, y);
      buf.push(K_RAPID, start[0], start[1], 0, 0, layerIdx);
      for (const [a, b] of list) {
        const pa = unrot(a, y), pb = unrot(b, y);
        buf.push(K_FEED, pa[0], pa[1], 0, s.speed, layerIdx);
        buf.push(K_FEED, pb[0], pb[1], power, s.speed, layerIdx);
      }
      if (os > 0) {
        const end = unrot(list[list.length - 1][1] + os * dir, y);
        buf.push(K_FEED, end[0], end[1], 0, s.speed, layerIdx);
      }
      const last = unrot(list[list.length - 1][1], y);
      cur.x = last[0]; cur.y = last[1];
    }
  }
}

const srcCache = new Map();
async function sourceCanvas(url) {
  if (srcCache.has(url)) return srcCache.get(url);
  const img = await loadImage(url);
  const c = normalizeImage(img, 1e6);
  srcCache.set(url, c);
  return c;
}

async function planRaster(raster, s, buf, cur, layerIdx, warnings) {
  const adj = { ...DEFAULT_ADJ, ...(raster.data.adj || {}) };
  const url = raster.data.src || raster.source;
  if (!url) return;
  const src = await sourceCanvas(url);
  const b = raster.bounds;
  const step = Math.max(0.02, s.interval);
  let cols = Math.max(1, Math.round(b.width / step));
  let rows = Math.max(1, Math.round(b.height / step));
  if (cols * rows > 60e6) {
    warnings.push(`Image too large at ${step} mm interval; reduce size or increase line interval.`);
    return;
  }
  const cv = document.createElement('canvas');
  cv.width = cols;
  cv.height = rows;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, cols, rows);
  const rw = raster.width, rh = raster.height;
  const m = new paper.Matrix()
    .scale(cols / b.width, rows / b.height)
    .translate(-b.x, -b.y)
    .append(raster.globalMatrix)
    .translate(-rw / 2, -rh / 2);
  ctx.setTransform(m.a, m.b, m.c, m.d, m.tx, m.ty);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, rw, rh);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const gray = adjustedGray(ctx.getImageData(0, 0, cols, rows), adj);
  const burn = dither(gray, cols, rows, adj.dither, adj.threshold);
  const px = b.width / cols, py = b.height / rows;
  const maxP = s.power / 100, minP = (s.minPower || 0) / 100;
  const gray8 = adj.dither === 'grayscale';
  const powerOf = v => (v <= 0.004 ? 0 : gray8 ? minP + (maxP - minP) * Math.round(v * 100) / 100 : maxP);
  const os = s.overscan || 0;
  for (let pass = 0; pass < s.passes; pass++) {
    let rowNum = 0;
    for (let r = 0; r < rows; r++) {
      const base = r * cols;
      let first = -1, last = -1;
      for (let c = 0; c < cols; c++) if (powerOf(burn[base + c]) > 0) { if (first < 0) first = c; last = c; }
      if (first < 0) continue;
      const rev = s.bidir && rowNum % 2 === 1;
      rowNum++;
      const y = b.y + (r + 0.5) * py;
      const edge = c => b.x + c * px;
      if (!rev) {
        buf.push(K_RAPID, edge(first) - os, y, 0, 0, layerIdx);
        buf.push(K_FEED, edge(first), y, 0, s.speed, layerIdx);
        let c = first;
        while (c <= last) {
          const pw = powerOf(burn[base + c]);
          let e = c + 1;
          while (e <= last && powerOf(burn[base + e]) === pw) e++;
          buf.push(K_FEED, edge(e), y, pw, s.speed, layerIdx);
          c = e;
        }
        if (os > 0) buf.push(K_FEED, edge(last + 1) + os, y, 0, s.speed, layerIdx);
        cur.x = edge(last + 1);
      } else {
        buf.push(K_RAPID, edge(last + 1) + os, y, 0, 0, layerIdx);
        buf.push(K_FEED, edge(last + 1), y, 0, s.speed, layerIdx);
        let c = last;
        while (c >= first) {
          const pw = powerOf(burn[base + c]);
          let e = c - 1;
          while (e >= first && powerOf(burn[base + e]) === pw) e--;
          buf.push(K_FEED, edge(e + 1), y, pw, s.speed, layerIdx);
          c = e;
        }
        if (os > 0) buf.push(K_FEED, edge(first) - os, y, 0, s.speed, layerIdx);
        cur.x = edge(first);
      }
      cur.y = y;
    }
  }
}

// ---------------------------------------------------------------- job
function effective(layer, item) {
  const s = { ...layer };
  const o = item.data && item.data.proc;
  if (o && o.enabled) {
    if (o.power != null) s.power = +o.power;
    if (o.speed != null) s.speed = +o.speed;
    if (o.passes != null) s.passes = +o.passes;
  }
  s.passes = Math.max(1, Math.round(s.passes || 1));
  s.speed = Math.max(1, +s.speed || 1000);
  s.power = Math.min(100, Math.max(0, +s.power || 0));
  return s;
}

/** Plan the whole job. `onlySelection` limits output to selected objects. */
export async function buildJob({ onlySelection = false } = {}) {
  const buf = new MoveBuffer();
  const warnings = [];
  const cur = { x: 0, y: 0 };
  let items = leafItems(ed.design);
  if (onlySelection && state.selection.length) {
    const sel = new Set();
    const walk = it => { if (it.className === 'Group') it.children.forEach(walk); else sel.add(it); };
    state.selection.forEach(walk);
    items = items.filter(i => sel.has(i));
  }
  const layers = state.layers.slice().sort((a, b) => a.order - b.order);
  const jobLayers = [];
  for (const layer of layers) {
    if (!layer.output || !layer.visible) continue;
    const mine = items.filter(i => (i.data.layer || 'L00') === layer.id);
    if (!mine.length) continue;
    const layerIdx = jobLayers.length;
    jobLayers.push({ ...layer });
    buf.push(K_LAYER, layerIdx, 0, layer.air ? 1 : 0, 0, layerIdx);
    // Group by effective settings (per-object overrides)
    const groups = new Map();
    for (const it of mine) {
      const s = effective(layer, it);
      const key = `${s.power}|${s.speed}|${s.passes}`;
      if (!groups.has(key)) groups.set(key, { s, items: [] });
      groups.get(key).items.push(it);
    }
    for (const { s, items: gi } of groups.values()) {
      const rasters = gi.filter(i => i.className === 'Raster');
      const vectors = gi.filter(i => i.className !== 'Raster');
      for (const r of rasters) await planRaster(r, s, buf, cur, layerIdx, warnings);
      if (!vectors.length) continue;
      const perObject = vectors.map(v => itemPolylines(v, layer.mode === 'line' ? 0.01 : 0.02));
      const polys = perObject.flat();
      if (layer.mode === 'line') planLines(polys, s, buf, cur, layerIdx);
      else {
        planFill(perObject, s, buf, cur, layerIdx);
        const open = polys.filter(p => !p.closed);
        if (open.length) {
          warnings.push(`${layer.name}: ${open.length} open path(s) cannot be filled and were engraved as lines.`);
          planLines(open, s, buf, cur, layerIdx);
        }
      }
    }
  }

  // Bounds and statistics
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  let burnDist = 0, travelDist = 0, time = 0, px = 0, py = 0;
  const rapid = state.device.rapid || 6000;
  const a = buf.a;
  for (let i = 0; i < buf.n; i++) {
    const k = a[i * 6];
    if (k === K_LAYER) continue;
    const x = a[i * 6 + 1], y = a[i * 6 + 2];
    const d = Math.hypot(x - px, y - py);
    if (k === K_RAPID) { travelDist += d; time += d / rapid; } else {
      if (a[i * 6 + 3] > 0) burnDist += d;
      time += d / a[i * 6 + 4];
    }
    if (a[i * 6 + 3] > 0 || k === K_FEED) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    px = x; py = y;
  }
  const W = state.device.workW, H = state.device.workH;
  const hasMoves = x0 !== Infinity;
  if (hasMoves && (x0 < -0.01 || y0 < -0.01 || x1 > W + 0.01 || y1 > H + 0.01)) {
    warnings.push('Some of the job lies outside the work area.');
  }
  return {
    buf,
    layers: jobLayers,
    warnings,
    bounds: hasMoves ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null,
    stats: { moves: buf.n, burnDist, travelDist, seconds: time * 60 * 1.08 }
  };
}

// ---------------------------------------------------------------- emitter
function anchorPoint(bounds, anchor) {
  const ax = anchor.includes('l') ? bounds.x : anchor.includes('r') ? bounds.x + bounds.w : bounds.x + bounds.w / 2;
  const ay = anchor.startsWith('t') ? bounds.y : anchor.startsWith('b') ? bounds.y + bounds.h : bounds.y + bounds.h / 2;
  return [ax, ay];
}

export function machineMapper(device, bounds) {
  const W = device.workW, H = device.workH;
  const o = device.origin || 'bl';
  const map = (x, y) => [o.includes('r') ? W - x : x, o.includes('b') ? H - y : y];
  let ox = 0, oy = 0;
  if (device.jobOrigin === 'current' && bounds) {
    const [ax, ay] = anchorPoint(bounds, device.jobAnchor || 'bl');
    [ox, oy] = map(ax, ay);
  }
  return (x, y) => {
    const [mx, my] = map(x, y);
    return [mx - ox, my - oy];
  };
}

const fmt = v => {
  const r = Math.round(v * 1000) / 1000;
  return (Object.is(r, -0) ? 0 : r).toString();
};

export function emitGcode(job, device = state.device) {
  const ctl = device.controller;
  const info = CONTROLLERS[ctl] || CONTROLLERS.grbl;
  const sMax = +device.sMax || info.sMax;
  const sFmt = p => (sMax <= 1 ? (p * sMax).toFixed(3) : String(Math.round(p * sMax)));
  const isMarlin = ctl === 'marlin';
  const isSmoothie = ctl === 'smoothie';
  const laserOn = isMarlin ? 'M3 I S0' : isSmoothie ? '' : `${device.laserMode === 'M3' ? 'M3' : 'M4'} S0`;
  const map = machineMapper(device, job.bounds);
  const out = [];
  out.push('; Generated by Crafter Studio');
  out.push(`; Device: ${device.name}`);
  out.push(`; Work area: ${device.workW} x ${device.workH} mm, origin ${device.origin}`);
  out.push(`; Estimated time: ${formatDuration(job.stats.seconds)}`);
  out.push('G21 ; millimetres');
  out.push('G90 ; absolute');
  out.push('M5');
  if (device.startGcode) out.push(...device.startGcode.split(/\r?\n/).filter(Boolean));
  if (device.homeOnStart) out.push(isMarlin ? 'G28 X Y' : '$H');
  if (device.jobOrigin === 'current') out.push('G92 X0 Y0 ; job starts at current position');

  const a = job.buf.a;
  let lx = null, ly = null, lf = null, ls = null, laserEnabled = false;
  for (let i = 0; i < job.buf.n; i++) {
    const k = a[i * 6];
    if (k === K_LAYER) {
      const L = job.layers[a[i * 6 + 1]];
      out.push(`; --- Layer: ${L.name} | ${L.mode} | ${L.power}% | ${L.speed} mm/min | ${L.passes} pass(es)`);
      out.push(device.airAssist && L.air ? 'M8' : 'M9');
      if (laserOn) out.push(laserOn);
      laserEnabled = true;
      ls = 0;
      lf = null;
      continue;
    }
    const [mx, my] = map(a[i * 6 + 1], a[i * 6 + 2]);
    const xs = fmt(mx), ys = fmt(my);
    let line;
    if (k === K_RAPID) {
      if (xs === lx && ys === ly) continue;
      line = 'G0';
      if (xs !== lx) line += ' X' + xs;
      if (ys !== ly) line += ' Y' + ys;
      if (isSmoothie || isMarlin) { /* G0 is laser-off on these firmwares */ }
    } else {
      const p = a[i * 6 + 3];
      const f = Math.round(a[i * 6 + 4]);
      const s = sFmt(p);
      if (xs === lx && ys === ly) { continue; }
      line = 'G1';
      if (xs !== lx) line += ' X' + xs;
      if (ys !== ly) line += ' Y' + ys;
      if (s !== ls) line += ' S' + s;
      if (f !== lf) line += ' F' + f;
      ls = s;
      lf = f;
    }
    lx = xs;
    ly = ys;
    out.push(line);
  }
  if (laserEnabled) out.push('M5');
  out.push('M9');
  // X0 Y0 is the machine origin in absolute mode, or the job start point in current-position mode.
  if (device.returnHome) out.push('G0 X0 Y0');
  if (device.jobOrigin === 'current' && !isMarlin) out.push('G92.1');
  if (device.endGcode) out.push(...device.endGcode.split(/\r?\n/).filter(Boolean));
  out.push(isMarlin ? 'M400' : 'M2');
  return out.join('\n') + '\n';
}

export function frameGcode(bounds, device = state.device) {
  const map = machineMapper(device, bounds);
  const pts = [[bounds.x, bounds.y], [bounds.x + bounds.w, bounds.y], [bounds.x + bounds.w, bounds.y + bounds.h], [bounds.x, bounds.y + bounds.h], [bounds.x, bounds.y]];
  const sMax = +device.sMax || 1000;
  const p = (device.framePower || 0) / 100;
  const s = sMax <= 1 ? (p * sMax).toFixed(3) : Math.round(p * sMax);
  const lines = ['G21', 'G90'];
  if (device.jobOrigin === 'current') lines.push('G92 X0 Y0');
  const [sx, sy] = map(pts[0][0], pts[0][1]);
  lines.push(`G0 X${fmt(sx)} Y${fmt(sy)}`);
  if (p > 0 && device.controller !== 'smoothie') lines.push(device.controller === 'marlin' ? `M3 I S${s}` : `M3 S${s}`);
  for (let i = 1; i < pts.length; i++) {
    const [x, y] = map(pts[i][0], pts[i][1]);
    lines.push(`G1 X${fmt(x)} Y${fmt(y)} F${device.frameSpeed || 3000}${p > 0 ? ' S' + s : ' S0'}`);
  }
  lines.push('M5');
  if (device.jobOrigin === 'current') lines.push('G0 X0 Y0', 'G92.1');
  return lines;
}

export function formatDuration(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}h ${m}m ${s}s` : m ? `${m}m ${s}s` : `${s}s`;
}
