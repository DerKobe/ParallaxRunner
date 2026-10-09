// Deterministic procedural course. Every client builds the identical track from the server seed,
// so all lanes show the same rooftops – only at different positions.

export const H = 40;          // tile rows
export const EMPTY = 0, BUILDING = 1, PLATFORM = 2, HAZARD = 3, SIGN = 4, TOWER = 5;
export const HAZARD_HEIGHT = 0.55;

export function isSolid(t) { return t === BUILDING || t === PLATFORM || t === SIGN || t === TOWER; }

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Decoration codes (render only, no collision)
export const DECO = { NONE: 0, AC: 1, ANTENNA: 2, LAMP: 3, TANK: 4, VENT: 5, DISH: 6 };

export class Level {
  constructor(seed) {
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.cols = [];
    this.deco = [];
    this.surface = [];   // walkable ground height per column (for decoration placement / spawn)
    this.block = [];     // building block id per column (neon colour grouping)
    this.blockId = 0;
    this.g = 4;
    this.genStart();
  }

  // ---- public API
  get(x, y) {
    if (y < 0 || y >= H) return EMPTY;
    if (x < 0) return y < 22 ? TOWER : EMPTY; // the starting wall
    this.ensure(x);
    return this.cols[x][y];
  }
  ensure(x) { while (this.cols.length <= x) this.genSegment(); }

  // ---- helpers
  r(a, b) { return a + Math.floor(this.rng() * (b - a + 1)); }
  chance(p) { return this.rng() < p; }
  pick(arr) { return arr[Math.floor(this.rng() * arr.length)]; }
  get difficulty() { return Math.min(1, this.cols.length / 1400); }

  pushCol(ground, opts = {}) {
    const c = new Uint8Array(H);
    for (let y = 0; y < ground; y++) c[y] = BUILDING;
    this.cols.push(c);
    this.surface.push(ground);
    this.block.push(ground > 0 ? this.blockId : -1);
    let deco = DECO.NONE;
    if (ground > 0 && !opts.noDeco && this.rng() < 0.22) {
      deco = this.pick([DECO.AC, DECO.AC, DECO.ANTENNA, DECO.LAMP, DECO.TANK, DECO.VENT, DECO.DISH]);
    }
    this.deco.push(deco);
    return c;
  }
  newBlock() { this.blockId++; }
  clampG(g) { return Math.max(2, Math.min(12, g)); }

  flat(n, opts) { for (let i = 0; i < n; i++) this.pushCol(this.g, opts); }
  pit(n) { this.newBlock(); for (let i = 0; i < n; i++) this.pushCol(0); this.newBlock(); }

  genStart() {
    this.newBlock();
    this.flat(16, { noDeco: true });
  }

  genSegment() {
    const d = this.difficulty;
    const table = [
      ['flat', 1.2 - d * 0.6],
      ['gap', 2.2],
      ['steps', 1.2],
      ['platforms', 1.0 + d],
      ['slide', 1.0 + d * 0.5],
      ['hazard', 1.0 + d],
      ['wall', 0.9],
      ['chimney', 0.5 + d * 0.8],
      ['drop', 0.6],
      ['combo', d * 1.5],
    ];
    let total = 0; for (const [, w] of table) total += w;
    let roll = this.rng() * total, kind = 'flat';
    for (const [k, w] of table) { roll -= w; if (roll <= 0) { kind = k; break; } }
    if (kind === this.lastKind && kind !== 'gap') kind = 'gap';
    this.lastKind = kind;
    this['seg_' + kind](d);
  }

  seg_flat() { this.flat(this.r(4, 9)); }

  seg_gap(d) {
    const ng = this.clampG(this.g + this.r(-3, 2));
    let w = this.r(2, 3 + Math.round(3 * d));
    if (ng > this.g) w = Math.min(w, 4);
    this.pit(w);
    this.g = ng;
    this.flat(this.r(3, 6));
  }

  seg_steps() {
    const n = this.r(2, 4);
    const dir = this.g > 8 ? -1 : this.g < 4 ? 1 : this.pick([-1, 1]);
    for (let i = 0; i < n; i++) {
      this.g = this.clampG(this.g + dir * this.r(1, 2));
      this.newBlock();
      this.flat(this.r(2, 4));
    }
    this.flat(2);
  }

  seg_drop() {
    this.g = this.clampG(this.g - this.r(2, 4));
    this.newBlock();
    this.flat(this.r(4, 7));
  }

  seg_platforms(d) {
    // a wide chasm crossed via floating catwalks
    const n = this.r(2, 3 + Math.round(d));
    let py = this.g;
    this.newBlock();
    for (let i = 0; i < n; i++) {
      const gap = this.r(2, 3 + Math.round(d));
      for (let k = 0; k < gap; k++) this.pushCol(0);
      py = Math.max(3, Math.min(14, py + this.r(-2, 2)));
      const len = this.r(2, 4 - Math.round(d));
      for (let k = 0; k < len; k++) {
        const c = this.pushCol(0, { noDeco: true });
        c[py - 1] = PLATFORM;
      }
    }
    for (let k = 0; k < this.r(2, 3); k++) this.pushCol(0);
    this.g = this.clampG(py + this.r(-2, 1));
    this.newBlock();
    this.flat(this.r(3, 5));
  }

  seg_slide(d) {
    // a hanging billboard you can only pass by sliding under it
    this.flat(this.r(3, 4));
    const len = this.r(3, 5 + Math.round(d * 3));
    for (let i = 0; i < len; i++) {
      const c = this.pushCol(this.g, { noDeco: true });
      for (let y = this.g + 1; y < Math.min(H, this.g + 10); y++) c[y] = SIGN;
    }
    this.flat(this.r(2, 4));
  }

  seg_hazard(d) {
    this.flat(this.r(2, 4));
    const w = this.r(2, 3 + Math.round(d * 2));
    for (let i = 0; i < w; i++) {
      const c = this.pushCol(this.g, { noDeco: true });
      c[this.g] = HAZARD;
    }
    this.flat(this.r(2, 4));
  }

  seg_wall() {
    // a step too high for a single jump: needs the double jump
    this.flat(2);
    this.g = this.clampG(this.g + this.r(4, 5));
    this.newBlock();
    this.flat(this.r(4, 6));
    if (this.chance(0.5)) this.seg_drop();
  }

  seg_chimney() {
    // tower too high for a double jump; a floating pillar on the left enables wall-jumping up
    const base = this.g;
    const height = this.r(8, 10);
    this.flat(3);
    const pillarX = this.cols.length;
    const pc = this.pushCol(base, { noDeco: true });
    for (let y = base + 3; y < base + height + 2 && y < H; y++) pc[y] = TOWER;
    this.flat(3, { noDeco: true });
    this.newBlock();
    this.g = base + height;
    const towerW = this.r(4, 7);
    for (let i = 0; i < towerW; i++) {
      const c = this.pushCol(this.g, { noDeco: i === 0 });
      for (let y = 0; y < this.g; y++) c[y] = TOWER;
    }
    this.pillarHint = pillarX;
    // jump back down onto lower roofs
    this.pit(this.r(2, 3));
    this.g = this.clampG(base + this.r(-1, 2));
    this.newBlock();
    this.flat(this.r(4, 6));
  }

  seg_combo(d) {
    // hazard strip right before a gap, then a slide
    this.flat(3);
    for (let i = 0; i < 2; i++) { const c = this.pushCol(this.g, { noDeco: true }); c[this.g] = HAZARD; }
    this.pit(this.r(2, 3));
    this.newBlock();
    this.seg_slide(d);
  }
}
