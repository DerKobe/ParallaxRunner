// All art is generated at runtime as pixel art on small canvases (no external assets).
import * as THREE from 'three';
import { mulberry32 } from './level.js';

export const TS = 16;            // pixels per tile
export const ATLAS_COLS = 8;
const ATLAS_PX = TS * ATLAS_COLS;

export const SLOT = {
  FACADE: [0, 1, 2, 3], ROOF: 4, ROOF2: 5, SIDE: 6, UNDER: 7,
  PLAT_FRONT: 8, PLAT_TOP: 9, SIGN: [10, 11, 12, 13], SIGN_SIDE: 14,
  TOWER: 15, TOWER_SIDE: 16, HAZARD: 17, HAZARD_TOP: 18,
  METAL: 19, NEON_C: 20, NEON_P: 21, NEON_Y: 22, RED: 23, DARK: 24, TANK: 25, VENT: 26, GRILLE: 27,
  NEON_G: 28, WHITE: 29, TOWER2: 30, FACADE_DEEP: 31,
};

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

export function pixelTexture(c, repeat = false) {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; }
  return t;
}

// ------------------------------------------------------------------ tile atlas
export function makeAtlas() {
  const [cm, m] = canvas(ATLAS_PX, ATLAS_PX);   // albedo
  const [ce, e] = canvas(ATLAS_PX, ATLAS_PX);   // emissive
  e.fillStyle = '#000'; e.fillRect(0, 0, ATLAS_PX, ATLAS_PX);
  const rnd = mulberry32(1337);

  const slotXY = (s) => [(s % ATLAS_COLS) * TS, Math.floor(s / ATLAS_COLS) * TS];
  const px = (ctx, s, x, y, col, w = 1, h = 1) => { const [ox, oy] = slotXY(s); ctx.fillStyle = col; ctx.fillRect(ox + x, oy + y, w, h); };
  const fill = (ctx, s, col) => px(ctx, s, 0, 0, col, TS, TS);
  const noise = (s, base, cols, n) => { fill(m, s, base); for (let i = 0; i < n; i++) px(m, s, (rnd() * TS) | 0, (rnd() * TS) | 0, cols[(rnd() * cols.length) | 0]); };

  // facades: windows in a 2x3 grid, lit randomly
  const facadeBases = ['#1d1a33', '#18213a', '#221a2c', '#171b2a'];
  const lights = [['#ffb347', '#ffd38a'], ['#52f3ff', '#a0fbff'], ['#ff5ca8', '#ff9bcb'], ['#f6f2c0', '#fffbe0']];
  SLOT.FACADE.forEach((s, i) => {
    noise(s, facadeBases[i], ['#262340', '#14112a', '#2a2547'], 26);
    px(m, s, 0, 0, '#2b2848', TS, 1);          // floor slab line
    px(m, s, 0, 15, '#0f0d1c', TS, 1);
    for (let wy = 0; wy < 3; wy++) for (let wx = 0; wx < 2; wx++) {
      const x = 2 + wx * 7, y = 3 + wy * 4;
      const lit = rnd() < (i === 2 ? 0.12 : 0.32);
      const [c1, c2] = lights[(i + ((rnd() * 3) | 0)) % lights.length];
      if (lit) {
        px(m, s, x, y, c1, 5, 2); px(m, s, x, y, c2, 2, 1);
        px(e, s, x, y, c1, 5, 2); px(e, s, x, y, c2, 2, 1);
      } else {
        px(m, s, x, y, '#0a0914', 5, 2); px(m, s, x + 4, y, '#2c2a48', 1, 1);
      }
    }
    if (i === 3) { px(m, s, 13, 0, '#ff2a6d', 1, 16); px(e, s, 13, 0, '#ff2a6d', 1, 16); }
  });
  noise(SLOT.FACADE_DEEP, '#14122a', ['#1b1835', '#0e0c1f'], 30);
  for (let i = 0; i < 3; i++) { const x = 2 + ((rnd() * 10) | 0), y = 2 + i * 5; px(m, SLOT.FACADE_DEEP, x, y, '#ffb347', 2, 1); px(e, SLOT.FACADE_DEEP, x, y, '#a8722c', 2, 1); }

  // roof: tar + gravel, with a ledge strip
  noise(SLOT.ROOF, '#3a3550', ['#4a4466', '#2d2942', '#544d70'], 50);
  px(m, SLOT.ROOF, 0, 14, '#5d5680', TS, 2);
  noise(SLOT.ROOF2, '#36324c', ['#2b2840', '#4b4565', '#5a3550'], 46);
  px(m, SLOT.ROOF2, 3, 4, '#2a2638', 6, 3); px(m, SLOT.ROOF2, 0, 14, '#5d5680', TS, 2);

  noise(SLOT.SIDE, '#13112a', ['#1b1836', '#0c0b1a'], 30);
  for (let y = 3; y < 16; y += 5) { px(m, SLOT.SIDE, 6, y, '#3a2a1a', 3, 2); }
  noise(SLOT.UNDER, '#0b0a14', ['#14121f'], 12);

  // catwalk platform
  fill(m, SLOT.PLAT_FRONT, '#2e3248');
  px(m, SLOT.PLAT_FRONT, 0, 0, '#5c6488', TS, 2);
  for (let x = 0; x < TS; x += 4) { px(m, SLOT.PLAT_FRONT, x, 3, '#1a1c2c', 2, 10); }
  px(m, SLOT.PLAT_FRONT, 0, 13, '#05d9e8', TS, 2); px(e, SLOT.PLAT_FRONT, 0, 13, '#05d9e8', TS, 2);
  fill(m, SLOT.PLAT_TOP, '#3d4260');
  for (let y = 0; y < TS; y += 3) px(m, SLOT.PLAT_TOP, 0, y, '#262a3e', TS, 1);
  for (let x = 1; x < TS; x += 4) px(m, SLOT.PLAT_TOP, x, 0, '#262a3e', 1, TS);

  // hanging billboards with alien glyphs
  const signCols = [['#ff2a6d', '#3a0618'], ['#05d9e8', '#032a33'], ['#f9c80e', '#332800'], ['#39ff14', '#0a2c06']];
  SLOT.SIGN.forEach((s, i) => {
    const [fg, bg] = signCols[i];
    fill(m, s, bg); px(m, s, 0, 0, fg, TS, 1); px(m, s, 0, 15, fg, TS, 1);
    px(e, s, 0, 0, fg, TS, 1); px(e, s, 0, 15, fg, TS, 1);
    for (let gy = 0; gy < 2; gy++) for (let gx = 0; gx < 2; gx++) {
      for (let yy = 0; yy < 5; yy++) for (let xx = 0; xx < 4; xx++) {
        if (rnd() < 0.5) { const X = 2 + gx * 7 + xx, Y = 2 + gy * 7 + yy; px(m, s, X, Y, fg); px(e, s, X, Y, fg); }
      }
    }
  });
  noise(SLOT.SIGN_SIDE, '#1a1726', ['#272338', '#0f0d18'], 20);
  px(m, SLOT.SIGN_SIDE, 7, 0, '#3d3a52', 2, TS);

  // towers: concrete panels, red aviation light
  noise(SLOT.TOWER, '#2a2638', ['#332f45', '#221f30', '#3a3550'], 40);
  px(m, SLOT.TOWER, 0, 7, '#1a1826', TS, 1); px(m, SLOT.TOWER, 7, 0, '#1a1826', 1, TS);
  noise(SLOT.TOWER2, '#2a2638', ['#332f45', '#221f30'], 40);
  px(m, SLOT.TOWER2, 0, 7, '#1a1826', TS, 1);
  px(m, SLOT.TOWER2, 6, 2, '#ff3030', 3, 2); px(e, SLOT.TOWER2, 6, 2, '#ff3030', 3, 2);
  px(m, SLOT.TOWER2, 2, 10, '#05d9e8', 12, 1); px(e, SLOT.TOWER2, 2, 10, '#05d9e8', 12, 1);
  noise(SLOT.TOWER_SIDE, '#1e1b2b', ['#262236', '#15131f'], 30);

  // hazard: electrified plate with laser lines
  fill(m, SLOT.HAZARD, '#2a0008');
  for (let y = 1; y < TS; y += 4) { px(m, SLOT.HAZARD, 0, y, '#ff1f3d', TS, 1); px(e, SLOT.HAZARD, 0, y, '#ff1f3d', TS, 1); }
  for (let x = 0; x < TS; x += 5) { px(m, SLOT.HAZARD, x, 0, '#ffd0d8', 1, TS); px(e, SLOT.HAZARD, x, 0, '#ff8090', 1, TS); }
  fill(m, SLOT.HAZARD_TOP, '#ff1f3d'); fill(e, SLOT.HAZARD_TOP, '#ff1f3d');
  for (let i = 0; i < 20; i++) { const X = (rnd() * TS) | 0, Y = (rnd() * TS) | 0; px(m, SLOT.HAZARD_TOP, X, Y, '#fff'); px(e, SLOT.HAZARD_TOP, X, Y, '#fff'); }

  // deco materials
  noise(SLOT.METAL, '#4b4f66', ['#5b6078', '#3a3d52'], 30);
  for (let y = 2; y < TS; y += 3) px(m, SLOT.METAL, 2, y, '#2d3042', 12, 1);
  [[SLOT.NEON_C, '#05d9e8'], [SLOT.NEON_P, '#ff2a6d'], [SLOT.NEON_Y, '#f9c80e'], [SLOT.RED, '#ff2020'], [SLOT.NEON_G, '#39ff14'], [SLOT.WHITE, '#e8f6ff']]
    .forEach(([s, c]) => { fill(m, s, c); fill(e, s, c); });
  noise(SLOT.DARK, '#15141f', ['#1e1c2b'], 20);
  noise(SLOT.TANK, '#5a3a2a', ['#6a4532', '#47301f', '#3a2618'], 40);
  for (let y = 3; y < TS; y += 6) px(m, SLOT.TANK, 0, y, '#2c1c12', TS, 1);
  noise(SLOT.VENT, '#3c3f52', ['#2b2d3c'], 10);
  for (let y = 2; y < 14; y += 2) px(m, SLOT.VENT, 2, y, '#16171f', 12, 1);
  fill(m, SLOT.GRILLE, '#22242f');
  for (let x = 1; x < TS; x += 3) px(m, SLOT.GRILLE, x, 0, '#3b3f52', 1, TS);

  return { map: pixelTexture(cm), emissive: pixelTexture(ce) };
}

