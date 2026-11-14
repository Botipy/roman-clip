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
  node.onaudioprocess = (e) => { try { rec.acceptWaveform(e.inputBuffer); } catch {} };
  src.connect(node);
  node.connect(ctx.destination);
})().catch((e) => console.error('voice:', e));
