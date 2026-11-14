const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, dialog, shell, Notification,
  nativeImage, protocol, net, session, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const recorder = require('./lib/recorder');

protocol.registerSchemesAsPrivileged([{ scheme: 'clipmodel', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);

if (!app.requestSingleInstanceLock()) { app.quit(); }
// Akceleracja GPU zostaje włączona: odtwarzacz klipów potrzebuje sprzętowego dekodowania (np. H.265).

const MODEL_ZIP_URL = 'https://alphacephei.com/vosk/models/vosk-model-small-pl-0.22.zip';
const DEFAULTS = {
  seconds: 30, afterSeconds: 0, fps: 60, height: 0, quality: 'high', encoder: 'auto', monitor: 0, captureMode: 'auto', codec: 'h264',
  audioDevice: '', hotkey: 'Alt+F10', voiceEnabled: false, voicePhrase: 'klip', micId: '',
  outputDir: path.join(app.getPath('videos'), 'Roman Clip'), sound: true, autostart: false, notify: true,
};

let settings = { ...DEFAULTS };
let tray, settingsWin, voiceWin;
let hotkeyOk = true;
let model = { ready: false, progress: null, error: null };
let lastVoiceAt = 0;
let paused = false;
let upd = { state: app.isPackaged ? 'idle' : 'dev', version: null, percent: 0, error: null };

const storeFile = () => path.join(app.getPath('userData'), 'settings.json');
const modelDir = () => path.join(app.getPath('userData'), 'model');
const modelFile = () => path.join(modelDir(), 'model.tar.gz');

function loadSettings() {
  try { settings = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(storeFile(), 'utf8')) }; } catch {}
}
function saveSettings() {
  fs.mkdirSync(path.dirname(storeFile()), { recursive: true });
  fs.writeFileSync(storeFile(), JSON.stringify(settings, null, 2));
}

function status() {
  return { ...recorder.getState(), hotkeyOk, model, paused, version: app.getVersion(), update: upd };
}
function pushStatus() {
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('status', status());
  rebuildTray();
}

function display() {
  const all = screen.getAllDisplays();
  return all[settings.monitor] || screen.getPrimaryDisplay();
}

function startRecording() {
  if (paused) return Promise.resolve();
  return recorder.start(settings, display(), path.join(app.getPath('userData'), 'buffer'), pushStatus);
}

function registerHotkey() {
  globalShortcut.unregisterAll();
  try { hotkeyOk = !!settings.hotkey && globalShortcut.register(settings.hotkey, () => clip('skrót')); } catch { hotkeyOk = false; }
}

let clipping = false;
async function clip(source) {
  if (clipping || paused) return;
  clipping = true;
  try {
    if (settings.afterSeconds > 0) await new Promise((r) => setTimeout(r, settings.afterSeconds * 1000));
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    const name = `Klip ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}.mp4`;
    const file = await recorder.saveClip(settings.seconds + settings.afterSeconds, path.join(settings.outputDir, name));
    if (settings.sound) shell.beep();
    if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('clip:saved', file);
    if (settings.notify) {
      const n = new Notification({ title: 'Zapisano klip', body: `${path.basename(file)} (${source})`, silent: true });
      n.on('click', () => shell.showItemInFolder(file));
      n.show();
    }
  } catch (e) {
    new Notification({ title: 'Nie udało się zapisać klipu', body: String(e.message).slice(0, 200) }).show();
  } finally { clipping = false; }
}

// ---------- model głosowy (Vosk, polski, pobierany raz) ----------
function checkModel() { model.ready = fs.existsSync(modelFile()); }

function run(cmd, args) {
  return new Promise((res, rej) => execFile(cmd, args, { windowsHide: true }, (e, _o, se) => (e ? rej(new Error(se || e.message)) : res())));
}

async function downloadModel() {
  if (model.progress !== null) return;
  model = { ready: false, progress: 0, error: null };
  pushStatus();
  const dir = modelDir(), zip = path.join(dir, 'model.zip'), tmp = path.join(dir, 'x');
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(tmp, { recursive: true });
    const res = await net.fetch(MODEL_ZIP_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const total = Number(res.headers.get('content-length')) || 0;
    const out = fs.createWriteStream(zip);
    let got = 0;
    for await (const chunk of res.body) {
      out.write(chunk);
      got += chunk.length;
      model.progress = total ? Math.round((got / total) * 90) : 0;
      pushStatus();
    }
    await new Promise((r) => out.end(r));
    // vosk-browser wymaga tar.gz; bsdtar z Windows 10+ rozpakowuje zip i pakuje tar.gz
    await run('tar', ['-xf', zip, '-C', tmp]);
    const folder = fs.readdirSync(tmp)[0];
    await run('tar', ['-czf', modelFile(), '-C', tmp, folder]);
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(zip, { force: true });
    model = { ready: true, progress: null, error: null };
  } catch (e) {
    model = { ready: false, progress: null, error: String(e.message).slice(0, 200) };
  }
  pushStatus();
  syncVoice();
}

