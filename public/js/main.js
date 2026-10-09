// Parallax Runner – client entry: game loop, menu, networking glue.
import * as THREE from 'three';
import { Level } from './level.js';
import { Player, ANIM } from './player.js';
import { Input } from './input.js';
import { World, Lane, LANE_GAP } from './world.js';
import { Net } from './net.js';
import { Sfx } from './audio.js';

const $ = (id) => document.getElementById(id);
const IDLE_WARN = 45; // s without movement before the HUD warns (server ends the run at 60 s)
const IDLE_LIMIT = 60;
const INTERP_DELAY = 110; // ms
const SEND_INTERVAL = 50; // ms

const CAM_GAME = { x: 0, y: 9, z: 20, lookY: 0.6, lookZ: -5 };
const CAM_MENU = { x: innerWidth > 900 ? -6 : 0, y: 11, z: 26, lookY: 0.5, lookZ: -8 };

const world = new World($('game'));
const input = new Input();
const sfx = new Sfx();

const S = {
  mode: 'menu',
  myId: null, color: '#05d9e8', seed: null,
  roster: [], hof: [],
  remotes: new Map(),   // id -> { id, name, color, samples: [], lane, x } – only runners in our view window
  viewIds: [],          // ids the server streams to us (sliding window around us / the watched runner)
  board: new Map(),     // id -> x for every runner (1 Hz), for the live lists
  falling: [],          // lanes currently dropping/sinking out of view
  idleT: 0, idleX: 0, idleY: 0,
  level: null, player: null, localLane: null, attract: null,
  sendT: 0, best: 0, deaths: 0, deadUntil: 0,
};

let name = '';
try { name = localStorage.getItem('pr-name') || ''; } catch { /* ignore */ }
$('name').value = name;

// ------------------------------------------------------------------ networking
const net = new Net({
  open() { setConn('ONLINE', true); },
  close() { setConn('CONNECTION LOST – RECONNECTING…', false); },
  welcome(m) {
    S.myId = m.id; S.color = m.color;
    if (m.seed !== S.seed) setupLevel(m.seed);
    $('start-btn').disabled = false;
    if (S.mode === 'play') net.send({ t: 'start', name }); // resume after reconnect
    director.id = null; // re-announce what the menu camera watches
  },
  roster(m) {
    S.roster = m.players; S.hof = m.hof || [];
    syncLanes();
    renderLists();
  },
  view(m) {
    S.viewIds = m.ids;
    syncLanes();
  },
  board(m) {
    S.board = new Map(m.p);
  },
  kicked(m) {
    if (S.mode !== 'play') return;
    toMenu(false);
    showNotice(m.reason === 'idle' ? `OFF AIR – ${IDLE_LIMIT} s without movement. Your run was ended.` : 'Your run was ended.');
  },
  snap(m) {
    const now = performance.now();
    for (const [id, x, y, a, f] of m.p) {
      if (id === S.myId) continue;
      const r = S.remotes.get(id);
      if (!r) continue;
      r.samples.push({ t: now, x, y, a, f });
      if (r.samples.length > 40) r.samples.splice(0, r.samples.length - 40);
    }
  },
});

function setConn(text, ok) { const c = $('conn'); c.textContent = text; c.classList.toggle('ok', ok); }

function setupLevel(seed) {
  S.seed = seed;
  // lanes hold meshes from the previous chunk cache: drop everything
  for (const r of S.remotes.values()) r.lane?.dispose();
  S.remotes.clear();
  S.falling.forEach(l => l.dispose()); S.falling = [];
  S.localLane?.dispose(); S.localLane = null;
  S.attract?.dispose(); S.attract = null;
  S.level = new Level(seed);
  world.setLevel(S.level);
  S.player = new Player(S.level);
  if (S.mode === 'play') S.localLane = makeLocalLane();
  syncLanes();
}

function makeLocalLane() {
  const l = new Lane(world, { id: S.myId ?? 0, color: S.color, name, local: true });
  l.index = 0;
  return l;
}

