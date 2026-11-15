// Generates the README visuals in docs/: banner, panel screenshots and a demo GIF.
// It drives the REAL app (main.js) in a throwaway profile with synthetic demo clips, so nothing private ends up in the images.
// Usage (Windows): npx electron scripts/make-docs.js
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const docs = path.join(root, 'docs');
const work = path.join(os.tmpdir(), 'roman-clip-docs');
const ud = path.join(work, 'userData'), clipsDir = path.join(work, 'clips'), frames = path.join(work, 'frames');
const ff = require(root + '/node_modules/ffmpeg-static');
const VERSION = require(root + '/package.json').version;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.rmSync(work, { recursive: true, force: true });
[docs, ud, clipsDir, frames].forEach((d) => fs.mkdirSync(d, { recursive: true }));

// ---------- synthetic demo clips (cyberpunk palette), timestamps relative to "now" ----------
const pad = (n) => String(n).padStart(2, '0');
const stamp = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
const DEMO = [
  [3 * 60e3, 9, 'gradients=size=1280x720:rate=30:speed=0.02:nb_colors=4:c0=0xfcee09:c1=0xff003c:c2=0x00f0ff:c3=0x0b0b14'],
  [2 * 3600e3, 8, 'mandelbrot=size=1280x720:rate=30'],
  [26 * 3600e3, 7, 'life=size=1280x720:rate=30:ratio=0.08:mold=12:life_color=0xfcee09:death_color=0x00f0ff:random_seed=7'],
];
for (const [ago, dur, src] of DEMO) {
  const d = new Date(Date.now() - ago);
  const out = path.join(clipsDir, `Clip ${stamp(d)}.mp4`);
  const enc = (s) => execFileSync(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', s, '-t', String(dur),
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '24', '-pix_fmt', 'yuv420p', out]);
  try { enc(src); } catch { enc('testsrc2=size=1280x720:rate=30'); }
  fs.utimesSync(out, d, d);
}
fs.writeFileSync(path.join(ud, 'settings.json'), JSON.stringify({ outputDir: clipsDir, notify: false, sound: false, language: 'en' }));
app.setPath('userData', ud);
require(path.join(root, 'main.js'));

