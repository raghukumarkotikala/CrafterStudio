// Object operations: clipboard, grouping, booleans, align/distribute, transform, arrays, offset, trace.
/* global paper, PaperOffset, ImageTracer */
import { state, bus } from './state.js';
import { ed, select, clearSelection, selectionBounds, pushHistory, updateSelectionBox, styleItem, addItem, setItemLayer } from './editor.js';
import { loadImage } from './imageproc.js';

let clipboard = [];
let pasteCount = 0;

const sel = () => state.selection.filter(i => i.parent);
const byZ = items => items.slice().sort((a, b) => a.index - b.index);

function cloneItem(it) {
  const c = it.clone({ insert: false });
  c.data = JSON.parse(JSON.stringify(it.data || {}));
  return c;
}

export function toast(msg, kind = 'info') { bus.emit('toast', msg, kind); }

// ------------------------------------------------------------------ edit
export function copy() {
  const s = byZ(sel());
  if (!s.length) return;
  clipboard = s.map(i => i.exportJSON());
  pasteCount = 0;
}

export function cut() {
  copy();
  del();
}

export function paste() {
  if (!clipboard.length) return;
  pasteCount++;
  const items = clipboard.map(j => {
    const it = paper.project.importJSON(j);
    it.remove();
    ed.design.addChild(it);
    it.translate(new paper.Point(5 * pasteCount, 5 * pasteCount));
    styleItem(it);
    return it;
  });
  select(items);
  pushHistory();
}

export function duplicate() {
  const s = byZ(sel());
  if (!s.length) return;
  const copies = s.map(it => {
    const c = cloneItem(it);
    ed.design.addChild(c);
    c.translate(new paper.Point(5, 5));
    return c;
  });
  select(copies);
  pushHistory();
}

export function del() {
  const s = sel();
  if (!s.length) return;
  s.forEach(i => i.remove());
  clearSelection();
  pushHistory();
}

export function selectAll() {
  select(ed.design.children.filter(c => c.visible));
}

// ------------------------------------------------------------------ grouping
export function group() {
  const s = byZ(sel());
  if (s.length < 2) return;
  const g = new paper.Group();
  ed.design.insertChild(s[s.length - 1].index + 1, g);
  g.addChildren(s);
  select(g);
  pushHistory();
}

export function ungroup() {
  const out = [];
  let changed = false;
  for (const it of sel()) {
    if (it.className === 'Group') {
      const kids = it.children.slice();
      it.parent.insertChildren(it.index, kids);
      it.remove();
      out.push(...kids);
      changed = true;
    } else out.push(it);
  }
  if (!changed) return;
  select(out);
  pushHistory();
}

function pathItems(items) {
  const out = [];
  const walk = it => {
    if (it.className === 'Group') it.children.forEach(walk);
    else if (it.className === 'Path' || it.className === 'CompoundPath') out.push(it);
  };
  items.forEach(walk);
  return out;
}

export function combine() {
  const s = byZ(sel());
  const paths = pathItems(s);
  if (paths.length < 2) return toast('Select two or more paths to combine.');
  const layer = paths[0].data.layer;
  const cp = new paper.CompoundPath({ insert: false });
  for (const p of paths) {
    const c = p.clone({ insert: false });
    c.transform(p.parent.globalMatrix);
    if (c.className === 'CompoundPath') cp.addChildren(c.removeChildren());
    else cp.addChild(c);
  }
  const idx = s[s.length - 1].index;
  s.forEach(i => i.remove());
  ed.design.insertChild(Math.min(idx, ed.design.children.length), cp);
  cp.data.layer = layer;
  styleItem(cp);
  select(cp);
  pushHistory();
}

export function breakApart() {
  const out = [];
  let changed = false;
  for (const it of sel()) {
    if (it.className === 'CompoundPath') {
      const kids = it.removeChildren();
      const idx = it.index;
      kids.forEach(k => { k.data = { layer: it.data.layer }; });
      ed.design.insertChildren(idx, kids);
      it.remove();
      kids.forEach(styleItem);
      out.push(...kids);
      changed = true;
    } else out.push(it);
  }
  if (!changed) return toast('Break Apart works on combined paths or text.');
  select(out);
  pushHistory();
}

// ------------------------------------------------------------------ booleans
function asPath(it) {
  if (it.className === 'Path' || it.className === 'CompoundPath') {
    const c = it.clone({ insert: false });
    return c;
  }
  if (it.className === 'Group') {
    const parts = pathItems([it]).map(p => { const c = p.clone({ insert: false }); c.transform(p.parent.globalMatrix); return c; });
    if (!parts.length) return null;
    return parts.reduce((a, b) => a.unite(b, { insert: false }));
  }
  return null;
}

