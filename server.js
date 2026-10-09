// Parallax Runner – game server
// Serves the static client and relays live run states between all connected clients.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const THREE_DIR = path.join(__dirname, 'node_modules', 'three', 'build');
const DATA_DIR = path.join(__dirname, 'data');
const HOF_FILE = path.join(DATA_DIR, 'halloffame.json');

// One shared course for everybody on this server. Override with SEED=1234 for a fixed track.
const SEED = Number(process.env.SEED) || ((Math.random() * 2 ** 31) | 0);
const TICK_HZ = 20;
const MAX_SPEED = 16; // tiles/s, generous upper bound used for plausibility checks
const VIEW_SIDE = 4;  // each runner receives the 4 runners before and after them (by join order)
const VIEW_SIZE = VIEW_SIDE * 2 + 1;
// Standing still is punished in the game world by the Stalker. This only catches frozen clients
// (e.g. a hidden tab stops sending): no state update for this long → run ends.
const STALE_TIMEOUT = Number(process.env.STALE_TIMEOUT_MS) || 5_000;
const HUNTER = { CHASE: 0, NONE: 1 };

const COLORS = ['#ff2a6d', '#05d9e8', '#f9c80e', '#7b61ff', '#39ff14', '#ff8c00', '#ff00ff', '#00ffc6', '#ff4040', '#4da6ff'];

// ---------------------------------------------------------------- static files
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serveFile(res, root, rel) {
  const file = path.normalize(path.join(root, rel));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'content-type': 'text/plain' }).end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (url.startsWith('/vendor/three/')) return serveFile(res, THREE_DIR, url.slice('/vendor/three/'.length));
  if (url === '/api/status') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ seed: SEED, players: [...clients.values()].filter(c => c.mode === 'play').length }));
    return;
  }
  serveFile(res, PUBLIC_DIR, url === '/' ? 'index.html' : url);
});

// ---------------------------------------------------------------- hall of fame
let hallOfFame = [];
try { hallOfFame = JSON.parse(fs.readFileSync(HOF_FILE, 'utf8')).filter(e => e.seed === SEED); } catch { /* fresh start */ }
let hofDirty = false;
function recordScore(name, dist) {
  if (dist < 10) return false;
  const prev = hallOfFame.find(e => e.name === name);
  if (prev && prev.dist >= dist) return false;
  if (prev) { prev.dist = dist; prev.at = Date.now(); }
  else hallOfFame.push({ name, dist, at: Date.now(), seed: SEED });
  hallOfFame.sort((a, b) => b.dist - a.dist);
  hallOfFame = hallOfFame.slice(0, 10);
  hofDirty = true;
  return hallOfFame.some(e => e.name === name);
}
setInterval(() => {
  if (!hofDirty) return;
  hofDirty = false;
  fs.mkdir(DATA_DIR, { recursive: true }, () => fs.writeFile(HOF_FILE, JSON.stringify(hallOfFame, null, 1), () => {}));
}, 5000);

// ---------------------------------------------------------------- realtime
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
const clients = new Map(); // id -> client
let nextId = 1;
let joinCounter = 0;
let colorCursor = 0;

function send(ws, msg) { if (ws.readyState === 1) ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); }
function broadcast(msg) { const s = JSON.stringify(msg); for (const c of clients.values()) send(c.ws, s); }

function roster() {
  return [...clients.values()]
    .filter(c => c.mode === 'play')
    .sort((a, b) => a.order - b.order)
    .map(c => ({ id: c.id, name: c.name, color: c.color, best: c.best, deaths: c.deaths }));
}
function broadcastRoster() { broadcast({ t: 'roster', players: roster(), hof: hallOfFame.map(({ name, dist }) => ({ name, dist })) }); }

function cleanName(n) {
  const s = String(n ?? '').replace(/[^\p{L}\p{N} _\-.]/gu, '').trim().slice(0, 14);
  return s || 'RUNNER-' + Math.floor(1000 + Math.random() * 9000);
}
const num = (v, lo, hi) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo);

