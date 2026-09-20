// Canvas editor core: paper.js setup, work area, view control, rulers,
// styling, selection + transform box and undo history.
import { state, bus, getLayer, setDirty } from './state.js';

/* global paper */
export const ed = {
  bg: null,
  design: null,
  overlay: null,
  selBox: null,
  canvas: null
};

const HANDLE_PX = 8;

export function initEditor(canvas, rulerTop, rulerLeft) {
  ed.canvas = canvas;
  ed.rulerTop = rulerTop;
  ed.rulerLeft = rulerLeft;
  paper.setup(canvas);
  paper.settings.handleSize = 7;
  paper.settings.hitTolerance = 0;
  ed.bg = new paper.Layer({ name: 'bg' });
  ed.design = new paper.Layer({ name: 'design' });
  ed.overlay = new paper.Layer({ name: 'overlay' });
  ed.design.activate();

  const wrap = canvas.parentElement;
  const ro = new ResizeObserver(() => {
    const r = wrap.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    paper.view.viewSize = new paper.Size(Math.floor(r.width), Math.floor(r.height));
    drawRulers();
    bus.emit('view');
  });
  ro.observe(wrap);

  drawWorkArea();
  fitWorkArea();
  resetHistory();
}

// ---------------------------------------------------------------- work area
export function drawWorkArea() {
  const { workW: W, workH: H, origin } = state.device;
  ed.bg.removeChildren();
  ed.bg.activate();
  const shadow = new paper.Path.Rectangle({ rectangle: [2, 2, W, H], fillColor: 'rgba(0,0,0,0.35)' });
  shadow.data.bg = true;
  new paper.Path.Rectangle({ rectangle: [0, 0, W, H], fillColor: '#fbfbfb' });
  const step = state.prefs.gridStep || 10;
  const grid = new paper.Group();
  for (let x = step; x < W; x += step) {
    const major = Math.round(x / step) % 5 === 0;
    grid.addChild(new paper.Path.Line({ from: [x, 0], to: [x, H], strokeColor: major ? '#d3d7de' : '#eceef1', strokeWidth: 1, strokeScaling: false }));
  }
  for (let y = step; y < H; y += step) {
    const major = Math.round(y / step) % 5 === 0;
    grid.addChild(new paper.Path.Line({ from: [0, y], to: [W, y], strokeColor: major ? '#d3d7de' : '#eceef1', strokeWidth: 1, strokeScaling: false }));
  }
  new paper.Path.Rectangle({ rectangle: [0, 0, W, H], strokeColor: '#8a93a3', strokeWidth: 1, strokeScaling: false });

  // Machine origin marker
  const ox = origin.includes('r') ? W : 0;
  const oy = origin.includes('b') ? H : 0;
  const sx = ox === 0 ? 1 : -1;
  const sy = oy === 0 ? 1 : -1;
  const L = Math.min(W, H) * 0.06;
  new paper.Path({ segments: [[ox, oy + sy * L], [ox, oy], [ox + sx * L, oy]], strokeColor: '#e0304a', strokeWidth: 3, strokeScaling: false });
  new paper.Path.Circle({ center: [ox, oy], radius: Math.max(1, L * 0.12), fillColor: '#e0304a' });
  ed.design.activate();
  paper.view.requestUpdate();
}

// ---------------------------------------------------------------- view
export function zoomAt(factor, viewPoint) {
  const v = paper.view;
  const newZoom = Math.min(400, Math.max(0.05, v.zoom * factor));
  const vp = viewPoint || new paper.Point(v.viewSize.width / 2, v.viewSize.height / 2);
  const before = v.viewToProject(vp);
  v.zoom = newZoom;
  const after = v.viewToProject(vp);
  v.center = v.center.add(before.subtract(after));
  viewChanged();
}

export function panBy(dxPx, dyPx) {
  const v = paper.view;
  v.center = v.center.add(new paper.Point(-dxPx / v.zoom, -dyPx / v.zoom));
  viewChanged();
}

