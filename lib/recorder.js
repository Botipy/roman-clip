// Rekorder: ffmpeg nagrywa ekran w pętli do 1-sekundowych segmentów .ts (bufor na dysku).
// Zapis klipu = sklejenie ostatnich N segmentów bez ponownego kodowania (natychmiast).
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

let ffmpegPath = require('ffmpeg-static');
ffmpegPath = ffmpegPath.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);

const BASE_MBPS = { low: 6, medium: 12, high: 20, ultra: 40 }; // dla 1080p60
let encoderCache = null;
let proc = null;
let bufDir = null;
let cleanupTimer = null;
let saving = 0;
let keep = 40;
let gen = 0; // numer "generacji" nagrywania, unieważnia stare timery/procesy
let epochStart = 0; // pierwszy segment po ostatnim (re)starcie ffmpeg: starsze mają inne parametry i nie da się ich sklejać
let nextIndex = 0;
let currentCodec = 'h264';
let state = { running: false, encoder: null, mode: null, error: null };
let onState = () => {};

function setState(p) { state = { ...state, ...p }; onState(state); }

function tryEncoder(name) {
  return new Promise((resolve) => {
    execFile(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'nullsrc=s=256x256:d=0.2',
      '-pix_fmt', 'nv12', '-c:v', name, '-frames:v', '3', '-f', 'null', '-'], { timeout: 8000 }, (err) => resolve(!err));
  });
}

async function detectEncoder(pref) {
  if (pref && pref !== 'auto') return pref;
  if (encoderCache) return encoderCache;
  for (const e of ['h264_nvenc', 'h264_amf', 'h264_qsv']) {
    if (await tryEncoder(e)) return (encoderCache = e);
  }
  return (encoderCache = 'libx264');
}

const family = (enc) => (enc === 'libx264' ? 'x264' : enc.split('_')[1]);
const CQ = { low: 34, medium: 29, high: 25, ultra: 21 };    // stała jakość GPU (HEVC +3 daje podobny obraz przy mniejszym pliku)
const CRF = { low: 30, medium: 26, high: 23, ultra: 19 };   // x264

// Jakość = stały współczynnik (CQ/CRF), a bitrate to tylko sufit. Spokojne sceny zajmują mało miejsca, ruchome nie psują się.
function encoderArgs(o, s, capMbps) {
  const cap = `${capMbps.toFixed(1)}M`, buf = `${(capMbps * 2).toFixed(1)}M`;
  const q = s.quality || 'high';
  const cq = String((CQ[q] || 25) + (currentCodec === 'hevc' ? 3 : 0));
  switch (o.fam) {
    case 'nvenc': return ['-c:v', o.name, '-preset', 'p4', '-rc', 'vbr', '-cq', cq, '-b:v', '0', '-maxrate', cap, '-bufsize', buf, '-spatial-aq', '1', '-bf', '2'];
    case 'amf': return ['-c:v', o.name, '-quality', 'balanced', '-rc', 'vbr_peak', '-b:v', `${(capMbps * 0.6).toFixed(1)}M`, '-maxrate', cap];
    case 'qsv': return ['-c:v', o.name, '-preset', 'veryfast', '-global_quality', cq, '-look_ahead', '0'];
    default: return ['-c:v', 'libx264', '-preset', 'superfast', '-crf', String(CRF[q] || 23), '-maxrate', cap, '-bufsize', buf,
      '-threads', String(Math.max(2, Math.floor(os.cpus().length / 3)))];
  }
}

function calcBitrate(s, nativeW, nativeH) {
  const h = s.height || nativeH;
  const w = Math.round(nativeW * (h / nativeH));
  let mbps = (BASE_MBPS[s.quality] || 12) * ((w * h) / (1920 * 1080)) * (s.fps >= 50 ? 1 : 0.7);
  return Math.max(1.5, Math.min(mbps, 80));
}

const nativeSize = (d) => ({ w: Math.round(d.size.width * d.scaleFactor), h: Math.round(d.size.height * d.scaleFactor) });
const isScaling = (s, d) => !!s.height && s.height < nativeSize(d).h;