function syncVoice() {
  const want = settings.voiceEnabled && model.ready && !paused;
  if (!want) { if (voiceWin && !voiceWin.isDestroyed()) voiceWin.destroy(); voiceWin = null; return; }
  if (voiceWin && !voiceWin.isDestroyed()) voiceWin.destroy();
  voiceWin = new BrowserWindow({ show: false, webPreferences: { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false } });
  voiceWin.loadFile(path.join(__dirname, 'renderer', 'voice.html'));
}

// ---------- okna / tray ----------
function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) { if (settingsWin.isMinimized()) settingsWin.restore(); settingsWin.show(); settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 720, height: 900, minWidth: 560, minHeight: 640, show: false, frame: false, title: 'Roman Clip', backgroundColor: '#05050a',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  settingsWin.removeMenu();
  settingsWin.once('ready-to-show', () => settingsWin.show());
  settingsWin.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
}

function rebuildTray() {
  if (!tray) return;
  tray.setToolTip((paused ? 'Roman Clip (wstrzymany)' : 'Roman Clip') + ' v' + app.getVersion());
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Roman Clip v' + app.getVersion(), enabled: false },
    { type: 'separator' },
    { label: 'Zapisz klip teraz', click: () => clip('menu'), enabled: !paused },
    { label: 'Ustawienia', click: openSettings },
    { label: 'Otwórz folder z klipami', click: () => { fs.mkdirSync(settings.outputDir, { recursive: true }); shell.openPath(settings.outputDir); } },
    { type: 'separator' },
    { label: paused ? 'Wznów nagrywanie' : 'Wstrzymaj nagrywanie', click: togglePause },
    upd.state === 'ready'
      ? { label: `Zainstaluj aktualizację ${upd.version} i zrestartuj`, click: installUpdate }
      : { label: 'Sprawdź aktualizacje', click: checkUpdates },
    { label: 'Wyjdź', click: () => app.quit() },
  ]));
}

async function togglePause() {
  paused = !paused;
  if (paused) await recorder.stop(); else await startRecording();
  syncVoice();
  pushStatus();
}

let updaterWired = false;
function setUpd(p) { upd = { ...upd, ...p }; pushStatus(); }

