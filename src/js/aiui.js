// AI panel, settings dialog, prompt-assist and the material settings advisor.
import { h, openModal, row, num, select, toast, appendAll } from './dom.js';
import { icon } from './icons.js';
import { state, bus, saveJSON, getLayer } from './state.js';
import { ed, styleItem } from './editor.js';
import { showTab } from './ui.js';
import {
  aiSettings, saveAiSettings, isConfigured, SUGGESTED_MODELS, listLocalModels,
  generateArtwork, placeSVG, assistSelection, suggestSettings,
  newRequestId, cancelRequest
} from './ai.js';

// Panel state lives here so switching sidebar tabs does not lose a prompt or result.
const ai = {
  prompt: '',
  w: 100,
  h: 100,
  fit: 0,
  busy: false,
  reqId: null,
  result: null,   // sanitised SVG string
  error: '',
  history: []     // { svg, prompt } — newest first, session only
};

const IDEAS = [
  'a geometric mandala coaster',
  'a hanging name tag with a star cutout',
  'a stencil of a maple leaf',
  'a honeycomb phone stand',
  'a simple rocket ship keychain',
  'a floral corner border'
];

let settingsCache = null;

export async function initAI() {
  settingsCache = await aiSettings();
  bus.on('ai-settings', s => { settingsCache = s; });
}

// ================================================================ sidebar tab
export function renderAITab(body) {
  const s = settingsCache;
  const ready = isConfigured(s);

  // ---- provider status
  const providerLabel = !s ? 'Loading…'
    : s.provider === 'ollama' ? `Ollama (local) · ${(s.ollama && s.ollama.model) || 'no model'}`
      : s.provider === 'openai' ? `OpenAI-compatible · ${s.openai.model || 'no model'}`
        : `Anthropic · ${s.anthropic.model || 'no model'}`;

  body.appendChild(h('div', { class: 'ai-status' },
    h('span', { class: 'conn-dot' + (ready ? ' on' : '') }),
    h('div', { class: 'ai-status-t' },
      h('div', {}, ready ? providerLabel : 'AI not set up'),
      h('div', { class: 'small muted' }, ready ? 'Ready' : 'Add a provider and API key')),
    h('button', { class: 'mini', title: 'AI settings', html: icon('settings'), onClick: openAISettings })));

  if (!ready) {
    body.appendChild(h('div', { class: 'note' },
      'Crafter can generate laser-ready artwork from a description, restyle what you have drawn, and suggest cut settings. Add your own API key to switch it on — requests go straight from this machine to the provider you choose.'));
    body.appendChild(h('button', { class: 'btn primary wide', onClick: openAISettings }, 'Set up AI…'));
    return;
  }

  // ---- generator
  body.appendChild(h('div', { class: 'sec-h' }, 'Generate a design'));

  const ta = h('textarea', { class: 'inp', rows: 4, placeholder: 'Describe what you want to make…\ne.g. a stencil of an oak leaf, 80 mm tall' }, ai.prompt);
  ta.addEventListener('input', () => { ai.prompt = ta.value; });
  ta.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); doGenerate(); }
  });
  body.appendChild(ta);

  const chips = h('div', { class: 'chips ai-ideas' });
  for (const idea of IDEAS) {
    chips.appendChild(h('button', { class: 'chip', onClick: () => { ai.prompt = idea; ta.value = idea; ta.focus(); } }, idea));
  }
  body.appendChild(chips);

  body.appendChild(h('div', { class: 'grid2', style: { marginTop: '8px' } },
    h('div', { class: 'row compact' }, h('label', {}, 'Width'), h('div', { class: 'ctl' }, num(ai.w, v => { ai.w = v; }, { min: 5, max: state.device.workW, unit: 'mm' }))),
    h('div', { class: 'row compact' }, h('label', {}, 'Height'), h('div', { class: 'ctl' }, num(ai.h, v => { ai.h = v; }, { min: 5, max: state.device.workH, unit: 'mm' })))));

  const genBtn = h('button', {
    class: 'btn primary wide',
    onClick: () => (ai.busy ? doCancel() : doGenerate())
  }, ai.busy ? 'Cancel' : (ai.result ? 'Generate again' : 'Generate'));
  body.appendChild(genBtn);

  if (ai.busy) body.appendChild(h('div', { class: 'ai-busy' }, h('span', { class: 'spin' }), 'Designing… this usually takes 10–30 seconds.'));
  if (ai.error) body.appendChild(h('div', { class: 'note warn' }, ai.error));

  // ---- result
  if (ai.result) {
    body.appendChild(h('div', { class: 'sec-h' }, 'Result'));
    body.appendChild(preview(ai.result));
    body.appendChild(h('div', { class: 'grid2', style: { marginTop: '6px' } },
      h('button', { class: 'btn primary', onClick: () => doInsert(ai.result) }, 'Add to canvas'),
      h('button', { class: 'btn', onClick: () => doSaveToLibrary(ai.result) }, 'Save to Library')));
    body.appendChild(h('div', { class: 'small muted', style: { marginTop: '6px' } },
      'Blue lines land on the cut layer, black fills on the engrave layer. Always check the geometry and run a test piece.'));
  }

  // ---- history
  if (ai.history.length > 1) {
    body.appendChild(h('div', { class: 'sec-h' }, 'This session'));
    const grid = h('div', { class: 'ai-history' });
    for (const item of ai.history.slice(0, 8)) {
      grid.appendChild(h('div', {
        class: 'ai-hist' + (item.svg === ai.result ? ' sel' : ''),
        title: item.prompt,
        onClick: () => { ai.result = item.svg; ai.prompt = item.prompt; refresh(); }
      }, preview(item.svg, true)));
    }
    body.appendChild(grid);
  }

  // ---- assist + advisor
  body.appendChild(h('div', { class: 'sec-h' }, 'Change the selection'));
  const assistInp = h('input', { class: 'inp', placeholder: 'e.g. add a 3 mm border and a hanging hole' });
  assistInp.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') doAssist(assistInp.value);
  });
  body.appendChild(assistInp);
  body.appendChild(h('button', { class: 'btn wide', onClick: () => doAssist(assistInp.value) }, 'Apply to selection'));

  body.appendChild(h('div', { class: 'sec-h' }, 'Material settings'));
  body.appendChild(h('button', { class: 'btn wide', onClick: openAdvisor }, 'Suggest power & speed…'));
}