export function fitRect(rect, margin = 40) {
  const v = paper.view;
  if (!rect || rect.width <= 0 && rect.height <= 0) return;
  const w = Math.max(rect.width, 1), h = Math.max(rect.height, 1);
  const z = Math.min((v.viewSize.width - margin * 2) / w, (v.viewSize.height - margin * 2) / h);
  v.zoom = Math.min(400, Math.max(0.05, z));
  v.center = rect.center;
  viewChanged();
}

export function fitWorkArea() {
  fitRect(new paper.Rectangle(0, 0, state.device.workW, state.device.workH));
}

export function fitSelection() {
  const b = selectionBounds();
  if (b) fitRect(b, 80);
}

export function viewChanged() {
  updateSelectionBox();
  drawRulers();
  bus.emit('view');
}

function niceStep(minMm) {
  const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  return steps.find(s => s >= minMm) || 1000;
}

export function drawRulers() {
  const v = paper.view;
  const dpr = window.devicePixelRatio || 1;
  const cs = getComputedStyle(document.documentElement);
  const bgc = cs.getPropertyValue('--ruler-bg').trim() || '#20242b';
  const fgc = cs.getPropertyValue('--ruler-fg').trim() || '#8b93a1';
  for (const [cv, horizontal] of [[ed.rulerTop, true], [ed.rulerLeft, false]]) {
    if (!cv) continue;
    const rect = cv.getBoundingClientRect();
    cv.width = Math.max(1, rect.width * dpr);
    cv.height = Math.max(1, rect.height * dpr);
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = bgc;
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.strokeStyle = fgc;
    ctx.fillStyle = fgc;
    ctx.font = '10px system-ui, sans-serif';
    ctx.lineWidth = 1;
    const major = niceStep(60 / v.zoom);
    const minor = major / 5;
    const len = horizontal ? rect.width : rect.height;
    const startMm = horizontal ? v.viewToProject(new paper.Point(0, 0)).x : v.viewToProject(new paper.Point(0, 0)).y;
    const endMm = horizontal ? v.viewToProject(new paper.Point(len, 0)).x : v.viewToProject(new paper.Point(0, len)).y;
    const first = Math.floor(startMm / minor) * minor;
    ctx.beginPath();
    for (let mm = first; mm <= endMm; mm += minor) {
      const px = horizontal ? v.projectToView(new paper.Point(mm, 0)).x : v.projectToView(new paper.Point(0, mm)).y;
      const isMajor = Math.abs(mm / major - Math.round(mm / major)) < 1e-6;
      const t = isMajor ? 10 : 4;
      const pp = Math.round(px) + 0.5;
      if (horizontal) { ctx.moveTo(pp, rect.height); ctx.lineTo(pp, rect.height - t); } else { ctx.moveTo(rect.width, pp); ctx.lineTo(rect.width - t, pp); }
      if (isMajor) {
        const label = String(+mm.toFixed(2));
        if (horizontal) ctx.fillText(label, pp + 3, 10);
        else {
          ctx.save();
          ctx.translate(10, pp - 3);
          ctx.rotate(-Math.PI / 2);
          ctx.fillText(label, 0, 0);
          ctx.restore();
        }
      }
    }
    ctx.stroke();
    if (ed.cursor) {
      const cp = v.projectToView(ed.cursor);
      ctx.strokeStyle = '#3d8bfd';
      ctx.beginPath();
      if (horizontal) { ctx.moveTo(cp.x, 0); ctx.lineTo(cp.x, rect.height); } else { ctx.moveTo(0, cp.y); ctx.lineTo(rect.width, cp.y); }
      ctx.stroke();
    }
  }
}

export function snap(p) {
  if (!state.prefs.snap) return p;
  const s = state.prefs.snapStep || 1;
  return new paper.Point(Math.round(p.x / s) * s, Math.round(p.y / s) * s);
}

