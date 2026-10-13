// Text → vector outlines using opentype.js and installed system fonts.
/* global opentype, paper */
import { warpItem, isIdentityQuad, arcItem } from './warp.js';
import { loadStrokeFonts, strokeFontEntries, isStrokeFont, buildStrokeGlyphs } from './strokefont.js';

const cache = new Map();
let fontList = null;

export async function listFonts() {
  if (fontList) return fontList;
  let system = [];
  try {
    system = window.api ? await window.api.listFonts() : [];
  } catch {
    system = [];
  }
  let stroke = [];
  try {
    stroke = strokeFontEntries(await loadStrokeFonts());
  } catch {
    stroke = [];   // packed bundle missing: carry on with system fonts only
  }
  // Single-line faces first: they are the ones worth reaching for when engraving.
  fontList = [...stroke, ...system];
  return fontList;
}

export function registerFontBuffer(name, buffer) {
  const font = opentype.parse(buffer);
  const key = 'user:' + name;
  cache.set(key, font);
  fontList = fontList || [];
  if (!fontList.find(f => f.path === key)) fontList.unshift({ name: name + ' (loaded)', path: key });
  return key;
}

export async function loadFont(path) {
  if (cache.has(path)) return cache.get(path);
  if (!window.api) throw new Error('Font loading requires the desktop app');
  const buf = await window.api.readFont(path);
  const font = opentype.parse(buf);
  cache.set(path, font);
  return font;
}

export async function defaultFontPath() {
  const fonts = await listFonts();
  const pref = ['Arial', 'Segoe UI', 'Calibri', 'Verdana', 'Helvetica', 'DejaVu Sans', 'Liberation Sans'];
  for (const p of pref) {
    const f = fonts.find(x => x.name === p);
    if (f) return f.path;
  }
  // Single-line faces are listed first for visibility, but they must never
  // become the default — new text should be an ordinary outline font.
  const system = fonts.filter(f => !isStrokeFont(f.path));
  if (system.length) return system[0].path;
  return fonts.length ? fonts[0].path : null;
}

/**
 * Build a CompoundPath for the given text spec.
 * spec: { content, font (path), size (mm), letterSpacing (mm), lineSpacing (×), align,
 *         arc?: { angle (deg, sign picks the bend direction), flip (read inside) },
 *         envelope?: [[u,v] ×4] corner quad in units of the text's natural box,
 *         envRect?: [x, y, w, h] where that natural box sits, so the warp is
 *                   reproduced in the same place when the words change }
 */
export async function buildTextPath(spec, at) {
  const size = Math.max(0.5, +spec.size || 10);
  if (isStrokeFont(spec.font)) return finishTextPath(await buildStrokeGlyphs(spec), spec, size, at);
  const font = await loadFont(spec.font);
  const lines = String(spec.content || '').split(/\r?\n/);
  const lineH = size * (spec.lineSpacing || 1.2);
  const tracking = +spec.letterSpacing || 0;
  const scale = size / font.unitsPerEm;
  const cp = new paper.CompoundPath({ insert: false });
  const lineWidths = [];
  const linePaths = [];
  const badGlyphs = new Set();

  lines.forEach((line, li) => {
    const glyphs = font.stringToGlyphs(line);
    let x = 0;
    const pathData = [];
    for (let i = 0; i < glyphs.length; i++) {
      const g = glyphs[i];
      const p = g.getPath(x, li * lineH, size);
      const d = p.toPathData(3);
      // Some fonts yield non-finite coordinates for a glyph. "NaN" in path data
      // parses as an arc command and crashes the importer, and quietly dropping
      // the glyph would engrave a word with a letter missing — so refuse it.
      if (/NaN|Infinity/.test(d)) badGlyphs.add(g.name || (g.unicode ? String.fromCodePoint(g.unicode) : '?'));
      else pathData.push(d);
      x += g.advanceWidth * scale + tracking;
      if (i < glyphs.length - 1) x += font.getKerningValue(g, glyphs[i + 1]) * scale;
    }
    lineWidths.push(Math.max(0, x - tracking));
    linePaths.push(pathData.join(' '));
  });

  if (badGlyphs.size) {
    throw new Error(`This font produced invalid outlines for: ${[...badGlyphs].join(', ')}. Choose a different font.`);
  }

  const maxW = Math.max(...lineWidths, 0);
  linePaths.forEach((d, li) => {
    if (!d.trim()) return;
    const part = new paper.CompoundPath({ pathData: d, insert: false });
    let dx = 0;
    if (spec.align === 'center') dx = (maxW - lineWidths[li]) / 2;
    else if (spec.align === 'right') dx = maxW - lineWidths[li];
    if (dx) part.translate(new paper.Point(dx, 0));
    cp.addChildren(part.removeChildren());
  });

  if (!cp.children.length) {
    // keep an empty-but-valid placeholder so the object remains editable
    cp.addChild(new paper.Path.Rectangle({ point: [0, 0], size: [size * 0.6, size], insert: false }));
  }
  // Font contours are always closed, but opentype's path data may omit the trailing Z.
  for (const p of cp.children) {
    if (p.segments.length > 2 && p.firstSegment.point.getDistance(p.lastSegment.point) < 1e-3) {
      p.firstSegment.handleIn = p.lastSegment.handleIn;
      p.lastSegment.remove();
    }
    p.closed = true;
  }
  cp.fillRule = 'nonzero';
  // Glyph outlines from opentype use nonzero winding; normalise to even-odd friendly orientation.
  cp.reorient(true, true);
  return finishTextPath(cp, spec, size, at);
}

// Placement, arc and envelope, shared by outline and single-line text.
function finishTextPath(cp, spec, size, at) {
  // Arc first: it bends the strip onto a circle, and an envelope afterwards
  // distorts whatever shape that produced.
  if (spec.arc && Math.abs(+spec.arc.angle || 0) >= 0.01) {
    if (at) cp.bounds.topLeft = at;
    arcItem(cp, { angle: +spec.arc.angle, flip: !!spec.arc.flip, detail: Math.max(0.1, size / 50) });
  }

  const quad = spec.envelope;
  if (quad && !isIdentityQuad(quad)) {
    // Anchor the undistorted text where the envelope was drawn, so editing the
    // words re-warps in place instead of jumping.
    if (spec.envRect) {
      const [ex, ey, ew, eh] = spec.envRect;
      if (ew > 0 && eh > 0) cp.scale(ew / cp.bounds.width, eh / cp.bounds.height, cp.bounds.topLeft);
      cp.bounds.topLeft = new paper.Point(ex, ey);
    } else if (at) {
      cp.bounds.topLeft = at;
    }
    warpItem(cp, quad, { detail: Math.max(0.12, size / 40) });
  } else if (at) {
    cp.bounds.topLeft = at;
  }

  cp.data.text = { ...spec };
  return cp;
}
