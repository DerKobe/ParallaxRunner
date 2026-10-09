# Parallax Runner

Multiplayer-Jump'n'Run im Retro-Cyberpunk-Look: 2D-Gameplay, plastisch in 3D gerendert (three.js) mit Pixel-Art-Postprocessing.
Alle anderen Spieler laufen live in eigenen Bahnen **hinter** dir. Die Bahnen liegen direkt aneinander und bilden eine zusammenhängende Ebene (gleiche Strecke, gleiche Höhe, gemeinsame Kamera) – jeder Runner ist an seiner echten Position zu sehen. Wer außerhalb des Bildes ist, wird am Rand mit Abstand angezeigt; im Menü schneidet eine Regie-Kamera zwischen den Live-Runs.

**Sichtfenster:** Jeder Spieler bekommt vom Server die 4 Spieler vor und die 4 nach ihm (in Beitrittsreihenfolge) – am Anfang/Ende der Liste entsprechend mehr von der anderen Seite. So hat jeder einen „virtuellen Raum“ mit fließenden Grenzen, und der Traffic wächst nur linear mit der Spielerzahl. Verlässt ein Spieler das Spiel (Disconnect, Menü, Timeout), fällt seine Bahn weg; rutscht er nur aus deinem Fenster, sinkt sie ruhig ab.

**Stalker:** Jeder Runner wird von einer Jäger-Drohne verfolgt, die exakt seine eigene Route mit Zeitversatz abfliegt (4,5 s am Start, schrumpft mit der Distanz bis 2,5 s). Wer zu lange stehen bleibt oder umkehrt, wird eingeholt und stirbt. Wer dreimal am Start erwischt wird, ohne sich zu bewegen, fliegt aus der Sendung. Sendet ein Client gar nichts mehr (z. B. inaktiver Tab), beendet der Server den Lauf nach 5 s (`STALE_TIMEOUT_MS`).

**Zap:** Mit F/X schießt du gerade in die Tiefe durch die Bahnen hinter dir. Der erste Runner oder Stalker auf deiner Position wird getroffen: Ein Runner ist 1 s KO (über einem Abgrund stürzt er ab), ein Stalker stürzt ab und wird nach 3 s ersetzt – der neue folgt mit 3 s mehr Abstand, dieser Vorsprung bleibt bis zum nächsten Tod (mehrere Abschüsse addieren sich). Abklingzeit 1,5 s.

## Start

```bash
npm install
npm start          # http://localhost:3000
```

Optional: `SEED=1234 npm start` für eine feste Strecke, `PORT=8080` für einen anderen Port.
### Testen mit Bots

```bash
npm run demo        # Server + 6 Bots in einem Rutsch
npm run demo:zap    # dasselbe, Bots schießen auch (auf Nachbarn und deren Stalker)
npm run bots        # 5 Bots zu einem bereits laufenden Server hinzufügen
```

Eigene Anzahl: `node server.js --bots 10 --zap` bzw. `node tools/bots.js 8 --zap --url ws://host:port/ws`.

Die Bots spielen wirklich: gleiche Strecke, Physik und Stalker wie Menschen. Alle 0,1 s spielen sie ein paar zufällige Eingabefolgen ~1 s voraus durch und nehmen die beste (`tools/botbrain.js`). Ihr Können ist über die Bots verteilt – vom tollpatschigen Bot, der oft stirbt und zögert, bis zum Profi, der Kamine hochklettert und mit fast Höchsttempo läuft. Rechenlast: ca. 17 % eines CPU-Kerns für Server + 6 Bots.

## Steuerung

| Aktion | Tasten |
|---|---|
| Laufen | ← → / A D |
| Springen, Double-Jump (in der Luft nochmal), Wall-Jump (an einer Wand) | Space / ↑ / W |
| Rutschen (beim Laufen) | ↓ / S / Shift |
| Zap (in die Bahnen hinter dir) | F / X |
| Menü | Esc |
| Sound an/aus | M |

Gamepad wird unterstützt.

## Aufbau

- `server.js` – HTTP + WebSocket. Vergibt Seed, Farbe und Bahn-Reihenfolge, broadcastet 20×/s alle Runner-Zustände, führt die Hall of Fame (`data/halloffame.json`).
- `public/js/level.js` – deterministischer, prozeduraler Streckengenerator (Lücken, Treppen, Plattformen, Laserzäune, Billboards zum Drunterrutschen, Wall-Jump-Kamine). Schwierigkeit steigt mit der Distanz.
- `public/js/hunter.js` – der Stalker: fliegt die aufgezeichnete Route mit Zeitversatz nach.
- `public/js/player.js` – Tile-Physik: Coyote-Time, Jump-Buffer, variable Sprunghöhe, Double-Jump, Wall-Slide/-Jump, Slide mit Kriechen unter niedrigen Decken.
- `public/js/world.js` – three.js-Darstellung: geteilte Chunk-Geometrie, eine `Lane` pro Spieler (Ein-/Wegfall-Animation), Skyline-Parallax, Regen, Spinner, Pixel-Postprocessing (Low-Res, Dithering, Bloom, Scanlines, Glitch).
- `public/js/textures.js` – sämtliche Pixel-Art wird zur Laufzeit generiert (Tiles, Runner-Spritesheet, Skyline).
- `tools/bots.js`, `tools/botbrain.js` – spielende Test-Bots (siehe oben).
