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

// ---------------------------------------------------------------- tabs
// Small uncut gaps that hold a part in its sheet so it does not drop into the
// machine, tip up into the beam, or shift on the last pass. The operator snaps
// them afterwards.
//
// Splitting happens after cut ordering has been decided, because that ordering
// relies on contours still being closed to work out what sits inside what.

/** Point at a given arc length along a polyline. */
function pointAtLength(pts, segLens, target) {
  let acc = 0;
  for (let i = 0; i < segLens.length; i++) {
    if (acc + segLens[i] >= target) {
      const t = segLens[i] > 0 ? (target - acc) / segLens[i] : 0;
      const a = pts[i], b = pts[i + 1];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    acc += segLens[i];
  }
  return pts[pts.length - 1].slice();
}

/**
 * Break a closed contour into the runs between evenly spaced gaps.
 * Returns an array of point lists; a single entry means nothing was removed.
 */
export function splitForTabs(pts, closed, tabs) {
  const count = Math.max(0, Math.round((tabs && tabs.count) || 0));
  const size = (tabs && +tabs.size) || 0;
  if (!closed || count < 1 || size <= 0 || pts.length < 3) return [pts];

  const segLens = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    segLens.push(d);
    total += d;
  }
  // Leaving less cut than tab would not free the part at all; cutting the
  // contour normally is the safer failure.
  if (total <= 0 || size * count > total * 0.5) return [pts];

  const step = total / count;
  const runs = [];
  for (let k = 0; k < count; k++) {
    // Gaps sit at the middle of each division so one never lands on the seam.
    const gapEnd = (k + 0.5) * step + size / 2;
    const nextGapStart = (k + 1 + 0.5) * step - size / 2;
    const from = gapEnd, to = nextGapStart;
    if (to - from < 1e-6) continue;

    // Gather the original vertices inside this run. A run can cross the seam,
    // so each vertex is considered at its own position and one lap further on,
    // then everything is ordered by distance travelled — collecting them in
    // index order instead would zig-zag back across the shape.
    const inside = [];
    let acc = 0;
    for (let i = 0; i < segLens.length; i++) {
      const at = acc + segLens[i];
      for (const pos of [at, at + total]) {
        if (pos > from && pos < to) inside.push({ pos, pt: pts[i + 1].slice() });
      }
      acc = at;
    }
    inside.sort((a, b) => a.pos - b.pos);

    const run = [pointAtLength(pts, segLens, from % total)];
    for (const v of inside) run.push(v.pt);
    run.push(pointAtLength(pts, segLens, to % total));
    if (run.length >= 2) runs.push(run);
  }
  return runs.length ? runs : [pts];
}

// ---------------------------------------------------------------- lead in/out
/**
 * A lead is a short cutting move that starts out in the waste and arrives at
 * the shape, so that the mark the beam leaves where it first pierces is not on
 * the finished edge. The lead-out does the same for where it stops.
 *
 * Which side is waste depends on what the contour is: for the outline of a
 * part it is outside, for a hole it is inside. That is the same nesting parity
 * the kerf offset uses, so a lead never cuts into the piece being kept.
 */
