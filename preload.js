const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  openFile: opts => ipcRenderer.invoke('dialog:open', opts),
  saveFile: opts => ipcRenderer.invoke('dialog:save', opts),
  listFonts: () => ipcRenderer.invoke('fonts:list'),
  readFont: p => ipcRenderer.invoke('fonts:read', p),
  confirm: opts => ipcRenderer.invoke('app:confirm', opts),
  libBundle: name => ipcRenderer.invoke('lib:bundle', name),
  libList: () => ipcRenderer.invoke('lib:list'),
  libAdd: () => ipcRenderer.invoke('lib:add'),
  libSave: (name, content) => ipcRenderer.invoke('lib:save', { name, content }),
  libDelete: file => ipcRenderer.invoke('lib:delete', file),
  libOpenFolder: () => ipcRenderer.invoke('lib:openFolder'),
  setDirty: v => ipcRenderer.send('app:dirty', v),
  setTitle: t => ipcRenderer.send('app:title', t),
  onMenu: cb => ipcRenderer.on('menu', (e, cmd) => cb(cmd)),
  onSerialPorts: cb => ipcRenderer.on('serial:ports', (e, list) => cb(list)),
  chooseSerialPort: id => ipcRenderer.send('serial:choose', id)
});
