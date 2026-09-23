// Modal dialogs.
/* global paper */
import { h, openModal, row, num, select, check, seg, toast, fmtNum, appendAll } from './dom.js';
import { state, bus, persistDevice, saveJSON, getLayer } from './state.js';
import { MACHINES, BRANDS, CONTROLLERS, LASER_TYPES, deviceFromProfile } from './profiles.js';
import { MATERIAL_SETS, materialSetFor } from './materials.js';
import { ed, drawWorkArea, fitWorkArea, addItem, pushHistory, select as selectItems, styleItem } from './editor.js';
import { buildTextPath, listFonts, defaultFontPath, registerFontBuffer } from './text.js';
import * as ops from './ops.js';

// ================================================================ machine profile
export function openProfileDialog({ welcome = false } = {}) {
  let draft = { ...state.device };
  let filter = { q: '', type: 'all' };
  let selectedId = draft.profileId;

  const listEl = h('div', { class: 'prof-items' });
  const formEl = h('div', { class: 'prof-form' });
  const countEl = h('div', { class: 'small muted' });

  const allProfiles = () => [
    ...state.customProfiles.map(p => ({ ...p, custom: true })),
    ...MACHINES
  ];

  function renderList() {
    listEl.innerHTML = '';
    const q = filter.q.toLowerCase();
    const items = allProfiles().filter(m => {
      if (filter.type !== 'all') {
        if (filter.type === 'other' ? ['diode', 'co2', 'fiber'].includes(m.type) : m.type !== filter.type) return false;
      }
      return !q || `${m.brand} ${m.model}`.toLowerCase().includes(q);
    });
    const brands = [...new Set(items.map(m => m.custom ? '★ My profiles' : m.brand))];
    brands.sort((a, b) => (a.startsWith('★') ? -1 : b.startsWith('★') ? 1 : a.localeCompare(b)));
    for (const b of brands) {
      listEl.appendChild(h('div', { class: 'brand-h' }, b));
      for (const m of items.filter(x => (x.custom ? '★ My profiles' : x.brand) === b)) {
        const el = h('div', { class: 'model' + (m.id === selectedId ? ' sel' : ''), onClick: () => {
          selectedId = m.id;
          draft = m.custom ? { ...m.device } : deviceFromProfile(m);
          renderList();
          renderForm();
        } },
        h('span', {}, m.model, m.custom ? null : h('span', { class: 'pill ' + (CONTROLLERS[m.controller].direct ? 'ok' : 'no') }, CONTROLLERS[m.controller].direct ? 'USB' : 'export')),
        h('small', {}, `${m.workW}×${m.workH} · ${m.power}W ${m.type.toUpperCase()}`));
        listEl.appendChild(el);
      }
    }
    countEl.textContent = `${items.length} of ${MACHINES.length + state.customProfiles.length} profiles · ${BRANDS.length} brands`;
    const sel = listEl.querySelector('.sel');
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  }

  function set(k, v) { draft[k] = v; renderForm(); }

  function renderForm() {
    formEl.innerHTML = '';
    const ctl = CONTROLLERS[draft.controller] || CONTROLLERS.grbl;
    appendAll(formEl,
      welcome ? h('img', { class: 'logo-hero', src: 'assets/logo.png', alt: 'Crafter', style: { width: '140px', height: '140px' } }) : null,
      welcome ? h('div', { class: 'note' }, 'Welcome to Crafter! Pick your machine from the list (or build a custom one), check the work area, then press “Use this machine”. You can change it any time from the device button in the top bar.') : null,
      h('div', { class: 'sec-h' }, 'Machine'),
      row('Name', h('input', { class: 'inp', value: draft.name, onChange: e => { draft.name = e.target.value; } })),
      row('Laser type', select(LASER_TYPES, draft.type, v => set('type', v))),
      row('Laser power', num(draft.power, v => { draft.power = v; }, { min: 0, unit: 'W' })),
      h('div', { class: 'sec-h' }, 'Work area (custom size)'),
      row('Width (X)', num(draft.workW, v => set('workW', v), { min: 10, max: 5000, unit: 'mm' })),
      row('Height (Y)', num(draft.workH, v => set('workH', v), { min: 10, max: 5000, unit: 'mm' })),
      row('Presets', h('div', { class: 'chips' }, ...[[100, 100], [200, 200], [300, 300], [400, 400], [400, 430], [600, 400], [900, 600], [1300, 900]].map(([w, hh]) =>
        h('button', { class: 'chip' + (draft.workW === w && draft.workH === hh ? ' on' : ''), onClick: () => { draft.workW = w; draft.workH = hh; renderForm(); } }, `${w}×${hh}`)))),
      row('Machine origin', h('div', { class: 'origin-pick' }, ...[['tl', 'Top-left'], ['tr', 'Top-right'], ['bl', 'Bottom-left'], ['br', 'Bottom-right']].map(([k, v]) =>
        h('button', { class: draft.origin === k ? 'on' : '', onClick: () => set('origin', k) }, v)))),
      h('div', { class: 'sec-h' }, 'Controller'),
      row('Firmware', select(Object.fromEntries(Object.entries(CONTROLLERS).map(([k, v]) => [k, v.label])), draft.controller, v => {
        draft.controller = v;
        draft.sMax = CONTROLLERS[v].sMax;
        draft.laserMode = v === 'grbl-m3' ? 'M3' : 'M4';
        renderForm();
      })),
      !ctl.direct ? h('div', { class: 'note warn' }, 'This controller is not directly supported. Crafter can still design for this machine at the correct size and export SVG for the manufacturer\'s software (or LightBurn). If your machine has been upgraded to GRBL, pick GRBL above.') : null,
      ctl.direct ? row('Baud rate', select({ 9600: '9600', 57600: '57600', 115200: '115200', 230400: '230400', 250000: '250000', 921600: '921600' }, String(draft.baud), v => { draft.baud = +v; })) : null,
      ctl.gcode ? row('Max S value', num(draft.sMax, v => { draft.sMax = v; }, { min: 0.01, unit: 'S' })) : null,
      ctl.gcode && draft.controller !== 'smoothie' && draft.controller !== 'marlin' ? row('Laser mode', seg({ M4: 'M4 dynamic', M3: 'M3 constant' }, draft.laserMode, v => set('laserMode', v))) : null,
      row('Max speed', num(draft.maxSpeed, v => { draft.maxSpeed = v; }, { min: 100, unit: 'mm/min' })),
      row('Travel speed', num(draft.rapid, v => { draft.rapid = v; }, { min: 100, unit: 'mm/min' })),
      h('div', { class: 'sec-h' }, 'Job defaults'),
      row('Air assist', check(draft.airAssist, v => { draft.airAssist = v; }, 'Allow M8/M9 per layer')),
      row('Home first', check(draft.homeOnStart, v => { draft.homeOnStart = v; }, 'Home ($H / G28) before the job')),
      row('Return', check(draft.returnHome, v => { draft.returnHome = v; }, 'Return to origin when finished')),
      row('Frame power', num(draft.framePower, v => { draft.framePower = v; }, { min: 0, max: 5, unit: '%' })),
      row('Frame speed', num(draft.frameSpeed, v => { draft.frameSpeed = v; }, { min: 100, unit: 'mm/min' })),
      h('div', { class: 'sec-h' }, 'Custom G-code'),
      h('div', { class: 'small muted', style: { marginBottom: '4px' } }, 'Start'),
      h('textarea', { class: 'inp', rows: 2, onChange: e => { draft.startGcode = e.target.value; } }, draft.startGcode || ''),
      h('div', { class: 'small muted', style: { margin: '6px 0 4px' } }, 'End'),
      h('textarea', { class: 'inp', rows: 2, onChange: e => { draft.endGcode = e.target.value; } }, draft.endGcode || '')
    );
  }

  const search = h('input', { class: 'inp', placeholder: 'Search brand or model…', onInput: e => { filter.q = e.target.value; renderList(); } });
  const typeSeg = h('div');
  const renderTypeSeg = () => {
    typeSeg.innerHTML = '';
    typeSeg.appendChild(seg({ all: 'All', diode: 'Diode', co2: 'CO₂', fiber: 'Fiber', other: 'Other' }, filter.type, v => { filter.type = v; renderTypeSeg(); renderList(); }));
  };
  renderTypeSeg();

  const body = h('div', { class: 'prof' },
    h('div', { class: 'prof-list' }, h('div', { class: 'filters' }, search, typeSeg, countEl), listEl),
    formEl);

  renderList();
  renderForm();

  const dlg = openModal({
    title: welcome ? 'Choose your laser machine' : 'Machine profile & work area',
    body,
    width: '980px',
    buttons: [
      { label: 'Save as custom profile', onClick: () => {
        const id = 'custom::' + Date.now();
        state.customProfiles.push({ id, brand: 'Custom', model: draft.name, workW: draft.workW, workH: draft.workH, power: draft.power, type: draft.type, controller: draft.controller, device: { ...draft, profileId: id } });
        saveJSON('crafter.customProfiles', state.customProfiles);
        selectedId = id;
        renderList();
        toast('Custom profile saved');
        return false;
      } },
      ...(selectedId && selectedId.startsWith('custom::') ? [{ label: 'Delete profile', danger: true, onClick: () => {
        state.customProfiles = state.customProfiles.filter(p => p.id !== selectedId);
        saveJSON('crafter.customProfiles', state.customProfiles);
        renderList();
        return false;
      } }] : []),
      { label: 'Cancel' },
      { label: 'Use this machine', primary: true, onClick: () => applyDevice(draft) }
    ]
  });
  return dlg;
}

