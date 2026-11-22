export const MAX_HP = 100;
export const BLAST_RADIUS_PER_DAMAGE = 0.14;
export const PREP_SECONDS = 10;
export const DISENGAGEMENT_LIMIT_SECONDS = 30;
export const DISENGAGEMENT_HALF_ANGLE_DEGREES = 45;
export const ROOM_CAPACITY = 2;
export const ROOMS = [
  { key: 'room-1', name: 'Sân đình', subtitle: 'Đèn lồng · nền đá', map: 'courtyard' },
  { key: 'room-2', name: 'Sân chùa', subtitle: 'Cột gỗ · mái ngói', map: 'temple' },
  { key: 'room-3', name: 'Võ đường', subtitle: 'Sàn gỗ · võ khí', map: 'dojo' },
  { key: 'room-4', name: 'Bãi sông', subtitle: 'Đá tảng · sương nước', map: 'riverside' },
  { key: 'room-5', name: 'Rừng trúc', subtitle: 'Trúc xanh · địa hình', map: 'bamboo' },
  { key: 'room-6', name: 'Trước cổng công ty', subtitle: 'Cổng quẹt thẻ · sảnh chữ T', map: 'office-gate' },
];

export const PALMS = {
  chi: {
    id: 'chi', name: 'Nhất Dương Chỉ', short: 'Nhất Dương', icon: '☯',
    charge: 0.2, cooldown: 1.33, range: 24, speed: 34, damage: 8, knockback: 1.5,
    radius: 0.22, color: '#d9ecff', effect: 'interrupt',
    description: 'Chỉ lực cực nhanh, tầm xa. Sát thương thấp, hủy vận khí của đối thủ.',
    detail: 'Vận khí 0,2s · Hồi 1,3s · Tầm xa',
  },
  long: {
    id: 'long', name: 'Giáng Long Chưởng', short: 'Giáng Long', icon: '🐉',
    charge: 1.0, cooldown: 3.33, range: 23, speed: 23, damage: 23, knockback: 5.2,
    radius: 0.72, color: '#8fd2df', effect: 'interrupt', spin: true,
    description: 'Xoay người tụ lực rồi phóng long khí. Sát thương và lực đẩy rất lớn.',
    detail: 'Vận khí 1s · Hồi 3,3s · Tầm xa',
  },
  bang: {
    id: 'bang', name: 'Hàn Băng Chưởng', short: 'Hàn Băng', icon: '❄',
    charge: 0.53, cooldown: 2.67, range: 16, speed: 23, damage: 14, knockback: 1.8,
    radius: 0.52, color: '#9ee9ff', effect: 'slow', slowSeconds: 5,
    description: 'Hàn khí làm chậm 5 giây và khóa bộ pháp của đối thủ.',
    detail: 'Vận khí 0,5s · Hồi 2,7s · Tầm trung',
  },
  hoa: {
    id: 'hoa', name: 'Hoả Diệm Đao', short: 'Hoả Diệm', icon: '🔥',
    charge: 0.4, cooldown: 2, range: 16, speed: 23, damage: 13, knockback: 1.7,
    radius: 0.52, color: '#ff873f', effect: 'burn', burnSeconds: 3, slash: true,
    description: 'Hỏa nhận chém ngang, khó né trái phải; có thể né bằng cách đổi độ cao.',
    detail: 'Vận khí 0,4s · Hồi 2s · Tầm trung',
  },
  kim: {
    id: 'kim', name: 'Đại Lực Kim Cang Chưởng', short: 'Kim Cang', icon: '✋',
    charge: 0.53, cooldown: 2.67, range: 8, speed: 25, damage: 22, knockback: 5.0,
    // A giant palm front: `radius` spans across the flight path, `depth` along
    // it, and only the small `terrainRadius` core is stopped by terrain.
    radius: 3.6, depth: 1.2, terrainRadius: 0.5, visualScale: 3,
    color: '#f3dfb0', effect: 'interrupt',
    description: 'Bàn tay khổng lồ tầm gần, không thể né ngang hay nhảy qua — chỉ có thể lùi ra xa.',
    detail: 'Vận khí 0,5s · Hồi 2,7s · Tầm gần, vùng rất rộng',
  },
  xiao: {
    id: 'xiao', name: 'Tiểu Vô Tướng Công', short: 'Vô Tướng', icon: '☯',
    charge: 0, cooldown: 0, range: 0, speed: 0, damage: 0, knockback: 0,
    radius: 0, color: '#e2c98e', effect: 'copy',
    description: 'Bắt chước chưởng pháp mà đối thủ đã chọn khi bắt đầu trận.',
    detail: 'Sao chép chưởng của đối thủ khi hết thời gian chuẩn bị',
  },
};

