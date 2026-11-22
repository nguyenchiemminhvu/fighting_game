/**
 * Fixed spectator viewpoints around the arena.
 * Every camera sits at a 45-degree elevation: horizontal distance == height.
 */
export const SPECTATOR_LIMIT = 10;
export const SPECTATOR_CAMERA_DISTANCE = 21;
export const SPECTATOR_CAMERA_HEIGHT = 21;

export const SPECTATOR_CAMERAS = Object.freeze([
  { key: 'north', label: 'Chính diện Bắc', x: 0, z: -1 },
  { key: 'east', label: 'Phía Đông', x: 1, z: 0 },
  { key: 'south', label: 'Chính diện Nam', x: 0, z: 1 },
  { key: 'west', label: 'Phía Tây', x: -1, z: 0 },
]);

export function getSpectatorCameraPose(index) {
  const camera = SPECTATOR_CAMERAS[((index % SPECTATOR_CAMERAS.length) + SPECTATOR_CAMERAS.length) % SPECTATOR_CAMERAS.length];
  return {
    x: camera.x * SPECTATOR_CAMERA_DISTANCE,
    y: SPECTATOR_CAMERA_HEIGHT,
    z: camera.z * SPECTATOR_CAMERA_DISTANCE,
    targetX: 0,
    targetY: 0,
    targetZ: 0,
    label: camera.label,
  };
}

/** Decide whether a new connection receives a fighter seat or a viewer seat. */
export function getRoomJoinRole(playerCount, viewerCount, phase, ejectingViewers = false) {
  if (phase === 'waiting' && playerCount < 2) return 'player';
  if (playerCount === 2 && ['select', 'fight', 'end'].includes(phase)
    && !ejectingViewers && viewerCount < SPECTATOR_LIMIT) {
    return 'spectator';
  }
  return null;
}
