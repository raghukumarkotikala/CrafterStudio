// Application chrome: top bar, toolbox, tool options, sidebar panels, palette, status bar.
/* global paper */
import { state, bus, getLayer, setDirty, persistDevice, persistPrefs } from './state.js';
import { h, ibtn, row, num, select, check, seg, toast, fmtNum, appendAll } from './dom.js';
import { icon } from './icons.js';
import { ed, selectionBounds, usedLayerIds, restyleAll, pushHistory, canUndo, canRedo } from './editor.js';
import { TOOLS, setTool } from './tools.js';
import { run } from './commands.js';
import * as ops from './ops.js';
import { refreshRaster } from './io.js';
import { DITHERS, DEFAULT_ADJ } from './imageproc.js';
import { CONTROLLERS } from './profiles.js';
import { machine } from './machine.js';
import { consoleLog, log, directSupported } from './jobs.js';
import { formatDuration } from './gcode.js';
import * as pv from './preview.js';
import { renderLibraryTab } from './library.js';
import { renderAITab } from './aiui.js';

let activeTab = 'layers';
const $ = id => document.getElementById(id);

export function initUI() {
  buildTopbar();
  buildToolbox();
  buildTabs();
  renderToolOpts();
  renderPalette();
  renderStatus();
  renderTab();
  buildPreviewBar();

  bus.on('selection', () => { renderToolOpts(); if (activeTab === 'object' || activeTab === 'layers') renderTab(); renderPalette(); });
  bus.on('transform', updateGeometryFields);
  bus.on('tool', () => { renderToolOpts(); buildToolbox(); if (activeTab === 'object') renderTab(); });
  bus.on('layers', () => { renderPalette(); if (activeTab === 'layers' || activeTab === 'object') renderTab(); });
  bus.on('changed', () => { renderPalette(); updateEmptyHint(); if (activeTab === 'layers') renderTab(); });
  bus.on('history', updateTopbarState);
  bus.on('device', () => { buildTopbar(); if (activeTab === 'machine' || activeTab === 'layers') renderTab(); });
  bus.on('cursor', updateCursor);
  bus.on('view', updateZoom);
  bus.on('prefs', renderStatus);
  bus.on('toast', (m, k) => toast(m, k));
  bus.on('machineStatus', updateMachineStatus);
  bus.on('console', appendConsole);
  bus.on('jobProgress', updateJobProgress);
  bus.on('jobPaused', () => updateJobProgress(machine.job));
  bus.on('preview', on => { $('preview-bar').hidden = !on; renderPreviewBar(); buildTopbar(); });
  bus.on('previewProgress', f => { const s = $('pv-slider'); if (s) s.value = String(Math.round(f * 1000)); updatePreviewStats(); });
  bus.on('previewPlaying', () => renderPreviewBar());
  bus.on('contextmenu', showContextMenu);
  updateEmptyHint();
}

// ================================================================ top bar
function buildTopbar() {
  const tb = $('topbar');
  tb.innerHTML = '';
  const dev = state.device;
  const ctl = CONTROLLERS[dev.controller] || CONTROLLERS.grbl;
  tb.append(
    h('div', { class: 'brand', title: 'About Crafter Studio', onClick: () => run('help.about') }, h('img', { src: 'assets/wordmark.png', alt: 'Crafter Studio' })),
    h('div', { class: 'tb-group' },
      ibtn('new', 'New project (Ctrl+N)', () => run('file.new')),
      ibtn('open', 'Open project (Ctrl+O)', () => run('file.open')),
      ibtn('save', 'Save project (Ctrl+S)', () => run('file.save')),
      ibtn('import', 'Import SVG / DXF / image (Ctrl+I)', () => run('file.import')),
      ibtn('export', 'Export G-code (Ctrl+E)', () => run('file.exportGcode')),
      ibtn('ai', 'AI design assistant', () => run('ai.panel'))),
    h('div', { class: 'tb-group' },
      ibtn('undo', 'Undo (Ctrl+Z)', () => run('edit.undo'), { attrs: { id: 'tb-undo' } }),
      ibtn('redo', 'Redo (Ctrl+Y)', () => run('edit.redo'), { attrs: { id: 'tb-redo' } })),
    h('div', { class: 'tb-group objops' },
      ibtn('group', 'Group (Ctrl+G)', () => run('obj.group')),
      ibtn('ungroup', 'Ungroup (Ctrl+Shift+G)', () => run('obj.ungroup')),
      ibtn('unite', 'Union', () => run('obj.unite')),
      ibtn('subtract', 'Difference (bottom − top)', () => run('obj.subtract')),
      ibtn('intersect', 'Intersection', () => run('obj.intersect')),
      ibtn('exclude', 'Exclusion', () => run('obj.exclude')),
      ibtn('flipH', 'Flip horizontal (H)', () => run('obj.flipH')),
      ibtn('flipV', 'Flip vertical (Shift+H)', () => run('obj.flipV'))),
    h('div', { class: 'tb-group align' },
      ibtn('alignLeft', 'Align left', () => run('align.left')),
      ibtn('alignHC', 'Align centers horizontally', () => run('align.hcenter')),
      ibtn('alignRight', 'Align right', () => run('align.right')),
      ibtn('alignTop', 'Align top', () => run('align.top')),
      ibtn('alignVC', 'Align centers vertically', () => run('align.vcenter')),
      ibtn('alignBottom', 'Align bottom', () => run('align.bottom'))),
    h('div', { class: 'spacer' }),
    h('div', { class: 'device-chip', title: 'Machine profile & work area', onClick: () => run('machine.profile') },
      h('div', { class: 'dn' }, dev.name),
      h('div', { class: 'ds' }, `${dev.workW} × ${dev.workH} mm · ${dev.power || '?'} W ${String(dev.type).toUpperCase()} · ${ctl.direct ? 'USB' : 'export only'}`)),
    h('button', { class: 'btn', id: 'tb-connect', onClick: () => run('machine.connect'), disabled: !ctl.direct },
      h('span', { class: 'conn-dot', id: 'tb-dot' }), machine.connected ? 'Disconnect' : 'Connect'),
    h('button', { class: 'btn', title: 'Trace the job outline with the laser head', onClick: () => run('job.frame'), disabled: !ctl.direct, html: icon('frame') + 'Frame' }),
    h('button', { class: 'btn' + (pv.previewActive() ? ' primary' : ''), title: 'Toolpath preview (Alt+P)', onClick: () => run('job.preview'), html: icon('preview') + 'Preview' }),
    ctl.direct
      ? h('button', { class: 'btn primary', title: 'Start job (F5)', onClick: () => run('job.start'), html: icon('play') + 'Start' })
      : h('button', { class: 'btn primary', title: 'Export SVG for this machine\'s software', onClick: () => run('file.exportSvg'), html: icon('export') + 'Export SVG' })
  );
  updateTopbarState();
  updateMachineStatus(machine.status);
}