export function leadSegment(P, dir, waste, { length, angle = 45, style = 'line', outgoing = false }) {
  if (!(length > 0)) return [];
  const [tx, ty] = dir;
  if (!isFinite(tx) || !isFinite(waste[0])) return [];
  // Take only the part of the waste direction that is across the path. A
  // normal is perpendicular by construction, but squaring it up here means the
  // arc still meets the shape tangentially if it ever is not.
  let wx = waste[0] - tx * (waste[0] * tx + waste[1] * ty);
  let wy = waste[1] - ty * (waste[0] * tx + waste[1] * ty);
  const wm = Math.hypot(wx, wy);
  if (wm < 1e-9) { wx = -ty; wy = tx; } else { wx /= wm; wy /= wm; }

  if (style === 'arc') {
    // A quarter turn whose arc length is the figure the user asked for, curving
    // away into the waste and meeting the shape tangentially.
    const r = length / (Math.PI / 2);
    const cx = P[0] + wx * r, cy = P[1] + wy * r;
    const a1 = Math.atan2(P[1] - cy, P[0] - cx);
    // Travelling anticlockwise, the velocity at P is rot90(P-C)/r. Pick the
    // direction that arrives (or leaves) along the path's own tangent.
    const ccw = (wy * tx - wx * ty) > 0;
    const sweep = (Math.PI / 2) * (ccw ? 1 : -1);
    const steps = Math.max(4, Math.ceil(length / 0.25));
    const out = [];
    for (let i = 0; i <= steps; i++) {
      // Incoming runs from the far end of the arc to P; outgoing from P onward.
      const f = outgoing ? (i / steps) : (i / steps - 1);
      const a = a1 + sweep * f;
      out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    if (outgoing) out.shift(); else out.pop();      // P itself is on the path
    return out;
  }

  // Straight lead at `angle` to the path. The sign is chosen, not asked for:
  // whichever rotation puts the lead in the waste is the one that is wanted.
  const th = Math.max(5, Math.min(175, angle)) * Math.PI / 180;
  const pick = sgn => {
    const c = Math.cos(sgn * th), sn = Math.sin(sgn * th);
    return [tx * c - ty * sn, tx * sn + ty * c];
  };
  const want = outgoing ? 1 : -1;                   // sign of D·waste we need
  let D = pick(1);
  if ((D[0] * wx + D[1] * wy) * want <= 0) D = pick(-1);
  if ((D[0] * wx + D[1] * wy) * want <= 0) D = [wx * want, wy * want];
  return outgoing ? [[P[0] + D[0] * length, P[1] + D[1] * length]]
                  : [[P[0] - D[0] * length, P[1] - D[1] * length]];
}

/** Unit travel direction at one end of a run, skipping coincident points. */
function endDirection(pts, atEnd) {
  const n = pts.length;
  if (n < 2) return null;
  if (atEnd) {
    for (let i = n - 2; i >= 0; i--) {
      const dx = pts[n - 1][0] - pts[i][0], dy = pts[n - 1][1] - pts[i][1];
      const d = Math.hypot(dx, dy);
      if (d > 1e-9) return [dx / d, dy / d];
    }
  } else {
    for (let i = 1; i < n; i++) {
      const dx = pts[i][0] - pts[0][0], dy = pts[i][1] - pts[0][1];
      const d = Math.hypot(dx, dy);
      if (d > 1e-9) return [dx / d, dy / d];
    }
  }
  return null;
}

/**
 * The unit normal at P pointing away from the material that is being kept.
 * `depth` is how many closed contours enclose this one: even means an outline
 * whose waste is outside, odd means a hole whose waste is inside.
 */
function wasteNormal(P, dir, ring, depth) {
  const n = [-dir[1], dir[0]];
  const eps = 1e-3;
  const inside = pointInPoly(P[0] + n[0] * eps, P[1] + n[1] * eps, ring);
  const inward = inside ? n : [-n[0], -n[1]];
  const outward = [-inward[0], -inward[1]];
  return depth % 2 === 0 ? outward : inward;
}

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
      order.push({ pts, closed: p.closed, tabs: p.tabs, depth: p.depth });
      const last = pts[pts.length - 1];
      cx = last[0]; cy = last[1];
    }
  }
  const power = s.power / 100;
  for (let pass = 0; pass < s.passes; pass++) {
    for (const entry of order) {
      // Tabs are applied per pass, so every pass leaves the same bridges
      // rather than a later pass cutting through an earlier one's tab.
      const runs = splitForTabs(entry.pts, entry.closed, entry.tabs);
      // Leads belong to the shape, not to each tabbed run: one in at the very
      // start, one out at the very end. Only closed shapes get them — an open
      // path has no finished edge to protect, and a lead would just extend the
      // cut past where it was drawn.
      const wantLead = entry.closed && (s.leadIn > 0 || s.leadOut > 0) && runs.length;
      for (let r = 0; r < runs.length; r++) {
        let pts = runs[r];
        if (wantLead && r === 0 && s.leadIn > 0) {
          const dir = endDirection(pts, false);
          if (dir) {
            const w = wasteNormal(pts[0], dir, entry.pts, entry.depth || 0);
            const lead = leadSegment(pts[0], dir, w, { length: s.leadIn, angle: s.leadAngle, style: s.leadStyle });
            if (lead.length) pts = lead.concat(pts);
          }
        }
        if (wantLead && r === runs.length - 1 && s.leadOut > 0) {
          const dir = endDirection(pts, true);
          if (dir) {
            const end = pts[pts.length - 1];
            const w = wasteNormal(end, dir, entry.pts, entry.depth || 0);
            const lead = leadSegment(end, dir, w, { length: s.leadOut, angle: s.leadAngle, style: s.leadStyle, outgoing: true });
            if (lead.length) pts = pts.concat(lead);
          }
        }
        buf.push(K_RAPID, pts[0][0], pts[0][1], 0, 0, layerIdx);
        for (let i = 1; i < pts.length; i++) buf.push(K_FEED, pts[i][0], pts[i][1], power, s.speed, layerIdx);
      }
    }
  }
  cur.x = cx; cur.y = cy;
}

