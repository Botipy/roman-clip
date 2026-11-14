const $ = (id) => document.getElementById(id);
const fields = ['seconds', 'afterSeconds', 'fps', 'height', 'quality', 'encoder', 'monitor', 'audioDevice',
  'voicePhrase', 'micId', 'voiceEnabled', 'sound', 'notify', 'autostart'];
const numeric = new Set(['seconds', 'afterSeconds', 'fps', 'height', 'monitor']);

function fillSelect(el, items, current, firstLabel) {
  el.innerHTML = '';
  if (firstLabel !== undefined) el.add(new Option(firstLabel, ''));
  items.forEach(([v, t]) => el.add(new Option(t, v)));
  el.value = current;
}

function renderStatus(s) {
  const pill = $('state');
  if (s.error) { pill.textContent = 'Błąd: ' + s.error; pill.className = 'pill err'; }
  else if (s.paused) { pill.textContent = 'Wstrzymany'; pill.className = 'pill'; }
  else if (s.running) { pill.textContent = `Nagrywa · ${s.encoder}`; pill.className = 'pill on'; }
  else { pill.textContent = 'Uruchamianie…'; pill.className = 'pill'; }
  $('hotkeyMsg').textContent = s.hotkeyOk ? '' : 'Ten skrót jest zajęty lub nieprawidłowy, wybierz inny.';
  const m = s.model, bar = $('modelBar').parentElement;
  $('modelBtn').style.display = m.ready ? 'none' : '';
  $('modelBtn').disabled = m.progress !== null;
  bar.style.display = m.progress !== null ? 'block' : 'none';
  $('modelBar').style.width = (m.progress || 0) + '%';
  $('modelMsg').textContent = m.ready ? 'Model głosowy gotowy.' : (m.error ? 'Błąd pobierania: ' + m.error : (m.progress !== null ? 'Pobieranie…' : ''));
}

(async () => {
  const { settings, status } = await window.api.get();
  const [devices, displays] = await Promise.all([window.api.audioDevices(), window.api.displays()]);
  fillSelect($('audioDevice'), devices.map((d) => [d, d]), settings.audioDevice, 'Bez dźwięku');
  fillSelect($('monitor'), displays.map((d, i) => [i, d]), settings.monitor);
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => s.getTracks().forEach((t) => t.stop()));
    const mics = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
    fillSelect($('micId'), mics.map((d) => [d.deviceId, d.label || 'Mikrofon']), settings.micId, 'Domyślny');
  } catch { fillSelect($('micId'), [], '', 'Domyślny'); }

  for (const f of fields) {
    const el = $(f);
    if (el.type === 'checkbox') el.checked = settings[f]; else el.value = settings[f];
    el.addEventListener('change', () => {
      const v = el.type === 'checkbox' ? el.checked : numeric.has(f) ? Number(el.value) : el.value;
      window.api.set({ [f]: v });
    });
  }
  $('hotkey').value = settings.hotkey;
  $('outputDir').value = settings.outputDir;
  renderStatus(status);
  window.api.onStatus(renderStatus);
})();

// Skrót: klik w pole i naciśnięcie kombinacji
$('hotkey').addEventListener('keydown', (e) => {
  e.preventDefault();
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
  const parts = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Super');
  let key = e.key.length === 1 ? e.key.toUpperCase() : e.key.replace('Arrow', '');
  if (key === ' ') key = 'Space';
  parts.push(key);
  $('hotkey').value = parts.join('+');
  window.api.set({ hotkey: $('hotkey').value });
});

$('clipNow').onclick = () => window.api.clip();
$('modelBtn').onclick = () => window.api.downloadModel();
$('open').onclick = () => window.api.openDir();
$('pick').onclick = async () => {
  const dir = await window.api.pickDir();
  if (dir) { $('outputDir').value = dir; window.api.set({ outputDir: dir }); }
};
