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
  assert.equal(PALMS.chi.charge, 0.2);
  assert.equal(PALMS.chi.cooldown, 1.33);
  assert.equal(PALMS.long.charge, 1);
  assert.equal(PALMS.long.cooldown, 3.33);
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

test('soft aim locks only targets inside the 25-degree forward cone', async () => {
  const { computeAimDirection } = await import('../src/game/rules.js');
  const source = { x: 0, y: 0, z: 0 };
  const inCone = { x: 2, y: 0, z: -8 };
  const outOfCone = { x: 5, y: 0, z: -8 };
  const locked = computeAimDirection(source, inCone, 0, 25);
  const straight = computeAimDirection(source, outOfCone, 0, 25);
  assert.equal(locked.locked, true);
  assert.ok(locked.x > 0);
  assert.equal(straight.locked, false);
  assert.ok(Math.abs(straight.x) < 1e-9);
  assert.equal(straight.z, -1);
});

test('soft aim includes target elevation when an enemy is inside the forward cone', async () => {
  const { computeAimDirection } = await import('../src/game/rules.js');
  const direction = computeAimDirection(
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 2, z: -6 },
    0,
    25,
  );
  assert.equal(direction.locked, true);
  assert.ok(direction.y > 0);
  assert.ok(Math.abs(Math.hypot(direction.x, direction.y, direction.z) - 1) < 1e-9);
});

test('soft aim cone includes vertical separation in its 3D angle', async () => {
  const { computeAimDirection } = await import('../src/game/rules.js');
  const tooHigh = computeAimDirection(
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 5, z: -4 },
    0,
    25,
  );
  assert.equal(tooHigh.locked, false);
  assert.equal(tooHigh.y, 0);
  assert.equal(tooHigh.z, -1);
});
