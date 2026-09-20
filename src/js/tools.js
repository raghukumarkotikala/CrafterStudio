// Interactive drawing / editing tools.
/* global paper */
import { state, bus } from './state.js';
import {
  ed, select, clearSelection, hitDesign, hitHandle, updateSelectionBox, selectionBounds,
  pushHistory, addItem, snap, panBy, zoomAt, drawRulers, styleItem
} from './editor.js';

export const hooks = { editText: null };

const px = n => n / paper.view.zoom;
let spaceDown = false;
let panState = null;
let preview = null;

function clearPreview() {
  if (preview) { preview.remove(); preview = null; }
}

function previewStyle(item) {
  item.strokeColor = '#3d8bfd';
  item.strokeWidth = 1;
  item.strokeScaling = false;
  item.dashArray = [5, 3];
  return item;
}

function inOverlay(fn) {
  ed.overlay.activate();
  const r = fn();
  ed.design.activate();
  return r;
}

function constrain45(from, to) {
  const v = to.subtract(from);
  const ang = Math.round(v.angle / 45) * 45;
  return from.add(new paper.Point({ angle: ang, length: v.length }));
}

// ------------------------------------------------------------------ select
const selectTool = {
  cursor: 'default',
  down(e) {
    this.mode = null;
    this.changed = false;
    const handle = hitHandle(e.point);
    if (handle && state.selection.length) {
      this.b0 = selectionBounds();
      if (handle === 'rot') {
        this.mode = 'rotate';
        this.center = this.b0.center;
        this.startAng = e.point.subtract(this.center).angle;
        this.applied = 0;
      } else {
        this.mode = 'scale';
        this.handle = handle;
        const opp = { nw: 'bottomRight', n: 'bottomCenter', ne: 'bottomLeft', e: 'leftCenter', se: 'topLeft', s: 'topCenter', sw: 'topRight', w: 'rightCenter' };
        const own = { nw: 'topLeft', n: 'topCenter', ne: 'topRight', e: 'rightCenter', se: 'bottomRight', s: 'bottomCenter', sw: 'bottomLeft', w: 'leftCenter' };
        this.anchor = this.b0[opp[handle]].clone();
        this.corner = this.b0[own[handle]].clone();
        this.cur = [1, 1];
      }
      return;
    }
    const hit = hitDesign(e.point);
    if (hit && hit.top) {
      if (e.modifiers.shift) select(hit.top, true);
      else if (!state.selection.includes(hit.top)) select(hit.top);
      if (!state.selection.includes(hit.top)) return;
      if (e.modifiers.alt) {
        const copies = state.selection.map(it => { const c = it.clone(); c.data = JSON.parse(JSON.stringify(it.data)); return c; });
        select(copies);
        this.changed = true;
      }
      this.mode = 'move';
      this.start = e.point;
      this.b0 = selectionBounds();
      return;
    }
    if (!e.modifiers.shift) clearSelection();
    this.mode = 'marquee';
    this.start = e.point;
  },
  drag(e) {
    if (this.mode === 'move') {
      let d = e.point.subtract(this.start);
      if (e.modifiers.shift) d = Math.abs(d.x) > Math.abs(d.y) ? new paper.Point(d.x, 0) : new paper.Point(0, d.y);
      const target = snap(this.b0.topLeft.add(d));
      const cur = selectionBounds().topLeft;
      const delta = target.subtract(cur);
      if (delta.length > 0) {
        state.selection.forEach(it => it.translate(delta));
        this.changed = true;
        updateSelectionBox();
        bus.emit('transform');
      }
    } else if (this.mode === 'scale') {
      const p = snap(e.point);
      const h = this.handle;
      const hasX = h.includes('e') || h.includes('w');
      const hasY = h.includes('n') || h.includes('s');
      let sx = hasX ? (p.x - this.anchor.x) / (this.corner.x - this.anchor.x || 1e-9) : 1;
      let sy = hasY ? (p.y - this.anchor.y) / (this.corner.y - this.anchor.y || 1e-9) : 1;
      if (hasX && hasY && !e.modifiers.shift) {
        const s = Math.abs(sx) > Math.abs(sy) ? sx : sy;
        sx = sy = s;
      }
      const clamp = v => (Math.abs(v) < 0.001 ? (v < 0 ? -0.001 : 0.001) : v);
      sx = clamp(sx); sy = clamp(sy);
      const fx = sx / this.cur[0], fy = sy / this.cur[1];
      state.selection.forEach(it => it.scale(fx, fy, this.anchor));
      this.cur = [sx, sy];
      this.changed = true;
      updateSelectionBox();
      bus.emit('transform');
    } else if (this.mode === 'rotate') {
      let total = e.point.subtract(this.center).angle - this.startAng;
      if (e.modifiers.shift) total = Math.round(total / 15) * 15;
      const delta = total - this.applied;
      if (delta) {
        state.selection.forEach(it => {
          it.rotate(delta, this.center);
          it.data.rotation = ((it.data.rotation || 0) + delta) % 360;
        });
        this.applied = total;
        this.changed = true;
        updateSelectionBox();
        bus.emit('transform');
      }
    } else if (this.mode === 'marquee') {
      clearPreview();
      const crossing = e.point.x < this.start.x;
      preview = inOverlay(() => new paper.Path.Rectangle({
        from: this.start, to: e.point, strokeColor: '#3d8bfd', strokeWidth: 1, strokeScaling: false,
        dashArray: crossing ? [4, 4] : null, fillColor: 'rgba(61,139,253,0.08)'
      }));
    }
  },
  up(e) {
    if (this.mode === 'marquee') {
      clearPreview();
      const r = new paper.Rectangle(this.start, e.point);
      if (r.width > px(2) || r.height > px(2)) {
        const crossing = e.point.x < this.start.x;
        const found = ed.design.children.filter(c => c.visible && (crossing ? r.intersects(c.bounds) : r.contains(c.bounds)));
        if (e.modifiers.shift) select(found.filter(f => !state.selection.includes(f)), true);
        else select(found);
      }
    } else if (this.changed) {
      pushHistory();
      updateSelectionBox();
      bus.emit('selection');
    }
    this.mode = null;
  },
  move(e) {
    const h = hitHandle(e.point);
    const cursors = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', rot: 'grab' };
    ed.canvas.style.cursor = h ? cursors[h] : hitDesign(e.point) ? 'move' : 'default';
  },
  dblclick(pt) {
    const hit = hitDesign(pt);
    if (!hit) return;
    if (hit.top.data && hit.top.data.text && hooks.editText) hooks.editText(hit.top);
    else if (hit.top.className === 'Path' || hit.top.className === 'CompoundPath') {
      select(hit.top);
      setTool('node');
    }
  }
};

