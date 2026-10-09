// Local runner: classic tile-based platformer physics (run, variable jump, double jump,
// wall slide / wall jump, slide with crawl under low ceilings).
import { isSolid, HAZARD, HAZARD_HEIGHT } from './level.js';
import { enemyHits } from './enemies.js';

export const ANIM = { IDLE: 0, RUN: 1, JUMP: 2, FALL: 3, DJUMP: 4, WALL: 5, SLIDE: 6, DEAD: 7 };

const P = {
  W: 0.62, STAND_H: 1.55, SLIDE_H: 0.75,
  MAX_RUN: 10, ACCEL: 70, AIR_ACCEL: 42, FRICTION: 55, TURN_MULT: 1.9,
  GRAVITY: 40, FALL_MULT: 1.3, CUT_MULT: 2.4, MAX_FALL: 24,
  JUMP_V: 16.8, DJUMP_V: 14.5,
  WALL_SLIDE_MAX: 3.5, WALLJUMP_VX: 9.5, WALLJUMP_VY: 15.5, WALL_LOCK: 0.13,
  SLIDE_MIN_SPEED: 2.5, SLIDE_BOOST: 3.5, SLIDE_MAX: 13.5, SLIDE_FRICTION: 9, SLIDE_MIN_TIME: 0.35, CRAWL: 3.2,
  COYOTE: 0.1, JUMP_BUFFER: 0.13, STEP: 1 / 120,
};
export const PHYS = P;
const EPS = 1e-4;

export class Player {
  constructor(level) {
    this.level = level;
    this.events = [];
    this.reset();
  }

  reset() {
    this.x = 2.5;
    this.y = this.level.surface[2];
    this.deathCause = null;
    this.vx = 0; this.vy = 0;
    this.onGround = true; this.facing = 1;
    this.sliding = false; this.slideTime = 0;
    this.doubleAvail = true; this.jumpHeld = false;
    this.coyote = 0; this.jumpBuf = 0; this.lock = 0;
    this.wallDir = 0; this.wallSliding = false;
    this.lastWall = null; this.wallBlocked = false;
    this.spin = 0; this.runPhase = 0;
    this.dead = false; this.deadTimer = 0;
    this.maxX = this.x; this.runTime = 0;
    this.clock ??= 0; // shared game clock (s) that drives the enemies – not reset on respawn
    this.acc = 0;
  }

  get h() { return this.sliding ? P.SLIDE_H : P.STAND_H; }
  get distance() { return Math.max(0, Math.floor(this.maxX - 2.5)); }

  solidBox(x0, y0, x1, y1) {
    for (let tx = Math.floor(x0); tx <= Math.floor(x1 - EPS); tx++)
      for (let ty = Math.floor(y0); ty <= Math.floor(y1 - EPS); ty++)
        if (isSolid(this.level.get(tx, ty))) return true;
    return false;
  }
  headroom() { return !this.solidBox(this.x - P.W / 2, this.y + 0.01, this.x + P.W / 2, this.y + P.STAND_H); }