// ---------- banner ----------
async function makeBanner() {
  const fonts = 'file:///' + path.join(root, 'renderer', 'fonts', 'fonts.css').replace(/\\/g, '/');
  const icon = 'file:///' + path.join(root, 'assets', 'icon.png').replace(/\\/g, '/');
  const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${fonts}"><style>
    html,body{margin:0;width:1280px;height:420px;overflow:hidden;background:#05050a;font-family:Rajdhani,sans-serif;color:#ece9d6}
    .bg{position:absolute;inset:0;background:radial-gradient(760px 420px at 100% 0,rgba(255,0,60,.30),transparent 62%),radial-gradient(760px 420px at 0 100%,rgba(0,240,255,.22),transparent 62%)}
    .grid{position:absolute;inset:0;background-image:linear-gradient(rgba(0,240,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(0,240,255,.05) 1px,transparent 1px);background-size:48px 48px}
    .scan{position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(255,255,255,.035) 0 1px,transparent 1px 3px)}
    .stripe{position:absolute;left:0;top:0;bottom:0;width:16px;background:repeating-linear-gradient(-45deg,#fcee09 0 10px,#000 10px 20px)}
    img{position:absolute;left:96px;top:66px;width:288px;filter:drop-shadow(0 0 34px rgba(252,238,9,.35))}
    h1{position:absolute;left:430px;top:84px;margin:0;font:700 116px/1 Rajdhani;letter-spacing:.14em;color:#fcee09;text-shadow:5px 0 #ff003c,-5px 0 #00f0ff}
    .tag{position:absolute;left:436px;top:216px;font:400 23px 'Share Tech Mono',monospace;letter-spacing:.42em;color:#00f0ff}
    .pills{position:absolute;left:434px;top:284px;display:flex;gap:12px}
    .pill{padding:6px 18px;font:700 22px Rajdhani;letter-spacing:.2em;color:#ece9d6;background:rgba(0,0,0,.45);border:1px solid #3a3a52}
    .pill.y{color:#000;background:#fcee09;border-color:#fcee09}
    .br{position:absolute;width:44px;height:44px;border:4px solid #00f0ff}
    .tl{left:44px;top:30px;border-right:0;border-bottom:0}.br2{right:44px;bottom:30px;border-left:0;border-top:0;border-color:#ff003c}
  </style></head><body><div class="bg"></div><div class="grid"></div><div class="stripe"></div>
  <img src="${icon}"><h1>ROMAN CLIP</h1><div class="tag">// INSTANT-REPLAY CLIPS FOR YOUR PC</div>
  <div class="pills"><span class="pill y">HOTKEY OR VOICE</span><span class="pill">GPU ZERO-COPY</span><span class="pill">100% OFFLINE</span></div>
  <div class="br tl"></div><div class="br br2"></div><div class="scan"></div></body></html>`;
  const f = path.join(work, 'banner.html');
  fs.writeFileSync(f, html);
  const w = new BrowserWindow({ width: 1280, height: 420, useContentSize: true, frame: false, show: true, x: -3000, y: 100,
    webPreferences: { backgroundThrottling: false } });
  await w.loadFile(f);
  await wait(900);
  const img = await w.webContents.capturePage();
  fs.writeFileSync(path.join(docs, 'banner.png'), img.resize({ width: 1280, quality: 'best' }).toPNG());
  w.destroy();
}

// ---------- panel screenshots + demo GIF ----------
(async () => {
  await wait(1500);
  await makeBanner();
  app.emit('second-instance');
  await wait(6000);
  const win = BrowserWindow.getAllWindows().find((w) => w.getTitle() === 'Roman Clip');
  if (!win) { console.log('settings window not found'); return app.quit(); }
  win.setPosition(-3000, 60);                      // keep it off-screen while we capture
  win.webContents.setBackgroundThrottling(false);
  const ex = (c) => win.webContents.executeJavaScript(c);
  const shot = async (name) => {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(docs, name), img.toPNG());
    return img.getSize();
  };

  // keep screenshots deterministic: pretend "up to date", a neutral folder path and a free hotkey
  await ex(`window.__fix = setInterval(() => {
    const bar = document.querySelector('.updbar');
    document.getElementById('ver').textContent = 'v${VERSION}';
    document.getElementById('updText').textContent = I18N.t('updLatest');
    bar.classList.add('good'); bar.classList.remove('bad');
    const b = document.getElementById('updBtn'); b.disabled = false; b.textContent = I18N.t('updCheck');
    document.getElementById('hotkeyMsg').textContent = '';
    document.getElementById('outputDir').value = 'C:\\\\Users\\\\you\\\\Videos\\\\Roman Clip';
  }, 30); 1`);
  await wait(800);
  const scrollTo = (y) => ex(`document.querySelector('.scroll').scrollTop = ${y}; 1`).then(() => wait(350));

  await scrollTo(0);
  console.log('settings', await shot('screenshot-settings.png'));
  await scrollTo(840);
  await shot('screenshot-settings-2.png');
  await scrollTo(0);

  // clips tab with the player open
  await ex(`document.querySelector('.tab[data-tab=clips]').click(); 1`); await wait(3500);
  await ex(`document.querySelector('.ccard').click(); 1`); await wait(1800);
  await ex(`(() => { const v = document.getElementById('vid'); v.pause(); v.currentTime = 3.2; })(); 1`); await wait(700);
  await scrollTo(150);
  await shot('screenshot-clips.png');
  await ex(`document.getElementById('vid').pause(); document.querySelector('.tab[data-tab=rec]').click(); 1`); await wait(400);
  await scrollTo(0);

  // paused
  await ex(`document.getElementById('pauseBtn').click(); 1`); await wait(1800);
  await shot('screenshot-paused.png');
  await ex(`document.getElementById('pauseBtn').click(); 1`); await wait(3500);

  // Polish
  await ex(`document.getElementById('langBtn').click(); 1`); await wait(1500);
  await shot('screenshot-pl.png');
  await ex(`document.getElementById('langBtn').click(); 1`); await wait(1500);

  // ---- demo GIF: record frames while a script clicks around
  let recording = true, n = 0;
  const t0 = Date.now();
  const grab = (async () => {
    while (recording) {
      const s = Date.now();
      const img = await win.webContents.capturePage();
      fs.writeFileSync(path.join(frames, `f_${String(n++).padStart(4, '0')}.jpg`), img.toJPEG(88));
      await wait(Math.max(0, 90 - (Date.now() - s)));
    }
  })();
  const click = (sel) => ex(`document.querySelector(${JSON.stringify(sel)}).click(); 1`);
  const slide = (key, v) => ex(`(() => { const r = document.querySelector('input[data-key=${key}]'); r.value = ${v}; r.dispatchEvent(new Event('input')); r.dispatchEvent(new Event('change')); })(); 1`);
  await wait(900);
  await click('.seg[data-key=quality] button[data-v=ultra]'); await wait(700);
  await click('.seg[data-key=fps] button[data-v="120"]'); await wait(700);
  await slide('seconds', 90); await wait(800);
  await click('.seg[data-key=codec] button[data-v=hevc]'); await wait(900);
  await click('.seg[data-key=quality] button[data-v=high]'); await wait(500);
  await click('.seg[data-key=fps] button[data-v="60"]'); await wait(500);
  await slide('seconds', 30); await wait(500);
  await click('.seg[data-key=codec] button[data-v=h264]'); await wait(700);
  await click('.tab[data-tab=clips]'); await wait(2600);
  await click('.ccard'); await wait(3200);
  await click('#vPlay'); await wait(900);
  await scrollTo(0); await wait(400);                 // pause button lives in the HUD at the top
  await click('#pauseBtn'); await wait(1900);
  await click('#pauseBtn'); await wait(1700);
  recording = false;
  await grab;
  const fps = Math.max(5, Math.min(12, Math.round(n / ((Date.now() - t0) / 1000))));
  console.log('frames', n, 'fps', fps);

  execFileSync(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(fps), '-i', path.join(frames, 'f_%04d.jpg'),
    '-vf', 'scale=480:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle',
    '-loop', '0', path.join(docs, 'demo.gif')]);
  console.log('demo.gif', (fs.statSync(path.join(docs, 'demo.gif')).size / 1048576).toFixed(2), 'MB');
  app.quit();
})().catch((e) => { console.log('FAILED', e); app.quit(); });