function preview(svg, small = false) {
  const box = h('div', { class: 'ai-preview' + (small ? ' small' : '') });
  box.innerHTML = svg; // sanitised by sanitizeSVG() before it ever gets here
  return box;
}

function refresh() {
  showTab('ai');
}

// ================================================================ actions
async function doGenerate() {
  if (ai.busy) return;
  const prompt = ai.prompt.trim();
  if (!prompt) { toast('Describe what you want to make first.'); return; }
  ai.busy = true;
  ai.error = '';
  ai.reqId = newRequestId();
  refresh();
  try {
    const svg = await generateArtwork({ prompt, widthMm: ai.w, heightMm: ai.h, id: ai.reqId });
    ai.result = svg;
    ai.history.unshift({ svg, prompt });
    ai.history = ai.history.slice(0, 12);
  } catch (e) {
    if (e.message !== 'Cancelled') ai.error = e.message;
  } finally {
    ai.busy = false;
    ai.reqId = null;
    refresh();
  }
}

function doCancel() {
  if (ai.reqId) cancelRequest(ai.reqId);
}

function doInsert(svg) {
  try {
    placeSVG(svg);
    toast('Added to the canvas. Check the layer settings before cutting.');
  } catch (e) {
    toast('Could not add it: ' + e.message, 'err');
  }
}

async function doSaveToLibrary(svg) {
  if (!window.api) return;
  try {
    const name = (ai.prompt.trim() || 'AI design').slice(0, 60);
    await window.api.libSave(name, svg);
    toast(`Saved “${name}” to My Library.`);
  } catch (e) {
    toast('Could not save: ' + e.message, 'err');
  }
}

