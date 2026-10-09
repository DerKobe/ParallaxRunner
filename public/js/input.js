// Keyboard + gamepad input with edge detection.
const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'jump', KeyW: 'jump', Space: 'jump', KeyK: 'jump',
  ArrowDown: 'down', KeyS: 'down', ShiftLeft: 'down', ShiftRight: 'down', KeyJ: 'down',
};

export class Input {
  constructor() {
    this.keys = new Set();
    this.state = { left: false, right: false, jump: false, down: false };
    this.prev = { ...this.state };
    this.enabled = true;
    addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      const a = KEYMAP[e.code];
      if (a && this.enabled) { this.keys.add(a); e.preventDefault(); }
    });
    addEventListener('keyup', (e) => { const a = KEYMAP[e.code]; if (a) this.keys.delete(a); });
    addEventListener('blur', () => this.keys.clear());
  }

  update() {
    this.prev = { ...this.state };
    const s = { left: false, right: false, jump: false, down: false };
    for (const k of this.keys) s[k] = true;
    for (const pad of navigator.getGamepads?.() ?? []) {
      if (!pad) continue;
      const ax = pad.axes[0] ?? 0, ay = pad.axes[1] ?? 0;
      const b = (i) => pad.buttons[i]?.pressed;
      if (ax < -0.35 || b(14)) s.left = true;
      if (ax > 0.35 || b(15)) s.right = true;
      if (b(0) || b(1) || b(12)) s.jump = true;
      if (ay > 0.5 || b(13) || b(2) || b(6) || b(7)) s.down = true;
    }
    if (!this.enabled) for (const k in s) s[k] = false;
    this.state = s;
  }
  pressed(a) { return this.state[a] && !this.prev[a]; }
  released(a) { return !this.state[a] && this.prev[a]; }
  held(a) { return this.state[a]; }
}