// uv rect for an atlas slot (inset by a tiny amount to avoid bleeding)
export function slotUV(s) {
  const u0 = (s % ATLAS_COLS) / ATLAS_COLS, v1 = 1 - Math.floor(s / ATLAS_COLS) / ATLAS_COLS;
  const d = 1 / ATLAS_COLS, inset = 0.0004;
  return [u0 + inset, v1 - d + inset, u0 + d - inset, v1 - inset];
}

// ------------------------------------------------------------------ runner sprite sheet
export const FRAME = { IDLE: 0, RUN: 2, RUN_N: 6, JUMP: 8, FALL: 9, DJUMP: 10, DJUMP_N: 4, WALL: 14, SLIDE: 15, DEAD: 17 };
export const SHEET_FRAMES = 18;
export const CELL = 32;

function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgbHex([r, g, b]) { return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
export function shade(hex, f) { return rgbHex(hexToRgb(hex).map(v => v * f)); }
export function mix(a, b, t) { const A = hexToRgb(a), B = hexToRgb(b); return rgbHex(A.map((v, i) => v + (B[i] - v) * t)); }

class PixelCanvas {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Array(w * h).fill(null); }
  set(x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = c; }
  get(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.d[y * this.w + x] : null; }
  stamp(x, y, c, t) { const o = Math.floor((t - 1) / 2); for (let i = 0; i < t; i++) for (let j = 0; j < t; j++) this.set(x - o + i, y - o + j, c); }
  line(x0, y0, x1, y1, c, t = 2) {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.5));
    for (let i = 0; i <= n; i++) this.stamp(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c, t);
  }
  poly(pts, c) {
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++)
      for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i], [xj, yj] = pts[j];
          if ((yi > y + 0.5) !== (yj > y + 0.5) && x + 0.5 < (xj - xi) * (y + 0.5 - yi) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) this.set(x, y, c);
      }
  }
  outline(c) {
    const add = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.get(x, y)) continue;
      if (this.get(x + 1, y) || this.get(x - 1, y) || this.get(x, y + 1) || this.get(x, y - 1)) add.push([x, y]);
    }
    for (const [x, y] of add) this.set(x, y, c);
  }
  blit(ctx, ox, oy, rot = 0, cx = 16, cy = 18) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const c = this.get(x, y); if (!c) continue;
      let X = x, Y = y;
      if (rot) {
        // rotate by multiples of 90° for crisp pixels
        const dx = x - cx, dy = y - cy, k = ((rot % 4) + 4) % 4;
        const [rx, ry] = k === 1 ? [-dy, dx] : k === 2 ? [-dx, -dy] : [dy, -dx];
        X = cx + rx; Y = cy + ry;
      }
      if (X < 0 || Y < 0 || X >= this.w || Y >= this.h) continue;
      ctx.fillStyle = c; ctx.fillRect(ox + X, oy + Y, 1, 1);
    }
  }
}