async function doAssist(instruction) {
  if (ai.busy) { toast('Wait for the current request to finish.'); return; }
  if (!state.selection.length) { toast('Select something on the canvas first.'); return; }
  const text = String(instruction || '').trim();
  if (!text) { toast('Describe the change you want.'); return; }
  ai.busy = true;
  ai.error = '';
  ai.reqId = newRequestId();
  refresh();
  try {
    await assistSelection({ instruction: text, id: ai.reqId });
    toast('Selection updated. Ctrl+Z puts it back.');
  } catch (e) {
    if (e.message !== 'Cancelled') { ai.error = e.message; toast('AI edit failed: ' + e.message, 'err'); }
  } finally {
    ai.busy = false;
    ai.reqId = null;
    refresh();
  }
}

// Menu entry point — the sidebar has the same action inline.
export function openAssistDialog() {
  if (!state.selection.length) { toast('Select something on the canvas first.'); return; }
  const inp = h('input', { class: 'inp', placeholder: 'e.g. turn this into a stencil' });
  inp.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') { const v = inp.value; d.close(); doAssist(v); }
  });
  const d = openModal({
    title: 'Change the selection with AI',
    width: '460px',
    body: h('div', {},
      row('Change', inp),
      h('div', { class: 'note' }, 'The selected paths are sent to your AI provider and replaced by whatever comes back. Undo with Ctrl+Z.')),
    buttons: [{ label: 'Cancel' }, { label: 'Apply', primary: true, onClick: () => doAssist(inp.value) }]
  });
}