function updateTopbarState() {
  const u = $('tb-undo'), r = $('tb-redo');
  if (u) u.disabled = !canUndo();
  if (r) r.disabled = !canRedo();
}

// ================================================================ toolbox
const TOOL_META = [
  ['select', 'select', 'Select & transform (V)'],
  ['node', 'node', 'Edit nodes (N)'],
  null,
  ['rect', 'rect', 'Rectangle (R)'],
  ['ellipse', 'ellipse', 'Ellipse (E)'],
  ['polygon', 'polygon', 'Polygon (P)'],
  ['star', 'star', 'Star (S)'],
  ['line', 'line', 'Line (L)'],
  ['pen', 'pen', 'Pen — Bézier curves (B)'],
  ['pencil', 'pencil', 'Freehand (F)'],
  ['text', 'text', 'Text (T)'],
  null,
  ['pan', 'pan', 'Pan (Space)']
];

function buildToolbox() {
  const tb = $('toolbox');
  tb.innerHTML = '';
  for (const m of TOOL_META) {
    if (!m) { tb.appendChild(h('div', { class: 'sep' })); continue; }
    const [name, ic, title] = m;
    tb.appendChild(ibtn(ic, title, () => setTool(name), { class: state.tool === name ? 'active' : '' }));
  }
  tb.appendChild(h('div', { class: 'sep' }));
  tb.appendChild(ibtn('library', 'Art & icon library (drag onto canvas)', () => showTab('library')));
  tb.appendChild(ibtn('image', 'Import image / SVG / DXF', () => run('file.import')));
  tb.appendChild(ibtn('material', 'Material library', () => run('tools.materials')));
  tb.appendChild(ibtn('grid', 'Material test generator', () => run('tools.materialTest')));
}

// ================================================================ tool options + geometry
let geo = {};
function renderToolOpts() {
  const el = $('toolopts');
  el.innerHTML = '';
  const t = state.tool;
  const o = state.toolOpts;
  const left = h('div', { class: 'grp' });
  const hints = {
    select: 'Click to select · Shift+click to add · drag empty space to box-select (right→left selects touching) · Alt+drag duplicates',
    node: 'Drag nodes/handles · double-click a segment to add a node · double-click a node to toggle smooth/corner · Delete removes nodes',
    pen: 'Click for corners, drag for curves · click the first node to close · Enter/double-click to finish · Backspace removes last node',
    pencil: 'Draw freehand · end near the start point to close the shape',
    line: 'Drag to draw · Shift constrains to 45°',
    ellipse: 'Drag to draw · Shift = circle · Alt = from centre',
    text: 'Click on the canvas to place text · click existing text to edit',
    pan: 'Drag to pan · wheel to zoom'
  };
  if (t === 'rect') left.append(h('span', { class: 'muted' }, 'Corner radius'), num(o.cornerRadius, v => { o.cornerRadius = v; }, { min: 0, cls: 'sm', unit: 'mm' }), h('span', { class: 'hint' }, 'Shift = square · Alt = from centre'));
  else if (t === 'polygon') left.append(h('span', { class: 'muted' }, 'Sides'), num(o.sides, v => { o.sides = Math.round(v); }, { min: 3, max: 64, step: 1, cls: 'sm' }), h('span', { class: 'hint' }, 'Drag from the centre · Shift snaps rotation'));
  else if (t === 'star') left.append(h('span', { class: 'muted' }, 'Points'), num(o.starPoints, v => { o.starPoints = Math.round(v); }, { min: 3, max: 64, step: 1, cls: 'sm' }),
    h('span', { class: 'muted' }, 'Inner ratio'), num(o.starRatio, v => { o.starRatio = v; }, { min: 0.05, max: 0.95, step: 0.05, cls: 'sm' }));
  else if (t === 'node') left.append(
    h('button', { class: 'btn small', onClick: () => TOOLS.node.smoothSelected(true) }, 'Smooth'),
    h('button', { class: 'btn small', onClick: () => TOOLS.node.smoothSelected(false) }, 'Corner'),
    h('span', { class: 'hint' }, hints.node));
  else left.append(h('span', { class: 'hint' }, hints[t] || ''));
  el.appendChild(left);

  const right = h('div', { class: 'grp', style: { marginLeft: 'auto' } });
  const b = selectionBounds();
  if (b && t !== 'node') {
    const mk = (key, label, getter, apply) => {
      const [inp] = num(fmtNum(getter()), apply, { cls: 'sm', unit: '' });
      geo[key] = { inp, getter };
      return h('span', { class: 'field' }, h('span', {}, label), inp);
    };
    geo = {};
    const lockBtn = ibtn(state.prefs.lockRatio === false ? 'unlock' : 'lock', 'Lock proportions', () => {
      state.prefs.lockRatio = state.prefs.lockRatio === false;
      persistPrefs();
      renderToolOpts();
    }, { class: 'lockbtn' + (state.prefs.lockRatio === false ? '' : ' active') });
    const lock = () => state.prefs.lockRatio !== false;
    const single = state.selection.length === 1 ? state.selection[0] : null;
    appendAll(right,
      mk('x', 'X', () => selectionBounds().x, v => ops.setSelectionGeometry({ x: v })),
      mk('y', 'Y', () => selectionBounds().y, v => ops.setSelectionGeometry({ y: v })),
      mk('w', 'W', () => selectionBounds().width, v => ops.setSelectionGeometry({ w: v, lock: lock() })),
      lockBtn,
      mk('h', 'H', () => selectionBounds().height, v => ops.setSelectionGeometry({ h: v, lock: lock() })),
      single ? mk('r', '∠', () => single.data.rotation || 0, v => ops.setSelectionGeometry({ rotation: v })) : null,
      h('span', { class: 'muted small' }, 'mm'));
  }
  el.appendChild(right);
}