export function applyDevice(dev) {
  state.device = { ...dev };
  persistDevice();
  drawWorkArea();
  fitWorkArea();
  bus.emit('device');
  toast(`Machine: ${dev.name} — ${dev.workW}×${dev.workH} mm`);
}

// ================================================================ serial port chooser
export function openPortChooser(list) {
  let chosen = false;
  const body = list.length
    ? h('div', {}, h('div', { class: 'small muted', style: { marginBottom: '8px' } }, 'Select the serial port your laser is connected to:'),
      ...list.map(p => h('div', { class: 'model', onClick: () => { chosen = true; window.api.chooseSerialPort(p.portId); dlg.close(); } },
        h('span', {}, p.displayName || p.portName), h('small', {}, p.portName + (p.vendorId ? ` · VID ${p.vendorId}` : '')))))
    : h('div', { class: 'note warn' }, 'No serial ports found. Check the USB cable, power on the machine, and install the CH340/CP210x driver if needed.');
  const dlg = openModal({
    title: 'Connect to machine',
    body,
    width: '460px',
    buttons: [{ label: 'Cancel' }],
    onClose: () => { if (!chosen) window.api.chooseSerialPort(''); }
  });
}

// ================================================================ text
export async function openTextDialog(item, at) {
  const fonts = await listFonts();
  const spec = item && item.data.text ? { ...item.data.text } : {
    content: 'Crafter', font: await defaultFontPath(), size: 12, letterSpacing: 0, lineSpacing: 1.2, align: 'left'
  };
  if (!fonts.length && !spec.font) {
    const note = h('div', {}, h('div', { class: 'note warn' }, 'No system fonts were found. Load a .ttf or .otf file to continue.'));
    const inp = h('input', { type: 'file', accept: '.ttf,.otf', onChange: async () => {
      const f = inp.files[0];
      if (!f) return;
      spec.font = registerFontBuffer(f.name.replace(/\.\w+$/, ''), await f.arrayBuffer());
      d.close();
      openTextDialog(item, at);
    } });
    note.appendChild(inp);
    const d = openModal({ title: 'Text', body: note, buttons: [{ label: 'Close' }] });
    return;
  }
  const ta = h('textarea', { class: 'inp', rows: 3, style: { fontFamily: 'inherit', fontSize: '15px' } }, spec.content);
  const fontFilter = h('input', { class: 'inp', placeholder: 'Filter fonts…' });
  const fontListEl = h('div', { class: 'font-list' });
  const renderFonts = () => {
    fontListEl.innerHTML = '';
    const q = fontFilter.value.toLowerCase();
    for (const f of fonts.filter(x => !q || x.name.toLowerCase().includes(q)).slice(0, 400)) {
      fontListEl.appendChild(h('div', { class: f.path === spec.font ? 'sel' : '', onClick: () => { spec.font = f.path; renderFonts(); } }, f.name));
    }
    const s = fontListEl.querySelector('.sel');
    if (s) s.scrollIntoView({ block: 'nearest' });
  };
  fontFilter.addEventListener('input', renderFonts);
  fontFilter.addEventListener('keydown', e => e.stopPropagation());
  ta.addEventListener('keydown', e => e.stopPropagation());
  renderFonts();
  const loadBtn = h('input', { type: 'file', accept: '.ttf,.otf', style: { fontSize: '11px' }, onChange: async e => {
    const f = e.target.files[0];
    if (!f) return;
    spec.font = registerFontBuffer(f.name.replace(/\.\w+$/, ''), await f.arrayBuffer());
    fonts.splice(0, fonts.length, ...(await listFonts()));
    renderFonts();
  } });
  const alignSeg = h('div');
  const renderAlign = () => { alignSeg.innerHTML = ''; alignSeg.appendChild(seg({ left: 'Left', center: 'Center', right: 'Right' }, spec.align, v => { spec.align = v; renderAlign(); })); };
  renderAlign();
  const body = h('div', { style: { width: '460px' } },
    row('Text', ta),
    row('Font', h('div', { style: { width: '100%' } }, fontFilter, h('div', { style: { height: '6px' } }), fontListEl, h('div', { class: 'small muted', style: { marginTop: '6px' } }, 'Or load a font file: ', loadBtn))),
    row('Size', num(spec.size, v => { spec.size = v; }, { min: 0.5, unit: 'mm' })),
    row('Letter spacing', num(spec.letterSpacing, v => { spec.letterSpacing = v; }, { unit: 'mm' })),
    row('Line spacing', num(spec.lineSpacing, v => { spec.lineSpacing = v; }, { min: 0.5, step: 0.1, unit: '×' })),
    row('Align', alignSeg));
  openModal({
    title: item ? 'Edit text' : 'Add text',
    body,
    buttons: [
      { label: 'Cancel' },
      { label: item ? 'Update' : 'Add', primary: true, onClick: async () => {
        spec.content = ta.value;
        if (!spec.content.trim()) return false;
        try {
          const cp = await buildTextPath(spec);
          if (item) {
            const b = item.bounds;
            cp.data.layer = item.data.layer;
            cp.data.proc = item.data.proc;
            cp.bounds.topLeft = b.topLeft;
            item.replaceWith(cp);
            styleItem(cp);
            selectItems(cp);
            pushHistory();
          } else {
            cp.bounds.topLeft = at || new paper.Point(10, 10);
            addItem(cp);
          }
        } catch (e) {
          toast('Text failed: ' + e.message, 'err');
        }
      } }
    ]
  });
}