// polyGroups: one array of polylines per object. Each object is filled even-odd (so holes in
// letters/compound paths stay empty); separate objects are unioned where they overlap.

// ---------------------------------------------------------------- offset fill
// Instead of sweeping back and forth, follow the outline inward in concentric
// rings. On a diode that often marks more evenly, because the head is always
// moving along an edge rather than reversing at the end of every scan line,
// and it leaves a grain that follows the shape.

/**
 * Concentric contours stepping inward from `item`'s outline.
 * Each ring is offset from the original rather than from the previous ring, so
 * the spacing cannot drift as the rings accumulate rounding.
 */
export function offsetFillRings(item, interval, container = null, maxRings = 500) {
  const step = Math.max(0.01, interval);
  if (typeof PaperOffset === 'undefined') return [];
  const rings = [];
  for (let k = 1; k <= maxRings; k++) {
    // Half a step in for the first ring keeps the whole beam inside the shape.
    const d = -(k - 0.5) * step;
    let r = null;
    try {
      r = PaperOffset.offset(item, d, { join: 'round', insert: false });
    } catch {
      break;
    }
    if (!r) break;
    const b = r.bounds;
    // Once the inset has eaten the shape there is nothing left to burn.
    if (!b || b.width < step * 0.5 || b.height < step * 0.5) { r.remove && r.remove(); break; }
    const empty = r.className === 'CompoundPath' ? !r.children.length : !(r.segments && r.segments.length);
    if (empty) { r.remove && r.remove(); break; }
    if (container) container.addChild(r);
    rings.push(r);
  }
  return rings;
}

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
  s.leadIn = Math.max(0, +s.leadIn || 0);
  s.leadOut = Math.max(0, +s.leadOut || 0);
  s.leadAngle = Math.max(5, Math.min(175, +s.leadAngle || 45));
  s.leadStyle = s.leadStyle === 'arc' ? 'arc' : 'line';
  return s;
}

/** Plan the whole job. `onlySelection` limits output to selected objects. */

// ---------------------------------------------------------------- kerf
// The beam removes material either side of the line it follows, so a part cut
// exactly on its outline comes out undersized by half the kerf all round, and
// its holes come out oversized by the same. Offsetting outward on outer
// contours and inward on holes puts the *cut edge* on the drawn line.
//
// This runs on clones while the job is built. The drawing is never modified,
// so changing the kerf figure or turning it off restores the original
// geometry exactly.