export const PALM_IDS = Object.keys(PALMS);

// Fixed props are shared by client rendering and authoritative server collision.
// x/z are the centre, w/d are footprint dimensions, h is total height.
export const ARENA_PROPS = [
  { id: 'pillar-nw', kind: 'pillar', shape: 'cylinder', x: -8.4, z: -7.7, w: 1.1, d: 1.1, h: 4.0 },
  { id: 'pillar-ne', kind: 'pillar', shape: 'cylinder', x: 8.4, z: -7.7, w: 1.1, d: 1.1, h: 4.0 },
  { id: 'pillar-sw', kind: 'pillar', shape: 'cylinder', x: -8.4, z: 7.7, w: 1.1, d: 1.1, h: 4.0 },
  { id: 'pillar-se', kind: 'pillar', shape: 'cylinder', x: 8.4, z: 7.7, w: 1.1, d: 1.1, h: 4.0 },
  { id: 'stone-west', kind: 'rock', x: -10.5, z: 0.1, w: 2.1, d: 2.5, h: 1.5 },
  { id: 'stone-east', kind: 'rock', x: 10.5, z: -0.1, w: 2.1, d: 2.5, h: 1.5 },
  { id: 'stone-north', kind: 'stone', x: 0.2, z: -10.8, w: 2.8, d: 1.7, h: 1.15 },
  { id: 'stone-south', kind: 'stone', x: -0.2, z: 10.8, w: 2.8, d: 1.7, h: 1.15 },
  { id: 'platform-a', kind: 'platform', x: -4.8, z: 0, w: 2.8, d: 2.4, h: 0.95 },
  { id: 'platform-b', kind: 'platform', x: 4.8, z: 0, w: 2.8, d: 2.4, h: 0.95 },
  { id: 'wall-nw', kind: 'wall', x: -5.8, z: -10.8, w: 3.3, d: 0.6, h: 2.7 },
  { id: 'wall-ne', kind: 'wall', x: 5.8, z: -10.8, w: 3.3, d: 0.6, h: 2.7 },
  { id: 'wall-sw', kind: 'wall', x: -5.8, z: 10.8, w: 3.3, d: 0.6, h: 2.7 },
  { id: 'wall-se', kind: 'wall', x: 5.8, z: 10.8, w: 3.3, d: 0.6, h: 2.7 },
  // Rear hall walls/roof are real obstacles too, not decorative meshes without server colliders.
  { id: 'hall-back', kind: 'wall', x: 0, z: -14.4, w: 7.6, d: 0.8, h: 2.0 },
  { id: 'hall-roof', kind: 'roof', x: 0, z: -14.2, w: 8.8, d: 1.8, h: 0.42, baseY: 2.04 },
];

export const ARENA_LIMIT = 14.6;

