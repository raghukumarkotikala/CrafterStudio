// Modal dialogs.
/* global paper */
import { h, openModal, row, num, select, check, seg, toast, fmtNum, appendAll } from './dom.js';
import { state, bus, persistDevice, saveJSON, getLayer } from './state.js';
import { MACHINES, BRANDS, CONTROLLERS, LASER_TYPES, deviceFromProfile } from './profiles.js';
import { MATERIAL_SETS, materialSetFor } from './materials.js';
import { ed, drawWorkArea, fitWorkArea, addItem, pushHistory, select as selectItems, styleItem } from './editor.js';
import { buildTextPath, listFonts, defaultFontPath, registerFontBuffer } from './text.js';
import * as ops from './ops.js';
import { machine } from './machine.js';
import { codeTypes, encode, matrixToItem, moduleSize, defaultCodeSize } from './barcode.js';
import * as vars from './variables.js';
import { describeRuida, DEFAULT_MAGIC } from './ruida.js';

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
      welcome ? h('img', { class: 'logo-hero', src: 'assets/logo.png', alt: 'Crafter Studio', style: { width: '140px', height: '140px' } }) : null,
      welcome ? h('div', { class: 'note' }, 'Welcome to Crafter Studio! Pick your machine from the list (or build a custom one), check the work area, then press “Use this machine”. You can change it any time from the device button in the top bar.') : null,
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
      !ctl.direct ? h('div', { class: 'note warn' }, 'This controller is not directly supported. Crafter Studio can still design for this machine at the correct size and export SVG for the manufacturer\'s software (or LightBurn). If your machine has been upgraded to GRBL, pick GRBL above.') : null,
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
    content: 'Crafter Studio', font: await defaultFontPath(), size: 12, letterSpacing: 0, lineSpacing: 1.2, align: 'left'
  };
  spec.arc = { angle: 0, flip: false, ...(spec.arc || {}) };
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
    row('Align', alignSeg),
    h('div', { class: 'sec-h' }, 'Curve'),
    row('Arc', num(spec.arc.angle, v => { spec.arc.angle = v; }, { min: -355, max: 355, step: 5, unit: '°' })),
    row('', check(spec.arc.flip, v => { spec.arc.flip = v; }, 'Read along the inside')),
    h('div', { class: 'small muted' }, '0° is straight. Positive bends the text over a circle, negative bends it under. The wider the angle, the tighter the curve.'));
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

// ================================================================ 2D codes
export async function openCodeDialog() {
  let types;
  try {
    types = await codeTypes();
  } catch (e) {
    toast('Codes are unavailable: ' + e.message, 'err');
    return;
  }
  const v = { type: 'qrcode', text: 'https://www.crafterstudio.in', size: defaultCodeSize(), quiet: 2 };
  let matrix = null;

  const preview = h('div', { class: 'ai-preview', style: { minHeight: '150px' } });
  const info = h('div', { class: 'small muted', style: { marginTop: '6px' } });
  const warn = h('div', {});

  const draw = () => {
    preview.innerHTML = '';
    warn.innerHTML = '';
    if (!matrix) { info.textContent = ''; return; }
    const { w, h: hh, rows } = matrix;
    // Render the preview with its quiet zone, which is how a scanner sees it.
    const q = v.quiet;
    const span = w + 2 * q;
    let r = '';
    for (let y = 0; y < hh; y++) {
      for (let x = 0; x < w; x++) {
        if (rows[y][x] === '1') r += `<rect x="${x + q}" y="${y + q}" width="1.02" height="1.02"/>`;
      }
    }
    preview.innerHTML = `<svg viewBox="0 0 ${span} ${span}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="${span}" height="${span}" fill="#fff"/><g fill="#000">${r}</g></svg>`;

    const mm = moduleSize(matrix, v.size);
    info.textContent = `${matrix.type} · ${w}×${hh} modules · ${mm.toFixed(2)} mm per module · ${(v.size + 2 * q * mm).toFixed(1)} mm including the quiet zone`;
    // Below roughly a third of a millimetre, a diode spot bridges adjacent
    // modules and the code stops scanning.
    if (mm < 0.35) {
      warn.appendChild(h('div', { class: 'note warn' },
        `At ${mm.toFixed(2)} mm per module this is finer than most lasers can resolve — the modules will bleed together and it is unlikely to scan. Increase the size or shorten the text.`));
    }
  };

  const refresh = async () => {
    try {
      matrix = await encode(v.type, v.text);
      draw();
    } catch (e) {
      matrix = null;
      preview.innerHTML = '';
      info.textContent = '';
      warn.innerHTML = '';
      warn.appendChild(h('div', { class: 'note warn' }, e.message));
    }
  };

  const ta = h('textarea', { class: 'inp', rows: 3 }, v.text);
  ta.addEventListener('keydown', e => e.stopPropagation());
  ta.addEventListener('input', () => { v.text = ta.value; refresh(); });

  const body = h('div', { style: { width: '460px' } },
    row('Type', select(types, v.type, x => { v.type = x; refresh(); })),
    row('Content', ta),
    row('Size', num(v.size, x => { v.size = x; draw(); }, { min: 5, max: 400, unit: 'mm' })),
    row('Quiet zone', num(v.quiet, x => { v.quiet = Math.round(x); draw(); }, { min: 0, max: 8, step: 1, unit: 'mod' })),
    preview, info, warn,
    h('div', { class: 'note', html: 'Put codes on a <b>Fill</b> layer so the dark modules are engraved solid. Always scan a test piece before committing to a batch: contrast and module size both decide whether it reads.' }));

  await refresh();

  openModal({
    title: 'Insert a 2D code',
    body,
    width: '520px',
    buttons: [
      { label: 'Cancel' },
      { label: 'Insert', primary: true, onClick: () => {
        if (!matrix) { toast('Nothing encoded yet.', 'err'); return false; }
        try {
          const item = matrixToItem(matrix, { size: v.size, quiet: v.quiet });
          item.bounds.topLeft = new paper.Point(10, 10);
          addItem(item);
          toast(`${matrix.w}×${matrix.h} ${v.type} inserted. Engrave it on a Fill layer.`);
        } catch (e) {
          toast('Could not build the code: ' + e.message, 'err');
          return false;
        }
      } }
    ]
  });
}

