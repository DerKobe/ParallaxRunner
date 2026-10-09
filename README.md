# Parallax Runner

Multiplayer-Jump'n'Run im Retro-Cyberpunk-Look: 2D-Gameplay, plastisch in 3D gerendert (three.js) mit Pixel-Art-Postprocessing.
Alle anderen Spieler laufen live in eigenen Bahnen **hinter** dir. Die Bahnen liegen direkt aneinander und bilden eine zusammenhängende Ebene (gleiche Strecke, gleiche Höhe, gemeinsame Kamera) – jeder Runner ist an seiner echten Position zu sehen. Wer außerhalb des Bildes ist, wird am Rand mit Abstand angezeigt; im Menü schneidet eine Regie-Kamera zwischen den Live-Runs.

**Sichtfenster:** Jeder Spieler bekommt vom Server die 4 Spieler vor und die 4 nach ihm (in Beitrittsreihenfolge) – am Anfang/Ende der Liste entsprechend mehr von der anderen Seite. So hat jeder einen „virtuellen Raum“ mit fließenden Grenzen, und der Traffic wächst nur linear mit der Spielerzahl. Verlässt ein Spieler das Spiel (Disconnect, Menü, Timeout), fällt seine Bahn weg; rutscht er nur aus deinem Fenster, sinkt sie ruhig ab.

**Patrouillen:** Drei Gegnertypen bewachen kurze Abschnitte, Berührung ist tödlich: der **Crawler** (Spinnen-Drohne, läuft am Boden hin und her → drüberspringen), die **Sentry** (Schwebemine, fährt hoch und runter → durch, wenn sie oben ist), der **Hover-Cop** (Polizei-Gleiter auf Brusthöhe in einem niedrigen Tunnel → nur per Slide drunter durch). Ihre Bewegung hängt nur von der Server-Uhr ab, deshalb sehen alle Clients sie synchron ohne zusätzlichen Netzwerkverkehr. Mit der Distanz werden sie schneller und häufiger.

**Streckenmarker:** Wo Runner sterben, erscheinen Neonkreuze auf der Strecke (nur in der vordersten Bahn). Tode nahe beieinander werden zu einem Kreuz mit Zähler (×N) zusammengefasst. Jeder Spieler hat genau einen Marker mit Namen an seiner Bestmarke (ab 20 m); dicht beieinander liegende Bestmarken teilen sich ein Schild (+N), Tode direkt daneben erscheinen dort als ☠N. Höchstens 250 Marker pro Strecke (`MAX_MARKERS`) – namenlose fliegen zuerst raus (wenigste Tode, älteste zuerst). Gespeichert in `data/markers.json`.

**Stalker:** Jeder Runner wird von einer Jäger-Drohne verfolgt, die exakt seine eigene Route mit Zeitversatz abfliegt (4,5 s am Start, schrumpft mit der Distanz bis 2,5 s). Wer zu lange stehen bleibt oder umkehrt, wird eingeholt und stirbt. Wer dreimal am Start erwischt wird, ohne sich zu bewegen, fliegt aus der Sendung. Sendet ein Client gar nichts mehr (z. B. inaktiver Tab), beendet der Server den Lauf nach 5 s (`STALE_TIMEOUT_MS`).

## Start

```bash
npm install
npm start          # http://localhost:3000
```

Optional: `SEED=1234 npm start` für eine feste Strecke, `PORT=8080` für einen anderen Port.
### Testen mit Bots

```bash
npm run demo        # Server + 6 Bots in einem Rutsch
npm run bots        # 5 Bots zu einem bereits laufenden Server hinzufügen
```

Eigene Anzahl: `node server.js --bots 10` bzw. `node tools/bots.js 8 --url ws://host:port/ws`.

Die Bots spielen wirklich: gleiche Strecke, Physik und Stalker wie Menschen. Alle 0,1 s spielen sie ein paar zufällige Eingabefolgen ~1 s voraus durch und nehmen die beste (`tools/botbrain.js`). Ihr Können ist über die Bots verteilt – vom tollpatschigen Bot, der oft stirbt und zögert, bis zum Profi, der Kamine hochklettert und mit fast Höchsttempo läuft. Rechenlast: ca. 17 % eines CPU-Kerns für Server + 6 Bots.

## Deployment auf Dokku

