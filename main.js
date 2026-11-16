const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, dialog, shell, Notification,
  nativeImage, protocol, net, session, screen, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const recorder = require('./lib/recorder');
const STRINGS = require('./renderer/strings.js');
const sysAudio = require('./lib/sysaudio');

protocol.registerSchemesAsPrivileged([{ scheme: 'clipmodel', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);

if (!app.requestSingleInstanceLock()) { app.quit(); }
// Akceleracja GPU zostaje włączona: odtwarzacz klipów potrzebuje sprzętowego dekodowania (np. H.265).

// Offline voice models (Vosk), one per UI language, downloaded on demand
const MODEL_URLS = {
  en: 'https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip',
  pl: 'https://alphacephei.com/vosk/models/vosk-model-small-pl-0.22.zip',
};
const PHRASES = { en: 'clip', pl: 'klip' };
const DEFAULTS = {
  seconds: 30, afterSeconds: 0, fps: 60, height: 0, quality: 'high', encoder: 'auto', monitor: 0, captureMode: 'auto', codec: 'h264',
  audioDevice: '', systemAudio: true, hotkey: 'Alt+F10', voiceEnabled: false, voicePhrase: 'clip', micId: '', language: 'en',
  outputDir: path.join(app.getPath('videos'), 'Roman Clip'), sound: true, autostart: false, notify: true,
};

// Windows starts us with this flag at login (see applyAutostart); in that case we stay in the tray instead of popping up a window
const AUTOSTARTED = process.argv.includes('--autostart');
let settings = { ...DEFAULTS };

function applyAutostart() {
  try { app.setLoginItemSettings({ openAtLogin: !!settings.autostart, args: ['--autostart'] }); } catch {}
}
let tray, settingsWin, voiceWin, audioWin;
let hotkeyOk = true;
const models = { en: { ready: false, progress: null, error: null, mb: 40 }, pl: { ready: false, progress: null, error: null, mb: 50 } };
const lang = () => (STRINGS[settings.language] ? settings.language : 'en');
const M = () => models[lang()];
// t(key, params): string in the current UI language (English fallback)
const t = (key, params) => {
  const s = STRINGS[lang()][key] ?? STRINGS.en[key] ?? key;
  return params ? s.replace(/\{(\w+)\}/g, (_m, k) => (params[k] !== undefined ? params[k] : '{' + k + '}')) : s;
};
let lastVoiceAt = 0;
let paused = false;
let upd = { state: app.isPackaged ? 'idle' : 'dev', version: null, percent: 0, error: null };

const storeFile = () => path.join(app.getPath('userData'), 'settings.json');
const modelDir = (l = lang()) => path.join(app.getPath('userData'), 'model-' + l);
const modelFile = (l = lang()) => path.join(modelDir(l), 'model.tar.gz');

function loadSettings() {
  try {
    const stored = JSON.parse(fs.readFileSync(storeFile(), 'utf8'));
    settings = { ...DEFAULTS, ...stored };
    if (!stored.language && stored.voicePhrase === 'klip') settings.voicePhrase = PHRASES.en;   // migrate pre-i18n settings
  } catch {}
  // pre-i18n installs kept the Polish model in "model/": move it to "model-pl/"
  try {
    const legacy = path.join(app.getPath('userData'), 'model');
    if (fs.existsSync(path.join(legacy, 'model.tar.gz')) && !fs.existsSync(modelDir('pl'))) fs.renameSync(legacy, modelDir('pl'));
  } catch {}
}
function saveSettings() {
  fs.mkdirSync(path.dirname(storeFile()), { recursive: true });
  fs.writeFileSync(storeFile(), JSON.stringify(settings, null, 2));
}

function status() {
  return { ...recorder.getState(), hotkeyOk, model: M(), paused, version: app.getVersion(), update: upd };
}
let trayTimer = null;
function pushStatus() {
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('status', status());
  clearTimeout(trayTimer);                      // menu zasobnika przebudowujemy rzadko (nie przy każdym postępie pobierania)
  trayTimer = setTimeout(rebuildTray, 250);
}

function display() {
  const all = screen.getAllDisplays();
  return all[settings.monitor] || screen.getPrimaryDisplay();
}

async function startRecording() {
  if (paused) return;
  let port = 0;
  if (settings.systemAudio) {
    try { port = await sysAudio.start(); } catch (e) { console.error('system audio bridge:', e); }
  } else sysAudio.stop();
  syncAudioWin();
  return recorder.start({ ...settings, sysAudioPort: port }, display(), path.join(app.getPath('userData'), 'buffer'), pushStatus);
}

// Hidden window that captures the Windows loopback (system sound) and feeds it to sysAudio
function syncAudioWin() {
  const want = settings.systemAudio && !paused;
  if (!want) { if (audioWin && !audioWin.isDestroyed()) audioWin.destroy(); audioWin = null; return; }
  if (audioWin && !audioWin.isDestroyed()) return;
  audioWin = new BrowserWindow({ show: false, webPreferences: { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false } });
  audioWin.loadFile(path.join(__dirname, 'renderer', 'sysaudio.html'));
}

function registerHotkey() {
  globalShortcut.unregisterAll();
  try { hotkeyOk = !!settings.hotkey && globalShortcut.register(settings.hotkey, () => clip('srcHotkey')); } catch { hotkeyOk = false; }
}

let clipping = false;
async function clip(source) {
  if (paused) {
    new Notification({ title: t('nPausedTitle'), body: t('nPausedBody') }).show();
    return;
  }
  if (clipping) return;
  clipping = true;
  try {
    if (settings.afterSeconds > 0) await new Promise((r) => setTimeout(r, settings.afterSeconds * 1000));
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    const name = `${t('clipPrefix')} ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}.mp4`;
    const file = await recorder.saveClip(settings.seconds + settings.afterSeconds, path.join(settings.outputDir, name));
    if (settings.sound) shell.beep();
    if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('clip:saved', file);
    if (settings.notify) {
      const n = new Notification({ title: t('nSavedTitle'), body: `${path.basename(file)} (${t(source)})`, silent: true });
      n.on('click', () => shell.showItemInFolder(file));
      n.show();
    }
  } catch (e) {
    new Notification({ title: t('nFailTitle'), body: (e.message === 'EMPTY_BUFFER' ? t('errEmptyBuffer') : String(e.message)).slice(0, 200) }).show();
  } finally { clipping = false; }
}

// ---------- voice model (Vosk, per language, downloaded once) ----------
function checkModels() { for (const l of Object.keys(models)) models[l].ready = fs.existsSync(modelFile(l)); }

function run(cmd, args) {
  return new Promise((res, rej) => execFile(cmd, args, { windowsHide: true }, (e, _o, se) => (e ? rej(new Error(se || e.message)) : res())));
}

async function downloadModel() {
  const l = lang(), mdl = models[l];
  if (mdl.progress !== null) return;
  Object.assign(mdl, { ready: false, progress: 0, error: null });
  pushStatus();
  const dir = modelDir(l), zip = path.join(dir, 'model.zip'), tmp = path.join(dir, 'x');
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(tmp, { recursive: true });
    const res = await net.fetch(MODEL_URLS[l]);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const total = Number(res.headers.get('content-length')) || 0;
    const out = fs.createWriteStream(zip);
    let got = 0;
    for await (const chunk of res.body) {
      out.write(chunk);
      got += chunk.length;
      const pct = total ? Math.round((got / total) * 90) : 0;
      if (pct !== mdl.progress) { mdl.progress = pct; pushStatus(); }
    }
    await new Promise((r) => out.end(r));
    // vosk-browser needs a tar.gz; the bsdtar shipped with Windows 10+ unpacks the zip and packs the tar.gz
    await run('tar', ['-xf', zip, '-C', tmp]);
    const folder = fs.readdirSync(tmp)[0];
    await run('tar', ['-czf', modelFile(l), '-C', tmp, folder]);
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(zip, { force: true });
    Object.assign(mdl, { ready: true, progress: null, error: null });
  } catch (e) {
    Object.assign(mdl, { ready: false, progress: null, error: String(e.message).slice(0, 200) });
  }
  pushStatus();
  syncVoice();
}

function syncVoice() {
  const want = settings.voiceEnabled && M().ready && !paused;
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
  tray.setToolTip((paused ? t('trPausedTip') : 'Roman Clip') + ' v' + app.getVersion());
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Roman Clip v' + app.getVersion(), enabled: false },
    { type: 'separator' },
    { label: t('trSave'), click: () => clip('srcMenu'), enabled: !paused },
    { label: t('trSettings'), click: openSettings },
    { label: t('trFolder'), click: () => { fs.mkdirSync(settings.outputDir, { recursive: true }); shell.openPath(settings.outputDir); } },
    { type: 'separator' },
    { label: paused ? t('trResume') : t('trPause'), click: togglePause },
    upd.state === 'ready'
      ? { label: t('trInstall', { v: upd.version }), click: installUpdate }
      : { label: t('trCheck'), click: checkUpdates },
    { label: t('trQuit'), click: () => app.quit() },
  ]));
}