// ================================================================ settings dialog
export async function openAISettings() {
  const s = await aiSettings(true);
  const draft = {
    provider: s.provider,
    anthropic: { model: s.anthropic.model, key: undefined },
    openai: { baseUrl: s.openai.baseUrl, model: s.openai.model, key: undefined },
    ollama: { host: (s.ollama && s.ollama.host) || 'http://localhost:11434', model: (s.ollama && s.ollama.model) || '' }
  };

  let localModels = null;      // null until first lookup
  let localError = '';
  let localSource = '';
  let loadingModels = false;

  const bodyEl = h('div', { style: { width: '460px' } });

  async function loadModels() {
    loadingModels = true;
    localError = '';
    render();
    try {
      const r = await listLocalModels(draft.ollama.host);
      localModels = r.models || [];
      localSource = r.source || '';
      localError = r.error || (localModels.length ? '' : 'No models installed yet. Pull one first, for example: ollama pull qwen2.5-coder:7b');
    } catch (e) {
      localModels = [];
      localError = e.message;
    } finally {
      loadingModels = false;
      render();
    }
  }

  const fmtSize = b => (b ? ` · ${(b / 1e9).toFixed(1)} GB` : '');

  function renderOllama() {
    const hostInp = h('input', {
      class: 'inp',
      value: draft.ollama.host,
      placeholder: 'http://localhost:11434',
      onKeydown: e => e.stopPropagation()
    });
    hostInp.addEventListener('input', () => { draft.ollama.host = hostInp.value; });
    hostInp.addEventListener('change', () => { localModels = null; loadModels(); });

    let modelCtl;
    if (loadingModels) {
      modelCtl = h('div', { class: 'ai-busy', style: { margin: 0 } }, h('span', { class: 'spin' }), 'Looking for installed models…');
    } else if (localModels && localModels.length) {
      // Keep a previously chosen model selectable even if it is no longer installed.
      const opts = {};
      for (const m of localModels) opts[m.name] = m.name + (m.params ? ` (${m.params})` : '') + fmtSize(m.size);
      if (draft.ollama.model && !opts[draft.ollama.model]) opts[draft.ollama.model] = draft.ollama.model + ' (not installed)';
      if (!draft.ollama.model) draft.ollama.model = localModels[0].name;
      modelCtl = select(opts, draft.ollama.model, v => { draft.ollama.model = v; });
    } else {
      modelCtl = h('div', { class: 'small muted' }, 'No models found');
    }

    return [
      row('Ollama host', hostInp),
      h('div', { class: 'row' },
        h('label', {}, 'Model'),
        h('div', { class: 'ctl' }, modelCtl,
          h('button', { class: 'mini', title: 'Refresh the model list', onClick: loadModels, html: icon('redo') }))),
      localModels && localModels.length
        ? h('div', { class: 'small muted', style: { marginBottom: '8px' } },
          `${localModels.length} model${localModels.length === 1 ? '' : 's'} installed${localSource === 'cli' ? ' (via ollama list)' : ''}. Embedding-only models are hidden.`)
        : null,
      localError ? h('div', { class: 'note warn' }, localError) : null,
      h('div', { class: 'note' },
        'Runs entirely on this machine — nothing leaves it and no API key is needed. Small models often return rough or invalid geometry; a 7B-or-larger coder model gives the best results, and you can always retry a prompt.')
    ];
  }

  function renderCloud() {
    const isOpen = draft.provider === 'openai';
    const p = isOpen ? draft.openai : draft.anthropic;
    const saved = isOpen ? s.openai : s.anthropic;

    const modelInp = h('input', { class: 'inp', value: p.model || '', list: 'ai-model-list', placeholder: isOpen ? 'gpt-4o' : 'claude-sonnet-5' });
    modelInp.addEventListener('input', () => { p.model = modelInp.value; });
    modelInp.addEventListener('keydown', e => e.stopPropagation());

    const keyInp = h('input', {
      class: 'inp',
      type: 'password',
      autocomplete: 'off',
      placeholder: saved.hasKey ? '•••••••••  (stored — leave blank to keep)' : (isOpen ? 'sk-…  (blank for local models)' : 'sk-ant-…')
    });
    keyInp.addEventListener('input', () => { p.key = keyInp.value; });
    keyInp.addEventListener('keydown', e => e.stopPropagation());

    return [
      isOpen ? row('Base URL', h('input', {
        class: 'inp',
        value: draft.openai.baseUrl || '',
        placeholder: 'https://api.openai.com/v1',
        onInput: e => { draft.openai.baseUrl = e.target.value; },
        onKeydown: e => e.stopPropagation()
      })) : null,
      row('Model', modelInp),
      h('datalist', { id: 'ai-model-list' },
        ...SUGGESTED_MODELS[isOpen ? 'openai' : 'anthropic'].map(m => h('option', { value: m }))),
      row('API key', keyInp),
      saved.hasKey ? h('div', { class: 'row' }, h('label', {}, ''), h('div', { class: 'ctl' },
        h('button', {
          class: 'btn small danger',
          onClick: async () => { await saveAiSettings({ [draft.provider]: { key: '' } }); toast('API key removed.'); dlg.close(); openAISettings(); }
        }, 'Remove stored key'))) : null,
      isOpen ? h('div', { class: 'note' }, 'Works with OpenAI, OpenRouter, Groq, Together, or any other OpenAI-compatible endpoint such as LM Studio (http://localhost:1234/v1). For Ollama, use the Local (Ollama) provider above instead.') : null,
      h('div', { class: 'note' + (s.encrypted ? '' : ' warn') },
        s.encrypted
          ? 'Your key is encrypted with the system keyring and stored outside the project folder. It is sent only to the provider above.'
          : 'No system keyring was found, so the key is stored obfuscated in a private file (readable only by your user account) rather than encrypted.')
    ];
  }

  const render = () => {
    bodyEl.innerHTML = '';
    appendAll(bodyEl,
      row('Provider', select({
        anthropic: 'Anthropic (Claude)',
        openai: 'OpenAI-compatible',
        ollama: 'Local (Ollama)'
      }, draft.provider, v => {
        draft.provider = v;
        if (v === 'ollama' && localModels === null && !loadingModels) { loadModels(); return; }
        render();
      })),
      draft.provider === 'ollama' ? renderOllama() : renderCloud(),
      h('div', { class: 'note warn' },
        'AI output is a starting point, not a verified design. Check every path before you cut, and never run a job unattended.'));
  };

  render();
  if (draft.provider === 'ollama') loadModels();

  const dlg = openModal({
    title: 'AI settings',
    body: bodyEl,
    width: '520px',
    buttons: [
      { label: 'Test connection', onClick: async () => {
        await saveAiSettings(draft);
        settingsCache = await aiSettings(true);
        toast('Testing…');
        try {
          await generateArtwork({ prompt: 'a single 20 mm square outline for a connection test', widthMm: 30, heightMm: 30, id: newRequestId() });
          toast('Connection works.', 'info');
        } catch (e) {
          toast('Test failed: ' + e.message, 'err');
        }
        return false;
      } },
      { label: 'Cancel' },
      { label: 'Save', primary: true, onClick: async () => {
        await saveAiSettings(draft);
        settingsCache = await aiSettings(true);
        toast('AI settings saved.');
        showTab('ai');
      } }
    ]
  });
}