function updateGeometryFields() {
  if (!selectionBounds()) return;
  for (const k of Object.keys(geo)) {
    const g = geo[k];
    if (document.activeElement !== g.inp) g.inp.value = fmtNum(g.getter());
  }
}

// ================================================================ tabs
function buildTabs() {
  const tabs = $('tabs');
  tabs.innerHTML = '';
  for (const [k, v] of [['layers', 'Layers'], ['object', 'Object'], ['library', 'Library'], ['ai', 'AI'], ['machine', 'Machine']]) {
    tabs.appendChild(h('button', { class: activeTab === k ? 'active' : '', onClick: () => { activeTab = k; buildTabs(); renderTab(); } }, v));
  }
}

export function showTab(k) { activeTab = k; buildTabs(); renderTab(); }

function renderTab() {
  const body = $('tab-body');
  const keepScroll = body.scrollTop;
  body.innerHTML = '';
  if (activeTab === 'layers') renderLayersTab(body);
  else if (activeTab === 'object') renderObjectTab(body);
  else if (activeTab === 'library') renderLibraryTab(body);
  else if (activeTab === 'ai') renderAITab(body);
  else renderMachineTab(body);
  body.scrollTop = keepScroll;
}

// ---------------------------------------------------------------- layers tab
function layerChanged(restyle = false) {
  if (restyle) restyleAll();
  setDirty(true);
  renderPalette();
  renderTab();
}

function renderLayersTab(body) {
  const used = usedLayerIds();
  const shown = state.layers.filter(l => used.has(l.id) || l.id === state.activeLayer).sort((a, b) => a.order - b.order);
  const list = h('div', { class: 'layer-list' });
  for (const L of shown) {
    const summary = L.mode === 'line' ? `${L.power}% · ${L.speed} mm/min · ${L.passes}×` : `${L.power}% · ${L.speed} mm/min · ${L.interval} mm`;
    const rowEl = h('div', { class: 'layer-row' + (L.id === state.activeLayer ? ' active' : ''), onClick: () => { state.activeLayer = L.id; renderPalette(); renderTab(); } },
      h('div', { class: 'sw', style: { background: L.color } }),
      h('div', { class: 'ln' }, L.name, h('small', {}, used.has(L.id) ? summary : 'empty · click a colour below to assign')),
      h('span', { class: 'badge ' + L.mode }, L.mode),
      h('button', { class: 'mini' + (L.output ? '' : ' off'), title: L.output ? 'Output enabled' : 'Output disabled', html: icon('zap'), onClick: e => { e.stopPropagation(); L.output = !L.output; layerChanged(); } }),
      h('div', { style: { display: 'flex', flexDirection: 'column' } },
        h('button', { class: 'mini', style: { height: '11px' }, title: 'Move up (run earlier)', html: icon('up'), onClick: e => { e.stopPropagation(); moveLayer(L, -1, shown); } }),
        h('button', { class: 'mini', style: { height: '11px' }, title: 'Move down (run later)', html: icon('down'), onClick: e => { e.stopPropagation(); moveLayer(L, 1, shown); } })));
    list.appendChild(rowEl);
  }
  body.append(h('div', { class: 'sec' }, h('div', { class: 'sec-h' }, 'Layers (run order)', h('span', { class: 'muted' }, `${used.size} in use`)), list));

  const L = getLayer(state.activeLayer);
  const sec = h('div', { class: 'sec' });
  appendAll(sec,
    h('div', { class: 'sec-h' }, h('span', {}, h('span', { style: { color: L.color } }, '■ '), 'Layer settings'),
      h('button', { class: 'btn small', onClick: () => run('tools.materials'), html: icon('material') + 'Materials' })),
    row('Name', h('input', { class: 'inp', value: L.name, onChange: e => { L.name = e.target.value || L.name; layerChanged(); }, onKeydown: e => e.stopPropagation() })),
    row('Mode', seg({ line: 'Line', fill: 'Fill', image: 'Image' }, L.mode, v => { L.mode = v; layerChanged(true); })),
    row('Power', h('input', { type: 'range', min: 0, max: 100, value: L.power, style: { flex: 1 }, onInput: e => { L.power = +e.target.value; pw.value = L.power; }, onChange: () => layerChanged() }),
      (pw = num(L.power, v => { L.power = v; layerChanged(); }, { min: 0, max: 100, cls: 'sm' })), h('span', { class: 'unit' }, '%')),
    L.mode === 'image' ? row('Min power', ...num(L.minPower || 0, v => { L.minPower = v; layerChanged(); }, { min: 0, max: 100, unit: '%' })) : null,
    row('Speed', ...num(L.speed, v => { L.speed = v; layerChanged(); }, { min: 1, max: 1e6, unit: 'mm/min' })),
    row('Passes', ...num(L.passes, v => { L.passes = Math.round(v); layerChanged(); }, { min: 1, max: 100, step: 1, unit: '' })),
    L.mode !== 'line' ? row('Line interval', ...num(L.interval, v => { L.interval = v; layerChanged(); }, { min: 0.01, max: 5, step: 0.01, unit: 'mm' })) : null,
    L.mode !== 'line' ? h('div', { class: 'small muted', style: { margin: '-3px 0 7px 116px' } }, `${fmtNum(10 / L.interval, 1)} lines/cm · ${fmtNum(25.4 / L.interval, 0)} DPI`) : null,
    L.mode === 'fill' ? row('Scan angle', ...num(L.angle || 0, v => { L.angle = v; layerChanged(); }, { min: -180, max: 180, unit: '°' })) : null,
    L.mode !== 'line' ? row('Bidirectional', check(L.bidir, v => { L.bidir = v; layerChanged(); }, 'Scan both directions')) : null,
    L.mode !== 'line' ? row('Overscan', ...num(L.overscan, v => { L.overscan = v; layerChanged(); }, { min: 0, max: 20, unit: 'mm' })) : null,
    row('Air assist', check(L.air, v => { L.air = v; layerChanged(); }, state.device.airAssist ? 'M8 on for this layer' : 'M8 on (disabled in machine profile)')),
    row('Output', check(L.output, v => { L.output = v; layerChanged(); }, 'Include in job')),
    row('Show', check(L.visible, v => { L.visible = v; layerChanged(true); }, 'Visible on canvas'))
  );
  body.append(sec);

  const dev = state.device;
  body.append(h('div', { class: 'sec' },
    h('div', { class: 'sec-h' }, 'Job'),
    row('Start from', seg({ absolute: 'Absolute', current: 'Current position' }, dev.jobOrigin, v => { dev.jobOrigin = v; persistDevice(); renderTab(); })),
    dev.jobOrigin === 'current' ? row('Job origin', anchorPicker()) : null,
    h('div', { class: 'grid2' },
      h('button', { class: 'btn', onClick: () => run('job.preview'), html: icon('preview') + 'Preview' }),
      h('button', { class: 'btn', onClick: () => run('file.exportGcode'), html: icon('export') + 'Save G-code' }))));
}
let pw;

