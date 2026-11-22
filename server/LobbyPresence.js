/**
 * Tracks anonymous browser sessions that are currently on the lobby screen.
 * A short heartbeat TTL prevents abandoned tabs from remaining online forever.
 */
export class LobbyPresence {
  constructor({ activeTtlMs = 15_000, tombstoneTtlMs = 60_000, now = () => Date.now() } = {}) {
    this.activeTtlMs = activeTtlMs;
    this.tombstoneTtlMs = Math.max(tombstoneTtlMs, activeTtlMs);
    this.now = now;
    this.sessions = new Map();
  }

  update(id, sequence, active) {
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{16,80}$/.test(id)) return false;
    if (!Number.isSafeInteger(sequence) || sequence < 1 || typeof active !== 'boolean') return false;

    const timestamp = this.now();
    this.prune(timestamp);
    const previous = this.sessions.get(id);
    if (previous && sequence <= previous.sequence) return false;

    this.sessions.set(id, { sequence, active, updatedAt: timestamp });
    return true;
  }

  getOnlineCount() {
    const timestamp = this.now();
    this.prune(timestamp);
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.active && timestamp - session.updatedAt <= this.activeTtlMs) count += 1;
    }
    return count;
  }

  prune(timestamp = this.now()) {
    for (const [id, session] of this.sessions) {
      const age = timestamp - session.updatedAt;
      if (session.active && age > this.activeTtlMs) session.active = false;
      if (age > this.tombstoneTtlMs) this.sessions.delete(id);
    }
  }
}
