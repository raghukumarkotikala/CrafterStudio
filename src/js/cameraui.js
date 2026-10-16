// The camera alignment dialog, and the overlay's run-time plumbing.
//
// Calibrating is two steps whose effect is visible immediately: straighten the
// lens, then mark four points whose bed coordinates are known. Nothing is
// guessed from the picture — a photograph alone cannot say how far away the bed
// is, so those known points are what make the result measure true.

import { h, row, num, select, check, toast, openModal, appendAll, fmtNum } from './dom.js';
import { state, persistCamera, bus } from './state.js';
import { setCameraImage, setCameraOpacity, cameraImageShown } from './editor.js';
import * as cam from './camera.js';

const PREVIEW_W = 520;
let liveTimer = 0;

// ------------------------------------------------------------------ overlay
function calibration(c = state.camera) {
  return {
    imagePts: c.imagePts,
    bedPts: c.bedPts || cam.bedCorners(state.device.workW, state.device.workH),
    k: c.k || 0
  };
}

/** Grab a frame, straighten it, and put it behind the design. */
export function refreshOverlay() {
  const frame = cam.grab();
  if (!frame) return false;
  const cal = calibration();
  if (!cam.isCalibrated(cal)) return false;
  const bed = cam.renderBed(frame, cal, state.device.workW, state.device.workH, state.camera.pxPerMm || 4);
  if (!bed.width) return false;
  setCameraImage(cam.toCanvas(bed), state.camera.opacity);
  return true;
}

function stopLive() {
  if (liveTimer) { clearInterval(liveTimer); liveTimer = 0; }
}

function startLive() {
  stopLive();
  // Twice a second. Straightening the whole bed is real work, and material
  // being placed by hand is not moving fast enough to need more.
  liveTimer = setInterval(() => {
    if (!cam.cameraOpen() || !cameraImageShown()) { stopLive(); return; }
    if (document.hidden) return;
    refreshOverlay();
  }, 500);
}

export function cameraOverlayOn() { return cameraImageShown(); }

export function closeCameraOverlay() {
  stopLive();
  cam.closeCamera();
  setCameraImage(null);
  bus.emit('camera');
}

/** Menu action: turn the overlay off, or open the camera and leave it on. */
export async function toggleCameraOverlay() {
  if (cameraImageShown()) {
    closeCameraOverlay();
    toast('Camera overlay off.');
    return;
  }
  if (!cam.isCalibrated(calibration())) {
    toast('Set the camera up first.');
    openCameraDialog();
    return;
  }
  try {
    rescaleFor(await cam.openCamera(state.camera.deviceId || undefined));
    if (!refreshOverlay()) throw new Error('The picture could not be straightened — recalibrate the camera.');
    if (state.camera.live) startLive();
    bus.emit('camera');
  } catch (e) {
    cam.closeCamera();
    toast(cameraMessage(e), 'err');
  }
}

/**
 * A camera that opens at a different resolution than it was calibrated at
 * would put every marked point in the wrong place. The marks scale with the
 * frame, which is right as long as the lens itself has not changed, and the
 * user is told to check rather than left to find out on the material.
 */
function rescaleFor({ width, height }) {
  const c = state.camera;
  if (!c.imagePts || !c.frameW || !c.frameH) { c.frameW = width; c.frameH = height; return; }
  if (c.frameW === width && c.frameH === height) return;
  const sx = width / c.frameW, sy = height / c.frameH;
  c.imagePts = c.imagePts.map(([x, y]) => [x * sx, y * sy]);
  c.frameW = width; c.frameH = height;
  persistCamera();
  toast(`Camera opened at ${width}×${height}, not the size it was calibrated at. The marks were rescaled — check they still line up.`, 'warn', 7000);
}

function cameraMessage(e) {
  switch (e && e.name) {
    case 'NotAllowedError': return 'Camera access was refused. Allow it and try again.';
    case 'NotFoundError':
    case 'OverconstrainedError': return 'That camera is no longer connected.';
    case 'NotReadableError': return 'The camera is already in use by another program.';
    default: return (e && e.message) || 'The camera could not be opened.';
  }
}