// ---------------------------------------------------------------- styling
function hexToRgba(hex, a) {
  const c = new paper.Color(hex);
  c.alpha = a;
  return c;
}

export function isClosedItem(item) {
  if (item.className === 'Path') return item.closed;
  if (item.className === 'CompoundPath') return item.children.length > 0 && item.children.every(c => c.closed);
  return false;
}

export function styleItem(item) {
  if (item.className === 'Group' || item.className === 'Layer') {
    item.children.forEach(styleItem);
    return;
  }
  const layer = getLayer(item.data.layer);
  if (!item.data.layer) item.data.layer = layer.id;
  item.visible = layer.visible;
  if (item.className === 'Raster') return;
  if (item.className === 'PointText' || item.className === 'Shape') return;
  const closed = isClosedItem(item);
  item.strokeColor = layer.color;
  item.strokeWidth = 1.2;
  item.strokeScaling = false;
  item.dashArray = null;
  item.fillRule = 'evenodd';
  if (closed) item.fillColor = layer.mode === 'line' ? hexToRgba(layer.color, 0.0001) : hexToRgba(layer.color, 0.28);
  else item.fillColor = null;
}

export function restyleAll() {
  ed.design.children.forEach(styleItem);
  paper.view.requestUpdate();
}

export function setItemLayer(item, layerId) {
  if (item.className === 'Group') item.children.forEach(c => setItemLayer(c, layerId));
  item.data.layer = layerId;
  styleItem(item);
}

// Which layers are in use (in document order).
export function usedLayerIds() {
  const used = new Set();
  const walk = it => {
    if (it.className === 'Group') it.children.forEach(walk);
    else if (it.data && it.data.layer) used.add(it.data.layer);
  };
  ed.design.children.forEach(walk);
  return used;
}

// ---------------------------------------------------------------- selection
export function topLevel(item) {
  let it = item;
  while (it && it.parent && it.parent !== ed.design) it = it.parent;
  return it && it.parent === ed.design ? it : null;
}

export function hitDesign(point) {
  const tol = 5 / paper.view.zoom;
  let hit = ed.design.hitTest(point, { stroke: true, segments: true, curves: true, tolerance: tol, fill: false });
  if (!hit) hit = ed.design.hitTest(point, { fill: true, tolerance: tol });
  if (hit && hit.item) return { top: topLevel(hit.item), item: hit.item };
  // Rasters and anything whose bounds contain the point
  const cands = ed.design.children.filter(c => c.visible && c.bounds.contains(point) && c.className === 'Raster');
  if (cands.length) return { top: cands[cands.length - 1], item: cands[cands.length - 1] };
  return null;
}

export function select(items, additive = false) {
  const list = (Array.isArray(items) ? items : [items]).filter(Boolean);
  if (additive) {
    for (const it of list) {
      const idx = state.selection.indexOf(it);
      if (idx >= 0) state.selection.splice(idx, 1);
      else state.selection.push(it);
    }
  } else {
    state.selection = list;
  }
  updateSelectionBox();
  bus.emit('selection');
}

export function clearSelection() {
  if (!state.selection.length && !ed.nodePath) return;
  state.selection = [];
  updateSelectionBox();
  bus.emit('selection');
}

export function selectionBounds(items = state.selection) {
  const live = items.filter(i => i.parent);
  if (!live.length) return null;
  let b = live[0].bounds.clone();
  for (let i = 1; i < live.length; i++) b = b.unite(live[i].bounds);
  return b;
}

