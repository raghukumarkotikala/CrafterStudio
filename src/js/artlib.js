// Built-in laser art, generated as clean vector geometry in a 100×100 box.
// kind 'fill' = solid silhouettes (engrave with Fill or cut outlines with Line)
// kind 'line' = line art (engrave/score with Line)
// Overlapping solid parts are separate <path>s so they union instead of cancelling.

const f = n => +n.toFixed(2);
const P = (x, y) => `${f(x)} ${f(y)}`;
const TAU = Math.PI * 2;
const rad = d => (d * Math.PI) / 180;

const polyD = (pts, close = true) => 'M' + pts.map(p => P(p[0], p[1])).join('L') + (close ? 'Z' : '');
const circleD = (cx, cy, r) => `M${P(cx - r, cy)}A${f(r)} ${f(r)} 0 1 0 ${P(cx + r, cy)}A${f(r)} ${f(r)} 0 1 0 ${P(cx - r, cy)}Z`;
const ellipseD = (cx, cy, rx, ry, rotDeg = 0) => {
  const a = rad(rotDeg), c = Math.cos(a), s = Math.sin(a);
  const p1 = [cx - rx * c, cy - rx * s], p2 = [cx + rx * c, cy + rx * s];
  return `M${P(...p1)}A${f(rx)} ${f(ry)} ${f(rotDeg)} 1 0 ${P(...p2)}A${f(rx)} ${f(ry)} ${f(rotDeg)} 1 0 ${P(...p1)}Z`;
};
const regPts = (cx, cy, r, n, rot = -90) => Array.from({ length: n }, (_, i) => {
  const a = rad(rot + (360 / n) * i);
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
});
const starPts = (cx, cy, r1, r2, n, rot = -90) => Array.from({ length: n * 2 }, (_, i) => {
  const a = rad(rot + (180 / n) * i), r = i % 2 ? r2 : r1;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
});
const rrectD = (x, y, w, h, r) => {
  r = Math.min(r, w / 2, h / 2);
  return `M${P(x + r, y)}H${f(x + w - r)}A${f(r)} ${f(r)} 0 0 1 ${P(x + w, y + r)}V${f(y + h - r)}A${f(r)} ${f(r)} 0 0 1 ${P(x + w - r, y + h)}H${f(x + r)}A${f(r)} ${f(r)} 0 0 1 ${P(x, y + h - r)}V${f(y + r)}A${f(r)} ${f(r)} 0 0 1 ${P(x + r, y)}Z`;
};
const rectD = (x, y, w, h) => `M${P(x, y)}H${f(x + w)}V${f(y + h)}H${f(x)}Z`;
// Lens-shaped petal from distance `inner` to `inner+len` along `angDeg`
const petalD = (cx, cy, inner, len, width, angDeg) => {
  const a = rad(angDeg), dx = Math.cos(a), dy = Math.sin(a), px = -dy, py = dx;
  const b = [cx + dx * inner, cy + dy * inner], t = [cx + dx * (inner + len), cy + dy * (inner + len)];
  const m = [cx + dx * (inner + len * 0.5), cy + dy * (inner + len * 0.5)];
  return `M${P(...b)}Q${P(m[0] + px * width, m[1] + py * width)} ${P(...t)}Q${P(m[0] - px * width, m[1] - py * width)} ${P(...b)}Z`;
};
const heartD = (cx, cy, s) =>
  `M${P(cx, cy + 0.35 * s)}C${P(cx - 0.55 * s, cy - 0.05 * s)} ${P(cx - 0.45 * s, cy - 0.55 * s)} ${P(cx, cy - 0.28 * s)}` +
  `C${P(cx + 0.45 * s, cy - 0.55 * s)} ${P(cx + 0.55 * s, cy - 0.05 * s)} ${P(cx, cy + 0.35 * s)}Z`;
const lineD = (x1, y1, x2, y2) => `M${P(x1, y1)}L${P(x2, y2)}`;
// True boolean subtraction (A − B) via paper.js, for shapes even-odd can't express.
const subtractD = (dA, dB) => {
  /* global paper */
  const a = new paper.CompoundPath({ pathData: dA, insert: false });
  const b = new paper.CompoundPath({ pathData: dB, insert: false });
  return a.subtract(b, { insert: false }).pathData;
};
// Rectangle of size w×h centred on (cx, cy), rotated by deg.
const rotRectD = (cx, cy, w, h, deg) => polyD([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]
  .map(([x, y]) => rotPt(cx + x, cy + y, deg, cx, cy)));
const rotPt = (x, y, deg, cx = 50, cy = 50) => {
  const a = rad(deg), c = Math.cos(a), s = Math.sin(a);
  return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
};
const radial = (n, fn) => Array.from({ length: n }, (_, i) => fn((360 / n) * i, i));

const ASSETS = [];
const add = (cat, name, kind, parts, opts = {}) => {
  ASSETS.push({ id: `art:${cat}:${name}`.toLowerCase().replace(/[^a-z0-9:]+/g, '-'), cat, name, kind, parts: [].concat(parts), ...opts });
};
const EO = d => ({ d, evenodd: true });