// Room-specific geometry is data, not duplicated client/server scene code.
// The same objects drive Babylon meshes, server collision, projectile blocking,
// client prediction and jump landing support. `baseY` is the bottom of a raised
// solid; `w/d/h` are the exact box dimensions (cylinders use `w` as diameter).
const OFFICE_GATE_PROPS = [
  // Checkpoint boundary and the overhead sign beam. The two wall wings leave
  // a controlled central entrance into the narrow stem of the T-shaped lobby.
  { id: 'office-entry-wall-left', kind: 'wall', material: 'concrete', x: -10.0, z: -13.92, w: 8.0, d: 0.5, h: 3.45 },
  { id: 'office-entry-wall-right', kind: 'wall', material: 'concrete', x: 10.0, z: -13.92, w: 8.0, d: 0.5, h: 3.45 },
  { id: 'office-entry-sign-beam', kind: 'beam', material: 'metal', x: 0, z: -13.66, w: 5.8, d: 0.34, h: 0.42, baseY: 3.0 },

  // Card readers / waist-high turnstiles. Their posts and swing bars are all
  // solid volumes; jumping over the bars remains possible under fighter rules.
  { id: 'office-turnstile-left-post', kind: 'pillar', material: 'metal', shape: 'cylinder', x: -1.45, z: -12.55, w: 0.52, d: 0.52, h: 1.12 },
  { id: 'office-turnstile-right-post', kind: 'pillar', material: 'metal', shape: 'cylinder', x: 1.45, z: -12.55, w: 0.52, d: 0.52, h: 1.12 },
  { id: 'office-card-reader-screen-left', kind: 'display', material: 'display', x: -1.17, z: -12.55, w: 0.04, d: 0.2, h: 0.22, baseY: 0.8 },
  { id: 'office-card-reader-screen-right', kind: 'display', material: 'display', x: 1.17, z: -12.55, w: 0.04, d: 0.2, h: 0.22, baseY: 0.8 },
  { id: 'office-turnstile-left-arm', kind: 'barrier', material: 'glass', x: -2.0, z: -12.55, w: 1.1, d: 0.12, h: 0.12, baseY: 0.82 },
  { id: 'office-turnstile-right-arm', kind: 'barrier', material: 'glass', x: 2.0, z: -12.55, w: 1.1, d: 0.12, h: 0.12, baseY: 0.82 },

  // Guard booth at the left side of the checkpoint. The booth is assembled
  // from the same boxes used for collision, including its glass and canopy.
  { id: 'office-guard-left-side', kind: 'wall', material: 'concrete', x: -12.18, z: -10.65, w: 0.18, d: 2.55, h: 2.65 },
  { id: 'office-guard-right-side', kind: 'wall', material: 'concrete', x: -8.62, z: -10.65, w: 0.18, d: 2.55, h: 2.65 },
  { id: 'office-guard-rear-wall', kind: 'wall', material: 'concrete', x: -10.4, z: -9.39, w: 3.72, d: 0.18, h: 2.65 },
  { id: 'office-guard-window', kind: 'glass', material: 'glass', x: -10.4, z: -11.88, w: 3.45, d: 0.12, h: 1.45, baseY: 1.05 },
  { id: 'office-guard-counter', kind: 'counter', material: 'metal', x: -10.4, z: -11.48, w: 3.7, d: 0.62, h: 0.96 },
  { id: 'office-guard-canopy', kind: 'roof', material: 'metal', x: -10.4, z: -10.65, w: 3.95, d: 2.95, h: 0.2, baseY: 2.65 },

  // Narrow stem of the T: two continuous side walls, lined with elevator bays.
  { id: 'office-elevator-wall-left', kind: 'wall', material: 'concrete', x: -4.78, z: -5.0, w: 0.55, d: 16.0, h: 3.75 },
  { id: 'office-elevator-wall-right', kind: 'wall', material: 'concrete', x: 4.78, z: -5.0, w: 0.55, d: 16.0, h: 3.75 },
  // Elevator leaf panels project from the wall face by 6.5 cm and therefore
  // have their own matching render / movement / projectile / Havok boxes.
  { id: 'office-elevator-door-west-1', kind: 'door', material: 'metal', x: -4.4725, z: -9.4, w: 0.065, d: 1.84, h: 2.42, baseY: 0.13 },
  { id: 'office-elevator-door-west-2', kind: 'door', material: 'metal', x: -4.4725, z: -5.2, w: 0.065, d: 1.84, h: 2.42, baseY: 0.13 },
  { id: 'office-elevator-door-west-3', kind: 'door', material: 'metal', x: -4.4725, z: -1.0, w: 0.065, d: 1.84, h: 2.42, baseY: 0.13 },
  { id: 'office-elevator-door-east-1', kind: 'door', material: 'metal', x: 4.4725, z: -9.4, w: 0.065, d: 1.84, h: 2.42, baseY: 0.13 },
  { id: 'office-elevator-door-east-2', kind: 'door', material: 'metal', x: 4.4725, z: -5.2, w: 0.065, d: 1.84, h: 2.42, baseY: 0.13 },
  { id: 'office-elevator-door-east-3', kind: 'door', material: 'metal', x: 4.4725, z: -1.0, w: 0.065, d: 1.84, h: 2.42, baseY: 0.13 },
  // Outer stem walls and short return walls close off the space beside the
  // corridor. Players cannot walk around the elevator walls to bypass the T.
  { id: 'office-stem-outer-wall-west', kind: 'wall', material: 'concrete', x: -13.98, z: -5.335, w: 0.55, d: 16.67, h: 3.25 },
  { id: 'office-stem-outer-wall-east', kind: 'wall', material: 'concrete', x: 13.98, z: -5.335, w: 0.55, d: 16.67, h: 3.25 },
  { id: 'office-stem-return-west', kind: 'wall', material: 'concrete', x: -9.4, z: 3.0, w: 9.2, d: 0.55, h: 3.25 },
  { id: 'office-stem-return-east', kind: 'wall', material: 'concrete', x: 9.4, z: 3.0, w: 9.2, d: 0.55, h: 3.25 },

  // Wide crossbar lobby at the end of the corridor.
  { id: 'office-lobby-wall-west', kind: 'wall', material: 'concrete', x: -13.98, z: 8.55, w: 0.55, d: 11.2, h: 3.25 },
  { id: 'office-lobby-wall-east', kind: 'wall', material: 'concrete', x: 13.98, z: 8.55, w: 0.55, d: 11.2, h: 3.25 },
  { id: 'office-lobby-wall-south', kind: 'wall', material: 'concrete', x: 0, z: 14.05, w: 28.0, d: 0.55, h: 3.25 },

  // Low fixed waiting benches: players can jump onto and stand on their tops.
  { id: 'office-bench-west', kind: 'platform', material: 'stone', x: -10.2, z: 8.1, w: 3.0, d: 0.9, h: 0.68 },
  { id: 'office-bench-east', kind: 'platform', material: 'stone', x: 10.2, z: 8.1, w: 3.0, d: 0.9, h: 0.68 },
];

