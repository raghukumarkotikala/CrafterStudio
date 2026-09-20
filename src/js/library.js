// Asset library: built-in laser art, icon sets and the user's own library.
// Assets can be clicked (insert at view centre) or dragged onto the canvas.
/* global paper, PaperOffset */
import { state, bus, persistPrefs } from './state.js';
import { ed, addItem } from './editor.js';
import { h, toast, openModal } from './dom.js';
import { icon } from './icons.js';
import { getArtAssets, getArtCategories, artSvg } from './artlib.js';
import { importSVG, importDXF, importImage, dropHooks } from './io.js';

const SOURCES = {
  art: 'Laser art',
  outline: 'Line icons',
  filled: 'Solid icons',
  mdi: 'Material',
  mine: 'My library'
};
const BUNDLE_OF = { outline: 'tabler-outline', filled: 'tabler-filled', mdi: 'mdi' };
const PAGE = 120;

const ui = { source: 'art', query: '', category: '', shown: PAGE };
const bundles = {};
let mine = [];
const dragKey = 'application/x-crafter-asset';
let dragging = null;

// ------------------------------------------------------------------ data
async function loadBundle(src) {
  if (bundles[src]) return bundles[src];
  const name = BUNDLE_OF[src];
  const text = window.api ? await window.api.libBundle(name) : await (await fetch(`library/${name}.json`)).text();
  const data = JSON.parse(text);
  bundles[src] = {
    ...data,
    assets: data.items.map(([n, cat, tags, body]) => ({
      id: `${src}:${n}`, src, name: n.replace(/-/g, ' '), cat, tags: String(tags).toLowerCase(), body, stroke: data.stroke, viewBox: data.viewBox
    }))
  };
  bundles[src].categories = [...new Set(bundles[src].assets.map(a => a.cat))].sort();
  return bundles[src];
}

let artCache = null;
const artAssets = () => (artCache ||= getArtAssets().map(a => ({ ...a, src: 'art', tags: `${a.cat} ${a.name}`.toLowerCase() })));

async function loadMine() {
  mine = window.api ? await window.api.libList() : [];
  return mine;
}

function iconSvg(a, color, mm) {
  const size = mm ? ' width="24mm" height="24mm"' : '';
  const style = a.stroke
    ? `fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`
    : `fill="${color}"`;
  return `<svg xmlns="http://www.w3.org/2000/svg"${size} viewBox="${a.viewBox}" ${style}>${a.body}</svg>`;
}

function thumbSvg(a) {
  if (a.src === 'art') return artSvg(a, 'currentColor').replace(/ width="100mm" height="100mm"/, '');
  if (a.src === 'mine') {
    if (a.dataUrl) return `<img src="${a.dataUrl}" alt="">`;
    if (a.ext === '.svg') return a.text.replace(/<\?xml[^>]*>/, '').replace(/<!DOCTYPE[^>]*>/i, '');
    return `<div class="lib-ext">${a.ext.slice(1).toUpperCase()}</div>`;
  }
  return iconSvg(a, 'currentColor', false);
}

// ------------------------------------------------------------------ insertion
function defaultPoint() {
  const W = state.device.workW, H = state.device.workH;
  const c = paper.view.center;
  return new paper.Point(Math.min(W, Math.max(0, c.x)), Math.min(H, Math.max(0, c.y)));
}

function targetSize(a) {
  const W = state.device.workW, H = state.device.workH;
  const want = a.tile ? 100 : state.prefs.libSize || 40;
  return Math.min(want, Math.min(W, H) * 0.9);
}

function strokeToOutline(item) {
  const paths = item.getItems({ match: i => (i.className === 'Path' || i.className === 'CompoundPath') && i.strokeColor && i.strokeWidth > 0 && !(i.parent && i.parent.className === 'CompoundPath') });
  for (const p of paths) {
    try {
      const out = PaperOffset.offsetStroke(p, p.strokeWidth / 2, { cap: 'round', join: 'round', insert: false });
      if (out && !out.isEmpty()) {
        out.data = { ...p.data };
        p.replaceWith(out);
      }
    } catch { /* keep the centre line if outlining fails */ }
  }
}

function placeVector(item, a, at) {
  item.getItems({ match: i => i.clipMask || i.className === 'PointText' }).forEach(i => { if (i.clipMask && i.parent) i.parent.clipped = false; i.remove(); });
  const b = item.bounds;
  if (!b || b.isEmpty()) throw new Error('Asset has no drawable geometry');
  const s = targetSize(a) / Math.max(b.width, b.height);
  // Scale strokes with the geometry so line-art → outline conversion keeps its weight.
  item.getItems({ match: i => (i.className === 'Path' || i.className === 'CompoundPath') && !(i.parent && i.parent.className === 'CompoundPath') })
    .forEach(i => { if (i.strokeColor) i.strokeWidth *= s; });
  item.scale(s, b.topLeft);
  if ((a.stroke || a.kind === 'line') && state.prefs.libStroke === 'outline') strokeToOutline(item);
  item.getItems({ match: i => i.className === 'Path' || i.className === 'CompoundPath' }).forEach(i => { i.data = { layer: state.activeLayer }; });
  let result = item;
  while (result.className === 'Group' && result.children.length === 1) result = result.firstChild;
  if (result !== item) result.remove();
  result.position = at || defaultPoint();
  addItem(result);
  return result;
}