export function askText(title, label, value = '') {
  return new Promise(resolve => {
    let result = null;
    const inp = h('input', { class: 'inp', value });
    inp.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') { result = inp.value.trim(); d.close(); }
    });
    const d = openModal({
      title, width: '380px',
      body: row(label, inp),
      buttons: [{ label: 'Cancel' }, { label: 'OK', primary: true, onClick: () => { result = inp.value.trim(); } }],
      onClose: () => resolve(result || null)
    });
  });
}

// ================================================================ simple parameter dialogs
function paramDialog(title, fields, onOk) {
  const vals = Object.fromEntries(fields.map(f => [f.key, f.value]));
  const body = h('div', { style: { width: '360px' } }, ...fields.map(f => {
    if (f.type === 'check') return row(f.label, check(f.value, v => { vals[f.key] = v; }));
    if (f.type === 'select') return row(f.label, select(f.options, f.value, v => { vals[f.key] = v; }));
    return row(f.label, num(f.value, v => { vals[f.key] = v; }, { min: f.min, max: f.max, step: f.step, unit: f.unit }));
  }));
  openModal({ title, body, buttons: [{ label: 'Cancel' }, { label: 'Apply', primary: true, onClick: () => onOk(vals) }] });
}

const needSel = () => { if (!state.selection.length) { toast('Select something first.'); return false; } return true; };