const dirv = (a) => [Math.sin(a), Math.cos(a)]; // angle from straight down, + = forward (right)

function drawRunner(pc, pose, pal) {
  const hipX = 16 + (pose.hipX ?? 0), hipY = 31 - (pose.hipY ?? 12);
  const lean = pose.lean ?? 0;
  const T = 9, THIGH = 6, SHIN = 6, UP = 5, FORE = 5;
  const neck = [hipX + Math.sin(lean) * T, hipY - Math.cos(lean) * T];
  const shoulder = [neck[0] - Math.sin(lean) * 1.5, neck[1] + Math.cos(lean) * 1.5];

  const leg = (l, c, boot) => {
    const [ta, sa] = l;
    const k = [hipX + dirv(ta)[0] * THIGH, hipY + dirv(ta)[1] * THIGH];
    const f = [k[0] + dirv(sa)[0] * SHIN, k[1] + dirv(sa)[1] * SHIN];
    pc.line(hipX, hipY, k[0], k[1], c, 2);
    pc.line(k[0], k[1], f[0], f[1], c, 2);
    pc.stamp(f[0], f[1], boot, 2); pc.set(f[0] + 1.5, f[1] + 0.5, boot);
  };
  const arm = (a, c, hand) => {
    const [ua, fa] = a;
    const e = [shoulder[0] + dirv(ua)[0] * UP, shoulder[1] + dirv(ua)[1] * UP];
    const h = [e[0] + dirv(fa)[0] * FORE, e[1] + dirv(fa)[1] * FORE];
    pc.line(shoulder[0], shoulder[1], e[0], e[1], c, 2);
    pc.line(e[0], e[1], h[0], h[1], c, 2);
    pc.set(h[0], h[1], hand);
  };

  arm(pose.arms[0], pal.coatDark, pal.skinDark);
  leg(pose.legs[0], pal.pantsDark, pal.boot);

  // trench coat body + tail
  const sw = pose.coat ?? 0.5;
  const px = Math.cos(lean), py = Math.sin(lean);
  const tailLen = 7;
  const tailAng = -0.25 - sw; // trails behind
  const hemB = [hipX + Math.sin(tailAng) * tailLen - 1, hipY + Math.cos(tailAng) * tailLen];
  const hemF = [hipX + 2 + Math.sin(-0.1 - sw * 0.3) * 5, hipY + Math.cos(-0.1 - sw * 0.3) * 5];
  pc.poly([
    [neck[0] - px * 2.5, neck[1] - py * 2.5],
    [neck[0] + px * 2.5, neck[1] + py * 2.5],
    [hipX + 2.5, hipY],
    hemF, hemB,
    [hipX - 3, hipY - 1],
  ], pal.coat);
  // coat lapel highlight + belt
  pc.line(neck[0] + px * 1.5, neck[1] + py * 1.5, hipX + 1.5, hipY - 0.5, pal.coatLight, 1);
  pc.line(hipX - 2, hipY - 1, hipX + 2, hipY - 1, pal.belt, 1);

  leg(pose.legs[1], pal.pants, pal.boot);

  // head: hair, face, glowing visor
  const hc = [neck[0] + Math.sin(lean) * 3, neck[1] - Math.cos(lean) * 3];
  for (let y = -3; y <= 2; y++) for (let x = -2; x <= 3; x++) pc.set(hc[0] + x, hc[1] + y, pal.skin);
  for (let x = -2; x <= 3; x++) { pc.set(hc[0] + x, hc[1] - 3, pal.hair); pc.set(hc[0] + x, hc[1] - 4, pal.hair); }
  for (let y = -2; y <= 1; y++) pc.set(hc[0] - 2, hc[1] + y, pal.hair);
  pc.set(hc[0] - 3, hc[1] - 3, pal.hair); pc.set(hc[0] - 3, hc[1] - 2, pal.hair);
  for (let x = 0; x <= 4; x++) pc.set(hc[0] + x, hc[1] - 1, pal.visor);
  pc.set(hc[0] + 4, hc[1] - 1, pal.visorHi);
  // collar
  pc.set(neck[0] - px * 2, neck[1] - py * 2 - 1, pal.coatLight);
  pc.set(neck[0] - px * 2, neck[1] - py * 2 - 2, pal.coat);

  arm(pose.arms[1], pal.coatLight2, pal.skin);
}