// o = { enc, name, fam, mode, zc }: zc = zero-copy (klatki zostają na GPU, ok. 10x mniej CPU niż hwdownload)
function buildArgs(s, o, display) {
  const { w: nativeW, h: nativeH } = nativeSize(display);
  const mbps = calcBitrate(s, nativeW, nativeH);
  const a = ['-hide_banner', '-loglevel', 'error', '-y'];
  const scale = isScaling(s, display) ? `scale=-2:${s.height}:flags=bilinear,` : '';
  if (o.mode === 'ddagrab') {
    a.push('-f', 'lavfi', '-i', `ddagrab=output_idx=${s.monitor || 0}:framerate=${s.fps}:draw_mouse=1`);
  } else {
    a.push('-f', 'gdigrab', '-framerate', String(s.fps), '-draw_mouse', '1',
      '-offset_x', String(Math.round(display.bounds.x * display.scaleFactor)),
      '-offset_y', String(Math.round(display.bounds.y * display.scaleFactor)),
      '-video_size', `${nativeW}x${nativeH}`, '-i', 'desktop');
  }
  // audio inputs: [1] system audio from our local TCP bridge (raw f32le 48 kHz stereo), then an optional dshow microphone
  let ai = 0, sysIdx = -1, micIdx = -1;
  if (s.systemAudio && s.sysAudioPort) {
    a.push('-thread_queue_size', '1024', '-f', 'f32le', '-ar', '48000', '-ac', '2', '-i', `tcp://127.0.0.1:${s.sysAudioPort}`);
    sysIdx = ++ai;
  }
  if (s.audioDevice) {
    a.push('-f', 'dshow', '-audio_buffer_size', '50', '-i', `audio=${s.audioDevice}`);
    micIdx = ++ai;
  }
  a.push('-map', '0:v');
  if (!o.zc) a.push('-vf', (o.mode === 'ddagrab' ? 'hwdownload,format=bgra,' : '') + scale + 'format=nv12');
  if (sysIdx > 0 && micIdx > 0) {
    a.push('-filter_complex', `[${sysIdx}:a][${micIdx}:a]amix=inputs=2:duration=first:dropout_transition=0,volume=1.6,aresample=async=1[aout]`, '-map', '[aout]');
  } else if (sysIdx > 0 || micIdx > 0) {
    a.push('-map', `${Math.max(sysIdx, micIdx)}:a`, '-af', 'aresample=async=1');
  }
  if (ai > 0) a.push('-c:a', 'aac', '-b:a', '160k');
  a.push(...encoderArgs(o, s, mbps), '-g', String(s.fps), '-force_key_frames', 'expr:gte(t,n_forced*1)',
    '-f', 'segment', '-segment_start_number', String(nextIndex), '-segment_time', '1', '-segment_format', 'mpegts', '-reset_timestamps', '1',
    path.join(bufDir, 'seg_%06d.ts'));
  return a;
}

function segments() {
  if (!bufDir || !fs.existsSync(bufDir)) return [];
  return fs.readdirSync(bufDir).filter((f) => /^seg_\d+\.ts$/.test(f)).sort();
}

const segIndex = (f) => parseInt(f.slice(4, 10), 10);

// Po (re)starcie ffmpeg nowe segmenty numerujemy dalej i oznaczamy jako nową epokę
function markEpoch() {
  const segs = segments();
  nextIndex = segs.length ? segIndex(segs[segs.length - 1]) + 1 : 0;
  epochStart = nextIndex;
}

function cleanup() {
  if (saving) return;
  const segs = segments();
  for (const f of segs.slice(0, Math.max(0, segs.length - keep))) {
    try { fs.unlinkSync(path.join(bufDir, f)); } catch {}
  }
}

// start/stop wykonują się po kolei (kilka szybkich zmian ustawień nie może się nakładać na siebie)
let chain = Promise.resolve();
const queued = (fn) => (...a) => { const p = chain.then(() => fn(...a)); chain = p.catch(() => {}); return p; };

async function startNow(s, display, dir, cb) {
  if (cb) onState = cb;
  await stopNow();
  bufDir = dir;
  try { fs.rmSync(bufDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 }); } catch {}
  fs.mkdirSync(bufDir, { recursive: true });
  keep = Math.ceil(s.seconds + s.afterSeconds) + 8;
  const enc = await detectEncoder(s.encoder);
  const fam = family(enc);
  currentCodec = s.codec === 'hevc' && fam !== 'x264' && (await tryEncoder(`hevc_${fam}`)) ? 'hevc' : 'h264';
  const mode = s.captureMode === 'gdigrab' ? 'gdigrab' : 'ddagrab';
  const o = {
    enc, fam, mode,
    name: fam === 'x264' ? 'libx264' : `${currentCodec}_${fam}`,
    zc: mode === 'ddagrab' && (fam === 'nvenc' || fam === 'amf') && !isScaling(s, display),
  };
  const g = ++gen;
  nextIndex = 0; epochStart = 0;
  launch(s, display, o, g, 0);
  cleanupTimer = setInterval(cleanup, 4000);
}

