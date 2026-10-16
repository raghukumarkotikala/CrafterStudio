// Camera alignment overlay: a photograph of the bed, straightened out and drawn
// behind the design so artwork can be placed on the real material.
//
// Two distortions sit between the camera and a usable picture. The lens bows
// straight lines (barrel distortion), and the camera almost never looks
// straight down, so the rectangular bed arrives as a trapezium. Both are
// undone here: the lens with a one-parameter radial model the user dials in by
// eye, the viewing angle with a projective transform built from four marked
// points whose real bed coordinates are known.
//
// The geometry is deliberately free of DOM so it can be tested directly.

import { unitQuadTransform, mapUnit, isValidQuad } from './warp.js';

/** Corners of the bed, in the order the calibration asks for them. */
export const CORNER_NAMES = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];

// ------------------------------------------------------------------ homography
// warp.js already maps the unit square onto a quad, and that map is exactly a
// homography. Going from one quad to another is therefore the unit-square map
// to the destination composed with the inverse of the map to the source.

function matFromQuad(q) {
  const t = unitQuadTransform(q);
  return t ? [t.a, t.b, t.c, t.d, t.e, t.f, t.g, t.h, 1] : null;
}

function inv3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (!isFinite(det) || Math.abs(det) < 1e-12) return null;
  const s = 1 / det;
  return [
    (e * i - f * h) * s, (c * h - b * i) * s, (b * f - c * e) * s,
    (f * g - d * i) * s, (a * i - c * g) * s, (c * d - a * f) * s,
    (d * h - e * g) * s, (b * g - a * h) * s, (a * e - b * d) * s
  ];
}

function mul3(m, n) {
  const out = new Array(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[r * 3 + c] = m[r * 3] * n[c] + m[r * 3 + 1] * n[3 + c] + m[r * 3 + 2] * n[6 + c];
    }
  }
  return out;
}

/**
 * The projective transform taking the four points of `from` onto the four
 * points of `to`, both listed in the same rotational order. Returns null if
 * either quad is degenerate, which is the honest answer for four points that
 * cannot define a view.
 */
export function homography(from, to) {
  if (!isValidQuad(from) || !isValidQuad(to)) return null;
  const a = matFromQuad(to), b = matFromQuad(from);
  if (!a || !b) return null;
  const bi = inv3(b);
  return bi ? mul3(a, bi) : null;
}

/** Apply a homography to a point. Returns null behind the horizon. */
export function applyH(m, x, y) {
  const w = m[6] * x + m[7] * y + m[8];
  if (Math.abs(w) < 1e-12) return null;
  return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w];
}

// ------------------------------------------------------------------ lens
/**
 * Where an ideal, straight-line point actually lands on the sensor.
 *
 * This is the forward model, which is the direction that matters: every output
 * pixel asks "which captured pixel belongs here", so the distortion is applied
 * rather than inverted and no iteration is needed.
 *
 * `k` is normalised so that r = 1 at the corner of the frame, which keeps the
 * slider meaningful across different resolutions.
 */
export function lensPoint(x, y, k, w, h) {
  if (!k) return [x, y];
  const cx = w / 2, cy = h / 2;
  const dx = x - cx, dy = y - cy;
  const inv = 1 / (cx * cx + cy * cy);
  const s = 1 + k * (dx * dx + dy * dy) * inv;
  return [cx + dx * s, cy + dy * s];
}

// ------------------------------------------------------------------ resampling
const EMPTY = { width: 0, height: 0, data: new Uint8ClampedArray(0) };

function sampler(src) {
  const { width: w, height: h, data } = src;
  const px = new Uint32Array(data.buffer, data.byteOffset, w * h);
  return (x, y) => {
    const ix = x | 0, iy = y | 0;
    // Outside the frame is left transparent rather than clamped to the edge:
    // a smeared border would look like bed the camera can actually see.
    if (x < 0 || y < 0 || ix >= w || iy >= h) return 0;
    return px[iy * w + ix];
  };
}

function blank(w, h) {
  return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
}

/**
 * Straighten the lens only, keeping the camera's own framing. This is what the
 * calibration preview shows, so that the bed edges look straight before the
 * four corners are marked.
 */
export function undistort(src, k) {
  if (!src || !src.width || !src.height) return EMPTY;
  const { width: w, height: h } = src;
  const out = blank(w, h);
  if (!k) { out.data.set(src.data); return out; }
  const get = sampler(src);
  const dst = new Uint32Array(out.data.buffer);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [sx, sy] = lensPoint(x + 0.5, y + 0.5, k, w, h);
      dst[y * w + x] = get(sx, sy);
    }
  }
  return out;
}

/**
 * Render the bed as seen from directly above: one output pixel per
 * 1/pxPerMm of bed, with the design's own coordinates.
 *
 * `imagePts` are the four marks in the *undistorted* picture — the same space
 * the calibration preview shows — and `bedPts` are their positions on the bed
 * in mm, so the default of the four bed corners is only the easy case. Any four
 * points whose coordinates are known will do, which is what makes marking a
 * jig or a taped-down template possible.
 */