function runPose(i) {
  const q = (i / 6) * Math.PI * 2;
  const L = (p) => { const th = 0.85 * Math.sin(p); return [th, th - (0.25 + 1.0 * Math.max(0, Math.cos(p)))]; };
  const A = (p) => { const u = -0.95 * Math.sin(p); return [u, u + 1.3]; };
  return {
    lean: 0.3, hipY: 11 + Math.round(Math.abs(Math.sin(q))), coat: 0.55 + 0.25 * Math.sin(2 * q),
    legs: [L(q + Math.PI), L(q)], arms: [A(q), A(q + Math.PI)],
  };
}

const POSES = {
  idle0: { lean: 0.05, hipY: 12, coat: 0.05, legs: [[-0.12, -0.05], [0.12, 0.05]], arms: [[-0.15, -0.05], [0.15, 0.25]] },
  idle1: { lean: 0.02, hipY: 11, coat: 0.0, legs: [[-0.18, -0.02], [0.18, 0.02]], arms: [[-0.12, -0.02], [0.12, 0.3]] },
  jump: { lean: 0.15, hipY: 12, coat: 0.95, legs: [[-0.4, -0.75], [1.1, 0.15]], arms: [[-0.7, -0.3], [2.3, 2.7]] },
  fall: { lean: 0.05, hipY: 12, coat: 1.35, legs: [[-0.3, -0.5], [0.55, 0.15]], arms: [[-1.7, -2.0], [1.5, 1.2]] },
  tuck: { lean: 0.45, hipY: 10, coat: 1.0, legs: [[1.5, -0.2], [1.8, 0.1]], arms: [[0.7, 1.6], [0.9, 1.9]] },
  wall: { lean: -0.12, hipY: 12, coat: -0.35, hipX: 1, legs: [[-0.7, -0.15], [0.55, 0.05]], arms: [[-2.5, -2.8], [0.9, 0.6]] },
  slide0: { lean: -1.15, hipY: 4, hipX: -3, coat: 1.25, legs: [[1.0, -0.4], [1.45, 1.55]], arms: [[-1.2, -1.5], [1.7, 2.2]] },
  slide1: { lean: -1.1, hipY: 4, hipX: -3, coat: 1.4, legs: [[1.05, -0.35], [1.45, 1.55]], arms: [[-1.25, -1.5], [1.6, 2.1]] },
};