// ================================================================ text on a path
function splitTextAndGuide() {
  const txt = state.selection.find(i => i.data && i.data.text);
  const guide = state.selection.find(i => i !== txt && (i.className === 'Path' || i.className === 'CompoundPath'));
  return { txt, guide };
}

export async function openTextOnPathDialog() {
  const { txt, guide } = splitTextAndGuide();
  if (!txt) { toast('Select a text object and the path it should follow.'); return; }
  if (!guide && !(txt.data.text.onPath && txt.data.text.onPath.d)) {
    toast('Also select the path the text should follow.');
    return;
  }

  // Snapshot the guide in document coordinates. Keeping the geometry rather
  // than a reference means the text survives the guide being deleted, and
  // still rebuilds when the wording changes.
  let d = txt.data.text.onPath && txt.data.text.onPath.d;
  let total = 0;
  if (guide) {
    const line = guide.className === 'CompoundPath' ? guide.children[0] : guide;
    const c = line.clone({ insert: false });
    c.transform(line.parent ? line.parent.globalMatrix : new paper.Matrix());
    d = c.pathData;
    total = c.length;
  } else {
    const c = new paper.Path({ pathData: d, insert: false });
    total = c.length;
  }

  const cur = txt.data.text.onPath || {};
  const v = { offset: +cur.offset || 0, flip: !!cur.flip };

  const apply = async () => {
    const spec = { ...txt.data.text, onPath: { d, offset: v.offset, flip: v.flip } };
    try {
      const cp = await buildTextPath(spec);
      cp.data.layer = txt.data.layer;
      cp.data.proc = txt.data.proc;
      txt.replaceWith(cp);
      styleItem(cp);
      selectItems(cp);
      pushHistory();
    } catch (e) {
      toast('Could not fit the text: ' + e.message, 'err');
      return false;
    }
  };

  openModal({
    title: 'Fit text to a path',
    width: '420px',
    body: h('div', {},
      h('div', { class: 'note' }, `Guide is ${total.toFixed(1)} mm long. The text flows from the start of the path; if it is longer than the guide it piles up at the far end.`),
      row('Start at', num(v.offset, x => { v.offset = x; }, { min: -1000, max: 10000, step: 0.5, unit: 'mm' })),
      row('Side', check(v.flip, x => { v.flip = x; }, 'Other side, reading the other way')),
      h('div', { class: 'small muted' }, 'The guide path itself is still a normal object — put it on a layer with Output off, or delete it, once you are happy.')),
    buttons: [
      { label: 'Remove from path', onClick: async () => {
        const spec = { ...txt.data.text };
        delete spec.onPath;
        const cp = await buildTextPath(spec);
        cp.data.layer = txt.data.layer;
        cp.bounds.topLeft = txt.bounds.topLeft;
        txt.replaceWith(cp);
        styleItem(cp);
        selectItems(cp);
        pushHistory();
      } },
      { label: 'Cancel' },
      { label: 'Apply', primary: true, onClick: apply }
    ]
  });
}

