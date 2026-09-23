// Crafter — Electron main process
const { app, BrowserWindow, Menu, ipcMain, dialog, shell, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

let win = null;
let dirty = false;
let pendingSerialCallback = null;

function send(cmd) {
  if (win) win.webContents.send('menu', cmd);
}

// Accelerators that must keep working inside text fields are display-only
// (registerAccelerator: false); the renderer handles those keys itself.
function item(label, cmd, accelerator, displayOnly = false) {
  const o = { label, click: () => send(cmd) };
  if (accelerator) {
    o.accelerator = accelerator;
    if (displayOnly) o.registerAccelerator = false;
  }
  return o;
}

function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        item('New Project', 'file.new', 'CmdOrCtrl+N'),
        item('Open Project…', 'file.open', 'CmdOrCtrl+O'),
        item('Save Project', 'file.save', 'CmdOrCtrl+S'),
        item('Save Project As…', 'file.saveAs', 'CmdOrCtrl+Shift+S'),
        { type: 'separator' },
        item('Import (SVG, DXF, Image)…', 'file.import', 'CmdOrCtrl+I'),
        { type: 'separator' },
        item('Export G-code…', 'file.exportGcode', 'CmdOrCtrl+E'),
        item('Export SVG…', 'file.exportSvg'),
        { type: 'separator' },
        { role: 'quit', label: 'Exit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        item('Undo', 'edit.undo', 'CmdOrCtrl+Z', true),
        item('Redo', 'edit.redo', 'CmdOrCtrl+Y', true),
        { type: 'separator' },
        item('Cut', 'edit.cut', 'CmdOrCtrl+X', true),
        item('Copy', 'edit.copy', 'CmdOrCtrl+C', true),
        item('Paste', 'edit.paste', 'CmdOrCtrl+V', true),
        item('Duplicate', 'edit.duplicate', 'CmdOrCtrl+D', true),
        item('Delete', 'edit.delete', 'Delete', true),
        { type: 'separator' },
        item('Select All', 'edit.selectAll', 'CmdOrCtrl+A', true),
        item('Deselect', 'edit.deselect', 'Esc', true)
      ]
    },
    {
      label: 'Object',
      submenu: [
        item('Group', 'obj.group', 'CmdOrCtrl+G', true),
        item('Ungroup', 'obj.ungroup', 'CmdOrCtrl+Shift+G', true),
        item('Combine Paths', 'obj.combine', 'CmdOrCtrl+K', true),
        item('Break Apart', 'obj.breakApart', 'CmdOrCtrl+Shift+K', true),
        { type: 'separator' },
        item('Union', 'obj.unite', 'CmdOrCtrl+Plus', true),
        item('Difference', 'obj.subtract', 'CmdOrCtrl+-', true),
        item('Intersection', 'obj.intersect'),
        item('Exclusion', 'obj.exclude'),
        item('Divide', 'obj.divide'),
        item('Offset Path…', 'obj.offset'),
        { type: 'separator' },
        item('Flip Horizontal', 'obj.flipH', 'H', true),
        item('Flip Vertical', 'obj.flipV', 'Shift+H', true),
        item('Rotate 90° CW', 'obj.rot90'),
        item('Rotate 90° CCW', 'obj.rot-90'),
        { type: 'separator' },
        item('Bring to Front', 'obj.front', 'Home', true),
        item('Raise', 'obj.raise', 'PageUp', true),
        item('Lower', 'obj.lower', 'PageDown', true),
        item('Send to Back', 'obj.back', 'End', true),
        { type: 'separator' },
        item('Grid Array…', 'obj.gridArray'),
        item('Circular Array…', 'obj.circArray'),
        item('Center in Work Area', 'obj.centerWork'),
        { type: 'separator' },
        item('Trace Image…', 'obj.trace'),
        item('Convert Text to Path', 'obj.toPath')
      ]
    },
    {
      label: 'AI',
      submenu: [
        item('Generate Design…', 'ai.panel'),
        item('Change Selection with AI…', 'ai.assist'),
        item('Suggest Material Settings…', 'ai.materials'),
        { type: 'separator' },
        item('AI Settings…', 'ai.settings')
      ]
    },
    {
      label: 'View',
      submenu: [
        item('Zoom In', 'view.zoomIn', '=', true),
        item('Zoom Out', 'view.zoomOut', '-', true),
        item('Zoom to Work Area', 'view.fit', '5', true),
        item('Zoom to Selection', 'view.fitSel', '3', true),
        { type: 'separator' },
        item('Toggle Grid Snap', 'view.snap', '%', true),
        item('Toggle Toolpath Preview', 'job.preview', 'Alt+P'),
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' }
      ]
    },
    {
      label: 'Machine',
      submenu: [
        item('Machine Profile & Work Area…', 'machine.profile', 'CmdOrCtrl+Shift+M'),
        item('Connect / Disconnect', 'machine.connect'),
        { type: 'separator' },
        item('Frame Job', 'job.frame'),
        item('Start Job', 'job.start', 'F5'),
        item('Pause / Resume', 'job.pause'),
        item('Stop Job', 'job.stop'),
        { type: 'separator' },
        item('Material Library…', 'tools.materials'),
        item('Material Test Generator…', 'tools.materialTest')
      ]
    },
    {
      label: 'Help',
      submenu: [
        item('Keyboard Shortcuts', 'help.shortcuts', 'F1'),
        item('About Crafter', 'help.about')
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: 1000,
    minHeight: 640,
    backgroundColor: '#1b1e24',
    title: 'Crafter',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const ses = win.webContents.session;

  // --- Web Serial support: route the port chooser to our own UI ---
  ses.on('select-serial-port', (event, portList, webContents, callback) => {
    event.preventDefault();
    pendingSerialCallback = callback;
    win.webContents.send('serial:ports', portList.map(p => ({
      portId: p.portId,
      portName: p.portName,
      displayName: p.displayName || p.portName,
      vendorId: p.vendorId,
      productId: p.productId
    })));
  });
  ses.setPermissionCheckHandler((wc, permission) => permission === 'serial' || permission === 'clipboard-read' || permission === 'clipboard-sanitized-write');
  ses.setDevicePermissionHandler(details => details.deviceType === 'serial');

  win.loadFile(path.join(__dirname, 'src', 'index.html'));

  win.on('close', e => {
    if (!dirty) return;
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      buttons: ['Discard changes and exit', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      title: 'Unsaved changes',
      message: 'Your project has unsaved changes. Exit anyway?'
    });
    if (choice !== 0) e.preventDefault();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ---------- IPC ----------
ipcMain.on('serial:choose', (e, portId) => {
  if (pendingSerialCallback) {
    pendingSerialCallback(portId || '');
    pendingSerialCallback = null;
  }
});

ipcMain.handle('app:version', () => app.getVersion());

ipcMain.on('app:dirty', (e, value) => {
  dirty = !!value;
});

ipcMain.on('app:title', (e, title) => {
  if (win) win.setTitle(title);
});

const TEXT_EXT = new Set(['.svg', '.dxf', '.gcode', '.nc', '.gc', '.crafter', '.json', '.txt']);

ipcMain.handle('dialog:open', async (e, opts = {}) => {
  const r = await dialog.showOpenDialog(win, {
    title: opts.title || 'Open',
    filters: opts.filters || [],
    properties: ['openFile']
  });
  if (r.canceled || !r.filePaths.length) return null;
  const p = r.filePaths[0];
  const ext = path.extname(p).toLowerCase();
  const buf = fs.readFileSync(p);
  return {
    path: p,
    name: path.basename(p),
    ext,
    text: TEXT_EXT.has(ext) ? buf.toString('utf8') : null,
    base64: TEXT_EXT.has(ext) ? null : buf.toString('base64')
  };
});

ipcMain.handle('dialog:save', async (e, opts = {}) => {
  let target = opts.path;
  if (!target) {
    const r = await dialog.showSaveDialog(win, {
      title: opts.title || 'Save',
      defaultPath: opts.defaultName,
      filters: opts.filters || []
    });
    if (r.canceled || !r.filePath) return null;
    target = r.filePath;
  }
  fs.writeFileSync(target, opts.content, 'utf8');
  return { path: target, name: path.basename(target) };
});

// System fonts: read the Windows font registry for friendly names.
function regQuery(key) {
  return new Promise(resolve => {
    execFile('reg', ['query', key], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      if (err) return resolve([]);
      const out = [];
      for (const line of stdout.split(/\r?\n/)) {
        const m = line.match(/^\s+(.+?)\s+REG_(?:SZ|EXPAND_SZ)\s+(.+)$/);
        if (m) out.push({ name: m[1].trim(), file: m[2].trim() });
      }
      resolve(out);
    });
  });
}

function scanFontDir(dir) {
  try {
    return fs.readdirSync(dir)
      .filter(f => /\.(ttf|otf)$/i.test(f))
      .map(f => ({ name: f.replace(/\.(ttf|otf)$/i, ''), path: path.join(dir, f) }));
  } catch {
    return [];
  }
}

ipcMain.handle('fonts:list', async () => {
  const fonts = [];
  const seen = new Set();
  const add = (name, file) => {
    const key = file.toLowerCase();
    if (seen.has(key) || !/\.(ttf|otf)$/i.test(file) || !fs.existsSync(file)) return;
    seen.add(key);
    fonts.push({ name: name.replace(/\s*\((TrueType|OpenType)\)\s*$/i, ''), path: file });
  };
  if (process.platform === 'win32') {
    const winFonts = path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts');
    const local = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Windows', 'Fonts');
    const keys = [
      ['HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts', winFonts],
      ['HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts', local]
    ];
    for (const [key, base] of keys) {
      for (const f of await regQuery(key)) add(f.name, path.isAbsolute(f.file) ? f.file : path.join(base, f.file));
    }
    for (const f of scanFontDir(winFonts).concat(scanFontDir(local))) add(f.name, f.path);
  } else {
    const dirs = process.platform === 'darwin'
      ? ['/System/Library/Fonts', '/Library/Fonts', path.join(app.getPath('home'), 'Library/Fonts')]
      : ['/usr/share/fonts/truetype', '/usr/share/fonts/opentype', '/usr/local/share/fonts', path.join(app.getPath('home'), '.fonts')];
    const walk = d => {
      let entries = [];
      try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
      for (const en of entries) {
        const p = path.join(d, en.name);
        if (en.isDirectory()) walk(p);
        else add(en.name.replace(/\.(ttf|otf)$/i, ''), p);
      }
    };
    dirs.forEach(walk);
  }
  fonts.sort((a, b) => a.name.localeCompare(b.name));
  return fonts;
});

ipcMain.handle('fonts:read', async (e, p) => {
  const buf = fs.readFileSync(p);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
});

// ---------- Asset library ----------
const BUNDLES = new Set(['tabler-outline', 'tabler-filled', 'mdi']);
ipcMain.handle('lib:bundle', async (e, name) => {
  if (!BUNDLES.has(name)) throw new Error('Unknown bundle');
  return fs.promises.readFile(path.join(__dirname, 'src', 'library', name + '.json'), 'utf8');
});

const LIB_EXT = { '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.bmp': 'image/bmp', '.gif': 'image/gif', '.webp': 'image/webp', '.dxf': 'application/dxf' };
function userLibDir() {
  const d = path.join(app.getPath('userData'), 'library');
  fs.mkdirSync(d, { recursive: true });
  return d;
}
function safeLibPath(file) {
  const p = path.join(userLibDir(), path.basename(file));
  if (!LIB_EXT[path.extname(p).toLowerCase()]) throw new Error('Unsupported file type');
  return p;
}
function uniqueName(dir, base) {
  const ext = path.extname(base), stem = path.basename(base, ext);
  let name = base, i = 2;
  while (fs.existsSync(path.join(dir, name))) name = `${stem} (${i++})${ext}`;
  return name;
}

ipcMain.handle('lib:list', async () => {
  const dir = userLibDir();
  return fs.readdirSync(dir)
    .filter(f => LIB_EXT[path.extname(f).toLowerCase()])
    .map(f => {
      const p = path.join(dir, f);
      const ext = path.extname(f).toLowerCase();
      const buf = fs.readFileSync(p);
      const text = ext === '.svg' || ext === '.dxf';
      return {
        file: f,
        name: path.basename(f, path.extname(f)),
        ext,
        mtime: fs.statSync(p).mtimeMs,
        text: text ? buf.toString('utf8') : null,
        dataUrl: text ? null : `data:${LIB_EXT[ext]};base64,${buf.toString('base64')}`
      };
    })
    .sort((a, b) => b.mtime - a.mtime);
});

ipcMain.handle('lib:add', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Add to My Library',
    filters: [{ name: 'Images & vectors', extensions: ['svg', 'png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp', 'dxf'] }],
    properties: ['openFile', 'multiSelections']
  });
  if (r.canceled) return 0;
  const dir = userLibDir();
  for (const src of r.filePaths) {
    if (!LIB_EXT[path.extname(src).toLowerCase()]) continue;
    fs.copyFileSync(src, path.join(dir, uniqueName(dir, path.basename(src))));
  }
  return r.filePaths.length;
});