// Generated on first use: some shapes need paper.js booleans, which require the editor's
// paper project to exist.
function buildAll() {
// ------------------------------------------------------------------ Basic shapes
{
  const C = 'Basic shapes';
  add(C, 'Circle', 'fill', circleD(50, 50, 48));
  add(C, 'Square', 'fill', rectD(2, 2, 96, 96));
  add(C, 'Rounded square', 'fill', rrectD(2, 2, 96, 96, 16));
  add(C, 'Rectangle', 'fill', rectD(2, 22, 96, 56));
  add(C, 'Pill', 'fill', rrectD(2, 30, 96, 40, 20));
  add(C, 'Triangle', 'fill', polyD(regPts(50, 58, 52, 3)));
  add(C, 'Right triangle', 'fill', polyD([[4, 96], [4, 4], [96, 96]]));
  add(C, 'Diamond', 'fill', polyD([[50, 2], [92, 50], [50, 98], [8, 50]]));
  add(C, 'Pentagon', 'fill', polyD(regPts(50, 53, 48, 5)));
  add(C, 'Hexagon', 'fill', polyD(regPts(50, 50, 48, 6, 0)));
  add(C, 'Octagon', 'fill', polyD(regPts(50, 50, 48, 8, 22.5)));
  add(C, 'Star 5', 'fill', polyD(starPts(50, 53, 48, 19, 5)));
  add(C, 'Star 6', 'fill', polyD(starPts(50, 50, 48, 26, 6)));
  add(C, 'Star 8', 'fill', polyD(starPts(50, 50, 48, 28, 8)));
  add(C, 'Burst', 'fill', polyD(starPts(50, 50, 48, 38, 24)));
  add(C, 'Heart', 'fill', heartD(50, 45, 100));
  add(C, 'Crescent', 'fill', subtractD(circleD(50, 50, 46), circleD(66, 40, 38)));
  add(C, 'Plus', 'fill', polyD([[36, 4], [64, 4], [64, 36], [96, 36], [96, 64], [64, 64], [64, 96], [36, 96], [36, 64], [4, 64], [4, 36], [36, 36]]));
  add(C, 'Ring', 'fill', EO(circleD(50, 50, 48) + circleD(50, 50, 32)));
  add(C, 'Arrow', 'fill', polyD([[2, 38], [58, 38], [58, 16], [98, 50], [58, 84], [58, 62], [2, 62]]));
  add(C, 'Double arrow', 'fill', polyD([[2, 50], [28, 20], [28, 38], [72, 38], [72, 20], [98, 50], [72, 80], [72, 62], [28, 62], [28, 80]]));
  add(C, 'Chevron', 'fill', polyD([[10, 8], [50, 8], [90, 50], [50, 92], [10, 92], [50, 50]]));
  add(C, 'Speech bubble', 'fill', rrectD(4, 8, 92, 62, 14) + polyD([[24, 68], [18, 94], [46, 68]]));
  add(C, 'Cloud', 'fill', [circleD(32, 58, 20), circleD(52, 42, 26), circleD(72, 56, 22), rrectD(12, 56, 80, 26, 13)]);
  add(C, 'Drop', 'fill', `M50 2C50 2 16 44 16 64A34 34 0 0 0 84 64C84 44 50 2 50 2Z`);
  add(C, 'Shield', 'fill', `M50 2L92 16V46C92 72 74 90 50 98C26 90 8 72 8 46V16Z`);
  add(C, 'Lightning', 'fill', polyD([[58, 2], [18, 58], [46, 58], [38, 98], [82, 38], [54, 38]]));
  add(C, 'Semicircle', 'fill', `M2 70A48 48 0 0 1 98 70Z`);
  add(C, 'Parallelogram', 'fill', polyD([[24, 22], [98, 22], [76, 78], [2, 78]]));
  add(C, 'Trapezoid', 'fill', polyD([[24, 22], [76, 22], [98, 78], [2, 78]]));
  add(C, 'Gear', 'fill', EO(polyD(Array.from({ length: 48 }, (_, i) => {
    const tooth = Math.floor(i / 2) % 2 === 0;
    const a = rad((360 / 48) * i), r = tooth ? 48 : 38;
    return [50 + r * Math.cos(a), 50 + r * Math.sin(a)];
  })) + circleD(50, 50, 14)));
}

// ------------------------------------------------------------------ Frames & borders
{
  const C = 'Frames & borders';
  add(C, 'Frame', 'fill', EO(rectD(2, 2, 96, 96) + rectD(10, 10, 80, 80)));
  add(C, 'Rounded frame', 'fill', EO(rrectD(2, 2, 96, 96, 14) + rrectD(9, 9, 82, 82, 9)));
  add(C, 'Double line frame', 'line', [rectD(2, 2, 96, 96), rectD(8, 8, 84, 84)]);
  add(C, 'Circle frame', 'fill', EO(circleD(50, 50, 48) + circleD(50, 50, 42)));
  add(C, 'Double circle', 'line', [circleD(50, 50, 48), circleD(50, 50, 43)]);
  add(C, 'Dotted circle', 'fill', radial(36, a => circleD(...rotPt(50, 5, a), 1.8)));
  add(C, 'Scalloped circle', 'line', [polyD(Array.from({ length: 360 }, (_, i) => {
    const a = rad(i), r = 44 + 4 * Math.abs(Math.sin(a * 12));
    return [50 + r * Math.cos(a), 50 + r * Math.sin(a)];
  })), circleD(50, 50, 36)]);
  add(C, 'Scalloped rectangle', 'line', [(() => {
    // outward semicircle bumps along every edge
    const n = 8, s = 88 / n, r = s / 2;
    let d = `M6 6`;
    for (let i = 0; i < n; i++) d += `A${f(r)} ${f(r)} 0 0 1 ${P(6 + s * (i + 1), 6)}`;
    for (let i = 0; i < n; i++) d += `A${f(r)} ${f(r)} 0 0 1 ${P(94, 6 + s * (i + 1))}`;
    for (let i = 0; i < n; i++) d += `A${f(r)} ${f(r)} 0 0 1 ${P(94 - s * (i + 1), 94)}`;
    for (let i = 0; i < n; i++) d += `A${f(r)} ${f(r)} 0 0 1 ${P(6, 94 - s * (i + 1))}`;
    return d + 'Z';
  })(), rectD(14, 14, 72, 72)]);
  add(C, 'Stamp edge', 'fill', EO((() => {
    let d = 'M2 2';
    const n = 12, s = 96 / n, r = s / 2.6;
    for (let i = 0; i < n; i++) d += `H${f(2 + s * i + s / 2 - r)}A${f(r)} ${f(r)} 0 0 0 ${f(2 + s * i + s / 2 + r)} 2`;
    d += 'H98';
    for (let i = 0; i < n; i++) d += `V${f(2 + s * i + s / 2 - r)}A${f(r)} ${f(r)} 0 0 0 98 ${f(2 + s * i + s / 2 + r)}`;
    d += 'V98';
    for (let i = n - 1; i >= 0; i--) d += `H${f(2 + s * i + s / 2 + r)}A${f(r)} ${f(r)} 0 0 0 ${f(2 + s * i + s / 2 - r)} 98`;
    d += 'H2';
    for (let i = n - 1; i >= 0; i--) d += `V${f(2 + s * i + s / 2 + r)}A${f(r)} ${f(r)} 0 0 0 2 ${f(2 + s * i + s / 2 - r)}`;
    return d + 'Z' + rectD(12, 12, 76, 76);
  })()));
  add(C, 'Ornate corners', 'line', [rectD(12, 12, 76, 76), ...radial(4, a => {
    const R = (x, y) => P(...rotPt(x, y, a));
    // bracket, inner scroll and a leaf pointing inwards along the diagonal
    const bracket = `M${R(4, 34)}L${R(4, 4)}L${R(34, 4)}`;
    const scroll = `M${R(4, 24)}Q${R(4, 12)} ${R(12, 12)}Q${R(20, 12)} ${R(20, 20)}Q${R(20, 26)} ${R(14, 26)}` +
      `M${R(24, 4)}Q${R(12, 4)} ${R(12, 12)}`;
    const leafBase = rotPt(20, 20, a);
    return bracket + scroll + petalD(leafBase[0], leafBase[1], 0, 12, 3.5, 45 + a) + circleD(...rotPt(8, 8, a), 1.6);
  })]);
  add(C, 'Ribbon banner', 'fill', [
    polyD([[16, 36], [84, 36], [84, 64], [16, 64]]),
    polyD([[2, 44], [22, 44], [22, 72], [2, 72], [9, 58]]),
    polyD([[98, 44], [78, 44], [78, 72], [98, 72], [91, 58]])
  ]);
  add(C, 'Label tag', 'fill', EO(polyD([[26, 20], [96, 20], [96, 80], [26, 80], [4, 50]]) + circleD(22, 50, 5)));
  add(C, 'Arch frame', 'fill', EO(`M6 98V46A44 44 0 0 1 94 46V98Z` + `M14 90V46A36 36 0 0 1 86 46V90Z`));
  add(C, 'Oval frame', 'fill', EO(ellipseD(50, 50, 36, 48) + ellipseD(50, 50, 30, 42)));
  add(C, 'Dashed border', 'line', (() => {
    const segs = [];
    for (let i = 0; i < 12; i++) {
      const x = 2 + i * 8;
      segs.push(lineD(x, 2, x + 5, 2), lineD(x, 98, x + 5, 98), lineD(2, x, 2, x + 5), lineD(98, x, 98, x + 5));
    }
    return segs.join('');
  })());
  add(C, 'Certificate frame', 'line', [rectD(2, 2, 96, 96), rectD(6, 6, 88, 88),
    ...radial(4, a => { const c = rotPt(6, 6, a); return circleD(c[0], c[1], 4); })]);
}

// ------------------------------------------------------------------ Mandalas
function mandala(layers, seed) {
  const parts = [circleD(50, 50, 3.5)];
  let r = 6;
  layers.forEach((L, li) => {
    const n = L.n;
    if (L.type === 'petal') {
      for (let i = 0; i < n; i++) parts.push(petalD(50, 50, r, L.len, L.w, (360 / n) * i + (L.off || 0)));
      if (L.inner) for (let i = 0; i < n; i++) parts.push(petalD(50, 50, r + L.len * 0.2, L.len * 0.6, L.w * 0.45, (360 / n) * i + (L.off || 0)));
      r += L.len;
    } else if (L.type === 'dots') {
      for (let i = 0; i < n; i++) { const p = rotPt(50, 50 - r - L.s, (360 / n) * i + (L.off || 0)); parts.push(circleD(p[0], p[1], L.s)); }
      r += L.s * 2 + 1;
    } else if (L.type === 'ring') {
      r += L.gap || 1;
      parts.push(circleD(50, 50, r));
    } else if (L.type === 'wave') {
      const pts = Array.from({ length: 361 }, (_, i) => {
        const a = rad(i), rr = r + L.amp + L.amp * Math.sin(a * n);
        return [50 + rr * Math.cos(a), 50 + rr * Math.sin(a)];
      });
      parts.push(polyD(pts));
      r += L.amp * 2;
    } else if (L.type === 'arcs') {
      for (let i = 0; i < n; i++) {
        const a1 = (360 / n) * i, a2 = (360 / n) * (i + 1);
        const p1 = rotPt(50, 50 - r, a1), p2 = rotPt(50, 50 - r, a2);
        const rr = (TAU * r) / n / 2;
        parts.push(`M${P(...p1)}A${f(rr)} ${f(rr)} 0 0 1 ${P(...p2)}`);
      }
      r += (TAU * r) / n / 2;
    }
  });
  return parts;
}
{
  const C = 'Mandalas';
  add(C, 'Mandala flower', 'line', mandala([{ type: 'petal', n: 8, len: 12, w: 5, inner: true }, { type: 'ring', gap: 1 }, { type: 'petal', n: 16, len: 10, w: 3.5, off: 11.25 }, { type: 'dots', n: 32, s: 1.2 }, { type: 'ring', gap: 1 }, { type: 'petal', n: 16, len: 13, w: 6, inner: true }]));
  add(C, 'Mandala star', 'line', mandala([{ type: 'petal', n: 6, len: 10, w: 4 }, { type: 'ring', gap: 1 }, { type: 'wave', n: 12, amp: 2.5 }, { type: 'petal', n: 12, len: 14, w: 4, inner: true }, { type: 'ring', gap: 1.5 }, { type: 'dots', n: 24, s: 1.5 }, { type: 'arcs', n: 24 }]));
  add(C, 'Mandala lace', 'line', mandala([{ type: 'dots', n: 8, s: 1.8 }, { type: 'ring', gap: 1 }, { type: 'arcs', n: 12 }, { type: 'ring', gap: 1 }, { type: 'petal', n: 24, len: 9, w: 2.4 }, { type: 'ring', gap: 1 }, { type: 'arcs', n: 24 }, { type: 'dots', n: 48, s: 0.9 }]));
  add(C, 'Mandala sun', 'line', mandala([{ type: 'wave', n: 8, amp: 2 }, { type: 'ring', gap: 2 }, { type: 'petal', n: 12, len: 16, w: 4.5, inner: true }, { type: 'ring', gap: 1 }, { type: 'petal', n: 24, len: 12, w: 3, off: 7.5 }, { type: 'ring', gap: 1 }]));
  add(C, 'Mandala simple', 'line', mandala([{ type: 'petal', n: 10, len: 18, w: 6, inner: true }, { type: 'ring', gap: 2 }, { type: 'petal', n: 20, len: 18, w: 5 }]));
  add(C, 'Mandala dense', 'line', mandala([{ type: 'petal', n: 12, len: 8, w: 3 }, { type: 'ring', gap: 0.8 }, { type: 'dots', n: 24, s: 1 }, { type: 'wave', n: 24, amp: 1.5 }, { type: 'ring', gap: 1 }, { type: 'petal', n: 36, len: 9, w: 2 }, { type: 'ring', gap: 0.8 }, { type: 'arcs', n: 36 }, { type: 'dots', n: 36, s: 1 }]));
  add(C, 'Mandala solid', 'fill', [circleD(50, 50, 8), ...radial(8, a => petalD(50, 50, 10, 20, 7, a)), ...radial(16, a => petalD(50, 50, 30, 18, 5, a + 11.25)), ...radial(32, a => circleD(...rotPt(50, 50 - 47, a), 1.6))]);
  add(C, 'Flower of life', 'line', [circleD(50, 50, 16), ...radial(6, a => circleD(...rotPt(50, 34, a), 16)), ...radial(6, a => circleD(...rotPt(50, 18, a), 16)).slice(0, 6), circleD(50, 50, 48)]);
}

// ------------------------------------------------------------------ Indian motifs
{
  const C = 'Indian motifs';
  add(C, 'Lotus', 'fill', [
    petalD(50, 78, 0, 62, 13, -90),
    petalD(50, 78, 0, 54, 12, -115), petalD(50, 78, 0, 54, 12, -65),
    petalD(50, 78, 0, 44, 10, -140), petalD(50, 78, 0, 44, 10, -40),
    petalD(50, 78, 0, 34, 8, -165), petalD(50, 78, 0, 34, 8, -15),
    `M10 84Q50 96 90 84Q50 90 10 84Z`
  ]);
  add(C, 'Lotus outline', 'line', [
    petalD(50, 78, 0, 62, 13, -90), petalD(50, 78, 6, 40, 6, -90),
    petalD(50, 78, 0, 54, 12, -115), petalD(50, 78, 0, 54, 12, -65),
    petalD(50, 78, 0, 44, 10, -140), petalD(50, 78, 0, 44, 10, -40),
    `M10 84Q50 96 90 84`
  ]);
  add(C, 'Paisley', 'fill', EO(
    `M44 96C14 94 6 58 22 36C34 18 58 8 72 16C84 23 82 40 70 42C62 43 60 34 66 32C58 30 50 40 56 50C66 64 74 80 60 92C55 95 50 96 44 96Z` +
    `M44 86C26 84 20 60 30 44C38 32 50 28 52 34C44 42 46 54 54 62C60 70 62 82 52 86C50 87 47 87 44 86Z`));
  add(C, 'Paisley line', 'line', [
    `M44 96C14 94 6 58 22 36C34 18 58 8 72 16C84 23 82 40 70 42C62 43 60 34 66 32C58 30 50 40 56 50C66 64 74 80 60 92C55 95 50 96 44 96Z`,
    `M44 86C26 84 20 60 30 44C38 32 50 28 52 34C44 42 46 54 54 62C60 70 62 82 52 86C50 87 47 87 44 86Z`,
    circleD(40, 70, 4), circleD(34, 56, 2.5), circleD(40, 46, 2)
  ]);
  add(C, 'Diya (lamp)', 'fill', [
    `M50 6C60 22 62 36 50 44C38 36 40 22 50 6Z`,
    `M8 54Q50 60 92 54Q86 82 50 84Q14 82 8 54Z`,
    rrectD(38, 84, 24, 8, 3)
  ]);
  add(C, 'Rangoli', 'fill', [
    circleD(50, 50, 6),
    ...radial(8, a => petalD(50, 50, 8, 18, 6, a)),
    ...radial(8, a => petalD(50, 50, 26, 12, 5, a + 22.5)),
    ...radial(16, a => circleD(...rotPt(50, 50 - 30, a + 11.25), 2)),
    ...radial(8, a => polyD(starPts(...rotPt(50, 8, a), 6, 2.5, 4, a - 90)))
  ]);
  add(C, 'Kolam', 'line', (() => {
    const parts = [];
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
      const x = 14 + i * 18, y = 14 + j * 18;
      parts.push(circleD(x, y, 1.4));
      if ((i + j) % 2 === 0) parts.push(circleD(x, y, 9));
    }
    parts.push(rrectD(3, 3, 94, 94, 10));
    return parts;
  })());
  add(C, 'Peacock feather', 'line', [
    `M50 98Q48 70 50 30`,
    ellipseD(50, 30, 20, 27), ellipseD(50, 32, 11, 15), ellipseD(50, 34, 5, 7),
    ...Array.from({ length: 9 }, (_, i) => { const y = 60 + i * 4; return `M50 ${y}L${30 - i} ${y - 8}M50 ${y}L${70 + i} ${y - 8}`; })
  ]);
  add(C, 'Toran', 'fill', [
    rectD(2, 8, 96, 5),
    ...Array.from({ length: 7 }, (_, i) => { const x = 8 + i * 14; return `M${x} 13Q${x + 7} 30 ${x} 44Q${x - 7} 30 ${x} 13Z`; }),
    ...Array.from({ length: 6 }, (_, i) => circleD(15 + i * 14, 18, 3))
  ]);
  add(C, 'Mehndi flower', 'line', [
    circleD(50, 50, 7), circleD(50, 50, 3),
    ...radial(8, a => petalD(50, 50, 9, 28, 10, a)),
    ...radial(8, a => petalD(50, 50, 13, 18, 4, a)),
    ...radial(8, a => circleD(...rotPt(50, 50 - 43, a), 2)),
    ...radial(8, a => petalD(50, 50, 20, 20, 4, a + 22.5))
  ]);
  add(C, 'Sun (Surya)', 'fill', [circleD(50, 50, 22), ...radial(12, a => polyD([rotPt(46, 26, a), rotPt(50, 2, a), rotPt(54, 26, a)])), ...radial(12, a => petalD(50, 50, 24, 12, 3, a + 15))]);
  add(C, 'Kalash', 'fill', [
    `M30 40Q16 64 30 84H70Q84 64 70 40Z`,
    rrectD(34, 32, 32, 8, 2), rrectD(38, 84, 24, 8, 2),
    `M50 4Q58 14 50 24Q42 14 50 4Z`,
    petalD(50, 30, 0, 18, 5, -150), petalD(50, 30, 0, 18, 5, -30)
  ]);
}

