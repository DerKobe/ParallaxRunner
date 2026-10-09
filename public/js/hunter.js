// The Stalker: a hunter-killer drone that flies your own route with a time offset.
// It is where you were D seconds ago – stand still (or turn back) for D seconds and it gets you.
// Shot down by a neighbour it crashes; a replacement takes over after a short time – and the
// downtime stays with you as a permanent head start (until you die).

export const HS = { CHASE: 0, DOWN: 1, NONE: 2 }; // network state

const START_DELAY = 4.5;   // s offset at the start of a run
const MIN_DELAY = 2.5;     // s offset deep into the course
const DELAY_SHRINK = 700;  // metres over which the offset shrinks by 1 s
const CATCH_UP = 1.4;      // playback rate while it is further behind than its offset (offset shrinking with distance)
const CATCH_X = 0.7, CATCH_Y = 1.0;
const ENTRY_SPEED = 6;     // before the run's first D seconds it flies in from the left

export class Hunter {
  constructor(player) {
    this.p = player;
    this.events = [];
    this.reset();
  }

  reset() {
    const p = this.p;
    this.path = [{ t: 0, x: p.x, y: p.y }];
    this.t = 0;                 // run clock
    this.ht = -START_DELAY;     // playback time on the recorded path
    this.state = HS.CHASE;
    this.downT = 0;
    this.bonus = 0;             // s of head start earned from shot-down stalkers
    this.x = p.x - START_DELAY * ENTRY_SPEED; this.y = p.y + 2;
  }

  get delay() { return Math.max(MIN_DELAY, START_DELAY - this.p.distance / DELAY_SHRINK) + this.bonus; }
  get lag() { return this.t - this.ht; }        // seconds behind the runner
  get gap() { return this.p.x - this.x; }       // metres behind the runner

  sample(t) {
    const path = this.path;
    const first = path[0];
    if (t <= first.t) return { x: first.x + (t - first.t) * ENTRY_SPEED, y: first.y + Math.min(3, (first.t - t) * 0.8) };
    let lo = 0, hi = path.length - 1;
    if (t >= path[hi].t) return path[hi];
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (path[mid].t <= t) lo = mid; else hi = mid; }
    const a = path[lo], b = path[hi], k = (t - a.t) / (b.t - a.t);
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
  }

  knockDown(seconds) {
    if (this.state !== HS.CHASE) return false;
    this.state = HS.DOWN; this.downT = seconds;
    this.bonus += seconds; // the replacement keeps the larger offset: real breathing room
    this.events.push({ type: 'down', x: this.x, y: this.y });
    return true;
  }

  // returns true when the runner has been caught
  update(dt) {
    const p = this.p;
    this.t += dt;
    const last = this.path[this.path.length - 1];
    if (this.t - last.t >= 1 / 30) this.path.push({ t: this.t, x: p.x, y: p.y });
    // forget the part of the route that lies behind the drone
    if (this.path.length > 64 && this.path[32].t < this.ht - 1) this.path.splice(0, 32);

    if (this.state === HS.DOWN) {
      this.downT -= dt;
      if (this.downT <= 0) { this.state = HS.CHASE; this.events.push({ type: 'return' }); }
      return false; // playback frozen: the runner gains the downtime as a head start
    }
    const D = this.delay;
    const rate = this.lag > D + 0.05 ? CATCH_UP : 1;
    this.ht = Math.min(this.ht + dt * rate, this.t - D);
    const pos = this.sample(this.ht);
    this.x = pos.x; this.y = pos.y;
    return this.ht > 0 && Math.abs(this.x - p.x) < CATCH_X && Math.abs(this.y - p.y) < CATCH_Y;
  }
}