/** A point strictly inside a closed path, usable for containment tests. */
function interiorPoint(path) {
  const loc = path.getLocationAt(path.length * 0.5);
  if (!loc || !loc.normal) return path.bounds.center;
  const step = loc.normal.normalize(Math.max(0.01, path.length * 1e-4));
  const a = loc.point.add(step);
  if (path.contains(a)) return a;
  const b = loc.point.subtract(step);
  if (path.contains(b)) return b;
  return path.bounds.center;
}

/** Flatten an item into the closed paths it is made of. */
function closedPathsOf(item) {
  if (item.className === 'Path') return item.closed ? [item] : [];
  if (item.getItems) return item.getItems({ match: i => i.className === 'Path' && i.closed });
  return [];
}

/**
 * Offset a layer's vector items by half the kerf, inverting the direction for
 * anything nested inside another shape so holes shrink while outlines grow.
 * Returns replacement items; open paths are passed through untouched, since
 * "inside" is undefined for them.
 *
 * Offset results are placed in `container` when one is given. Downstream
 * toolpath code reads globalMatrix, which is null on an item that belongs to
 * no project, so the clones cannot simply float free.
 */
export function applyKerf(items, kerf, container = null) {
  const half = kerf / 2;
  if (!isFinite(half) || Math.abs(half) < 1e-6) return items;
  if (typeof PaperOffset === 'undefined') return items;

  // Nesting depth is counted across the whole layer, so a hole in one part and
  // a separate small part elsewhere are told apart.
  const all = items.flatMap(closedPathsOf);
  const info = all.map(p => ({ path: p, pt: interiorPoint(p) }));

  const depthOf = p => {
    let d = 0;
    for (const o of info) {
      if (o.path === p) continue;
      const me = info.find(x => x.path === p);
      if (o.path.contains(me.pt)) d++;
    }
    return d;
  };

  const out = [];
  for (const item of items) {
    const closed = closedPathsOf(item);
    if (!closed.length) { out.push(item); continue; }

    const pieces = [];
    let failed = false;
    for (const p of closed) {
      // Even depth is an outline and grows; odd depth is a hole and shrinks.
      const dist = (depthOf(p) % 2 === 0 ? 1 : -1) * half;
      let r = null;
      try {
        r = PaperOffset.offset(p, dist, { join: 'round', insert: false });
      } catch {
        r = null;
      }
      // An inward offset larger than the feature simply consumes it; dropping
      // the shape silently would cut nothing, so keep the original and let the
      // caller warn.
      if (!r || !r.bounds || r.bounds.width < 1e-6 || r.bounds.height < 1e-6) { failed = true; break; }
      r.data = { ...p.data };
      if (container) container.addChild(r);
      pieces.push(r);
    }
    if (failed) { out.push(item); continue; }
    out.push(...pieces);
  }
  return out;
}

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
  // Kerf clones need to belong to the project to have a globalMatrix, but must
  // not appear on the canvas or in the design. A hidden layer, removed before
  // this function returns, satisfies both.
  let kerfHolder = null;
  const kerfContainer = () => {
    if (!kerfHolder) {
      const active = paper.project.activeLayer;
      kerfHolder = new paper.Layer();
      kerfHolder.visible = false;
      if (active) active.activate();
    }
    return kerfHolder;
  };
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
      let vectors = gi.filter(i => i.className !== 'Raster');
      for (const r of rasters) await planRaster(r, s, buf, cur, layerIdx, warnings);
      if (!vectors.length) continue;
      // Kerf only makes sense for cutting; a fill already covers its own area.
      const kerf = layer.mode === 'line' ? (+layer.kerf || 0) : 0;
      if (kerf) {
        const before = vectors.length;
        vectors = applyKerf(vectors, kerf, kerfContainer());
        const openCount = vectors.flatMap(v => (v.className === 'Path' ? [v] : (v.getItems ? v.getItems({ match: i => i.className === 'Path' }) : [])))
          .filter(pp => !pp.closed).length;
        if (openCount) warnings.push(`${layer.name}: kerf offset skipped ${openCount} open path(s) — "inside" is undefined for a shape that is not closed.`);
        if (vectors.length < before) warnings.push(`${layer.name}: a shape was too small for a ${kerf} mm kerf offset and was left unchanged.`);
      }
      const perObject = vectors.map(v => itemPolylines(v, layer.mode === 'line' ? 0.01 : 0.02));
      const polys = perObject.flat();
      if (layer.mode === 'line' && (+layer.tabCount || 0) > 0 && (+layer.tabSize || 0) > 0) {
        const tabs = { count: +layer.tabCount, size: +layer.tabSize };
        let skipped = 0;
        for (const poly of polys) {
          if (!poly.closed) continue;
          poly.tabs = tabs;
          if (splitForTabs(poly.pts, true, tabs).length === 1) skipped++;
        }
        if (skipped) warnings.push(`${layer.name}: ${skipped} shape(s) too small for ${tabs.count} × ${tabs.size} mm tabs — cut normally instead.`);
      }
      if (layer.mode === 'line') planLines(polys, s, buf, cur, layerIdx);
      else if (layer.fillStyle === 'offset') {
        const ringPolys = [];
        for (const v of vectors) {
          for (const ring of offsetFillRings(v, s.interval, kerfContainer())) {
            ringPolys.push(...itemPolylines(ring, 0.02));
          }
        }
        if (ringPolys.length) planLines(ringPolys, s, buf, cur, layerIdx);
        else warnings.push(`${layer.name}: nothing was small enough to fill at a ${s.interval} mm interval.`);
        const open = polys.filter(p => !p.closed);
        if (open.length) {
          warnings.push(`${layer.name}: ${open.length} open path(s) cannot be filled and were engraved as lines.`);
          planLines(open, s, buf, cur, layerIdx);
        }
      } else {
        // Filling each object on its own finishes one shape before starting the
        // next, instead of sweeping a row across everything at that height.
        if (layer.fillIndividually) {
          for (const group of perObject) planFill([group], s, buf, cur, layerIdx);
        } else {
          planFill(perObject, s, buf, cur, layerIdx);
        }
        const open = polys.filter(p => !p.closed);
        if (open.length) {
          warnings.push(`${layer.name}: ${open.length} open path(s) cannot be filled and were engraved as lines.`);
          planLines(open, s, buf, cur, layerIdx);
        }
      }
    }
  }

  if (kerfHolder) { kerfHolder.remove(); kerfHolder = null; }

  // Bounds and statistics
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  let burnDist = 0, travelDist = 0, time = 0, px = 0, py = 0, hasPrev = false;
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
      // The point a cut starts from arrives as a rapid, so without this the
      // first vertex of every open path is missing from the extent.
      if (hasPrev) {
        if (px < x0) x0 = px; if (px > x1) x1 = px;
        if (py < y0) y0 = py; if (py > y1) y1 = py;
      }
    }
    px = x; py = y; hasPrev = true;
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