export function boolean(op) {
  const s = byZ(sel());
  if (s.length < 2 && op !== 'unite') return toast('Select at least two shapes.');
  if (s.length < 2) return toast('Select at least two shapes.');
  const paths = s.map(asPath);
  if (paths.some(p => !p)) return toast('Boolean operations need vector shapes (not images).');
  const layer = s[0].data.layer || (s[0].children && s[0].children[0] && s[0].children[0].data.layer);
  let result;
  try {
    if (op === 'subtract') {
      result = paths[0];
      for (let i = 1; i < paths.length; i++) result = result.subtract(paths[i], { insert: false });
    } else if (op === 'divide') {
      result = paths[0].divide(paths[1], { insert: false });
      const pieces = [result];
      const rest = paths[1].subtract(paths[0], { insert: false });
      pieces.push(rest);
      result = pieces;
    } else {
      result = paths.reduce((a, b) => a[op](b, { insert: false }));
    }
  } catch (e) {
    return toast('Boolean operation failed: ' + e.message, 'err');
  }
  const idx = s[0].index;
  s.forEach(i => i.remove());
  const outs = (Array.isArray(result) ? result : [result]).filter(r => r && !r.isEmpty());
  outs.forEach((r, i) => {
    ed.design.insertChild(Math.min(idx + i, ed.design.children.length), r);
    r.data = { layer };
    styleItem(r);
  });
  select(outs);
  pushHistory();
}

export function offsetPath(distance, keepOriginal = true, join = 'round') {
  const paths = pathItems(sel());
  if (!paths.length) return toast('Select a path to offset.');
  const made = [];
  for (const p of paths) {
    try {
      const src = p.clone({ insert: false });
      src.transform(p.parent.globalMatrix);
      let r;
      if (src.closed || src.className === 'CompoundPath') r = PaperOffset.offset(src, distance, { join, insert: false });
      else r = PaperOffset.offsetStroke(src, Math.abs(distance), { join, cap: 'round', insert: false });
      if (!r || r.isEmpty()) continue;
      ed.design.addChild(r);
      r.data = { layer: p.data.layer };
      styleItem(r);
      made.push(r);
    } catch (e) {
      toast('Offset failed: ' + e.message, 'err');
    }
  }
  if (!keepOriginal) sel().forEach(i => i.remove());
  if (made.length) select(made);
  pushHistory();
}

// ------------------------------------------------------------------ transform
export function flip(horizontal) {
  const b = selectionBounds();
  if (!b) return;
  sel().forEach(i => i.scale(horizontal ? -1 : 1, horizontal ? 1 : -1, b.center));
  updateSelectionBox();
  pushHistory();
}

export function rotate(deg) {
  const b = selectionBounds();
  if (!b) return;
  sel().forEach(i => i.rotate(deg, b.center));
  updateSelectionBox();
  pushHistory();
}

export function arrange(how) {
  const s = byZ(sel());
  if (!s.length) return;
  if (how === 'front') s.forEach(i => ed.design.addChild(i));
  else if (how === 'back') s.slice().reverse().forEach(i => ed.design.insertChild(0, i));
  else if (how === 'raise') s.slice().reverse().forEach(i => { const n = i.nextSibling; if (n && !s.includes(n)) i.insertAbove(n); });
  else if (how === 'lower') s.forEach(i => { const p = i.previousSibling; if (p && !s.includes(p)) i.insertBelow(p); });
  pushHistory();
}

export function align(how) {
  const s = sel();
  if (!s.length) return;
  const toWork = state.prefs.alignTo === 'workarea' || s.length === 1;
  const ref = toWork ? new paper.Rectangle(0, 0, state.device.workW, state.device.workH) : selectionBounds();
  for (const it of s) {
    const b = it.bounds;
    let dx = 0, dy = 0;
    if (how === 'left') dx = ref.left - b.left;
    if (how === 'hcenter') dx = ref.center.x - b.center.x;
    if (how === 'right') dx = ref.right - b.right;
    if (how === 'top') dy = ref.top - b.top;
    if (how === 'vcenter') dy = ref.center.y - b.center.y;
    if (how === 'bottom') dy = ref.bottom - b.bottom;
    it.translate(new paper.Point(dx, dy));
  }
  updateSelectionBox();
  pushHistory();
}

export function distribute(horizontal) {
  const s = sel();
  if (s.length < 3) return toast('Select three or more objects to distribute.');
  const key = horizontal ? 'x' : 'y';
  const size = horizontal ? 'width' : 'height';
  const sorted = s.slice().sort((a, b) => a.bounds[key] - b.bounds[key]);
  const first = sorted[0].bounds, last = sorted[sorted.length - 1].bounds;
  const total = sorted.reduce((t, i) => t + i.bounds[size], 0);
  const span = last[key] + last[size] - first[key];
  const gap = (span - total) / (sorted.length - 1);
  let pos = first[key] + first[size] + gap;
  for (let i = 1; i < sorted.length - 1; i++) {
    const b = sorted[i].bounds;
    sorted[i].translate(horizontal ? new paper.Point(pos - b.x, 0) : new paper.Point(0, pos - b.y));
    pos += b[size] + gap;
  }
  updateSelectionBox();
  pushHistory();
}

export function centerInWorkArea() {
  const b = selectionBounds();
  if (!b) return;
  const d = new paper.Point(state.device.workW / 2, state.device.workH / 2).subtract(b.center);
  sel().forEach(i => i.translate(d));
  updateSelectionBox();
  pushHistory();
}

