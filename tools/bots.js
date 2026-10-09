// Demo/test bots: connect N fake runners to a server so you can see lanes without a second player.
// Usage: node tools/bots.js [count=3] [url=ws://localhost:3000/ws]
// Bots don't run real physics – they glide over the course and "die" now and then.
import WebSocket from 'ws';
import { Level, isSolid } from '../public/js/level.js';

const count = Number(process.argv[2]) || 3;
const url = process.argv[3] || 'ws://localhost:3000/ws';
const NAMES = ['DECKARD', 'RACHAEL', 'BATTY', 'PRIS', 'ZHORA', 'GAFF', 'K-JOI', 'LEON', 'TYREL', 'SEBASTN'];

function spawnBot(i) {
  const ws = new WebSocket(url);
  let level = null, x = 2.5, y = 0, vy = 0, speed = 7 + Math.random() * 3, timer = null;
  let deadT = 0;
  const top = (tx, fromY) => { for (let yy = Math.min(39, Math.floor(fromY)); yy >= 0; yy--) if (isSolid(level.get(tx, yy))) return yy + 1; return -10; };
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.t === 'welcome' && !level) {
      level = new Level(m.seed);
      y = level.surface[2];
      ws.send(JSON.stringify({ t: 'start', name: NAMES[i % NAMES.length] }));
      const dieAfter = () => 60 + Math.random() * 300;
      let deathAt = dieAfter();
      timer = setInterval(() => {
        const dt = 0.05;
        if (deadT > 0) {
          deadT -= dt;
          if (deadT <= 0) { x = 2.5; y = level.surface[2]; vy = 0; }
          ws.send(JSON.stringify({ t: 's', x, y, a: 7, f: 1 }));
          return;
        }
        x += speed * dt;
        // follow the highest walkable surface ahead with a fake jump arc
        const ahead = Math.max(top(Math.floor(x + 0.6), y + 12), top(Math.floor(x), y + 12));
        let anim = 1;
        if (ahead > y + 0.01 || ahead < y - 0.5) {
          vy = ahead > y ? Math.max(vy, 10) : vy - 40 * dt;
          y += vy * dt;
          if (vy < 0 && y <= ahead) { y = Math.max(ahead, 0); vy = 0; }
          anim = vy > 0 ? 2 : 3;
        } else { y = ahead; vy = 0; }
        if (x > deathAt) {
          ws.send(JSON.stringify({ t: 'die', d: Math.floor(x - 2.5) }));
          deadT = 1; deathAt = dieAfter();
          ws.send(JSON.stringify({ t: 's', x, y, a: 7, f: 1 }));
          return;
        }
        ws.send(JSON.stringify({ t: 's', x: +x.toFixed(2), y: +y.toFixed(2), a: anim, f: 1 }));
      }, 50);
    }
  });
  ws.on('close', () => clearInterval(timer));
  ws.on('error', (e) => console.error('bot', i, e.message));
  return ws;
}

const bots = [];
for (let i = 0; i < count; i++) setTimeout(() => bots.push(spawnBot(i)), i * 700);
console.log(`spawning ${count} bots → ${url} (Ctrl+C to stop)`);
process.on('SIGINT', () => { bots.forEach(b => b.close()); setTimeout(() => process.exit(0), 200); });