export function openOffsetDialog() {
  if (!needSel()) return;
  paramDialog('Offset path', [
    { key: 'd', label: 'Distance', value: 2, unit: 'mm' },
    { key: 'join', label: 'Corners', type: 'select', options: { round: 'Round', miter: 'Sharp', bevel: 'Bevel' }, value: 'round' },
    { key: 'keep', label: 'Keep original', type: 'check', value: true }
  ], v => ops.offsetPath(v.d, v.keep, v.join));
}

export function openGridArrayDialog() {
  if (!needSel()) return;
  paramDialog('Grid array', [
    { key: 'cols', label: 'Columns', value: 3, min: 1, step: 1 },
    { key: 'rows', label: 'Rows', value: 2, min: 1, step: 1 },
    { key: 'gx', label: 'Horizontal gap', value: 5, unit: 'mm' },
    { key: 'gy', label: 'Vertical gap', value: 5, unit: 'mm' }
  ], v => ops.gridArray(Math.round(v.rows), Math.round(v.cols), v.gx, v.gy));
}

export function openCircArrayDialog() {
  if (!needSel()) return;
  paramDialog('Circular array', [
    { key: 'n', label: 'Copies (total)', value: 8, min: 2, step: 1 },
    { key: 'r', label: 'Radius', value: 40, min: 1, unit: 'mm' },
    { key: 'rot', label: 'Rotate copies', type: 'check', value: true }
  ], v => ops.circularArray(Math.round(v.n), v.r, v.rot));
}

