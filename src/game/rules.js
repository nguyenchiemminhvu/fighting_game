export const MATCH_SECONDS = 300;
export const PREP_SECONDS = 10;
export const ROOM_CAPACITY = 2;
export const ROOMS = [
  { key: 'room-1', name: 'Sân đình', subtitle: 'Đèn lồng · nền đá', map: 'courtyard' },
  { key: 'room-2', name: 'Sân chùa', subtitle: 'Cột gỗ · mái ngói', map: 'temple' },
  { key: 'room-3', name: 'Võ đường', subtitle: 'Sàn gỗ · võ khí', map: 'dojo' },
  { key: 'room-4', name: 'Bãi sông', subtitle: 'Đá tảng · sương nước', map: 'riverside' },
  { key: 'room-5', name: 'Rừng trúc', subtitle: 'Trúc xanh · địa hình', map: 'bamboo' },
  { key: 'room-6', name: 'Đài nguyệt', subtitle: 'Sân tròn · đài cao', map: 'moon' },
];

export const PALMS = {
  chi: {
    id: 'chi', name: 'Nhất Dương Chỉ', short: 'Nhất Dương', icon: '☯',
    charge: 0.2, cooldown: 1.33, range: 24, speed: 34, score: 8, knockback: 1.5,
    radius: 0.22, color: '#d9ecff', effect: 'interrupt',
    description: 'Chỉ lực cực nhanh, tầm xa. Sát thương thấp, hủy vận khí của đối thủ.',
    detail: 'Vận khí 0,2s · Hồi 1,3s · Tầm xa',
  },
  long: {
    id: 'long', name: 'Giáng Long Chưởng', short: 'Giáng Long', icon: '🐉',
    charge: 1.0, cooldown: 3.33, range: 23, speed: 23, score: 23, knockback: 5.2,
    radius: 0.72, color: '#8fd2df', effect: 'interrupt', spin: true,
    description: 'Xoay người tụ lực rồi phóng long khí. Sát thương và lực đẩy rất lớn.',
    detail: 'Vận khí 1s · Hồi 3,3s · Tầm xa',
  },
  bang: {
    id: 'bang', name: 'Hàn Băng Chưởng', short: 'Hàn Băng', icon: '❄',
    charge: 0.53, cooldown: 2.67, range: 16, speed: 23, score: 14, knockback: 1.8,
    radius: 0.52, color: '#9ee9ff', effect: 'slow', slowSeconds: 5,
    description: 'Hàn khí làm chậm 5 giây và khóa bộ pháp của đối thủ.',
    detail: 'Vận khí 0,5s · Hồi 2,7s · Tầm trung',
  },
  hoa: {
    id: 'hoa', name: 'Hoả Diệm Đao', short: 'Hoả Diệm', icon: '🔥',
    charge: 0.4, cooldown: 2, range: 16, speed: 23, score: 13, knockback: 1.7,
    radius: 0.52, color: '#ff873f', effect: 'burn', burnSeconds: 3, slash: true,
    description: 'Hỏa nhận chém ngang, khó né trái phải; có thể né bằng cách đổi độ cao.',
    detail: 'Vận khí 0,4s · Hồi 2s · Tầm trung',
  },
  kim: {
    id: 'kim', name: 'Đại Lực Kim Cang Chưởng', short: 'Kim Cang', icon: '✋',
    charge: 0.53, cooldown: 2.67, range: 8, speed: 25, score: 22, knockback: 5.0,
    // A giant palm front: `radius` spans across the flight path, `depth` along
    // it, and only the small `terrainRadius` core is stopped by terrain.
    radius: 3.6, depth: 1.2, terrainRadius: 0.5, visualScale: 3,
    color: '#f3dfb0', effect: 'interrupt',
    description: 'Bàn tay khổng lồ tầm gần, không thể né ngang hay nhảy qua — chỉ có thể lùi ra xa.',
    detail: 'Vận khí 0,5s · Hồi 2,7s · Tầm gần, vùng rất rộng',
  },
  xiao: {
    id: 'xiao', name: 'Tiểu Vô Tướng Công', short: 'Vô Tướng', icon: '☯',
    charge: 0, cooldown: 0, range: 0, speed: 0, score: 0, knockback: 0,
    radius: 0, color: '#e2c98e', effect: 'copy',
    description: 'Bắt chước chưởng pháp mà đối thủ đã chọn khi bắt đầu trận.',
    detail: 'Sao chép chưởng của đối thủ khi hết thời gian chuẩn bị',
  },
};

export const PALM_IDS = Object.keys(PALMS);

// Fixed props are shared by client rendering and authoritative server collision.
// x/z are the centre, w/d are footprint dimensions, h is total height.
export const ARENA_PROPS = [
  { id: 'pillar-nw', kind: 'pillar', x: -8.4, z: -7.7, w: 1.1, d: 1.1, h: 4.0 },
  { id: 'pillar-ne', kind: 'pillar', x: 8.4, z: -7.7, w: 1.1, d: 1.1, h: 4.0 },
  { id: 'pillar-sw', kind: 'pillar', x: -8.4, z: 7.7, w: 1.1, d: 1.1, h: 4.0 },
  { id: 'pillar-se', kind: 'pillar', x: 8.4, z: 7.7, w: 1.1, d: 1.1, h: 4.0 },
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
];

export const ARENA_LIMIT = 14.6;

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
