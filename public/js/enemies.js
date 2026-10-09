// Patrolling enemies. Their motion is a pure function of the shared clock, so every client (and
// every bot) sees the same enemy at the same place without any extra network traffic.

export const ENEMY = { CRAWLER: 0, SENTRY: 1, HOVER: 2 };

// hitboxes in tiles (x centred, y = bottom)
export const ENEMY_SIZE = {
  [ENEMY.CRAWLER]: { w: 0.9, h: 0.75 },  // spider-bot on the roof: jump over it
  [ENEMY.SENTRY]: { w: 0.85, h: 0.85 },  // floating mine going up and down: pass while it is up
  [ENEMY.HOVER]: { w: 1.6, h: 0.55 },    // police glider at chest height in a low tunnel: slide underneath
};

// position of enemy e at time t (seconds) → out { x, y, dir, ph }
export function enemyPos(e, t, out) {
  const ph = (((t / e.period + e.phase) % 1) + 1) % 1;
  const tri = ph < 0.5 ? ph * 2 : 2 - ph * 2;
  const u = 0.5 - 0.5 * Math.cos(Math.PI * tri); // ease in/out at the turning points
  out.ph = ph;
  out.dir = ph < 0.5 ? 1 : -1;
  if (e.type === ENEMY.SENTRY) {
    out.x = e.x0;
    out.y = e.y0 + (e.y1 - e.y0) * u;
  } else {
    out.x = e.x0 + (e.x1 - e.x0) * u;
    out.y = e.y0 + (e.type === ENEMY.HOVER ? Math.sin(t * 5.3 + e.phase * 9) * 0.08 : 0);
  }
  return out;
}

// does the box [x0,x1]×[y0,y1] touch enemy e at time t?
const tmp = { x: 0, y: 0, dir: 1, ph: 0 };
export function enemyHits(e, t, x0, x1, y0, y1) {
  enemyPos(e, t, tmp);
  const s = ENEMY_SIZE[e.type];
  return x1 > tmp.x - s.w / 2 && x0 < tmp.x + s.w / 2 && y1 > tmp.y && y0 < tmp.y + s.h;
}
