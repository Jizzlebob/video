# VJ Studio — Beta

Browserbasierter Video-Mixer für lokale Videodateien mit Layern, Crossfader, Strobe, Fisheye, Look-Filtern, Chroma Key und Audio-Visualizer.

## Starten

Öffne die GitHub-Pages-Seite und importiere deine Videos über **Videos importieren**. Für Mikrofonzugriff ist HTTPS und die Browser-Berechtigung erforderlich.

Die Videodateien werden direkt im Browser verarbeitet und nicht auf einen Server hochgeladen. Projekte speichern nur Einstellungen und Clip-Zuordnungen. Nach einem Neuladen müssen die Videodateien erneut ausgewählt werden.

## Veröffentlichung

GitHub Pages wird unter **Settings → Pages** über **Deploy from a branch**, Branch `main`, Ordner `/(root)` veröffentlicht.

Die sichtbare Beta-Version steht oben in der App. Bei jedem Update wird die Versionsnummer erhöht und die Cache-Version der Dateien mitgezogen.


## Browser Engine (v0.2.0)
This browser build is an independent web implementation inspired by the feature set of [openVJ](https://github.com/cuteGHG/openvj). It adds browser-native image/video/camera sources, procedural generators, per-layer blend modes, beat-quantised playback controls, tap tempo and optional Web MIDI where the browser exposes it.

The browser build deliberately uses browser-native media decoding and Canvas compositing. Native-only features such as FFmpeg/DXV/HAP decoding, Syphon/Spout, system-level MIDI/OSC networking and Ableton Link UDP are not available in an ordinary GitHub Pages browser context. Web MIDI is browser/device dependent and may not be available on iPad Safari. Local media stays on the device.
