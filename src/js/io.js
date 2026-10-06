// Import / export: SVG, DXF, bitmap images, Crafter Studio projects, G-code.
/* global paper, DxfParser */
import { state, bus, PALETTE, defaultLayer, setDirty } from './state.js';
import { ed, addItem, styleItem, pushHistory, resetHistory, clearSelection, restyleAll, drawWorkArea, fitWorkArea, select } from './editor.js';
import { loadImage, normalizeImage, processedCanvas, DEFAULT_ADJ } from './imageproc.js';
import { buildJob, emitGcode } from './gcode.js';
import { toast } from './ops.js';

const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp'];
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.bmp': 'image/bmp', '.gif': 'image/gif', '.webp': 'image/webp' };

// ------------------------------------------------------------------ file helpers
function browserPick(accept) {
  return new Promise(resolve => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = accept;
    inp.onchange = async () => {
      const f = inp.files[0];
      if (!f) return resolve(null);
      const ext = '.' + f.name.split('.').pop().toLowerCase();
      if (IMAGE_EXT.includes(ext)) {
        const buf = new Uint8Array(await f.arrayBuffer());
        let bin = '';
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
        resolve({ name: f.name, ext, base64: btoa(bin) });
      } else resolve({ name: f.name, ext, text: await f.text() });
    };
    inp.click();
  });
}

async function pickFile(filters) {
  if (window.api) return window.api.openFile({ filters });
  return browserPick(filters.flatMap(f => f.extensions.map(e => '.' + e)).join(','));
}

async function saveText(content, defaultName, filters, path) {
  if (window.api) return window.api.saveFile({ content, defaultName, filters, path });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
  a.download = defaultName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return { name: defaultName };
}

// ------------------------------------------------------------------ colour → layer
function nearestLayerId(color) {
  if (!color) return state.activeLayer;
  const c = color instanceof paper.Color ? color : new paper.Color(color);
  let best = 0, bd = Infinity;
  PALETTE.forEach((hex, i) => {
    const p = new paper.Color(hex);
    const d = (p.red - c.red) ** 2 + (p.green - c.green) ** 2 + (p.blue - c.blue) ** 2;
    if (d < bd) { bd = d; best = i; }
  });
  return state.layers[best].id;
}

function imageLayerId() {
  const active = state.layers.find(l => l.id === state.activeLayer);
  if (active && active.mode === 'image') return active.id;
  const used = new Set();
  ed.design.getItems({}).forEach(i => i.data && i.data.layer && used.add(i.data.layer));
  const existing = state.layers.find(l => l.mode === 'image' && used.has(l.id));
  if (existing) return existing.id;
  const free = state.layers.find(l => !used.has(l.id) && l.id !== 'L00') || state.layers[state.layers.length - 1];
  Object.assign(free, { mode: 'image', power: 50, speed: 3000, interval: 0.1, name: 'Image' });
  bus.emit('layers');
  return free.id;
}

function placeInWorkArea(item) {
  const W = state.device.workW, H = state.device.workH;
  const b = item.bounds;
  if (b.width > W || b.height > H) {
    const s = Math.min((W * 0.9) / b.width, (H * 0.9) / b.height);
    item.scale(s, b.topLeft);
    toast('Imported design was larger than the work area and has been scaled to fit.');
  }
  const nb = item.bounds;
  if (nb.left < 0 || nb.top < 0 || nb.right > W || nb.bottom > H) item.bounds.topLeft = new paper.Point(Math.max(0, (W - nb.width) / 2), Math.max(0, (H - nb.height) / 2));
}

// ------------------------------------------------------------------ SVG
const UNIT_MM = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96, '': 25.4 / 96 };