// ---------------------------------------------------------------- rotary
/**
 * A rotary attachment replaces the Y axis: travel along Y becomes rotation of
 * the workpiece, so a design wraps around a cylinder instead of running off the
 * bed. Everything here is a conversion from "millimetres along the surface of
 * the object" to whatever the controller expects.
 *
 * Two output styles, because hobby machines are wired both ways:
 *
 *   axis 'A'  the controller has a real rotary axis taking degrees.
 *             degrees = surface_mm / (pi * objectDiameter) * 360
 *
 *   axis 'Y'  the rotary is plugged into the Y motor, so the firmware still
 *             thinks in millimetres. The user measures how much Y travel makes
 *             one full turn, and travel is scaled into that.
 *             y_out = surface_mm / (pi * objectDiameter) * mmPerRotation
 *
 * Both reduce to "fraction of a turn" first, which is the only quantity the
 * geometry actually determines.
 */
export function rotaryConfig(device) {
  const r = (device && device.rotary) || {};
  const diameter = +r.objectDiameter || 0;
  if (!r.enabled || diameter <= 0) return null;
  const circumference = Math.PI * diameter;
  if (!isFinite(circumference) || circumference <= 0) return null;
  const axis = r.axis === 'A' ? 'A' : 'Y';
  const mmPerRotation = +r.mmPerRotation || 0;
  if (axis === 'Y' && mmPerRotation <= 0) return null;
  return {
    axis,
    diameter,
    circumference,
    mmPerRotation,
    // Surface millimetres -> output units on the rotary axis.
    perMm: axis === 'A' ? 360 / circumference : mmPerRotation / circumference
  };
}

