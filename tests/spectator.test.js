import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SPECTATOR_LIMIT,
  SPECTATOR_CAMERAS,
  getRoomJoinRole,
  getSpectatorCameraPose,
} from '../src/game/spectatorCameras.js';

test('only the first two connections in a waiting room receive fighter seats', () => {
  assert.equal(getRoomJoinRole(0, 0, 'waiting'), 'player');
  assert.equal(getRoomJoinRole(1, 0, 'waiting'), 'player');
  assert.equal(getRoomJoinRole(2, 0, 'waiting'), null);
});

test('a full active arena accepts at most ten spectators', () => {
  assert.equal(getRoomJoinRole(2, 0, 'select'), 'spectator');
  assert.equal(getRoomJoinRole(2, 9, 'fight'), 'spectator');
  assert.equal(getRoomJoinRole(2, 0, 'end'), 'spectator');
  assert.equal(getRoomJoinRole(2, SPECTATOR_LIMIT, 'fight'), null);
  assert.equal(getRoomJoinRole(2, 0, 'fight', true), null);
  assert.equal(getRoomJoinRole(2, 0, 'waiting'), null);
  assert.equal(getRoomJoinRole(1, 0, 'end'), null);
});

test('four spectator viewpoints surround the arena at a 45-degree elevation', () => {
  assert.equal(SPECTATOR_CAMERAS.length, 4);
  for (let index = 0; index < 4; index++) {
    const pose = getSpectatorCameraPose(index);
    assert.equal(Math.abs(pose.y), Math.hypot(pose.x, pose.z));
    assert.deepEqual([pose.targetX, pose.targetY, pose.targetZ], [0, 0, 0]);
  }
  assert.equal(getSpectatorCameraPose(4).label, getSpectatorCameraPose(0).label);
});