// ================================================================ material advisor
export function openAdvisor() {
  let rows = [];
  let warning = '';
  let busy = false;
  let reqId = null;

  const inp = h('input', { class: 'inp', placeholder: 'e.g. 3 mm birch plywood' });
  inp.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') ask();
  });

  const out = h('div', { style: { marginTop: '10px' } });
  const dev = state.device;

  const renderOut = () => {
    out.innerHTML = '';
    if (busy) { out.appendChild(h('div', { class: 'ai-busy' }, h('span', { class: 'spin' }), 'Thinking…')); return; }
    if (warning) out.appendChild(h('div', { class: 'note warn' }, warning));
    if (!rows.length) return;

    const layer = getLayer(state.activeLayer);
    out.appendChild(h('table', { class: 'tbl' },
      h('tr', {}, ...['Operation', 'Mode', 'Power', 'Speed', 'Passes', ''].map(t => h('th', {}, t))),
      ...rows.map(r => h('tr', {},
        h('td', {}, r.op, r.note ? h('div', { class: 'small muted' }, r.note) : null),
        h('td', {}, h('span', { class: 'badge ' + r.mode }, r.mode)),
        h('td', {}, r.power + '%'),
        h('td', {}, String(r.speed)),
        h('td', {}, String(r.passes)),
        h('td', {}, h('button', {
          class: 'btn small primary',
          title: `Apply to ${layer.name}`,
          onClick: () => {
            Object.assign(layer, { mode: r.mode, power: r.power, speed: r.speed, passes: r.passes, interval: r.interval, name: `${r.material} ${r.op}`.slice(0, 40) });
            bus.emit('layers');
            ed.design.children.forEach(styleItem);
            toast(`Applied “${r.op}” to ${layer.name}. Run a material test before production.`);
          }
        }, 'Apply')))))); 

    out.appendChild(h('div', { class: 'note warn', style: { marginTop: '10px' } },
      'These are AI-generated starting points, not tested values. Run the Material Test Generator and verify on scrap before committing to a real piece.'));
  };

  const ask = async () => {
    if (busy) return;
    const material = inp.value.trim();
    if (!material) { toast('Describe the material first.'); return; }
    busy = true;
    rows = [];
    warning = '';
    reqId = newRequestId();
    renderOut();
    try {
      const r = await suggestSettings({ material, id: reqId });
      rows = r.rows;
      warning = r.warning;
      if (!rows.length && !warning) warning = 'No settings came back — try describing the material differently.';
    } catch (e) {
      warning = e.message;
    } finally {
      busy = false;
      renderOut();
    }
  };

  renderOut();

  openModal({
    title: 'Suggest material settings',
    width: '620px',
    body: h('div', {},
      h('div', { class: 'small muted', style: { marginBottom: '8px' } },
        `For ${dev.name || 'this machine'} — ${String(dev.type || 'diode').toUpperCase()}, ${dev.power || '?'} W. Change the machine profile if that is wrong.`),
      row('Material', inp),
      h('button', { class: 'btn primary', onClick: ask }, 'Suggest settings'),
      out),
    buttons: [
      { label: 'Save all to My presets', onClick: () => {
        if (!rows.length) { toast('Nothing to save yet.'); return false; }
        for (const r of rows) {
          state.userMaterials.push({ material: r.material, thickness: r.thickness, op: r.op, mode: r.mode, power: r.power, speed: r.speed, passes: r.passes, interval: r.interval });
        }
        saveJSON('crafter.userMaterials', state.userMaterials);
        toast(`Saved ${rows.length} preset(s) to the material library.`);
        return false;
      } },
      { label: 'Close', primary: true }
    ]
  });
}