// ------------------------------------------------------------------ node editing
const nodeTool = {
  cursor: 'default',
  target: null,
  enter() {
    const s = state.selection[0];
    this.setTarget(s && (s.className === 'Path' || s.className === 'CompoundPath') ? s : null);
    updateSelectionBox();
  },
  exit() { this.setTarget(null); },
  setTarget(t) {
    if (this.target && this.target.parent) this.target.selected = false;
    this.target = t;
    ed.nodePath = t;
    if (t) {
      t.selected = true;
      this.allSegments().forEach(s => { s.selected = false; });
      state.selection = [t];
    }
    bus.emit('selection');
    paper.view.requestUpdate();
  },
  allSegments() {
    if (!this.target) return [];
    const paths = this.target.className === 'CompoundPath' ? this.target.children : [this.target];
    return paths.flatMap(p => p.segments);
  },
  down(e) {
    this.mode = null;
    this.changed = false;
    this.last = e.point;
    if (this.target) {
      const hit = this.target.hitTest(e.point, { segments: true, handles: true, stroke: true, fill: false, tolerance: px(6) });
      if (hit) {
        if (hit.type === 'segment') {
          if (!e.modifiers.shift && !hit.segment.selected) this.allSegments().forEach(s => { s.selected = false; });
          hit.segment.selected = e.modifiers.shift ? !hit.segment.selected : true;
          this.mode = 'segments';
        } else if (hit.type === 'handle-in' || hit.type === 'handle-out') {
          this.mode = hit.type;
          this.seg = hit.segment;
        } else if (hit.type === 'stroke' && hit.location) {
          const c = hit.location.curve;
          if (!e.modifiers.shift) this.allSegments().forEach(s => { s.selected = false; });
          c.segment1.selected = true;
          c.segment2.selected = true;
          this.mode = 'segments';
        }
        paper.view.requestUpdate();
        return;
      }
    }
    const h = hitDesign(e.point);
    if (h && (h.top.className === 'Path' || h.top.className === 'CompoundPath')) {
      this.setTarget(h.top);
      return;
    }
    if (h && h.top.className === 'Group' && (h.item.className === 'Path' || h.item.className === 'CompoundPath')) {
      this.setTarget(h.item.parent.className === 'CompoundPath' ? h.item.parent : h.item);
      return;
    }
    if (this.target) this.allSegments().forEach(s => { s.selected = false; });
    else this.setTarget(null);
    paper.view.requestUpdate();
  },
  drag(e) {
    const d = e.point.subtract(this.last);
    this.last = e.point;
    if (this.mode === 'segments') {
      this.allSegments().filter(s => s.selected).forEach(s => { s.point = s.point.add(d); });
      this.changed = true;
    } else if (this.mode === 'handle-in' || this.mode === 'handle-out') {
      const s = this.seg;
      const isIn = this.mode === 'handle-in';
      const v = e.point.subtract(s.point);
      const other = isIn ? s.handleOut : s.handleIn;
      const smooth = !e.modifiers.alt && !other.isZero() && Math.abs((isIn ? s.handleIn : s.handleOut).getDirectedAngle(other)) > 170;
      if (isIn) s.handleIn = v; else s.handleOut = v;
      if (smooth) {
        const mirrored = v.normalize(-other.length);
        if (isIn) s.handleOut = mirrored; else s.handleIn = mirrored;
      }
      this.changed = true;
    }
  },
  up() {
    if (this.changed) {
      pushHistory();
      bus.emit('selection');
    }
    this.mode = null;
  },
  move(e) {
    if (!this.target) { ed.canvas.style.cursor = 'default'; return; }
    const hit = this.target.hitTest(e.point, { segments: true, handles: true, stroke: true, tolerance: px(6) });
    ed.canvas.style.cursor = hit ? (hit.type === 'stroke' ? 'copy' : 'pointer') : 'default';
  },
  dblclick(pt) {
    if (!this.target) return;
    const hit = this.target.hitTest(pt, { segments: true, stroke: true, tolerance: px(6) });
    if (!hit) return;
    if (hit.type === 'segment') {
      const s = hit.segment;
      if (s.handleIn.isZero() && s.handleOut.isZero()) s.smooth({ type: 'catmull-rom' });
      else { s.handleIn = null; s.handleOut = null; }
    } else if (hit.type === 'stroke' && hit.location) {
      const path = hit.location.path;
      const seg = path.divideAt(hit.location);
      this.allSegments().forEach(s => { s.selected = false; });
      if (seg && seg.point) seg.selected = true;
    }
    pushHistory();
    paper.view.requestUpdate();
  },
  key(e) {
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.target) {
      const paths = this.target.className === 'CompoundPath' ? this.target.children.slice() : [this.target];
      let removed = false;
      for (const p of paths) {
        p.segments.filter(s => s.selected).forEach(s => { s.remove(); removed = true; });
        if (p.segments.length < 2) p.remove();
      }
      if (!removed) return false;
      if (this.target.className === 'CompoundPath' ? !this.target.children.length : !this.target.segments.length) {
        this.target.remove();
        this.setTarget(null);
      }
      pushHistory();
      return true;
    }
    return false;
  },
  // Toolbar actions for selected nodes
  smoothSelected(smooth) {
    const segs = this.allSegments().filter(s => s.selected);
    if (!segs.length) return;
    segs.forEach(s => { if (smooth) s.smooth({ type: 'catmull-rom' }); else { s.handleIn = null; s.handleOut = null; } });
    pushHistory();
  }
};