function wireUpdater() {
  if (updaterWired) return require('electron-updater').autoUpdater;
  updaterWired = true;
  const { autoUpdater } = require('electron-updater');
  autoUpdater.on('checking-for-update', () => setUpd({ state: 'checking', error: null }));
  autoUpdater.on('update-available', (i) => setUpd({ state: 'downloading', version: i.version, percent: 0 }));
  autoUpdater.on('update-not-available', () => setUpd({ state: 'latest', version: null }));
  autoUpdater.on('download-progress', (p) => setUpd({ state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (i) => {
    setUpd({ state: 'ready', version: i.version });
    new Notification({ title: 'Roman Clip: aktualizacja gotowa', body: `Wersja ${i.version} zainstaluje się po zamknięciu programu.` }).show();
  });
  autoUpdater.on('error', (e) => setUpd({ state: 'error', error: String((e && e.message) || e).split(/\r?\n/)[0].slice(0, 160) }));
  return autoUpdater;
}

function checkUpdates() {
  if (!app.isPackaged) return;
  try { wireUpdater().checkForUpdates().catch(() => {}); } catch (e) { setUpd({ state: 'error', error: String(e.message).slice(0, 160) }); }
}

function installUpdate() {
  try { require('electron-updater').autoUpdater.quitAndInstall(); } catch {}
}

// ---------- IPC ----------
ipcMain.handle('get', () => ({ settings, status: status(), defaults: DEFAULTS }));
ipcMain.handle('set', async (_e, patch) => {
  const prev = settings;
  settings = { ...settings, ...patch };
  saveSettings();
  if (patch.hotkey !== undefined) registerHotkey();
  if (patch.autostart !== undefined) app.setLoginItemSettings({ openAtLogin: !!settings.autostart });
  const recKeys = ['seconds', 'afterSeconds', 'fps', 'height', 'quality', 'encoder', 'monitor', 'captureMode', 'codec', 'audioDevice'];
  if (recKeys.some((k) => k in patch && patch[k] !== prev[k])) await startRecording();
  if (['voiceEnabled', 'voicePhrase', 'micId'].some((k) => k in patch && patch[k] !== prev[k])) syncVoice();
  pushStatus();
  return { settings, status: status() };
});
ipcMain.handle('clip', () => clip('przycisk'));
ipcMain.handle('togglePause', () => togglePause());
ipcMain.on('win:min', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize());
ipcMain.on('win:close', (e) => BrowserWindow.fromWebContents(e.sender)?.close());

// ---------- biblioteka klipów ----------
const inClipsDir = (p) => {
  const rel = path.relative(path.resolve(settings.outputDir), path.resolve(String(p)));
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel) && /\.mp4$/i.test(p);
};
ipcMain.handle('clips:list', () => {
  try {
    return fs.readdirSync(settings.outputDir).filter((n) => /\.mp4$/i.test(n)).map((name) => {
      const p = path.join(settings.outputDir, name), st = fs.statSync(p);
      return { name, path: p, url: pathToFileURL(p).href, size: st.size, mtime: st.mtimeMs };
    }).sort((a, b) => b.mtime - a.mtime).slice(0, 300);
  } catch { return []; }
});
// miniatura + czas trwania (ffmpeg, po jednym klipie naraz, wynik w cache na dysku)
let metaQueue = Promise.resolve();
function getMeta(p) {
  return new Promise((resolve) => {
    const st = fs.statSync(p);
    const dir = path.join(app.getPath('userData'), 'thumbs');
    fs.mkdirSync(dir, { recursive: true });
    const id = crypto.createHash('sha1').update(p + st.mtimeMs + st.size).digest('hex').slice(0, 20);
    const jpg = path.join(dir, id + '.jpg'), js = path.join(dir, id + '.json');
    const done = (duration) => {
      let thumb = null;
      try { thumb = 'data:image/jpeg;base64,' + fs.readFileSync(jpg).toString('base64'); } catch {}
      resolve({ thumb, duration });
    };
    try { if (fs.existsSync(jpg) && fs.existsSync(js)) return done(JSON.parse(fs.readFileSync(js, 'utf8')).duration); } catch {}
    execFile(recorder.ffmpegPath, ['-hide_banner', '-ss', '1', '-i', p, '-frames:v', '1', '-vf', 'scale=380:-2', '-q:v', '5', '-y', jpg],
      { windowsHide: true, timeout: 20000 }, (_e, _o, stderr) => {
        const m = /Duration: (\d+):(\d+):(\d+\.?\d*)/.exec(String(stderr));
        const duration = m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
        try { fs.writeFileSync(js, JSON.stringify({ duration })); } catch {}
        done(duration);
      });
  });
}
ipcMain.handle('clips:meta', (_e, p) => {
  if (!inClipsDir(p)) return null;
  const job = metaQueue.then(() => getMeta(p)).catch(() => null);
  metaQueue = job;
  return job;
});
ipcMain.handle('clips:delete', async (_e, p) => { if (inClipsDir(p)) await shell.trashItem(path.resolve(p)); });
ipcMain.handle('clips:reveal', (_e, p) => { if (inClipsDir(p)) shell.showItemInFolder(path.resolve(p)); });
ipcMain.handle('clips:open', (_e, p) => { if (inClipsDir(p)) return shell.openPath(path.resolve(p)); });

ipcMain.handle('checkUpdates', () => checkUpdates());
ipcMain.handle('installUpdate', () => installUpdate());
ipcMain.handle('pickDir', async () => {
  const r = await dialog.showOpenDialog(settingsWin, { properties: ['openDirectory', 'createDirectory'], defaultPath: settings.outputDir });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('openDir', () => { fs.mkdirSync(settings.outputDir, { recursive: true }); return shell.openPath(settings.outputDir); });
ipcMain.handle('audioDevices', () => recorder.listAudioDevices());
ipcMain.handle('displays', () => screen.getAllDisplays().map((d, i) => {
  const w = Math.round(d.size.width * d.scaleFactor), h = Math.round(d.size.height * d.scaleFactor);
  return { label: `Ekran ${i + 1} (${w}x${h})`, w, h };
}));
ipcMain.handle('downloadModel', downloadModel);
ipcMain.on('voice:heard', (_e, text) => {
  const phrase = settings.voicePhrase.trim().toLowerCase();
  if (!phrase || !text.toLowerCase().includes(phrase)) return;
  if (Date.now() - lastVoiceAt < 5000) return;
  lastVoiceAt = Date.now();
  clip('głos');
});

// ---------- start ----------
app.whenReady().then(async () => {
  loadSettings();
  checkModel();
  protocol.handle('clipmodel', async () => {
    const r = await net.fetch(pathToFileURL(modelFile()).toString());
    return new Response(r.body, { headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/gzip' } });
  });
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'media'));
  session.defaultSession.setPermissionCheckHandler((_wc, perm) => perm === 'media');

  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.ico')));
  tray.on('click', openSettings);
  rebuildTray();
  registerHotkey();
  await startRecording();
  syncVoice();
  if (!fs.existsSync(storeFile())) { saveSettings(); openSettings(); }
  setTimeout(checkUpdates, 8000);
  setInterval(checkUpdates, 6 * 60 * 60 * 1000);
});

app.on('second-instance', openSettings);
app.on('window-all-closed', () => {}); // zostajemy w zasobniku
app.on('will-quit', () => { globalShortcut.unregisterAll(); });
app.on('before-quit', async (e) => {
  if (recorder.getState().running) { e.preventDefault(); await recorder.stop(); app.quit(); }
});
