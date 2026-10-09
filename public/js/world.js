// 3D presentation of the 2D game: shared chunk geometry, per-player lanes, background city, rain.
import * as THREE from 'three';
import { H, EMPTY, BUILDING, PLATFORM, HAZARD, SIGN, TOWER, DECO, isSolid, hash2 } from './level.js';
import {
  SLOT, slotUV, makeAtlas, makeRunnerSheet, FRAME, SHEET_FRAMES, makeSky, makeSkyline,
  makeSpinnerTexture, makeDroneTexture, makeGlowSprite, pixelTexture,
} from './textures.js';
import { ANIM } from './player.js';

export const CHUNK = 16;
const DEPTH = 14;          // how far buildings extend below y=0
const ZF = 1.5, ZB = -1.5; // lane depth
// Lanes sit directly behind each other (gap = lane depth), so all courses form one connected city block.
export const LANE_GAP = ZF - ZB;

// ------------------------------------------------------------------ geometry builder
class GeoBuilder {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.idx = []; }
  quad(a, b, c, d, n, slot) {
    const [u0, v0, u1, v1] = slotUV(slot);
    const i = this.pos.length / 3;
    this.pos.push(...a, ...b, ...c, ...d);
    for (let k = 0; k < 4; k++) this.nor.push(...n);
    this.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  front(x0, y0, x1, y1, z, s) { this.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], [0, 0, 1], s); }
  top(x0, x1, y, z0, z1, s) { this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], s); }
  bottom(x0, x1, y, z0, z1, s) { this.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, -1, 0], s); }
  right(x, y0, y1, z0, z1, s) { this.quad([x, y0, z1], [x, y0, z0], [x, y1, z0], [x, y1, z1], [1, 0, 0], s); }
  left(x, y0, y1, z0, z1, s) { this.quad([x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0], [-1, 0, 0], s); }
  box(x0, y0, z0, x1, y1, z1, f) {
    const side = f.side ?? f.front;
    if (f.front != null) this.front(x0, y0, x1, y1, z1, f.front);
    if (f.top !== false) this.top(x0, x1, y1, z0, z1, f.top ?? side);
    if (f.bottom) this.bottom(x0, x1, y0, z0, z1, f.bottom);
    this.left(x0, y0, y1, z0, z1, side);
    this.right(x1, y0, y1, z0, z1, side);
  }
  build() {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

const NEONS = [SLOT.NEON_C, SLOT.NEON_P, SLOT.NEON_Y, SLOT.NEON_G];

function tileAt(level, x, y) {
  if (y >= 0) return level.get(x, y);
  const b = level.get(x, 0);
  return b === BUILDING || b === TOWER ? b : EMPTY;
}

function buildChunk(level, ci) {
  const main = new GeoBuilder(), haz = new GeoBuilder();
  const x0 = ci * CHUNK;
  level.ensure(x0 + CHUNK + 2);
  const solid = (x, y) => isSolid(tileAt(level, x, y));

  for (let x = x0; x < x0 + CHUNK; x++) {
    for (let y = -DEPTH; y < H; y++) {
      const t = tileAt(level, x, y);
      if (t === EMPTY) continue;
      if (t === HAZARD) {
        const f = { front: SLOT.HAZARD, top: SLOT.HAZARD_TOP, side: SLOT.HAZARD };
        haz.box(x + 0.03, y, ZB + 0.2, x + 0.97, y + 0.5, ZF - 0.2, f);
        main.box(x + 0.0, y, ZB + 0.1, x + 0.12, y + 0.7, ZF - 0.1, { front: SLOT.DARK, top: SLOT.RED });
        continue;
      }
      let front, top, side, bottom = SLOT.UNDER;
      const h = hash2(x, y);
      if (t === BUILDING) {
        front = y < -3 && h < 0.5 ? SLOT.FACADE_DEEP : SLOT.FACADE[Math.floor(hash2(x >> 1, y) * 4)];
        top = h < 0.5 ? SLOT.ROOF : SLOT.ROOF2; side = SLOT.SIDE;
      } else if (t === PLATFORM) {
        front = SLOT.PLAT_FRONT; top = SLOT.PLAT_TOP; side = SLOT.DARK; bottom = SLOT.GRILLE;
      } else if (t === SIGN) {
        let sx = x; while (sx > x - 12 && tileAt(level, sx - 1, y) === SIGN) sx--;
        front = SLOT.SIGN[Math.floor(hash2(sx, 3) * 4)]; top = SLOT.SIGN_SIDE; side = SLOT.SIGN_SIDE; bottom = SLOT.DARK;
      } else { // TOWER
        front = (y % 5 === 0 && h < 0.7) ? SLOT.TOWER2 : SLOT.TOWER; top = SLOT.ROOF; side = SLOT.TOWER_SIDE;
      }
      main.front(x, y, x + 1, y + 1, ZF, front);
      if (!solid(x, y + 1)) main.top(x, x + 1, y + 1, ZB, ZF, top);
      if (y > -DEPTH && !solid(x, y - 1)) main.bottom(x, x + 1, y, ZB, ZF, bottom);
      if (!solid(x - 1, y)) main.left(x, y, y + 1, ZB, ZF, side);
      if (!solid(x + 1, y)) main.right(x + 1, y, y + 1, ZB, ZF, side);

      // neon roof edge
      if (t === BUILDING && y >= 0 && !solid(x, y + 1)) {
        const bid = level.block[x] ?? 0;
        if (hash2(bid, 5) < 0.75) {
          const n = NEONS[Math.floor(hash2(bid, 9) * 4)];
          main.box(x, y + 0.86, ZF, x + 1, y + 1, ZF + 0.08, { front: n, top: n });
        }
      }
    }
    if (x < 0) continue;
    const g = level.surface[x];
    if (g <= 0 || level.get(x, g - 1) !== BUILDING && level.get(x, g - 1) !== TOWER) continue;

    // vertical neon signs on facades
    if (g >= 5 && hash2(x, 11) < 0.09 && level.get(x, g) === EMPTY) {
      const s = SLOT.SIGN[Math.floor(hash2(x, 12) * 4)];
      main.box(x + 0.22, g - 3.8, ZF, x + 0.78, g - 1.3, ZF + 0.28, { front: s, side: SLOT.DARK, bottom: SLOT.DARK });
    }
    // roof clutter (behind the running line)
    const d = level.deco[x];
    if (!d || level.get(x, g) !== EMPTY) continue;
    const zc = -0.95 + (hash2(x, 21) - 0.5) * 0.4;
    switch (d) {
      case DECO.AC:
        main.box(x + 0.12, g, zc - 0.35, x + 0.88, g + 0.62, zc + 0.35, { front: SLOT.VENT, top: SLOT.METAL, side: SLOT.METAL });
        break;
      case DECO.ANTENNA:
        main.box(x + 0.46, g, zc - 0.04, x + 0.54, g + 2.8, zc + 0.04, { front: SLOT.METAL });
        main.box(x + 0.4, g + 2.8, zc - 0.07, x + 0.6, g + 2.98, zc + 0.07, { front: SLOT.RED });
        main.box(x + 0.3, g + 1.6, zc - 0.03, x + 0.7, g + 1.66, zc + 0.03, { front: SLOT.METAL });
        break;
      case DECO.LAMP:
        main.box(x + 0.45, g, -1.25, x + 0.55, g + 2.3, -1.15, { front: SLOT.DARK });
        main.box(x + 0.45, g + 2.2, -1.25, x + 1.1, g + 2.3, -1.15, { front: SLOT.DARK });
        main.box(x + 0.8, g + 2.1, -1.3, x + 1.15, g + 2.2, -1.1, { front: SLOT.WHITE, top: SLOT.DARK });
        break;
      case DECO.TANK:
        main.box(x + 0.15, g, -1.35, x + 0.25, g + 0.45, -1.25, { front: SLOT.DARK });
        main.box(x + 0.75, g, -1.35, x + 0.85, g + 0.45, -1.25, { front: SLOT.DARK });
        main.box(x + 0.05, g + 0.45, -1.45, x + 0.95, g + 1.65, -0.65, { front: SLOT.TANK, top: SLOT.METAL });
        break;
      case DECO.VENT:
        main.box(x + 0.25, g, zc - 0.25, x + 0.75, g + 0.45, zc + 0.25, { front: SLOT.GRILLE, top: SLOT.GRILLE });
        main.box(x + 0.35, g + 0.45, zc - 0.15, x + 0.65, g + 0.55, zc + 0.15, { front: SLOT.DARK });
        break;
      case DECO.DISH: {
        const s = SLOT.SIGN[Math.floor(hash2(x, 33) * 4)];
        main.box(x + 0.45, g, -1.3, x + 0.55, g + 1.0, -1.2, { front: SLOT.DARK });
        main.box(x - 0.1, g + 1.0, -1.35, x + 1.1, g + 1.8, -1.2, { front: s, side: SLOT.DARK, bottom: SLOT.DARK });
        break;
      }
    }
  }
  return { main: main.build(), haz: haz.build() };
}

export class ChunkCache {
  constructor(level) { this.level = level; this.map = new Map(); this.frame = 0; }
  get(ci) {
    if (ci < -2) return null;
    let e = this.map.get(ci);
    if (!e) { e = buildChunk(this.level, ci); this.map.set(ci, e); }
    e.used = this.frame;
    return e;
  }
  gc() {
    this.frame++;
    if (this.map.size < 160) return;
    for (const [ci, e] of this.map) {
      if (this.frame - e.used > 600) { e.main?.dispose(); e.haz?.dispose(); this.map.delete(ci); }
    }
  }
  dispose() { for (const e of this.map.values()) { e.main?.dispose(); e.haz?.dispose(); } this.map.clear(); }
}

// ------------------------------------------------------------------ particles (per lane)
class Particles {
  constructor(parent, n = 96) {
    const geo = new THREE.BoxGeometry(0.13, 0.13, 0.13);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }), n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.p = [];
    this.n = n;
    this.m = new THREE.Matrix4();
    this.c = new THREE.Color();
    for (let i = 0; i < n; i++) { this.mesh.setColorAt(i, this.c.set(0xffffff)); }
    parent.add(this.mesh);
  }
  emit(x, y, count, color, spread = 6, up = 4, life = 0.6, z = 0) {
    for (let i = 0; i < count; i++) {
      if (this.p.length >= this.n) this.p.shift();
      this.p.push({
        x, y, z: z + (Math.random() - 0.5) * 1.2,
        vx: (Math.random() - 0.5) * spread, vy: Math.random() * up, vz: (Math.random() - 0.5) * 2,
        life, max: life, color: Array.isArray(color) ? color[(Math.random() * color.length) | 0] : color,
      });
    }
  }
  update(dt) {
    const p = this.p;
    for (let i = p.length - 1; i >= 0; i--) {
      const q = p[i];
      q.life -= dt;
      if (q.life <= 0) { p.splice(i, 1); continue; }
      q.vy -= 18 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
    }
    for (let i = 0; i < this.n; i++) {
      const q = p[i];
      if (q) {
        const s = Math.max(0.2, q.life / q.max);
        this.m.makeScale(s, s, s).setPosition(q.x, q.y, q.z);
        this.mesh.setColorAt(i, this.c.set(q.color));
      } else this.m.makeScale(0, 0, 0);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  dispose() { this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}

// ------------------------------------------------------------------ lane = one player's run
const sheetCache = new Map();
function sheetFor(color) { if (!sheetCache.has(color)) sheetCache.set(color, makeRunnerSheet(color)); return sheetCache.get(color); }

export class Lane {
  constructor(world, { id, color, name, local = false }) {
    this.world = world; this.id = id; this.color = color; this.name = name; this.local = local;
    // root: lane placement + fall pivot (at the view centre); group: course content in tile space
    this.root = new THREE.Group();
    this.group = new THREE.Group();
    this.root.add(this.group);
    world.lanesRoot.add(this.root);
    this.chunks = new Map();
    this.index = 0; this.z = null; this.yOff = -30; // spawn below its slot, rises into place
    this.state = 'in';
    this.fallV = 0; this.fallT = 0;
    this.rx = 2.5; this.ry = 0; this.anim = ANIM.IDLE; this.facing = 1; this.vx = 0;
    this.animT = 0; this.runPhase = 0; this.prevAnim = -1;

    // runner sprite
    const geo = new THREE.PlaneGeometry(2, 2); geo.translate(0, 1, 0);
    this.spriteMat = new THREE.MeshBasicMaterial({ map: sheetFor(color), alphaTest: 0.5, side: THREE.DoubleSide });
    this.sprite = new THREE.Mesh(geo, this.spriteMat);
    this.sprite.position.z = 0.1;
    this.group.add(this.sprite);
    this.frame = -1;

    // blob shadow
    this.shadow = new THREE.Mesh(world.shadowGeo, world.shadowMat);
    this.shadow.rotation.x = -Math.PI / 2;
    this.group.add(this.shadow);

    // TV camera drone that films the runner
    this.drone = new THREE.Mesh(world.droneGeo, world.droneMat);
    this.drone.position.set(0, 4, 0.6);
    this.droneLight = new THREE.Mesh(world.glowGeo, world.glowRedMat);
    this.droneLight.scale.setScalar(0.5);
    this.drone.add(this.droneLight);
    this.droneLight.position.set(0.05, -0.05, 0.05);
    this.group.add(this.drone);

    // neon spill light on the runner
    if (local) {
      this.light = new THREE.PointLight(color, 18, 9, 1.6);
      this.light.position.set(0, 1.5, 2);
      this.group.add(this.light);
    }

    this.particles = new Particles(this.group);
  }

  setRunner(x, y, anim, facing, dt, runPhase) {
    this.vx = dt > 0 ? (x - this.rx) / dt : 0;
    if (anim === ANIM.DEAD && this.prevAnim !== ANIM.DEAD && this.prevAnim !== -1) this.burst();
    if (anim === ANIM.JUMP && this.prevAnim !== ANIM.JUMP && !this.local) this.dust();
    this.prevAnim = anim;
    this.rx = x; this.ry = y; this.anim = anim; this.facing = facing;
    if (runPhase !== undefined) this.runPhase = runPhase;
    else if (anim === ANIM.RUN) this.runPhase += Math.abs(this.vx) * dt;
  }

  burst() {
    this.particles.emit(this.rx, this.ry + 0.8, 40, [this.color, '#ffffff', '#ff2a6d', this.color], 12, 10, 1.0);
  }
  dust(n = 6) { this.particles.emit(this.rx, this.ry + 0.05, n, ['#8a86a8', '#cfcbe8'], 4, 2.5, 0.35); }
  sparks() { this.particles.emit(this.rx - this.facing * 0.3, this.ry + 0.05, 4, ['#f9c80e', '#ffffff'], 3, 3, 0.3); }
  wallDust(dir) { this.particles.emit(this.rx + dir * 0.35, this.ry + 0.9, 6, ['#cfcbe8', '#05d9e8'], 3, 3, 0.35); }

  fall() { if (this.state !== 'fall') { this.state = 'fall'; this.fallT = 0; this.fallV = 0; } }

  frameFor(t) {
    switch (this.anim) {
      case ANIM.IDLE: return FRAME.IDLE + (Math.floor(t * 2) % 2);
      case ANIM.RUN: return FRAME.RUN + (Math.floor(this.runPhase * 1.25) % FRAME.RUN_N);
      case ANIM.JUMP: return FRAME.JUMP;
      case ANIM.FALL: return FRAME.FALL;
      case ANIM.DJUMP: return FRAME.DJUMP + (Math.floor(this.animT * 11) % FRAME.DJUMP_N);
      case ANIM.WALL: return FRAME.WALL;
      case ANIM.SLIDE: return FRAME.SLIDE + (Math.floor(t * 10) % 2);
      default: return FRAME.DEAD;
    }
  }

  // view: the shared camera focus { x, y } – every lane shows the same stretch of the course
  update(dt, t, view, viewHalfWidth) {
    const targetZ = -this.index * LANE_GAP;
    if (this.z === null) this.z = targetZ;
    if (this.state === 'fall') {
      this.fallT += dt; this.fallV += 38 * dt;
      this.yOff -= this.fallV * dt;
      this.root.rotation.x = Math.min(0.35, this.fallT * 0.3);
      this.root.rotation.z = -Math.min(0.15, this.fallT * 0.12);
    } else {
      const k = 1 - Math.exp(-dt * 4);
      this.z += (targetZ - this.z) * k;
      this.yOff += (0 - this.yOff) * (1 - Math.exp(-dt * 3.5));
      if (Math.abs(this.yOff) < 0.01) this.state = 'idle';
    }
    this.root.position.set(0, this.yOff, this.z ?? targetZ);
    this.group.position.set(-view.x, -view.y, 0);

    // runner sprite
    const vis = this.anim !== ANIM.DEAD;
    this.sprite.visible = vis;
    this.animT = this.anim === ANIM.DJUMP ? this.animT + dt : 0;
    const frame = this.frameFor(t);
    if (frame !== this.frame || this.facing !== this.lastFacing) {
      const uv = this.sprite.geometry.attributes.uv;
      let u0 = frame / SHEET_FRAMES, u1 = (frame + 1) / SHEET_FRAMES;
      if (this.facing < 0) [u0, u1] = [u1, u0];
      uv.setXY(0, u0, 1); uv.setXY(1, u1, 1); uv.setXY(2, u0, 0); uv.setXY(3, u1, 0);
      uv.needsUpdate = true;
      this.frame = frame; this.lastFacing = this.facing;
    }
    this.sprite.position.x = this.rx;
    this.sprite.position.y = this.ry - 0.02;

    // shadow on the ground below
    const level = this.world.level;
    const gx = Math.floor(this.rx);
    let gy = -99;
    for (let y = Math.min(H - 1, Math.floor(this.ry + 0.05)); y >= -1; y--) {
      if (y < 0) break;
      if (isSolid(level.get(gx, y))) { gy = y + 1; break; }
    }
    this.shadow.visible = vis && gy > -99;
    if (this.shadow.visible) {
      const s = THREE.MathUtils.clamp(1 - (this.ry - gy) * 0.12, 0.3, 1);
      this.shadow.position.set(this.rx, gy + 0.02, 0);
      this.shadow.scale.set(s, s, s);
    }

    // drone
    const dpx = this.rx - this.facing * 1.6 + Math.sin(t * 1.3 + this.id) * 0.3;
    const dpy = this.ry + 3.4 + Math.sin(t * 2.1 + this.id) * 0.25;
    if (this.snapDrone || Math.abs(this.drone.position.x - dpx) > 15) { this.drone.position.x = dpx; this.drone.position.y = dpy; }
    this.drone.position.x += (dpx - this.drone.position.x) * (1 - Math.exp(-dt * 3));
    this.drone.position.y += (dpy - this.drone.position.y) * (1 - Math.exp(-dt * 3));
    this.droneLight.visible = Math.floor(t * 2.5 + this.id) % 2 === 0;
    if (this.light) { this.light.position.x = this.rx; this.light.position.y = this.ry + 1.4; }

    this.particles.update(dt);
    this.updateChunks(view.x, viewHalfWidth);
  }

  updateChunks(cx, hw) {
    const cache = this.world.chunks;
    const c0 = Math.floor((cx - hw) / CHUNK), c1 = Math.floor((cx + hw) / CHUNK);
    for (const [ci, meshes] of this.chunks) {
      if (ci < c0 - 1 || ci > c1 + 1) { for (const m of meshes) this.group.remove(m); this.chunks.delete(ci); }
    }
    for (let ci = c0; ci <= c1; ci++) {
      const e = cache.get(ci);
      if (!e || this.chunks.has(ci)) continue;
      const meshes = [];
      if (e.main) meshes.push(new THREE.Mesh(e.main, this.world.matMain));
      if (e.haz) meshes.push(new THREE.Mesh(e.haz, this.world.matHaz));
      for (const m of meshes) { m.matrixAutoUpdate = false; this.group.add(m); }
      this.chunks.set(ci, meshes);
    }
  }

  // screen position of the runner's head, for DOM name tags
  headWorld(v) { return v.set(this.rx, this.ry + 2.3, 0).applyMatrix4(this.group.matrixWorld); }

  dispose() {
    this.world.lanesRoot.remove(this.root);
    this.particles.dispose();
    this.sprite.geometry.dispose();
    this.spriteMat.dispose();
    this.chunks.clear();
  }
}

// ------------------------------------------------------------------ pixel post-processing
const POST_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const POST_FS = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform vec2 uRes;
uniform float uTime, uGlitch, uScale;
float bayer(vec2 p){
  int x = int(mod(p.x,4.0)), y = int(mod(p.y,4.0));
  int i = x + y*4;
  float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  for (int k=0;k<16;k++) if (k==i) return m[k]/16.0;
  return 0.0;
}
float rnd(float n){ return fract(sin(n*12.9898)*43758.5453); }
vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
void main(){
  vec2 uv = vUv;
  float line = floor(uv.y * uRes.y / 2.0);
  float tq = floor(uTime * 24.0);
  if (uGlitch > 0.0) {
    float n = rnd(line + tq * 7.31);
    if (n < uGlitch * 0.5) uv.x += (rnd(line * 3.1 + tq) - 0.5) * 0.12 * uGlitch;
  }
  vec2 px = floor(uv * uRes);
  vec2 suv = (px + 0.5) / uRes;
  vec3 c = texture2D(tDiffuse, suv).rgb;
  if (uGlitch > 0.0) {
    float o = uGlitch * 2.0 / uRes.x;
    c.r = texture2D(tDiffuse, suv + vec2(o, 0.0)).r;
    c.b = texture2D(tDiffuse, suv - vec2(o, 0.0)).b;
  }
  // cheap neon bloom on the low-res buffer
  vec3 b = vec3(0.0);
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 0.5236;
    vec2 dir = vec2(cos(a), sin(a)) / uRes;
    b += max(texture2D(tDiffuse, suv + dir * 1.5).rgb - 0.6, 0.0);
    b += max(texture2D(tDiffuse, suv + dir * 3.0).rgb - 0.6, 0.0) * 0.5;
  }
  c += b * 0.06;
  c = toSRGB(max(c, 0.0));
  // ordered dither + colour quantisation
  float levels = 20.0;
  c = floor(c * levels + bayer(px) * 0.999) / levels;
  // scanlines + vignette
  float sl = mod(gl_FragCoord.y, uScale) < max(1.0, uScale * 0.34) ? 0.82 : 1.0;
  vec2 q = vUv - 0.5;
  float vig = 1.0 - dot(q, q) * 0.9;
  c *= sl * vig;
  gl_FragColor = vec4(c, 1.0);
}`;

// ------------------------------------------------------------------ the world
export class World {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0b0414');
    this.scene.fog = new THREE.Fog('#1a0a2a', 30, 95);
    this.camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.5, 900);
    this.camPose = { x: 0, y: 7.5, z: 22, lookY: 2.6, lookZ: -6 };
    this.camTarget = { ...this.camPose };

    this.lanesRoot = new THREE.Group();
    this.scene.add(this.lanesRoot);

    const atlas = makeAtlas();
    this.matMain = new THREE.MeshLambertMaterial({ map: atlas.map, emissiveMap: atlas.emissive, emissive: 0xffffff, emissiveIntensity: 0.85 });
    this.matHaz = new THREE.MeshLambertMaterial({ map: atlas.map, emissiveMap: atlas.emissive, emissive: 0xffffff, emissiveIntensity: 1.6 });

    // shared small assets
    this.shadowGeo = new THREE.CircleGeometry(0.45, 10);
    this.shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.droneGeo = new THREE.PlaneGeometry(0.75, 0.5);
    this.droneMat = new THREE.MeshBasicMaterial({ map: makeDroneTexture(), alphaTest: 0.5, side: THREE.DoubleSide });
    this.glowGeo = new THREE.PlaneGeometry(1, 1);
    this.glowRedMat = new THREE.MeshBasicMaterial({ map: makeGlowSprite('#ff2020'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });

    this.setupLights();
    this.setupBackground();
    this.setupRain();
    this.setupPost();
    this.glitch = 0;
    this.menuMix = 1;
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  setLevel(level) {
    this.chunks?.dispose();
    this.level = level;
    this.chunks = new ChunkCache(level);
  }

  setupLights() {
    this.scene.add(new THREE.HemisphereLight('#7a6cff', '#ff3d7f', 1.25));
    const moon = new THREE.DirectionalLight('#a9c1ff', 1.7);
    moon.position.set(-6, 14, 10);
    this.scene.add(moon);
    const rim = new THREE.DirectionalLight('#ff4fa0', 0.9);
    rim.position.set(10, 4, -6);
    this.scene.add(rim);
  }

  setupBackground() {
    this.bg = new THREE.Group();
    this.scene.add(this.bg);
    // sky
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(1600, 420), new THREE.MeshBasicMaterial({ map: makeSky(), fog: false, depthWrite: false }));
    sky.position.set(0, 80, -520);
    this.bg.add(sky);
    // big hazy moon/sun disc
    const disc = new THREE.Mesh(new THREE.CircleGeometry(38, 24), new THREE.MeshBasicMaterial({ color: '#ff7a59', fog: false, transparent: true, opacity: 0.55, depthWrite: false }));
    disc.position.set(120, 40, -510);
    this.bg.add(disc);
    // skyline layers
    this.skylines = [];
    const layers = [
      { z: -420, w: 1500, h: 375, y: -10, f: 0.05 },
      { z: -300, w: 1100, h: 275, y: -20, f: 0.12 },
      { z: -190, w: 760, h: 190, y: -28, f: 0.24 },
    ];
    layers.forEach((L, i) => {
      const tex = makeSkyline(i);
      tex.repeat.set(1, 1);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(L.w, L.h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5, fog: false, depthWrite: false }));
      m.position.set(0, L.y + L.h / 2 - 105, L.z);
      m.renderOrder = -10 + i;
      this.bg.add(m);
      this.skylines.push({ mesh: m, tex, L });
    });
    sky.renderOrder = -20; disc.renderOrder = -19;
    // haze planes between layers for depth
    for (const [z, op] of [[-250, 0.25], [-160, 0.3]]) {
      const haze = new THREE.Mesh(new THREE.PlaneGeometry(1600, 120), new THREE.MeshBasicMaterial({ color: '#3a1450', transparent: true, opacity: op, fog: false, depthWrite: false }));
      haze.position.set(0, -60, z);
      haze.renderOrder = -12;
      this.bg.add(haze);
    }
    // searchlights sweeping the smog
    this.searchlights = [];
    for (let i = 0; i < 3; i++) {
      const geo = new THREE.ConeGeometry(9, 260, 16, 1, true);
      geo.translate(0, -130, 0);
      const mat = new THREE.MeshBasicMaterial({ color: i === 1 ? '#ffd6a0' : '#9fd8ff', transparent: true, opacity: 0.035, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
      const cone = new THREE.Mesh(geo, mat);
      cone.position.set(-220 + i * 230, -80, -230 - i * 30);
      cone.rotation.z = Math.PI;
      cone.renderOrder = -5;
      this.bg.add(cone);
      this.searchlights.push({ cone, phase: i * 2.1, speed: 0.25 + i * 0.07 });
    }
    // flying spinners
    this.spinners = [];
    const spTex = makeSpinnerTexture();
    for (let i = 0; i < 9; i++) {
      const s = 2.2 + Math.random() * 1.5;
      const mat = new THREE.MeshBasicMaterial({ map: spTex, alphaTest: 0.5, fog: false, side: THREE.DoubleSide });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4 * s, 1 * s), mat);
      const glow = new THREE.Mesh(this.glowGeo, new THREE.MeshBasicMaterial({ map: makeGlowSprite('#ffe6a0'), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      glow.scale.setScalar(2.2 * s);
      m.add(glow);
      const sp = { m, glow, z: -50 - Math.random() * 110, y: 4 + Math.random() * 30, x: (Math.random() - 0.5) * 300, v: (Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 14) };
      m.position.z = sp.z;
      m.scale.x = sp.v < 0 ? -1 : 1;
      glow.position.x = 1.2 * s;
      this.bg.add(m);
      this.spinners.push(sp);
    }
  }

  setupRain() {
    const N = 1400;
    const pos = new Float32Array(N * 6);
    this.rainData = [];
    for (let i = 0; i < N; i++) this.rainData.push({ x: (Math.random() - 0.5) * 90, y: Math.random() * 50 - 15, z: Math.random() * 60 - 45, s: 30 + Math.random() * 15 });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#8fb0ff', transparent: true, opacity: 0.35, fog: false }));
    this.rain.frustumCulled = false;
    this.scene.add(this.rain);
  }

  setupPost() {
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: true });
    this.rt.texture.minFilter = THREE.NearestFilter;
    this.rt.texture.magFilter = THREE.NearestFilter;
    this.postMat = new THREE.ShaderMaterial({
      vertexShader: POST_VS, fragmentShader: POST_FS,
      uniforms: { tDiffuse: { value: this.rt.texture }, uRes: { value: new THREE.Vector2() }, uTime: { value: 0 }, uGlitch: { value: 0 }, uScale: { value: 3 } },
      depthTest: false, depthWrite: false,
    });
    this.postScene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMat);
    quad.frustumCulled = false;
    this.postScene.add(quad);
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    const scale = Math.max(2, Math.round(h / 250));
    this.pixelScale = scale;
    const lw = Math.max(1, Math.floor(w / scale)), lh = Math.max(1, Math.floor(h / scale));
    this.rt.setSize(lw, lh);
    this.postMat.uniforms.uRes.value.set(lw, lh);
    this.postMat.uniforms.uScale.value = scale;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // half width (in tiles) visible at a given lane depth
  halfWidthAt(laneZ) {
    const d = this.camera.position.z - laneZ + 4;
    const vt = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    return d * vt * this.camera.aspect + 4 + Math.abs(this.camPose.x);
  }

  update(dt, t, viewX, viewY) {
    // camera easing between menu/game framing
    const c = this.camPose, T = this.camTarget, k = 1 - Math.exp(-dt * 2.5);
    for (const key in c) c[key] += (T[key] - c[key]) * k;
    this.camera.position.set(c.x + Math.sin(t * 0.15) * 0.4 * this.menuMix, c.y, c.z);
    this.camera.lookAt(c.x, c.lookY, c.lookZ);

    // background parallax driven by the main view position
    for (const { tex, L } of this.skylines) tex.offset.x = (viewX * L.f) / L.w * 3;
    this.bg.position.y = -viewY * 0.15;
    for (const s of this.searchlights) {
      s.cone.rotation.z = Math.PI + Math.sin(t * s.speed + s.phase) * 0.45;
    }
    const dvx = this.lastViewX === undefined ? 0 : viewX - this.lastViewX;
    this.lastViewX = viewX;
    for (const s of this.spinners) {
      s.x += s.v * dt - dvx * (40 / -s.z);
      if (s.x > 200) s.x -= 400; if (s.x < -200) s.x += 400;
      s.m.position.set(s.x, s.y + Math.sin(t * 0.7 + s.z) * 1.2, s.z);
    }

    // rain (view-space volume, drifts against the running direction)
    const pos = this.rain.geometry.attributes.position.array;
    let i = 0;
    for (const r of this.rainData) {
      r.y -= r.s * dt; r.x -= 5 * dt + dvx * 0.6;
      if (r.y < -15) { r.y += 50; r.x = (Math.random() - 0.5) * 90; }
      if (r.x < -45) r.x += 90; else if (r.x > 45) r.x -= 90;
      pos[i++] = r.x; pos[i++] = r.y; pos[i++] = r.z;
      pos[i++] = r.x + 0.08; pos[i++] = r.y + 0.9; pos[i++] = r.z;
    }
    this.rain.geometry.attributes.position.needsUpdate = true;

    this.matHaz.emissiveIntensity = 1.2 + Math.sin(t * 40) * 0.3 + (Math.random() < 0.05 ? 0.8 : 0);
    this.glitch = Math.max(0, this.glitch - dt * 1.6);
    this.chunks?.gc();
  }

  render(t) {
    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.postMat.uniforms.uTime.value = t;
    this.postMat.uniforms.uGlitch.value = this.glitch;
    this.renderer.render(this.postScene, this.postCam);
  }
}

export { pixelTexture };
