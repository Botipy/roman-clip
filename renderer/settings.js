const $ = (id) => document.getElementById(id);
const bridge = window.api; // not "api": that would clash with the global window.api exposed by contextBridge

const ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M11 6v12l-8.5-6zM21 6v12l-8.5-6z"/></svg>',
  fwd: '<svg viewBox="0 0 24 24"><path d="M13 6v12l8.5-6zM3 6v12l8.5-6z"/></svg>',
  vol: '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 4V5L7 9z"/><path class="st" d="M15.5 8.5a5 5 0 010 7M18 6a8.5 8.5 0 010 12"/></svg>',
  mute: '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 4V5L7 9z"/><path class="st" d="M16 9l5 6M21 9l-5 6"/></svg>',
  full: '<svg viewBox="0 0 24 24"><path class="st" d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
};

let S = {};            // settings
let ST = {};           // status from main
let displays = [];     // {w, h}
let audioDevs = [];    // dshow audio devices
let mics = [];         // [{id, label}]
const NUM = new Set(['seconds', 'afterSeconds', 'fps', 'height', 'monitor']);
const pad = (n) => String(n).padStart(2, '0');

function toast(msg) {
  const el = $('toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toast.id);
  toast.id = setTimeout(() => { el.hidden = true; }, 2600);
}

// ---------------------------------------------------------------- settings
const fmtSec = (s) => (s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${pad(s % 60)} min`);

function applyControls() {
  document.querySelectorAll('input[type=range][data-key]').forEach((el) => {
    el.value = S[el.dataset.key];
    const p = ((el.value - el.min) / (el.max - el.min)) * 100;
    el.style.setProperty('--p', p + '%');
    el.parentElement.querySelector('.val').textContent = fmtSec(Number(el.value));
  });
  document.querySelectorAll('.seg[data-key]').forEach((seg) => {
    const cur = String(S[seg.dataset.key]);
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === cur));
  });
  document.querySelectorAll('select[data-key]').forEach((el) => { el.value = S[el.dataset.key]; });
  document.querySelectorAll('input[type=checkbox][data-key]').forEach((el) => { el.checked = !!S[el.dataset.key]; });
  document.querySelectorAll('input[type=text][data-key]').forEach((el) => { if (document.activeElement !== el) el.value = S[el.dataset.key]; });
  $('outputDir').value = S.outputDir;
  renderEst(); renderCaps(); renderMeta();
}

async function commit(key, value) {
  S = { ...S, [key]: value };
  if (key === 'language') I18N.setLang(value);
  applyControls();
  if (key === 'language') relabel();
  try {
    const r = await bridge.set({ [key]: value });
    S = r.settings; ST = r.status;
    applyControls();                       // main may adjust related values (e.g. the default voice phrase per language)
    renderStatus(ST);
  } catch (e) {
    toast(t('toastSetFail'));
    const cur = await bridge.get();
    S = cur.settings; renderStatus(cur.status); applyControls();
  }
}

function bindControls() {
  document.querySelectorAll('input[type=range][data-key]').forEach((el) => {
    el.addEventListener('input', () => {
      el.style.setProperty('--p', ((el.value - el.min) / (el.max - el.min)) * 100 + '%');
      el.parentElement.querySelector('.val').textContent = fmtSec(Number(el.value));
      S = { ...S, [el.dataset.key]: Number(el.value) }; renderEst();
    });
    el.addEventListener('change', () => commit(el.dataset.key, Number(el.value)));
  });
  document.querySelectorAll('.seg[data-key]').forEach((seg) => {
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const k = seg.dataset.key;
      commit(k, NUM.has(k) ? Number(b.dataset.v) : b.dataset.v);
    });
  });
  document.querySelectorAll('select[data-key]').forEach((el) => {
    el.addEventListener('change', () => commit(el.dataset.key, NUM.has(el.dataset.key) ? Number(el.value) : el.value));
  });
  document.querySelectorAll('input[type=checkbox][data-key]').forEach((el) => {
    el.addEventListener('change', () => commit(el.dataset.key, el.checked));
  });
  document.querySelectorAll('input[type=text][data-key]').forEach((el) => {
    el.addEventListener('change', () => commit(el.dataset.key, el.value));
  });
}

// Upper bound of the clip size (same formula as the bitrate cap in the recorder)
function renderEst() {
  const d = displays[S.monitor] || displays[0] || { w: 1920, h: 1080 };
  const h = S.height || d.h, w = Math.round((d.w * h) / d.h);
  const base = { low: 6, medium: 12, high: 20, ultra: 40 }[S.quality] || 12;
  const mbps = Math.max(1.5, Math.min(base * ((w * h) / (1920 * 1080)) * (S.fps >= 50 ? 1 : 0.7), 80));
  const mb = (mbps * (S.seconds + S.afterSeconds)) / 8;
  $('est').innerHTML = t('est1', { mb: Math.round(mb), w, h, fps: S.fps }) + '<br>' + t('est2', { mbps: mbps.toFixed(0) });
}

// ---------------------------------------------------------------- hotkey
function renderCaps() {
  if (capturing) return;
  const parts = (S.hotkey || '').split('+').filter(Boolean);
  $('hkCaps').innerHTML = parts.map((p) => `<kbd>${p}</kbd>`).join('');
  $('hkBtn').textContent = S.hotkey || '—';
  document.querySelectorAll('.hkLive').forEach((k) => { k.textContent = S.hotkey || '—'; });
}

let capturing = false;
function stopCapture() {
  capturing = false; $('hkCaps').classList.remove('listening');
  $('hkChange').textContent = t('hkChange'); renderCaps();
}
$('hkChange').addEventListener('click', () => {
  if (capturing) return stopCapture();
  capturing = true;
  $('hkCaps').classList.add('listening');
  $('hkCaps').innerHTML = `<kbd>${t('hkPress')}</kbd>`;
  $('hkChange').textContent = t('hkCancel');
});
document.addEventListener('keydown', (e) => {
  if (!capturing) return;
  e.preventDefault(); e.stopPropagation();
  if (e.key === 'Escape') return stopCapture();
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
  const parts = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Super');
  let key = e.key.length === 1 ? e.key.toUpperCase() : e.key.replace('Arrow', '');
  if (key === ' ') key = 'Space';
  parts.push(key);
  stopCapture();
  commit('hotkey', parts.join('+'));
}, true);

// ---------------------------------------------------------------- status
function renderMeta() {
  const tags = [];
  if (ST.encoder) tags.push(['hl', ST.encoder.toUpperCase()]);
  if (ST.zeroCopy) tags.push(['hl', 'ZERO-COPY GPU']);
  if (ST.mode) tags.push(['', ST.mode === 'ddagrab' ? t('tagDda') : t('tagGdi')]);
  tags.push(['', `${S.fps || 60} FPS`]);
  tags.push(['', S.height ? `${S.height}P` : t('tagNative')]);
  tags.push(['', t('tagBuffer', { t: fmtSec(S.seconds || 30) })]);
  if (S.audioDevice) tags.push(['', t('tagAudio')]);
  if (S.voiceEnabled) tags.push(['warn', t('tagVoice', { p: S.voicePhrase })]);
  $('meta').innerHTML = tags.map(([c, txt]) => `<span class="tagc ${c}">${txt}</span>`).join('');
}

function renderUpdate(s) {
  $('ver').textContent = 'v' + s.version;
  const u = s.update || { state: 'idle' }, btn = $('updBtn'), bar = document.querySelector('.updbar');
  btn.disabled = false; btn.textContent = t('updCheck'); btn.dataset.act = 'check';
  const map = {
    dev: t('updDev'), idle: t('updIdle'), checking: t('updChecking'), latest: t('updLatest'),
    downloading: t('updDownloading', { v: u.version || t('updNewVersion'), p: u.percent }),
    ready: t('updReady', { v: u.version }), error: t('updError', { e: u.error || '' }),
  };
  $('updText').textContent = map[u.state] || '';
  bar.classList.toggle('bad', u.state === 'error');
  bar.classList.toggle('good', u.state === 'ready' || u.state === 'downloading' || u.state === 'latest');
  if (u.state === 'ready') { btn.textContent = t('updInstall'); btn.dataset.act = 'install'; }
  if (['dev', 'checking', 'downloading'].includes(u.state)) btn.disabled = true;
}

function renderStatus(s) {
  ST = s;
  renderUpdate(s);
  const chip = $('state');
  if (s.error) { chip.className = 'chip err'; chip.textContent = t('stError', { e: s.error }); chip.title = s.error; }
  else if (s.paused) { chip.className = 'chip pause'; chip.textContent = t('stPaused'); chip.title = ''; }
  else if (s.running) { chip.className = 'chip on'; chip.textContent = t('stRec'); chip.title = ''; }
  else { chip.className = 'chip'; chip.textContent = t('stStarting'); chip.title = ''; }
  document.body.classList.toggle('is-paused', !!s.paused);
  $('pausedBanner').hidden = !s.paused;
  $('pauseBtn').innerHTML = (s.paused ? ICON.play : ICON.pause) + `<span>${t(s.paused ? 'resume' : 'pause')}</span>`;
  $('hotkeyMsg').textContent = s.hotkeyOk ? '' : t('hkBad');
  const m = s.model || {}, bar = $('modelBar').parentElement, dl = m.progress !== null && m.progress !== undefined;
  $('modelBtn').textContent = t('modelBtn', { mb: m.mb || 50 });
  $('modelBtn').style.display = m.ready ? 'none' : '';
  $('modelBtn').disabled = dl;
  bar.style.display = dl ? 'block' : 'none';
  $('modelBar').style.width = (m.progress || 0) + '%';
  $('modelMsg').textContent = m.ready ? t('modelReady') : m.error ? t('modelErr', { e: m.error }) : dl ? t('modelDl') : '';
  renderMeta();
}

$('pauseBtn').onclick = () => bridge.togglePause();
$('clipNow').onclick = () => bridge.clip();
$('modelBtn').onclick = () => bridge.downloadModel();
$('updBtn').onclick = () => ($('updBtn').dataset.act === 'install' ? bridge.installUpdate() : bridge.checkUpdates());
$('pick').onclick = async () => { const d = await bridge.pickDir(); if (d) commit('outputDir', d); };
$('wMin').onclick = () => bridge.winMin();
$('wClose').onclick = () => bridge.winClose();
$('langBtn').onclick = () => commit('language', I18N.lang === 'en' ? 'pl' : 'en');

// ---------------------------------------------------------------- tabs
function showTab(name) {
  document.querySelectorAll('.tab').forEach((tb) => tb.classList.toggle('on', tb.dataset.tab === name));
  $('tab-rec').hidden = name !== 'rec';
  $('tab-clips').hidden = name !== 'clips';
  if (name === 'clips') loadClips();
  else $('vid').pause();
}
document.querySelectorAll('.tab').forEach((tb) => tb.addEventListener('click', () => showTab(tb.dataset.tab)));

// ---------------------------------------------------------------- clips
let clips = [], cur = null, metaToken = 0;
const fmtTime = (s) => (isFinite(s) ? `${Math.floor(s / 60)}:${pad(Math.floor(s % 60))}` : '0:00');
const fmtSize = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
function ago(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return t('agoNow'); if (m < 60) return t('agoMin', { n: m });
  const h = Math.round(m / 60); if (h < 24) return t('agoHour', { n: h });
  return t('agoDay', { n: Math.round(h / 24) });
}
function niceName(n) {
  const m = /^(?:Klip|Clip) (\d{4}-\d{2}-\d{2}) (\d{2})-(\d{2})-(\d{2})/.exec(n);
  return m ? `${m[1]} · ${m[2]}:${m[3]}:${m[4]}` : n.replace(/\.mp4$/i, '');
}

async function loadClips() {
  clips = await bridge.clipsList();
  $('clipCount').textContent = clips.length;
  $('empty').hidden = clips.length > 0;
  const grid = $('grid');
  grid.innerHTML = '';
  clips.forEach((c) => {
    const b = document.createElement('button');
    b.className = 'ccard' + (cur && cur.path === c.path ? ' on' : '');
    b.dataset.path = c.path;
    b.innerHTML = `<div class="thumb"><i></i><span class="dur">--:--</span></div><div class="cmeta"><b></b><small></small></div>`;
    b.querySelector('b').textContent = niceName(c.name);
    b.querySelector('small').textContent = `${fmtSize(c.size)} · ${ago(c.mtime)}`;
    b.onclick = () => selectClip(c, true);
    grid.appendChild(b);
  });
  if (cur && !clips.find((c) => c.path === cur.path)) closePlayer();
  const token = ++metaToken;
  for (const c of clips) {                       // thumbnails load one by one (cheap for the CPU)
    if (token !== metaToken) return;
    const meta = await bridge.clipMeta(c.path);
    const card = grid.querySelector(`[data-path="${CSS.escape(c.path)}"]`);
    if (!meta || !card) continue;
    if (meta.thumb) { const img = new Image(); img.src = meta.thumb; card.querySelector('.thumb').prepend(img); }
    if (meta.duration) card.querySelector('.dur').textContent = fmtTime(meta.duration);
  }
}

function closePlayer() {
  const v = $('vid'); v.pause(); v.removeAttribute('src'); v.load();
  cur = null; $('player').hidden = true;
  document.querySelectorAll('.ccard.on').forEach((c) => c.classList.remove('on'));
}

function selectClip(c, autoplay) {
  cur = c;
  document.querySelectorAll('.ccard').forEach((el) => el.classList.toggle('on', el.dataset.path === c.path));
  $('player').hidden = false;
  $('verr').hidden = true;
  $('pName').textContent = niceName(c.name);
  const v = $('vid');
  v.src = c.url;
  v.playbackRate = 1; $('vSpeed').textContent = '1×';
  if (autoplay) v.play().catch(() => {});
  $('player').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// --- custom player
const vid = $('vid'), vwrap = $('vwrap');
$('vPlay').innerHTML = ICON.play; $('vBack').innerHTML = ICON.back; $('vFwd').innerHTML = ICON.fwd;
$('vMute').innerHTML = ICON.vol; $('vFull').innerHTML = ICON.full; $('vbig').innerHTML = ICON.play;

const toggle = () => (vid.paused ? vid.play().catch(() => {}) : vid.pause());
const seekBy = (d) => { vid.currentTime = Math.max(0, Math.min(vid.duration || 0, vid.currentTime + d)); };
vid.addEventListener('play', () => { vwrap.classList.remove('paused'); $('vPlay').innerHTML = ICON.pause; });
vid.addEventListener('pause', () => { vwrap.classList.add('paused'); $('vPlay').innerHTML = ICON.play; $('vbig').innerHTML = ICON.play; });
vid.addEventListener('ended', () => { vwrap.classList.add('paused'); });
vid.addEventListener('error', () => { if (vid.getAttribute('src')) $('verr').hidden = false; });
vid.addEventListener('loadeddata', () => { $('verr').hidden = true; });
vid.addEventListener('timeupdate', paintTime);
vid.addEventListener('loadedmetadata', paintTime);
function paintTime() {
  const d = vid.duration || 0, p = d ? (vid.currentTime / d) * 100 : 0;
  $('seekFill').style.width = p + '%'; $('seekKnob').style.left = p + '%';
  $('vTime').textContent = `${fmtTime(vid.currentTime)} / ${fmtTime(d)}`;
}
vid.addEventListener('click', toggle);
$('vbig').onclick = toggle; $('vPlay').onclick = toggle;
$('vBack').onclick = () => seekBy(-5); $('vFwd').onclick = () => seekBy(5);
$('vSpeed').onclick = () => {
  const speeds = [0.5, 1, 1.5, 2], i = (speeds.indexOf(vid.playbackRate) + 1) % speeds.length;
  vid.playbackRate = speeds[i]; $('vSpeed').textContent = speeds[i] + '×';
};
$('vMute').onclick = () => { vid.muted = !vid.muted; $('vMute').innerHTML = vid.muted ? ICON.mute : ICON.vol; };
$('vVol').addEventListener('input', (e) => {
  vid.volume = Number(e.target.value); vid.muted = vid.volume === 0;
  $('vMute').innerHTML = vid.muted ? ICON.mute : ICON.vol;
  e.target.style.setProperty('--p', e.target.value * 100 + '%');
});
$('vVol').style.setProperty('--p', '100%');
$('vFull').onclick = () => (document.fullscreenElement ? document.exitFullscreen() : vwrap.requestFullscreen());
vid.addEventListener('dblclick', () => $('vFull').click());

const seek = $('seek');
let dragging = false;
const seekTo = (e) => {
  const r = seek.getBoundingClientRect();
  vid.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (vid.duration || 0);
};
seek.addEventListener('pointerdown', (e) => { dragging = true; seek.setPointerCapture(e.pointerId); seekTo(e); });
seek.addEventListener('pointermove', (e) => { if (dragging) seekTo(e); });
seek.addEventListener('pointerup', () => { dragging = false; });

let idleT;
vwrap.addEventListener('mousemove', () => { vwrap.classList.remove('idle'); clearTimeout(idleT); idleT = setTimeout(() => vwrap.classList.add('idle'), 2500); });
vwrap.addEventListener('mouseleave', () => vwrap.classList.remove('idle'));

document.addEventListener('keydown', (e) => {
  if (capturing || $('tab-clips').hidden || $('player').hidden) return;
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName) && document.activeElement.type !== 'range') return;
  const k = e.key;
  if (k === ' ' || k === 'k') { e.preventDefault(); toggle(); }
  else if (k === 'ArrowLeft') { e.preventDefault(); seekBy(-5); }
  else if (k === 'ArrowRight') { e.preventDefault(); seekBy(5); }
  else if (k === 'ArrowUp') { e.preventDefault(); $('vVol').value = Math.min(1, vid.volume + 0.1); $('vVol').dispatchEvent(new Event('input')); }
  else if (k === 'ArrowDown') { e.preventDefault(); $('vVol').value = Math.max(0, vid.volume - 0.1); $('vVol').dispatchEvent(new Event('input')); }
  else if (k === 'f' || k === 'F') $('vFull').click();
  else if (k === 'm' || k === 'M') $('vMute').click();
});

// clip actions
$('aFolder').onclick = () => cur && bridge.clipReveal(cur.path);
$('aOpen').onclick = () => cur && bridge.clipOpen(cur.path);
$('verrOpen').onclick = () => cur && bridge.clipOpen(cur.path);
let delT;
$('aDel').onclick = async () => {
  const b = $('aDel');
  if (!b.classList.contains('confirm')) {
    b.classList.add('confirm'); b.textContent = t('actConfirm');
    delT = setTimeout(() => { b.classList.remove('confirm'); b.textContent = t('actDelete'); }, 3000);
    return;
  }
  clearTimeout(delT); b.classList.remove('confirm'); b.textContent = t('actDelete');
  const path = cur && cur.path;
  closePlayer();
  if (path) { await bridge.clipDelete(path); toast(t('toastTrashed')); loadClips(); }
};
$('refresh').onclick = loadClips;
$('openDir').onclick = () => bridge.openDir();

bridge.onStatus(renderStatus);
bridge.onClipSaved(() => { toast(t('toastSaved')); loadClips(); });

// ---------------------------------------------------------------- language / start
function fillSelect(el, items, current, firstLabel) {
  el.innerHTML = '';
  if (firstLabel !== undefined) el.add(new Option(firstLabel, ''));
  items.forEach(([v, label]) => el.add(new Option(label, v)));
  el.value = current;
}

function fillDynamicSelects() {
  fillSelect($('audioDevice'), audioDevs.map((d) => [d, d]), S.audioDevice, t('noAudio'));
  fillSelect($('monitor'), displays.map((d, i) => [i, t('display', { n: i + 1, w: d.w, h: d.h })]), S.monitor);
  fillSelect($('micId'), mics.map((m) => [m.id, m.label]), S.micId, t('micDefault'));
}

// Re-render everything that was built from JS after the language changed
function relabel() {
  I18N.apply();
  $('langBtn').textContent = I18N.lang.toUpperCase();
  fillDynamicSelects();
  $('hkChange').textContent = capturing ? t('hkCancel') : t('hkChange');
  applyControls();
  renderStatus(ST);
  if (!$('tab-clips').hidden) loadClips();
}

(async () => {
  const { settings, status } = await bridge.get();
  S = settings; ST = status;
  I18N.setLang(S.language || 'en');
  const [devices, disp] = await Promise.all([bridge.audioDevices(), bridge.displays()]);
  audioDevs = devices; displays = disp;
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true }).then((st) => st.getTracks().forEach((tr) => tr.stop()));
    mics = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput').map((d) => ({ id: d.deviceId, label: d.label || 'Microphone' }));
  } catch { mics = []; }
  bindControls();
  relabel();
  loadClips();
})();