wss.on('connection', (ws) => {
  const c = {
    id: nextId++, ws, mode: 'spectate', name: '', color: COLORS[colorCursor++ % COLORS.length], order: 0,
    x: 0, y: 0, anim: 0, facing: 1, best: 0, deaths: 0, runStart: Date.now(), msgBudget: 60,
    lastStateAt: Date.now(), watch: null, viewKey: '',
    hx: 0, hy: 0, hs: HUNTER.NONE,
  };
  clients.set(c.id, c);
  send(ws, { t: 'welcome', id: c.id, seed: SEED, color: c.color, tick: TICK_HZ });
  send(ws, { t: 'roster', players: roster(), hof: hallOfFame.map(({ name, dist }) => ({ name, dist })) });

  ws.on('message', (raw) => {
    if (--c.msgBudget < 0) return; // simple flood guard, refilled every second
    let m; try { m = JSON.parse(raw); } catch { return; }
    switch (m.t) {
      case 'start':
        c.name = cleanName(m.name);
        c.mode = 'play';
        c.order = ++joinCounter;
        c.x = 0; c.y = 0; c.best = 0; c.deaths = 0; c.runStart = Date.now(); c.lastStateAt = Date.now();
        c.hs = HUNTER.NONE;
        broadcastRoster();
        break;
      case 'menu':
        if (c.mode !== 'play') break;
        c.mode = 'spectate';
        broadcastRoster();
        break;
      case 's': { // state update
        if (c.mode !== 'play') break;
        c.x = num(m.x, -2, 1e6); c.y = num(m.y, -50, 100);
        c.lastStateAt = Date.now();
        if (Array.isArray(m.h)) { c.hx = num(m.h[0], -100, 1e6); c.hy = num(m.h[1], -50, 100); c.hs = num(m.h[2] | 0, 0, 1); }
        c.anim = num(m.a | 0, 0, 15); c.facing = m.f < 0 ? -1 : 1;
        break;
      }
      case 'watch': // menu spectators choose whose neighbourhood they watch
        c.watch = Number.isInteger(m.id) ? m.id : null;
        break;
      case 'die': {
        if (c.mode !== 'play') break;
        const elapsed = (Date.now() - c.runStart) / 1000;
        const dist = Math.floor(num(m.d, 0, elapsed * MAX_SPEED + 5));
        c.deaths++;
        c.best = Math.max(c.best, dist);
        c.runStart = Date.now();
        recordScore(c.name, dist);
        broadcastRoster();
        break;
      }
      case 'ping':
        send(ws, { t: 'pong', c: m.c });
        break;
    }
  });

  ws.on('close', () => {
    const wasPlaying = c.mode === 'play';
    clients.delete(c.id);
    if (wasPlaying) broadcastRoster();
  });
});

setInterval(() => { for (const c of clients.values()) c.msgBudget = 60; }, 1000);

// Snapshots with a sliding window: in join order, every runner gets the VIEW_SIDE runners before
// and after them (more from one side at the ends of the list). Spectators get the window around
// the runner their menu camera is watching. Bandwidth grows linearly with the player count.
function playersInOrder() { return [...clients.values()].filter(c => c.mode === 'play').sort((a, b) => a.order - b.order); }

setInterval(() => {
  if (!clients.size) return;
  const players = playersInOrder();
  const index = new Map(players.map((c, i) => [c.id, i]));
  const r2 = (v) => Math.round(v * 100) / 100;
  const entries = players.map(c => [c.id, r2(c.x), r2(c.y), c.anim, c.facing, r2(c.hx), r2(c.hy), c.hs]);
  const ts = Date.now();
  for (const c of clients.values()) {
    const center = c.mode === 'play' ? index.get(c.id) : (index.get(c.watch) ?? 0);
    const start = Math.max(0, Math.min(center - VIEW_SIDE, players.length - VIEW_SIZE));
    const win = entries.slice(start, start + VIEW_SIZE);
    const key = win.map(e => e[0]).join(',');
    if (key !== c.viewKey) { c.viewKey = key; send(c.ws, { t: 'view', ids: win.map(e => e[0]) }); }
    send(c.ws, { t: 'snap', ts, p: win });
  }
}, 1000 / TICK_HZ);

// Once per second: distances of everybody (for the live lists) + frozen-client check.
setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (const c of clients.values()) {
    if (c.mode === 'play' && now - c.lastStateAt > STALE_TIMEOUT) {
      c.mode = 'spectate';
      send(c.ws, { t: 'kicked', reason: 'stale' });
      changed = true;
    }
  }
  if (changed) broadcastRoster();
  const players = playersInOrder();
  if (players.length) broadcast({ t: 'board', p: players.map(c => [c.id, Math.round(c.x)]) });
}, 1000);

server.listen(PORT, () => {
  console.log(`Parallax Runner running on http://localhost:${PORT}  (track seed ${SEED})`);
  // local testing: `node server.js --bots 6` fills the server with playing bots
  const argv = process.argv.slice(2), bi = argv.indexOf('--bots');
  if (bi >= 0) {
    const count = Number(argv[bi + 1]) || 5;
    import('./tools/bots.js').then(m => m.spawnBots(count, { url: `ws://localhost:${PORT}/ws` }));
  }
});
