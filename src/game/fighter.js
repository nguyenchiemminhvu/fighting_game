import { ARENA_LIMIT, ARENA_PROPS, PALMS, clamp, overlapsPropFootprint } from './rules.js';

// Deterministic fighter simulation shared by the authoritative server and the
// client's prediction. Both sides advance it in identical fixed ticks, one
// input command per tick, so the client can replay its unacknowledged commands
// on top of any server snapshot and arrive at the same result.
export const TICK_RATE = 60;
export const TICK_DT = 1 / TICK_RATE;

export const RUN_SPEED = 5.6;
export const BACKWARD_SPEED = RUN_SPEED * 0.85;
export const SLOW_SPEED = 2.9;
export const DASH_SPEED = 16.5;
export const DASH_SECONDS = 0.17;
export const DASH_COOLDOWN = 3;
export const GRAVITY = 20;
export const JUMP_SPEED = 8;
export const DOUBLE_JUMP_SPEED = 7;
export const CAST_SECONDS = 0.38;
export const BODY_RADIUS = 0.48;

// A fighter stands on a prop while its centre is at most this far past the edge.
const SUPPORT_RADIUS = 0.25;
// Feet this close to a prop's top no longer collide with its sides.
const STEP_CLEARANCE = 0.06;
const CHARACTER_HEIGHT = 2.24;
// Long displacements (dash, knockback) are swept in slices thinner than the
// thinnest wall so they cannot tunnel through it.
const MAX_MOVE_SLICE = 0.25;
const EPSILON = 1e-9;

const COMBO_MARKS = [0.18, 0.69, 1.2];
const COMBO_HOLD_SECONDS = 0.28;
const COMBO_END_SINGLE = 0.66;
const COMBO_END_FULL = 1.58;

const BUTTON_Q = 1;
const BUTTON_C = 2;
const BUTTON_JUMP = 4;
const DASH_SHIFT = 3;

// Double-tap direction codes carried in a command, as [forward, right] axes.
export const DASH_KEYS = { KeyW: 1, KeyS: 2, KeyA: 3, KeyD: 4 };
const DASH_AXES = [null, [1, 0], [-1, 0], [0, -1], [0, 1]];

export const NEUTRAL_CMD = Object.freeze({ seq: 0, f: 0, r: 0, yaw: NaN, q: false, c: false, jump: false, dash: 0 });

export function encodeCmd(cmd) {
  const bits = (cmd.q ? BUTTON_Q : 0) | (cmd.c ? BUTTON_C : 0) | (cmd.jump ? BUTTON_JUMP : 0) | (cmd.dash << DASH_SHIFT);
  return [cmd.seq, cmd.f, cmd.r, cmd.yaw, bits];
}

// Commands come from the network, so every field is validated and clamped.
export function decodeCmd(raw) {
  if (!Array.isArray(raw)) return null;
  const seq = raw[0];
  if (!Number.isSafeInteger(seq) || seq <= 0) return null;
  const bits = Number.isInteger(raw[4]) ? raw[4] : 0;
  const dash = (bits >> DASH_SHIFT) & 7;
  return {
    seq,
    f: clamp(Number(raw[1]) || 0, -1, 1),
    r: clamp(Number(raw[2]) || 0, -1, 1),
    yaw: Number.isFinite(raw[3]) ? raw[3] : NaN,
    q: Boolean(bits & BUTTON_Q),
    c: Boolean(bits & BUTTON_C),
    jump: Boolean(bits & BUTTON_JUMP),
    dash: dash < DASH_AXES.length ? dash : 0,
  };
}

export function createFighter(x = 0, z = 0, yaw = 0, palm = 'chi') {
  return {
    x, y: 0, z, yaw,
    // Horizontal velocity is steered by input only while grounded; once the
    // fighter leaves the ground it is carried unchanged until landing.
    vx: 0, vy: 0, vz: 0,
    grounded: true, jumps: 0,
    action: 'idle', actionT: 0, actionStep: 0,
    chargeT: 0,
    comboT: 0, comboHits: 1, comboIndex: 0, comboHeld: false,
    dashT: 0, dashX: 0, dashZ: 0, dashCd: 0,
    cooldown: 0, stunT: 0, slowT: 0,
    qDown: false, cDown: false,
    palm,
  };
}