// ------------------------------------------------------------------ Nature
{
  const C = 'Nature';
  add(C, 'Leaf', 'fill', EO(`M10 90C10 40 40 10 92 8C90 60 60 90 10 90Z` + `M16 84L60 40L62 42L18 86Z`));
  add(C, 'Branch', 'fill', [`M8 92Q40 60 92 10L94 12Q42 62 10 94Z`, ...[0.2, 0.4, 0.6, 0.8].flatMap(t => {
    const x = 8 + 84 * t, y = 92 - 82 * t;
    return [petalD(x, y, 0, 18, 5, -150 + 5), petalD(x, y, 0, 18, 5, -30 + 15)];
  })]);
  add(C, 'Flower', 'fill', [circleD(50, 50, 10), ...radial(5, a => petalD(50, 50, 8, 40, 14, a - 90))]);
  add(C, 'Daisy', 'line', [circleD(50, 50, 10), circleD(50, 50, 5), ...radial(16, a => petalD(50, 50, 11, 36, 5, a))]);
  add(C, 'Tulip', 'fill', [`M30 20Q28 50 50 56Q72 50 70 20L60 32L50 16L40 32Z`, petalD(50, 96, 0, 34, 7, -125), `M49 98H51V54H49Z`]);
  add(C, 'Tree', 'fill', [rectD(44, 60, 12, 38), circleD(50, 34, 24), circleD(30, 50, 18), circleD(70, 50, 18)]);
  add(C, 'Pine tree', 'fill', [polyD([[50, 2], [80, 38], [66, 38], [88, 66], [60, 66], [60, 98], [40, 98], [40, 66], [12, 66], [34, 38], [20, 38]])]);
  add(C, 'Sun', 'fill', [circleD(50, 50, 20), ...radial(12, a => polyD([rotPt(47, 24, a), rotPt(50, 4, a), rotPt(53, 24, a)]))]);
  add(C, 'Moon & star', 'fill', [subtractD(circleD(42, 54, 40), circleD(60, 44, 34)), polyD(starPts(78, 22, 12, 5, 5))]);
  add(C, 'Snowflake', 'line', radial(6, a => {
    const p = [[50, 50], [50, 4]].map(q => rotPt(q[0], q[1], a));
    const b1 = [[50, 20], [40, 10]].map(q => rotPt(q[0], q[1], a)), b2 = [[50, 20], [60, 10]].map(q => rotPt(q[0], q[1], a));
    const c1 = [[50, 34], [42, 26]].map(q => rotPt(q[0], q[1], a)), c2 = [[50, 34], [58, 26]].map(q => rotPt(q[0], q[1], a));
    return [p, b1, b2, c1, c2].map(s => polyD(s, false)).join('');
  }));
  add(C, 'Mountains', 'fill', [polyD([[2, 90], [36, 30], [56, 62], [70, 44], [98, 90]]), polyD([[30, 41], [36, 30], [42, 41], [36, 38]])]);
  add(C, 'Waves', 'line', [0, 1, 2].map(k => {
    let d = `M2 ${34 + k * 16}`;
    for (let i = 0; i < 6; i++) d += `Q${f(10 + i * 16)} ${24 + k * 16} ${f(18 + i * 16)} ${34 + k * 16}`;
    return d;
  }));
  add(C, 'Butterfly', 'fill', [ellipseD(32, 34, 20, 26, -30), ellipseD(68, 34, 20, 26, 30), ellipseD(36, 70, 14, 18, 30), ellipseD(64, 70, 14, 18, -30), ellipseD(50, 52, 4, 30)]);
  add(C, 'Paw print', 'fill', [ellipseD(50, 66, 22, 20), ellipseD(24, 40, 9, 12, -20), ellipseD(42, 24, 9, 12, -5), ellipseD(60, 24, 9, 12, 5), ellipseD(76, 40, 9, 12, 20)]);
}

// ------------------------------------------------------------------ Celebration
{
  const C = 'Celebration';
  add(C, 'Two hearts', 'fill', [heartD(38, 48, 64), heartD(64, 56, 56)]);
  add(C, 'Heart outline', 'fill', EO(heartD(50, 46, 100) + heartD(50, 47, 72)));
  add(C, 'Balloon', 'fill', [ellipseD(50, 36, 28, 34), polyD([[46, 70], [54, 70], [50, 76]]), `M49 76Q44 88 52 98L53 97Q46 88 51 76Z`]);
  add(C, 'Gift box', 'fill', [rectD(12, 44, 76, 52), rectD(6, 30, 88, 14), `M50 30C36 6 18 20 34 30ZM50 30C64 6 82 20 66 30Z`]);
  add(C, 'Bunting', 'fill', [...Array.from({ length: 6 }, (_, i) => {
    const x = 6 + i * 15.5, y = 10 + 20 * Math.sin(Math.PI * (x + 6) / 100) * 0.8;
    return polyD([[x, y], [x + 12, y], [x + 6, y + 22]]);
  }), `M2 9Q50 29 98 9L98 11Q50 31 2 11Z`]);
  add(C, 'Crown', 'fill', [polyD([[6, 80], [12, 30], [32, 54], [50, 20], [68, 54], [88, 30], [94, 80]]), rectD(6, 84, 88, 10)]);
  add(C, 'Candle', 'fill', [rrectD(38, 40, 24, 58, 3), `M50 6C58 18 58 30 50 34C42 30 42 18 50 6Z`]);
  add(C, 'Rings', 'fill', [EO(circleD(36, 56, 26) + circleD(36, 56, 21)), EO(circleD(64, 56, 26) + circleD(64, 56, 21)), polyD([[64, 30], [70, 22], [64, 16], [58, 22]])]);
  add(C, 'Party star', 'fill', [polyD(starPts(50, 50, 30, 13, 5)), ...radial(8, a => rotRectD(...rotPt(50, 8, a + 22.5), 2.4, 10, a + 22.5))]);
  add(C, 'Christmas tree', 'fill', [polyD([[50, 10], [72, 40], [62, 40], [82, 66], [66, 66], [88, 90], [12, 90], [34, 66], [18, 66], [38, 40], [28, 40]]), rectD(44, 90, 12, 8), polyD(starPts(50, 8, 8, 3.5, 5))]);
  add(C, 'Easter egg', 'fill', EO(`M50 4C74 4 88 44 88 64A38 34 0 0 1 12 64C12 44 26 4 50 4Z` + `M14 52Q32 42 50 52Q68 62 86 52L87 58Q68 68 50 58Q32 48 13 58Z`));
}

// ------------------------------------------------------------------ Badges & labels
{
  const C = 'Badges & labels';
  add(C, 'Round badge', 'line', [circleD(50, 50, 48), circleD(50, 50, 42), circleD(50, 50, 30)]);
  add(C, 'Seal', 'fill', EO(polyD(Array.from({ length: 240 }, (_, i) => {
    const a = (TAU / 240) * i, r = 46 + 3 * Math.cos(a * 30);
    return [50 + r * Math.cos(a), 50 + r * Math.sin(a)];
  })) + circleD(50, 50, 36)));
  add(C, 'Award ribbon', 'fill', [EO(circleD(50, 38, 34) + circleD(50, 38, 26)), polyD([[28, 64], [20, 98], [34, 90], [42, 98], [46, 72]]), polyD([[72, 64], [80, 98], [66, 90], [58, 98], [54, 72]])]);
  add(C, 'Notched label', 'fill', EO(polyD([[2, 24], [98, 24], [90, 50], [98, 76], [2, 76], [10, 50]]) + rectD(18, 32, 64, 36)));
  add(C, 'Name plate', 'line', [rrectD(2, 22, 96, 56, 8), rrectD(8, 28, 84, 44, 4), circleD(12, 50, 2), circleD(88, 50, 2)]);
  add(C, 'Price tag', 'fill', EO(`M44 4H92V52L48 96L4 52Z` + circleD(74, 22, 6)));
  add(C, 'Hexagon badge', 'line', [polyD(regPts(50, 50, 48, 6)), polyD(regPts(50, 50, 40, 6))]);
  add(C, 'Shield badge', 'line', [`M50 2L92 16V46C92 72 74 90 50 98C26 90 8 72 8 46V16Z`, `M50 10L84 22V46C84 67 70 82 50 89C30 82 16 67 16 46V22Z`]);
}