async function togglePause() {
  paused = !paused;
  if (paused) { await recorder.stop(); sysAudio.stop(); syncAudioWin(); } else await startRecording();
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
    new Notification({ title: t('nUpdTitle'), body: t('nUpdBody', { v: i.version }) }).show();
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
  if (patch.language && patch.language !== prev.language && prev.voicePhrase === PHRASES[prev.language]) {
    settings.voicePhrase = PHRASES[lang()];          // default phrase follows the language, a custom phrase stays
  }
  saveSettings();
  if (patch.hotkey !== undefined) registerHotkey();
  if (patch.autostart !== undefined) applyAutostart();
  const recKeys = ['seconds', 'afterSeconds', 'fps', 'height', 'quality', 'encoder', 'monitor', 'captureMode', 'codec', 'audioDevice', 'systemAudio'];
  if (recKeys.some((k) => k in patch && patch[k] !== prev[k])) await startRecording().catch((e) => console.error('restart rekordera:', e));
  if (['voiceEnabled', 'voicePhrase', 'micId', 'language'].some((k) => k in patch && patch[k] !== prev[k])) syncVoice();
  pushStatus();
  return { settings, status: status() };
});
ipcMain.handle('clip', () => clip('srcButton'));
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
  return { n: i + 1, w, h };
}));
ipcMain.handle('downloadModel', downloadModel);
ipcMain.on('sysaudio:data', (_e, data) => {
  sysAudio.push(ArrayBuffer.isView(data) ? Buffer.from(data.buffer, data.byteOffset, data.byteLength) : Buffer.from(data));
});
ipcMain.on('voice:heard', (_e, text) => {
  const phrase = settings.voicePhrase.trim().toLowerCase();
  if (!phrase || !text.toLowerCase().includes(phrase)) return;
  if (Date.now() - lastVoiceAt < 5000) return;
  lastVoiceAt = Date.now();
  clip('srcVoice');
});

