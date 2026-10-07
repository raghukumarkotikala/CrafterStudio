// Crafter Studio renderer entry point.
/* global paper */
import { state, setDirty } from './state.js';
import { initEditor, ed, updateSelectionBox, pushHistory, clearSelection } from './editor.js';
import { initTools, hooks, currentTool, isTyping, setTool } from './tools.js';
import { initPreview } from './preview.js';
import { initUI } from './ui.js';
import { run } from './commands.js';
import { enableDrop } from './io.js';
import { openTextDialog, openProfileDialog, openPortChooser } from './dialogs.js';
import { modalOpen } from './dom.js';
import { initAI } from './aiui.js';

function boot() {
  initEditor(document.getElementById('canvas'), document.getElementById('ruler-top'), document.getElementById('ruler-left'));
  initTools();
  hooks.editText = (item, at) => openTextDialog(item, at);
  initPreview(document.getElementById('preview-canvas'));
  initUI();
  initAI();
  enableDrop(document.getElementById('canvas-wrap'));
  setDirty(false);

  if (window.api) {
    window.api.onMenu(cmd => run(cmd));
    window.api.onSerialPorts(list => openPortChooser(list));
  }

  window.addEventListener('keydown', onKey);
  window.addEventListener('beforeunload', e => {
    if (!window.api && state.dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  if (state.firstRun) setTimeout(() => openProfileDialog({ welcome: true }), 300);
}

// Keys that the Electron menu registers itself; in a plain browser we handle them here.
const MENU_OWNED = new Set(['ctrl+n', 'ctrl+o', 'ctrl+s', 'ctrl+shift+s', 'ctrl+i', 'ctrl+e', 'f5', 'alt+p', 'ctrl+shift+m', 'f1']);

const TOOL_KEYS = { v: 'select', n: 'node', r: 'rect', e: 'ellipse', p: 'polygon', s: 'star', l: 'line', b: 'pen', f: 'pencil', t: 'text' };

function onKey(e) {
  if (modalOpen() || isTyping(e)) return;
  const ctrl = e.ctrlKey || e.metaKey;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const combo = `${ctrl ? 'ctrl+' : ''}${e.shiftKey && e.key.length > 1 || e.shiftKey && ctrl ? 'shift+' : ''}${e.altKey ? 'alt+' : ''}${k.toLowerCase()}`;

  if (MENU_OWNED.has(combo)) {
    if (window.api) return;
    const map = { 'ctrl+n': 'file.new', 'ctrl+o': 'file.open', 'ctrl+s': 'file.save', 'ctrl+shift+s': 'file.saveAs', 'ctrl+i': 'file.import', 'ctrl+e': 'file.exportGcode', f5: 'job.start', 'alt+p': 'job.preview', 'ctrl+shift+m': 'machine.profile', f1: 'help.contents' };
    e.preventDefault();
    run(map[combo]);
    return;
  }

  const t = currentTool();
  if (t.key && t.key(e)) { e.preventDefault(); return; }

  if (ctrl) {
    const map = {
      z: e.shiftKey ? 'edit.redo' : 'edit.undo', y: 'edit.redo', c: 'edit.copy', x: 'edit.cut', v: 'edit.paste', d: 'edit.duplicate',
      a: 'edit.selectAll', g: e.shiftKey ? 'obj.ungroup' : 'obj.group', k: e.shiftKey ? 'obj.breakApart' : 'obj.combine',
      '+': 'obj.unite', '=': 'obj.unite', '-': 'obj.subtract', '*': 'obj.intersect', '^': 'obj.exclude'
    };
    if (map[k]) { e.preventDefault(); run(map[k]); }
    return;
  }

  if (e.altKey && !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;

  if (e.key.startsWith('Arrow')) {
    if (!state.selection.length) return;
    e.preventDefault();
    const d = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
    const v = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[e.key];
    state.selection.forEach(i => i.translate(new paper.Point(v[0], v[1])));
    updateSelectionBox();
    clearTimeout(onKey.nudgeTimer);
    onKey.nudgeTimer = setTimeout(pushHistory, 350);
    return;
  }

  switch (e.key) {
    case 'Delete':
    case 'Backspace': e.preventDefault(); run('edit.delete'); return;
    case 'Escape': if (state.tool !== 'select') setTool('select'); else clearSelection(); return;
    case 'Home': run('obj.front'); return;
    case 'End': run('obj.back'); return;
    case 'PageUp': run('obj.raise'); return;
    case 'PageDown': run('obj.lower'); return;
    case '5': run('view.fit'); return;
    case '3': run('view.fitSel'); return;
    case '+': case '=': run('view.zoomIn'); return;
    case '-': case '_': run('view.zoomOut'); return;
    case '%': run('view.snap'); return;
    default: break;
  }
  if (k === 'h') { run(e.shiftKey ? 'obj.flipV' : 'obj.flipH'); return; }
  if (!e.shiftKey && TOOL_KEYS[k]) setTool(TOOL_KEYS[k]);
}

boot();
export { ed };