// ------------------------------------------------------------------ Characters
// Original cartoon-style designs drawn for Crafter Studio (no licensed/branded characters).
// Eyes and mouths are holes inside their own path; overlapping parts are separate paths.
{
  const C = 'Characters';
  const hole = (d, ...holes) => ({ d: d + holes.join(''), evenodd: true });
  const eyes = (lx, rx, y, r) => circleD(lx, y, r) + circleD(rx, y, r);
  const tri = (a, b, c) => polyD([a, b, c]);
  const smile = (cx, cy, rx, ry, thick) => subtractD(ellipseD(cx, cy, rx, ry), ellipseD(cx, cy - thick, rx, ry));

  add(C, 'Cat face', 'fill', [
    tri([20, 40], [26, 8], [46, 24]), tri([80, 40], [74, 8], [54, 24]),
    hole(ellipseD(50, 58, 36, 32), ellipseD(38, 54, 4.5, 6), ellipseD(62, 54, 4.5, 6), tri([44, 64], [56, 64], [50, 71])),
    polyD([[2, 56], [26, 60], [2, 64]]), polyD([[2, 70], [26, 70], [2, 76]]),
    polyD([[98, 56], [74, 60], [98, 64]]), polyD([[98, 70], [74, 70], [98, 76]])
  ]);
  add(C, 'Dog face', 'fill', [
    ellipseD(14, 54, 11, 24, -12), ellipseD(86, 54, 11, 24, 12),
    hole(ellipseD(50, 52, 30, 28), circleD(40, 46, 4), circleD(60, 46, 4), ellipseD(50, 70, 17, 12)),
    ellipseD(50, 66, 5.5, 4), rectD(49, 69, 2, 7), smile(50, 76, 7, 5, 2.2)
  ]);
  add(C, 'Bunny', 'fill', [
    hole(ellipseD(36, 22, 9, 22, -6), ellipseD(36, 24, 4, 14, -6)),
    hole(ellipseD(64, 22, 9, 22, 6), ellipseD(64, 24, 4, 14, 6)),
    hole(ellipseD(50, 64, 28, 26), circleD(40, 60, 3.6), circleD(60, 60, 3.6), tri([45, 70], [55, 70], [50, 76])),
    polyD([[4, 66], [28, 68], [4, 72]]), polyD([[96, 66], [72, 68], [96, 72]])
  ]);
  add(C, 'Bear face', 'fill', [
    circleD(22, 26, 13), circleD(78, 26, 13),
    hole(circleD(50, 58, 33), circleD(39, 50, 3.8), circleD(61, 50, 3.8)),
    hole(ellipseD(50, 72, 17, 12), ellipseD(50, 66, 6, 4.5), smile(50, 74, 8, 7, 3))
  ]);
  add(C, 'Panda', 'fill', [
    circleD(20, 24, 13), circleD(80, 24, 13),
    hole(circleD(50, 56, 33), ellipseD(36, 50, 10, 12, -14), ellipseD(64, 50, 10, 12, 14), ellipseD(50, 74, 15, 11)),
    circleD(36, 50, 3.6), circleD(64, 50, 3.6),
    ellipseD(50, 70, 6, 4.4), smile(50, 76, 7, 6, 2.2)
  ]);
  add(C, 'Fox', 'fill', [
    tri([18, 46], [26, 12], [44, 30]), tri([82, 46], [74, 12], [56, 30]),
    hole(`M50 94C22 86 14 62 18 44C22 30 34 24 50 24C66 24 78 30 82 44C86 62 78 86 50 94Z`,
      ellipseD(38, 50, 4, 5.5), ellipseD(62, 50, 4, 5.5), ellipseD(50, 74, 6, 4.5))
  ]);
  add(C, 'Pig face', 'fill', [
    tri([18, 38], [24, 10], [42, 28]), tri([82, 38], [76, 10], [58, 28]),
    hole(ellipseD(50, 56, 33, 29), circleD(38, 48, 3.6), circleD(62, 48, 3.6), ellipseD(50, 70, 16, 12)),
    ellipseD(44, 70, 2.8, 4.2), ellipseD(56, 70, 2.8, 4.2)
  ]);
  add(C, 'Mouse', 'fill', [
    circleD(24, 28, 12), circleD(76, 28, 12),
    hole(`M50 94C24 90 24 64 28 52C32 40 40 34 50 34C60 34 68 40 72 52C76 64 76 90 50 94Z`,
      circleD(42, 52, 3.4), circleD(58, 52, 3.4), ellipseD(50, 74, 5, 4)),
    polyD([[6, 70], [30, 72], [6, 76]]), polyD([[94, 70], [70, 72], [94, 76]])
  ]);
  add(C, 'Cow face', 'fill', [
    ellipseD(12, 48, 12, 8, -10), ellipseD(88, 48, 12, 8, 10),
    tri([28, 24], [34, 6], [42, 22]), tri([72, 24], [66, 6], [58, 22]),
    hole(ellipseD(50, 52, 30, 28), circleD(39, 44, 3.6), circleD(61, 44, 3.6),
      ellipseD(50, 74, 21, 14), ellipseD(33, 32, 9, 6, -25)),
    ellipseD(42, 72, 3, 4.4), ellipseD(58, 72, 3, 4.4), smile(50, 80, 8, 5, 2.2)
  ]);
  add(C, 'Frog', 'fill', [
    hole(circleD(28, 34, 15), circleD(28, 34, 5.5)),
    hole(circleD(72, 34, 15), circleD(72, 34, 5.5)),
    hole(ellipseD(50, 64, 36, 28), smile(50, 66, 20, 14, 3.5), circleD(38, 76, 2.4), circleD(62, 76, 2.4))
  ]);
  add(C, 'Owl', 'fill', [
    hole(ellipseD(50, 56, 34, 40), circleD(38, 44, 7), circleD(62, 44, 7)),
    circleD(38, 44, 3), circleD(62, 44, 3),
    tri([44, 52], [56, 52], [50, 62]),
    `M22 18L34 34L16 32Z`, `M78 18L66 34L84 32Z`,
    polyD([[38, 94], [46, 94], [42, 100]]), polyD([[54, 94], [62, 94], [58, 100]])
  ]);
  add(C, 'Penguin', 'fill', [
    hole(ellipseD(50, 54, 30, 44), ellipseD(50, 62, 19, 30), circleD(40, 34, 3.4), circleD(60, 34, 3.4)),
    tri([42, 44], [58, 44], [50, 54]),
    ellipseD(16, 60, 12, 22, 20), ellipseD(84, 60, 12, 22, -20),
    ellipseD(38, 96, 11, 5), ellipseD(62, 96, 11, 5)
  ]);
  add(C, 'Elephant', 'fill', [
    hole(ellipseD(20, 46, 18, 24, -8), ellipseD(23, 47, 9, 13, -8)),
    hole(ellipseD(80, 46, 18, 24, 8), ellipseD(77, 47, 9, 13, 8)),
    hole(ellipseD(50, 46, 26, 28), circleD(40, 40, 3.6), circleD(60, 40, 3.6)),
    `M38 64C32 82 42 98 60 94C68 92 72 84 66 78C64 86 54 88 50 78C47 71 49 66 52 62Z`
  ]);
  add(C, 'Lion', 'fill', [
    circleD(24, 28, 10), circleD(76, 28, 10),
    hole(polyD(Array.from({ length: 360 }, (_, i) => {
      const a = rad(i), r = 42 + 8 * Math.abs(Math.cos(a * 7));
      return [50 + r * Math.cos(a), 52 + r * Math.sin(a)];
    })), circleD(50, 54, 26)),
    circleD(41, 48, 3.4), circleD(59, 48, 3.4),
    tri([45, 60], [55, 60], [50, 66]), smile(50, 66, 11, 9, 2.6)
  ]);
  add(C, 'Monkey', 'fill', [
    circleD(16, 50, 12), circleD(84, 50, 12),
    hole(circleD(50, 52, 32), ellipseD(50, 62, 22, 20)),
    circleD(42, 48, 3.6), circleD(58, 48, 3.6),
    ellipseD(45, 62, 2.6, 3.4), ellipseD(55, 62, 2.6, 3.4), smile(50, 70, 10, 8, 2.6)
  ]);
  add(C, 'Unicorn', 'fill', [
    petalD(30, 42, 0, 13, 5, -135), petalD(70, 42, 0, 13, 5, -45),
    hole(polyD([[44, 30], [50, 2], [56, 30]]), rotRectD(48, 12, 9, 2, 20), rotRectD(50, 20, 11, 2, 20)),
    hole(ellipseD(50, 60, 25, 30), circleD(40, 52, 3.6), circleD(60, 52, 3.6),
      ellipseD(44, 78, 2.6, 3.4), ellipseD(56, 78, 2.6, 3.4), smile(50, 84, 7, 5, 2)),
    // mane along the left side
    `M30 36C16 42 12 58 20 70C18 56 24 46 36 42Z`,
    `M22 62C10 70 12 86 24 92C18 82 20 72 30 68Z`,
    `M38 30C30 22 18 26 16 36C22 30 30 28 40 34Z`
  ]);
  add(C, 'Dinosaur', 'fill', [
    polyD([[26, 58], [2, 40], [4, 72]]),
    rrectD(34, 70, 11, 24, 5), rrectD(56, 70, 11, 24, 5),
    ellipseD(34, 94, 9, 5), ellipseD(66, 94, 9, 5),
    ellipseD(46, 58, 30, 24),
    hole(circleD(76, 40, 16), circleD(81, 35, 3.2), smile(78, 44, 7, 5, 2)),
    tri([30, 46], [28, 32], [40, 42]), tri([42, 38], [46, 22], [54, 34]), tri([56, 30], [62, 16], [68, 28])
  ]);
  add(C, 'Dragon', 'fill', [
    `M24 64C14 62 6 68 2 78C10 76 16 78 20 84C24 76 26 70 24 64Z`,
    rrectD(32, 74, 10, 20, 5), rrectD(54, 74, 10, 20, 5),
    ellipseD(44, 62, 26, 20),
    hole(`M30 46C40 22 64 22 72 44C60 34 42 34 30 46Z`, `M42 40C50 34 58 34 64 40C56 36 50 36 42 40Z`),
    hole(circleD(74, 46, 15), circleD(79, 41, 3.2), smile(76, 50, 7, 5, 2)),
    tri([64, 34], [68, 20], [76, 32]), tri([78, 34], [86, 24], [86, 38])
  ]);
  add(C, 'Robot', 'fill', [
    rectD(48, 4, 4, 14), circleD(50, 6, 6),
    hole(rrectD(18, 18, 64, 52, 10), circleD(36, 38, 6), circleD(64, 38, 6), rrectD(34, 54, 32, 8, 4)),
    circleD(36, 38, 2.4), circleD(64, 38, 2.4),
    rrectD(30, 74, 40, 22, 6), rectD(10, 76, 16, 8), rectD(74, 76, 16, 8)
  ]);
  add(C, 'Alien', 'fill', [
    hole(`M50 4C76 4 90 26 88 48C86 70 70 94 50 94C30 94 14 70 12 48C10 26 24 4 50 4Z`,
      ellipseD(34, 46, 11, 15, 25), ellipseD(66, 46, 11, 15, -25), smile(50, 76, 10, 6, 2.6)),
    rectD(28, 2, 3, 12), rectD(69, 2, 3, 12), circleD(29, 2, 4), circleD(70, 2, 4)
  ]);
  add(C, 'Monster', 'fill', [
    hole(polyD(Array.from({ length: 360 }, (_, i) => {
      const a = rad(i), r = 38 + 4 * Math.sin(a * 9);
      return [50 + r * Math.cos(a), 56 + r * Math.sin(a)];
    })), circleD(50, 44, 15), polyD([[30, 70], [70, 70], [64, 78], [58, 72], [50, 80], [42, 72], [36, 78]])),
    circleD(50, 44, 6),
    tri([22, 26], [26, 6], [38, 24]), tri([78, 26], [74, 6], [62, 24])
  ]);
  add(C, 'Teddy bear', 'fill', [
    circleD(26, 20, 12), circleD(74, 20, 12),
    hole(circleD(50, 34, 24), circleD(42, 30, 3.2), circleD(58, 30, 3.2)),
    hole(ellipseD(50, 42, 12, 9), ellipseD(50, 38, 4.5, 3.4)),
    ellipseD(50, 74, 24, 22),
    ellipseD(20, 66, 11, 8, -25), ellipseD(80, 66, 11, 8, 25),
    ellipseD(32, 94, 11, 8, 20), ellipseD(68, 94, 11, 8, -20)
  ]);
  add(C, 'Chick', 'fill', [
    hole(ellipseD(46, 54, 30, 32), circleD(38, 44, 3.6), circleD(56, 44, 3.6), ellipseD(34, 62, 8, 6, 25)),
    tri([70, 50], [88, 55], [70, 60]),
    petalD(46, 18, 0, 12, 4, -80),
    rectD(38, 84, 2.5, 10), rectD(54, 84, 2.5, 10),
    tri([32, 94], [44, 94], [38, 99]), tri([48, 94], [60, 94], [54, 99])
  ]);
  add(C, 'Whale', 'fill', [
    petalD(24, 54, 0, 28, 10, -155), petalD(24, 54, 0, 28, 10, 155),
    hole(`M12 54C12 36 34 24 56 24C78 24 92 36 94 52C95 64 86 76 70 80C46 86 12 76 12 54Z`,
      circleD(78, 46, 3.4), smile(80, 58, 8, 6, 2.4)),
    petalD(60, 22, 0, 16, 5, -100), petalD(60, 22, 0, 14, 4.5, -70)
  ]);
  add(C, 'Turtle', 'fill', [
    hole(circleD(86, 48, 11), circleD(89, 45, 2.8)),
    ellipseD(20, 34, 12, 7, -30), ellipseD(20, 74, 12, 7, 30),
    ellipseD(66, 28, 12, 7, 25), ellipseD(66, 80, 12, 7, -25),
    polyD([[14, 54], [2, 50], [2, 58]]),
    hole(ellipseD(48, 54, 36, 28),
      polyD(regPts(48, 54, 9, 6, 30)),
      ...regPts(48, 54, 18, 6, 0).map(p => polyD(regPts(p[0], p[1], 7.5, 6, 30))))
  ]);
  add(C, 'Fish', 'fill', [
    hole(ellipseD(46, 52, 34, 24), circleD(30, 46, 3.6), smile(28, 54, 8, 6, 2.4)),
    polyD([[78, 52], [98, 30], [98, 74]]),
    `M40 28C46 14 58 16 60 28Z`, `M40 76C46 90 58 88 60 76Z`
  ]);
  add(C, 'Octopus', 'fill', [
    hole(`M50 10C72 10 86 28 86 48C86 60 82 66 74 70H26C18 66 14 60 14 48C14 28 28 10 50 10Z`, circleD(40, 42, 4.5), circleD(62, 42, 4.5), smile(51, 56, 8, 6, 2.4)),
    ...[0, 1, 2, 3, 4].map(i => {
      const x = 20 + i * 15;
      return `M${x - 5} 68C${x - 8} 84 ${x + 2} 88 ${x + 4} 78C${x + 5} 72 ${x + 2} 72 ${x + 1} 78C${x} 84 ${x - 3} 82 ${x + 1} 68Z`;
    })
  ]);
  add(C, 'Bee', 'fill', [
    hole(ellipseD(50, 60, 28, 22), rectD(40, 42, 6, 38), rectD(56, 42, 6, 38)),
    hole(circleD(50, 30, 16), circleD(44, 26, 3), circleD(56, 26, 3), smile(50, 34, 7, 5, 2.2)),
    ellipseD(26, 40, 14, 9, -35), ellipseD(74, 40, 14, 9, 35),
    rotRectD(38, 14, 2.2, 16, 30), circleD(34, 7, 3),
    rotRectD(62, 14, 2.2, 16, -30), circleD(66, 7, 3)
  ]);
  add(C, 'Ladybug', 'fill', [
    hole(`M50 16C74 16 88 38 88 60C88 80 72 92 50 92C28 92 12 80 12 60C12 38 26 16 50 16Z`,
      rectD(48.5, 20, 3, 72), circleD(30, 48, 6), circleD(70, 48, 6), circleD(32, 70, 5), circleD(68, 70, 5)),
    hole(ellipseD(50, 18, 18, 14), circleD(43, 16, 2.6), circleD(57, 16, 2.6)),
    rotRectD(40, 6, 2, 12, 35), circleD(37, 1.5, 2.6),
    rotRectD(60, 6, 2, 12, -35), circleD(63, 1.5, 2.6)
  ]);
}