// One lane per runner in our view window, ordered by join time.
// Runner left the game (disconnect / menu / timeout) → lane falls; still online but outside the window → lane sinks.
function syncLanes() {
  if (!S.level) return;
  const online = new Set(S.roster.map(p => p.id));
  const inView = new Set(S.viewIds);
  const visible = S.roster.filter(p => p.id !== S.myId && inView.has(p.id));
  const visibleIds = new Set(visible.map(p => p.id));
  for (const [id, r] of S.remotes) {
    if (visibleIds.has(id)) continue;
    if (online.has(id)) r.lane.sink(); else r.lane.fall();
    S.falling.push(r.lane);
    S.remotes.delete(id);
  }
  let idx = S.mode === 'play' ? 1 : 0;
  for (const p of visible) {
    let r = S.remotes.get(p.id);
    if (!r) {
      r = { id: p.id, samples: [], x: 0, lane: new Lane(world, { id: p.id, color: p.color, name: p.name }) };
      S.remotes.set(p.id, r);
    }
    r.name = p.name; r.color = p.color; r.best = p.best; r.deaths = p.deaths;
    r.lane.index = idx++;
  }
  const shown = visible.length;
  // attract lane: when nobody is running, the menu flies along the empty course
  const wantAttract = S.mode === 'menu' && shown === 0 && S.roster.length === 0;
  if (wantAttract && !S.attract) {
    S.attract = new Lane(world, { id: 0, color: '#8a80b0', name: '' });
    S.attract.attract = true; S.attract.drone.visible = false;
    S.attract.ax = 2.5;
  } else if (!wantAttract && S.attract) { S.attract.sink(); S.falling.push(S.attract); S.attract = null; }
}

// ------------------------------------------------------------------ menu / game transitions
$('start-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!S.level || !net.connected) return;
  name = $('name').value.trim().toUpperCase().slice(0, 14);
  try { localStorage.setItem('pr-name', name); } catch { /* ignore */ }
  sfx.init(); sfx.click();
  startGame();
});

function startGame() {
  S.mode = 'play';
  S.player.reset();
  S.best = 0; S.deaths = 0;
  S.idleT = 0; S.idleX = S.player.x; S.idleY = S.player.y;
  $('notice').hidden = true;
  S.localLane?.dispose();
  S.localLane = makeLocalLane();
  S.localLane.setRunner(S.player.x, S.player.y, ANIM.IDLE, 1, 0, 0);
  view.snap = true; world.glitch = 0.4;
  net.send({ t: 'start', name });
  $('menu').hidden = true; $('hud').hidden = false;
  input.enabled = true;
  document.activeElement?.blur();
  world.camTarget = { ...CAM_GAME };
  world.menuMix = 0;
  syncLanes();
}

function toMenu(tellServer = true) {
  if (S.mode !== 'play') return;
  S.mode = 'menu';
  if (tellServer) net.send({ t: 'menu' });
  $('idle-warn').hidden = true;
  if (S.localLane) { S.localLane.fall(); S.falling.push(S.localLane); S.localLane = null; }
  $('menu').hidden = false; $('hud').hidden = true; $('death').hidden = true;
  world.camTarget = { ...CAM_MENU };
  world.menuMix = 1;
  director.id = null;
  syncLanes();
  renderLists();
}

function showNotice(text) { $('notice').textContent = text; $('notice').hidden = false; }

addEventListener('keydown', (e) => {
  if (e.code === 'Escape') toMenu();
  if (e.code === 'KeyM' && !(e.target instanceof HTMLInputElement)) sfx.toggleMute();
  if (S.mode === 'play') sfx.init();
});
addEventListener('pointerdown', () => sfx.init(), { once: true });

world.camTarget = { ...CAM_MENU };
Object.assign(world.camPose, CAM_MENU);

// ------------------------------------------------------------------ lists
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dist = (x) => Math.max(0, Math.floor(x - 2.5));

function liveEntries() {
  const list = S.roster.map(p => {
    const me = p.id === S.myId && S.mode === 'play';
    const r = S.remotes.get(p.id);
    const x = me ? S.player.x : r?.samples.length ? r.x : (S.board.get(p.id) ?? 0);
    return { id: p.id, name: p.name, color: p.color, d: dist(x), best: p.best, me };
  });
  return list.sort((a, b) => b.d - a.d);
}

