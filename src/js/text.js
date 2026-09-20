// Text → vector outlines using opentype.js and installed system fonts.
/* global opentype, paper */

const cache = new Map();
let fontList = null;

export async function listFonts() {
  if (fontList) return fontList;
  try {
    fontList = window.api ? await window.api.listFonts() : [];
  } catch {
    fontList = [];
  }
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
  return fonts.length ? fonts[0].path : null;
}

/**
 * Build a CompoundPath for the given text spec.
 * spec: { content, font (path), size (mm, cap-ish height = font size), letterSpacing (mm), lineSpacing (×), align }
 */
export async function buildTextPath(spec, at) {
  const font = await loadFont(spec.font);
  const size = Math.max(0.5, +spec.size || 10);
  const lines = String(spec.content || '').split(/\r?\n/);
  const lineH = size * (spec.lineSpacing || 1.2);
  const tracking = +spec.letterSpacing || 0;
  const scale = size / font.unitsPerEm;
  const cp = new paper.CompoundPath({ insert: false });
  const lineWidths = [];
  const linePaths = [];

  lines.forEach((line, li) => {
    const glyphs = font.stringToGlyphs(line);
    let x = 0;
    const pathData = [];
    for (let i = 0; i < glyphs.length; i++) {
      const g = glyphs[i];
      const p = g.getPath(x, li * lineH, size);
      pathData.push(p.toPathData(3));
      x += g.advanceWidth * scale + tracking;
      if (i < glyphs.length - 1) x += font.getKerningValue(g, glyphs[i + 1]) * scale;
    }
    lineWidths.push(Math.max(0, x - tracking));
    linePaths.push(pathData.join(' '));
  });

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
  if (at) cp.bounds.topLeft = at;
  cp.data.text = { ...spec };
  return cp;
}
