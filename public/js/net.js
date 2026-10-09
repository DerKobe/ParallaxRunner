// WebSocket client with auto-reconnect.
export class Net {
  constructor(handlers) {
    this.h = handlers;
    this.ws = null;
    this.connected = false;
    this.connect();
  }
  connect() {
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => { this.connected = true; this.h.open?.(); };
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      this.h[m.t]?.(m);
    };
    ws.onclose = () => {
      const was = this.connected;
      this.connected = false;
      if (was) this.h.close?.();
      setTimeout(() => this.connect(), 1500);
    };
    ws.onerror = () => ws.close();
  }
  send(msg) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(msg)); }
}