// ------------------------------------------------------------------ dialog
export function openCameraDialog() {
  const c = state.camera;
  const draft = {
    deviceId: c.deviceId || '',
    k: c.k || 0,
    pts: (c.imagePts || []).map(p => p.slice()),
    bedPts: (c.bedPts || cam.bedCorners(state.device.workW, state.device.workH)).map(p => p.slice()),
    opacity: c.opacity ?? 0.6,
    live: !!c.live,
    custom: !!c.bedPts
  };
  let frame = null;      // raw full-resolution pixels
  let shown = null;      // lens-corrected, downscaled for the preview
  let scale = 1;         // preview pixels per full-frame pixel
  let dragging = -1;
  let raf = 0;
  let closed = false;

  const view = h('canvas', { class: 'cam-view', width: PREVIEW_W, height: Math.round(PREVIEW_W * 9 / 16) });
  const status = h('div', { class: 'note' }, 'Looking for a camera…');
  const controls = h('div', {});
  const devSel = h('div', { class: 'ctl' });
  const kLabel = h('span', { class: 'unit', style: { minWidth: '46px' } }, fmtNum(draft.k, 3));

  const ready = () => draft.pts.length === 4 && cam.isCalibrated({ imagePts: draft.pts, bedPts: draft.bedPts });

  // -------------------------------------------------- preview
  // The lens correction runs on a downscaled copy: k is normalised to the
  // frame, so the correction looks the same at preview size, and a 1280×720
  // frame is eight times the work for a picture 520 px wide.
  function recompute() {
    if (!frame || !frame.width) { shown = null; schedulePaint(); return; }
    const w = Math.min(frame.width, PREVIEW_W * 2);
    const hh = Math.max(1, Math.round(frame.height * w / frame.width));
    const small = document.createElement('canvas');
    small.width = w; small.height = hh;
    small.getContext('2d').drawImage(cam.toCanvas(frame), 0, 0, w, hh);
    const px = small.getContext('2d').getImageData(0, 0, w, hh);
    shown = cam.undistort({ width: w, height: hh, data: px.data }, draft.k);
    scale = view.width / frame.width;
    const want = Math.round(frame.height * scale);
    if (view.height !== want) view.height = want;
    schedulePaint();
  }

  function schedulePaint() {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; paint(); });
  }

  function paint() {
    const g = view.getContext('2d');
    g.clearRect(0, 0, view.width, view.height);
    if (!shown || !shown.width) {
      g.fillStyle = '#20242c'; g.fillRect(0, 0, view.width, view.height);
      g.fillStyle = '#8b94a6'; g.font = '13px sans-serif'; g.textAlign = 'center';
      g.fillText('No picture', view.width / 2, view.height / 2);
      return;
    }
    g.drawImage(cam.toCanvas(shown), 0, 0, view.width, view.height);

    // Join the marks up. A corner clicked out of order makes the outline cross
    // itself, which is far easier to see than it is to explain.
    if (draft.pts.length > 1) {
      g.beginPath();
      draft.pts.forEach(([x, y], i) => (i ? g.lineTo(x * scale, y * scale) : g.moveTo(x * scale, y * scale)));
      if (draft.pts.length === 4) g.closePath();
      g.lineWidth = 1.5;
      g.strokeStyle = draft.pts.length === 4 && !ready() ? '#e0304a' : '#3d8bfd';
      g.stroke();
    }
    draft.pts.forEach(([x, y], i) => {
      const px = x * scale, py = y * scale;
      g.beginPath(); g.arc(px, py, 8, 0, Math.PI * 2);
      g.fillStyle = 'rgba(61,139,253,0.9)'; g.fill();
      g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke();
      g.fillStyle = '#fff'; g.font = 'bold 11px sans-serif'; g.textAlign = 'center';
      g.fillText(String(i + 1), px, py + 4);
    });
  }

  // Keep the picture moving while the dialog is open: the user is physically
  // placing material and needs to see it land.
  const previewTimer = setInterval(() => {
    if (closed || !cam.cameraOpen() || document.hidden) return;
    frame = cam.grab();
    recompute();
  }, 200);

  // -------------------------------------------------- marking points
  const pointAt = e => {
    const r = view.getBoundingClientRect();
    return [(e.clientX - r.left) * (view.width / r.width) / scale,
            (e.clientY - r.top) * (view.height / r.height) / scale];
  };
  const nearMark = p => {
    let best = -1, bestD = 14 / scale;
    draft.pts.forEach(([x, y], i) => {
      const d = Math.hypot(x - p[0], y - p[1]);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  };
  view.addEventListener('pointerdown', e => {
    if (!shown || !shown.width) return;
    const p = pointAt(e);
    const hit = nearMark(p);
    if (hit >= 0) dragging = hit;
    else if (draft.pts.length < 4) { draft.pts.push(p); dragging = draft.pts.length - 1; }
    else { toast('All four marks are placed — drag one, or use Clear marks.'); return; }
    view.setPointerCapture(e.pointerId);
    render();
  });
  view.addEventListener('pointermove', e => {
    if (dragging < 0) return;
    draft.pts[dragging] = pointAt(e);
    schedulePaint();
  });
  view.addEventListener('pointerup', () => { if (dragging >= 0) { dragging = -1; render(); } });

  // -------------------------------------------------- camera device
  async function pickCamera(id) {
    status.textContent = 'Opening the camera…';
    try {
      const size = await cam.openCamera(id || undefined);
      if (closed) { cam.closeCamera(); return; }
      if (draft.pts.length === 4 && frame && (frame.width !== size.width || frame.height !== size.height)) {
        const sx = size.width / frame.width, sy = size.height / frame.height;
        draft.pts = draft.pts.map(([x, y]) => [x * sx, y * sy]);
      } else if (draft.pts.length === 4 && !frame && c.frameW && c.frameW !== size.width) {
        const sx = size.width / c.frameW, sy = size.height / c.frameH;
        draft.pts = draft.pts.map(([x, y]) => [x * sx, y * sy]);
      }
      draft.deviceId = id;
      status.textContent = `Camera open at ${size.width}×${size.height}.`;
      frame = cam.grab();
      recompute();
    } catch (e) {
      frame = null; shown = null;
      status.textContent = cameraMessage(e);
      schedulePaint();
    }
    render();
  }

  async function listCams() {
    const cams = await cam.listCameras();
    devSel.innerHTML = '';
    if (!cams.length) {
      devSel.appendChild(h('span', { class: 'muted small' }, 'No camera found. Plug one in and reopen this dialog.'));
      status.textContent = 'No camera found.';
      return null;
    }
    const opts = Object.fromEntries(cams.map(d => [d.id, d.label]));
    if (!draft.deviceId || !opts[draft.deviceId]) draft.deviceId = cams[0].id;
    const sel = select(opts, draft.deviceId, v => pickCamera(v));
    sel.style.width = '280px';
    devSel.appendChild(sel);
    return draft.deviceId;
  }

  // -------------------------------------------------- controls
  function render() {
    controls.innerHTML = '';
    const err = ready() ? cam.calibrationError({ imagePts: draft.pts, bedPts: draft.bedPts }) : Infinity;

    appendAll(controls,
      h('div', { class: 'sec-h' }, 'Lens'),
      row('Straighten', h('input', {
        type: 'range', min: -0.6, max: 0.6, step: 0.005, value: draft.k, class: 'rng',
        onInput: e => { draft.k = parseFloat(e.target.value); kLabel.textContent = fmtNum(draft.k, 3); recompute(); }
      }), kLabel),
      h('div', { class: 'small muted', style: { margin: '-4px 0 10px 116px' } },
        'Slide until the bed edges look straight above. A camera that already looks straight stays at 0.'),

      h('div', { class: 'sec-h' }, `Known points — ${draft.pts.length} of 4 marked`),
      h('div', { class: 'note', html: draft.custom
        ? 'Click your four marks in the picture, then type where each one sits on the bed. Go round in one direction, starting nearest the top-left of the canvas.'
        : 'Click the four <b>bed corners</b> in the picture, in this order: <b>top-left, top-right, bottom-right, bottom-left</b>, matching the work area on the canvas. Drag a mark to nudge it.' }),
      row('Points are', select({ corners: 'The bed corners', custom: 'At coordinates I type' },
        draft.custom ? 'custom' : 'corners', v => {
          draft.custom = v === 'custom';
          if (!draft.custom) draft.bedPts = cam.bedCorners(state.device.workW, state.device.workH);
          render();
        })),
      draft.custom ? h('table', { class: 'tbl' },
        h('tr', {}, h('th', {}, 'Mark'), h('th', {}, 'X (mm)'), h('th', {}, 'Y (mm)'), h('th', {}, 'Clicked at')),
        ...[0, 1, 2, 3].map(i => h('tr', {},
          h('td', {}, String(i + 1)),
          h('td', {}, num(draft.bedPts[i][0], v => { draft.bedPts[i][0] = v; render(); }, { step: 0.1 })),
          h('td', {}, num(draft.bedPts[i][1], v => { draft.bedPts[i][1] = v; render(); }, { step: 0.1 })),
          h('td', { class: draft.pts[i] ? '' : 'muted' }, draft.pts[i]
            ? `${fmtNum(draft.pts[i][0], 0)}, ${fmtNum(draft.pts[i][1], 0)} px` : 'not yet'))))
        : null,
      h('div', { class: 'ctl' },
        h('button', { class: 'btn small', onClick: () => { draft.pts = []; render(); } }, 'Clear marks'),
        draft.pts.length === 4 && !ready()
          ? h('span', { class: 'badge danger' }, 'Those four points cross over — check the order')
          : ready() ? h('span', { class: 'muted small' },
            `Fit: ${err < 0.01 ? 'exact' : fmtNum(err, 2) + ' mm'}`) : null),

      h('div', { class: 'sec-h' }, 'Overlay'),
      row('Opacity', h('input', {
        type: 'range', min: 0.1, max: 1, step: 0.05, value: draft.opacity, class: 'rng',
        onInput: e => { draft.opacity = parseFloat(e.target.value); setCameraOpacity(draft.opacity); }
      })),
      row('Live', check(draft.live, v => { draft.live = v; }, 'Keep refreshing while the overlay is on')),
      h('div', { class: 'note warn' },
        'The overlay is a guide, not a measurement. Frame the job before you cut, and judge position from the frame rather than from the picture.'));
  }

  const body = h('div', { style: { width: '560px' } },
    row('Camera', devSel),
    status,
    h('div', { class: 'cam-wrap' }, view),
    controls);

  render();
  listCams().then(id => { if (id) pickCamera(id); });

  openModal({
    title: 'Camera alignment',
    body,
    width: '620px',
    onClose: () => {
      closed = true;
      clearInterval(previewTimer);
      // Hold the camera open only if it is actually feeding the overlay.
      if (!cameraImageShown()) cam.closeCamera();
    },
    buttons: [
      { label: 'Cancel' },
      { label: 'Use this camera', primary: true, onClick: () => {
        if (!ready()) {
          toast('Mark all four points first — the picture cannot be placed without them.', 'err');
          return false;
        }
        Object.assign(state.camera, {
          deviceId: draft.deviceId,
          k: draft.k,
          imagePts: draft.pts.map(p => p.slice()),
          bedPts: draft.custom ? draft.bedPts.map(p => p.slice()) : null,
          frameW: frame ? frame.width : state.camera.frameW,
          frameH: frame ? frame.height : state.camera.frameH,
          opacity: draft.opacity,
          live: draft.live
        });
        persistCamera();
        closed = true;
        clearInterval(previewTimer);
        if (refreshOverlay()) {
          if (draft.live) startLive();
          toast('Camera overlay on.');
        } else {
          toast('Calibration saved, but the picture could not be straightened.', 'err');
        }
        bus.emit('camera');
      } }
    ]
  });
}
