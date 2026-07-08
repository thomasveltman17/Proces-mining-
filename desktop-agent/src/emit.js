/**
 * Event emitter — batches unified events and posts them to the FlowLens server,
 * reusing the exact same ingest contract as the browser tracker/extension.
 * Applies the privacy exclusion list before anything leaves the machine.
 */

const DEFAULT_ENDPOINT = process.env.FLOWLENS_ENDPOINT || 'http://localhost:4000/api/events';
const FLUSH_MS = 3000;
const FLUSH_N = 25;

// Apps / window-title fragments that are never captured (privacy).
const DEFAULT_EXCLUSIONS = [/1password/i, /bitwarden/i, /keepass/i, /bank/i, /health/i, /vault/i];

export class Emitter {
  constructor({ session, endpoint = DEFAULT_ENDPOINT, exclusions = DEFAULT_EXCLUSIONS } = {}) {
    this.session = session;
    this.endpoint = endpoint;
    this.exclusions = exclusions;
    this.buffer = [];
    this.paused = false;
    this._timer = setInterval(() => this.flush(), FLUSH_MS);
  }

  excluded(e) {
    const hay = `${e.app ?? ''} ${e.windowTitle ?? ''}`;
    return this.exclusions.some((re) => re.test(hay));
  }

  push(event) {
    if (this.paused || this.excluded(event)) return;
    event.ts = event.ts || Date.now();
    event.source = event.source || this.session.source || 'desktop_ax';
    // Never carry a raw field value — only its label + length is allowed upstream.
    delete event.value;
    this.buffer.push(event);
    if (this.buffer.length >= FLUSH_N) this.flush();
  }

  pause() {
    this.paused = true;
  }
  resume() {
    this.paused = false;
  }

  async flush() {
    if (this.buffer.length === 0) return;
    const events = this.buffer.splice(0, this.buffer.length);
    const body = JSON.stringify({
      session: { ...this.session, lastSeenAt: Date.now() },
      events,
    });
    try {
      await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
    } catch {
      this.buffer.unshift(...events); // retry next flush
    }
  }

  async stop() {
    clearInterval(this._timer);
    await this.flush();
  }
}