export function importSVG(text) {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg') throw new Error('Not a valid SVG file');
  const wAttr = root.getAttribute('width') || '';
  const unit = (wAttr.match(/[a-z%]+$/i) || [''])[0].toLowerCase();
  const factor = unit === '%' ? UNIT_MM.px : (UNIT_MM[unit] ?? UNIT_MM.px);

  const item = paper.project.importSVG(text, { insert: false, expandShapes: true, applyMatrix: true });
  let dropped = 0;
  // Remove clip masks, text and invisible helpers — they can't be lasered as-is.
  item.getItems({ match: i => i.clipMask || i.className === 'PointText' || i.className === 'SymbolItem' }).forEach(i => {
    if (i.className === 'PointText') dropped++;
    if (i.clipMask) { i.parent.clipped = false; }
    i.remove();
  });
  item.scale(factor, new paper.Point(0, 0));
  const leaves = item.getItems({ match: i => i.className === 'Path' || i.className === 'CompoundPath' || i.className === 'Raster' });
  const imgLayer = leaves.some(l => l.className === 'Raster') ? imageLayerId() : null;
  for (const leaf of leaves) {
    if (leaf.className === 'Raster') {
      leaf.data = { layer: imgLayer, src: leaf.source, adj: { ...DEFAULT_ADJ } };
      continue;
    }
    if (leaf.parent && leaf.parent.className === 'CompoundPath') continue;
    const col = leaf.strokeColor && leaf.strokeColor.alpha > 0 ? leaf.strokeColor : leaf.fillColor;
    leaf.data = { layer: nearestLayerId(col) };
  }
  // Strip empty groups
  item.getItems({ class: paper.Group }).forEach(g => { if (!g.children.length) g.remove(); });
  let result = item;
  if (item.className === 'Group' && item.children.length === 1) result = item.firstChild;
  if (!result.bounds || result.bounds.isEmpty()) throw new Error('The SVG contains no drawable geometry');
  placeInWorkArea(result);
  addItem(result, { record: true });
  restyleAll();
  if (dropped) toast(`${dropped} SVG text element(s) skipped — convert text to paths before exporting from your editor.`);
  return result;
}

// ------------------------------------------------------------------ DXF
function bulgePath(verts, closed) {
  const path = new paper.Path({ insert: false });
  path.moveTo(new paper.Point(verts[0].x, verts[0].y));
  const n = verts.length;
  const count = closed ? n : n - 1;
  for (let i = 0; i < count; i++) {
    const a = verts[i], b = verts[(i + 1) % n];
    const p2 = new paper.Point(b.x, b.y);
    if (a.bulge) {
      const p1 = new paper.Point(a.x, a.y);
      const chord = p2.subtract(p1);
      const len = chord.length;
      if (len > 1e-9) {
        const d = chord.divide(len);
        const through = p1.add(chord.divide(2)).add(new paper.Point(d.y, -d.x).multiply((a.bulge * len) / 2));
        path.arcTo(through, p2);
        continue;
      }
    }
    path.lineTo(p2);
  }
  if (closed) path.closePath();
  return path;
}

function deBoor(k, x, t, c, p) {
  const d = [];
  for (let j = 0; j <= p; j++) d[j] = { ...c[j + k - p] };
  for (let r = 1; r <= p; r++) {
    for (let j = p; j >= r; j--) {
      const denom = t[j + 1 + k - r] - t[j + k - p];
      const alpha = denom === 0 ? 0 : (x - t[j + k - p]) / denom;
      d[j] = { x: (1 - alpha) * d[j - 1].x + alpha * d[j].x, y: (1 - alpha) * d[j - 1].y + alpha * d[j].y };
    }
  }
  return d[p];
}

function splinePath(e) {
  const deg = e.degreeOfSplineCurve || 3;
  const cps = e.controlPoints || [];
  const knots = e.knotValues || [];
  if (cps.length > deg && knots.length === cps.length + deg + 1) {
    const pts = [];
    const lo = knots[deg], hi = knots[cps.length];
    const N = Math.max(24, cps.length * 12);
    for (let i = 0; i <= N; i++) {
      const x = lo + ((hi - lo) * i) / N;
      let k = deg;
      while (k < cps.length - 1 && x >= knots[k + 1]) k++;
      pts.push(deBoor(k, Math.min(x, hi - 1e-12), knots, cps, deg));
    }
    return new paper.Path({ segments: pts.map(p => [p.x, p.y]), closed: !!e.closed, insert: false });
  }
  const fit = e.fitPoints || cps;
  if (fit.length < 2) return null;
  const path = new paper.Path({ segments: fit.map(p => [p.x, p.y]), closed: !!e.closed, insert: false });
  path.smooth({ type: 'catmull-rom' });
  return path;
}