export async function insertAsset(a, at) {
  try {
    if (a.src === 'mine') {
      let item;
      if (a.ext === '.svg') item = importSVG(a.text);
      else if (a.ext === '.dxf') item = importDXF(a.text);
      else { await importImage(a.dataUrl, at || defaultPoint()); return; }
      if (item && at) { item.position = at; bus.emit('transform'); }
      return;
    }
    const svg = a.src === 'art' ? artSvg(a, '#000') : iconSvg(a, '#000', true);
    placeVector(paper.project.importSVG(svg, { insert: false, expandShapes: true }), a, at);
  } catch (e) {
    toast('Could not insert: ' + e.message, 'err');
  }
}

// Canvas drop target for library tiles
dropHooks.push(async e => {
  if (!e.dataTransfer.types.includes(dragKey) || !dragging) return false;
  const rect = ed.canvas.getBoundingClientRect();
  const at = paper.view.viewToProject(new paper.Point(e.clientX - rect.left, e.clientY - rect.top));
  const a = dragging;
  dragging = null;
  await insertAsset(a, at);
  return true;
});

// ------------------------------------------------------------------ save selection
function selectionSvg() {
  const items = state.selection.filter(i => i.parent);
  if (!items.length) return null;
  const g = new paper.Group({ insert: false });
  for (const it of items) g.addChild(it.clone({ insert: false }));
  g.getItems({ match: i => i.className === 'Path' || i.className === 'CompoundPath' }).forEach(p => {
    if (p.parent && p.parent.className === 'CompoundPath') return;
    const layer = state.layers.find(l => l.id === p.data.layer) || state.layers[0];
    p.strokeScaling = true;
    p.strokeWidth = 0.2;
    p.strokeColor = layer.color;
    p.fillColor = layer.mode === 'line' ? null : layer.color;
  });
  const b = g.bounds;
  g.translate(b.topLeft.multiply(-1));
  const w = +b.width.toFixed(3), hh = +b.height.toFixed(3);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}mm" height="${hh}mm" viewBox="0 0 ${w} ${hh}">${g.exportSVG({ asString: true })}</svg>\n`;
}

async function saveSelection(rerender) {
  const svg = selectionSvg();
  if (!svg) { toast('Select objects on the canvas first.'); return; }
  const { askText } = await import('./dialogs.js');
  const name = await askText('Save to My Library', 'Name', 'My design');
  if (!name) return;
  await window.api.libSave(name, svg);
  toast(`Saved “${name}” to My Library`);
  await loadMine();
  rerender();
}

// ------------------------------------------------------------------ panel
function matches(a, q) {
  if (!q) return true;
  return q.split(/\s+/).every(w => a.name.toLowerCase().includes(w) || (a.tags && a.tags.includes(w)));
}