function renderLists() {
  const live = liveEntries();
  $('live-count').textContent = live.length ? `(${live.length})` : '';
  $('menu-live').innerHTML = live.length
    ? live.map(p => `<li><span class="n"><i class="swatch" style="background:${p.color}"></i>${esc(p.name)}</span><span class="d">${p.d} m</span></li>`).join('')
    : '<li class="empty">no runner on air – be the first</li>';
  $('menu-hof').innerHTML = S.hof.length
    ? S.hof.map((h, i) => `<li><span class="n">${i + 1}. ${esc(h.name)}</span><span class="d">${h.dist} m</span></li>`).join('')
    : '<li class="empty">nobody survived yet</li>';
  // top 10, plus your own rank if you are further down
  const rows = live.map((p, i) => ({ ...p, rank: i + 1 }));
  const shownRows = rows.slice(0, 10);
  const mine = rows.find(p => p.me);
  if (mine && mine.rank > 10) shownRows.push(mine);
  $('hud-live').innerHTML = shownRows.map(p =>
    `<li class="${p.me ? 'me' : ''}"><span class="n" style="color:${p.color}">${p.rank}. ${esc(p.name)}</span><span class="d">${p.d} m</span></li>`).join('');
}
setInterval(renderLists, 400);

const TICKER = [
  'CH-77 EXCLUSIVE: RUNNERS RACE THE ROOFTOPS OF NEO-ANGELES LIVE',
  'ACID RAIN WARNING FOR SECTOR 7',
  'OMNI-SYN: MORE HUMAN THAN YOUR NEIGHBOUR',
  'FALL = RESET. NO SECOND CHANCES. ONLY RE-RUNS.',
  'TONIGHT\'S SPONSOR: SYNTH NOODLES – NOW 40% REAL',
  'LASER FENCES ARE HOT. DO NOT TOUCH THE RED.',
];
$('ticker-text').textContent = TICKER.join('   ◆   ');

// ------------------------------------------------------------------ name tags
const tags = new Map();
const tmpV = new THREE.Vector3();
// runners outside the shared view get an arrow at the screen edge
function updateTags(lanes, refX) {
  const seen = new Set();
  const menuW = S.mode === 'menu' && innerWidth > 720 ? 480 : 0;
  const topMin = S.mode === 'play' && innerWidth > 720 ? 70 + $('hud-live').offsetHeight + 60 : 130;
  const edges = { left: [], right: [] };
  for (const { lane, label, color, dead } of lanes) {
    let el = tags.get(lane);
    if (!el) { el = document.createElement('div'); el.className = 'tag3d'; $('labels').appendChild(el); tags.set(lane, el); }
    seen.add(lane);
    lane.root.updateMatrixWorld();
    lane.headWorld(tmpV).project(world.camera);
    let sx = (tmpV.x * 0.5 + 0.5) * innerWidth, sy = (-tmpV.y * 0.5 + 0.5) * innerHeight;
    const left = sx < menuW + 20, right = sx > innerWidth - 20;
    const edge = left ? 'left' : right ? 'right' : '';
    if (edge) {
      sx = left ? menuW + 10 : innerWidth - 10; sy = Math.min(innerHeight - 90, Math.max(topMin, sy));
      edges[edge].push({ el, sy });
    }
    el.style.left = `${sx}px`;
    el.style.top = `${sy}px`;
    el.style.color = color;
    el.className = `tag3d${edge ? ' edge ' + edge : ''}${dead ? ' dead' : ''}`;
    let sub = `${dist(lane.rx)} m`;
    if (edge && refX !== null) { const d = Math.round(lane.rx - refX); sub = `${d > 0 ? '+' : '−'}${Math.abs(d)} m`; }
    const html = edge === 'left' ? `◀ ${esc(label)}<small>${sub}</small>`
      : edge === 'right' ? `${esc(label)}<small>${sub}</small> ▶` : `${esc(label)}<small>${sub}</small>`;
    if (el._html !== html) { el.innerHTML = html; el._html = html; }
  }
  // stack edge markers so they never overlap
  for (const list of Object.values(edges)) {
    list.sort((a, b) => a.sy - b.sy);
    for (let i = 1; i < list.length; i++) {
      if (list[i].sy < list[i - 1].sy + 28) { list[i].sy = list[i - 1].sy + 28; list[i].el.style.top = `${list[i].sy}px`; }
    }
  }
  for (const [lane, el] of tags) if (!seen.has(lane)) { el.remove(); tags.delete(lane); }
}