// ================================================================ variable text
/** Rebuild every text object whose content contains a placeholder. */
export async function refreshVariableText() {
  const items = ed.design.getItems({ match: i => i.data && i.data.text && vars.hasVariables(i.data.text.content) });
  let done = 0;
  for (const it of items) {
    try {
      const cp = await buildTextPath({ ...it.data.text });
      cp.data.layer = it.data.layer;
      cp.data.proc = it.data.proc;
      // Keep the object where the user put it: the resolved words are a
      // different width, and re-anchoring by top-left would shuffle a row of
      // tags out of alignment.
      const b = it.bounds;
      const align = it.data.text.align;
      cp.bounds[align === 'center' ? 'center' : align === 'right' ? 'rightCenter' : 'leftCenter'] =
        b[align === 'center' ? 'center' : align === 'right' ? 'rightCenter' : 'leftCenter'];
      it.replaceWith(cp);
      styleItem(cp);
      done++;
    } catch (e) {
      toast('Could not update a text object: ' + e.message, 'err');
    }
  }
  if (done) { pushHistory(); bus.emit('changed'); }
  bus.emit('variables');
  return done;
}

export function openVariableTextDialog() {
  const st = vars.mergeState();
  const body = h('div', { style: { width: '520px' } });

  const variableItems = () => ed.design.getItems({ match: i => i.data && i.data.text && vars.hasVariables(i.data.text.content) });

  const render = () => {
    body.innerHTML = '';
    const items = variableItems();
    const rowCount = st.rows.length;

    const nav = h('div', { class: 'ctl' },
      h('button', { class: 'btn small', onClick: async () => { vars.setIndex(st.index - 1); await refreshVariableText(); render(); } }, '‹ Prev'),
      h('span', { style: { minWidth: '110px', textAlign: 'center' } },
        rowCount ? `Row ${st.index + 1} of ${rowCount}` : 'No data loaded'),
      h('button', { class: 'btn small', onClick: async () => { vars.setIndex(st.index + 1); await refreshVariableText(); render(); } }, 'Next ›'));

    const unknown = [...new Set(items.flatMap(i => vars.unknownTokens(i.data.text.content)))];

    appendAll(body,
      h('div', { class: 'note', html: 'Put placeholders in any text object: <b>{{Name}}</b> for a CSV column, <b>{{serial}}</b> for a running number, <b>{{date}}</b> or <b>{{date:DD/MM/YYYY}}</b>, plus <b>{{index}}</b> and <b>{{count}}</b>.' }),

      h('div', { class: 'sec-h' }, 'Data'),
      h('div', { class: 'row' }, h('label', {}, 'CSV file'), h('div', { class: 'ctl' },
        h('button', { class: 'btn small', onClick: async () => {
          if (!window.api) { toast('Loading a CSV needs the desktop app.'); return; }
          const f = await window.api.openFile({ filters: [{ name: 'CSV', extensions: ['csv', 'txt'] }] });
          if (!f) return;
          const { headers, rows } = vars.parseCSV(f.text || '');
          if (!rows.length) { toast('That file has no data rows.', 'err'); return; }
          vars.setRows(headers, rows, f.name);
          await refreshVariableText();
          bus.emit('variables');
          render();
          toast(`Loaded ${rows.length} rows: ${headers.join(', ')}`);
        } }, 'Load CSV…'),
        h('span', { class: 'muted small' }, st.fileName || 'none'),
        st.rows.length ? h('button', { class: 'mini', title: 'Unload', onClick: async () => { vars.clearRows(); await refreshVariableText(); render(); } }, '✕') : null)),
      st.headers.length ? h('div', { class: 'small muted', style: { margin: '-4px 0 8px 116px' } },
        'Columns: ' + st.headers.map(x => `{{${x}}}`).join('  ')) : null,
      h('div', { class: 'row' }, h('label', {}, 'Row'), nav),

      h('div', { class: 'sec-h' }, 'Serial number'),
      row('Start at', num(st.serialStart, async v => { vars.setSerial({ start: v }); await refreshVariableText(); render(); }, { step: 1 })),
      row('Step by', num(st.serialStep, async v => { vars.setSerial({ step: v }); await refreshVariableText(); render(); }, { step: 1 })),
      row('Pad to', num(st.serialPad, async v => { vars.setSerial({ padding: v }); await refreshVariableText(); render(); }, { min: 0, max: 12, step: 1, unit: 'digits' })),

      h('div', { class: 'sec-h' }, `Preview — ${items.length} variable text object${items.length === 1 ? '' : 's'}`),
      items.length
        ? h('table', { class: 'tbl' },
          h('tr', {}, h('th', {}, 'Template'), h('th', {}, 'Becomes')),
          ...items.slice(0, 12).map(i => h('tr', {},
            h('td', {}, h('code', {}, i.data.text.content)),
            h('td', {}, vars.resolve(i.data.text.content)))))
        : h('div', { class: 'note' }, 'No text objects contain placeholders yet. Add one with the Text tool, typing something like “Part {{serial}}”.'),
      unknown.length
        ? h('div', { class: 'note warn' }, `Not recognised: ${unknown.map(t => `{{${t}}}`).join(', ')}. These are left as written rather than engraved blank — load a CSV with matching columns, or correct the spelling.`)
        : null,
      h('div', { class: 'note' }, 'Step to the next row between pieces: swap the workpiece, press Next, then run the job again.'));
  };

  render();
  openModal({ title: 'Variable text', body, width: '560px', buttons: [{ label: 'Close', primary: true }] });
}