ipcMain.handle('lib:save', async (e, { name, content }) => {
  const dir = userLibDir();
  const clean = String(name || 'design').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim().slice(0, 80) || 'design';
  const file = uniqueName(dir, clean + '.svg');
  fs.writeFileSync(path.join(dir, file), content, 'utf8');
  return file;
});

ipcMain.handle('lib:delete', async (e, file) => {
  fs.unlinkSync(safeLibPath(file));
  return true;
});

ipcMain.handle('lib:openFolder', async () => shell.openPath(userLibDir()));

ipcMain.handle('app:confirm', async (e, opts) => {
  const r = await dialog.showMessageBox(win, {
    type: opts.type || 'question',
    buttons: opts.buttons || ['OK', 'Cancel'],
    defaultId: 0,
    cancelId: (opts.buttons || ['OK', 'Cancel']).length - 1,
    title: opts.title || 'Crafter',
    message: opts.message || '',
    detail: opts.detail || ''
  });
  return r.response;
});

// ---------- AI providers ----------
// All model traffic goes through the main process: the renderer runs under a strict
// CSP (default-src 'self'), and the API key must never reach renderer storage.
const AI_DEFAULTS = {
  provider: 'anthropic',
  anthropic: { model: 'claude-sonnet-5', key: '' },
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o', key: '' },
  ollama: { host: 'http://localhost:11434', model: '' },
  maxTokens: 8000
};

