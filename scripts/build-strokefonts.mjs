// Packs single-stroke (Hershey) fonts into src/library/strokefonts.json.
//
// These are engraving fonts: each glyph is an open polyline following the
// centre of the stroke, so the laser traces the letter once instead of
// outlining and filling it. hersheytext is a build-time dependency only —
// the app ships the packed JSON, not the package.
//
// Run with `npm run strokefonts`.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const hershey = require('hersheytext');

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outFile = path.join(root, 'src', 'library', 'strokefonts.json');

// Latin text faces only. The package also ships astrology, music, meteorology,
// maths and non-Latin sets, which are symbol collections rather than fonts.
const WANTED = [
  ['futural',   'Sans (single line)'],
  ['futuram',   'Sans Medium (single line)'],
  ['timesr',    'Serif (single line)'],
  ['timesrb',   'Serif Bold (single line)'],
  ['timesi',    'Serif Italic (single line)'],
  ['scripts',   'Script (single line)'],
  ['cursive',   'Cursive (single line)'],
  ['gothiceng', 'Gothic (single line)']
];

// Printable ASCII. Hershey has no glyphs beyond this range in these faces.
const CHARS = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i));

// Baseline sits at y=22 in Hershey units, caps are 21 units tall. Recorded here
// so the renderer can place text without re-deriving it.
const ADV_SCALE = 1.68;
// The package's own default word advance (lib: `'horiz-adv-x': 10`).
const SPACE_UNITS = 10;

const METRICS = { baseline: 22, capHeight: 21, descender: 7, em: 30 };

const out = { metrics: METRICS, fonts: {} };
const report = [];

for (const [key, label] of WANTED) {
  if (!hershey.fonts[key]) { report.push(`  ${key}: MISSING from package, skipped`); continue; }
  const chars = {};
  let drawn = 0;
  for (const ch of CHARS) {
    let g;
    try { g = hershey.renderTextArray(ch, { font: key })[0]; } catch { g = null; }
    if (!g || typeof g.width !== 'number') continue;
    // hersheytext stores a packed width and scales it by 1.68 when it lays out
    // text (lib/hersheytext.js: `const multiplyer = font.type === 'svg' ? 1 : 1.68`).
    // Resolve that here so the renderer carries no magic constant; using the raw
    // value overlaps the letters.
    // A space legitimately has no path but still advances.
    chars[ch] = { d: g.d || '', adv: +(g.width * ADV_SCALE).toFixed(3) };
    if (g.d) drawn++;
  }
  // hersheytext handles word gaps outside the glyph loop, so rendering a lone
  // space yields nothing and the character would be absent. Give it an explicit
  // advance or words run together.
  if (!chars[' '] || !chars[' '].adv) {
    chars[' '] = { d: '', adv: +(SPACE_UNITS * ADV_SCALE).toFixed(3) };
  }

  // Guard against packing a font whose glyphs did not actually come through.
  const a = chars.A && chars.A.d, b = chars.B && chars.B.d;
  if (drawn < 60 || !a || !b || a === b) {
    report.push(`  ${key}: only ${drawn} glyphs drawn or A/B identical — skipped`);
    continue;
  }
  out.fonts[key] = { name: label, chars };
  report.push(`  ${key.padEnd(10)} ${String(drawn).padStart(3)} glyphs  "${label}"`);
}

fs.writeFileSync(outFile, JSON.stringify(out));
const kb = (fs.statSync(outFile).size / 1024).toFixed(0);
console.log(report.join('\n'));
console.log(`strokefonts.json: ${Object.keys(out.fonts).length} fonts, ${kb} KB`);