export function makeRunnerSheet(color) {
  const pal = {
    coat: shade(color, 0.62), coatDark: shade(color, 0.38), coatLight: color, coatLight2: shade(color, 0.8),
    pants: '#232338', pantsDark: '#16162a', boot: '#0a0a12', belt: '#0b0b12',
    skin: '#e8b48f', skinDark: '#b88466', hair: '#141019', visor: mix(color, '#ffffff', 0.55), visorHi: '#ffffff',
  };
  const [c, ctx] = canvas(CELL * SHEET_FRAMES, CELL);
  const draw = (frame, pose, rot = 0) => {
    const pc = new PixelCanvas(CELL, CELL);
    drawRunner(pc, pose, pal);
    pc.outline('#06040c');
    pc.blit(ctx, frame * CELL, 0, rot, 16, 20);
  };
  draw(0, POSES.idle0); draw(1, POSES.idle1);
  for (let i = 0; i < 6; i++) draw(FRAME.RUN + i, runPose(i));
  draw(FRAME.JUMP, POSES.jump); draw(FRAME.FALL, POSES.fall);
  for (let i = 0; i < 4; i++) draw(FRAME.DJUMP + i, POSES.tuck, i);
  draw(FRAME.WALL, POSES.wall);
  draw(FRAME.SLIDE, POSES.slide0); draw(FRAME.SLIDE + 1, POSES.slide1);
  draw(FRAME.DEAD, POSES.fall);
  return pixelTexture(c);
}