const FIGHTER_FIELDS = Object.keys(createFighter());

export function packFighter(fighter) {
  return FIGHTER_FIELDS.map((key) => fighter[key]);
}

export function unpackFighter(values, target = createFighter()) {
  for (let i = 0; i < FIGHTER_FIELDS.length; i++) target[FIGHTER_FIELDS[i]] = values[i];
  return target;
}

export function chargeProgress(fighter) {
  if (fighter.action !== 'charge') return 0;
  const palm = PALMS[fighter.palm];
  return palm?.charge > 0 ? clamp(fighter.chargeT / palm.charge, 0, 1) : 0;
}

function setAction(fighter, action) {
  fighter.action = action;
  fighter.actionT = 0;
}

function isFree(fighter) {
  return fighter.action === 'idle' || fighter.action === 'run' || fighter.action === 'jump';
}

// Push the fighter's body circle out of every prop whose vertical span
// intersects the character. Raised props (for example the hall roof) also
// block the character below their base instead of behaving as decorations.
function resolveProps(fighter, arena = null) {
  const props = arena?.props ?? ARENA_PROPS;
  const limitX = arena?.limitX ?? ARENA_LIMIT;
  const limitZ = arena?.limitZ ?? ARENA_LIMIT;
  for (let pass = 0; pass < 3; pass++) {
    for (const prop of props) {
      const baseY = prop.baseY ?? 0;
      const topY = baseY + prop.h;
      if (fighter.y >= topY - STEP_CLEARANCE || fighter.y + CHARACTER_HEIGHT <= baseY) continue;

      if (prop.shape === 'cylinder') {
        const dx = fighter.x - prop.x;
        const dz = fighter.z - prop.z;
        const minDistance = Math.min(prop.w, prop.d) / 2 + BODY_RADIUS;
        const distance = Math.hypot(dx, dz);
        if (distance >= minDistance) continue;
        if (distance > 1e-9) {
          const push = (minDistance - distance) / distance;
          fighter.x += dx * push;
          fighter.z += dz * push;
        } else {
          fighter.x = prop.x + minDistance;
        }
        continue;
      }

      const hx = prop.w / 2;
      const hz = prop.d / 2;
      const dx = fighter.x - prop.x;
      const dz = fighter.z - prop.z;
      const ox = dx - clamp(dx, -hx, hx);
      const oz = dz - clamp(dz, -hz, hz);
      const distSq = ox * ox + oz * oz;
      if (distSq >= BODY_RADIUS * BODY_RADIUS) continue;
      if (distSq > 1e-12) {
        const dist = Math.sqrt(distSq);
        const push = (BODY_RADIUS - dist) / dist;
        fighter.x += ox * push;
        fighter.z += oz * push;
      } else if (hx - Math.abs(dx) < hz - Math.abs(dz)) {
        // Centre is inside the footprint: leave through the nearest face.
        fighter.x = prop.x + (dx >= 0 ? 1 : -1) * (hx + BODY_RADIUS);
      } else {
        fighter.z = prop.z + (dz >= 0 ? 1 : -1) * (hz + BODY_RADIUS);
      }
    }
  }
  fighter.x = clamp(fighter.x, -limitX, limitX);
  fighter.z = clamp(fighter.z, -limitZ, limitZ);
}

// Horizontal displacement with collision; also used by the server for knockback.
export function displaceFighter(fighter, dx, dz, arena = null) {
  const slices = Math.max(1, Math.ceil(Math.hypot(dx, dz) / MAX_MOVE_SLICE));
  for (let i = 0; i < slices; i++) {
    fighter.x += dx / slices;
    fighter.z += dz / slices;
    resolveProps(fighter, arena);
  }
}

