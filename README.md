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


## Preview / Program transitions (BETA v0.4.0)
- New clips, grid launches, layer edits and visual settings are staged in Preview. Program remains unchanged until a transition is performed.
- Use the **Übergang** button for an animated take, or scrub the transition slider manually.
- Transition styles: Crossfade, Dip to Black, Wipe, Push and Zoom; duration is adjustable.
- The Program output and any external output window show only the Program composition, not uncommitted Preview edits.

## OpenVJ-style Layer / Clip Grid (BETA v0.3.0)
- The Clip Grid is arranged as rows (layers) and columns (clip slots).
- Importing media creates a new layer. Multiple clips can be assigned to the same layer by selecting a clip in the media library and tapping an empty slot, or dragging it into a slot.
- Clicking a filled slot launches that clip on its layer; right-click selects it for Preview without launching.
- Clicking a column header, or pressing 1–9, launches that column across all layers. Empty slots clear that layer for the selected column.
- Add columns with “+ Spalte”. Layers can be reordered, resized and controlled with shared visibility, solo, opacity, blend mode and deck assignment.
- Newly imported layers default to Deck A so clips are composited on top of one another by default. Assign layers to Deck B to use the crossfader.
- Local media remains in the browser; project metadata remembers layer/column placement, but media files must be selected again after a reload.
- This is a browser-oriented implementation of the OpenVJ clip-grid workflow, not a complete port of every native OpenVJ feature (e.g. native layer groups/effect chains and deck tabs).