/** Set position/size of the selection from the properties panel. */
export function setSelectionGeometry({ x, y, w, h, rotation, lock }) {
  const b = selectionBounds();
  if (!b) return;
  const items = sel();
  if (rotation != null && items.length === 1) {
    const it = items[0];
    const cur = it.data.rotation || 0;
    it.rotate(rotation - cur, it.bounds.center);
    it.data.rotation = rotation;
  }
  if (w != null || h != null) {
    let sx = w != null && b.width > 0 ? w / b.width : 1;
    let sy = h != null && b.height > 0 ? h / b.height : 1;
    if (lock) { if (w != null) sy = sx; else sx = sy; }
    items.forEach(i => i.scale(sx, sy, b.topLeft));
  }
  const nb = selectionBounds();
  const dx = x != null ? x - nb.x : 0;
  const dy = y != null ? y - nb.y : 0;
  if (dx || dy) items.forEach(i => i.translate(new paper.Point(dx, dy)));
  updateSelectionBox();
  pushHistory();
}

// ------------------------------------------------------------------ arrays
export function gridArray(rows, cols, gapX, gapY) {
  const s = byZ(sel());
  const b = selectionBounds();
  if (!b) return;
  const made = [...s];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!r && !c) continue;
      for (const it of s) {
        const cl = cloneItem(it);
        ed.design.addChild(cl);
        cl.translate(new paper.Point(c * (b.width + gapX), r * (b.height + gapY)));
        made.push(cl);
      }
    }
  }
  select(made);
  pushHistory();
}

export function circularArray(count, radius, rotateCopies = true) {
  const s = byZ(sel());
  const b = selectionBounds();
  if (!b || count < 2) return;
  const center = b.center.add(new paper.Point(0, radius));
  const made = [...s];
  for (let i = 1; i < count; i++) {
    const ang = (360 / count) * i;
    for (const it of s) {
      const cl = cloneItem(it);
      ed.design.addChild(cl);
      if (rotateCopies) cl.rotate(ang, center);
      else {
        const p = b.center.rotate(ang, center);
        cl.translate(p.subtract(b.center));
      }
      made.push(cl);
    }
  }
  select(made);
  pushHistory();
}

export function assignLayer(layerId) {
  const s = sel();
  state.activeLayer = layerId;
  if (!s.length) { bus.emit('layers'); return; }
  s.forEach(i => setItemLayer(i, layerId));
  pushHistory();
  bus.emit('layers');
}

export function convertToPath() {
  let n = 0;
  sel().forEach(i => { if (i.data && i.data.text) { delete i.data.text; n++; } });
  if (n) { pushHistory(); bus.emit('selection'); toast(`${n} text object(s) converted to plain paths.`); }
}

// ------------------------------------------------------------------ trace
export async function traceImage(raster, { threshold = 128, detail = 1, removeBg = true, invert = false } = {}) {
  // Trace the original (unprocessed) image, not the dithered preview.
  const cv = document.createElement('canvas');
  cv.width = raster.width;
  cv.height = raster.height;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, cv.width, cv.height);
  const srcImg = await loadImage(raster.data.src || raster.source);
  ctx.drawImage(srcImg, 0, 0, cv.width, cv.height);
  const img = ctx.getImageData(0, 0, cv.width, cv.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255;
    let v = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) * a + 255 * (1 - a);
    let on = v < threshold;
    if (invert) on = !on;
    const o = on ? 0 : 255;
    d[i] = d[i + 1] = d[i + 2] = o;
    d[i + 3] = 255;
  }
  const svg = ImageTracer.imagedataToSVG(img, {
    ltres: detail, qtres: detail, pathomit: 8, rightangleenhance: true,
    colorsampling: 0, numberofcolors: 2, mincolorratio: 0, colorquantcycles: 1,
    pal: [{ r: 0, g: 0, b: 0, a: 255 }, { r: 255, g: 255, b: 255, a: 255 }],
    strokewidth: 0, linefilter: false, scale: 1, roundcoords: 2, viewbox: true, desc: false
  });
  const imported = paper.project.importSVG(svg, { insert: false, expandShapes: true });
  const paths = [];
  imported.getItems({ class: paper.Path }).concat(imported.getItems({ class: paper.CompoundPath })).forEach(p => {
    const fc = p.fillColor;
    const isBlack = fc && fc.red < 0.5;
    if (removeBg && !isBlack) return;
    if (p.parent && p.parent.className === 'CompoundPath') return;
    paths.push(p);
  });
  if (!paths.length) { toast('Nothing found to trace — adjust the threshold.'); return; }
  const cp = new paper.CompoundPath({ insert: false });
  for (const p of paths) {
    const c = p.clone({ insert: false });
    if (c.className === 'CompoundPath') cp.addChildren(c.removeChildren()); else cp.addChild(c);
  }
  // Map traced pixel coordinates onto the raster's placement.
  const m = raster.globalMatrix.clone().translate(-raster.width / 2, -raster.height / 2);
  cp.transform(m);
  cp.fillColor = null;
  addItem(cp, { layer: state.activeLayer });
  toast(`Traced ${cp.children.length} contour(s).`);
}