export function openTraceDialog() {
  const r = state.selection.find(i => i.className === 'Raster');
  if (!r) { toast('Select an image to trace.'); return; }
  paramDialog('Trace image to vectors', [
    { key: 'threshold', label: 'Threshold', value: 128, min: 1, max: 254, step: 1 },
    { key: 'detail', label: 'Smoothing', value: 1, min: 0.1, max: 10, step: 0.1 },
    { key: 'invert', label: 'Invert', type: 'check', value: false },
    { key: 'hide', label: 'Hide image after', type: 'check', value: false }
  ], async v => {
    await ops.traceImage(r, v);
    if (v.hide) { r.remove(); pushHistory(); }
  });
}

// ================================================================ materials
export function openMaterialsDialog() {
  let setKey = materialSetFor(state.device);
  const layer = getLayer(state.activeLayer);
  const tableWrap = h('div', { style: { maxHeight: '52vh', overflow: 'auto' } });
  const render = () => {
    tableWrap.innerHTML = '';
    const items = setKey === 'user' ? state.userMaterials : MATERIAL_SETS[setKey].items;
    if (!items.length) { tableWrap.appendChild(h('div', { class: 'note' }, 'No saved presets yet. Use “Save active layer as preset”.')); return; }
    tableWrap.appendChild(h('table', { class: 'tbl' },
      h('tr', {}, ...['Material', 'Thickness', 'Operation', 'Mode', 'Power', 'Speed', 'Passes', 'Interval', ''].map(t => h('th', {}, t))),
      ...items.map((m, idx) => h('tr', {},
        h('td', {}, m.material), h('td', {}, m.thickness), h('td', {}, m.op), h('td', {}, h('span', { class: 'badge ' + m.mode }, m.mode)),
        h('td', {}, m.power + '%'), h('td', {}, m.speed), h('td', {}, m.passes), h('td', {}, m.interval),
        h('td', {}, h('button', { class: 'btn small primary', onClick: () => {
          Object.assign(layer, { mode: m.mode, power: m.power, speed: m.speed, passes: m.passes, interval: m.interval, name: `${m.material} ${m.op}`.slice(0, 40) });
          bus.emit('layers');
          ed.design.children.forEach(styleItem);
          toast(`Applied “${m.material} – ${m.op}” to ${layer.name}`);
        } }, 'Apply'), setKey === 'user' ? h('button', { class: 'mini', title: 'Delete', onClick: () => {
          state.userMaterials.splice(idx, 1);
          saveJSON('crafter.userMaterials', state.userMaterials);
          render();
        } }, '✕') : null)
      ))));
  };
  const sets = { ...Object.fromEntries(Object.entries(MATERIAL_SETS).map(([k, v]) => [k, v.label])), user: 'My presets' };
  const setSel = select(sets, setKey, v => { setKey = v; render(); });
  setSel.style.width = '220px';
  render();
  openModal({
    title: 'Material library',
    width: '860px',
    body: h('div', {},
      h('div', { class: 'row' }, h('label', {}, 'Laser class'), h('div', { class: 'ctl' }, setSel,
        h('span', { class: 'muted small' }, `Applies to active layer: `, h('b', { style: { color: layer.color } }, '■ '), layer.name))),
      h('div', { class: 'note warn' }, 'Values are starting points only. Materials, focus and machines vary — always run a material test first and never leave a laser unattended.'),
      tableWrap),
    buttons: [
      { label: 'Save active layer as preset', onClick: async () => {
        const name = await askText('Save preset', 'Material name', layer.name);
        if (!name) return false;
        state.userMaterials.push({ material: name, thickness: '—', op: layer.mode === 'line' ? 'Cut' : 'Engrave', mode: layer.mode, power: layer.power, speed: layer.speed, passes: layer.passes, interval: layer.interval });
        saveJSON('crafter.userMaterials', state.userMaterials);
        setKey = 'user';
        setSel.value = 'user';
        render();
        return false;
      } },
      { label: 'Close', primary: true }
    ]
  });
}

