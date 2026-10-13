// Single-stroke (Hershey) engraving fonts.
//
// Unlike a TrueType face, these glyphs are open centre-lines rather than closed
// outlines: the laser follows each stroke once instead of tracing a boundary
// and filling it. That makes text far quicker to engrave and is the usual
// choice for part marking. Data is packed at build time by
// scripts/build-strokefonts.mjs.
/* global paper */

let data = null;

export async function loadStrokeFonts() {
  if (data) return data;
  const text = window.api
    ? await window.api.libBundle('strokefonts')
    : await (await fetch('library/strokefonts.json')).text();
  data = JSON.parse(text);
  return data;
}

export function isStrokeFont(path) {
  return typeof path === 'string' && path.startsWith('stroke:');
}

/** Font entries shaped like the system-font list, so the picker can merge them. */
export function strokeFontEntries(d) {
  return Object.entries(d.fonts).map(([key, f]) => ({ name: f.name, path: 'stroke:' + key }));
}

/**
 * Build the glyphs for a stroke-font spec. Returns a CompoundPath whose
 * children are OPEN paths — the editor styles those with a stroke and no fill,
 * which is exactly what a Line-mode layer should cut.
 */
export async function buildStrokeGlyphs(spec) {
  const d = await loadStrokeFonts();
  const key = String(spec.font).slice('stroke:'.length);
  const font = d.fonts[key];
  if (!font) throw new Error(`Single-line font "${key}" is not available.`);

  const m = d.metrics;
  const size = Math.max(0.5, +spec.size || 10);
  const scale = size / m.em;
  const lineH = size * (spec.lineSpacing || 1.2);
  const tracking = +spec.letterSpacing || 0;
  const lines = String(spec.content || '').split(/\r?\n/);

  const cp = new paper.CompoundPath({ insert: false });
  const lineWidths = [];
  const lineGroups = [];

  lines.forEach((line, li) => {
    let x = 0;
    const parts = [];
    for (const ch of line) {
      const g = font.chars[ch];
      if (!g) continue;                       // unsupported character: skip, keep going
      if (g.d) {
        const part = new paper.CompoundPath({ pathData: g.d, insert: false });
        part.scale(scale, scale, new paper.Point(0, 0));
        // Hershey puts the baseline at a fixed y; move it onto this line's baseline.
        part.translate(new paper.Point(x, li * lineH - m.baseline * scale));
        parts.push(part);
      }
      x += g.adv * scale + tracking;
    }
    lineWidths.push(Math.max(0, x - tracking));
    lineGroups.push(parts);
  });

  const maxW = Math.max(...lineWidths, 0);
  lineGroups.forEach((parts, li) => {
    let dx = 0;
    if (spec.align === 'center') dx = (maxW - lineWidths[li]) / 2;
    else if (spec.align === 'right') dx = maxW - lineWidths[li];
    for (const part of parts) {
      if (dx) part.translate(new paper.Point(dx, 0));
      cp.addChildren(part.removeChildren());
    }
  });

  if (!cp.children.length) {
    throw new Error('None of those characters exist in this single-line font.');
  }
  // Deliberately left open and unclosed — that is the whole point of the font.
  return cp;
}