Das Repo enthält alles für einen Push-Deploy: `Dockerfile` (Node 24, nur Produktions-Abhängigkeiten, läuft als `node`-User auf Port 3000), `.dockerignore`, `CHECKS` (Healthcheck auf `/api/status`, bevor Dokku umschaltet – das Format, das auch ältere Dokku-Versionen wie 0.24 verstehen) und `app.json` (genau **eine** Web-Instanz, weil der Spielzustand im Speicher liegt; Dokku ≥ 0.31 liest dort auch den Healthcheck). WebSockets laufen über Dokkus nginx ohne Zusatzkonfiguration; bei HTTPS verbindet sich der Client automatisch per `wss://`.

Einmalig auf dem Server (App-Name und Domain anpassen):

```bash
dokku apps:create parallax-runner
dokku domains:set parallax-runner runner.example.com
# Proxy auf den Container-Port 3000 (Dokku < 0.31: proxy:ports-set, neuere Versionen: ports:set)
dokku proxy:ports-set parallax-runner http:80:3000
# Hall of Fame + Streckenmarker überleben Deploys nur mit einem Volume
dokku storage:ensure-directory --chown heroku parallax-runner   # uid 1000 = node-User im Image
dokku storage:mount parallax-runner /var/lib/dokku/data/storage/parallax-runner:/app/data
# feste Strecke, damit Marker und Bestenliste nicht bei jedem Neustart neu beginnen (optional)
dokku config:set parallax-runner SEED=20491982
# HTTPS (optional, mit dem letsencrypt-Plugin)
dokku letsencrypt:set parallax-runner email you@example.com
dokku letsencrypt:enable parallax-runner
```

Lokal:

```bash
git remote add dokku dokku@<server>:parallax-runner
git push dokku master
```

Jeder weitere `git push dokku master` baut das Image neu und deployt. Laufende Spieler verlieren dabei kurz die Verbindung und verbinden sich automatisch neu; der Server speichert Bestenliste und Marker beim Herunterfahren (SIGTERM).

Umgebungsvariablen: `SEED` (feste Strecke), `DATA_DIR` (Datenverzeichnis, im Image `/app/data`), `MAX_MARKERS` (Standard 250), `STALE_TIMEOUT_MS` (Standard 5000).

## Steuerung

| Aktion | Tasten |
|---|---|
| Laufen | ← → / A D |
| Springen, Double-Jump (in der Luft nochmal), Wall-Jump (an einer Wand) | Space / ↑ / W |
| Rutschen (beim Laufen) | ↓ / S / Shift |
| Menü | Esc |
| Sound an/aus | M |

Gamepad wird unterstützt.

## Aufbau

- `server.js` – HTTP + WebSocket. Vergibt Seed, Farbe und Bahn-Reihenfolge, broadcastet 20×/s alle Runner-Zustände, führt die Hall of Fame (`data/halloffame.json`).
- `public/js/level.js` – deterministischer, prozeduraler Streckengenerator (Lücken, Treppen, Plattformen, Laserzäune, Billboards zum Drunterrutschen, Wall-Jump-Kamine). Schwierigkeit steigt mit der Distanz.
- `public/js/enemies.js` – Bewegung und Hitboxen der Patrouillen-Gegner (Funktion der gemeinsamen Uhr).
- `public/js/hunter.js` – der Stalker: fliegt die aufgezeichnete Route mit Zeitversatz nach.
- `public/js/player.js` – Tile-Physik: Coyote-Time, Jump-Buffer, variable Sprunghöhe, Double-Jump, Wall-Slide/-Jump, Slide mit Kriechen unter niedrigen Decken.
- `public/js/world.js` – three.js-Darstellung: geteilte Chunk-Geometrie, eine `Lane` pro Spieler (Ein-/Wegfall-Animation), Skyline-Parallax, Regen, Spinner, Pixel-Postprocessing (Low-Res, Dithering, Bloom, Scanlines, Glitch).
- `public/js/textures.js` – sämtliche Pixel-Art wird zur Laufzeit generiert (Tiles, Runner-Spritesheet, Skyline).
- `tools/bots.js`, `tools/botbrain.js` – spielende Test-Bots (siehe oben).

## Lizenz

[MIT](LICENSE). Verwendete Bibliotheken: [three.js](https://github.com/mrdoob/three.js) und [ws](https://github.com/websockets/ws) (beide MIT); die Schriften Press Start 2P und VT323 werden von Google Fonts geladen (SIL Open Font License).