/** Surface millimetres along Y -> the value to write on the rotary axis. */
export function rotaryValue(rot, surfaceMm) {
  return surfaceMm * rot.perMm;
}

export function emitGcode(job, device = state.device) {
  const ctl = device.controller;
  const info = CONTROLLERS[ctl] || CONTROLLERS.grbl;
  const sMax = +device.sMax || info.sMax;
  const sFmt = p => (sMax <= 1 ? (p * sMax).toFixed(3) : String(Math.round(p * sMax)));
  const isMarlin = ctl === 'marlin';
  const isSmoothie = ctl === 'smoothie';
  const laserOn = isMarlin ? 'M3 I S0' : isSmoothie ? '' : `${device.laserMode === 'M3' ? 'M3' : 'M4'} S0`;
  const map = machineMapper(device, job.bounds);
  const rot = rotaryConfig(device);
  // On a rotary the Y axis no longer measures distance, so the axis letter and
  // the numbers written against it both change.
  const yAxis = rot ? rot.axis : 'Y';
  const yOut = rot ? (mm => fmt(rotaryValue(rot, mm))) : (mm => fmt(mm));
  const out = [];
  out.push('; Generated by Crafter Studio');
  out.push(`; Device: ${device.name}`);
  out.push(`; Work area: ${device.workW} x ${device.workH} mm, origin ${device.origin}`);
  if (rot) {
    out.push(`; ROTARY: Y replaced by ${rot.axis}, object diameter ${rot.diameter} mm`);
    out.push(`; circumference ${rot.circumference.toFixed(3)} mm = one full turn`);
    out.push(rot.axis === 'A'
      ? `; 1 mm along the surface = ${rot.perMm.toFixed(5)} degrees`
      : `; 1 mm along the surface = ${rot.perMm.toFixed(5)} mm of ${rot.axis} travel (${rot.mmPerRotation} mm per turn)`);
  }
  out.push(`; Estimated time: ${formatDuration(job.stats.seconds)}`);
  out.push('G21 ; millimetres');
  out.push('G90 ; absolute');
  out.push('M5');
  if (device.startGcode) out.push(...device.startGcode.split(/\r?\n/).filter(Boolean));
  if (device.homeOnStart) {
    // Homing a rotary axis would drive it into nothing, so only X is homed.
    out.push(rot ? (isMarlin ? 'G28 X' : '$HX') : (isMarlin ? 'G28 X Y' : '$H'));
  }
  if (device.jobOrigin === 'current') out.push(`G92 X0 ${yAxis}0 ; job starts at current position`);

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
    const xs = fmt(mx), ys = yOut(my);
    let line;
    if (k === K_RAPID) {
      if (xs === lx && ys === ly) continue;
      line = 'G0';
      if (xs !== lx) line += ' X' + xs;
      if (ys !== ly) line += ' ' + yAxis + ys;
      if (isSmoothie || isMarlin) { /* G0 is laser-off on these firmwares */ }
    } else {
      const p = a[i * 6 + 3];
      const f = Math.round(a[i * 6 + 4]);
      const s = sFmt(p);
      if (xs === lx && ys === ly) { continue; }
      line = 'G1';
      if (xs !== lx) line += ' X' + xs;
      if (ys !== ly) line += ' ' + yAxis + ys;
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
  if (device.returnHome) out.push(rot ? 'G0 X0' : 'G0 X0 Y0');
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