// ------------------------------------------------------------------ shapes
function shapeTool(build, { centerBased = false } = {}) {
  return {
    cursor: 'crosshair',
    down(e) { this.start = snap(e.point); },
    drag(e) {
      clearPreview();
      const p = snap(e.point);
      const shape = build(this.start, p, e.modifiers, false);
      if (shape) preview = inOverlay(() => previewStyle(ed.overlay.addChild(shape) && shape));
    },
    up(e) {
      clearPreview();
      const p = snap(e.point);
      if (this.start.getDistance(p) < px(3)) return;
      const shape = build(this.start, p, e.modifiers, true);
      if (shape) addItem(shape);
    },
    centerBased
  };
}

function boxFrom(start, p, mods) {
  let w = p.x - start.x, h = p.y - start.y;
  if (mods.shift) {
    const s = Math.max(Math.abs(w), Math.abs(h));
    w = Math.sign(w || 1) * s;
    h = Math.sign(h || 1) * s;
  }
  if (mods.alt) return new paper.Rectangle(start.subtract([w, h]), start.add([w, h]));
  return new paper.Rectangle(start, start.add([w, h]));
}

const rectTool = shapeTool((start, p, mods) => {
  const r = boxFrom(start, p, mods);
  const rad = Math.min(state.toolOpts.cornerRadius || 0, r.width / 2, r.height / 2);
  const shape = new paper.Path.Rectangle({ rectangle: r, radius: rad, insert: false });
  shape.data.shape = { kind: 'rect', radius: rad };
  return shape;
});