// ------------------------------------------------------------------ backgrounds
export function makeSky() {
  const [c, ctx] = canvas(4, 256);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#05010d');
  g.addColorStop(0.35, '#140726');
  g.addColorStop(0.62, '#3b0f45');
  g.addColorStop(0.8, '#8a2550');
  g.addColorStop(0.92, '#d8573f');
  g.addColorStop(1, '#ff8a3d');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 256);
  // quantise into bands for the retro look
  const img = ctx.getImageData(0, 0, 4, 256);
  for (let i = 0; i < img.data.length; i += 4) for (let k = 0; k < 3; k++) img.data[i + k] = Math.round(img.data[i + k] / 12) * 12;
  ctx.putImageData(img, 0, 0);
  const t = pixelTexture(c);
  return t;
}

function glyph(ctx, x, y, s, col, rnd) {
  ctx.fillStyle = col;
  for (let yy = 0; yy < 5; yy++) for (let xx = 0; xx < 3; xx++) if (rnd() < 0.55) ctx.fillRect(x + xx * s, y + yy * s, s, s);
}

export function pixelText(ctx, text, x, y, col, size = 8) {
  // render text then hard-threshold alpha so it stays crisp when magnified
  const [tc, tctx] = canvas(Math.ceil(text.length * size * 0.75) + 4, size + 4);
  tctx.font = `bold ${size}px monospace`;
  tctx.textBaseline = 'top';
  tctx.fillStyle = col;
  tctx.fillText(text, 1, 1);
  const img = tctx.getImageData(0, 0, tc.width, tc.height);
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = img.data[i] > 110 ? 255 : 0;
  tctx.putImageData(img, 0, 0);
  ctx.drawImage(tc, x, y);
  return tc.width;
}

export function makeSkyline(layer) {
  const W = 1024, Hh = 256;
  const [c, ctx] = canvas(W, Hh);
  const rnd = mulberry32(99 + layer * 17);
  const cfg = [
    { base: '#2a1440', win: ['#6b3a7a', '#8a4a6a'], minH: 60, maxH: 190, dens: 0.04, bill: 0 },
    { base: '#1a0c2c', win: ['#ff9a4a', '#b05cff', '#4ad8ff'], minH: 40, maxH: 170, dens: 0.06, bill: 3 },
    { base: '#0d0718', win: ['#ffb347', '#05d9e8', '#ff2a6d', '#f6f2c0'], minH: 30, maxH: 150, dens: 0.08, bill: 4 },
  ][layer];
  let x = 0;
  const towers = [];
  while (x < W) {
    const w = 14 + ((rnd() * 46) | 0);
    const h = cfg.minH + ((rnd() * (cfg.maxH - cfg.minH)) | 0);
    towers.push([x, w, h]);
    x += w + ((rnd() * 6) | 0) - 2;
  }
  for (const [bx, bw, bh] of towers) {
    const top = Hh - bh;
    ctx.fillStyle = cfg.base;
    ctx.fillRect(bx, top, bw, bh);
    // stepped crown / antenna
    if (rnd() < 0.5) ctx.fillRect(bx + bw * 0.25, top - 6, bw * 0.5, 6);
    if (rnd() < 0.4) {
      const ax = bx + ((bw / 2) | 0);
      ctx.fillRect(ax, top - 20, 1, 20);
      ctx.fillStyle = '#ff3030'; ctx.fillRect(ax, top - 21, 1, 1);
    }
    // windows
    for (let wy = top + 3; wy < Hh - 2; wy += 3) for (let wx = bx + 2; wx < bx + bw - 2; wx += 3) {
      if (rnd() < cfg.dens) { ctx.fillStyle = cfg.win[(rnd() * cfg.win.length) | 0]; ctx.fillRect(wx, wy, 1 + (layer === 2 && rnd() < 0.3 ? 1 : 0), 1); }
    }
  }
  // giant holo billboards
  const words = ['RUN OR DIE', 'CH-77 LIVE', 'OMNI·SYN', 'NEO 2049', 'KILLSTREAM', 'RATINGS!', '強化人間', 'ネオン'];
  for (let i = 0; i < cfg.bill; i++) {
    const t = towers[(rnd() * towers.length) | 0];
    const bw = 34 + ((rnd() * 30) | 0), bh = 16 + ((rnd() * 18) | 0);
    const bx = t[0] + ((rnd() * 10) | 0) - 5, by = Hh - t[2] + 10 + ((rnd() * 40) | 0);
    const col = ['#ff2a6d', '#05d9e8', '#f9c80e', '#39ff14', '#b05cff'][(rnd() * 5) | 0];
    ctx.fillStyle = shade(col, 0.22); ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = col; ctx.fillRect(bx, by, bw, 1); ctx.fillRect(bx, by + bh - 1, bw, 1);
    if (rnd() < 0.5) {
      for (let g = 0; g < Math.floor((bw - 4) / 5); g++) glyph(ctx, bx + 3 + g * 5, by + 4, 1, col, rnd);
    } else {
      pixelText(ctx, words[(rnd() * words.length) | 0], bx + 2, by + bh / 2 - 5, col, 8);
    }
  }
  const t = pixelTexture(c, true);
  return t;
}