export function updateSelectionBox() {
  if (ed.selBox) { ed.selBox.remove(); ed.selBox = null; }
  state.selection = state.selection.filter(i => i.parent);
  const b = selectionBounds();
  if (!b || state.tool === 'node') { paper.view.requestUpdate(); return; }
  ed.overlay.activate();
  const z = paper.view.zoom;
  const hs = HANDLE_PX / z;
  const g = new paper.Group();
  g.addChild(new paper.Path.Rectangle({ rectangle: b, strokeColor: '#3d8bfd', strokeWidth: 1, strokeScaling: false, dashArray: [4, 3] }));
  const pts = {
    nw: b.topLeft, n: b.topCenter, ne: b.topRight, e: b.rightCenter,
    se: b.bottomRight, s: b.bottomCenter, sw: b.bottomLeft, w: b.leftCenter
  };
  for (const [k, p] of Object.entries(pts)) {
    const h = new paper.Path.Rectangle({ point: p.subtract(hs / 2), size: [hs, hs], fillColor: '#ffffff', strokeColor: '#3d8bfd', strokeWidth: 1.2, strokeScaling: false });
    h.data.handle = k;
    g.addChild(h);
  }
  const rp = b.topCenter.subtract(new paper.Point(0, 22 / z));
  g.addChild(new paper.Path.Line({ from: b.topCenter, to: rp, strokeColor: '#3d8bfd', strokeWidth: 1, strokeScaling: false }));
  const rot = new paper.Path.Circle({ center: rp, radius: hs * 0.65, fillColor: '#3d8bfd', strokeColor: '#ffffff', strokeWidth: 1.2, strokeScaling: false });
  rot.data.handle = 'rot';
  g.addChild(rot);
  ed.selBox = g;
  ed.design.activate();
  paper.view.requestUpdate();
}

export function hitHandle(point) {
  if (!ed.selBox) return null;
  const tol = 3 / paper.view.zoom;
  const hit = ed.selBox.hitTest(point, { fill: true, stroke: true, tolerance: tol, match: h => h.item.data && h.item.data.handle });
  return hit ? hit.item.data.handle : null;
}

// ---------------------------------------------------------------- history
const history = { stack: [], index: -1 };

export function resetHistory() {
  history.stack = [ed.design.exportJSON()];
  history.index = 0;
  bus.emit('history');
}

export function pushHistory() {
  history.stack = history.stack.slice(0, history.index + 1);
  history.stack.push(ed.design.exportJSON());
  if (history.stack.length > 60) history.stack.shift();
  history.index = history.stack.length - 1;
  setDirty(true);
  bus.emit('history');
  bus.emit('changed');
}

function restore(json) {
  state.selection = [];
  ed.design.removeChildren();
  ed.design.importJSON(json);
  ed.design.name = 'design';
  restyleAll();
  updateSelectionBox();
  bus.emit('selection');
  bus.emit('changed');
  setDirty(true);
}

export function undo() {
  if (history.index <= 0) return;
  history.index--;
  restore(history.stack[history.index]);
  bus.emit('history');
}

export function redo() {
  if (history.index >= history.stack.length - 1) return;
  history.index++;
  restore(history.stack[history.index]);
  bus.emit('history');
}

export function canUndo() { return history.index > 0; }
export function canRedo() { return history.index < history.stack.length - 1; }

// Paths whose last point coincides with the first (fonts, SVG/DXF exports) are closed shapes.
export function normalizeClosed(item) {
  const paths = item.className === 'Path' ? [item] : item.getItems ? item.getItems({ class: paper.Path }) : [];
  for (const p of paths) {
    if (p.closed || p.segments.length < 3) continue;
    const a = p.firstSegment, z = p.lastSegment;
    if (a.point.getDistance(z.point) < 1e-3) {
      a.handleIn = z.handleIn;
      z.remove();
      p.closed = true;
    }
  }
}

// Add a freshly created item to the design, style, select and record.
export function addItem(item, { selectIt = true, record = true, layer } = {}) {
  normalizeClosed(item);
  ed.design.addChild(item);
  const assign = it => {
    if (it.className === 'Group') { it.children.forEach(assign); return; }
    if (layer) it.data.layer = layer;
    else if (!it.data.layer) it.data.layer = state.activeLayer;
  };
  assign(item);
  styleItem(item);
  if (selectIt) select(item);
  if (record) pushHistory();
  return item;
}