export function renderBed(src, cal, bedW, bedH, pxPerMm = 4) {
  if (!src || !src.width || !src.height) return EMPTY;
  const m = homography(cal.bedPts, cal.imagePts);
  if (!m) return EMPTY;

  const w = Math.max(1, Math.round(bedW * pxPerMm));
  const h = Math.max(1, Math.round(bedH * pxPerMm));
  const out = blank(w, h);
  const dst = new Uint32Array(out.data.buffer);
  const get = sampler(src);
  const k = cal.k || 0;
  const sw = src.width, sh = src.height;
  const mmPerPx = 1 / pxPerMm;

  for (let row = 0; row < h; row++) {
    const ymm = (row + 0.5) * mmPerPx;
    for (let col = 0; col < w; col++) {
      const p = applyH(m, (col + 0.5) * mmPerPx, ymm);
      if (!p) continue;
      const [sx, sy] = lensPoint(p[0], p[1], k, sw, sh);
      dst[row * w + col] = get(sx, sy);
    }
  }
  return out;
}

/** Bed corners in design coordinates — the default set of known points. */
export function bedCorners(bedW, bedH) {
  return [[0, 0], [bedW, 0], [bedW, bedH], [0, bedH]];
}

/**
 * How far the marked points are from describing a flat rectangle seen at an
 * angle, reported in mm so it can be judged. Each bed point is pushed through
 * the transform and back, and the worst round-trip error is returned: a large
 * figure means one corner was marked in the wrong place or out of order.
 */
export function calibrationError(cal) {
  const fwd = homography(cal.bedPts, cal.imagePts);
  const back = homography(cal.imagePts, cal.bedPts);
  if (!fwd || !back) return Infinity;
  let worst = 0;
  for (const [x, y] of cal.bedPts) {
    const img = applyH(fwd, x, y);
    if (!img) return Infinity;
    const bed = applyH(back, img[0], img[1]);
    if (!bed) return Infinity;
    worst = Math.max(worst, Math.hypot(bed[0] - x, bed[1] - y));
  }
  return worst;
}

export function isCalibrated(cal) {
  return !!(cal && Array.isArray(cal.imagePts) && cal.imagePts.length === 4 &&
            isValidQuad(cal.imagePts) && isValidQuad(cal.bedPts));
}

// ------------------------------------------------------------------ device
let stream = null;
let video = null;

/**
 * Cameras the browser will admit to. Labels only arrive once permission has
 * been granted at least once, so an unnamed device is numbered instead of
 * being shown as an empty row.
 */
export async function listCameras() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter(d => d.kind === 'videoinput')
    .map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` }));
}

/** Open a camera and wait until it is actually producing frames. */
export async function openCamera(deviceId, width = 1280, height = 720) {
  closeCamera();
  const video_ = { width: { ideal: width }, height: { ideal: height } };
  if (deviceId) video_.deviceId = { exact: deviceId };
  stream = await navigator.mediaDevices.getUserMedia({ video: video_, audio: false });
  video = document.createElement('video');
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play();
  // A freshly played video can still report 0×0 for a frame or two, and
  // grabbing then yields an empty picture.
  for (let i = 0; i < 60 && !video.videoWidth; i++) {
    await new Promise(r => setTimeout(r, 50));
  }
  if (!video.videoWidth) { closeCamera(); throw new Error('The camera opened but sent no picture.'); }
  return { width: video.videoWidth, height: video.videoHeight };
}

export function closeCamera() {
  if (stream) stream.getTracks().forEach(t => t.stop());
  if (video) { video.srcObject = null; video = null; }
  stream = null;
}

export function cameraOpen() { return !!(video && video.videoWidth); }

let grabCv = null;
/** The current frame as raw pixels. */
export function grab() {
  if (!cameraOpen()) return null;
  const w = video.videoWidth, h = video.videoHeight;
  if (!grabCv || grabCv.width !== w || grabCv.height !== h) {
    grabCv = document.createElement('canvas');
    grabCv.width = w; grabCv.height = h;
  }
  const g = grabCv.getContext('2d', { willReadFrequently: true });
  g.drawImage(video, 0, 0, w, h);
  return g.getImageData(0, 0, w, h);
}

/** Put raw pixels on a canvas, resizing it to match. */
export function toCanvas(img, canvas) {
  const cv = canvas || document.createElement('canvas');
  cv.width = Math.max(1, img.width);
  cv.height = Math.max(1, img.height);
  if (img.width && img.height) {
    const data = img instanceof ImageData ? img : new ImageData(img.data, img.width, img.height);
    cv.getContext('2d').putImageData(data, 0, 0);
  }
  return cv;
}
