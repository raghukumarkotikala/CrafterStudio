// Image processing: adjustments, grayscale, dithering.

export const DITHERS = {
  grayscale: 'Grayscale (variable power)',
  threshold: 'Threshold',
  floyd: 'Floyd–Steinberg',
  jarvis: 'Jarvis–Judice–Ninke',
  stucki: 'Stucki',
  atkinson: 'Atkinson',
  burkes: 'Burkes',
  sierra: 'Sierra',
  bayer: 'Ordered (Bayer 4×4)',
  halftone: 'Halftone dots'
};

export const DEFAULT_ADJ = { brightness: 0, contrast: 0, gamma: 1, invert: false, threshold: 128, dither: 'jarvis' };

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = src;
  });
}

// Downscale very large images at import so the document stays responsive.
export function normalizeImage(img, maxSide = 2400) {
  const s = Math.min(1, maxSide / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  const w = Math.max(1, Math.round((img.naturalWidth || img.width) * s));
  const h = Math.max(1, Math.round((img.naturalHeight || img.height) * s));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return c;
}

/** Luminance array (0 = black … 255 = white) with brightness/contrast/gamma/invert applied. */
export function adjustedGray(imageData, adj) {
  const { data, width, height } = imageData;
  const out = new Float32Array(width * height);
  const b = (adj.brightness || 0) * 2.55;
  const c = adj.contrast || 0;
  const cf = (259 * (c + 255)) / (255 * (259 - c));
  const g = 1 / Math.max(0.05, adj.gamma || 1);
  for (let i = 0, j = 0; i < out.length; i++, j += 4) {
    const a = data[j + 3] / 255;
    let v = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2];
    v = v * a + 255 * (1 - a); // transparent → white (no burn)
    v = cf * (v - 128) + 128 + b;
    v = Math.min(255, Math.max(0, v));
    v = 255 * Math.pow(v / 255, g);
    if (adj.invert) v = 255 - v;
    out[i] = v;
  }
  return out;
}

const KERNELS = {
  floyd: { d: 16, k: [[1, 0, 7], [-1, 1, 3], [0, 1, 5], [1, 1, 1]] },
  jarvis: { d: 48, k: [[1, 0, 7], [2, 0, 5], [-2, 1, 3], [-1, 1, 5], [0, 1, 7], [1, 1, 5], [2, 1, 3], [-2, 2, 1], [-1, 2, 3], [0, 2, 5], [1, 2, 3], [2, 2, 1]] },
  stucki: { d: 42, k: [[1, 0, 8], [2, 0, 4], [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2], [-2, 2, 1], [-1, 2, 2], [0, 2, 4], [1, 2, 2], [2, 2, 1]] },
  atkinson: { d: 8, k: [[1, 0, 1], [2, 0, 1], [-1, 1, 1], [0, 1, 1], [1, 1, 1], [0, 2, 1]] },
  burkes: { d: 32, k: [[1, 0, 8], [2, 0, 4], [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2]] },
  sierra: { d: 32, k: [[1, 0, 5], [2, 0, 3], [-2, 1, 2], [-1, 1, 4], [0, 1, 5], [1, 1, 4], [2, 1, 2], [-1, 2, 2], [0, 2, 3], [1, 2, 2]] }
};

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/**
 * Convert grayscale (0..255, 255 = white) to burn intensity (0..1).
 * For dithered modes the output is strictly 0 or 1.
 */
export function dither(gray, w, h, method = 'jarvis', threshold = 128) {
  const out = new Float32Array(w * h);
  if (method === 'grayscale') {
    for (let i = 0; i < gray.length; i++) out[i] = 1 - gray[i] / 255;
    return out;
  }
  if (method === 'threshold') {
    for (let i = 0; i < gray.length; i++) out[i] = gray[i] < threshold ? 1 : 0;
    return out;
  }
  if (method === 'bayer') {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const t = (BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) * 16;
      out[y * w + x] = gray[y * w + x] < t ? 1 : 0;
    }
    return out;
  }
  if (method === 'halftone') {
    const cell = 6;
    for (let cy = 0; cy < h; cy += cell) for (let cx = 0; cx < w; cx += cell) {
      let sum = 0, n = 0;
      for (let y = cy; y < Math.min(h, cy + cell); y++) for (let x = cx; x < Math.min(w, cx + cell); x++) { sum += gray[y * w + x]; n++; }
      const dark = 1 - sum / n / 255;
      const r = Math.sqrt(dark) * cell * 0.72;
      const mx = cx + cell / 2, my = cy + cell / 2;
      for (let y = cy; y < Math.min(h, cy + cell); y++) for (let x = cx; x < Math.min(w, cx + cell); x++) {
        out[y * w + x] = (x + 0.5 - mx) ** 2 + (y + 0.5 - my) ** 2 <= r * r ? 1 : 0;
      }
    }
    return out;
  }
  const kern = KERNELS[method] || KERNELS.floyd;
  const buf = Float32Array.from(gray);
  for (let y = 0; y < h; y++) {
    const ltr = y % 2 === 0; // serpentine scanning reduces artifacts
    for (let xi = 0; xi < w; xi++) {
      const x = ltr ? xi : w - 1 - xi;
      const i = y * w + x;
      const old = buf[i];
      const nv = old < threshold ? 0 : 255;
      out[i] = nv === 0 ? 1 : 0;
      const err = old - nv;
      for (const [dx, dy, wt] of kern.k) {
        const nx = x + (ltr ? dx : -dx), ny = y + dy;
        if (nx < 0 || nx >= w || ny >= h) continue;
        buf[ny * w + nx] += (err * wt) / kern.d;
      }
    }
  }
  return out;
}

/** Render a processed preview canvas (what will be burned) for display. */
export function processedCanvas(srcCanvas, adj) {
  const w = srcCanvas.width, h = srcCanvas.height;
  const ctx = srcCanvas.getContext('2d');
  const id = ctx.getImageData(0, 0, w, h);
  const gray = adjustedGray(id, adj);
  const burn = dither(gray, w, h, adj.dither, adj.threshold);
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const octx = out.getContext('2d');
  const od = octx.createImageData(w, h);
  for (let i = 0, j = 0; i < burn.length; i++, j += 4) {
    const v = Math.round(255 * (1 - burn[i]));
    od.data[j] = od.data[j + 1] = od.data[j + 2] = v;
    od.data[j + 3] = 255;
  }
  octx.putImageData(od, 0, 0);
  return out;
}

export function canvasFromDataURL(url) {
  return loadImage(url).then(img => normalizeImage(img, 100000));
}