/**
 * Shown before a Ruida .rd file is written. Everything in the table is read
 * back out of the finished bytes, not taken from the plan that produced them:
 * if the writer is wrong, the wrong numbers appear here rather than on a
 * 100 W machine.
 */
export function openRuidaSummary(name, out, got) {
  const mm = v => (v == null ? '—' : fmtNum(v / 1000, 2) + ' mm');
  const dev = state.device;
  return new Promise(resolve => {
    let decided = false;
    const magicRow = row('Scramble key', num(+dev.ruidaMagic || DEFAULT_MAGIC, v => {
      dev.ruidaMagic = Math.max(0, Math.min(255, Math.round(v)));
      persistDevice();
    }, { min: 0, max: 255, step: 1 }), h('span', { class: 'muted small' },
      'Leave at 136 (0x88) unless your machine refuses the file.'));

    const b = got.bounds || {};
    const body = h('div', { style: { width: '520px' } },
      h('div', { class: 'note warn' },
        h('b', {}, 'Not verified against hardware. '),
        'Crafter Studio has never been run against a Ruida controller. Open this file in RDWorks or LightBurn first, look at the geometry and the layer settings, and run it with the lid open before you cut anything.'),
      dev.controller !== 'ruida'
        ? h('div', { class: 'note warn' }, `${dev.name} is set to “${dev.controller}”, not Ruida. The file will be written anyway.`)
        : null,
      h('div', { class: 'sec-h' }, 'What was written'),
      h('table', { class: 'tbl' },
        h('tr', {}, h('th', {}, 'File'), h('td', {}, name)),
        h('tr', {}, h('th', {}, 'Size'), h('td', {}, `${(out.bytes.length / 1024).toFixed(1)} kB`)),
        h('tr', {}, h('th', {}, 'Cuts'), h('td', {}, `${got.counts.cut.toLocaleString()} cutting moves, ${got.counts.move.toLocaleString()} travels`)),
        h('tr', {}, h('th', {}, 'Encoding'), h('td', {}, `${got.counts.rel.toLocaleString()} relative, ${got.counts.abs.toLocaleString()} absolute`)),
        h('tr', {}, h('th', {}, 'Extent'), h('td', {}, got.extent
          ? `${mm(got.extent.x0)} … ${mm(got.extent.x1)} across, ${mm(got.extent.y0)} … ${mm(got.extent.y1)} down` : '—')),
        h('tr', {}, h('th', {}, 'Declared box'), h('td', {}, `${mm(b.x0)}, ${mm(b.y0)} to ${mm(b.x1)}, ${mm(b.y1)}`)),
        h('tr', {}, h('th', {}, 'Ends properly'), h('td', {}, got.end ? 'yes' : 'no — the file has no end marker'))),
      h('div', { class: 'sec-h' }, 'Layers, read back from the file'),
      h('table', { class: 'tbl' },
        h('tr', {}, h('th', {}, '#'), h('th', {}, 'Name'), h('th', {}, 'Speed'), h('th', {}, 'Power'), h('th', {}, 'Colour')),
        ...got.layers.map(L => {
          const mine = state.layers.find(x => x.color && colourMatches(x.color, L.colour));
          return h('tr', {},
            h('td', {}, String(L.index + 1)),
            h('td', {}, mine ? mine.name : '—'),
            h('td', {}, L.speed == null ? '—' : `${Math.round(L.speed)} mm/min`),
            h('td', {}, L.power == null ? '—' : `${fmtNum(L.minPower || 0, 0)}–${fmtNum(L.power, 0)}%`),
            h('td', {}, mine ? h('span', { style: { color: mine.color } }, '■') : '—'));
        })),
      got.unknown.length
        ? h('div', { class: 'note warn' }, `${got.unknown.length} byte${got.unknown.length === 1 ? '' : 's'} could not be read back. The file is probably malformed — please report it.`)
        : null,
      h('div', { class: 'sec-h' }, 'Machine'),
      magicRow);

    openModal({
      title: 'Export Ruida job file',
      body,
      width: '580px',
      onClose: () => { if (!decided) resolve(false); },
      buttons: [
        { label: 'Cancel', onClick: () => { decided = true; resolve(false); } },
        { label: 'Save file', primary: true, onClick: () => { decided = true; resolve(true); } }
      ]
    });
  });
}