// ------------------------------------------------------------------ Birthday
{
  const C = 'Birthday';
  const hole = (d, ...holes) => ({ d: d + holes.join(''), evenodd: true });
  const tri = (a, b, c) => polyD([a, b, c]);
  const flame = (x, y, s = 1) => `M${P(x, y)}C${P(x + 4 * s, y + 6 * s)} ${P(x + 4 * s, y + 11 * s)} ${P(x, y + 13 * s)}C${P(x - 4 * s, y + 11 * s)} ${P(x - 4 * s, y + 6 * s)} ${P(x, y)}Z`;
  const candle = (x, top, h) => [rrectD(x - 2.5, top, 5, h, 2), flame(x, top - 14)];
  // scalloped frosting edge along a tier top
  const drips = (x0, x1, y, n) => Array.from({ length: n }, (_, i) => circleD(x0 + ((x1 - x0) * (i + 0.5)) / n, y, (x1 - x0) / n / 2)).join('');

  add(C, 'Birthday cake', 'fill', [
    ...candle(32, 12, 22), ...candle(50, 8, 26), ...candle(68, 12, 22),
    hole(rrectD(28, 40, 44, 22, 3) + drips(28, 72, 40, 6), circleD(40, 52, 2.6), circleD(50, 52, 2.6), circleD(60, 52, 2.6)),
    hole(rrectD(14, 64, 72, 26, 3) + drips(14, 86, 64, 9), circleD(30, 78, 3), circleD(50, 78, 3), circleD(70, 78, 3)),
    ellipseD(50, 93, 44, 5)
  ]);
  add(C, 'Cake slice', 'fill', [
    // wedge seen from the side, with two cream layers cut out
    subtractD(polyD([[10, 86], [46, 30], [88, 30], [88, 86]]),
      rectD(0, 48, 100, 8) + rectD(0, 66, 100, 8)),
    // frosting along the top with drips
    `M44 30H88V20H44Z` + Array.from({ length: 6 }, (_, i) => circleD(48 + i * 8, 30, 4)).join(''),
    circleD(66, 12, 7), rrectD(64, 14, 4, 8, 2), ellipseD(50, 89, 44, 6)
  ]);
  add(C, 'Cupcake', 'fill', [
    circleD(50, 14, 7),
    `M22 46C22 26 40 18 50 18C60 18 78 26 78 46C66 40 34 40 22 46Z`,
    hole(polyD([[22, 48], [78, 48], [70, 92], [30, 92]]),
      ...[34, 42, 50, 58, 66].map(x => rotRectD(x, 70, 3, 44, (x - 50) * 0.18))),
    ellipseD(50, 47, 28, 5)
  ]);
  add(C, 'Balloon bunch', 'fill', [
    hole(ellipseD(28, 30, 17, 21), ellipseD(24, 24, 4, 6, -20)),
    hole(ellipseD(66, 24, 17, 21), ellipseD(62, 18, 4, 6, -20)),
    hole(ellipseD(48, 56, 15, 19), ellipseD(44, 51, 3.5, 5, -20)),
    tri([25, 50], [31, 50], [50, 96]), tri([63, 44], [69, 44], [52, 96]), tri([45, 74], [51, 74], [50, 96]),
    tri([26, 50], [30, 50], [28, 54]), tri([64, 44], [68, 44], [66, 48])
  ]);
  add(C, 'Party hat', 'fill', [
    circleD(50, 10, 9),
    hole(tri([50, 18], [82, 88], [18, 88]),
      rotRectD(40, 48, 22, 5, 66), rotRectD(58, 48, 22, 5, -66), rotRectD(50, 74, 34, 5, 0)),
    ellipseD(50, 88, 33, 6)
  ]);
  add(C, 'Party popper', 'fill', [
    hole(polyD([[6, 92], [40, 46], [58, 62], [22, 96]]), rotRectD(28, 74, 26, 4, -45), rotRectD(38, 84, 22, 4, -45)),
    ...radial(9, (a, i) => {
      const p = rotPt(76, 24 + (i % 3) * 6, a * 0.45, 62, 44);
      return i % 2 ? circleD(p[0], p[1], 3.2) : rotRectD(p[0], p[1], 6, 3, a);
    })
  ]);
  add(C, 'Confetti burst', 'fill', radial(14, (a, i) => {
    const r = i % 3 === 0 ? 40 : i % 3 === 1 ? 30 : 46;
    const p = rotPt(50, 50 - r, a);
    return i % 3 === 0 ? rotRectD(p[0], p[1], 5, 11, a) : i % 3 === 1 ? circleD(p[0], p[1], 4) : polyD(starPts(p[0], p[1], 7, 3, 5, a));
  }));
  add(C, 'Gift stack', 'fill', [
    hole(rrectD(12, 52, 54, 42, 3), rotRectD(39, 73, 6, 42, 0), rotRectD(39, 73, 54, 6, 0)),
    `M39 52C26 38 14 48 30 52ZM39 52C52 38 64 48 48 52Z`,
    hole(rrectD(54, 24, 38, 30, 3), rotRectD(73, 39, 5, 30, 0), rotRectD(73, 39, 38, 5, 0)),
    `M73 24C62 12 52 20 66 24ZM73 24C84 12 94 20 80 24Z`
  ]);
  add(C, 'Ice cream', 'fill', [
    circleD(36, 30, 18), circleD(64, 30, 18), circleD(50, 18, 18),
    subtractD(tri([22, 46], [78, 46], [50, 96]),
      [0, 1, 2, 3, 4, 5].map(i => rotRectD(50 + (i - 2.5) * 12, 68, 2.6, 70, 20)).join('') +
      [0, 1, 2, 3, 4, 5].map(i => rotRectD(50 + (i - 2.5) * 12, 68, 2.6, 70, -20)).join('')),
    circleD(50, 6, 6)
  ]);
  add(C, 'Donut', 'fill', [
    hole(circleD(50, 52, 40), circleD(50, 52, 14),
      ...radial(9, (a, i) => { const p = rotPt(50, 25 + (i % 2) * 8, a); return rotRectD(p[0], p[1], 4, 10, a + 40); })),
    hole(`M50 12C72 12 88 30 88 52H76C76 36 64 24 50 24Z`, circleD(62, 22, 3))
  ]);
  add(C, 'Lollipop', 'fill', [
    hole(circleD(50, 36, 32), circleD(50, 36, 25.5), circleD(50, 36, 19), circleD(50, 36, 12.5), circleD(50, 36, 6)),
    rrectD(46.5, 66, 7, 32, 3)
  ]);
  add(C, 'Cookie', 'fill', hole(polyD(Array.from({ length: 180 }, (_, i) => {
    const a = rad(i * 2), r = 44 + 2.5 * Math.sin(a * 11);
    return [50 + r * Math.cos(a), 50 + r * Math.sin(a)];
  })), ...[[36, 34, 7], [64, 40, 6], [44, 62, 6.5], [66, 66, 5], [50, 46, 4]].map(([x, y, r]) => circleD(x, y, r))));
  add(C, 'Party cup', 'fill', [
    rotRectD(70, 26, 4, 40, 18),
    hole(polyD([[22, 30], [78, 30], [68, 94], [32, 94]]), ellipseD(50, 46, 22, 5), ellipseD(50, 62, 19, 4), ellipseD(50, 78, 16, 4)),
    ellipseD(50, 30, 28, 6)
  ]);
  add(C, 'Age badge', 'fill', [
    hole(polyD(starPts(50, 46, 46, 36, 16)), circleD(50, 46, 30)),
    polyD([[22, 74], [38, 74], [30, 98], [18, 88]]), polyD([[78, 74], [62, 74], [70, 98], [82, 88]])
  ]);
  add(C, 'Balloon frame', 'line', [
    rrectD(16, 30, 68, 52, 4), rrectD(21, 35, 58, 42, 3),
    ...[20, 32, 44, 56, 68, 80].map((x, i) => ellipseD(x, 16 + (i % 2) * 7, 7, 9)),
    ...[20, 32, 44, 56, 68, 80].map((x, i) => polyD([[x, 25 + (i % 2) * 7], [x, 30]], false))
  ]);
  add(C, 'Bunting flags', 'fill', [...Array.from({ length: 5 }, (_, i) => {
    const x = 6 + i * 18.5;
    const y = 18 + 14 * Math.sin((Math.PI * (x + 9)) / 100);
    return polyD([[x, y], [x + 15, y], [x + 7.5, y + 26]]);
  }), subtractD(ellipseD(50, 8, 52, 16), ellipseD(50, 5, 52, 16))]);
}