// A hit that interrupts whatever the fighter is doing. Server-side only: the
// victim's client learns about it from the next authoritative snapshot.
export function stunFighter(fighter, seconds) {
  setAction(fighter, 'stun');
  fighter.stunT = seconds;
  fighter.chargeT = 0;
  fighter.comboT = 0;
  fighter.comboIndex = 0;
  fighter.comboHeld = false;
  fighter.dashT = 0;
  fighter.vx = 0;
  fighter.vz = 0;
}

function applyGravity(fighter, dt, arena = null) {
  const oldY = fighter.y;
  fighter.vy -= GRAVITY * dt;
  const nextY = oldY + fighter.vy * dt;
  let support = 0;
  if (fighter.vy <= 0) {
    for (const prop of (arena?.props ?? ARENA_PROPS)) {
      const topY = (prop.baseY ?? 0) + prop.h;
      if (oldY < topY - 0.08 || nextY > topY) continue;
      if (overlapsPropFootprint(fighter.x, fighter.z, SUPPORT_RADIUS, prop)) support = Math.max(support, topY);
    }
  }
  if (fighter.vy <= 0 && nextY <= support) {
    fighter.y = support;
    fighter.vy = 0;
    fighter.jumps = 0;
    fighter.grounded = true;
  } else {
    fighter.y = nextY;
    fighter.grounded = false;
  }
}