export async function renderLibraryTab(body) {
  const rerender = () => { body.innerHTML = ''; renderLibraryTab(body); };
  const top = h('div', { class: 'lib-top' });
  const grid = h('div', { class: 'lib-grid' });
  const footer = h('div', { class: 'lib-foot' });
  body.append(top, grid, footer);

  // search + source
  const search = h('input', { class: 'inp', placeholder: 'Search art & icons…', value: ui.query });
  let t = 0;
  search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { ui.query = search.value.trim().toLowerCase(); ui.shown = PAGE; fill(); }, 150); });
  const srcRow = h('div', { class: 'chips', style: { margin: '8px 0' } }, ...Object.entries(SOURCES).map(([k, v]) =>
    h('button', { class: 'chip' + (ui.source === k ? ' on' : ''), onClick: () => { ui.source = k; ui.category = ''; ui.shown = PAGE; rerender(); } }, v)));
  const catSel = h('select', { class: 'inp', onChange: e => { ui.category = e.target.value; ui.shown = PAGE; fill(); } });
  const count = h('span', { class: 'small muted', style: { whiteSpace: 'nowrap' } });
  const sizeInp = h('input', { class: 'num sm', type: 'number', min: 1, max: 2000, value: state.prefs.libSize || 40, onChange: e => { state.prefs.libSize = Math.max(1, +e.target.value || 40); persistPrefs(); } });
  const strokeSel = h('select', { class: 'inp', style: { width: '120px' }, title: 'How line icons are inserted', onChange: e => { state.prefs.libStroke = e.target.value; persistPrefs(); } },
    h('option', { value: 'lines' }, 'Lines'), h('option', { value: 'outline' }, 'Outlined strokes'));
  strokeSel.value = state.prefs.libStroke || 'lines';
  top.append(search, srcRow,
    h('div', { class: 'row' }, catSel, count),
    h('div', { class: 'row small' }, h('span', { class: 'muted' }, 'Size'), sizeInp, h('span', { class: 'muted' }, 'mm'),
      h('span', { class: 'muted', style: { marginLeft: '8px' } }, 'Line art as'), strokeSel));

  if (ui.source === 'mine') {
    if (!window.api) top.append(h('div', { class: 'note' }, 'My Library is available in the desktop app.'));
    else top.append(h('div', { class: 'grid2', style: { marginBottom: '8px' } },
      h('button', { class: 'btn small', onClick: async () => { if (await window.api.libAdd()) { await loadMine(); rerender(); } }, html: icon('import') + 'Add files…' }),
      h('button', { class: 'btn small', onClick: () => saveSelection(rerender), html: icon('save') + 'Save selection' }),
      h('button', { class: 'btn small', onClick: () => window.api.libOpenFolder(), html: icon('open') + 'Open folder' }),
      h('button', { class: 'btn small', onClick: async () => { await loadMine(); rerender(); } }, 'Refresh')));
  }

  let assets = [];
  let categories = [];
  grid.innerHTML = '<div class="muted small" style="grid-column:1/-1;padding:10px">Loading…</div>';
  try {
    if (ui.source === 'art') { assets = artAssets(); categories = getArtCategories(); }
    else if (ui.source === 'mine') {
      await loadMine();
      assets = mine.map(m => ({ ...m, id: 'mine:' + m.file, src: 'mine', cat: m.ext.slice(1).toUpperCase(), tags: m.name.toLowerCase() }));
      categories = [...new Set(assets.map(a => a.cat))];
    } else {
      const b = await loadBundle(ui.source);
      assets = b.assets;
      categories = b.categories;
      footer.textContent = `${b.set} · ${b.license}`;
    }
  } catch (e) {
    grid.innerHTML = '';
    grid.append(h('div', { class: 'note warn', style: { gridColumn: '1/-1' } }, 'Could not load library: ' + e.message));
    return;
  }
  if (ui.source === 'art') footer.textContent = 'Crafter laser art · free to use in your projects';
  if (ui.source === 'mine') footer.textContent = 'Your files are stored in the Crafter data folder.';

  catSel.append(h('option', { value: '' }, `All categories (${categories.length})`), ...categories.map(c => h('option', { value: c }, c)));
  catSel.value = ui.category;

  function fill() {
    const list = assets.filter(a => (!ui.category || a.cat === ui.category) && matches(a, ui.query));
    count.textContent = `${list.length.toLocaleString()} items`;
    grid.innerHTML = '';
    if (!list.length) {
      grid.append(h('div', { class: 'muted small', style: { gridColumn: '1/-1', padding: '10px' } },
        ui.source === 'mine' ? 'Your library is empty. Add image or SVG files, or save a selection from the canvas.' : 'No matches.'));
    }
    for (const a of list.slice(0, ui.shown)) grid.append(tile(a, rerender));
    if (list.length > ui.shown) {
      grid.append(h('button', { class: 'btn small', style: { gridColumn: '1/-1' }, onClick: () => { ui.shown += PAGE; fill(); } },
        `Show more (${(list.length - ui.shown).toLocaleString()} remaining)`));
    }
  }
  fill();
}

function tile(a, rerender) {
  const el = h('div', {
    class: 'lib-tile' + (a.kind === 'line' || a.stroke ? ' line' : ''),
    title: `${a.name}${a.cat ? ' — ' + a.cat : ''}\nClick to insert · drag onto the canvas`,
    draggable: 'true',
    html: thumbSvg(a),
    onClick: () => insertAsset(a),
    onDragstart: e => {
      dragging = a;
      e.dataTransfer.setData(dragKey, a.id);
      e.dataTransfer.effectAllowed = 'copy';
    },
    onDragend: () => { setTimeout(() => { dragging = null; }, 0); }
  });
  el.append(h('span', { class: 'lib-name' }, a.name));
  if (a.src === 'mine') {
    el.append(h('button', { class: 'lib-del', title: 'Remove from library', html: icon('trash'), onClick: async e => {
      e.stopPropagation();
      openModal({
        title: 'Remove from library', width: '380px',
        body: h('div', {}, `Delete “${a.name}${a.ext}” from My Library? This removes the file from the library folder.`),
        buttons: [{ label: 'Cancel' }, { label: 'Delete', danger: true, onClick: async () => { await window.api.libDelete(a.file); await loadMine(); rerender(); } }]
      });
    } }));
  }
  return el;
}