function dxfEntity(e, blocks, depth = 0) {
  switch (e.type) {
    case 'LINE':
      return new paper.Path.Line({ from: [e.vertices[0].x, e.vertices[0].y], to: [e.vertices[1].x, e.vertices[1].y], insert: false });
    case 'LWPOLYLINE':
    case 'POLYLINE': {
      const v = (e.vertices || []).filter(p => isFinite(p.x) && isFinite(p.y));
      if (v.length < 2) return null;
      return bulgePath(v, !!e.shape);
    }
    case 'CIRCLE':
      return new paper.Path.Circle({ center: [e.center.x, e.center.y], radius: e.radius, insert: false });
    case 'ARC': {
      let a0 = e.startAngle, a1 = e.endAngle;
      if (a1 <= a0) a1 += Math.PI * 2;
      const c = new paper.Point(e.center.x, e.center.y);
      const pt = a => c.add(new paper.Point(Math.cos(a), Math.sin(a)).multiply(e.radius));
      return new paper.Path.Arc({ from: pt(a0), through: pt((a0 + a1) / 2), to: pt(a1), insert: false });
    }
    case 'ELLIPSE': {
      const c = new paper.Point(e.center.x, e.center.y);
      const maj = new paper.Point(e.majorAxisEndPoint.x, e.majorAxisEndPoint.y);
      const min = new paper.Point(-maj.y, maj.x).multiply(e.axisRatio);
      let t0 = e.startAngle || 0, t1 = e.endAngle == null ? Math.PI * 2 : e.endAngle;
      if (t1 <= t0) t1 += Math.PI * 2;
      const full = Math.abs(t1 - t0 - Math.PI * 2) < 1e-6;
      const N = 96;
      const segs = [];
      for (let i = 0; i <= (full ? N - 1 : N); i++) {
        const t = t0 + ((t1 - t0) * i) / N;
        segs.push(c.add(maj.multiply(Math.cos(t))).add(min.multiply(Math.sin(t))));
      }
      const p = new paper.Path({ segments: segs, closed: full, insert: false });
      p.smooth({ type: 'catmull-rom' });
      return p;
    }
    case 'SPLINE':
      return splinePath(e);
    case 'SOLID':
    case '3DFACE': {
      const pts = (e.points || e.vertices || []).filter(Boolean);
      if (pts.length < 3) return null;
      return new paper.Path({ segments: pts.map(p => [p.x, p.y]), closed: true, insert: false });
    }
    case 'INSERT': {
      const blk = blocks && blocks[e.name];
      if (!blk || !blk.entities || depth > 8) return null;
      const g = new paper.Group({ insert: false });
      for (const be of blk.entities) {
        const it = dxfEntity(be, blocks, depth + 1);
        if (it) { it.data.dxfColor = be.color; g.addChild(it); }
      }
      const base = blk.position || { x: 0, y: 0 };
      g.translate(new paper.Point(-base.x, -base.y));
      g.scale(e.xScale || 1, e.yScale || 1, new paper.Point(0, 0));
      if (e.rotation) g.rotate(e.rotation, new paper.Point(0, 0));
      g.translate(new paper.Point(e.position.x, e.position.y));
      return g;
    }
    default:
      return null;
  }
}

