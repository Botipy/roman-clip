// Ukryte okno: mikrofon -> Vosk (offline, grammar = tylko Twoja fraza) -> main.
(async () => {
  const { settings } = await window.api.get();
  const phrase = settings.voicePhrase.trim().toLowerCase();
  if (!phrase) return;

  const model = await Vosk.createModel('clipmodel://m/model.tar.gz');
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { deviceId: settings.micId ? { exact: settings.micId } : undefined, channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  const ctx = new AudioContext();
  let rec;
  try { rec = new model.KaldiRecognizer(ctx.sampleRate, JSON.stringify([phrase, '[unk]'])); }
  catch { rec = new model.KaldiRecognizer(ctx.sampleRate); } // fraza spoza słownika modelu: bez grammar

  rec.on('result', (m) => m.result && m.result.text && window.api.voiceHeard(m.result.text));
  rec.on('partialresult', (m) => m.result && m.result.partial && window.api.voiceHeard(m.result.partial));

  const src = ctx.createMediaStreamSource(stream);
  const node = ctx.createScriptProcessor(4096, 1, 1);
  // Bramka ciszy: rozpoznawanie (kosztowne) działa tylko, gdy w mikrofonie coś słychać, + 2 bufory przed i 1,5 s po.
  const THRESH = 0.008;
  let activeUntil = 0, pre = [];
  node.onaudioprocess = (e) => {
    const d = e.inputBuffer.getChannelData(0);
    let sum = 0;
    for (let i = 0; i < d.length; i++) sum += d[i] * d[i];
    const buf = ctx.createBuffer(1, d.length, ctx.sampleRate);
    buf.copyToChannel(d, 0);
    const now = performance.now();
    try {
      if (Math.sqrt(sum / d.length) > THRESH) {
        if (now > activeUntil) { pre.forEach((b) => rec.acceptWaveform(b)); pre = []; }
        activeUntil = now + 1500;
      }
      if (now < activeUntil) rec.acceptWaveform(buf);
      else { pre.push(buf); if (pre.length > 2) pre.shift(); }
    } catch {}
  };
  src.connect(node);
  node.connect(ctx.destination);
})().catch((e) => console.error('voice:', e));