const ellipseTool = shapeTool((start, p, mods) => {
  const r = boxFrom(start, p, mods);
  const shape = new paper.Path.Ellipse({ rectangle: r, insert: false });
  shape.data.shape = { kind: 'ellipse' };
  return shape;
});

function radial(start, p, mods) {
  const v = p.subtract(start);
  let ang = v.angle + 90;
  if (mods.shift) ang = Math.round(ang / 15) * 15;
  return { r: v.length, ang };
}

const polygonTool = shapeTool((start, p, mods) => {
  const { r, ang } = radial(start, p, mods);
  if (r <= 0) return null;
  const shape = new paper.Path.RegularPolygon({ center: start, sides: Math.max(3, state.toolOpts.sides | 0), radius: r, insert: false });
  shape.rotate(ang, start);
  shape.data.shape = { kind: 'polygon' };
  return shape;
});

const starTool = shapeTool((start, p, mods) => {
  const { r, ang } = radial(start, p, mods);
  if (r <= 0) return null;
  const shape = new paper.Path.Star({ center: start, points: Math.max(3, state.toolOpts.starPoints | 0), radius1: r, radius2: r * Math.min(0.95, Math.max(0.05, state.toolOpts.starRatio)), insert: false });
  shape.rotate(ang, start);
  shape.data.shape = { kind: 'star' };
  return shape;
});

const lineTool = shapeTool((start, p, mods) => {
  const end = mods.shift ? constrain45(start, p) : p;
  return new paper.Path.Line({ from: start, to: end, insert: false });
});

// ------------------------------------------------------------------ pencil
const pencilTool = {
  cursor: 'crosshair',
  down(e) {
    this.path = inOverlay(() => previewStyle(new paper.Path({ segments: [e.point] })));
    this.path.dashArray = null;
  },
  drag(e) { this.path.add(e.point); },
  up() {
    const p = this.path;
    this.path = null;
    if (!p || p.segments.length < 3) { if (p) p.remove(); return; }
    p.remove();
    const q = new paper.Path({ segments: p.segments, insert: false });
    if (q.firstSegment.point.getDistance(q.lastSegment.point) < px(10)) { q.lastSegment.remove(); q.closed = true; }
    q.simplify(px(2.5));
    addItem(q);
  }
};

// ------------------------------------------------------------------ pen (bezier)
const penTool = {
  cursor: 'crosshair',
  path: null,
  down(e) {
    const p = snap(e.point);
    if (!this.path) {
      this.path = new paper.Path({ segments: [p] });
      ed.design.addChild(this.path);
      this.path.data.layer = state.activeLayer;
      styleItem(this.path);
      this.path.selected = true;
      this.dragSeg = this.path.lastSegment;
      return;
    }
    if (this.path.segments.length >= 2 && this.path.firstSegment.point.getDistance(p) < px(8)) {
      this.path.closed = true;
      this.dragSeg = this.path.firstSegment;
      this.closing = true;
      return;
    }
    this.path.add(p);
    this.dragSeg = this.path.lastSegment;
  },
  drag(e) {
    if (!this.dragSeg) return;
    const v = e.point.subtract(this.dragSeg.point);
    this.dragSeg.handleOut = v;
    this.dragSeg.handleIn = v.multiply(-1);
  },
  up() {
    if (this.closing) { this.closing = false; this.finish(); }
  },
  move(e) {
    clearPreview();
    if (!this.path) return;
    const last = this.path.lastSegment;
    const p = snap(e.point);
    preview = inOverlay(() => previewStyle(new paper.Path({ segments: [[last.point, null, last.handleOut], p] })));
    ed.canvas.style.cursor = this.path.segments.length >= 2 && this.path.firstSegment.point.getDistance(p) < px(8) ? 'cell' : 'crosshair';
  },
  dblclick() { this.finish(); },
  finish() {
    clearPreview();
    const p = this.path;
    this.path = null;
    this.dragSeg = null;
    if (!p) return;
    p.selected = false;
    // Drop duplicate trailing points produced by the double-click
    while (p.segments.length > 1 && p.lastSegment.point.getDistance(p.lastSegment.previous.point) < px(2)) p.lastSegment.remove();
    if (p.segments.length < 2) { p.remove(); return; }
    p.remove();
    addItem(p);
  },
  key(e) {
    if (e.key === 'Enter' || e.key === 'Escape') { this.finish(); return true; }
    if (e.key === 'Backspace' && this.path) {
      if (this.path.segments.length > 1) this.path.lastSegment.remove();
      else { this.path.remove(); this.path = null; clearPreview(); }
      return true;
    }
    return false;
  },
  exit() { this.finish(); }
};

