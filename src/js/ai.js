// AI features: text → SVG workpiece generation, prompt-assist on existing art,
// and material setting suggestions.
//
// Every network call is made by the main process (see main.js): the renderer runs
// under a strict CSP and must never hold the API key. Model output is untrusted —
// it is run through sanitizeSVG() before it is allowed anywhere near the DOM.
/* global paper */
import { state, bus } from './state.js';
import { importSVG } from './io.js';
import { ed, addItem, styleItem, pushHistory, select as selectItems } from './editor.js';
import { toast } from './ops.js';

// ---------------------------------------------------------------- settings
let settings = null;

export async function aiSettings(force = false) {
  if (!settings || force) {
    settings = window.api ? await window.api.aiGet() : { provider: 'anthropic', anthropic: { model: '', hasKey: false }, openai: { baseUrl: '', model: '', hasKey: false } };
  }
  return settings;
}

export async function saveAiSettings(patch) {
  if (!window.api) return settings;
  settings = await window.api.aiSet(patch);
  bus.emit('ai-settings', settings);
  return settings;
}

export function isConfigured(s = settings) {
  if (!s) return false;
  if (s.provider === 'ollama') return !!(s.ollama && s.ollama.model);
  if (s.provider === 'openai') {
    return !!s.openai.model && (s.openai.hasKey || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(s.openai.baseUrl || ''));
  }
  return !!s.anthropic.model && s.anthropic.hasKey;
}

export const SUGGESTED_MODELS = {
  anthropic: ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5-20251001'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'o4-mini']
};

// Ask the main process what Ollama has installed (HTTP API, falling back to `ollama list`).
export async function listLocalModels(host) {
  if (!window.api || !window.api.aiModels) return { models: [], source: 'none', error: 'Local models need the desktop app.' };
  return window.api.aiModels({ host });
}

// ---------------------------------------------------------------- request plumbing
let seq = 0;

export function newRequestId() { return 'ai-' + (++seq) + '-' + Date.now(); }

export function cancelRequest(id) {
  if (window.api && id) window.api.aiCancel(id);
}

// Electron prefixes IPC rejections with "Error invoking remote method '…': Error: ".
function unwrapIpcError(message) {
  return String(message || '').replace(/^Error invoking remote method '[^']*':\s*(?:Error:\s*)?/, '');
}

async function ask({ system, user, maxTokens, id }) {
  if (!window.api) throw new Error('AI features need the desktop app.');
  const s = await aiSettings();
  if (!isConfigured(s)) {
    throw new Error(s && s.provider === 'ollama'
      ? 'No local model selected yet. Open AI settings and pick one.'
      : 'AI is not set up yet. Open AI settings and add a provider and API key.');
  }
  try {
    const r = await window.api.aiRequest({ id, system, user, maxTokens });
    return r.text;
  } catch (e) {
    throw new Error(unwrapIpcError(e && e.message));
  }
}

// ---------------------------------------------------------------- SVG sanitising
// Allowlist only. Anything not named here is dropped, including <script>, <style>,
// <image>, <foreignObject>, <use>, external references and every on* handler.
const OK_TAGS = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);

const OK_ATTRS = new Set([
  'd', 'points', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry',
  'width', 'height', 'viewBox', 'transform', 'fill', 'stroke', 'stroke-width',
  'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray',
  'fill-rule', 'clip-rule', 'opacity', 'fill-opacity', 'stroke-opacity', 'preserveAspectRatio'
]);

// Dropped together with everything inside them: these either execute, reference
// external data, or hold template geometry that is not drawn where it sits.
const DROP_SUBTREE = new Set([
  'script', 'style', 'defs', 'clippath', 'mask', 'marker', 'symbol', 'pattern', 'filter',
  'image', 'use', 'foreignobject', 'text', 'tspan', 'textpath', 'title', 'desc', 'metadata',
  'animate', 'animatetransform', 'animatemotion', 'set'
]);