// ------------------------------------------------------------------ remote interpolation
function sampleRemote(r, now) {
  const s = r.samples;
  if (!s.length) return null;
  const t = now - INTERP_DELAY;
  if (t <= s[0].t) return s[0];
  for (let i = s.length - 1; i > 0; i--) {
    const a = s[i - 1], b = s[i];
    if (t >= a.t && t <= b.t) {
      const k = (t - a.t) / Math.max(1, b.t - a.t);
      if (Math.abs(b.x - a.x) > 6 || Math.abs(b.y - a.y) > 6) return k < 0.5 ? a : b; // respawn: no smear
      const near = k < 0.5 ? a : b;
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, a: near.a, f: near.f };
    }
  }
  return s[s.length - 1];
}

// ------------------------------------------------------------------ shared view
// One camera focus for all lanes: the courses are aligned like one connected plane,
// every runner is shown at their true position on it.
const view = { x: 2.5, y: 4, ready: false, snap: false };
function followView(dt, x, y, vx) {
  const tx = x + 3 + THREE.MathUtils.clamp(vx * 0.18, -2, 2.5), ty = y + 1.2;
  if (!view.ready || view.snap) { view.x = tx; view.y = ty; view.ready = true; view.snap = false; return; }
  view.x += (tx - view.x) * (1 - Math.exp(-dt * 5));
  view.y += (ty - view.y) * (1 - Math.exp(-dt * 3.2));
}

// menu "director": the broadcast camera cuts between live runners
const director = { id: null, t: 0 };
const CUT_EVERY = 8;
// It steps through all runners in join order; the server streams the window around the watched
// runner, so each cut shifts the window by one: one lane sinks away, one rises in.
function directMenuCamera(dt) {
  const runners = S.roster;
  if (!runners.length) { $('camfeed').hidden = true; return false; }
  director.t += dt;
  let i = runners.findIndex(p => p.id === director.id);
  if (i < 0 || (director.t > CUT_EVERY && runners.length > 1)) {
    i = (i + 1) % runners.length;
    director.id = runners[i].id; director.t = 0; director.cut = true;
    net.send({ t: 'watch', id: director.id });
  }
  const txt = `CAM FEED · ${runners[i].name}`;
  if ($('camfeed-name').textContent !== txt) $('camfeed-name').textContent = txt;
  $('camfeed').hidden = false;
  const r = S.remotes.get(director.id);
  if (r?.samples.length) { // window may still be on its way after a cut
    if (director.cut) {
      if (Math.abs(r.lane.rx - view.x) > 40) { view.snap = true; world.glitch = Math.max(world.glitch, 0.35); }
      director.cut = false;
    }
    followView(dt, r.lane.rx, r.lane.ry, r.lane.vx);
  }
  return true;
}

