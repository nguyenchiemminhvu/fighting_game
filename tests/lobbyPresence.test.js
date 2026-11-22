import test from 'node:test';
import assert from 'node:assert/strict';
import { LobbyPresence } from '../server/LobbyPresence.js';

function createPresence(options = {}) {
  let now = 1_000;
  const presence = new LobbyPresence({
    activeTtlMs: 15_000,
    tombstoneTtlMs: 60_000,
    now: () => now,
    ...options,
  });
  return { presence, advance: (ms) => { now += ms; } };
}

test('counts only active lobby sessions', () => {
  const { presence } = createPresence();
  assert.equal(presence.update('visitor-session-0001', 1, true), true);
  assert.equal(presence.update('visitor-session-0002', 1, true), true);
  assert.equal(presence.getOnlineCount(), 2);

  assert.equal(presence.update('visitor-session-0001', 2, false), true);
  assert.equal(presence.getOnlineCount(), 1);
});

test('ignores stale heartbeat requests so a late lobby ping cannot recount an arena player', () => {
  const { presence } = createPresence();
  presence.update('visitor-session-0001', 2, false);
  assert.equal(presence.update('visitor-session-0001', 1, true), false);
  assert.equal(presence.getOnlineCount(), 0);
});

test('automatically expires abandoned lobby tabs after the heartbeat TTL', () => {
  const { presence, advance } = createPresence();
  presence.update('visitor-session-0001', 1, true);
  assert.equal(presence.getOnlineCount(), 1);

  advance(15_001);
  assert.equal(presence.getOnlineCount(), 0);
});

test('accepts a newer heartbeat after a session returns from the arena to the lobby', () => {
  const { presence } = createPresence();
  presence.update('visitor-session-0001', 1, true);
  presence.update('visitor-session-0001', 2, false);
  assert.equal(presence.getOnlineCount(), 0);

  assert.equal(presence.update('visitor-session-0001', 3, true), true);
  assert.equal(presence.getOnlineCount(), 1);
});

test('validates session id, sequence and active flag', () => {
  const { presence } = createPresence();
  assert.equal(presence.update('short', 1, true), false);
  assert.equal(presence.update('visitor-session-0001', 0, true), false);
  assert.equal(presence.update('visitor-session-0001', 1.5, true), false);
  assert.equal(presence.update('visitor-session-0001', 1, 'yes'), false);
  assert.equal(presence.getOnlineCount(), 0);
});
