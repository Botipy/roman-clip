# Roman Clip

Lekkie narzędzie do klipowania ekranu na Windowsie. Działa w zasobniku i cały czas trzyma bufor ostatnich
sekund obrazu. Klip zapisujesz **skrótem klawiszowym** albo **komendą głosową** (offline), a plik ląduje od razu
w folderze, bez ponownego kodowania.

## Instalacja

1. W zakładce **Releases** pobierz `Roman-Clip-Setup-x.y.z.exe` i uruchom.
2. Windows SmartScreen może ostrzec, bo plik nie jest podpisany: **Więcej informacji → Uruchom mimo to**.
3. Appka startuje w zasobniku. Kliknij ikonę, żeby otworzyć ustawienia.

## Ustawienia

| Opcja | Opis |
| --- | --- |
| Długość klipu | ile sekund wstecz trafia do klipu (5 do 300) |
| Sekundy po wywołaniu | dopisuje do klipu to, co dzieje się tuż po skrócie |
| FPS / rozdzielczość / jakość | 24 do 120 klatek, natywna do 480p, 4 poziomy jakości |
| Enkoder | auto (NVENC / AMF / QSV), albo procesor (x264) |
| Ekran | który monitor nagrywać |
| Dźwięk | mikrofon lub „Stereo Mix” (dźwięk systemowy) |
| Skrót | domyślnie `Alt+F10` |
| Komenda głosowa | własna fraza, rozpoznawana offline (model pobierany raz, ok. 50 MB) |

## Rozwój

```bash
npm install
npm start          # uruchom
npm run dist       # zbuduj instalator do dist/
```

Wydanie: tag `vX.Y.Z` odpala GitHub Actions, które budują instalator i dodają go do Releases.

## Licencja

MIT