export function importDXF(text) {
  const parser = new DxfParser();
  const dxf = parser.parseSync(text);
  if (!dxf || !dxf.entities) throw new Error('Could not parse DXF');
  const ins = dxf.header && dxf.header.$INSUNITS;
  const unit = { 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000 }[ins] || 1;
  const g = new paper.Group({ insert: false });
  let skipped = 0;
  for (const e of dxf.entities) {
    const it = dxfEntity(e, dxf.blocks);
    if (!it) { if (e.type === 'TEXT' || e.type === 'MTEXT') skipped++; continue; }
    it.data.dxfColor = e.color;
    g.addChild(it);
  }
  if (!g.children.length) throw new Error('No supported geometry in DXF (lines, polylines, arcs, circles, ellipses, splines, blocks).');
  g.scale(unit, -unit, new paper.Point(0, 0)); // DXF is Y-up
  g.getItems({ match: i => i.className === 'Path' || i.className === 'CompoundPath' }).forEach(p => {
    const rgb = p.data.dxfColor != null ? p.data.dxfColor : p.parent.data && p.parent.data.dxfColor;
    const col = rgb != null && rgb !== 0 ? '#' + (rgb >>> 0).toString(16).padStart(6, '0') : null;
    p.data = { layer: col && col !== '#ffffff' ? nearestLayerId(col) : state.activeLayer };
  });
  g.bounds.topLeft = new paper.Point(0, 0);
  placeInWorkArea(g);
  const result = g.children.length === 1 ? g.firstChild : g;
  if (result !== g) { result.remove(); }
  addItem(result);
  restyleAll();
  if (skipped) toast(`${skipped} DXF text entities skipped — explode text to geometry in your CAD program.`);
  return result;
}

// ------------------------------------------------------------------ images
export async function importImage(dataURL, at) {
  const img = await loadImage(dataURL);
  const src = normalizeImage(img, 2400);
  const adj = { ...DEFAULT_ADJ };
  // Raster(canvas) sizes synchronously; the {source} form reports 0×0 until later.
  const raster = new paper.Raster(processedCanvas(src, adj));
  raster.remove();
  const W = state.device.workW, H = state.device.workH;
  const longMm = Math.min(100, Math.min(W, H) * 0.8);
  const s = longMm / Math.max(src.width, src.height);
  raster.scale(s);
  raster.data = { src: src.toDataURL('image/png'), adj, layer: imageLayerId() };
  raster.position = at || new paper.Point(W / 2, H / 2);
  addItem(raster, { layer: raster.data.layer });
  return raster;
}

const srcCanvasCache = new Map();
export async function refreshRaster(raster) {
  const url = raster.data.src;
  if (!url) return;
  let src = srcCanvasCache.get(url);
  if (!src) {
    src = normalizeImage(await loadImage(url), 1e6);
    srcCanvasCache.set(url, src);
  }
  const out = processedCanvas(src, { ...DEFAULT_ADJ, ...raster.data.adj });
  raster.setImage(out);
  paper.view.requestUpdate();
}