// ------------------------------------------------------------------ Festivals
{
  const C = 'Festivals';
  const hole = (d, ...holes) => ({ d: d + holes.join(''), evenodd: true });
  const tri = (a, b, c) => polyD([a, b, c]);
  const smileOf = (cx, cy, rx, ry) => subtractD(ellipseD(cx, cy, rx, ry), ellipseD(cx, cy - 2.4, rx, ry));
  const flame = (x, y, s = 1) => `M${P(x, y)}C${P(x + 5 * s, y + 7 * s)} ${P(x + 5 * s, y + 13 * s)} ${P(x, y + 15 * s)}C${P(x - 5 * s, y + 13 * s)} ${P(x - 5 * s, y + 7 * s)} ${P(x, y)}Z`;
  const diya = (cx, cy, s = 1) => [
    flame(cx, cy - 26 * s, s * 0.8),
    `M${P(cx - 24 * s, cy)}Q${P(cx, cy + 6 * s)} ${P(cx + 24 * s, cy)}Q${P(cx + 18 * s, cy + 20 * s)} ${P(cx, cy + 22 * s)}Q${P(cx - 18 * s, cy + 20 * s)} ${P(cx - 24 * s, cy)}Z`,
    rrectD(cx - 10 * s, cy + 22 * s, 20 * s, 5 * s, 2)
  ];

  // ---- Indian festivals
  add(C, 'Diya row', 'fill', [...diya(20, 52, 0.75), ...diya(50, 46, 0.95), ...diya(80, 52, 0.75)]);
  add(C, 'Diwali lantern', 'fill', [
    rrectD(47, 2, 6, 12, 2),
    hole(polyD([[30, 14], [70, 14], [78, 30], [78, 62], [70, 78], [30, 78], [22, 62], [22, 30]]),
      polyD(regPts(50, 46, 15, 6, 30)), circleD(32, 30, 3.5), circleD(68, 30, 3.5), circleD(32, 62, 3.5), circleD(68, 62, 3.5)),
    ...Array.from({ length: 7 }, (_, i) => rrectD(28 + i * 7, 78, 3.5, 16 + (i % 2) * 6, 1.5))
  ]);
  add(C, 'Firecracker', 'fill', [
    hole(rrectD(38, 40, 24, 54, 4), rotRectD(50, 54, 20, 4, 0), rotRectD(50, 68, 20, 4, 0), rotRectD(50, 82, 20, 4, 0)),
    polyD([[38, 40], [62, 40], [50, 22]]),
    // sparks fanning out above the rocket tip
    ...Array.from({ length: 7 }, (_, i) => {
      const ang = -45 + i * 15;
      const b1 = rotPt(47.5, 8, ang, 50, 22), b2 = rotPt(52.5, 8, ang, 50, 22), t = rotPt(50, 0, ang, 50, 22);
      return polyD([b1, b2, t]);
    })
  ]);
  add(C, 'Ganesha (stylised)', 'fill', [
    // crown
    tri([40, 20], [50, 0], [60, 20]), circleD(50, 2, 4),
    // ears
    hole(ellipseD(18, 46, 16, 21, -8), ellipseD(21, 47, 8, 12, -8)),
    hole(ellipseD(82, 46, 16, 21, 8), ellipseD(79, 47, 8, 12, 8)),
    // head with eyes and tilak
    hole(ellipseD(50, 44, 26, 26), circleD(40, 40, 3.4), circleD(60, 40, 3.4), rotRectD(50, 26, 4, 12, 0)),
    // trunk curling to one side
    `M38 60C32 78 40 96 60 94C70 92 76 84 70 78C68 86 56 88 52 78C49 70 51 64 54 58Z`,
    // shoulders / seated body
    `M22 96C24 80 36 72 50 72C64 72 76 80 78 96Z`
  ]);
  add(C, 'Rakhi', 'fill', [
    hole(rrectD(2, 44, 28, 12, 5), rotRectD(12, 50, 3, 8, 0), rotRectD(20, 50, 3, 8, 0)),
    hole(rrectD(70, 44, 28, 12, 5), rotRectD(80, 50, 3, 8, 0), rotRectD(88, 50, 3, 8, 0)),
    ...radial(10, a => petalD(50, 50, 10, 16, 6, a)),
    hole(circleD(50, 50, 12), circleD(50, 50, 5))
  ]);
  add(C, 'Dandiya sticks', 'fill', [
    hole(rotRectD(50, 50, 8, 84, 25), rotRectD(50, 30, 8, 4, 25), rotRectD(50, 70, 8, 4, 25)),
    hole(rotRectD(50, 50, 8, 84, -25), rotRectD(50, 30, 8, 4, -25), rotRectD(50, 70, 8, 4, -25)),
    ...radial(6, a => petalD(...rotPt(50, 12, 25), 4, 9, 3.5, a)),
    ...radial(6, a => petalD(...rotPt(50, 12, -25), 4, 9, 3.5, a))
  ]);
  add(C, 'Kite', 'fill', [
    hole(polyD([[50, 4], [86, 44], [50, 76], [14, 44]]),
      polyD([[50, 10], [80, 44], [50, 44]]), polyD([[50, 50], [78, 47], [50, 70]])),
    `M50 76C58 84 42 88 50 96C58 100 44 100 46 94Z`,
    polyD([[42, 86], [54, 82], [54, 88], [42, 92]]), polyD([[40, 96], [52, 92], [52, 98], [40, 100]])
  ]);
  add(C, 'Matki (pot)', 'fill', [
    rrectD(44, 6, 12, 10, 2), `M40 16H60L58 26H42Z`,
    hole(`M30 30H70C82 42 84 66 72 80C60 94 40 94 28 80C16 66 18 42 30 30Z`,
      rotRectD(50, 46, 44, 5, 0), circleD(36, 62, 4), circleD(50, 68, 4), circleD(64, 62, 4)),
    tri([40, 26], [50, 16], [60, 26])
  ]);
  add(C, 'Temple', 'fill', [
    rrectD(47, 2, 6, 10, 2), circleD(50, 2, 4),
    polyD([[30, 46], [50, 12], [70, 46]]),
    hole(rectD(22, 46, 56, 48), polyD([[42, 94], [42, 66], [50, 58], [58, 66], [58, 94]])),
    rectD(14, 88, 72, 8), rectD(18, 80, 64, 6)
  ]);
  add(C, 'Temple bell', 'fill', [
    rrectD(47, 4, 6, 10, 2), hole(circleD(50, 6, 7), circleD(50, 6, 3)),
    hole(`M26 74C26 44 34 20 50 20C66 20 74 44 74 74Z`, rotRectD(50, 56, 40, 4, 0)),
    rrectD(22, 74, 56, 8, 3), ellipseD(50, 90, 8, 10)
  ]);
  add(C, 'Marigold garland', 'fill', [
    ...Array.from({ length: 7 }, (_, i) => {
      const x = 8 + i * 14, y = 24 + 22 * Math.sin((Math.PI * (x - 8)) / 84);
      return radial(8, a => petalD(x, y, 2.5, 6, 2.6, a)).join('') + circleD(x, y, 3);
    }),
    ...Array.from({ length: 6 }, (_, i) => {
      const x = 15 + i * 14, y = 34 + 22 * Math.sin((Math.PI * (x - 8)) / 84);
      return petalD(x, y + 14, 0, 16, 5, 90);
    })
  ]);
  add(C, 'Holi splash', 'fill', [
    hole(polyD(Array.from({ length: 240 }, (_, i) => {
      const a = (TAU / 240) * i;
      const r = 30 + 9 * Math.sin(a * 5) + 5 * Math.sin(a * 9 + 1.2);
      return [50 + r * Math.cos(a), 50 + r * Math.sin(a) * 0.92];
    })), circleD(40, 42, 5), circleD(58, 38, 4), circleD(52, 60, 6), circleD(36, 60, 3.5)),
    ...radial(11, (a, i) => { const p = rotPt(50, 48 - (i % 3) * 6, a + 8); return circleD(p[0], p[1], 2 + (i % 3) * 1.2); })
  ]);
  add(C, 'Pichkari', 'fill', [
    hole(rrectD(20, 40, 52, 16, 6), rotRectD(36, 48, 3, 10, 0), rotRectD(46, 48, 3, 10, 0)),
    rrectD(72, 44, 24, 8, 3), rrectD(24, 56, 12, 30, 4),
    ...radial(7, (a, i) => { const p = rotPt(96, 48 - 14 + (i % 3) * 7, 0); return circleD(p[0] + (i % 4) * 1.5, p[1], 2.4); })
  ]);

  // ---- International festivals
  add(C, 'Christmas wreath', 'fill', [
    // leafy ring built from petals so the silhouette keeps a leaf edge
    ...radial(16, a => petalD(50, 56, 22, 20, 7.5, a)),
    ...radial(16, a => petalD(50, 56, 26, 13, 4.5, a + 11)),
    hole(circleD(50, 56, 25), circleD(50, 56, 22)),
    ...radial(8, a => circleD(...rotPt(50, 56 - 33, a + 22), 2.6)),
    // bow
    `M50 14C38 2 26 10 34 20C40 26 46 22 50 16ZM50 14C62 2 74 10 66 20C60 26 54 22 50 16Z`,
    rrectD(46, 12, 8, 10, 3)
  ]);
  add(C, 'Snowman', 'fill', [
    rrectD(30, 8, 40, 6, 2), rrectD(36, 0, 28, 10, 2),
    hole(circleD(50, 30, 18), circleD(44, 26, 3), circleD(56, 26, 3), tri([48, 32], [68, 36], [48, 38]),
      circleD(44, 40, 1.8), circleD(50, 41, 1.8), circleD(56, 40, 1.8)),
    hole(circleD(50, 68, 26), circleD(50, 60, 4), circleD(50, 72, 4), circleD(50, 84, 4)),
    rotRectD(22, 54, 30, 4, 25), rotRectD(78, 54, 30, 4, -25)
  ]);
  add(C, 'Santa hat', 'fill', [
    `M12 72C12 42 30 16 54 14C72 13 84 24 82 36C80 46 70 52 58 54L20 72Z`,
    rrectD(6, 68, 76, 18, 9), circleD(86, 34, 13)
  ]);
  add(C, 'Bauble', 'fill', [
    rrectD(44, 2, 12, 10, 2), rrectD(40, 10, 20, 8, 3),
    hole(circleD(50, 58, 38), rotRectD(50, 40, 60, 5, 0), rotRectD(50, 74, 50, 5, 0),
      ...radial(6, a => circleD(...rotPt(50, 34, a), 3)))
  ]);
  add(C, 'Reindeer', 'fill', [
    `M30 34C22 26 20 12 24 4C28 12 34 16 38 22ZM24 18C16 18 8 12 6 4C14 10 20 10 26 12Z`,
    `M70 34C78 26 80 12 76 4C72 12 66 16 62 22ZM76 18C84 18 92 12 94 4C86 10 80 10 74 12Z`,
    ellipseD(16, 50, 8, 12, -20), ellipseD(84, 50, 8, 12, 20),
    hole(ellipseD(50, 58, 28, 34), circleD(40, 48, 4), circleD(60, 48, 4)),
    circleD(50, 82, 9)
  ]);
  add(C, 'Candy cane', 'fill', hole(
    `M34 96V46C34 26 50 14 66 14C82 14 94 26 94 42H76C76 34 72 30 65 30C58 30 52 36 52 46V96Z`,
    ...[0, 1, 2, 3, 4, 5].map(i => rotRectD(43, 92 - i * 12, 20, 5, 90)),
    ...[0, 1, 2].map(i => rotRectD(60 + i * 12, 22 + i * 4, 5, 18, 60))));
  add(C, 'Stocking', 'fill', [
    rrectD(18, 10, 48, 16, 4),
    hole(`M24 26H60V56C60 66 74 66 82 74C92 84 86 96 72 96C56 96 44 86 34 74C26 64 24 54 24 40Z`,
      rotRectD(42, 66, 40, 5, 40))
  ]);
  add(C, 'Gingerbread', 'fill', hole(
    `M50 4C60 4 68 12 68 22C68 26 67 29 65 32H84C92 32 96 38 96 44C96 50 92 56 84 56H70V72C70 86 62 96 50 96C38 96 30 86 30 72V56H16C8 56 4 50 4 44C4 38 8 32 16 32H35C33 29 32 26 32 22C32 12 40 4 50 4Z`,
    circleD(43, 20, 3.4), circleD(57, 20, 3.4), smileOf(50, 26, 8, 6),
    circleD(50, 48, 4), circleD(50, 64, 4)));
  add(C, 'Mosque', 'fill', [
    rrectD(11, 24, 6, 50, 3), circleD(14, 20, 6), rrectD(83, 24, 6, 50, 3), circleD(86, 20, 6),
    `M50 8C52 14 56 16 56 22C56 26 53 28 50 28C47 28 44 26 44 22C44 16 48 14 50 8Z`,
    `M28 56C28 38 38 28 50 28C62 28 72 38 72 56Z`,
    hole(rectD(20, 56, 60, 38), `M50 94V76C44 76 40 80 40 86V94Z`, `M50 94V76C56 76 60 80 60 86V94Z`),
    rectD(14, 92, 72, 6)
  ]);
  add(C, 'Eid lantern', 'fill', [
    rrectD(47, 2, 6, 10, 2),
    polyD([[34, 14], [66, 14], [72, 24], [28, 24]]),
    hole(rrectD(28, 24, 44, 52, 4), polyD([[50, 32], [64, 50], [50, 68], [36, 50]]), circleD(35, 36, 2.6), circleD(65, 36, 2.6), circleD(35, 64, 2.6), circleD(65, 64, 2.6)),
    polyD([[28, 76], [72, 76], [66, 88], [34, 88]]), rrectD(44, 88, 12, 8, 2)
  ]);
  add(C, 'Jack-o-lantern', 'fill', [
    rrectD(46, 4, 8, 16, 3), `M54 12C64 8 70 14 66 20C64 14 58 14 54 16Z`,
    hole(`M50 20C76 20 94 38 94 60C94 82 76 96 50 96C24 96 6 82 6 60C6 38 24 20 50 20Z`,
      tri([22, 52], [42, 52], [32, 36]), tri([78, 52], [58, 52], [68, 36]),
      `M24 66H76L68 78H60L56 72H44L40 78H32Z`)
  ]);
  add(C, 'Ghost', 'fill', hole(
    `M50 6C72 6 84 24 84 44V94L72 84L60 94L50 84L40 94L28 84L16 94V44C16 24 28 6 50 6Z`,
    ellipseD(38, 40, 7, 10), ellipseD(62, 40, 7, 10), ellipseD(50, 62, 8, 10)));
  add(C, 'Bat', 'fill', [
    `M50 34C58 34 62 40 62 48C62 58 56 66 50 70C44 66 38 58 38 48C38 40 42 34 50 34Z`,
    tri([44, 30], [40, 16], [52, 26]), tri([56, 30], [60, 16], [48, 26]),
    `M40 40C28 22 10 20 2 30C10 30 14 36 14 44C22 40 30 42 38 52ZM60 40C72 22 90 20 98 30C90 30 86 36 86 44C78 40 70 42 62 52Z`
  ]);
  add(C, 'Spider web', 'line', [
    ...radial(8, a => polyD([[50, 50], rotPt(50, 2, a)], false)),
    ...[12, 22, 32, 42].map(r => polyD(regPts(50, 50, r, 8, -90))),
    circleD(50, 50, 3)
  ]);
  add(C, 'Witch hat', 'fill', [
    `M54 8C64 22 74 52 82 74L26 78C30 54 40 24 54 8Z`,
    hole(`M8 84C8 76 30 70 52 70C74 70 96 76 96 84C96 92 74 96 52 96C30 96 8 92 8 84Z`, ellipseD(52, 80, 16, 5)),
    rrectD(30, 62, 46, 10, 3)
  ]);
  add(C, 'Fireworks', 'line', [
    ...radial(16, a => polyD([rotPt(50, 26, a), rotPt(50, 4, a)], false)),
    ...radial(8, a => circleD(...rotPt(50, 10, a + 11), 2)),
    ...radial(10, a => polyD([rotPt(50, 34, a + 18), rotPt(50, 22, a + 18)], false)),
    circleD(50, 50, 4)
  ]);
  add(C, 'Cheers glasses', 'fill', [
    hole(`M18 8H46L40 42C40 52 34 56 32 56C30 56 24 52 24 42Z`, `M26 14H38L34 34H30Z`),
    rrectD(30, 56, 4, 30, 2), ellipseD(32, 90, 14, 5),
    hole(`M54 8H82L76 42C76 52 70 56 68 56C66 56 60 52 60 42Z`, `M62 14H74L70 34H66Z`),
    rrectD(66, 56, 4, 30, 2), ellipseD(68, 90, 14, 5),
    circleD(50, 20, 3), circleD(44, 8, 2.4), circleD(56, 6, 2)
  ]);
  add(C, 'New Year clock', 'fill', [
    hole(circleD(50, 54, 42), circleD(50, 54, 34)),
    hole(circleD(50, 54, 30), rotRectD(50, 44, 4, 24, 0), rotRectD(58, 54, 22, 4, 0),
      ...radial(12, a => { const p = rotPt(50, 30, a); return circleD(p[0], p[1], 1.8); })),
    rrectD(44, 2, 12, 10, 3), tri([26, 10], [38, 16], [30, 22]), tri([74, 10], [62, 16], [70, 22])
  ]);
  add(C, 'Easter basket', 'fill', [
    hole(`M12 44H88L80 92H20Z`, ...[0, 1, 2, 3].map(i => rotRectD(30 + i * 13, 68, 4, 48, 0)), rotRectD(50, 58, 74, 4, 0)),
    hole(`M18 44C18 20 34 8 50 8C66 8 82 20 82 44H74C74 26 62 16 50 16C38 16 26 26 26 44Z`),
    ellipseD(30, 40, 11, 13), ellipseD(50, 36, 11, 13), ellipseD(70, 40, 11, 13)
  ]);
}

