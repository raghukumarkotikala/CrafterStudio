// Toolpath preview / simulation drawn on a canvas above the editor.
/* global paper */
import { bus } from './state.js';
import { K_RAPID, K_LAYER } from './gcode.js';

let cv = null;
let job = null;
let upto = 0;
let showTravel = true;
let playing = false;
let raf = 0;
let speedMul = 1;

export function initPreview(canvas) {
  cv = canvas;
  bus.on('view', draw);
  new ResizeObserver(draw).observe(canvas.parentElement);
}

export function previewActive() { return !!job; }

export function showPreview(j) {
  job = j;
  upto = j.buf.n;
  cv.hidden = false;
  draw();
  bus.emit('preview', true);
}

export function hidePreview() {
  stop();
  job = null;
  if (cv) cv.hidden = true;
  bus.emit('preview', false);
}

export function setProgress(frac) {
  if (!job) return;
  upto = Math.round(job.buf.n * Math.min(1, Math.max(0, frac)));
  draw();
}

export function getProgress() { return job ? upto / Math.max(1, job.buf.n) : 0; }

export function setShowTravel(v) { showTravel = v; draw(); }
export function setSpeed(v) { speedMul = v; }

// Simulation time for moves up to index (minutes → seconds)
export function elapsedAt(index) {
  if (!job) return 0;
  const a = job.buf.a;
  let t = 0, px = 0, py = 0;
  for (let i = 0; i < index; i++) {
    const k = a[i * 6];
    if (k === K_LAYER) continue;
    const x = a[i * 6 + 1], y = a[i * 6 + 2];
    const d = Math.hypot(x - px, y - py);
    t += k === K_RAPID ? d / 6000 : d / a[i * 6 + 4];
    px = x; py = y;
  }
  return t * 60;
}

export function play() {
  if (!job) return;
  if (upto >= job.buf.n) upto = 0;
  playing = true;
  let last = performance.now();
  const step = now => {
    if (!playing || !job) return;
    const dt = (now - last) / 1000;
    last = now;
    // advance roughly proportional to job length so any job plays in ~20 s at 1×
    const perSec = Math.max(20, job.buf.n / 20) * speedMul;
    upto = Math.min(job.buf.n, upto + Math.ceil(perSec * dt));
    draw();
    bus.emit('previewProgress', upto / job.buf.n);
    if (upto >= job.buf.n) { playing = false; bus.emit('previewPlaying', false); return; }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  bus.emit('previewPlaying', true);
}

export function stop() {
  playing = false;
  cancelAnimationFrame(raf);
  bus.emit('previewPlaying', false);
}

export function isPlaying() { return playing; }

function draw() {
  if (!cv || !job) return;
  const wrap = cv.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.max(1, wrap.width * dpr);
  cv.height = Math.max(1, wrap.height * dpr);
  cv.style.width = wrap.width + 'px';
  cv.style.height = wrap.height + 'px';
  const ctx = cv.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  // dim the design underneath
  ctx.fillStyle = 'rgba(245,246,248,0.72)';
  ctx.fillRect(0, 0, cv.width, cv.height);
  const m = paper.view.matrix;
  ctx.setTransform(m.a * dpr, m.b * dpr, m.c * dpr, m.d * dpr, m.tx * dpr, m.ty * dpr);
  const z = paper.view.zoom;
  const a = job.buf.a;
  const layers = job.layers;
  let px = 0, py = 0;

  // travel moves
  if (showTravel) {
    ctx.beginPath();
    ctx.lineWidth = 0.8 / z;
    ctx.strokeStyle = 'rgba(230,40,60,0.55)';
    ctx.setLineDash([3 / z, 3 / z]);
    for (let i = 0; i < upto; i++) {
      const k = a[i * 6];
      if (k === K_LAYER) continue;
      const x = a[i * 6 + 1], y = a[i * 6 + 2];
      if (k === K_RAPID) { ctx.moveTo(px, py); ctx.lineTo(x, y); }
      px = x; py = y;
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // burn moves, batched by layer + power bucket
  px = 0; py = 0;
  let curKey = null;
  ctx.lineCap = 'round';
  const flush = () => { if (curKey !== null) ctx.stroke(); };
  for (let i = 0; i < upto; i++) {
    const k = a[i * 6];
    if (k === K_LAYER) continue;
    const x = a[i * 6 + 1], y = a[i * 6 + 2], p = a[i * 6 + 3];
    if (k !== K_RAPID && p > 0) {
      const li = a[i * 6 + 5];
      const bucket = Math.round(p * 10);
      const key = li * 100 + bucket;
      if (key !== curKey) {
        flush();
        curKey = key;
        ctx.beginPath();
        const L = layers[li];
        const interval = L && L.mode !== 'line' ? Math.max(L.interval || 0.1, 0.8 / z) : 1.4 / z;
        ctx.lineWidth = interval;
        ctx.strokeStyle = L ? L.color : '#000';
        ctx.globalAlpha = 0.35 + 0.65 * Math.min(1, p / Math.max(0.01, (L ? L.power : 100) / 100));
      }
      ctx.moveTo(px, py);
      ctx.lineTo(x, y);
    }
    px = x; py = y;
  }
  flush();
  ctx.globalAlpha = 1;

  // laser head
  if (upto > 0 && upto < job.buf.n) {
    ctx.beginPath();
    ctx.arc(px, py, 5 / z, 0, Math.PI * 2);
    ctx.fillStyle = '#ff2d55';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px, py, 10 / z, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,45,85,0.5)';
    ctx.lineWidth = 2 / z;
    ctx.stroke();
  }
}