const CLASSIC_ARENA = {
  id: 'classic',
  props: ARENA_PROPS,
  limitX: ARENA_LIMIT,
  limitZ: ARENA_LIMIT,
  spawns: [
    { x: 0, z: 4.5, yaw: 0 },
    { x: 0, z: -4.5, yaw: Math.PI },
  ],
  cameraTarget: { x: 0, y: 0, z: 0 },
};

export const ARENA_MAPS = {
  classic: CLASSIC_ARENA,
  courtyard: CLASSIC_ARENA,
  temple: CLASSIC_ARENA,
  dojo: CLASSIC_ARENA,
  riverside: CLASSIC_ARENA,
  bamboo: CLASSIC_ARENA,
  'office-gate': {
    id: 'office-gate',
    props: OFFICE_GATE_PROPS,
    limitX: ARENA_LIMIT,
    limitZ: ARENA_LIMIT,
    // Both fighters begin in the wide crossbar lobby rather than one being
    // trapped in the narrow corridor by the room's asymmetric architecture.
    spawns: [
      { x: 0, z: 6.0, yaw: 0 },
      { x: 0, z: 10.2, yaw: Math.PI },
    ],
    cameraTarget: { x: 0, y: 0, z: 8.2 },
  },
};

export function getArenaDefinition(mapId = 'classic') {
  return ARENA_MAPS[mapId] ?? CLASSIC_ARENA;
}

export function blastRadiusForDamage(damage) {
  return Math.max(0, Number(damage) || 0) * BLAST_RADIUS_PER_DAMAGE;
}

export function applyHealthDamage(currentHp, damage) {
  const current = Math.max(0, Number(currentHp) || 0);
  const amount = Math.max(0, Number(damage) || 0);
  return Math.max(0, current - amount);
}

