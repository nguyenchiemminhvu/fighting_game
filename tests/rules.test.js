import test from 'node:test';
import assert from 'node:assert/strict';
import { ARENA_LIMIT, ARENA_PROPS, MATCH_SECONDS, PALMS, PREP_SECONDS, ROOMS, ROOM_CAPACITY } from '../src/game/rules.js';

test('fixed lobby contains six two-player rooms', () => {
  assert.equal(ROOMS.length, 6);
  assert.equal(ROOM_CAPACITY, 2);
  assert.equal(new Set(ROOMS.map((room) => room.key)).size, 6);
});

test('match and selection timers match the game specification', () => {
  assert.equal(PREP_SECONDS, 10);
  assert.equal(MATCH_SECONDS, 300);
});

test('all five selectable palm techniques and the copy technique exist', () => {
  assert.deepEqual(Object.keys(PALMS).sort(), ['bang', 'chi', 'hoa', 'kim', 'long', 'xiao']);
  assert.equal(PALMS.chi.charge, 0.3);
  assert.equal(PALMS.chi.cooldown, 2);
  assert.equal(PALMS.long.charge, 1.5);
  assert.equal(PALMS.long.cooldown, 5);
  assert.equal(PALMS.bang.slowSeconds, 5);
  assert.equal(PALMS.hoa.burnSeconds, 3);
  assert.equal(PALMS.xiao.effect, 'copy');
});

test('arena is bounded and contains fixed collision props', () => {
  assert.equal(ARENA_LIMIT, 14.6);
  assert.ok(ARENA_PROPS.length >= 10);
  for (const prop of ARENA_PROPS) {
    assert.ok(Number.isFinite(prop.x) && Number.isFinite(prop.z));
    assert.ok(prop.w > 0 && prop.d > 0 && prop.h > 0);
  }
});