// The file stores colour as blue-green-red, so a match has to be made the same
// way round rather than by comparing the hex string.
function colourMatches(hex, bgr) {
  if (bgr == null) return false;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  return (((n & 0xFF) << 16) | (n & 0xFF00) | ((n >> 16) & 0xFF)) === bgr;
}

// ================================================================ materials
export function openSimplifyDialog() {
  if (!state.selection.length) { toast('Select something first.'); return; }
  paramDialog('Simplify paths', [
    { key: 't', label: 'Tolerance', value: 0.05, min: 0.001, max: 5, step: 0.01, unit: 'mm' }
  ], v => ops.simplifyPaths(v.t));
}

export function openDuplicatesDialog() {
  if (!state.selection.length) { toast('Select something first.'); return; }
  paramDialog('Remove duplicate paths', [
    { key: 't', label: 'Tolerance', value: 0.05, min: 0.001, max: 2, step: 0.01, unit: 'mm' }
  ], v => ops.removeDuplicates(v.t));
}

/**
 * Reports rather than fixes. Each finding can be selected on the canvas, so
 * the user decides what to do about it with the tools that already exist.
 */
export function openDataCheckDialog() {
  const scoped = state.selection.length > 0;
  const r = ops.dataCheck({ onlySelection: scoped });
  const body = h('div', { style: { width: '520px' } });

  if (!r.total) {
    appendAll(body, h('div', { class: 'note' }, 'Nothing to check — the drawing is empty.'));
  } else if (!r.findings.length) {
    appendAll(body,
      h('div', { class: 'note' }, `Checked ${r.total} path${r.total === 1 ? '' : 's'}${scoped ? ' in the selection' : ''}. Nothing to report.`),
      h('div', { class: 'small muted' }, 'Closed contours, nothing doubled up, nothing crossing itself, everything on the bed.'));
  } else {
    appendAll(body,
      h('div', { class: 'note' }, `Checked ${r.total} path${r.total === 1 ? '' : 's'}${scoped ? ' in the selection' : ''}.`),
      h('table', { class: 'tbl' },
        h('tr', {}, h('th', {}, 'What'), h('th', {}, 'How many'), h('th', {}, '')),
        ...r.findings.map(f => h('tr', {},
          h('td', {}, h('b', {}, f.label), h('small', { class: 'muted', style: { display: 'block' } }, f.note)),
          h('td', {}, String(f.items.length)),
          h('td', {}, h('button', { class: 'btn small', onClick: () => {
            selectItems(f.items.filter(i => i.parent));
            toast(`Selected ${f.items.length} · ${f.label.toLowerCase()}`);
          } }, 'Select'))))),
      h('div', { class: 'note warn' }, 'Nothing here has been changed. Pick a row, see what it caught, and fix it with the tool that suits.'));
  }

  openModal({ title: 'Check the drawing', body, width: '580px', buttons: [{ label: 'Close', primary: true }] });
}