function anchorPicker() {
  const dev = state.device;
  const wrap = h('div', { class: 'anchor' });
  for (const a of ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br']) {
    wrap.appendChild(h('button', { class: dev.jobAnchor === a ? 'on' : '', title: a, onClick: () => { dev.jobAnchor = a; persistDevice(); renderTab(); } }));
  }
  return h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center' } }, wrap, h('span', { class: 'small muted' }, 'Point of the job placed at the laser\'s current position'));
}

function moveLayer(L, dir, shown) {
  const idx = shown.indexOf(L);
  const other = shown[idx + dir];
  if (!other) return;
  [L.order, other.order] = [other.order, L.order];
  layerChanged();
}

// ---------------------------------------------------------------- object tab
function leaves(items) {
  const out = [];
  const walk = it => { if (it.className === 'Group') it.children.forEach(walk); else out.push(it); };
  items.forEach(walk);
  return out;
}

let adjTimer = 0;
function renderObjectTab(body) {
  const s = state.selection.filter(i => i.parent);
  if (!s.length) {
    body.append(h('div', { class: 'note' }, 'Nothing selected. Select an object to edit its layer, power overrides, image settings, alignment and more.'),
      h('div', { class: 'sec' }, h('div', { class: 'sec-h' }, 'Quick add'),
        h('div', { class: 'grid2' },
          h('button', { class: 'btn', onClick: () => run('file.import'), html: icon('image') + 'Import file' }),
          h('button', { class: 'btn', onClick: () => setTool('text'), html: icon('text') + 'Add text' }),
          h('button', { class: 'btn', onClick: () => run('tools.materialTest'), html: icon('grid') + 'Material test' }),
          h('button', { class: 'btn', onClick: () => run('tools.materials'), html: icon('material') + 'Materials' }))));
    return;
  }
  const lv = leaves(s);
  const kinds = { Path: 'Path', CompoundPath: 'Compound path', Group: 'Group', Raster: 'Image' };
  const title = s.length === 1 ? (s[0].data.text ? 'Text' : s[0].data.shape ? s[0].data.shape.kind[0].toUpperCase() + s[0].data.shape.kind.slice(1) : kinds[s[0].className] || s[0].className) : `${s.length} objects`;
  const layerIds = [...new Set(lv.map(i => i.data.layer))];

  // layer
  const layerSel = h('select', { class: 'inp', onChange: e => ops.assignLayer(e.target.value) },
    ...(layerIds.length > 1 ? [h('option', { value: '' }, '— mixed —')] : []),
    ...state.layers.map(L => h('option', { value: L.id, style: { color: L.color } }, `■ ${L.name} (${L.mode})`)));
  layerSel.value = layerIds.length === 1 ? layerIds[0] : '';
  body.append(h('div', { class: 'sec' }, h('div', { class: 'sec-h' }, title, h('span', { class: 'muted' }, `${lv.length} element${lv.length > 1 ? 's' : ''}`)), row('Layer', layerSel)));

  // per-object override
  const first = lv[0].data.proc || {};
  const ov = { enabled: !!first.enabled, power: first.power ?? getLayer(lv[0].data.layer).power, speed: first.speed ?? getLayer(lv[0].data.layer).speed, passes: first.passes ?? 1 };
  const applyOv = () => { lv.forEach(i => { i.data.proc = { ...ov }; }); pushHistory(); renderTab(); };
  body.append(h('div', { class: 'sec' }, h('div', { class: 'sec-h' }, 'Process override'),
    row('Custom', check(ov.enabled, v => { ov.enabled = v; applyOv(); }, 'Override layer power/speed')),
    ov.enabled ? row('Power', ...num(ov.power, v => { ov.power = v; applyOv(); }, { min: 0, max: 100, unit: '%' })) : null,
    ov.enabled ? row('Speed', ...num(ov.speed, v => { ov.speed = v; applyOv(); }, { min: 1, unit: 'mm/min' })) : null,
    ov.enabled ? row('Passes', ...num(ov.passes, v => { ov.passes = Math.round(v); applyOv(); }, { min: 1, step: 1, unit: '' })) : null));

  // image
  const r = s.length === 1 && s[0].className === 'Raster' ? s[0] : null;
  if (r) {
    const adj = r.data.adj = { ...DEFAULT_ADJ, ...(r.data.adj || {}) };
    const upd = (k, v, immediate) => {
      adj[k] = v;
      clearTimeout(adjTimer);
      adjTimer = setTimeout(async () => { await refreshRaster(r); if (immediate !== 'live') pushHistory(); }, immediate ? 0 : 180);
    };
    const slider = (k, min, max, step) => {
      const out = h('span', { class: 'unit' }, fmtNum(adj[k]));
      return [h('input', { type: 'range', min, max, step, value: adj[k], style: { flex: 1 }, onInput: e => { out.textContent = e.target.value; upd(k, +e.target.value, 'live'); }, onChange: e => upd(k, +e.target.value) }), out];
    };
    const px = r.width, py = r.height;
    const dpi = (px / r.bounds.width) * 25.4;
    body.append(h('div', { class: 'sec' }, h('div', { class: 'sec-h' }, 'Image'),
      h('div', { class: 'small muted', style: { marginBottom: '8px' } }, `${px}×${py} px · ${fmtNum(dpi, 0)} DPI at current size`),
      row('Dithering', select(DITHERS, adj.dither, v => { upd('dither', v, true); renderTab(); })),
      adj.dither === 'threshold' || adj.dither !== 'grayscale' ? row('Threshold', ...slider('threshold', 1, 254, 1)) : null,
      row('Brightness', ...slider('brightness', -100, 100, 1)),
      row('Contrast', ...slider('contrast', -100, 100, 1)),
      row('Gamma', ...slider('gamma', 0.2, 4, 0.05)),
      row('Invert', check(adj.invert, v => upd('invert', v, true), 'Negative (e.g. for dark materials)')),
      h('div', { class: 'grid2' },
        h('button', { class: 'btn', onClick: () => run('obj.trace') }, 'Trace to vectors'),
        h('button', { class: 'btn', onClick: () => { Object.assign(adj, DEFAULT_ADJ); upd('dither', adj.dither, true); renderTab(); } }, 'Reset'))));
  }

  // text
  if (s.length === 1 && s[0].data.text) {
    const t = s[0].data.text;
    body.append(h('div', { class: 'sec' }, h('div', { class: 'sec-h' }, 'Text'),
      h('div', { class: 'note', style: { whiteSpace: 'pre-wrap', color: 'var(--text)' } }, t.content),
      h('div', { class: 'grid2' },
        h('button', { class: 'btn primary', onClick: () => import('./dialogs.js').then(d => d.openTextDialog(s[0])) }, 'Edit text…'),
        h('button', { class: 'btn', onClick: () => run('obj.toPath') }, 'Convert to path'))));
  }

  // arrange / align
  const alignToSel = select({ selection: 'Selection', workarea: 'Work area' }, state.prefs.alignTo, v => { state.prefs.alignTo = v; persistPrefs(); });
  body.append(h('div', { class: 'sec' }, h('div', { class: 'sec-h' }, 'Align & distribute'),
    row('Relative to', alignToSel),
    h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '2px' } },
      ibtn('alignLeft', 'Align left', () => run('align.left')),
      ibtn('alignHC', 'Center horizontally', () => run('align.hcenter')),
      ibtn('alignRight', 'Align right', () => run('align.right')),
      ibtn('alignTop', 'Align top', () => run('align.top')),
      ibtn('alignVC', 'Center vertically', () => run('align.vcenter')),
      ibtn('alignBottom', 'Align bottom', () => run('align.bottom')),
      ibtn('distH', 'Distribute horizontally', () => run('align.distH')),
      ibtn('distV', 'Distribute vertically', () => run('align.distV')))));

  body.append(h('div', { class: 'sec' }, h('div', { class: 'sec-h' }, 'Transform'),
    h('div', { class: 'grid2' },
      h('button', { class: 'btn small', onClick: () => run('obj.rot-90') }, '⟲ Rotate 90°'),
      h('button', { class: 'btn small', onClick: () => run('obj.rot90') }, '⟳ Rotate 90°'),
      h('button', { class: 'btn small', onClick: () => run('obj.flipH') }, 'Flip horizontal'),
      h('button', { class: 'btn small', onClick: () => run('obj.flipV') }, 'Flip vertical'),
      h('button', { class: 'btn small', onClick: () => run('obj.centerWork') }, 'Center in work area'),
      h('button', { class: 'btn small', onClick: () => run('view.fitSel') }, 'Zoom to selection'))));

  body.append(h('div', { class: 'sec' }, h('div', { class: 'sec-h' }, 'Path operations'),
    h('div', { class: 'grid2' },
      h('button', { class: 'btn small', onClick: () => run('obj.unite') }, 'Union'),
      h('button', { class: 'btn small', onClick: () => run('obj.subtract') }, 'Difference'),
      h('button', { class: 'btn small', onClick: () => run('obj.intersect') }, 'Intersection'),
      h('button', { class: 'btn small', onClick: () => run('obj.exclude') }, 'Exclusion'),
      h('button', { class: 'btn small', onClick: () => run('obj.divide') }, 'Divide'),
      h('button', { class: 'btn small', onClick: () => run('obj.offset') }, 'Offset…'),
      h('button', { class: 'btn small', onClick: () => run('obj.combine') }, 'Combine'),
      h('button', { class: 'btn small', onClick: () => run('obj.breakApart') }, 'Break apart'),
      h('button', { class: 'btn small', onClick: () => run('obj.gridArray') }, 'Grid array…'),
      h('button', { class: 'btn small', onClick: () => run('obj.circArray') }, 'Circular array…'))));
}