// Presentation properties worth rescuing out of a style="" attribute.
const OK_STYLE_PROPS = new Set(['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'fill-rule', 'opacity', 'fill-opacity', 'stroke-opacity']);

const BAD_VALUE = /url\s*\(|javascript:|expression\s*\(|<|data:/i;

function safeValue(v) {
  return typeof v === 'string' && v.length <= 100000 && !BAD_VALUE.test(v);
}

function cleanStyle(style) {
  const out = [];
  for (const decl of String(style).split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim().toLowerCase();
    const val = decl.slice(i + 1).trim();
    if (OK_STYLE_PROPS.has(prop) && safeValue(val)) out.push([prop, val]);
  }
  return out;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const MAX_NODES = 20000;

export function sanitizeSVG(text) {
  const doc = new DOMParser().parseFromString(String(text), 'image/svg+xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('The model returned SVG that could not be parsed.');
  const src = doc.documentElement;
  if (!src || src.nodeName.toLowerCase() !== 'svg') throw new Error('The model did not return an <svg> element.');

  const out = document.implementation.createDocument(SVG_NS, 'svg', null);
  let nodes = 0;

  const copyAttrs = (from, to) => {
    for (const a of Array.from(from.attributes || [])) {
      const name = a.name;
      const lower = name.toLowerCase();
      if (lower.startsWith('on') || lower.startsWith('xlink') || lower.startsWith('xmlns:')) continue;
      if (lower === 'style') {
        for (const [p, v] of cleanStyle(a.value)) to.setAttribute(p, v);
        continue;
      }
      if (!OK_ATTRS.has(name) && !OK_ATTRS.has(lower)) continue;
      if (!safeValue(a.value)) continue;
      to.setAttribute(OK_ATTRS.has(name) ? name : lower, a.value);
    }
  };

  const bump = () => {
    if (++nodes > MAX_NODES) throw new Error('The generated drawing is too complex to import.');
  };

  const walk = (from, to) => {
    for (const child of Array.from(from.childNodes)) {
      if (child.nodeType !== 1) continue;
      const tag = child.nodeName.toLowerCase();
      if (DROP_SUBTREE.has(tag)) continue;

      if (OK_TAGS.has(tag) && tag !== 'svg') {
        bump();
        const el = out.createElementNS(SVG_NS, tag);
        copyAttrs(child, el);
        to.appendChild(el);
        walk(child, el);
        continue;
      }

      // Unknown wrapper (<a>, <switch>, a nested <svg>…): drop the wrapper but keep
      // the geometry inside it, preserving any transform it carried.
      const tf = child.getAttribute && child.getAttribute('transform');
      let target = to;
      if (tf && safeValue(tf)) {
        bump();
        target = out.createElementNS(SVG_NS, 'g');
        target.setAttribute('transform', tf);
        to.appendChild(target);
      }
      walk(child, target);
    }
  };

  // Unwrapping can leave childless groups behind.
  const prune = el => {
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType !== 1) continue;
      prune(child);
      if (child.nodeName.toLowerCase() === 'g' && !child.children.length) el.removeChild(child);
    }
  };

  const root = out.documentElement;
  copyAttrs(src, root);
  walk(src, root);
  prune(root);

  if (!root.children.length) throw new Error('The generated drawing contained no shapes.');
  normalizeToMillimetres(root);
  return new XMLSerializer().serializeToString(root);
}

// Crafter reads the root width unit to decide real-world scale. Force
// "1 user unit = 1 mm" so generated work lands at the size the model intended.
function normalizeToMillimetres(root) {
  const numeric = v => {
    const m = /^\s*(-?[\d.]+)/.exec(v || '');
    return m ? parseFloat(m[1]) : NaN;
  };
  let vb = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(parseFloat);
  if (vb.length !== 4 || vb.some(n => !isFinite(n)) || vb[2] <= 0 || vb[3] <= 0) {
    const w = numeric(root.getAttribute('width'));
    const h = numeric(root.getAttribute('height'));
    if (!isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) {
      root.removeAttribute('width');
      root.removeAttribute('height');
      root.removeAttribute('viewBox');
      return; // let the importer fall back to content bounds
    }
    vb = [0, 0, w, h];
    root.setAttribute('viewBox', `0 0 ${w} ${h}`);
  }
  root.setAttribute('width', vb[2] + 'mm');
  root.setAttribute('height', vb[3] + 'mm');
}

// Models like to wrap SVG in prose or code fences.
export function extractSVG(text) {
  const s = String(text || '');
  const fence = s.match(/```(?:svg|xml|html)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : s;
  const start = body.search(/<svg[\s>]/i);
  const end = body.toLowerCase().lastIndexOf('</svg>');
  if (start < 0 || end < 0) throw new Error('The model did not return an SVG drawing. Try rephrasing the prompt.');
  return body.slice(start, end + 6);
}

// ---------------------------------------------------------------- prompts
// Crafter maps SVG colours onto its palette layers, so naming exact hexes puts
// generated geometry straight onto a correctly configured layer:
//   #000000 → layer 1 (Fill / engrave)   #0000ff → layer 2 (Line / cut)   #ff0000 → layer 3 (Line / score)
const LASER_RULES = `You produce vector artwork for laser cutters and engravers. Output is fed directly into a CAM program.

Hard output rules:
- Reply with ONE complete <svg> element and nothing else. No prose, no markdown fences, no comments.
- Work in millimetres: set viewBox="0 0 W H" and width="Wmm" height="Hmm" with the SAME W and H numbers.
- Allowed elements only: svg, g, path, rect, circle, ellipse, line, polyline, polygon.
- Forbidden: text, tspan, image, use, defs, style, script, clipPath, mask, filter, gradients, patterns, external references, CSS classes.
- Never use url(...) in any attribute. Put presentation in fill/stroke attributes, not a style attribute.
- Render any lettering as outlined path geometry, never as a <text> element.

Colour = operation. Use exactly these three hexes and no others:
- Engraved / filled solid areas: fill="#000000" stroke="none"
- Cut lines: fill="none" stroke="#0000ff" stroke-width="0.2"
- Score / fold lines: fill="none" stroke="#ff0000" stroke-width="0.2"

Laser-manufacturability rules:
- Every cut contour must be a closed path.
- Keep the smallest feature and the gap between any two cut lines at or above 1 mm, so material does not burn through or fall apart.
- Nothing may end up as a free-floating island: any region enclosed by a cut must stay connected to the surrounding material by a bridge at least 1.5 mm wide. This matters most for stencils and lettering counters (the middle of an O, A, e...).
- Do not overlap or duplicate identical contours — each line is cut once.
- Keep the whole drawing inside the requested dimensions with a small margin.`;

const GENERATE_SYSTEM = `${LASER_RULES}

Design a clean, bold, readable piece. Favour simple confident geometry over fine detail — the laser kerf is about 0.2 mm wide and fine hatching will burn away.`;

const ASSIST_SYSTEM = `${LASER_RULES}

You will be given an existing SVG drawing and an instruction. Return the FULL modified drawing as one <svg> element, preserving everything the instruction does not ask you to change. Keep the original position and scale unless asked otherwise.`;

const ADVISOR_SYSTEM = `You are a laser cutting and engraving process engineer. Given a machine and a material, propose starting-point settings.

Reply with ONE JSON object and nothing else — no prose, no markdown fences:
{"rows":[{"op":"Cut","mode":"line","power":100,"speed":180,"passes":4,"interval":0.1,"note":"short reason"}],"warning":"one sentence on the main hazard of this material, or empty string"}

Rules:
- "mode" must be "line" (cut/score) or "fill" (raster engrave).
- "power" is a percentage 0-100. "speed" is mm/min. "passes" is an integer >= 1. "interval" is the raster line interval in mm (use 0.1 for line mode).
- Give 2 to 5 rows covering the operations that make sense for this material — typically Cut, Engrave and Score.
- Be conservative: these are starting points a human will test, so err towards lower power and more passes.
- If the material is unsafe to laser (PVC, vinyl, polycarbonate, ABS, anything chlorinated, or a material that releases toxic fumes), return {"rows":[],"warning":"..."} explaining why it must not be cut.`;

// ---------------------------------------------------------------- generate
export async function generateArtwork({ prompt, widthMm, heightMm, id }) {
  const clean = String(prompt || '').trim();
  if (!clean) throw new Error('Describe what you want to make first.');
  if (clean.length > 4000) throw new Error('That prompt is too long — keep it under 4000 characters.');

  const w = Math.round(widthMm || Math.min(120, state.device.workW));
  const h = Math.round(heightMm || Math.min(120, state.device.workH));
  const user = `Design this for a ${state.device.type ? String(state.device.type).toUpperCase() : 'diode'} laser:

${clean}

Canvas: exactly ${w} mm wide by ${h} mm tall. The machine work area is ${state.device.workW} x ${state.device.workH} mm.`;

  const text = await ask({ system: GENERATE_SYSTEM, user, maxTokens: 8000, id });
  return sanitizeSVG(extractSVG(text));
}

// Insert a sanitised SVG string onto the canvas, optionally scaled to a target size.
export function placeSVG(svg, { sizeMm } = {}) {
  const item = importSVG(svg);
  if (sizeMm && item && item.bounds && !item.bounds.isEmpty()) {
    const b = item.bounds;
    const largest = Math.max(b.width, b.height);
    if (largest > 0.01) {
      const s = sizeMm / largest;
      item.getItems({ match: i => (i.className === 'Path' || i.className === 'CompoundPath') && !(i.parent && i.parent.className === 'CompoundPath') })
        .forEach(i => { if (i.strokeColor) i.strokeWidth *= s; });
      item.scale(s, b.center);
      pushHistory();
      bus.emit('transform');
    }
  }
  return item;
}

// ---------------------------------------------------------------- prompt-assist
const MAX_ASSIST_CHARS = 40000;

// Serialise the current selection as a millimetre-accurate standalone SVG.
export function selectionToSVG() {
  if (!state.selection.length) throw new Error('Select something on the canvas first.');
  const clones = state.selection.map(i => i.clone({ insert: false }));
  const g = new paper.Group({ insert: false, children: clones });
  const b = g.bounds;
  if (!b || b.isEmpty()) throw new Error('The selection has no geometry.');
  g.translate(new paper.Point(-b.x, -b.y));
  const w = Math.max(round2(b.width), 0.01);
  const h = Math.max(round2(b.height), 0.01);
  const inner = g.exportSVG({ asString: true, matchShapes: false, precision: 3 });
  const svg = `<svg xmlns="${SVG_NS}" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">${inner}</svg>`;
  if (svg.length > MAX_ASSIST_CHARS) throw new Error('The selection is too complex to send. Select fewer objects, or simplify the paths first.');
  return { svg, bounds: b };
}

function round2(n) { return Math.round(n * 100) / 100; }

export async function assistSelection({ instruction, id }) {
  const clean = String(instruction || '').trim();
  if (!clean) throw new Error('Describe the change you want.');
  const { svg, bounds } = selectionToSVG();

  const user = `Here is the current drawing (${round2(bounds.width)} x ${round2(bounds.height)} mm):

${svg}

Apply this change:
${clean}`;

  const text = await ask({ system: ASSIST_SYSTEM, user, maxTokens: 16000, id });
  const cleaned = sanitizeSVG(extractSVG(text));

  // Swap the old selection for the result, anchored at the same top-left corner.
  const old = state.selection.slice();
  const layer = old[0] && old[0].data ? old[0].data.layer : state.activeLayer;
  const item = importSVG(cleaned);
  if (!item) throw new Error('The result could not be imported.');
  item.bounds.topLeft = bounds.topLeft;
  old.forEach(i => i.remove());
  if (layer) {
    item.getItems({ match: i => i.className === 'Path' || i.className === 'CompoundPath' })
      .forEach(i => { if (!i.data || !i.data.layer) i.data = { ...(i.data || {}), layer }; });
  }
  styleItem(item);
  selectItems(item);
  pushHistory();
  bus.emit('transform');
  return item;
}

// ---------------------------------------------------------------- settings advisor
export async function suggestSettings({ material, id }) {
  const clean = String(material || '').trim();
  if (!clean) throw new Error('Describe the material first.');
  const dev = state.device;
  const user = `Machine: ${dev.name || 'unknown'} — ${String(dev.type || 'diode').toUpperCase()} laser, ${dev.power || '?'} W optical power, ${dev.workW} x ${dev.workH} mm bed.
Material: ${clean}

Give starting-point settings for this exact machine power.`;

  const text = await ask({ system: ADVISOR_SYSTEM, user, maxTokens: 2000, id });
  return parseAdvice(text, clean);
}

function parseAdvice(text, material) {
  const s = String(text || '');
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : s;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error('The model did not return usable settings.');
  let data;
  try { data = JSON.parse(body.slice(start, end + 1)); } catch { throw new Error('The model returned settings that could not be read.'); }

  const clampInt = (v, lo, hi, dflt) => {
    const n = Math.round(Number(v));
    return isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
  };
  const rows = (Array.isArray(data.rows) ? data.rows : []).slice(0, 8).map(r => ({
    material,
    thickness: typeof r.thickness === 'string' ? r.thickness.slice(0, 20) : '—',
    op: String(r.op || 'Cut').slice(0, 24),
    mode: r.mode === 'fill' ? 'fill' : r.mode === 'image' ? 'image' : 'line',
    power: clampInt(r.power, 0, 100, 50),
    speed: clampInt(r.speed, 1, 60000, 1000),
    passes: clampInt(r.passes, 1, 50, 1),
    interval: Math.min(5, Math.max(0.01, Number(r.interval) || 0.1)),
    note: typeof r.note === 'string' ? r.note.slice(0, 200) : ''
  }));
  return { rows, warning: typeof data.warning === 'string' ? data.warning.slice(0, 400) : '' };
}

export { toast };