// ---------- start ----------
app.whenReady().then(async () => {
  loadSettings();
  checkModels();
  protocol.handle('clipmodel', async () => {
    const r = await net.fetch(pathToFileURL(modelFile()).toString());
    return new Response(r.body, { headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/gzip' } });
  });
  // Only our own local pages run here. 'fullscreen' is needed by the clip player, 'media' by the voice command,
  // 'display-capture' by the hidden system-audio window.
  const ALLOWED = new Set(['media', 'fullscreen', 'display-capture']);
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(ALLOWED.has(perm)));
  session.defaultSession.setPermissionCheckHandler((_wc, perm) => ALLOWED.has(perm));
  session.defaultSession.setDisplayMediaRequestHandler(async (_req, cb) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'] });
      cb({ video: sources[0], audio: 'loopback' });            // loopback = everything you hear
    } catch { cb({}); }
  });

  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.ico')));
  tray.on('click', openSettings);
  rebuildTray();
  registerHotkey();
  await startRecording();
  syncVoice();
  if (!fs.existsSync(storeFile())) saveSettings();
  applyAutostart();                                   // re-registers the login item so it carries the --autostart flag
  if (!AUTOSTARTED) openSettings();                   // manual launch: show the window; Windows startup: stay in the tray
  setTimeout(checkUpdates, 8000);
  setInterval(checkUpdates, 6 * 60 * 60 * 1000);
});

app.on('second-instance', openSettings);
app.on('window-all-closed', () => {}); // zostajemy w zasobniku
app.on('will-quit', () => { globalShortcut.unregisterAll(); sysAudio.stop(); });
app.on('before-quit', async (e) => {
  if (recorder.getState().running) { e.preventDefault(); await recorder.stop(); app.quit(); }
});