// ================================================================ material test
export function openMaterialTestDialog() {
  const v = { mode: 'fill', pMin: 10, pMax: 100, pSteps: 5, sMin: 1000, sMax: 5000, sSteps: 5, cell: 8, gap: 3, interval: 0.1, labels: true };
  const body = h('div', { style: { width: '420px' } },
    h('div', { class: 'note' }, 'Creates a grid of squares — power increases left → right, speed top → bottom. Each square carries its own settings.'),
    row('Mode', select({ fill: 'Fill (engrave)', line: 'Line (cut/score)' }, v.mode, x => { v.mode = x; })),
    row('Power from', num(v.pMin, x => { v.pMin = x; }, { min: 0, max: 100, unit: '%' })),
    row('Power to', num(v.pMax, x => { v.pMax = x; }, { min: 0, max: 100, unit: '%' })),
    row('Power steps', num(v.pSteps, x => { v.pSteps = Math.round(x); }, { min: 2, max: 12, step: 1 })),
    row('Speed from', num(v.sMin, x => { v.sMin = x; }, { min: 1, unit: 'mm/min' })),
    row('Speed to', num(v.sMax, x => { v.sMax = x; }, { min: 1, unit: 'mm/min' })),
    row('Speed steps', num(v.sSteps, x => { v.sSteps = Math.round(x); }, { min: 2, max: 12, step: 1 })),
    row('Square size', num(v.cell, x => { v.cell = x; }, { min: 2, unit: 'mm' })),
    row('Gap', num(v.gap, x => { v.gap = x; }, { min: 0, unit: 'mm' })),
    row('Line interval', num(v.interval, x => { v.interval = x; }, { min: 0.01, step: 0.01, unit: 'mm' })),
    row('Labels', check(v.labels, x => { v.labels = x; }, 'Engrave power/speed labels')));
  openModal({
    title: 'Material test generator', body,
    buttons: [{ label: 'Cancel' }, { label: 'Create', primary: true, onClick: () => createMaterialTest(v) }]
  });
}

async function createMaterialTest(v) {
  const used = new Set(ed.design.getItems({}).map(i => i.data && i.data.layer).filter(Boolean));
  const free = state.layers.filter(l => !used.has(l.id));
  if (free.length < 2) { toast('Not enough free layers for the test.', 'err'); return; }
  const testLayer = free[0], labelLayer = free[1];
  Object.assign(testLayer, { name: 'Material test', mode: v.mode, interval: v.interval, passes: 1, output: true, visible: true });
  Object.assign(labelLayer, { name: 'Test labels', mode: 'line', power: Math.max(10, v.pMin), speed: Math.max(v.sMax, 1500), passes: 1, output: true, visible: true });
  const g = new paper.Group({ insert: false });
  const x0 = v.labels ? 16 : 0, y0 = v.labels ? 10 : 0;
  const step = v.cell + v.gap;
  for (let r = 0; r < v.sSteps; r++) {
    const speed = Math.round(v.sMin + ((v.sMax - v.sMin) * r) / (v.sSteps - 1));
    for (let c = 0; c < v.pSteps; c++) {
      const power = Math.round(v.pMin + ((v.pMax - v.pMin) * c) / (v.pSteps - 1));
      const sq = new paper.Path.Rectangle({ point: [x0 + c * step, y0 + r * step], size: [v.cell, v.cell], insert: false });
      sq.data = { layer: testLayer.id, proc: { enabled: true, power, speed, passes: 1 } };
      g.addChild(sq);
    }
  }
  if (v.labels) {
    try {
      const font = await defaultFontPath();
      if (font) {
        const sz = Math.min(3, v.cell * 0.4);
        for (let c = 0; c < v.pSteps; c++) {
          const power = Math.round(v.pMin + ((v.pMax - v.pMin) * c) / (v.pSteps - 1));
          const t = await buildTextPath({ content: `${power}%`, font, size: sz, align: 'left' });
          t.bounds.center = new paper.Point(x0 + c * step + v.cell / 2, y0 - sz);
          t.data = { layer: labelLayer.id };
          g.addChild(t);
        }
        for (let r = 0; r < v.sSteps; r++) {
          const speed = Math.round(v.sMin + ((v.sMax - v.sMin) * r) / (v.sSteps - 1));
          const t = await buildTextPath({ content: String(speed), font, size: sz, align: 'right' });
          t.bounds.rightCenter = new paper.Point(x0 - 2, y0 + r * step + v.cell / 2);
          t.data = { layer: labelLayer.id };
          g.addChild(t);
        }
      }
    } catch (e) {
      toast('Labels skipped: ' + e.message, 'warn');
    }
  }
  g.bounds.topLeft = new paper.Point(5, 5);
  addItem(g);
  bus.emit('layers');
  toast('Material test created. Review the “Test labels” layer settings before running.');
}

