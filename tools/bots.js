// Test bots that really play: same course, physics and Stalker as humans, steered by BotBrain.
// Skills are spread from clumsy to expert. With --zap they also shoot at aligned neighbours/stalkers.
//
//   node tools/bots.js [count=5] [--zap] [--url ws://localhost:3000/ws]
//   node server.js --bots 6 [--zap]        (server starts its own bots)
import WebSocket from 'ws';
import { pathToFileURL } from 'node:url';
import { Level } from '../public/js/level.js';
import { Player } from '../public/js/player.js';
import { Hunter, HS } from '../public/js/hunter.js';
import { BotBrain } from './botbrain.js';

const NAMES = ['DECKARD', 'RACHAEL', 'BATTY', 'PRIS', 'ZHORA', 'GAFF', 'LEON', 'K', 'JOI', 'LUV', 'SAPPER', 'MARIETTE'];
const SHOT_COOLDOWN = 1.6;

function spawnBot(i, count, { url, zap }) {
  // spread skill evenly over the bots, with a little jitter
  const base = count > 1 ? i / (count - 1) : 0.6;
  const skill = Math.min(1, Math.max(0, base * 0.95 + Math.random() * 0.1));
  const pace = 0.55 + 0.45 * skill;
  const name = NAMES[i % NAMES.length] + (i >= NAMES.length ? '-' + Math.floor(i / NAMES.length) : '');
  const bot = { name, skill, ws: null, timer: null, stopped: false };

  const connect = () => {
    const ws = new WebSocket(url);
    bot.ws = ws;
    let level, p, h, brain, others = new Map(), shotCd = 0, sendT = 0, last = 0, acc = 0;

    ws.on('message', (raw) => {
      const m = JSON.parse(raw);
      if (m.t === 'welcome') {
        bot.id = m.id;
        clearInterval(bot.timer);
        level = new Level(m.seed); p = new Player(level); h = new Hunter(p);
        brain = new BotBrain(p, { skill, pace });
        ws.send(JSON.stringify({ t: 'start', name }));
        last = performance.now();
        bot.timer = setInterval(tick, 16);
      } else if (m.t === 'snap') {
        others = new Map(m.p.map(([id, x, y, a, f, hx, hy, hs]) => [id, { x, y, a, hx, hy, hs }]));
      } else if (m.t === 'hit' && p) {
        if (m.kind === 'runner') p.knockOut(1);
        else if (m.kind === 'hunter') h.knockDown(3);
      } else if (m.t === 'kicked') {
        ws.send(JSON.stringify({ t: 'start', name })); // just rejoin
      }
    });

    const tick = () => {
      const now = performance.now();
      acc += Math.min(0.25, (now - last) / 1000); last = now;
      while (acc >= 1 / 60) {
        acc -= 1 / 60;
        p.update(1 / 60, brain.next());
        if (!p.dead && h.update(1 / 60)) p.die('caught');
        for (const e of p.events.splice(0)) {
          if (e.type === 'die') ws.send(JSON.stringify({ t: 'die', d: e.distance }));
          if (e.type === 'respawn') { h.reset(); brain.reset(); }
        }
        h.events.length = 0;
        shotCd -= 1 / 60;
        if (zap && shotCd <= 0 && !p.dead && p.koT <= 0) maybeShoot();
      }
      sendT -= 16;
      if (sendT <= 0 && ws.readyState === 1) {
        sendT = 50;
        const hs = p.dead ? HS.NONE : h.state;
        ws.send(JSON.stringify({ t: 's', x: +p.x.toFixed(2), y: +p.y.toFixed(2), a: p.anim, f: p.facing, h: [+h.x.toFixed(2), +h.y.toFixed(2), hs] }));
      }
    };

    const maybeShoot = () => {
      for (const [id, o] of others) {
        if (id === bot.id) continue;
        const runner = o.a !== 7 && Math.abs(o.x - p.x) < 0.75 && Math.abs(o.y - p.y) < 1.1;
        const stalker = o.hs === HS.CHASE && Math.abs(o.hx - p.x) < 0.95 && Math.abs(o.hy - p.y) < 1.4;
        if (!runner && !stalker) continue;
        if (Math.random() > 0.08) return; // don't fire at every chance
        const kind = runner ? 'runner' : 'hunter';
        ws.send(JSON.stringify({ t: 'shoot', x: p.x, y: p.y, target: id, kind }));
        shotCd = SHOT_COOLDOWN;
        return;
      }
    };

    ws.on('close', () => {
      clearInterval(bot.timer);
      if (!bot.stopped) setTimeout(connect, 2000); // server restarted? come back
    });
    ws.on('error', () => {});
  };
  connect();
  return bot;
}

export function spawnBots(count, { url = 'ws://localhost:3000/ws', zap = false } = {}) {
  const bots = [];
  for (let i = 0; i < count; i++) setTimeout(() => bots.push(spawnBot(i, count, { url, zap })), i * 1500);
  console.log(`[bots] ${count} bots${zap ? ' (zapping)' : ''} joining ${url}`);
  return () => { for (const b of bots) { b.stopped = true; clearInterval(b.timer); b.ws?.close(); } };
}

// CLI
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const count = Number(args.find(a => /^\d+$/.test(a))) || 5;
  const urlIdx = args.indexOf('--url');
  const url = urlIdx >= 0 ? args[urlIdx + 1] : 'ws://localhost:3000/ws';
  const stop = spawnBots(count, { url, zap: args.includes('--zap') });
  process.on('SIGINT', () => { stop(); setTimeout(() => process.exit(0), 200); });
}