// ---------------------------------------------------------------- machine tab
let jogStep = 10;
let jogFeed = 3000;
let testPower = 1;
const cmdHistory = [];

function renderMachineTab(body) {
  const dev = state.device;
  const ctl = CONTROLLERS[dev.controller] || CONTROLLERS.grbl;
  body.append(h('div', { class: 'sec' },
    h('div', { class: 'sec-h' }, 'Machine', h('button', { class: 'btn small', onClick: () => run('machine.profile'), html: icon('settings') + 'Change' })),
    h('div', { class: 'note', style: { color: 'var(--text)' } },
      h('div', { style: { fontWeight: 600 } }, dev.name),
      h('div', { class: 'muted' }, `${dev.workW} × ${dev.workH} mm · ${dev.power || '?'} W ${String(dev.type).toUpperCase()}`),
      h('div', { class: 'muted' }, ctl.label))));

  if (!ctl.direct) {
    body.append(h('div', { class: 'note warn' }, 'This machine uses a controller Crafter Studio cannot drive directly. Design at the correct size here, then use Export SVG and open the file in the manufacturer\'s software (or LightBurn).'),
      h('button', { class: 'btn primary', onClick: () => run('file.exportSvg'), html: icon('export') + 'Export SVG' }));
    return;
  }

  body.append(h('div', { class: 'sec' },
    h('div', { class: 'sec-h' }, 'Connection'),
    h('div', { class: 'row' },
      h('span', { class: 'conn-dot', id: 'm-dot' }),
      h('b', { id: 'm-state' }, machine.status.state),
      h('span', { class: 'pos muted', id: 'm-pos', style: { marginLeft: 'auto' } }, '')),
    h('div', { class: 'grid2' },
      h('button', { class: 'btn ' + (machine.connected ? '' : 'primary'), onClick: () => run('machine.connect'), html: icon('usb') + (machine.connected ? 'Disconnect' : 'Connect') }),
      select({ 9600: '9600 baud', 57600: '57600 baud', 115200: '115200 baud', 230400: '230400 baud', 250000: '250000 baud', 921600: '921600 baud' }, String(dev.baud), v => { dev.baud = +v; persistDevice(); }))));

  const up = dev.origin.includes('b') ? 1 : -1;
  const right = dev.origin.includes('r') ? -1 : 1;
  const jog = (dx, dy) => { if (!machine.connected) return toast('Not connected'); machine.jog(dx * jogStep * right, dy * jogStep * up, jogFeed); };
  const jb = (ic, t, fn) => h('button', { class: 'btn', title: t, onClick: fn, html: icon(ic) });
  const blank = () => h('div');
  body.append(h('div', { class: 'sec' },
    h('div', { class: 'sec-h' }, 'Move'),
    h('div', { class: 'jog-wrap' },
      h('div', { class: 'jog' },
        blank(), jb('up', 'Back (+Y)', () => jog(0, 1)), blank(),
        jb('left', 'Left', () => jog(-1, 0)), jb('home', 'Home ($H)', () => machine.home()), jb('right', 'Right', () => jog(1, 0)),
        blank(), jb('down', 'Front (−Y)', () => jog(0, -1)), blank()),
      h('div', { style: { flex: 1 } },
        h('div', { class: 'small muted' }, 'Step (mm)'),
        h('div', { class: 'chips', style: { margin: '4px 0 8px' } }, ...[0.1, 1, 5, 10, 50, 100].map(s =>
          h('button', { class: 'chip' + (jogStep === s ? ' on' : ''), onClick: () => { jogStep = s; renderTab(); } }, String(s)))),
        h('div', { class: 'small muted' }, 'Speed (mm/min)'),
        num(jogFeed, v => { jogFeed = v; }, { min: 10 }))),
    h('div', { class: 'grid2', style: { marginTop: '8px' } },
      h('button', { class: 'btn small', onClick: () => machine.unlock() }, 'Unlock ($X)'),
      h('button', { class: 'btn small', onClick: () => machine.setZero() }, 'Set origin here'),
      h('button', { class: 'btn small', onClick: () => machine.goZero() }, 'Go to origin'),
      h('button', { class: 'btn small', onClick: () => machine.send('M5') }, 'Laser off (M5)')),
    h('div', { class: 'row', style: { marginTop: '8px' } },
      h('label', {}, 'Test fire'),
      h('div', { class: 'ctl' }, ...num(testPower, v => { testPower = v; }, { min: 0.1, max: 10, step: 0.1, unit: '%' }),
        h('button', { class: 'btn small', title: 'Hold to fire at low power (focus / positioning)',
          onMousedown: () => { if (!machine.connected) return; const s = Math.round((testPower / 100) * (dev.sMax || 1000) * 1000) / 1000; machine.send('G1 F100'); machine.send(`M3 S${s}`); },
          onMouseup: () => machine.send('M5'), onMouseleave: () => machine.connected && machine.send('M5') }, 'Hold to fire')))));

  body.append(h('div', { class: 'sec' },
    h('div', { class: 'sec-h' }, 'Job'),
    row('Start from', seg({ absolute: 'Absolute', current: 'Current position' }, dev.jobOrigin, v => { dev.jobOrigin = v; persistDevice(); renderTab(); })),
    dev.jobOrigin === 'current' ? row('Job origin', anchorPicker()) : null,
    h('div', { class: 'progress', style: { margin: '6px 0' } }, h('div', { id: 'm-prog' })),
    h('div', { class: 'small muted', id: 'm-progtext', style: { marginBottom: '8px' } }, 'Idle'),
    h('div', { class: 'grid2' },
      h('button', { class: 'btn', onClick: () => run('job.frame'), html: icon('frame') + 'Frame' }),
      h('button', { class: 'btn primary', onClick: () => run('job.start'), html: icon('play') + 'Start' }),
      h('button', { class: 'btn', id: 'm-pause', onClick: () => run('job.pause'), html: icon('pause') + 'Pause' }),
      h('button', { class: 'btn danger', onClick: () => run('job.stop'), html: icon('stop') + 'Stop' }))));

  const con = h('div', { class: 'console', id: 'm-console' });
  consoleLog.slice(-200).forEach(l => con.appendChild(h('div', { class: l.cls }, l.text)));
  let histIdx = -1;
  const inp = h('input', { class: 'inp', placeholder: 'Send command (e.g. $$, $I, G0 X10) — Enter', onKeydown: e => {
    e.stopPropagation();
    if (e.key === 'Enter' && inp.value.trim()) {
      const c = inp.value.trim();
      cmdHistory.unshift(c);
      histIdx = -1;
      log(c, 'tx');
      machine.send(c);
      inp.value = '';
    } else if (e.key === 'ArrowUp' && cmdHistory.length) {
      histIdx = Math.min(cmdHistory.length - 1, histIdx + 1);
      inp.value = cmdHistory[histIdx];
    } else if (e.key === 'ArrowDown') {
      histIdx = Math.max(-1, histIdx - 1);
      inp.value = histIdx < 0 ? '' : cmdHistory[histIdx];
    }
  } });
  body.append(h('div', { class: 'sec' }, h('div', { class: 'sec-h' }, 'Console',
    h('button', { class: 'btn small', onClick: () => { consoleLog.length = 0; con.innerHTML = ''; } }, 'Clear')), con, h('div', { style: { height: '6px' } }), inp));
  setTimeout(() => { con.scrollTop = con.scrollHeight; }, 0);
  updateMachineStatus(machine.status);
  updateJobProgress(machine.job);
}