  update(dt, input) {
    if (this.dead) {
      this.deadTimer -= dt;
      if (this.deadTimer <= 0) { this.reset(); this.events.push({ type: 'respawn' }); }
      return;
    }
    if (input.pressed('jump')) this.jumpBuf = P.JUMP_BUFFER;
    if (!input.held('jump')) this.jumpHeld = false;
    this.runTime += dt;
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= P.STEP && !this.dead) { this.step(P.STEP, input); this.acc -= P.STEP; }
  }

  step(dt, input) {
    this.clock += dt;
    let dir = (input.held('right') ? 1 : 0) - (input.held('left') ? 1 : 0);
    const down = input.held('down');
    if (this.lock > 0) { this.lock -= dt; dir = 0; }
    this.jumpBuf -= dt;
    this.coyote = this.onGround ? P.COYOTE : this.coyote - dt;
    this.spin = Math.max(0, this.spin - dt);

    // --- slide
    if (down && this.onGround && !this.sliding && Math.abs(this.vx) > P.SLIDE_MIN_SPEED) {
      this.sliding = true; this.slideTime = 0;
      const s = Math.sign(this.vx);
      this.vx = s * Math.min(Math.abs(this.vx) + P.SLIDE_BOOST, P.SLIDE_MAX);
      this.events.push({ type: 'slide' });
    }

    if (this.sliding) {
      this.slideTime += dt;
      const s = Math.sign(this.vx);
      this.vx -= s * Math.min(Math.abs(this.vx), P.SLIDE_FRICTION * dt);
      const free = this.headroom();
      if (!free && dir && Math.abs(this.vx) < P.CRAWL) { this.vx = dir * P.CRAWL; this.facing = dir; }
      const done = this.slideTime > P.SLIDE_MIN_TIME && (!down || Math.abs(this.vx) < 1.5);
      if ((done || !this.onGround) && free) this.sliding = false;
    } else {
      const target = dir * P.MAX_RUN;
      let a = this.onGround ? (dir ? P.ACCEL : P.FRICTION) : P.AIR_ACCEL;
      if (dir && Math.sign(this.vx) === -dir) a *= P.TURN_MULT;
      if (this.vx < target) this.vx = Math.min(target, this.vx + a * dt);
      else if (this.vx > target) this.vx = Math.max(target, this.vx - a * dt);
      if (dir) this.facing = dir;
    }

    // --- walls
    const l = this.x - P.W / 2, r = this.x + P.W / 2;
    const touchR = this.solidBox(r, this.y + 0.15, r + 0.06, this.y + this.h - 0.15);
    const touchL = this.solidBox(l - 0.06, this.y + 0.15, l, this.y + this.h - 0.15);
    this.wallDir = this.onGround ? 0 : touchR ? 1 : touchL ? -1 : 0;
    // Wall jumps must alternate between walls: the wall you last jumped off stays "used" until you
    // land or kick off a different wall. You only cling to walls you can jump from.
    const wallCol = this.wallDir > 0 ? Math.floor(r + 0.06) : this.wallDir < 0 ? Math.floor(l - 0.06) : 0;
    const usedWall = this.wallDir !== 0 && this.lastWall?.dir === this.wallDir && this.lastWall.col === wallCol;
    const pressing = (touchR && dir > 0) || (touchL && dir < 0);
    this.wallBlocked = !this.onGround && usedWall && pressing;
    if (usedWall) this.wallDir = 0;
    this.wallSliding = !this.onGround && this.vy < 0 && this.wallDir !== 0 && pressing;
    if (this.wallSliding) this.facing = -this.wallDir;

    // --- jumps
    if (this.jumpBuf > 0) {
      if ((this.onGround || this.coyote > 0) && (!this.sliding || this.headroom())) {
        this.vy = P.JUMP_V; this.sliding = false;
        this.onGround = false; this.coyote = 0; this.jumpBuf = 0; this.jumpHeld = true;
        this.events.push({ type: 'jump' });
      } else if (!this.onGround && this.wallDir) {
        this.vy = P.WALLJUMP_VY; this.vx = -this.wallDir * P.WALLJUMP_VX;
        this.facing = -this.wallDir; this.lock = P.WALL_LOCK;
        this.doubleAvail = true; this.jumpBuf = 0; this.jumpHeld = true;
        this.lastWall = { dir: this.wallDir, col: wallCol };
        this.events.push({ type: 'walljump', dir: this.wallDir });
      } else if (!this.onGround && this.doubleAvail) {
        this.vy = P.DJUMP_V; this.doubleAvail = false; this.jumpBuf = 0; this.jumpHeld = true;
        this.spin = 0.36;
        this.events.push({ type: 'djump' });
      }
    }

    // --- gravity
    let g = P.GRAVITY;
    if (this.vy < 0) g *= P.FALL_MULT;
    else if (!this.jumpHeld) g *= P.CUT_MULT;
    this.vy -= g * dt;
    if (this.wallSliding) this.vy = Math.max(this.vy, -P.WALL_SLIDE_MAX);
    this.vy = Math.max(this.vy, -P.MAX_FALL);

    // --- integrate with tile collision, one axis at a time
    const wasGround = this.onGround, fallSpeed = this.vy;
    this.moveX(this.vx * dt);
    this.moveY(this.vy * dt);
    if (this.onGround) {
      this.doubleAvail = true;
      this.lastWall = null;
      if (!wasGround) this.events.push({ type: 'land', speed: -fallSpeed });
    }

    if (this.onGround && Math.abs(this.vx) > 0.3) this.runPhase += Math.abs(this.vx) * dt;
    this.maxX = Math.max(this.maxX, this.x);

    // --- death
    if (this.y < -4) this.die('fall');
    else if (this.touchesHazard()) this.die('hazard');
    else if (this.touchesEnemy()) this.die('enemy');
  }

  moveX(dx) {
    if (!dx) return;
    this.x += dx;
    const b = this.y + 0.01, t = this.y + this.h - 0.01;
    if (dx > 0) {
      const tx = Math.floor(this.x + P.W / 2);
      if (this.solidBox(tx, b, tx + 1, t)) { this.x = tx - P.W / 2 - EPS; this.vx = 0; }
    } else {
      const tx = Math.floor(this.x - P.W / 2);
      if (this.solidBox(tx, b, tx + 1, t)) { this.x = tx + 1 + P.W / 2 + EPS; this.vx = 0; }
    }
  }

  moveY(dy) {
    this.y += dy;
    this.onGround = false;
    const l = this.x - P.W / 2 + 0.01, r = this.x + P.W / 2 - 0.01;
    if (dy < 0) {
      const ty = Math.floor(this.y);
      if (this.solidBox(l, ty, r, ty + 1)) { this.y = ty + 1; this.vy = 0; this.onGround = true; }
    } else if (dy > 0) {
      const ty = Math.floor(this.y + this.h);
      if (this.solidBox(l, ty, r, ty + 1)) {
        this.y = ty - this.h - EPS; this.vy = 0;
        this.events.push({ type: 'bonk' });
      }
    }
  }

  touchesHazard() {
    const x0 = this.x - P.W / 2 + 0.08, x1 = this.x + P.W / 2 - 0.08;
    const y0 = this.y + 0.05, y1 = this.y + this.h - 0.1;
    for (let tx = Math.floor(x0); tx <= Math.floor(x1); tx++)
      for (let ty = Math.floor(y0); ty <= Math.floor(y1); ty++)
        if (this.level.get(tx, ty) === HAZARD && y0 < ty + HAZARD_HEIGHT && y1 > ty) return true;
    return false;
  }

  touchesEnemy() {
    const x0 = this.x - P.W / 2 + 0.08, x1 = this.x + P.W / 2 - 0.08;
    const y0 = this.y + 0.05, y1 = this.y + this.h - 0.08;
    let hit = false;
    this.level.forEnemiesNear(x0 - 1, x1 + 1, (e) => { if (!hit && enemyHits(e, this.clock, x0, x1, y0, y1)) hit = true; });
    return hit;
  }

  die(cause = 'hazard') {
    if (this.dead) return;
    this.deathCause = cause;
    this.dead = true; this.deadTimer = 1.0;
    this.vx = 0; this.vy = 0;
    this.events.push({ type: 'die', cause, distance: this.distance, x: this.x, y: this.y });
  }

  get anim() {
    if (this.dead) return ANIM.DEAD;
    if (this.sliding) return ANIM.SLIDE;
    if (this.wallSliding) return ANIM.WALL;
    if (!this.onGround) return this.spin > 0 ? ANIM.DJUMP : this.vy > 0 ? ANIM.JUMP : ANIM.FALL;
    return Math.abs(this.vx) > 0.4 ? ANIM.RUN : ANIM.IDLE;
  }
}