// Advance one fighter by one input command. `events` (optional) collects what
// the server must act on: 'strike', 'launch', 'charge-begin', 'charge-cancel', 'jump'.
export function stepFighter(fighter, cmd, dt = TICK_DT, events = null, arena = null) {
  const f = fighter;
  f.cooldown = Math.max(0, f.cooldown - dt);
  f.dashCd = Math.max(0, f.dashCd - dt);
  f.slowT = Math.max(0, f.slowT - dt);
  f.actionT += dt;
  if (Number.isFinite(cmd.yaw)) f.yaw = cmd.yaw;

  if (f.stunT > 0) {
    f.stunT = Math.max(0, f.stunT - dt);
    if (f.stunT > 0) {
      if (f.action !== 'stun') setAction(f, 'stun');
    } else if (f.action === 'stun') {
      setAction(f, 'idle');
    }
  } else if (f.action === 'stun') {
    setAction(f, 'idle');
  }

  const qPressed = cmd.q && !f.qDown;
  const cPressed = cmd.c && !f.cDown;
  const cReleased = !cmd.c && f.cDown;
  f.qDown = cmd.q;
  f.cDown = cmd.c;
  if (!cmd.q) f.comboHeld = false;

  if (cPressed && isFree(f) && f.cooldown <= 0) {
    const palm = PALMS[f.palm];
    if (palm && palm.effect !== 'copy' && palm.charge > 0) {
      setAction(f, 'charge');
      f.chargeT = 0;
      events?.push('charge-begin');
    }
  } else if (cReleased && f.action === 'charge') {
    setAction(f, 'idle');
    f.chargeT = 0;
    events?.push('charge-cancel');
  }

  const onFoot = f.grounded && (f.action === 'idle' || f.action === 'run');
  if (qPressed && onFoot) {
    setAction(f, 'combo');
    f.actionStep = 0;
    f.comboT = 0;
    f.comboHits = 1;
    f.comboIndex = 0;
    f.comboHeld = true;
  } else if (cmd.dash && onFoot && f.slowT <= 0 && f.dashT <= 0 && f.dashCd <= 0) {
    const [axisF, axisR] = DASH_AXES[cmd.dash];
    f.dashX = -Math.sin(f.yaw) * axisF - Math.cos(f.yaw) * axisR;
    f.dashZ = -Math.cos(f.yaw) * axisF + Math.sin(f.yaw) * axisR;
    f.dashT = DASH_SECONDS;
    f.dashCd = DASH_COOLDOWN;
    setAction(f, 'dash');
  }

  let moveX = 0;
  let moveZ = 0;
  let gravity = true;

  if (f.action === 'charge') {
    // Vận khí pins the fighter in place, even in mid-air, and discards any
    // carried momentum so the fall afterwards is straight down.
    f.vx = 0; f.vy = 0; f.vz = 0;
    gravity = false;
    f.chargeT += dt;
    if (f.chargeT >= PALMS[f.palm].charge - EPSILON) {
      f.cooldown = PALMS[f.palm].cooldown;
      f.chargeT = 0;
      setAction(f, 'cast');
      if (!f.grounded) f.vy = -1.2;
      events?.push('launch');
    }
  } else if (f.action === 'combo') {
    f.comboT += dt;
    if (f.comboHeld && f.comboT >= COMBO_HOLD_SECONDS) f.comboHits = 3;
    if (f.comboIndex < f.comboHits && f.comboT >= COMBO_MARKS[f.comboIndex] - EPSILON) {
      f.comboIndex += 1;
      f.actionStep = f.comboIndex;
      events?.push('strike');
    }
    if (f.comboT >= (f.comboHits === 1 ? COMBO_END_SINGLE : COMBO_END_FULL) - EPSILON) {
      setAction(f, 'idle');
      f.comboT = 0;
      f.comboIndex = 0;
      f.comboHeld = false;
    }
    if (f.grounded) { f.vx = 0; f.vz = 0; }
  } else if (f.action === 'dash') {
    const slice = Math.min(dt, f.dashT);
    moveX = f.dashX * DASH_SPEED * slice;
    moveZ = f.dashZ * DASH_SPEED * slice;
    f.dashT -= slice;
    if (f.dashT <= EPSILON) {
      f.dashT = 0;
      // A dash that carried the fighter off a ledge continues at running pace.
      f.vx = f.dashX * RUN_SPEED;
      f.vz = f.dashZ * RUN_SPEED;
      setAction(f, 'idle');
    }
  } else if (f.action === 'cast' || f.action === 'stun') {
    if (f.action === 'cast' && f.actionT >= CAST_SECONDS - EPSILON) setAction(f, 'idle');
    if (f.grounded) { f.vx = 0; f.vz = 0; }
    moveX = f.vx * dt;
    moveZ = f.vz * dt;
  } else {
    if (f.grounded) {
      const magnitude = Math.hypot(cmd.f, cmd.r);
      if (magnitude > 0.08) {
        const moveSpeed = f.slowT > 0
          ? SLOW_SPEED
          : cmd.f < -0.08 ? BACKWARD_SPEED : RUN_SPEED;
        const scale = moveSpeed / Math.max(1, magnitude);
        f.vx = (-Math.sin(f.yaw) * cmd.f - Math.cos(f.yaw) * cmd.r) * scale;
        f.vz = (-Math.cos(f.yaw) * cmd.f + Math.sin(f.yaw) * cmd.r) * scale;
      } else {
        f.vx = 0;
        f.vz = 0;
      }
    }
    // Jumping keeps the horizontal velocity of this very tick, so a running
    // jump travels; the second (khinh công) jump cannot redirect it either.
    if (cmd.jump) {
      if (f.grounded) {
        f.jumps = 1;
        f.vy = JUMP_SPEED;
        f.grounded = false;
        events?.push('jump');
      } else if (f.jumps < 2) {
        f.jumps = 2;
        f.vy = DOUBLE_JUMP_SPEED;
        events?.push('jump');
      }
    }
    moveX = f.vx * dt;
    moveZ = f.vz * dt;
  }

  if (moveX !== 0 || moveZ !== 0) displaceFighter(f, moveX, moveZ, arena);
  if (gravity) applyGravity(f, dt, arena);

  if (isFree(f)) {
    f.action = !f.grounded ? 'jump' : (f.vx !== 0 || f.vz !== 0) ? 'run' : 'idle';
  }
}
