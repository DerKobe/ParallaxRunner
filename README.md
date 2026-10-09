# Parallax Runner

Multiplayer-Jump'n'Run im Retro-Cyberpunk-Look: 2D-Gameplay, plastisch in 3D gerendert (three.js) mit Pixel-Art-Postprocessing.
Alle anderen Spieler laufen live in eigenen Bahnen **hinter** dir. Die Bahnen liegen direkt aneinander und bilden eine zusammenhängende Ebene (gleiche Strecke, gleiche Höhe, gemeinsame Kamera) – jeder Runner ist an seiner echten Position zu sehen. Wer außerhalb des Bildes ist, wird am Rand mit Abstand angezeigt; im Menü schneidet eine Regie-Kamera zwischen den Live-Runs.

## Start

```bash
npm install
npm start          # http://localhost:3000
```

Optional: `SEED=1234 npm start` für eine feste Strecke, `PORT=8080` für einen anderen Port.
Zum Ausprobieren ohne Mitspieler: `npm run bots` verbindet drei Demo-Runner.

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
- `public/js/player.js` – Tile-Physik: Coyote-Time, Jump-Buffer, variable Sprunghöhe, Double-Jump, Wall-Slide/-Jump, Slide mit Kriechen unter niedrigen Decken.
- `public/js/world.js` – three.js-Darstellung: geteilte Chunk-Geometrie, eine `Lane` pro Spieler (Ein-/Wegfall-Animation), Skyline-Parallax, Regen, Spinner, Pixel-Postprocessing (Low-Res, Dithering, Bloom, Scanlines, Glitch).
- `public/js/textures.js` – sämtliche Pixel-Art wird zur Laufzeit generiert (Tiles, Runner-Spritesheet, Skyline).
- `tools/bots.js` – Demo-Bots für Tests.
