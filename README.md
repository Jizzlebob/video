# Video Mischpult

Eine einfache Browser-App zum Importieren und Mischen lokaler Videos mit Strobe- und Fisheye-Effekten sowie Audio-Visualizer und Mikrofonreaktion.

## Starten

Öffne die veröffentlichte GitHub-Pages-Seite oder starte die App über einen lokalen Webserver. Importiere Videos über **Videos importieren**. Für Mikrofonzugriff ist eine sichere Verbindung (HTTPS oder localhost) und die Browser-Berechtigung erforderlich.

GitHub Pages kann unter **Settings → Pages** aktiviert werden: **Deploy from a branch**, Branch `main`, Ordner `/(root)`.


## iPad- / Multi-Device-Fernsteuerung (lokales WLAN)

1. Installiere Node.js 18 oder neuer auf dem PC.
2. Lade das Repository herunter und entpacke es.
3. Starte im Projektordner npm install und danach npm start (Windows: run-server.bat doppelklicken).
4. Öffne am PC http://localhost:3000. Oben erscheint ein sechsstelliger Verbindungscode und die iPad-Adresse.
5. Öffne die angezeigte Adresse auf dem iPad (beide Geräte im selben WLAN), gib den Code ein und tippe auf Verbinden.

Mehrere Handys/Tablets können gleichzeitig verbunden sein. Änderungen werden sofort am PC und an allen verbundenen Geräten angezeigt. Videos bleiben lokal auf dem PC – das iPad steuert die dort geladenen Clips, überträgt aber keine Videodateien.
