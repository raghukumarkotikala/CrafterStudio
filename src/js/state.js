// Shared application state + a tiny event bus.
import { DEFAULT_DEVICE } from './profiles.js';

const listeners = {};
export const bus = {
  on(evt, fn) { (listeners[evt] ||= []).push(fn); },
  emit(evt, ...args) { (listeners[evt] || []).forEach(fn => fn(...args)); }
};

export const PALETTE = [
  '#000000', '#0000ff', '#ff0000', '#00b000', '#c8b400', '#ff8000', '#00b0b0', '#ff00ff',
  '#8c8c8c', '#0000a0', '#a00000', '#008000', '#8c7d00', '#c06000', '#0090ff', '#a000a0',
  '#5a5a5a', '#7d87b9', '#bb7784', '#4a6fe3', '#d33f6a', '#5cb85c', '#e0955a', '#e27bb5',
  '#fa5ed4', '#500a78', '#b45a00', '#004754', '#3cb371', '#e6b800'
];

export function defaultLayer(i) {
  return {
    id: 'L' + String(i).padStart(2, '0'),
    color: PALETTE[i],
    name: 'Layer ' + (i + 1),
    mode: i === 0 ? 'fill' : 'line',
    power: i === 0 ? 30 : 80,
    minPower: 0,
    speed: i === 0 ? 3000 : 600,
    passes: 1,
    interval: 0.1,
    angle: 0,
    bidir: true,
    overscan: 2,
    air: false,
    output: true,
    visible: true,
    order: i
  };
}

function loadJSON(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

export function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

export const state = {
  device: { ...DEFAULT_DEVICE, ...loadJSON('crafter.device', {}) },
  customProfiles: loadJSON('crafter.customProfiles', []),
  userMaterials: loadJSON('crafter.userMaterials', []),
  prefs: {
    snap: false,
    snapStep: 1,
    gridStep: 10,
    alignTo: 'selection',
    ...loadJSON('crafter.prefs', {})
  },
  firstRun: loadJSON('crafter.device', null) === null,
  layers: PALETTE.map((c, i) => defaultLayer(i)),
  activeLayer: 'L00',
  selection: [],
  tool: 'select',
  toolOpts: { cornerRadius: 0, sides: 6, starPoints: 5, starRatio: 0.5 },
  filePath: null,
  fileName: 'Untitled',
  dirty: false,
  job: null // last generated job
};

export function getLayer(id) {
  return state.layers.find(l => l.id === id) || state.layers[0];
}

export function persistDevice() {
  saveJSON('crafter.device', state.device);
}

export function persistPrefs() {
  saveJSON('crafter.prefs', state.prefs);
}

export function setDirty(v = true) {
  state.dirty = v;
  if (window.api) {
    window.api.setDirty(v);
    window.api.setTitle(`${v ? '• ' : ''}${state.fileName} — Crafter Studio`);
  } else {
    document.title = `${v ? '• ' : ''}${state.fileName} — Crafter Studio`;
  }
}