// Kolejny krok awaryjny po szybkiej awarii: wyłącz zero-copy, potem gdigrab (tylko tryb auto), potem x264
function degrade(s, o) {
  if (o.zc) { o.zc = false; return true; }
  if (o.mode === 'ddagrab' && s.captureMode !== 'ddagrab') { o.mode = 'gdigrab'; return true; }
  if (o.fam !== 'x264') { o.fam = 'x264'; o.name = 'libx264'; currentCodec = 'h264'; return true; }
  return false;
}

// Uruchamia ffmpeg. Gdy proces padnie nieoczekiwanie (np. gra zmieniła rozdzielczość / tryb ekranu), restartuje go
// i nagrywa dalej do tego samego bufora.
function launch(s, display, o, g, fails) {
  const startedAt = Date.now();
  let err = '';
  proc = spawn(ffmpegPath, buildArgs(s, o, display), { windowsHide: true });
  const mine = proc;
  try { os.setPriority(proc.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch {} // gra ma pierwszeństwo
  setState({ running: true, encoder: o.name, mode: o.mode, zeroCopy: o.zc, error: null });
  proc.stderr.on('data', (d) => { err = (err + d).slice(-1500); });
  proc.on('exit', (code) => {
    if (proc !== mine || g !== gen) return; // zatrzymany celowo / zastąpiony
    proc = null;
    const quick = Date.now() - startedAt < 5000;
    if (quick) {
      fails++;
      if (fails >= 2) degrade(s, o);
      if (fails >= 8) return setState({ running: false, error: `ffmpeg zakończył pracę (kod ${code}): ${err.trim().split(/\r?\n/).pop()}` });
    } else fails = 0;
    setTimeout(() => {
      if (g !== gen) return;
      markEpoch();
      launch(s, display, o, g, fails);
    }, quick ? 1500 : 500);
  });
}

function stopNow() {
  clearInterval(cleanupTimer);
  gen++;
  const p = proc;
  proc = null;
  setState({ running: false });
  if (!p) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const fin = () => { if (!done) { done = true; resolve(); } };
    p.once('exit', fin);
    try { p.stdin.write('q'); } catch {}
    setTimeout(() => { try { p.kill(); } catch {} }, 1500);
    setTimeout(fin, 4000);
  });
}
const start = queued(startNow);
const stop = queued(stopNow);

// Skleja ostatnie `seconds` sekund bufora do pliku mp4. Zwraca ścieżkę.
function saveClip(seconds, outFile) {
  return new Promise((resolve, reject) => {
    const segs = segments().filter((f) => segIndex(f) >= epochStart);
    if (segs.length < 2) return reject(new Error('EMPTY_BUFFER'));
    saving++;
    const take = segs.slice(-Math.ceil(seconds) - 1); // + trwający segment
    const list = path.join(bufDir, 'concat.txt');
    fs.writeFileSync(list, take.map((f) => `file '${path.join(bufDir, f).replace(/\\/g, '/')}'`).join('\n'));
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    execFile(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list,
      '-c', 'copy', ...(currentCodec === 'hevc' ? ['-tag:v', 'hvc1'] : []), '-bsf:a', 'aac_adtstoasc', '-movflags', '+faststart', outFile], (e, _o, stderr) => {
      saving--;
      try { fs.unlinkSync(list); } catch {}
      e ? reject(new Error(stderr || e.message)) : resolve(outFile);
    });
  });
}

// Lista urządzeń audio dshow (mikrofon, "Stereo Mix" itp.)
function listAudioDevices() {
  return new Promise((resolve) => {
    execFile(ffmpegPath, ['-hide_banner', '-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'], (_e, _o, stderr) => {
      const out = [];
      for (const m of String(stderr).matchAll(/"([^"]+)" \(audio\)/g)) out.push(m[1]);
      resolve(out);
    });
  });
}

module.exports = { start, stop, saveClip, listAudioDevices, ffmpegPath, getState: () => state };
