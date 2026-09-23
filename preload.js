const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  openFile: opts => ipcRenderer.invoke('dialog:open', opts),
  saveFile: opts => ipcRenderer.invoke('dialog:save', opts),
  listFonts: () => ipcRenderer.invoke('fonts:list'),
  readFont: p => ipcRenderer.invoke('fonts:read', p),
  confirm: opts => ipcRenderer.invoke('app:confirm', opts),
  appVersion: () => ipcRenderer.invoke('app:version'),
  libBundle: name => ipcRenderer.invoke('lib:bundle', name),
  libList: () => ipcRenderer.invoke('lib:list'),
  libAdd: () => ipcRenderer.invoke('lib:add'),
  libSave: (name, content) => ipcRenderer.invoke('lib:save', { name, content }),
  libDelete: file => ipcRenderer.invoke('lib:delete', file),
  libOpenFolder: () => ipcRenderer.invoke('lib:openFolder'),
  aiGet: () => ipcRenderer.invoke('ai:get'),
  aiSet: patch => ipcRenderer.invoke('ai:set', patch),
  aiRequest: req => ipcRenderer.invoke('ai:request', req),
  aiModels: opts => ipcRenderer.invoke('ai:models', opts),
  aiCancel: id => ipcRenderer.invoke('ai:cancel', id),
  setDirty: v => ipcRenderer.send('app:dirty', v),
  setTitle: t => ipcRenderer.send('app:title', t),
  onMenu: cb => ipcRenderer.on('menu', (e, cmd) => cb(cmd)),
  onSerialPorts: cb => ipcRenderer.on('serial:ports', (e, list) => cb(list)),
  chooseSerialPort: id => ipcRenderer.send('serial:choose', id)
});