// A fighter is considered engaged when the opponent is in the forward 45-degree
// horizontal cone, or close enough to be within Great Vajra Palm's nominal range.
export function isEngagedWithOpponent(source, target) {
  if (!source || !target) return false;
  const dx = target.x - source.x;
  const dz = target.z - source.z;
  const dy = (target.y ?? 0) - (source.y ?? 0);
  const distance3D = Math.hypot(dx, dy, dz);
  if (distance3D <= PALMS.kim.range) return true;

  const horizontalDistance = Math.hypot(dx, dz);
  if (horizontalDistance <= 1e-9 || !Number.isFinite(source.yaw)) return false;

  const forwardX = -Math.sin(source.yaw);
  const forwardZ = -Math.cos(source.yaw);
  const facingDot = (dx * forwardX + dz * forwardZ) / horizontalDistance;
  const minDot = Math.cos((DISENGAGEMENT_HALF_ANGLE_DEGREES * Math.PI) / 180);
  return facingDot >= minDot - 1e-9;
}

export function advanceDisengagementTicks(currentTicks, engaged, limitTicks) {
  if (engaged) return 0;
  const current = Math.max(0, Math.trunc(Number(currentTicks) || 0));
  const limit = Math.max(1, Math.trunc(Number(limitTicks) || 1));
  return Math.min(limit, current + 1);
}

export function resolveDisengagementOutcome(playerIds, disengagedIds) {
  const players = [...new Set(playerIds)];
  const losers = [...new Set(disengagedIds)].filter((id) => players.includes(id));
  if (players.length !== 2 || losers.length === 0) return null;
  if (losers.length === 2) {
    return { winnerSessionId: '', reason: 'mutual_disengagement', loserSessionIds: losers };
  }
  return {
    winnerSessionId: players.find((id) => id !== losers[0]) ?? '',
    reason: 'disengagement',
    loserSessionIds: losers,
  };
}

// Collision footprints are shared by server movement and projectile tests.
// Cylindrical pillars use their visible circular radius; all other static props
// render as boxes with these exact width/depth values.
export function overlapsPropFootprint(x, z, radius, prop) {
  if (prop.shape === 'cylinder') {
    const obstacleRadius = Math.min(prop.w, prop.d) / 2;
    return (x - prop.x) ** 2 + (z - prop.z) ** 2 < (obstacleRadius + radius) ** 2;
  }
  const closestX = clamp(x, prop.x - prop.w / 2, prop.x + prop.w / 2);
  const closestZ = clamp(z, prop.z - prop.d / 2, prop.z + prop.d / 2);
  return (x - closestX) ** 2 + (z - closestZ) ** 2 < radius ** 2;
}

export function projectileIntersectsProp(x, y, z, radius, prop) {
  const baseY = prop.baseY ?? 0;
  if (y + radius <= baseY || y - radius >= baseY + prop.h) return false;
  if (prop.shape === 'cylinder') {
    const obstacleRadius = Math.min(prop.w, prop.d) / 2;
    return (x - prop.x) ** 2 + (z - prop.z) ** 2 < (obstacleRadius + radius) ** 2;
  }
  const closestX = clamp(x, prop.x - prop.w / 2, prop.x + prop.w / 2);
  const closestZ = clamp(z, prop.z - prop.d / 2, prop.z + prop.d / 2);
  return (x - closestX) ** 2 + (z - closestZ) ** 2 < radius ** 2;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Server-authoritative soft aim: only acquire a target that is already inside
// the fighter's forward 3D cone. The direction is frozen at launch.
export function computeAimDirection(source, target, yaw, halfAngleDegrees = 25) {
  const forwardX = -Math.sin(yaw);
  const forwardZ = -Math.cos(yaw);
  const dx = target.x - source.x;
  const dy = (target.y ?? 0) + 1.0 - ((source.y ?? 0) + 1.25);
  const dz = target.z - source.z;
  const length = Math.hypot(dx, dy, dz);
  const threshold = Math.cos((halfAngleDegrees * Math.PI) / 180);

  if (length > 1e-6) {
    // A 3D cone also respects height: an airborne opponent well above or below
    // the fighter is not magically acquired just because the horizontal angle is small.
    const forwardDot = (dx * forwardX + dz * forwardZ) / length;
    if (forwardDot >= threshold) {
      return { x: dx / length, y: dy / length, z: dz / length, locked: true };
    }
  }
  return { x: forwardX, y: 0, z: forwardZ, locked: false };
}