function updateMachineStatus(st) {
  const connected = machine.connected;
  const cls = !connected ? '' : /alarm/i.test(st.state) ? 'alarm' : /run|jog|home|hold/i.test(st.state) ? 'busy' : 'on';
  for (const id of ['tb-dot', 'm-dot']) {
    const d = $(id);
    if (d) d.className = 'conn-dot ' + cls;
  }
  const btn = $('tb-connect');
  if (btn && btn.lastChild) btn.lastChild.textContent = connected ? 'Disconnect' : 'Connect';
  const s = $('m-state');
  if (s) s.textContent = st.state;
  const p = $('m-pos');
  if (p) p.textContent = connected ? `X ${fmtNum(st.wpos[0] || 0)}  Y ${fmtNum(st.wpos[1] || 0)}` : '';
  const ms = $('st-machine');
  if (ms) ms.textContent = connected ? st.state : 'Offline';
}

function appendConsole({ text, cls }) {
  const con = $('m-console');
  if (!con) return;
  con.appendChild(h('div', { class: cls }, text));
  while (con.childNodes.length > 400) con.removeChild(con.firstChild);
  con.scrollTop = con.scrollHeight;
}

function updateJobProgress(j) {
  const bar = $('m-prog'), txt = $('m-progtext'), pause = $('m-pause');
  const stj = $('st-job');
  if (!j) {
    if (bar) bar.style.width = '0%';
    if (txt) txt.textContent = machine.connected ? 'Ready' : 'Not connected';
    if (stj) stj.textContent = '';
    if (pause) pause.innerHTML = icon('pause') + 'Pause';
    return;
  }
  const f = j.total ? j.acked / j.total : 0;
  const el = (Date.now() - j.started) / 1000;
  const remain = f > 0.02 ? el / f - el : 0;
  if (bar) bar.style.width = (f * 100).toFixed(1) + '%';
  const t = `${(f * 100).toFixed(1)}% · ${j.acked.toLocaleString()}/${j.total.toLocaleString()} lines · ${formatDuration(el)} elapsed${remain ? ' · ~' + formatDuration(remain) + ' left' : ''}${machine.paused ? ' · PAUSED' : ''}`;
  if (txt) txt.textContent = t;
  if (stj) stj.textContent = `Job ${(f * 100).toFixed(0)}%`;
  if (pause) pause.innerHTML = machine.paused ? icon('play') + 'Resume' : icon('pause') + 'Pause';
}

