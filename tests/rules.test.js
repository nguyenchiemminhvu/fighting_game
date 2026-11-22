import test from 'node:test';
import assert from 'node:assert/strict';
import { ARENA_LIMIT, ARENA_PROPS, MAX_HP, PALMS, PREP_SECONDS, ROOMS, ROOM_CAPACITY, applyHealthDamage, blastRadiusForDamage, overlapsPropFootprint, projectileIntersectsProp } from '../src/game/rules.js';

test('fixed lobby contains six two-player rooms', () => {
  assert.equal(ROOMS.length, 6);
  assert.equal(ROOM_CAPACITY, 2);
  assert.equal(new Set(ROOMS.map((room) => room.key)).size, 6);
});

test('fighters use a 100 HP knockout rule with no match countdown', () => {
  assert.equal(PREP_SECONDS, 10);
  assert.equal(MAX_HP, 100);
  assert.equal(applyHealthDamage(100, 8), 92);
  assert.equal(applyHealthDamage(8, 11), 0);
  assert.equal(applyHealthDamage(0, 8), 0);
  assert.equal(applyHealthDamage(5, -8), 5);
  assert.equal(applyHealthDamage(100, 150), 0);
});

test('all five selectable palm techniques and the copy technique exist', () => {
  assert.deepEqual(Object.keys(PALMS).sort(), ['bang', 'chi', 'hoa', 'kim', 'long', 'xiao']);
  assert.equal(PALMS.chi.charge, 0.2);
  assert.equal(PALMS.chi.cooldown, 1.33);
  assert.equal(PALMS.chi.damage, 8);
  assert.equal(PALMS.long.charge, 1);
  assert.equal(PALMS.long.cooldown, 3.33);
  assert.equal(PALMS.long.damage, 23);
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


test('terrain blast radius scales directly with skill damage', () => {
  const small = blastRadiusForDamage(PALMS.chi.damage);
  const large = blastRadiusForDamage(PALMS.long.damage);
  assert.ok(large > small);
  assert.ok(Math.abs(blastRadiusForDamage(10) - 1.4) < 1e-12);
  assert.equal(blastRadiusForDamage(-10), 0);
  assert.equal(large / small, PALMS.long.damage / PALMS.chi.damage);
});

test('all fixed arena meshes are represented in authoritative collision data', () => {
  const hall = ARENA_PROPS.find((prop) => prop.id === 'hall-back');
  const roof = ARENA_PROPS.find((prop) => prop.id === 'hall-roof');
  assert.ok(hall && roof);
  assert.equal(hall.w, 7.6);
  assert.equal(hall.d, 0.8);
  assert.equal(roof.baseY, 2.04);
});

test('pillar collision follows its circular render rather than a square footprint', () => {
  const pillar = ARENA_PROPS.find((prop) => prop.id === 'pillar-nw');
  assert.ok(pillar);
  assert.equal(overlapsPropFootprint(pillar.x + 0.9, pillar.z + 0.9, 0.1, pillar), false);
  assert.equal(overlapsPropFootprint(pillar.x + 0.6, pillar.z, 0.1, pillar), true);
});

test('projectiles collide with the matching wall, pillar and raised roof volumes', () => {
  const pillar = ARENA_PROPS.find((prop) => prop.id === 'pillar-nw');
  const wall = ARENA_PROPS.find((prop) => prop.id === 'wall-nw');
  const roof = ARENA_PROPS.find((prop) => prop.id === 'hall-roof');
  assert.equal(projectileIntersectsProp(pillar.x, 1, pillar.z, 0.1, pillar), true);
  assert.equal(projectileIntersectsProp(wall.x, 1, wall.z, 0.1, wall), true);
  assert.equal(projectileIntersectsProp(roof.x, 2.2, roof.z, 0.1, roof), true);
  assert.equal(projectileIntersectsProp(roof.x, 1, roof.z, 0.1, roof), false);
});