export function openJoinDialog() {
  if (!state.selection.length) { toast('Select something first.'); return; }
  paramDialog('Join open paths', [
    { key: 't', label: 'Gap tolerance', value: 0.1, min: 0.001, max: 5, step: 0.01, unit: 'mm' }
  ], v => ops.joinPaths(v.t));
}

export function openMaterialsDialog() {
  let setKey = materialSetFor(state.device);
  const layer = getLayer(state.activeLayer);
  const tableWrap = h('div', { style: { maxHeight: '52vh', overflow: 'auto' } });
  const render = () => {
    tableWrap.innerHTML = '';
    const items = setKey === 'user' ? state.userMaterials : MATERIAL_SETS[setKey].items;
    if (!items.length) { tableWrap.appendChild(h('div', { class: 'note' }, 'No saved presets yet. Use “Save active layer as preset”.')); return; }
    const setNote = setKey !== 'user' && MATERIAL_SETS[setKey].note;
    if (setNote) tableWrap.appendChild(h('div', { class: 'note warn' }, setNote));
    tableWrap.appendChild(h('table', { class: 'tbl' },
      h('tr', {}, ...['Material', 'Thickness', 'Operation', 'Mode', 'Power', 'Speed', 'Passes', 'Interval', ''].map(t => h('th', {}, t))),
      ...items.map((m, idx) => m.danger
        ? h('tr', { class: 'danger-row' },
          h('td', { colspan: 8 }, h('b', {}, m.material), ' — ', h('span', { class: 'badge danger' }, 'never laser'), ' ', h('span', { class: 'muted' }, m.note)),
          h('td', {}))
        : h('tr', {},
          h('td', {}, m.material, m.note ? h('small', { class: 'muted', style: { display: 'block' } }, m.note) : null),
          h('td', {}, m.thickness), h('td', {}, m.op), h('td', {}, h('span', { class: 'badge ' + m.mode }, m.mode)),
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
    ['L', 'Line'], ['B', 'Pen (Bézier)'], ['F', 'Freehand pencil'], ['T', 'Text'], ['W', 'Envelope — distort text by its corners'], ['M', 'Measure a distance'], ['Space + drag / middle mouse', 'Pan'],
    ['Mouse wheel', 'Zoom'], ['Shift + wheel', 'Scroll horizontally'], ['5 / 3', 'Zoom to work area / selection'],
    ['Ctrl+Z / Ctrl+Y', 'Undo / redo'], ['Ctrl+C / X / V / D', 'Copy / cut / paste / duplicate'], ['Delete', 'Delete'],
    ['Ctrl+G / Ctrl+Shift+G', 'Group / ungroup'], ['Ctrl+K / Ctrl+Shift+K', 'Combine / break apart'],
    ['Ctrl++ / Ctrl+-', 'Union / difference'], ['H / Shift+H', 'Flip horizontal / vertical'],
    ['Arrows', 'Nudge 1 mm (Shift 10 mm, Alt 0.1 mm)'], ['Shift while dragging', 'Constrain / keep proportions off'],
    ['Alt + drag', 'Duplicate while moving'], ['Double-click', 'Edit text / nodes'], ['Home / End / PgUp / PgDn', 'Arrange'],
    ['Alt+P', 'Toolpath preview'], ['Alt+C', 'Camera overlay on / off'], ['Alt+Shift+C', 'Take a new camera picture'],
    ['F7', 'Check the drawing'], ['D', 'Dimension lines on / off'],
    ['F5', 'Start job'], ['%', 'Toggle snap to grid']
  ];
  openModal({
    title: 'Keyboard shortcuts', width: '560px',
    body: h('table', { class: 'tbl' }, ...rows.map(([k, d]) => h('tr', {}, h('td', {}, h('kbd', {}, k)), h('td', {}, d)))),
    buttons: [{ label: 'Close', primary: true }]
  });
}

export const REPO_URL = 'https://github.com/raghukumarkotikala/CrafterStudio';
export const SITE_URL = 'https://www.crafterstudio.in';

export function openWebsite() {
  if (window.api) window.api.openExternal(SITE_URL);
}

// Opens a pre-filled bug report on GitHub. Nothing leaves the app by itself:
// the details are shown here first and the user submits them.
export async function openReportProblem() {
  const version = window.api && window.api.appVersion ? await window.api.appVersion() : 'unknown';
  const dev = state.device || {};
  const ctl = CONTROLLERS[dev.controller] || {};
  const ua = navigator.userAgent;
  const grab = re => (ua.match(re) || [null, '?'])[1];
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'unknown';

  const details = [
    `Crafter Studio ${version}`,
    `${os} \u00b7 Electron ${grab(/Electron\/([\d.]+)/)} \u00b7 Chromium ${grab(/Chrome\/([\d.]+)/)}`,
    `Machine: ${dev.name || '(none selected)'}`,
    `Controller: ${ctl.label || dev.controller || '?'} \u00b7 ${dev.workW || '?'}\u00d7${dev.workH || '?'} mm \u00b7 ${dev.power || '?'} W ${String(dev.type || '').toUpperCase()}`,
    `Origin: ${dev.origin || '?'} \u00b7 Job start: ${dev.jobOrigin || '?'}`,
    `Connection: ${machine.connected ? 'connected (' + ((machine.status && machine.status.state) || 'idle') + ')' : 'not connected'}`
  ].join('\n');

  const url = `${REPO_URL}/issues/new?template=bug_report.yml&environment=${encodeURIComponent(details)}`;

  const box = h('textarea', { class: 'inp', rows: 7, readonly: true, style: { fontFamily: 'ui-monospace, monospace', fontSize: '12px' } }, details);
  box.addEventListener('keydown', e => e.stopPropagation());

  openModal({
    title: 'Report a problem',
    width: '580px',
    body: h('div', {},
      h('div', { class: 'note' },
        'This opens a pre-filled report on GitHub in your browser. Nothing is sent from Crafter Studio itself \u2014 you can edit anything before posting. A free GitHub account is needed to submit.'),
      h('div', { class: 'sec-h' }, 'Details that will be filled in'),
      box,
      h('div', { class: 'small muted', style: { marginTop: '6px' } },
        'Only the above is included. Your designs, file names and project contents are not.')),
    buttons: [
      { label: 'Copy details', onClick: () => {
        navigator.clipboard.writeText(details).then(() => toast('Copied.'), () => toast('Could not copy.', 'err'));
        return false;
      } },
      { label: 'Cancel' },
      { label: 'Open GitHub', primary: true, onClick: () => { if (window.api) window.api.openExternal(url); } }
    ]
  });
}

export async function openAbout() {
  const version = window.api && window.api.appVersion ? await window.api.appVersion() : '';
  openModal({
    title: 'About Crafter Studio', width: '480px',
    body: h('div', {},
      h('img', { class: 'logo-hero', src: 'assets/logo.png', alt: 'Crafter Studio' }),
      h('p', { class: 'center' }, h('b', {}, 'Crafter Studio'), version ? ` ${version}` : '', ' — laser design & control studio.'),
      h('p', { class: 'muted' }, `Machine database: ${MACHINES.length} profiles from ${BRANDS.length} brands, plus unlimited custom profiles.`),
      h('p', { class: 'muted' }, 'Direct USB control: GRBL, grblHAL/FluidNC, Marlin, Smoothieware. Other controllers: design and export.'),
      h('p', { class: 'muted small' }, 'Built with Electron, paper.js, opentype.js, dxf-parser and imagetracerjs.'),
      h('p', { class: 'muted small' }, 'Library icons: Tabler Icons (MIT, © Paweł Kuna) and Material Design Icons (Apache-2.0, Pictogrammers).'),
      h('p', { class: 'muted small' }, 'Crafter Studio is released under the ISC licence and comes with no warranty.'),
      h('p', { class: 'center' },
        h('button', { class: 'btn', onClick: openWebsite }, 'crafterstudio.in'),
        h('button', { class: 'btn', style: { marginLeft: '8px' }, onClick: () => { if (window.api) window.api.openExternal(REPO_URL); } }, 'Source on GitHub')),
      h('div', { class: 'note warn' }, 'Laser safety: always wear eye protection rated for your laser\'s wavelength, never leave a running laser unattended, and keep a fire extinguisher nearby.')),
    buttons: [{ label: 'Close', primary: true }]
  });
}

export { fmtNum };
