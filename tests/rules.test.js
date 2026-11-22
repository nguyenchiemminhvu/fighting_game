import test from 'node:test';
import assert from 'node:assert/strict';
import { ARENA_LIMIT, ARENA_PROPS, ARENA_MAPS, getArenaDefinition, MAX_HP, PALMS, PREP_SECONDS, ROOMS, ROOM_CAPACITY, applyHealthDamage, blastRadiusForDamage, overlapsPropFootprint, projectileIntersectsProp, isEngagedWithOpponent, advanceDisengagementTicks, resolveDisengagementOutcome, DISENGAGEMENT_LIMIT_SECONDS, DISENGAGEMENT_HALF_ANGLE_DEGREES } from '../src/game/rules.js';

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


test('disengagement rule accepts opponents inside the 45-degree forward cone', () => {
  const fighter = { x: 0, z: 0, yaw: 0 };
  assert.equal(isEngagedWithOpponent(fighter, { x: 10, z: -10 }), true);
  assert.equal(isEngagedWithOpponent(fighter, { x: 11, z: -10 }), false);
  assert.equal(DISENGAGEMENT_HALF_ANGLE_DEGREES, 45);
});

test('disengagement rule accepts opponents within Great Vajra Palm range even behind the fighter', () => {
  const fighter = { x: 0, z: 0, yaw: 0 };
  assert.equal(isEngagedWithOpponent(fighter, { x: 0, z: 8 }), true);
  assert.equal(isEngagedWithOpponent(fighter, { x: 0, z: 8.01 }), false);
  assert.equal(isEngagedWithOpponent(fighter, { x: 0, z: -8.01 }), true);
  assert.equal(isEngagedWithOpponent(fighter, { x: 0, y: 7, z: 0 }), true);
  assert.equal(isEngagedWithOpponent(fighter, { x: 0, y: 9, z: 0 }), false);
  assert.equal(DISENGAGEMENT_LIMIT_SECONDS, 30);
});

test('disengagement requires continuous non-engagement; facing or closing distance resets the condition', () => {
  const fighter = { x: 0, z: 0, yaw: Math.PI };
  const distantOpponent = { x: 0, z: -12 };
  assert.equal(isEngagedWithOpponent(fighter, distantOpponent), false);
  assert.equal(isEngagedWithOpponent({ ...fighter, yaw: 0 }, distantOpponent), true);
  assert.equal(isEngagedWithOpponent(fighter, { x: 0, z: -7 }), true);
});


test('disengagement timer resets when engaged and triggers at 30 seconds of 60 Hz ticks', () => {
  const limitTicks = DISENGAGEMENT_LIMIT_SECONDS * 60;
  let ticks = 0;
  for (let i = 0; i < limitTicks - 1; i++) ticks = advanceDisengagementTicks(ticks, false, limitTicks);
  assert.equal(ticks, limitTicks - 1);
  ticks = advanceDisengagementTicks(ticks, true, limitTicks);
  assert.equal(ticks, 0);
  for (let i = 0; i < limitTicks; i++) ticks = advanceDisengagementTicks(ticks, false, limitTicks);
  assert.equal(ticks, limitTicks);
  ticks = advanceDisengagementTicks(ticks, false, limitTicks);
  assert.equal(ticks, limitTicks);
});

test('one disengaged fighter loses while simultaneous disengagement makes both lose', () => {
  const oneLoser = resolveDisengagementOutcome(['fighter-a', 'fighter-b'], ['fighter-a']);
  assert.deepEqual(oneLoser, {
    winnerSessionId: 'fighter-b', reason: 'disengagement', loserSessionIds: ['fighter-a'],
  });
  const bothLose = resolveDisengagementOutcome(['fighter-a', 'fighter-b'], ['fighter-a', 'fighter-b']);
  assert.deepEqual(bothLose, {
    winnerSessionId: '', reason: 'mutual_disengagement', loserSessionIds: ['fighter-a', 'fighter-b'],
  });
  assert.equal(resolveDisengagementOutcome(['fighter-a', 'fighter-b'], []), null);
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


test('room 6 uses its own office gate map while rooms 1-5 keep the classic arena', () => {
  assert.equal(ROOMS[5].name, 'Trước cổng công ty');
  assert.equal(ROOMS[5].map, 'office-gate');
  const office = getArenaDefinition(ROOMS[5].map);
  assert.equal(office.id, 'office-gate');
  assert.notEqual(office.props, ARENA_PROPS);
  for (const room of ROOMS.slice(0, 5)) {
    assert.equal(getArenaDefinition(room.map).props, ARENA_PROPS);
  }
  assert.equal(getArenaDefinition('unknown-map'), ARENA_MAPS.classic);
});

test('office gate geometry covers the checkpoint, elevator corridor and T lobby', () => {
  const office = getArenaDefinition('office-gate');
  const find = (id) => office.props.find((prop) => prop.id === id);
  const entryWall = find('office-entry-wall-left');
  const gateArm = find('office-turnstile-left-arm');
  const cardReader = find('office-card-reader-screen-left');
  const westDoor = find('office-elevator-door-west-1');
  const westElevatorWall = find('office-elevator-wall-left');
  const oppositeGateArm = find('office-turnstile-right-arm');
  const elevatorWall = find('office-elevator-wall-left');
  const lobbyBench = find('office-bench-west');
  const lobbySideWall = find('office-lobby-wall-west');
  const outerStemWall = find('office-stem-outer-wall-west');
  const stemReturn = find('office-stem-return-west');

  assert.ok(entryWall && gateArm && cardReader && westDoor && westElevatorWall && oppositeGateArm && elevatorWall && lobbyBench && lobbySideWall && outerStemWall && stemReturn);
  assert.equal(entryWall.h, 3.45);
  assert.equal(elevatorWall.d, 16.0);
  assert.equal(lobbySideWall.d, 11.2);
  assert.equal(outerStemWall.d, 16.67);
  assert.equal(stemReturn.w, 9.2);
  const clearGateWidth = (oppositeGateArm.x - oppositeGateArm.w / 2) - (gateArm.x + gateArm.w / 2);
  assert.ok(clearGateWidth > 2.0, 'the turnstile leaves a walkable central entry lane');
  assert.equal(office.cameraTarget.z, 8.2);
  assert.deepEqual(office.spawns.map(({ x, z }) => [x, z]), [[0, 6], [0, 10.2]]);

  for (const prop of office.props) {
    assert.ok(Number.isFinite(prop.x) && Number.isFinite(prop.z));
    assert.ok(prop.w > 0 && prop.d > 0 && prop.h > 0);
    if (prop.baseY != null) assert.ok(Number.isFinite(prop.baseY));
  }
  assert.equal(projectileIntersectsProp(gateArm.x, 0.9, gateArm.z, 0.1, gateArm), true);
  assert.equal(projectileIntersectsProp(cardReader.x, 0.9, cardReader.z, 0.02, cardReader), true);
  assert.equal(westDoor.x - westDoor.w / 2, westElevatorWall.x + westElevatorWall.w / 2);
  assert.equal(projectileIntersectsProp(westDoor.x, 1.2, westDoor.z, 0.02, westDoor), true);
  assert.equal(projectileIntersectsProp(elevatorWall.x, 1.2, elevatorWall.z, 0.1, elevatorWall), true);
  assert.equal(overlapsPropFootprint(lobbyBench.x, lobbyBench.z, 0.25, lobbyBench), true);
});
