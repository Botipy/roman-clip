// Hidden window: captures system audio (Windows loopback) and streams raw stereo float32 @ 48 kHz to the main process.
(async () => {
  // main answers this request with { video: <screen>, audio: 'loopback' } (setDisplayMediaRequestHandler)
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  stream.getVideoTracks().forEach((t) => t.stop());          // we only want the sound
  const audio = stream.getAudioTracks();
  if (!audio.length) throw new Error('no loopback audio track');

  const ctx = new AudioContext({ sampleRate: 48000 });
  const src = ctx.createMediaStreamSource(new MediaStream(audio));
  const node = ctx.createScriptProcessor(2048, 2, 2);
  node.onaudioprocess = (e) => {
    const l = e.inputBuffer.getChannelData(0);
    const r = e.inputBuffer.numberOfChannels > 1 ? e.inputBuffer.getChannelData(1) : l;
    const out = new Float32Array(l.length * 2);
    for (let i = 0, j = 0; i < l.length; i++) { out[j++] = l[i]; out[j++] = r[i]; }
    window.api.sysAudio(out.buffer);
  };
  src.connect(node);
  node.connect(ctx.destination);                              // the processor outputs silence; this just keeps the graph running
})().catch((e) => console.error('sysaudio:', e && e.message ? e.message : e));