// ================================================================ help
export function openShortcuts() {
  const rows = [
    ['V', 'Select / transform'], ['N', 'Edit nodes'], ['R', 'Rectangle'], ['E', 'Ellipse'], ['P', 'Polygon'], ['S', 'Star'],
    ['L', 'Line'], ['B', 'Pen (Bézier)'], ['F', 'Freehand pencil'], ['T', 'Text'], ['Space + drag / middle mouse', 'Pan'],
    ['Mouse wheel', 'Zoom'], ['Shift + wheel', 'Scroll horizontally'], ['5 / 3', 'Zoom to work area / selection'],
    ['Ctrl+Z / Ctrl+Y', 'Undo / redo'], ['Ctrl+C / X / V / D', 'Copy / cut / paste / duplicate'], ['Delete', 'Delete'],
    ['Ctrl+G / Ctrl+Shift+G', 'Group / ungroup'], ['Ctrl+K / Ctrl+Shift+K', 'Combine / break apart'],
    ['Ctrl++ / Ctrl+-', 'Union / difference'], ['H / Shift+H', 'Flip horizontal / vertical'],
    ['Arrows', 'Nudge 1 mm (Shift 10 mm, Alt 0.1 mm)'], ['Shift while dragging', 'Constrain / keep proportions off'],
    ['Alt + drag', 'Duplicate while moving'], ['Double-click', 'Edit text / nodes'], ['Home / End / PgUp / PgDn', 'Arrange'],
    ['Alt+P', 'Toolpath preview'], ['F5', 'Start job'], ['%', 'Toggle snap to grid']
  ];
  openModal({
    title: 'Keyboard shortcuts', width: '560px',
    body: h('table', { class: 'tbl' }, ...rows.map(([k, d]) => h('tr', {}, h('td', {}, h('kbd', {}, k)), h('td', {}, d)))),
    buttons: [{ label: 'Close', primary: true }]
  });
}

export async function openAbout() {
  const version = window.api && window.api.appVersion ? await window.api.appVersion() : '';
  openModal({
    title: 'About Crafter', width: '480px',
    body: h('div', {},
      h('img', { class: 'logo-hero', src: 'assets/logo.png', alt: 'Crafter' }),
      h('p', { class: 'center' }, h('b', {}, 'Crafter'), version ? ` ${version}` : '', ' — laser design & control studio.'),
      h('p', { class: 'muted' }, `Machine database: ${MACHINES.length} profiles from ${BRANDS.length} brands, plus unlimited custom profiles.`),
      h('p', { class: 'muted' }, 'Direct USB control: GRBL, grblHAL/FluidNC, Marlin, Smoothieware. Other controllers: design and export.'),
      h('p', { class: 'muted small' }, 'Built with Electron, paper.js, opentype.js, dxf-parser and imagetracerjs.'),
      h('p', { class: 'muted small' }, 'Library icons: Tabler Icons (MIT, © Paweł Kuna) and Material Design Icons (Apache-2.0, Pictogrammers).'),
      h('p', { class: 'muted small' }, 'Crafter is released under the ISC licence and comes with no warranty.'),
      h('div', { class: 'note warn' }, 'Laser safety: always wear eye protection rated for your laser\'s wavelength, never leave a running laser unattended, and keep a fire extinguisher nearby.')),
    buttons: [{ label: 'Close', primary: true }]
  });
}

export { fmtNum };