// ------------------------------------------------------------------ Smileys
// Expression faces. Solid versions engrave as a filled disc with the features left unburned;
// line versions are outlines for scoring or cutting.
{
  const C = 'Smileys';
  const hole = (d, ...holes) => ({ d: d + holes.join(''), evenodd: true });
  const tri = (a, b, c) => polyD([a, b, c]);
  const face = (...holes) => hole(circleD(50, 50, 46), ...holes);
  const band = (cx, cy, rx, ry, t) => subtractD(ellipseD(cx, cy, rx, ry), ellipseD(cx, cy - t, rx, ry));
  const frown = (cx, cy, rx, ry, t) => subtractD(ellipseD(cx, cy, rx, ry), ellipseD(cx, cy + t, rx, ry));
  const eye = (x, y = 38, r = 6) => circleD(x, y, r);
  const eyeClosed = (x, y = 40) => band(x, y, 10, 8, 3.5);
  const eyeWink = (x, y = 40) => frown(x, y, 10, 8, 3.5);
  const brow = (x, y, deg) => rotRectD(x, y, 17, 4, deg);
  const openMouth = (cx = 50, cy = 58, r = 21) => `M${P(cx - r, cy)}A${f(r)} ${f(r)} 0 0 0 ${P(cx + r, cy)}Z`;
  const smileBand = (cy = 56, rx = 22, ry = 19, t = 5) => band(50, cy, rx, ry, t);
  const heartEye = x => heartD(x, 38, 26);
  const starEye = x => polyD(starPts(x, 38, 11, 4.6, 5));
  const teardrop = (x, y) => `M${P(x, y)}C${P(x, y)} ${P(x - 7, y + 12)} ${P(x - 7, y + 16)}A7 7 0 0 0 ${P(x + 7, y + 16)}C${P(x + 7, y + 12)} ${P(x, y)} ${P(x, y)}Z`;

  add(C, 'Smile', 'fill', face(eye(34), eye(66), smileBand()));
  add(C, 'Grin', 'fill', [face(eye(34), eye(66), openMouth()), rrectD(29, 56, 42, 4, 2)]);
  add(C, 'Laugh', 'fill', [face(eyeClosed(34), eyeClosed(66), openMouth(50, 56, 23)), `M32 72C38 84 62 84 68 72Z`]);
  add(C, 'Wink', 'fill', face(eye(34), eyeWink(66), smileBand()));
  add(C, 'Neutral', 'fill', face(eye(34), eye(66), rrectD(32, 64, 36, 5, 2.5)));
  add(C, 'Sad', 'fill', face(eye(34), eye(66), frown(50, 74, 20, 16, 5)));
  add(C, 'Surprised', 'fill', face(eye(34, 38, 7), eye(66, 38, 7), ellipseD(50, 68, 11, 14)));
  add(C, 'Shocked', 'fill', face(eye(34, 36, 9), eye(66, 36, 9), ellipseD(50, 70, 14, 16)));
  add(C, 'Heart eyes', 'fill', [face(heartEye(33), heartEye(67), openMouth(50, 60, 18))]);
  add(C, 'Star eyes', 'fill', face(starEye(33), starEye(67), smileBand(58, 20, 17, 5)));
  add(C, 'Cool', 'fill', [
    face(rrectD(18, 30, 26, 18, 6), rrectD(56, 30, 26, 18, 6), rectD(44, 36, 12, 5), smileBand(58, 20, 17, 5))
  ]);
  add(C, 'Nerd', 'fill', [
    face(circleD(33, 38, 14), circleD(67, 38, 14), rectD(45, 36, 10, 4), smileBand(60, 18, 15, 4.5)),
    circleD(33, 38, 5), circleD(67, 38, 5)
  ]);
  add(C, 'Angry', 'fill', face(brow(33, 28, 18), brow(67, 28, -18), eye(33, 42, 6), eye(67, 42, 6), frown(50, 78, 18, 14, 5)));
  add(C, 'Crying', 'fill', face(eyeClosed(34, 38), eyeClosed(66, 38), teardrop(34, 46), teardrop(66, 46), frown(50, 80, 16, 12, 4.5)));
  add(C, 'Tongue out', 'fill', [
    face(eyeClosed(34), eyeClosed(66), openMouth(50, 56, 21)),
    `M38 74C38 86 62 86 62 74C62 70 38 70 38 74Z`
  ]);
  add(C, 'Kiss', 'fill', [face(eye(34), eyeWink(66), ellipseD(52, 68, 9, 7)), heartD(88, 14, 24)]);
  add(C, 'Blush', 'fill', face(eyeClosed(32, 40), eyeClosed(68, 40), circleD(22, 58, 7), circleD(78, 58, 7), smileBand(58, 16, 14, 4.5)));
  add(C, 'Sleepy', 'fill', [
    face(eyeClosed(34, 40), eyeClosed(66, 40), ellipseD(50, 70, 7, 9)),
    polyD([[76, 4], [96, 4], [80, 20], [96, 20], [96, 25], [72, 25], [88, 9], [76, 9]])
  ]);
  add(C, 'Smirk', 'fill', face(eye(34), eyeWink(66, 38), rotRectD(52, 68, 30, 5, 10)));
  add(C, 'Mischief', 'fill', [
    face(brow(33, 30, 16), brow(67, 30, -16), eye(33, 44, 5.5), eye(67, 44, 5.5), smileBand(62, 22, 18, 5)),
    tri([10, 22], [6, 0], [28, 12]), tri([90, 22], [94, 0], [72, 12])
  ]);
  add(C, 'Party', 'fill', [
    face(eyeClosed(34, 42), eyeClosed(66, 42), openMouth(50, 62, 18)),
    tri([62, 16], [90, 0], [86, 30]),
    circleD(12, 14, 3.5), circleD(24, 6, 3), circleD(6, 30, 3)
  ]);
  add(C, 'Big smile', 'fill', face(eye(32, 40, 8), eye(68, 40, 8), smileBand(56, 26, 22, 6)));

  // line versions
  const lineFace = (...parts) => [circleD(50, 50, 46), ...parts];
  const arcSmile = (cy, r, dir = 1) => dir > 0
    ? `M${P(50 - r, cy)}A${f(r)} ${f(r)} 0 0 0 ${P(50 + r, cy)}`
    : `M${P(50 - r, cy)}A${f(r)} ${f(r)} 0 0 1 ${P(50 + r, cy)}`;
  add(C, 'Smile (line)', 'line', lineFace(circleD(34, 38, 5), circleD(66, 38, 5), arcSmile(58, 22)));
  add(C, 'Wink (line)', 'line', lineFace(circleD(34, 38, 5), `M58 40A8 8 0 0 1 74 40`, arcSmile(58, 22)));
  add(C, 'Sad (line)', 'line', lineFace(circleD(34, 38, 5), circleD(66, 38, 5), arcSmile(76, 20, -1)));
  add(C, 'Surprised (line)', 'line', lineFace(circleD(34, 38, 6), circleD(66, 38, 6), ellipseD(50, 66, 10, 13)));
  add(C, 'Laugh (line)', 'line', lineFace(`M26 40A8 8 0 0 1 42 40`, `M58 40A8 8 0 0 1 74 40`, openMouth(50, 58, 21)));
  add(C, 'Heart eyes (line)', 'line', lineFace(heartEye(33), heartEye(67), arcSmile(60, 18)));
}

