// Job workflow: preview, framing, running, connection.
import { state, bus } from './state.js';
import { ed } from './editor.js';
import { buildJob, emitGcode, frameGcode, formatDuration } from './gcode.js';
import { CONTROLLERS } from './profiles.js';
import { machine } from './machine.js';
import { showPreview, hidePreview, previewActive } from './preview.js';
import { h, openModal, toast } from './dom.js';

export const consoleLog = [];
export function log(text, cls = 'info') {
  consoleLog.push({ text, cls });
  if (consoleLog.length > 600) consoleLog.splice(0, consoleLog.length - 600);
  bus.emit('console', { text, cls });
}

machine.on('log', (t, c) => log(t, c));
machine.on('status', s => bus.emit('machineStatus', s));
machine.on('connection', on => {
  log(on ? 'Connected.' : 'Disconnected.', 'info');
  bus.emit('machineStatus', machine.status);
});
machine.on('progress', j => bus.emit('jobProgress', j));
machine.on('jobStart', j => bus.emit('jobProgress', j));
machine.on('paused', p => bus.emit('jobPaused', p));
machine.on('jobEnd', (ok, j) => {
  bus.emit('jobProgress', null);
  if (ok) {
    const secs = j ? (Date.now() - j.started) / 1000 : 0;
    log(`Job finished in ${formatDuration(secs)}${j && j.errors ? ` with ${j.errors} error(s)` : ''}.`, j && j.errors ? 'err' : 'info');
    toast('Job complete');
  } else {
    log('Job stopped.', 'err');
  }
});

function controllerInfo() {
  return CONTROLLERS[state.device.controller] || CONTROLLERS.grbl;
}

export function directSupported() {
  return controllerInfo().direct;
}

// ------------------------------------------------------------------ connection
export async function toggleConnect() {
  if (machine.connected) {
    if (machine.job && !window.confirm('A job is running. Disconnect and stop it?')) return;
    await machine.disconnect();
    return;
  }
  if (!directSupported()) {
    toast(`${controllerInfo().label}: direct control isn't available. Export SVG instead.`, 'warn');
    return;
  }
  if (!machine.supported) {
    toast('Serial connections need the Crafter Studio desktop app (Web Serial not available here).', 'err');
    return;
  }
  try {
    const proto = ['grbl', 'grbl-m3', 'grblhal'].includes(state.device.controller) ? 'grbl' : 'line';
    await machine.connect(state.device.baud || 115200, proto);
  } catch (e) {
    if (e && e.name === 'NotFoundError') log('No port selected.', 'info');
    else if (e && e.name === 'SecurityError') toast('Use the Connect button in the top bar or Machine tab (port selection needs a direct click).', 'warn');
    else { log('Connection failed: ' + e.message, 'err'); toast('Connection failed: ' + e.message, 'err'); }
  }
}

// ------------------------------------------------------------------ preview
export async function togglePreview() {
  if (previewActive()) { hidePreview(); return; }
  const job = await buildJob();
  if (!job.buf.n) { toast('Nothing to preview — add objects to an output-enabled layer.'); return; }
  job.warnings.forEach(w => toast(w, 'warn', 6000));
  state.job = job;
  showPreview(job);
}

// ------------------------------------------------------------------ framing
function outputBounds() {
  const outIds = new Set(state.layers.filter(l => l.output && l.visible).map(l => l.id));
  let b = null;
  const walk = it => {
    if (!it.visible) return;
    if (it.className === 'Group') { it.children.forEach(walk); return; }
    if (!outIds.has(it.data.layer)) return;
    b = b ? b.unite(it.bounds) : it.bounds.clone();
  };
  (state.selection.length ? state.selection : ed.design.children).forEach(walk);
  return b ? { x: b.x, y: b.y, w: b.width, h: b.height } : null;
}

function requireReady() {
  if (!directSupported()) { toast('This machine can\'t be driven directly from Crafter Studio — export SVG instead.', 'warn'); return false; }
  if (!machine.connected) { toast('Connect to the machine first (Machine tab → Connect).', 'warn'); return false; }
  if (machine.job) { toast('A job is already running.', 'warn'); return false; }
  return true;
}

export function frameJob() {
  if (!requireReady()) return;
  const b = outputBounds();
  if (!b) { toast('Nothing to frame.'); return; }
  const lines = frameGcode(b);
  log(`Framing ${b.w.toFixed(1)} × ${b.h.toFixed(1)} mm${state.device.framePower > 0 ? ` at ${state.device.framePower}% power` : ' (laser off)'}`, 'info');
  lines.forEach(l => log(l, 'tx'));
  machine.sendLines(lines);
}

// ------------------------------------------------------------------ run
export async function startJob() {
  if (!requireReady()) return;
  const job = await buildJob();
  if (!job.buf.n) { toast('Nothing to run — add objects to an output-enabled layer.'); return; }
  const gcode = emitGcode(job);
  const lines = gcode.split('\n').length;
  const b = job.bounds;
  const body = h('div', { style: { width: '420px' } },
    h('div', { class: 'row' }, h('label', {}, 'Machine'), h('div', { class: 'ctl' }, state.device.name)),
    h('div', { class: 'row' }, h('label', {}, 'Job size'), h('div', { class: 'ctl' }, b ? `${b.w.toFixed(1)} × ${b.h.toFixed(1)} mm` : '—')),
    h('div', { class: 'row' }, h('label', {}, 'Start from'), h('div', { class: 'ctl' }, state.device.jobOrigin === 'current' ? `Current laser position (${state.device.jobAnchor})` : 'Absolute coordinates')),
    h('div', { class: 'row' }, h('label', {}, 'Estimated time'), h('div', { class: 'ctl' }, h('b', {}, formatDuration(job.stats.seconds)))),
    h('div', { class: 'row' }, h('label', {}, 'Layers'), h('div', { class: 'ctl' }, job.layers.map(l => `${l.name} (${l.mode})`).join(', '))),
    h('div', { class: 'row' }, h('label', {}, 'G-code lines'), h('div', { class: 'ctl' }, lines.toLocaleString())),
    ...job.warnings.map(w => h('div', { class: 'note warn' }, w)),
    h('div', { class: 'note warn' }, 'Wear laser safety glasses, make sure the material is focused and secured, and stay with the machine while it runs.'));
  openModal({
    title: 'Start job', body,
    buttons: [
      { label: 'Cancel' },
      { label: 'Start', primary: true, onClick: () => {
        try {
          log(`Starting job: ${lines} lines, est. ${formatDuration(job.stats.seconds)}`, 'info');
          machine.runJob(gcode);
        } catch (e) { toast(e.message, 'err'); }
      } }
    ]
  });
}

export function pauseJob() {
  if (!machine.job) return;
  if (machine.paused) machine.resume(); else machine.pause();
}

export function stopJob() {
  if (!machine.connected) return;
  machine.stop();
}

export { machine };