// ------------------------------------------------------------------ text
const textTool = {
  cursor: 'text',
  down(e) {
    const hit = hitDesign(e.point);
    if (hit && hit.top.data && hit.top.data.text) { select(hit.top); if (hooks.editText) hooks.editText(hit.top); return; }
    if (hooks.editText) hooks.editText(null, snap(e.point));
  }
};

const panTool = { cursor: 'grab' };

export const TOOLS = {
  select: selectTool, node: nodeTool, rect: rectTool, ellipse: ellipseTool, polygon: polygonTool,
  star: starTool, line: lineTool, pen: penTool, pencil: pencilTool, text: textTool, pan: panTool
};

export function currentTool() { return TOOLS[state.tool] || selectTool; }

export function setTool(name) {
  if (!TOOLS[name]) return;
  const old = currentTool();
  if (old.exit && state.tool !== name) old.exit();
  clearPreview();
  state.tool = name;
  const t = currentTool();
  ed.canvas.style.cursor = t.cursor || 'default';
  if (t.enter) t.enter();
  updateSelectionBox();
  bus.emit('tool', name);
}

// ------------------------------------------------------------------ dispatcher
export function initTools() {
  const tool = new paper.Tool();
  const canvas = ed.canvas;

  tool.onMouseDown = e => {
    const btn = e.event.button;
    if (btn === 1 || spaceDown || state.tool === 'pan') {
      panState = { x: e.event.clientX, y: e.event.clientY };
      canvas.style.cursor = 'grabbing';
      return;
    }
    if (btn === 2) return;
    const t = currentTool();
    if (t.down) t.down(e);
  };
  tool.onMouseDrag = e => {
    if (panState) {
      panBy(e.event.clientX - panState.x, e.event.clientY - panState.y);
      panState = { x: e.event.clientX, y: e.event.clientY };
      return;
    }
    if (e.event.buttons === 2) return;
    const t = currentTool();
    if (t.drag) t.drag(e);
    ed.cursor = e.point;
    bus.emit('cursor', e.point);
  };
  tool.onMouseUp = e => {
    if (panState) {
      panState = null;
      canvas.style.cursor = spaceDown || state.tool === 'pan' ? 'grab' : currentTool().cursor || 'default';
      return;
    }
    if (e.event.button === 2) return;
    const t = currentTool();
    if (t.up) t.up(e);
  };
  tool.onMouseMove = e => {
    ed.cursor = e.point;
    bus.emit('cursor', e.point);
    drawRulers();
    if (panState || spaceDown) return;
    const t = currentTool();
    if (t.move) t.move(e);
  };

  canvas.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });
  canvas.addEventListener('contextmenu', e => {
    e.preventDefault();
    bus.emit('contextmenu', e);
  });
  canvas.addEventListener('dblclick', e => {
    const r = canvas.getBoundingClientRect();
    const pt = paper.view.viewToProject(new paper.Point(e.clientX - r.left, e.clientY - r.top));
    const t = currentTool();
    if (t.dblclick) t.dblclick(pt);
  });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const vp = new paper.Point(e.clientX - r.left, e.clientY - r.top);
    if (e.shiftKey) panBy(-e.deltaY, 0);
    else if (e.altKey) panBy(0, -e.deltaY);
    else zoomAt(Math.pow(1.0018, -e.deltaY), vp);
  }, { passive: false });

  window.addEventListener('keydown', e => {
    if (e.code === 'Space' && !isTyping(e)) {
      if (!spaceDown) { spaceDown = true; canvas.style.cursor = 'grab'; }
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', e => {
    if (e.code === 'Space') {
      spaceDown = false;
      canvas.style.cursor = currentTool().cursor || 'default';
    }
  });
}

export function isTyping(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}