// ------------------------------------------------------------------ Patterns (100 mm tiles)
{
  const C = 'Patterns';
  const hex = [];
  for (let row = 0; row < 7; row++) for (let col = 0; col < 7; col++) {
    const x = 8 + col * 14 + (row % 2 ? 7 : 0), y = 8 + row * 12.2;
    if (x < 96) hex.push(polyD(regPts(x, y, 7.6, 6, 0).map(p => [p[0], p[1]])));
  }
  add(C, 'Honeycomb', 'line', hex, { tile: true });
  const dots = [];
  for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) dots.push(circleD(5 + i * 10, 5 + j * 10, 2.5));
  add(C, 'Dot grid', 'fill', dots, { tile: true });
  const chev = [];
  for (let k = 0; k < 8; k++) {
    let pts = [];
    for (let i = 0; i <= 10; i++) pts.push([i * 10, 8 + k * 12 + (i % 2 ? 6 : 0)]);
    chev.push(polyD(pts, false));
  }
  add(C, 'Chevron', 'line', chev, { tile: true });
  const waves = [];
  for (let k = 0; k < 10; k++) {
    let d = `M0 ${5 + k * 10}`;
    for (let i = 0; i < 5; i++) d += `Q${i * 20 + 5} ${k * 10} ${i * 20 + 10} ${5 + k * 10}T${i * 20 + 20} ${5 + k * 10}`;
    waves.push(d);
  }
  add(C, 'Waves', 'line', waves, { tile: true });
  const check = [];
  for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) if ((i + j) % 2 === 0) check.push(rectD(i * 10, j * 10, 10, 10));
  add(C, 'Checkerboard', 'fill', check, { tile: true });
  add(C, 'Concentric circles', 'line', Array.from({ length: 12 }, (_, i) => circleD(50, 50, 4 + i * 4)), { tile: true });
  add(C, 'Spiral', 'line', polyD(Array.from({ length: 1440 }, (_, i) => {
    const a = rad(i), r = 1 + 47 * (i / 1440);
    return [50 + r * Math.cos(a), 50 + r * Math.sin(a)];
  }), false), { tile: true });
  const herr = [];
  for (let r = 0; r < 10; r++) for (let c = 0; c < 5; c++) {
    const x = c * 20, y = r * 10;
    herr.push(lineD(x, y, x + 10, y + 10), lineD(x + 10, y + 10, x + 20, y));
  }
  add(C, 'Zigzag lines', 'line', herr, { tile: true });
  const tri = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 9; c++) {
    const x = c * 12 + (r % 2 ? 6 : 0), y = 4 + r * 12;
    if (x + 10 <= 100) tri.push(polyD([[x, y + 10], [x + 5, y], [x + 10, y + 10]]));
  }
  add(C, 'Triangles', 'fill', tri, { tile: true });
  const sq = [];
  for (let i = 0; i < 5; i++) sq.push(rectD(4 + i * 9, 4 + i * 9, 92 - i * 18, 92 - i * 18));
  add(C, 'Nested squares', 'line', sq, { tile: true });
}

} // end buildAll

let built = false;
export function getArtAssets() {
  if (!built) { built = true; buildAll(); }
  return ASSETS;
}
export function getArtCategories() {
  return [...new Set(getArtAssets().map(a => a.cat))];
}

/** Full SVG (100 mm square) for an art asset. */
export function artSvg(a, color = '#000') {
  const body = a.parts.map(p => {
    const d = typeof p === 'string' ? p : p.d;
    const eo = typeof p === 'object' && p.evenodd ? ' fill-rule="evenodd"' : '';
    return a.kind === 'line'
      ? `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>`
      : `<path d="${d}" fill="${color}"${eo}/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100">${body}</svg>`;
}