const aiFile = () => path.join(app.getPath('userData'), 'ai.json');

// Keys are encrypted with the OS keyring when one is available (libsecret/Keychain/DPAPI),
// otherwise merely obscured in a 0600 file — hence the prefix tag.
function encodeKey(plain) {
  if (!plain) return '';
  try {
    if (safeStorage.isEncryptionAvailable()) return 'enc:' + safeStorage.encryptString(plain).toString('base64');
  } catch { /* keyring unavailable */ }
  return 'raw:' + Buffer.from(plain, 'utf8').toString('base64');
}

function decodeKey(stored) {
  if (!stored) return '';
  try {
    if (stored.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'));
    if (stored.startsWith('raw:')) return Buffer.from(stored.slice(4), 'base64').toString('utf8');
  } catch { /* unreadable — treat as unset */ }
  return '';
}

function readAI() {
  let raw = {};
  try { raw = JSON.parse(fs.readFileSync(aiFile(), 'utf8')); } catch { /* first run */ }
  return {
    ...AI_DEFAULTS,
    ...raw,
    anthropic: { ...AI_DEFAULTS.anthropic, ...raw.anthropic },
    openai: { ...AI_DEFAULTS.openai, ...raw.openai },
    ollama: { ...AI_DEFAULTS.ollama, ...raw.ollama }
  };
}

// The renderer only ever sees whether a key exists, never its value.
function redact(cfg) {
  return {
    provider: cfg.provider,
    maxTokens: cfg.maxTokens,
    anthropic: { model: cfg.anthropic.model, hasKey: !!cfg.anthropic.key },
    openai: { baseUrl: cfg.openai.baseUrl, model: cfg.openai.model, hasKey: !!cfg.openai.key },
    ollama: { host: cfg.ollama.host, model: cfg.ollama.model },
    encrypted: (() => { try { return safeStorage.isEncryptionAvailable(); } catch { return false; } })()
  };
}

ipcMain.handle('ai:get', async () => redact(readAI()));

ipcMain.handle('ai:set', async (e, patch = {}) => {
  const cfg = readAI();
  if (patch.provider) cfg.provider = ['openai', 'ollama', 'anthropic'].includes(patch.provider) ? patch.provider : 'anthropic';
  if (patch.maxTokens) cfg.maxTokens = Math.min(Math.max(+patch.maxTokens || 0, 256), 32000);
  for (const name of ['anthropic', 'openai']) {
    const src = patch[name];
    if (!src) continue;
    if (typeof src.model === 'string' && src.model.trim()) cfg[name].model = src.model.trim();
    if (typeof src.baseUrl === 'string' && name === 'openai') cfg[name].baseUrl = src.baseUrl.trim();
    // undefined = leave as-is; '' = explicitly clear.
    if (typeof src.key === 'string') cfg[name].key = src.key ? encodeKey(src.key) : '';
  }
  if (patch.ollama) {
    if (typeof patch.ollama.host === 'string') cfg.ollama.host = patch.ollama.host.trim() || AI_DEFAULTS.ollama.host;
    if (typeof patch.ollama.model === 'string') cfg.ollama.model = patch.ollama.model.trim();
  }
  fs.writeFileSync(aiFile(), JSON.stringify(cfg, null, 2), { encoding: 'utf8', mode: 0o600 });
  return redact(cfg);
});

// Ollama model discovery. The HTTP API is preferred — it works whether Ollama runs
// as a systemd service or a bare `ollama serve`, and it reports per-model capabilities
// so embedding-only models can be hidden. `ollama list` is the fallback.
function ollamaListCli() {
  return new Promise(resolve => {
    execFile('ollama', ['list'], { timeout: 8000 }, (err, stdout) => {
      if (err) {
        resolve({ models: [], source: 'none', error: 'Could not reach Ollama. Start it with “ollama serve”, then refresh.' });
        return;
      }
      // `ollama list` reports no capabilities, so embedding models can only be
      // spotted by name here.
      const embedding = /(^|[/\-_])(all-minilm|nomic-embed|mxbai-embed|bge-|gte-|snowflake-arctic-embed|paraphrase-)|embed/i;
      const models = String(stdout).split(/\r?\n/).slice(1)
        .map(l => l.trim()).filter(Boolean)
        .map(l => ({ name: l.split(/\s+/)[0] }))
        .filter(m => m.name && !embedding.test(m.name));
      resolve({ models, source: 'cli' });
    });
  });
}

// Embedding models cannot answer a chat request — never offer them.
function usableForChat(m) {
  const caps = m.capabilities;
  if (!Array.isArray(caps) || !caps.length) return true;
  return caps.includes('completion') || !caps.includes('embedding');
}

ipcMain.handle('ai:models', async (e, { host } = {}) => {
  const base = String(host || AI_DEFAULTS.ollama.host).replace(/\/+$/, '');
  try {
    const r = await fetch(base + '/api/tags', { signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const body = await readBody(r);
      const models = (body.models || [])
        .filter(usableForChat)
        .map(m => ({ name: m.name, size: m.size, params: m.details && m.details.parameter_size }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return { models, source: 'api' };
    }
  } catch { /* server not up or not reachable — try the CLI */ }
  return ollamaListCli();
});

const aiAborts = new Map();
ipcMain.handle('ai:cancel', (e, id) => {
  const c = aiAborts.get(id);
  if (c) c.abort();
  return true;
});

async function readBody(r) {
  const text = await r.text();
  try { return JSON.parse(text); } catch { return { _raw: text }; }
}

function apiError(body, status) {
  const m = body && (body.error?.message || body.message || body._raw);
  const detail = typeof m === 'string' && m.trim() ? m.trim().slice(0, 400) : `HTTP ${status}`;
  if (status === 401 || status === 403) return `Authentication failed (${status}). Check the API key in AI settings. ${detail}`;
  if (status === 429) return `Rate limited or out of quota (429). ${detail}`;
  return detail;
}

async function callProvider(cfg, { system, user, maxTokens }, signal) {
  const limit = Math.min(Math.max(+maxTokens || cfg.maxTokens, 256), 32000);

  if (cfg.provider === 'openai' || cfg.provider === 'ollama') {
    const ollama = cfg.provider === 'ollama';
    // Ollama serves an OpenAI-compatible API under /v1 on its host.
    const p = ollama
      ? { baseUrl: String(cfg.ollama.host || AI_DEFAULTS.ollama.host).replace(/\/+$/, '') + '/v1', model: cfg.ollama.model, key: '' }
      : cfg.openai;
    const base = String(p.baseUrl || '').replace(/\/+$/, '');
    if (!base) throw new Error('No base URL set. Open AI settings.');
    if (ollama && !p.model) throw new Error('No local model selected. Open AI settings and pick one.');
    const key = decodeKey(p.key);
    // Local runtimes (Ollama, LM Studio) usually need no key.
    const local = ollama || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(base);
    if (!key && !local) throw new Error('No API key set. Open AI settings and add one.');
    const post = tokenField => fetch(base + '/chat/completions', {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json', ...(key ? { authorization: 'Bearer ' + key } : {}) },
      body: JSON.stringify({
        model: p.model,
        [tokenField]: limit,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
      })
    });
    let r = await post('max_tokens');
    let body = await readBody(r);
    // Newer OpenAI reasoning models reject max_tokens and want max_completion_tokens.
    if (!r.ok && /max_completion_tokens|max_tokens/i.test(apiError(body, r.status))) {
      r = await post('max_completion_tokens');
      body = await readBody(r);
    }
    if (!r.ok) throw new Error(apiError(body, r.status));
    const text = body.choices && body.choices[0] && body.choices[0].message && body.choices[0].message.content;
    if (!text) throw new Error('The model returned an empty response.');
    return { text, model: body.model || p.model };
  }

  const p = cfg.anthropic;
  const key = decodeKey(p.key);
  if (!key) throw new Error('No API key set. Open AI settings and add one.');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: p.model, max_tokens: limit, system, messages: [{ role: 'user', content: user }] })
  });
  const body = await readBody(r);
  if (!r.ok) throw new Error(apiError(body, r.status));
  const text = (body.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  if (!text) throw new Error('The model returned an empty response.');
  return { text, model: body.model || p.model };
}

ipcMain.handle('ai:request', async (e, { id, system, user, maxTokens } = {}) => {
  const cfg = readAI();
  const ac = new AbortController();
  if (id) aiAborts.set(id, ac);
  const timer = setTimeout(() => ac.abort(), 180000);
  try {
    return await callProvider(cfg, { system, user, maxTokens }, ac.signal);
  } catch (err) {
    if (err && (err.name === 'AbortError' || /aborted/i.test(err.message || ''))) throw new Error('Cancelled');
    if (err && /fetch failed|ENOTFOUND|ECONNREFUSED|EAI_AGAIN/i.test(err.message || '')) {
      throw new Error(cfg.provider === 'ollama'
        ? 'Could not reach Ollama. Start it with “ollama serve” and check the host in AI settings.'
        : 'Could not reach the AI provider. Check your internet connection or base URL.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
    if (id) aiAborts.delete(id);
  }
});

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
