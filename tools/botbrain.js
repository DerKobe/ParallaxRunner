// Bot "brain": plays the real game physics by short look-ahead planning.
// Every decision step it simulates a handful of random input sequences ~1 s ahead on a copy of
// its own Player and executes the first chunk of the best one (Monte-Carlo receding horizon).
// Skill controls how many futures it considers, how far it looks and how often it fumbles;
// pace controls how often it hesitates on safe ground.
import { Player } from '../public/js/player.js';

const FRAME = 1 / 60;
const CHUNK = 6; // frames per planned action (0.1 s)

class SimInput {
  constructor() { this.a = { dir: 0, jump: false, down: false, shoot: false }; this.prevJump = false; this.prevShoot = false; }
  set(a) { this.prevJump = this.a.jump; this.prevShoot = this.a.shoot; this.a = a; }
  hold() { this.prevJump = this.a.jump; this.prevShoot = this.a.shoot; } // same keys, no new presses
  held(k) {
    if (k === 'right') return this.a.dir > 0;
    if (k === 'left') return this.a.dir < 0;
    return !!this.a[k];
  }
  pressed(k) {
    if (k === 'jump') return this.a.jump && !this.prevJump;
    if (k === 'shoot') return this.a.shoot && !this.prevShoot;
    return false;
  }
}

function clonePlayer(p) {
  const c = Object.assign(Object.create(Player.prototype), p);
  c.events = [];
  return c;
}

function randomAction(rng) {
  const r = rng();
  return {
    dir: r < 0.72 ? 1 : r < 0.84 ? 0 : -1,
    jump: rng() < 0.38,
    down: rng() < 0.12,
  };
}

export class BotBrain {
  constructor(player, { skill = 0.6, pace = 0.9, rng = Math.random } = {}) {
    this.p = player;
    this.skill = skill;
    this.pace = pace;
    this.rng = rng;
    this.samples = Math.round(4 + 36 * skill);                       // futures considered per decision
    this.horizon = Math.max(3, Math.round((0.35 + 0.85 * skill) * 60 / CHUNK)); // look-ahead in chunks
    this.fumble = (1 - skill) ** 2 * 0.22;                           // chance of a random slip per decision
    this.plan = [];
    this.frame = 0;
    this.input = new SimInput();
    this.current = { dir: 1, jump: false, down: false };
  }

  reset() { this.plan = []; this.frame = 0; }

  rollout(seq) {
    const c = clonePlayer(this.p);
    const inp = new SimInput();
    inp.a = { ...this.current }; // continuity of held keys
    const frames = seq.length * CHUNK;
    for (let f = 0; f < frames; f++) {
      if (f % CHUNK === 0) inp.set(seq[f / CHUNK]); else inp.hold();
      c.update(FRAME, inp);
      if (c.dead) return -1000 + f; // dying later beats dying sooner
    }
    return c.x + 0.35 * c.y + (c.onGround ? 0.5 : 0) + Math.max(0, c.maxX - this.p.maxX) * 0.2;
  }

  decide() {
    const rng = this.rng, H = this.horizon;
    const candidates = [];
    if (this.plan.length) { // keep refining the previous plan
      const shifted = this.plan.slice(1);
      while (shifted.length < H) shifted.push(randomAction(rng));
      candidates.push(shifted);
    }
    candidates.push(Array.from({ length: H }, () => ({ dir: 1, jump: false, down: false }))); // just run
    while (candidates.length < this.samples) {
      // random sequences, often holding a key for several chunks (more human-like)
      const seq = [];
      while (seq.length < H) {
        const a = randomAction(rng), n = 1 + Math.floor(rng() * 4);
        for (let i = 0; i < n && seq.length < H; i++) seq.push(a);
      }
      candidates.push(seq);
    }
    let best = null, bestScore = -Infinity;
    for (const seq of candidates) {
      const s = this.rollout(seq);
      if (s > bestScore) { bestScore = s; best = seq; }
    }
    this.plan = best;
    let action = { ...best[0] };

    // imperfections
    if (rng() < this.fumble) action = randomAction(rng);
    else if (this.p.onGround && action.dir > 0 && rng() > this.pace) {
      const hesitate = [{ ...action, dir: 0 }, ...best.slice(1)];
      if (this.rollout(hesitate) > -500) action.dir = 0; // only hesitate where it's safe
    }
    return action;
  }

  // call once per 1/60 s frame; returns the input object for Player.update
  next() {
    if (this.frame % CHUNK === 0) {
      this.current = this.p.dead || this.p.koT > 0 ? { dir: 0, jump: false, down: false } : this.decide();
      this.input.set(this.current);
    } else {
      this.input.hold();
    }
    this.frame++;
    return this.input;
  }
}
