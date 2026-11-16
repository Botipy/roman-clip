// Translations (English is the default and the fallback). Shared by the renderer (global STRINGS) and main (require).
// Placeholders: {name}. Keys starting with "html_" may contain markup and are applied with innerHTML.
(function (root, factory) {
  const s = factory();
  if (typeof module === 'object' && module.exports) module.exports = s; else root.STRINGS = s;
})(typeof self !== 'undefined' ? self : this, function () {
  const en = {
    // titlebar / HUD
    tbMin: 'Minimize', tbClose: 'Close to tray',
    saveClip: 'SAVE CLIP', pause: 'PAUSE', resume: 'RESUME',
    pausedBanner: 'RECORDING PAUSED // THE APP IS NOT RECORDING YOUR SCREEN',
    stRec: 'RECORDING', stPaused: 'PAUSED', stStarting: 'STARTING…', stError: 'ERROR: {e}',
    tagDda: 'DESKTOP DUPLICATION', tagGdi: 'GDI', tagNative: 'NATIVE', tagBuffer: '{t} BUFFER', tagAudio: 'AUDIO', tagVoice: 'VOICE: “{p}”',
    // updates
    updDev: 'DEVELOPMENT BUILD (NO UPDATES)', updIdle: 'UPDATES: NOT CHECKED YET', updChecking: 'CHECKING FOR UPDATES…',
    updLatest: 'YOU HAVE THE LATEST VERSION', updDownloading: 'DOWNLOADING {v} ({p}%)…', updNewVersion: 'NEW VERSION',
    updReady: 'VERSION {v} READY, INSTALLS WHEN YOU QUIT', updError: 'COULD NOT CHECK: {e}',
    updCheck: 'Check for updates', updInstall: 'Install & restart',
    // tabs
    tabSettings: 'SETTINGS', tabClips: 'CLIPS',
    // card 01
    c1: 'CLIP', lblLength: 'Clip length', lblAfter: 'Record after trigger', lblFps: 'Frames per second', lblRes: 'Resolution',
    resNative: 'NATIVE', lblQuality: 'Quality', qLow: 'LOW', qMed: 'MEDIUM', qHigh: 'HIGH', qMax: 'MAX',
    lblCodec: 'Codec', codecH265: 'H.265 (SMALLER)',
    est1: 'UPPER LIMIT OF CLIP SIZE: <b>~{mb} MB</b> at {w}×{h}, {fps} FPS',
    est2: 'In practice usually several times less (calm picture). Bitrate cap: {mbps} Mb/s.',
    hint1: 'Native resolution runs entirely on the GPU and barely touches the CPU. Downscaling is done on the CPU. H.265 makes files about 30–40% smaller, but some apps (e.g. Discord previews) cannot play it.',
    // card 02
    c2: 'SOURCE', lblMonitor: 'Display', lblCapture: 'Capture', capAuto: 'Auto (recommended, works in games)', capDda: 'Desktop Duplication (games)',
    capGdi: 'GDI (compatibility, no games)', lblEncoder: 'Encoder', encAuto: 'Auto (GPU if available)', encNvenc: 'NVIDIA (NVENC)',
    encAmf: 'AMD (AMF)', encQsv: 'Intel (QSV)', encX264: 'CPU (x264)', togSysAudio: 'System audio (game, music, chat)', lblAudio: 'Microphone in clips', noAudio: 'Off',
    display: 'Display {n} ({w}x{h})',
    hint2: 'For a game (e.g. Valorant) pick the display it runs on. Borderless or regular fullscreen works best. If the game changes resolution, recording restarts by itself. System audio is captured automatically; add a microphone if you also want your own voice in the clips.',
    // card 03
    c3: 'TRIGGER', lblHotkey: 'Hotkey', hkChange: 'CHANGE', hkCancel: 'CANCEL', hkPress: 'PRESS KEYS…',
    hkBad: 'This shortcut is taken or invalid, pick another one.',
    togVoice: 'Voice command', lblPhrase: 'Phrase', phPhrase: 'e.g. clip', lblMic: 'Microphone', micDefault: 'Default',
    modelBtn: 'DOWNLOAD VOICE MODEL (~{mb} MB, ONCE)', modelReady: 'Voice model ready.', modelErr: 'Download error: {e}', modelDl: 'Downloading…',
    hint3: 'Recognition runs offline with a small model for your language. The phrase must be a common word the model knows.',
    // card 04
    c4: 'FILES & SYSTEM', lblFolder: 'Clips folder', btnChange: 'CHANGE', togSound: 'Sound after saving a clip',
    togNotify: 'Notification after saving', togAutostart: 'Start with Windows', lblLang: 'Language',
    // clips
    clipsTitle: 'SAVED CLIPS', refresh: 'REFRESH', openFolder: 'OPEN FOLDER',
    emptyTitle: 'NO CLIPS YET', html_emptyText: 'Press <kbd class="hkLive"></kbd> or say your phrase and the clip will show up here.',
    actFolder: 'SHOW IN FOLDER', actOpen: 'SYSTEM PLAYER', actDelete: 'DELETE', actConfirm: 'CONFIRM DELETE',
    vErrTitle: 'CANNOT PLAY THIS CLIP HERE', vErrText: 'It is probably H.265 and this GPU cannot decode it inside the app.',
    vErrOpen: 'OPEN IN SYSTEM PLAYER', ttPlay: 'Play / pause', ttBack: 'Back 5 s (←)', ttFwd: 'Forward 5 s (→)', ttSpeed: 'Speed',
    ttMute: 'Mute', ttVol: 'Volume', ttFull: 'Fullscreen (F)',
    agoNow: 'just now', agoMin: '{n} min ago', agoHour: '{n} h ago', agoDay: '{n} d ago',
    toastSaved: 'CLIP SAVED', toastTrashed: 'CLIP MOVED TO THE RECYCLE BIN', toastSetFail: 'COULD NOT SAVE THE SETTING',
    // file naming + tray / notifications (main process)
    clipPrefix: 'Clip',
    trSave: 'Save clip now', trSettings: 'Settings', trFolder: 'Open clips folder', trPause: 'Pause recording', trResume: 'Resume recording',
    trCheck: 'Check for updates', trInstall: 'Install update {v} and restart', trQuit: 'Quit', trPausedTip: 'Roman Clip (paused)',
    nPausedTitle: 'Roman Clip is paused', nPausedBody: 'The app is not recording, so there is nothing to save. Resume recording first.',
    nSavedTitle: 'Clip saved', srcHotkey: 'hotkey', srcMenu: 'tray menu', srcButton: 'button', srcVoice: 'voice',
    nFailTitle: 'Could not save the clip', errEmptyBuffer: 'The buffer is still empty (e.g. right after a game changed resolution). Wait a moment.',
    nUpdTitle: 'Roman Clip: update ready', nUpdBody: 'Version {v} will install when you quit the app.',
  };

  const pl = {
    tbMin: 'Minimalizuj', tbClose: 'Zamknij do zasobnika',
    saveClip: 'ZAPISZ KLIP', pause: 'PAUZA', resume: 'WZNÓW',
    pausedBanner: 'NAGRYWANIE WSTRZYMANE // PROGRAM NIE NAGRYWA EKRANU',
    stRec: 'NAGRYWA', stPaused: 'WSTRZYMANY', stStarting: 'START…', stError: 'BŁĄD: {e}',
    tagDda: 'DESKTOP DUPLICATION', tagGdi: 'GDI', tagNative: 'NATYWNA', tagBuffer: '{t} BUFORA', tagAudio: 'DŹWIĘK', tagVoice: 'GŁOS: „{p}”',
    updDev: 'WERSJA DEWELOPERSKA (BEZ AKTUALIZACJI)', updIdle: 'AKTUALIZACJE: JESZCZE NIE SPRAWDZANO', updChecking: 'SPRAWDZAM AKTUALIZACJE…',
    updLatest: 'MASZ NAJNOWSZĄ WERSJĘ', updDownloading: 'POBIERAM {v} ({p}%)…', updNewVersion: 'NOWĄ WERSJĘ',
    updReady: 'GOTOWA WERSJA {v}, ZAINSTALUJE SIĘ PO ZAMKNIĘCIU', updError: 'NIE UDAŁO SIĘ SPRAWDZIĆ: {e}',
    updCheck: 'Sprawdź aktualizacje', updInstall: 'Zainstaluj i zrestartuj',
    tabSettings: 'USTAWIENIA', tabClips: 'KLIPY',
    c1: 'KLIP', lblLength: 'Długość klipu', lblAfter: 'Dogranie po wywołaniu', lblFps: 'Klatki na sekundę', lblRes: 'Rozdzielczość',
    resNative: 'NATYWNA', lblQuality: 'Jakość', qLow: 'NISKA', qMed: 'ŚREDNIA', qHigh: 'WYSOKA', qMax: 'MAX',
    lblCodec: 'Kodek', codecH265: 'H.265 (MNIEJSZY)',
    est1: 'GÓRNA GRANICA ROZMIARU KLIPU: <b>~{mb} MB</b> przy {w}×{h}, {fps} FPS',
    est2: 'W praktyce zwykle kilka razy mniej (spokojny obraz). Limit prędkości: {mbps} Mb/s.',
    hint1: 'Natywna rozdzielczość działa w całości na GPU i prawie nie obciąża procesora. Zmniejszanie rozdzielczości liczy się na CPU. H.265 daje plik o ok. 30–40% mniejszy, ale część programów (np. podgląd w Discordzie) go nie odtworzy.',
    c2: 'ŹRÓDŁO', lblMonitor: 'Ekran', lblCapture: 'Przechwytywanie', capAuto: 'Auto (zalecane, działa w grach)', capDda: 'Desktop Duplication (gry)',
    capGdi: 'GDI (zgodność, nie łapie gier)', lblEncoder: 'Enkoder', encAuto: 'Auto (GPU, jeśli jest)', encNvenc: 'NVIDIA (NVENC)',
    encAmf: 'AMD (AMF)', encQsv: 'Intel (QSV)', encX264: 'Procesor (x264)', togSysAudio: 'Dźwięk systemowy (gra, muzyka, czat)', lblAudio: 'Mikrofon w klipie', noAudio: 'Wyłączony',
    display: 'Ekran {n} ({w}x{h})',
    hint2: 'Gra (np. Valorant): wybierz ekran, na którym działa. Najlepiej pełny ekran okienkowy lub zwykły pełny ekran. Po zmianie rozdzielczości przez grę nagrywanie samo się restartuje. Dźwięk systemowy nagrywa się automatycznie; dodaj mikrofon, jeśli w klipach ma być też Twój głos.',
    c3: 'WYWOŁANIE', lblHotkey: 'Skrót klawiszowy', hkChange: 'ZMIEŃ', hkCancel: 'ANULUJ', hkPress: 'NACIŚNIJ KOMBINACJĘ…',
    hkBad: 'Ten skrót jest zajęty lub nieprawidłowy, wybierz inny.',
    togVoice: 'Komenda głosowa', lblPhrase: 'Fraza', phPhrase: 'np. klip', lblMic: 'Mikrofon', micDefault: 'Domyślny',
    modelBtn: 'POBIERZ MODEL GŁOSOWY (OK. {mb} MB, RAZ)', modelReady: 'Model głosowy gotowy.', modelErr: 'Błąd pobierania: {e}', modelDl: 'Pobieranie…',
    hint3: 'Rozpoznawanie działa offline na małym modelu dla Twojego języka. Fraza musi być zwykłym słowem znanym modelowi.',
    c4: 'PLIKI I SYSTEM', lblFolder: 'Folder klipów', btnChange: 'ZMIEŃ', togSound: 'Dźwięk po zapisaniu klipu',
    togNotify: 'Powiadomienie po zapisaniu', togAutostart: 'Uruchamiaj z Windowsem', lblLang: 'Język',
    clipsTitle: 'ZAPISANE KLIPY', refresh: 'ODŚWIEŻ', openFolder: 'OTWÓRZ FOLDER',
    emptyTitle: 'BRAK KLIPÓW', html_emptyText: 'Naciśnij <kbd class="hkLive"></kbd> albo powiedz frazę, a klip pojawi się tutaj.',
    actFolder: 'POKAŻ W FOLDERZE', actOpen: 'ODTWARZACZ SYSTEMOWY', actDelete: 'USUŃ', actConfirm: 'POTWIERDŹ USUNIĘCIE',
    vErrTitle: 'NIE MOGĘ ODTWORZYĆ TEGO KLIPU TUTAJ', vErrText: 'Prawdopodobnie jest w H.265, a ta karta graficzna go nie dekoduje w programie.',
    vErrOpen: 'OTWÓRZ W ODTWARZACZU SYSTEMOWYM', ttPlay: 'Odtwórz / pauza', ttBack: 'Cofnij 5 s (←)', ttFwd: 'Do przodu 5 s (→)', ttSpeed: 'Prędkość',
    ttMute: 'Wycisz', ttVol: 'Głośność', ttFull: 'Pełny ekran (F)',
    agoNow: 'przed chwilą', agoMin: '{n} min temu', agoHour: '{n} godz. temu', agoDay: '{n} dn. temu',
    toastSaved: 'ZAPISANO KLIP', toastTrashed: 'KLIP PRZENIESIONY DO KOSZA', toastSetFail: 'NIE UDAŁO SIĘ ZAPISAĆ USTAWIENIA',
    clipPrefix: 'Klip',
    trSave: 'Zapisz klip teraz', trSettings: 'Ustawienia', trFolder: 'Otwórz folder z klipami', trPause: 'Wstrzymaj nagrywanie', trResume: 'Wznów nagrywanie',
    trCheck: 'Sprawdź aktualizacje', trInstall: 'Zainstaluj aktualizację {v} i zrestartuj', trQuit: 'Wyjdź', trPausedTip: 'Roman Clip (wstrzymany)',
    nPausedTitle: 'Roman Clip jest wstrzymany', nPausedBody: 'Program nie nagrywa, więc nie ma czego zapisać. Najpierw wznów nagrywanie.',
    nSavedTitle: 'Zapisano klip', srcHotkey: 'skrót', srcMenu: 'menu', srcButton: 'przycisk', srcVoice: 'głos',
    nFailTitle: 'Nie udało się zapisać klipu', errEmptyBuffer: 'Bufor jest jeszcze pusty (np. zaraz po zmianie rozdzielczości przez grę). Poczekaj chwilę.',
    nUpdTitle: 'Roman Clip: aktualizacja gotowa', nUpdBody: 'Wersja {v} zainstaluje się po zamknięciu programu.',
  };

  return { en, pl };
});