// ------------------------------------------------------------------ main loop
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t = now / 1000;
  input.update();

  const tagList = [];

  if (S.level) {
    // local runner
    if (S.mode === 'play' && S.localLane) {
      const p = S.player;
      p.update(dt, input);
      handleEvents(p.events.splice(0));
      S.localLane.setRunner(p.x, p.y, p.anim, p.facing, dt, p.runPhase);
      if (p.sliding && Math.random() < 0.5) S.localLane.sparks();
      if (p.wallSliding && Math.random() < 0.25) S.localLane.particles.emit(p.x - p.facing * 0.3, p.y + 1.2, 1, '#cfcbe8', 1, 0, 0.3);
      // used wall: no grip – red scrape sparks show you need the other wall
      if (p.wallBlocked && Math.random() < 0.5) S.localLane.particles.emit(p.x + p.facing * 0.32, p.y + 0.9, 2, ['#ff2a6d', '#ff6040'], 2, 1.5, 0.25);
      S.best = Math.max(S.best, p.distance);
      S.sendT -= dt * 1000;
      if (S.sendT <= 0) { S.sendT = SEND_INTERVAL; net.send({ t: 's', x: +p.x.toFixed(2), y: +p.y.toFixed(2), a: p.anim, f: p.facing }); }
      followView(dt, p.x, p.y, p.vx);
      updateHud();
      // idle warning (the server ends the run after IDLE_LIMIT seconds without movement)
      if (Math.abs(p.x - S.idleX) > 0.05 || Math.abs(p.y - S.idleY) > 0.05) { S.idleT = 0; S.idleX = p.x; S.idleY = p.y; }
      else S.idleT += dt;
      const warn = S.idleT > IDLE_WARN;
      $('idle-warn').hidden = !warn;
      if (warn) $('idle-warn').textContent = `MOVE! OFF AIR IN ${Math.max(0, Math.ceil(IDLE_LIMIT - S.idleT))} s`;
    }

    // remote runners
    for (const r of S.remotes.values()) {
      const smp = sampleRemote(r, now);
      if (smp) r.x = smp.x;
      if (!r.lane || !smp) continue;
      r.lane.setRunner(smp.x, smp.y, smp.a, smp.f, dt);
      tagList.push({ lane: r.lane, label: r.name, color: r.color, dead: r.lane.anim === ANIM.DEAD });
    }

    if (S.mode === 'menu' && !directMenuCamera(dt)) {
      // nobody on air: glide along the empty course
      const a = S.attract;
      if (a) {
        a.ax += dt * 7;
        const surf = S.level.surface[Math.floor(a.ax)] || 0;
        a.setRunner(a.ax, surf || a.ry, ANIM.DEAD, 1, dt);
        followView(dt, a.rx, a.ry, 7);
      }
    }

    const lanes = [...S.remotes.values()].map(r => r.lane).filter(Boolean).concat(S.falling);
    if (S.localLane) lanes.push(S.localLane);
    if (S.attract) lanes.push(S.attract);
    for (const l of lanes) l.update(dt, t, view, world.halfWidthAt(l.z ?? -l.index * LANE_GAP));
    for (let i = S.falling.length - 1; i >= 0; i--) {
      if (S.falling[i].gone) { S.falling[i].dispose(); S.falling.splice(i, 1); }
    }
  }

  updateTags(tagList, S.mode === 'play' ? S.player.x : null);
  world.update(dt, t, view.x, view.y);
  world.render(t);
}
requestAnimationFrame(frame);

function handleEvents(events) {
  const lane = S.localLane;
  for (const e of events) {
    switch (e.type) {
      case 'jump': sfx.jump(); lane.dust(5); break;
      case 'djump': sfx.djump(); lane.particles.emit(S.player.x, S.player.y, 10, [S.color, '#ffffff'], 5, 1, 0.35); break;
      case 'walljump': sfx.walljump(); lane.wallDust(e.dir); break;
      case 'land': if (e.speed > 9) { sfx.land(e.speed); lane.dust(Math.min(12, e.speed / 2)); } break;
      case 'slide': sfx.slide(); break;
      case 'bonk': sfx.bonk(); break;
      case 'die':
        sfx.die(); lane.burst(); world.glitch = 1.2;
        S.deaths++;
        net.send({ t: 'die', d: e.distance });
        $('death-sub').textContent = `${e.distance} m · BACK TO START…`;
        $('death').hidden = false;
        break;
      case 'respawn':
        sfx.respawn(); world.glitch = 0.6; $('death').hidden = true;
        view.snap = true;
        break;
    }
  }
}

function updateHud() {
  const p = S.player;
  $('hud-dist').textContent = `${p.distance} m`;
  $('hud-sub').textContent = `BEST ${S.best} m · RESETS ${S.deaths}`;
  const viewers = Math.floor(1200 + p.distance * 137 + S.remotes.size * 5000 + Math.sin(performance.now() / 900) * 40);
  $('hud-viewers').textContent = `VIEWERS ${viewers.toLocaleString('en-US')}`;
}

window.__pr = { world, S }; // debugging handle