// ================================================================ palette & status
function renderPalette() {
  const el = $('palette');
  el.innerHTML = '';
  const used = usedLayerIds();
  el.appendChild(h('span', { class: 'small muted', style: { marginRight: '4px', alignSelf: 'center' } }, 'Layer'));
  for (const L of state.layers) {
    el.appendChild(h('div', {
      class: 'swatch' + (L.id === state.activeLayer ? ' active' : '') + (used.has(L.id) ? ' used' : ''),
      style: { background: L.color }, title: `${L.name} — ${L.mode}, ${L.power}%, ${L.speed} mm/min\nClick: assign selection / make active`,
      onClick: () => ops.assignLayer(L.id)
    }));
  }
}

function renderStatus() {
  const el = $('status');
  el.innerHTML = '';
  el.append(
    h('span', { id: 'st-job' }),
    h('span', {}, 'Machine: ', h('b', { id: 'st-machine' }, machine.connected ? machine.status.state : 'Offline')),
    h('span', { class: 'toggle' + (state.prefs.snap ? ' on' : ''), title: 'Snap to grid (%)', onClick: () => run('view.snap') }, `Snap ${state.prefs.snapStep} mm`),
    h('span', { id: 'st-cursor' }, 'X — Y —'),
    h('span', { id: 'st-zoom' }, ''));
  updateZoom();
}