// ------------------------------------------------------------------ import entry
export async function importFile() {
  const f = await pickFile([
    { name: 'All supported', extensions: ['svg', 'dxf', 'png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp'] },
    { name: 'Vector (SVG, DXF)', extensions: ['svg', 'dxf'] },
    { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp'] }
  ]);
  if (!f) return;
  await importLoaded(f);
}

export async function importLoaded(f) {
  try {
    if (f.ext === '.svg') importSVG(f.text);
    else if (f.ext === '.dxf') importDXF(f.text);
    else if (IMAGE_EXT.includes(f.ext)) await importImage(`data:${MIME[f.ext]};base64,${f.base64}`);
    else if (f.ext === '.crafter') await loadProjectText(f.text, f);
    else throw new Error('Unsupported file type ' + f.ext);
    toast(`Imported ${f.name}`);
  } catch (e) {
    toast(`Import failed: ${e.message}`, 'err');
    console.error(e);
  }
}

// ------------------------------------------------------------------ projects
export function projectJSON() {
  return JSON.stringify({
    app: 'crafter',
    version: 1,
    device: state.device,
    layers: state.layers,
    design: ed.design.exportJSON({ asString: false })
  });
}

export async function newProject() {
  if (state.dirty && !(await confirmDiscard())) return;
  clearSelection();
  ed.design.removeChildren();
  state.layers = PALETTE.map((c, i) => defaultLayer(i));
  state.activeLayer = 'L00';
  state.filePath = null;
  state.fileName = 'Untitled';
  resetHistory();
  setDirty(false);
  bus.emit('layers');
  bus.emit('changed');
}

async function confirmDiscard() {
  if (window.api) {
    const r = await window.api.confirm({ type: 'warning', message: 'Discard unsaved changes?', buttons: ['Discard', 'Cancel'] });
    return r === 0;
  }
  return window.confirm('Discard unsaved changes?');
}

export async function openProject() {
  if (state.dirty && !(await confirmDiscard())) return;
  const f = await pickFile([{ name: 'Crafter Studio project', extensions: ['crafter'] }]);
  if (!f) return;
  await loadProjectText(f.text, f);
}

async function loadProjectText(text, f) {
  const p = JSON.parse(text);
  if (p.app !== 'crafter') throw new Error('Not a Crafter Studio project');
  clearSelection();
  if (p.device) {
    state.device = { ...state.device, ...p.device };
    drawWorkArea();
    fitWorkArea();
    bus.emit('device');
  }
  if (Array.isArray(p.layers)) {
    state.layers = PALETTE.map((c, i) => ({ ...defaultLayer(i), ...(p.layers[i] || {}), color: c }));
  }
  ed.design.removeChildren();
  ed.design.importJSON(p.design);
  ed.design.name = 'design';
  restyleAll();
  state.filePath = f.path || null;
  state.fileName = f.name || 'Project';
  resetHistory();
  setDirty(false);
  bus.emit('layers');
  bus.emit('changed');
}

export async function saveProject(saveAs = false) {
  const r = await saveText(projectJSON(), (state.fileName.replace(/\.crafter$/i, '') || 'project') + '.crafter',
    [{ name: 'Crafter Studio project', extensions: ['crafter'] }], saveAs ? undefined : state.filePath || undefined);
  if (!r) return;
  state.filePath = r.path || null;
  state.fileName = r.name;
  setDirty(false);
  toast(`Saved ${r.name}`);
}

// ------------------------------------------------------------------ export
export async function exportGcode() {
  const ctl = state.device.controller;
  if (['ruida', 'trocen', 'topwisdom', 'm2nano', 'ezcad', 'proprietary'].includes(ctl)) {
    toast('This machine does not accept G-code. Export SVG and open it in the machine\'s own software.', 'err');
    return;
  }
  const job = await buildJob();
  if (!job.buf.n) return toast('Nothing to output — add objects to an enabled layer.');
  job.warnings.forEach(w => toast(w, 'warn'));
  const g = emitGcode(job);
  await saveText(g, (state.fileName.replace(/\.crafter$/i, '') || 'job') + '.gcode', [{ name: 'G-code', extensions: ['gcode', 'nc', 'gc'] }]);
}

export async function exportSVG() {
  const { workW: W, workH: H } = state.device;
  const clone = ed.design.clone({ insert: false });
  clone.getItems({ match: i => i.className === 'Path' || i.className === 'CompoundPath' }).forEach(p => {
    if (p.parent && p.parent.className === 'CompoundPath') return;
    const layer = state.layers.find(l => l.id === p.data.layer) || state.layers[0];
    p.strokeScaling = true;
    p.strokeWidth = 0.1;
    p.strokeColor = layer.color;
    p.fillColor = layer.mode === 'line' ? null : layer.color;
  });
  const body = clone.exportSVG({ asString: true });
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">\n${body}\n</svg>\n`;
  await saveText(svg, (state.fileName.replace(/\.crafter$/i, '') || 'design') + '.svg', [{ name: 'SVG', extensions: ['svg'] }]);
}

// Other modules (e.g. the asset library) can claim drops; a hook returns true when handled.
export const dropHooks = [];

// Drag & drop from the OS and from the library panel
export function enableDrop(el) {
  el.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  el.addEventListener('drop', async e => {
    e.preventDefault();
    for (const hook of dropHooks) if (await hook(e)) return;
    for (const file of e.dataTransfer.files) {
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      if (IMAGE_EXT.includes(ext)) {
        const url = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file); });
        try { await importImage(url); toast(`Imported ${file.name}`); } catch (err) { toast(err.message, 'err'); }
      } else {
        await importLoaded({ name: file.name, ext, text: await file.text(), path: file.path });
      }
    }
  });
}

export { select };
