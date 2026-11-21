import test from 'node:test';
import assert from 'node:assert/strict';
import { PALMS } from '../src/game/rules.js';
import {
  NEUTRAL_CMD, RUN_SPEED, TICK_DT,
  createFighter, decodeCmd, displaceFighter, encodeCmd, packFighter, stepFighter, unpackFighter,
} from '../src/game/fighter.js';

const input = (overrides = {}) => ({ ...NEUTRAL_CMD, yaw: 0, ...overrides });

function run(fighter, ticks, cmd) {
  for (let i = 0; i < ticks; i++) stepFighter(fighter, cmd, TICK_DT);
}

function near(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);
}

test('a running jump carries its velocity and cannot be steered until landing', () => {
  const fighter = createFighter(0, 4.5, 0);
  run(fighter, 10, input({ f: 1 }));
  near(fighter.vz, -RUN_SPEED);

  stepFighter(fighter, input({ f: 1, jump: true }), TICK_DT);
  assert.equal(fighter.grounded, false);
  const startZ = fighter.z;

  // Pulling back and strafing in the air changes nothing.
  run(fighter, 20, input({ f: -1, r: 1 }));
  near(fighter.vx, 0);
  near(fighter.vz, -RUN_SPEED);
  near(fighter.z, startZ - RUN_SPEED * 20 * TICK_DT);

  // Neither does the second jump; a third press is ignored.
  stepFighter(fighter, input({ r: 1, jump: true }), TICK_DT);
  assert.equal(fighter.jumps, 2);
  const risingSpeed = fighter.vy;
  stepFighter(fighter, input({ jump: true }), TICK_DT);
  assert.ok(fighter.vy < risingSpeed);
  near(fighter.vx, 0);
  near(fighter.vz, -RUN_SPEED);

  for (let i = 0; i < 240 && !fighter.grounded; i++) stepFighter(fighter, input(), TICK_DT);
  assert.equal(fighter.grounded, true);
  run(fighter, 2, input({ f: -1 }));
  near(fighter.vz, RUN_SPEED);
});

test('a jump from standstill goes straight up', () => {
  const fighter = createFighter(0, 4.5, 0);
  stepFighter(fighter, input({ jump: true }), TICK_DT);
  run(fighter, 15, input({ f: 1 }));
  assert.ok(fighter.y > 1);
  near(fighter.x, 0);
  near(fighter.z, 4.5);
});

test('charging a palm in mid-air pins the fighter, then drops it straight down', () => {
  const fighter = createFighter(0, 4.5, 0, 'hoa');
  run(fighter, 5, input({ f: 1 }));
  stepFighter(fighter, input({ f: 1, jump: true }), TICK_DT);
  run(fighter, 12, input({ f: 1 }));

  const events = [];
  stepFighter(fighter, input({ f: 1, c: true }), TICK_DT, events);
  assert.deepEqual(events, ['charge-begin']);
  const held = { x: fighter.x, y: fighter.y, z: fighter.z };
  assert.ok(held.y > 1);

  let ticks = 1;
  while (fighter.action === 'charge') {
    stepFighter(fighter, input({ f: 1, c: true }), TICK_DT, events);
    if (fighter.action === 'charge') assert.deepEqual({ x: fighter.x, y: fighter.y, z: fighter.z }, held);
    ticks += 1;
  }
  assert.equal(events.at(-1), 'launch');
  near(ticks * TICK_DT, PALMS.hoa.charge, TICK_DT);
  near(fighter.cooldown, PALMS.hoa.cooldown);

  for (let i = 0; i < 240 && !fighter.grounded; i++) stepFighter(fighter, input({ f: 1 }), TICK_DT);
  assert.equal(fighter.y, 0);
  near(fighter.x, held.x);
  near(fighter.z, held.z);
});

test('replaying pending commands on a snapshot reproduces the simulation exactly', () => {
  const script = (tick) => input({
    seq: tick + 1,
    yaw: tick * 0.011,
    f: tick % 90 < 60 ? 1 : 0,
    r: tick % 70 < 20 ? -1 : 0,
    jump: tick % 45 === 7 || tick % 45 === 20,
    dash: tick === 100 ? 4 : 0,
    q: tick > 200 && tick < 240,
    c: tick > 320 && tick < 400,
  });
  const server = createFighter(0, 4.5, 0, 'bang');
  let snapshot = null;
  for (let tick = 0; tick < 480; tick++) {
    if (tick === 150) snapshot = JSON.parse(JSON.stringify(packFighter(server)));
    const wire = decodeCmd(JSON.parse(JSON.stringify(encodeCmd(script(tick)))));
    stepFighter(server, wire, TICK_DT);
  }
  const client = unpackFighter(snapshot);
  for (let tick = 150; tick < 480; tick++) stepFighter(client, script(tick), TICK_DT);
  assert.deepEqual(client, server);
});

test('fighters can jump onto props, stand on them, and are never pushed through walls', () => {
  // platform-a spans z in [-1.2, 1.2] at x = -4.8 and is 0.95 high.
  const fighter = createFighter(-4.8, 4, 0);
  run(fighter, 60, input({ f: 1 }));
  near(fighter.z, 1.2 + 0.48, 1e-6);
  assert.equal(fighter.y, 0);

  stepFighter(fighter, input({ f: 1, jump: true }), TICK_DT);
  for (let i = 0; i < 120 && !fighter.grounded; i++) stepFighter(fighter, input(), TICK_DT);
  assert.equal(fighter.y, 0.95);
  assert.ok(Math.abs(fighter.z) < 1.2);

  // Walking off the far edge falls back to the ground.
  run(fighter, 90, input({ f: 1 }));
  assert.equal(fighter.y, 0);
  assert.ok(fighter.z < -1.2 - 0.48 + 1e-6);

  // wall-nw is only 0.6 thick; a 5-unit knockback must stop at its face.
  const victim = createFighter(-5.8, -9.9, 0);
  displaceFighter(victim, 0, -5);
  near(victim.z, -10.5 + 0.48, 1e-6);
});