export function makeGlowSprite(color, size = 16) {
  const [c, ctx] = canvas(size, size);
  const r = size / 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const d = Math.hypot(x + 0.5 - r, y + 0.5 - r) / r;
    if (d > 1) continue;
    const a = Math.round((1 - d) * 4) / 4;
    ctx.fillStyle = color; ctx.globalAlpha = a; ctx.fillRect(x, y, 1, 1);
  }
  return pixelTexture(c);
}

export function makeSpinnerTexture() {
  // flying police car ("spinner") side view, 24x10
  const [c, ctx] = canvas(24, 10);
  const p = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
  p(3, 3, 18, 4, '#2b2f45'); p(6, 1, 10, 2, '#3c4260'); p(8, 1, 6, 2, '#79c8ff');
  p(1, 5, 22, 2, '#1b1e2e'); p(0, 5, 2, 1, '#fff4c0'); p(22, 5, 2, 1, '#ff2020');
  p(10, 0, 2, 1, '#ff2020'); p(12, 0, 2, 1, '#2060ff'); p(4, 7, 4, 2, '#ffb347'); p(16, 7, 4, 2, '#ffb347');
  return pixelTexture(c);
}

export function makeHunterTexture() {
  // STALKER hunter-killer drone, 32x20, facing right
  const [c, ctx] = canvas(32, 20);
  const p = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
  // rotor arms + rotors
  p(1, 2, 9, 1, '#5d6280'); p(22, 2, 9, 1, '#5d6280'); p(0, 1, 11, 1, '#9aa0bf'); p(21, 1, 11, 1, '#9aa0bf');
  p(8, 3, 2, 3, '#3a3d52'); p(22, 3, 2, 3, '#3a3d52');
  // armoured hull
  p(7, 5, 18, 9, '#1c1e2b'); p(9, 4, 14, 1, '#2d3044'); p(8, 14, 16, 2, '#14151f');
  p(7, 5, 18, 1, '#3c4060'); p(24, 6, 2, 7, '#2d3044');
  // warning stripes
  for (let x = 9; x < 23; x += 4) { p(x, 12, 2, 1, '#f9c80e'); }
  // mono-eye
  p(17, 7, 7, 5, '#0a0a10'); p(19, 8, 4, 3, '#ff2030'); p(21, 8, 1, 1, '#ffd0d0');
  // thrusters
  p(5, 9, 3, 4, '#3a3d52'); p(3, 10, 2, 2, '#ff8c00'); p(2, 10, 1, 2, '#f9c80e');
  // gun barrel + antenna
  p(24, 13, 6, 1, '#5d6280'); p(29, 12, 2, 3, '#3a3d52');
  p(10, 2, 1, 2, '#5d6280'); p(10, 1, 1, 1, '#ff2030');
  // underside lights
  p(11, 16, 2, 1, '#05d9e8'); p(19, 16, 2, 1, '#05d9e8');
  return pixelTexture(c);
}

// Neon grave cross for course markers, 12x18
export function makeCrossTexture(color) {
  const [c, ctx] = canvas(12, 18);
  const p = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
  p(4, 0, 4, 18, shade(color, 0.35)); p(0, 4, 12, 4, shade(color, 0.35));   // glow halo
  p(5, 1, 2, 16, color); p(1, 5, 10, 2, color);                             // neon tube
  p(5, 1, 1, 16, mix(color, '#ffffff', 0.6)); p(1, 5, 10, 1, mix(color, '#ffffff', 0.6));
  p(3, 16, 6, 2, '#2b2f45');                                                // little base
  return pixelTexture(c);
}