function updateCursor(p) {
  const el = $('st-cursor');
  if (el) el.innerHTML = `X <b>${p.x.toFixed(1)}</b> Y <b>${p.y.toFixed(1)}</b> mm`;
}

function updateZoom() {
  const el = $('st-zoom');
  if (!el) return;
  // zoom 1 = 1 px per mm; ~3.78 px per mm is "100%" at 96 DPI
  el.textContent = `${Math.round((paper.view.zoom / 3.7795) * 100)}%`;
}

function updateEmptyHint() {
  const e = $('empty-hint');
  if (e) e.classList.toggle('hide', ed.design.children.length > 0);
}

// ================================================================ preview bar
function buildPreviewBar() {
  renderPreviewBar();
}

function renderPreviewBar() {
  const bar = $('preview-bar');
  if (!pv.previewActive()) { bar.hidden = true; return; }
  bar.hidden = false;
  bar.innerHTML = '';
  const j = state.job;
  bar.append(
    h('button', { class: 'btn small', onClick: () => (pv.isPlaying() ? pv.stop() : pv.play()), html: icon(pv.isPlaying() ? 'pause' : 'play') }),
    h('input', { type: 'range', id: 'pv-slider', min: 0, max: 1000, value: Math.round(pv.getProgress() * 1000), onInput: e => { pv.stop(); pv.setProgress(+e.target.value / 1000); updatePreviewStats(); } }),
    select({ 0.25: '¼×', 1: '1×', 4: '4×', 16: '16×' }, '1', v => pv.setSpeed(+v), 'inp'),
    check(true, v => pv.setShowTravel(v), 'Travel'),
    h('span', { class: 'stats', id: 'pv-stats' }),
    h('button', { class: 'btn small', onClick: () => run('job.preview'), html: icon('close') }));
  bar.querySelector('select').style.width = '64px';
  updatePreviewStats();
  if (j && j.warnings.length) bar.title = j.warnings.join('\n');
}

function updatePreviewStats() {
  const el = $('pv-stats');
  const j = state.job;
  if (!el || !j) return;
  el.innerHTML = `Est. <b>${formatDuration(j.stats.seconds)}</b> · burn ${(j.stats.burnDist / 1000).toFixed(2)} m · travel ${(j.stats.travelDist / 1000).toFixed(2)} m${j.bounds ? ` · ${j.bounds.w.toFixed(1)}×${j.bounds.h.toFixed(1)} mm` : ''}`;
}

// ================================================================ context menu
function showContextMenu(e) {
  const m = $('ctxmenu');
  const has = state.selection.length > 0;
  const items = has ? [
    ['Cut', 'edit.cut', 'Ctrl+X'], ['Copy', 'edit.copy', 'Ctrl+C'], ['Paste', 'edit.paste', 'Ctrl+V'], ['Duplicate', 'edit.duplicate', 'Ctrl+D'], ['Delete', 'edit.delete', 'Del'], null,
    ['Group', 'obj.group', 'Ctrl+G'], ['Ungroup', 'obj.ungroup', 'Ctrl+Shift+G'], ['Combine', 'obj.combine', 'Ctrl+K'], ['Break apart', 'obj.breakApart', 'Ctrl+Shift+K'], null,
    ['Bring to front', 'obj.front', 'Home'], ['Send to back', 'obj.back', 'End'], ['Flip horizontal', 'obj.flipH', 'H'], ['Flip vertical', 'obj.flipV', 'Shift+H'], null,
    ['Center in work area', 'obj.centerWork', ''], ['Offset path…', 'obj.offset', '']
  ] : [
    ['Paste', 'edit.paste', 'Ctrl+V'], ['Select all', 'edit.selectAll', 'Ctrl+A'], null,
    ['Import…', 'file.import', 'Ctrl+I'], ['Zoom to work area', 'view.fit', '5'], ['Material test…', 'tools.materialTest', '']
  ];
  m.innerHTML = '';
  for (const it of items) {
    if (!it) { m.appendChild(h('div', { class: 'sep' })); continue; }
    m.appendChild(h('div', { class: 'it', onClick: () => { m.hidden = true; run(it[1]); } }, it[0], h('kbd', {}, it[2])));
  }
  m.hidden = false;
  const W = window.innerWidth, H = window.innerHeight;
  const r = m.getBoundingClientRect();
  m.style.left = Math.min(e.clientX, W - r.width - 8) + 'px';
  m.style.top = Math.min(e.clientY, H - r.height - 8) + 'px';
  const close = ev => { if (!m.contains(ev.target)) { m.hidden = true; window.removeEventListener('mousedown', close, true); } };
  setTimeout(() => window.addEventListener('mousedown', close, true), 0);
}

export { renderTab, directSupported };
