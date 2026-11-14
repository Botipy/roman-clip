const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  get: () => ipcRenderer.invoke('get'),
  set: (patch) => ipcRenderer.invoke('set', patch),
  clip: () => ipcRenderer.invoke('clip'),
  checkUpdates: () => ipcRenderer.invoke('checkUpdates'),
  installUpdate: () => ipcRenderer.invoke('installUpdate'),
  pickDir: () => ipcRenderer.invoke('pickDir'),
  openDir: () => ipcRenderer.invoke('openDir'),
  audioDevices: () => ipcRenderer.invoke('audioDevices'),
  displays: () => ipcRenderer.invoke('displays'),
  downloadModel: () => ipcRenderer.invoke('downloadModel'),
  onStatus: (cb) => ipcRenderer.on('status', (_e, s) => cb(s)),
  voiceHeard: (text) => ipcRenderer.send('voice:heard', text),
});
