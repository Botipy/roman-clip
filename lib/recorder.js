// Rekorder: ffmpeg nagrywa ekran w pętli do 1-sekundowych segmentów .ts (bufor na dysku).
// Zapis klipu = sklejenie ostatnich N segmentów bez ponownego kodowania (natychmiast).
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

let ffmpegPath = require('ffmpeg-static');
ffmpegPath = ffmpegPath.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);

const BASE_MBPS = { low: 6, medium: 12, high: 20, ultra: 40 }; // dla 1080p60
let encoderCache = null;
let proc = null;
let bufDir = null;
let cleanupTimer = null;
let saving = 0;
let keep = 40;
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

function encoderArgs(enc, mbps) {
  const b = `${mbps.toFixed(1)}M`, mx = `${(mbps * 1.5).toFixed(1)}M`, bs = `${(mbps * 2).toFixed(1)}M`;
  const common = ['-b:v', b, '-maxrate', mx, '-bufsize', bs];
  switch (enc) {
    case 'h264_nvenc': return ['-c:v', enc, '-preset', 'p4', '-tune', 'll', ...common];
    case 'h264_amf': return ['-c:v', enc, '-quality', 'speed', ...common];
    case 'h264_qsv': return ['-c:v', enc, '-preset', 'veryfast', ...common];
    default: return ['-c:v', 'libx264', '-preset', 'ultrafast', ...common];
  }
}

function calcBitrate(s, nativeW, nativeH) {
  const h = s.height || nativeH;
  const w = Math.round(nativeW * (h / nativeH));
  let mbps = (BASE_MBPS[s.quality] || 12) * ((w * h) / (1920 * 1080)) * (s.fps >= 50 ? 1 : 0.7);
  return Math.max(1.5, Math.min(mbps, 80));
}

function buildArgs(s, enc, mode, display) {
  const nativeW = Math.round(display.size.width * display.scaleFactor);
  const nativeH = Math.round(display.size.height * display.scaleFactor);
  const mbps = calcBitrate(s, nativeW, nativeH);
  const a = ['-hide_banner', '-loglevel', 'error', '-y'];
  const scale = s.height && s.height < nativeH ? `scale=-2:${s.height}:flags=bilinear,` : '';
  if (mode === 'ddagrab') {
    a.push('-f', 'lavfi', '-i', `ddagrab=output_idx=${s.monitor || 0}:framerate=${s.fps}:draw_mouse=1`);
  } else {
    a.push('-f', 'gdigrab', '-framerate', String(s.fps), '-draw_mouse', '1',
      '-offset_x', String(Math.round(display.bounds.x * display.scaleFactor)),
      '-offset_y', String(Math.round(display.bounds.y * display.scaleFactor)),
      '-video_size', `${nativeW}x${nativeH}`, '-i', 'desktop');
  }
  if (s.audioDevice) a.push('-f', 'dshow', '-audio_buffer_size', '50', '-i', `audio=${s.audioDevice}`);
  const vf = (mode === 'ddagrab' ? 'hwdownload,format=bgra,' : '') + scale + 'format=nv12';
  a.push('-map', '0:v', '-vf', vf);
  if (s.audioDevice) a.push('-map', '1:a', '-c:a', 'aac', '-b:a', '160k', '-af', 'aresample=async=1');
  a.push(...encoderArgs(enc, mbps), '-g', String(s.fps), '-force_key_frames', 'expr:gte(t,n_forced*1)',
    '-f', 'segment', '-segment_time', '1', '-segment_format', 'mpegts', '-reset_timestamps', '1',
    path.join(bufDir, 'seg_%06d.ts'));
  return a;
}

function segments() {
  if (!bufDir || !fs.existsSync(bufDir)) return [];
  return fs.readdirSync(bufDir).filter((f) => /^seg_\d+\.ts$/.test(f)).sort();
}

function cleanup() {
  if (saving) return;
  const segs = segments();
  for (const f of segs.slice(0, Math.max(0, segs.length - keep))) {
    try { fs.unlinkSync(path.join(bufDir, f)); } catch {}
  }
}

async function start(s, display, dir, cb) {
  if (cb) onState = cb;
  await stop();
  bufDir = dir;
  fs.rmSync(bufDir, { recursive: true, force: true });
  fs.mkdirSync(bufDir, { recursive: true });
  keep = Math.ceil(s.seconds + s.afterSeconds) + 8;
  const enc = await detectEncoder(s.encoder);
  launch(s, display, enc, 'ddagrab');
  cleanupTimer = setInterval(cleanup, 4000);
}

function launch(s, display, enc, mode) {
  const startedAt = Date.now();
  let err = '';
  proc = spawn(ffmpegPath, buildArgs(s, enc, mode, display), { windowsHide: true });
  const mine = proc;
  setState({ running: true, encoder: enc, mode, error: null });
  proc.stderr.on('data', (d) => { err = (err + d).slice(-1500); });
  proc.on('exit', (code) => {
    if (proc !== mine) return; // zatrzymany celowo / zastąpiony
    proc = null;
    if (mode === 'ddagrab' && Date.now() - startedAt < 5000) return launch(s, display, enc, 'gdigrab');
    if (enc !== 'libx264' && Date.now() - startedAt < 5000) return launch(s, display, 'libx264', mode);
    setState({ running: false, error: `ffmpeg zakończył pracę (kod ${code}): ${err.trim().split('\n').pop()}` });
  });
}

function stop() {
  clearInterval(cleanupTimer);
  const p = proc;
  proc = null;
  setState({ running: false });
  if (!p) return Promise.resolve();
  return new Promise((resolve) => {
    p.once('exit', resolve);
    try { p.stdin.write('q'); } catch {}
    setTimeout(() => { try { p.kill(); } catch {} resolve(); }, 1500);
  });
}

// Skleja ostatnie `seconds` sekund bufora do pliku mp4. Zwraca ścieżkę.
function saveClip(seconds, outFile) {
  return new Promise((resolve, reject) => {
    const segs = segments();
    if (segs.length < 2) return reject(new Error('Bufor jest jeszcze pusty, poczekaj chwilę.'));
    saving++;
    const take = segs.slice(-Math.ceil(seconds) - 1); // + trwający segment
    const list = path.join(bufDir, 'concat.txt');
    fs.writeFileSync(list, take.map((f) => `file '${path.join(bufDir, f).replace(/\\/g, '/')}'`).join('\n'));
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    execFile(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list,
      '-c', 'copy', '-bsf:a', 'aac_adtstoasc', '-movflags', '+faststart', outFile], (e, _o, stderr) => {
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

module.exports = { start, stop, saveClip, listAudioDevices, getState: () => state };
