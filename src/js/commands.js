// Central command registry used by menus, toolbar buttons, context menu and keyboard.
import { state, persistPrefs, bus } from './state.js';
import { undo, redo, zoomAt, fitWorkArea, fitSelection, clearSelection } from './editor.js';
import * as ops from './ops.js';
import * as io from './io.js';
import * as dlg from './dialogs.js';
import * as jobs from './jobs.js';
import { setTool, TOOLS } from './tools.js';

export const cmds = {
  'file.new': io.newProject,
  'file.open': io.openProject,
  'file.save': () => io.saveProject(false),
  'file.saveAs': () => io.saveProject(true),
  'file.import': io.importFile,
  'file.exportGcode': io.exportGcode,
  'file.exportSvg': io.exportSVG,

  'edit.undo': undo,
  'edit.redo': redo,
  'edit.cut': ops.cut,
  'edit.copy': ops.copy,
  'edit.paste': ops.paste,
  'edit.duplicate': ops.duplicate,
  'edit.delete': ops.del,
  'edit.selectAll': ops.selectAll,
  'edit.deselect': clearSelection,

  'obj.group': ops.group,
  'obj.ungroup': ops.ungroup,
  'obj.combine': ops.combine,
  'obj.breakApart': ops.breakApart,
  'obj.unite': () => ops.boolean('unite'),
  'obj.subtract': () => ops.boolean('subtract'),
  'obj.intersect': () => ops.boolean('intersect'),
  'obj.exclude': () => ops.boolean('exclude'),
  'obj.divide': () => ops.boolean('divide'),
  'obj.offset': dlg.openOffsetDialog,
  'obj.flipH': () => ops.flip(true),
  'obj.flipV': () => ops.flip(false),
  'obj.rot90': () => ops.rotate(90),
  'obj.rot-90': () => ops.rotate(-90),
  'obj.front': () => ops.arrange('front'),
  'obj.back': () => ops.arrange('back'),
  'obj.raise': () => ops.arrange('raise'),
  'obj.lower': () => ops.arrange('lower'),
  'obj.gridArray': dlg.openGridArrayDialog,
  'obj.circArray': dlg.openCircArrayDialog,
  'obj.centerWork': ops.centerInWorkArea,
  'obj.trace': dlg.openTraceDialog,
  'obj.toPath': ops.convertToPath,
  'align.left': () => ops.align('left'),
  'align.hcenter': () => ops.align('hcenter'),
  'align.right': () => ops.align('right'),
  'align.top': () => ops.align('top'),
  'align.vcenter': () => ops.align('vcenter'),
  'align.bottom': () => ops.align('bottom'),
  'align.distH': () => ops.distribute(true),
  'align.distV': () => ops.distribute(false),

  'view.zoomIn': () => zoomAt(1.25),
  'view.zoomOut': () => zoomAt(0.8),
  'view.fit': fitWorkArea,
  'view.fitSel': fitSelection,
  'view.snap': () => { state.prefs.snap = !state.prefs.snap; persistPrefs(); bus.emit('prefs'); },

  'machine.profile': () => dlg.openProfileDialog(),
  'machine.connect': jobs.toggleConnect,
  'job.preview': jobs.togglePreview,
  'job.frame': jobs.frameJob,
  'job.start': jobs.startJob,
  'job.pause': jobs.pauseJob,
  'job.stop': jobs.stopJob,
  'tools.materials': dlg.openMaterialsDialog,
  'tools.materialTest': dlg.openMaterialTestDialog,

  'help.shortcuts': dlg.openShortcuts,
  'help.about': dlg.openAbout
};

for (const name of Object.keys(TOOLS)) cmds['tool.' + name] = () => setTool(name);

export async function run(cmd) {
  const fn = cmds[cmd];
  if (!fn) { console.warn('Unknown command', cmd); return; }
  try {
    await fn();
  } catch (e) {
    console.error(e);
    bus.emit('toast', `${cmd}: ${e.message}`, 'err');
  }
}
