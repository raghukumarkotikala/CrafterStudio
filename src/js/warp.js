// Envelope warping: maps geometry from its bounding box onto an arbitrary
// quadrilateral using a projective (perspective) transform, so dragging a
// corner behaves the way people expect — straight edges stay straight and the
// far side foreshortens.
/* global paper */

// Corner order used everywhere here: 0 = top-left, 1 = top-right,
// 2 = bottom-right, 3 = bottom-left, matching the unit square
// (0,0) (1,0) (1,1) (0,1).
export const IDENTITY_QUAD = [[0, 0], [1, 0], [1, 1], [0, 1]];

export function isIdentityQuad(q) {
  if (!Array.isArray(q) || q.length !== 4) return true;
  return q.every((p, i) => Math.abs(p[0] - IDENTITY_QUAD[i][0]) < 1e-9 &&
                           Math.abs(p[1] - IDENTITY_QUAD[i][1]) < 1e-9);
}

/**
 * A quad is usable only if it is strictly convex: that rules out a collapsed
 * corner, three corners in a line, and the bow-tie you get by dragging one
 * corner past its neighbour — all of which fold the geometry onto itself.
 */
export function isValidQuad(q) {
  if (!Array.isArray(q) || q.length !== 4) return false;
  if (q.some(p => !Array.isArray(p) || p.length !== 2 || !isFinite(p[0]) || !isFinite(p[1]))) return false;
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cross) < 1e-9) return false;           // collinear or collapsed
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;                  // concave or self-crossing
  }
  return true;
}

/**
 * Coefficients mapping the unit square onto quad q.
 * Returns { a,b,c,d,e,f,g,h } for
 *   x' = (a·u + b·v + c) / (g·u + h·v + 1)
 *   y' = (d·u + e·v + f) / (g·u + h·v + 1)
 */
export function unitQuadTransform(q) {
  if (!isValidQuad(q)) return null;
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;

  // No projective component: the quad is a parallelogram, so this is affine.
  if (Math.abs(dx3) < 1e-12 && Math.abs(dy3) < 1e-12) {
    return { a: x1 - x0, b: x2 - x1, c: x0, d: y1 - y0, e: y2 - y1, f: y0, g: 0, h: 0 };
  }
  const den = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(den) < 1e-12) return null;           // degenerate: three corners collinear
  const g = (dx3 * dy2 - dx2 * dy3) / den;
  const h = (dx1 * dy3 - dx3 * dy1) / den;
  return {
    a: x1 - x0 + g * x1, b: x3 - x0 + h * x3, c: x0,
    d: y1 - y0 + g * y1, e: y3 - y0 + h * y3, f: y0,
    g, h
  };
}

export function mapUnit(t, u, v) {
  const w = t.g * u + t.h * v + 1;
  if (Math.abs(w) < 1e-12) return [NaN, NaN];
  return [(t.a * u + t.b * v + t.c) / w, (t.d * u + t.e * v + t.f) / w];
}

// ---------------------------------------------------------------- paper.js side

// A projective map bends straight lines' parameterisation, so long curves need
// breaking up before their control points are moved or the result bulges wrongly.
function subdivide(path, maxLen) {
  if (!path.curves) return;
  for (let i = 0; i < path.curves.length; i++) {
    let guard = 0;
    while (path.curves[i].length > maxLen && guard++ < 12) {
      path.curves[i].divideAtTime(0.5);
    }
  }
}

function warpSegments(path, rect, t) {
  const toUV = p => [(p.x - rect.x) / rect.width, (p.y - rect.y) / rect.height];
  for (const seg of path.segments) {
    // Handles are relative to their segment point, so lift them to absolute
    // positions, map all three, then put them back as offsets.
    const absIn = seg.point.add(seg.handleIn);
    const absOut = seg.point.add(seg.handleOut);
    const [px, py] = mapUnit(t, ...toUV(seg.point));
    const [ix, iy] = mapUnit(t, ...toUV(absIn));
    const [ox, oy] = mapUnit(t, ...toUV(absOut));
    if (!isFinite(px) || !isFinite(py)) continue;
    seg.point = new paper.Point(px, py);
    if (isFinite(ix) && isFinite(iy)) seg.handleIn = new paper.Point(ix - px, iy - py);
    if (isFinite(ox) && isFinite(oy)) seg.handleOut = new paper.Point(ox - px, oy - py);
  }
}

/**
 * Warp `item` in place so its current bounds map onto `quad`, where quad
 * corners are given in units of the bounding box (0..1, and may go outside it).
 */
export function warpItem(item, quad, { detail = 0.5 } = {}) {
  if (!item || isIdentityQuad(quad)) return item;
  const rect = item.bounds;
  if (!rect || rect.width < 1e-9 || rect.height < 1e-9) return item;

  // Convert the normalised quad into real coordinates around the item.
  const abs = quad.map(([u, v]) => [rect.x + u * rect.width, rect.y + v * rect.height]);
  const t = unitQuadTransform(abs);
  if (!t) return item;

  const paths = item.className === 'Path' ? [item]
    : item.getItems({ match: i => i.className === 'Path' });
  const maxLen = Math.max(0.05, detail);
  for (const p of paths) {
    subdivide(p, maxLen);
    warpSegments(p, rect, t);
  }
  return item;
}