// Patrolling enemies, two animation frames each (facing right)
export function makeEnemyTextures() {
  const sheet = (w, h, draw) => [0, 1].map((f) => {
    const [c, ctx] = canvas(w, h);
    const p = (x, y, ww, hh, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, ww, hh); };
    draw(p, f);
    // dark pixel outline so they read against the roofs (same look as the runners)
    const img = ctx.getImageData(0, 0, w, h), d = img.data, out = new Uint8ClampedArray(d);
    const a = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (a(x, y) || !(a(x + 1, y) || a(x - 1, y) || a(x, y + 1) || a(x, y - 1))) continue;
      const i = (y * w + x) * 4; out[i] = 6; out[i + 1] = 4; out[i + 2] = 12; out[i + 3] = 255;
    }
    ctx.putImageData(new ImageData(out, w, h), 0, 0);
    return pixelTexture(c);
  });
  // CRAWLER: armoured spider-bot, 24x16
  const crawler = sheet(24, 16, (p, f) => {
    const legs = f ? [[3, 0], [9, 1], [15, 0], [20, 1]] : [[4, 1], [10, 0], [14, 1], [19, 0]];
    for (const [x, o] of legs) { p(x, 9, 1, 3, '#8a90b5'); p(x - 1 + o * 2, 12, 1, 3, '#5d6280'); p(x - 2 + o * 3, 14, 2, 1, '#2b2f45'); }
    p(5, 4, 14, 6, '#454b6e'); p(7, 3, 10, 1, '#6a7199'); p(6, 4, 12, 1, '#7c84b0');
    p(5, 9, 14, 1, '#14151f');
    for (let x = 7; x < 17; x += 3) p(x, 7, 2, 1, '#f9c80e');
    p(16, 5, 3, 2, '#0a0a10'); p(17, 5, 2, 2, f ? '#ff2030' : '#ff6070'); p(18, 5, 1, 1, '#ffd0d0');
    p(9, 1, 1, 2, '#5d6280'); p(9, 0, 1, 1, f ? '#ff2030' : '#5a1018');
  });
  // SENTRY: spiked floating mine with a pulsing core, 16x16
  const sentry = sheet(16, 16, (p, f) => {
    const spikes = f ? [[7, 0, 2, 3], [7, 13, 2, 3], [0, 7, 3, 2], [13, 7, 3, 2]] : [[2, 2, 2, 2], [12, 2, 2, 2], [2, 12, 2, 2], [12, 12, 2, 2]];
    for (const [x, y, w, h] of spikes) p(x, y, w, h, '#8a8fa8');
    p(4, 3, 8, 10, '#22263a'); p(3, 4, 10, 8, '#22263a'); p(5, 3, 6, 1, '#3c4060'); p(3, 5, 1, 6, '#3c4060');
    p(5, 5, 6, 6, f ? '#ff2a6d' : '#7a0f35'); p(6, 6, 4, 4, f ? '#ffd0e0' : '#ff2a6d'); p(7, 7, 2, 2, '#ffffff');
  });
  // HOVER: police glider with light bar, 32x12
  const hover = sheet(32, 12, (p, f) => {
    p(3, 4, 26, 5, '#1c1e2b'); p(6, 3, 18, 1, '#2d3044'); p(3, 8, 26, 1, '#14151f');
    p(9, 1, 10, 3, '#2d3044'); p(11, 2, 6, 2, '#79c8ff'); p(12, 2, 2, 1, '#e8f6ff');
    p(4, 6, 24, 1, '#e8f6ff');                       // POLICE stripe
    p(12, 0, 3, 1, f ? '#ff2020' : '#401010'); p(15, 0, 3, 1, f ? '#102040' : '#2060ff');
    p(28, 5, 2, 2, '#fff4c0'); p(1, 5, 2, 2, '#ff2020');
    p(6, 9, 4, 2, f ? '#ffb347' : '#ff8c00'); p(22, 9, 4, 2, f ? '#ff8c00' : '#ffb347');
  });
  return { crawler, sentry, hover };
}

export function makeDroneTexture() {
  // TV camera drone, 12x8
  const [c, ctx] = canvas(12, 8);
  const p = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
  p(0, 0, 4, 1, '#8a8fa8'); p(8, 0, 4, 1, '#8a8fa8'); p(1, 1, 1, 2, '#555a70'); p(10, 1, 1, 2, '#555a70');
  p(2, 2, 8, 4, '#2b2f45'); p(3, 3, 3, 2, '#111'); p(4, 3, 1, 1, '#ff2a6d');
  p(8, 3, 1, 1, '#ff2020'); p(4, 6, 4, 1, '#3c4260');
  return pixelTexture(c);
}
