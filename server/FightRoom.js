import { Room } from '@colyseus/core';
import { Schema, MapSchema, defineTypes } from '@colyseus/schema';
import {
  ARENA_LIMIT,
  ARENA_PROPS,
  MAX_HP,
  PALMS,
  applyHealthDamage,
  blastRadiusForDamage,
  projectileIntersectsProp,
  PREP_SECONDS,
  computeAimDirection,
} from '../src/game/rules.js';
import { getRoomJoinRole, SPECTATOR_LIMIT } from '../src/game/spectatorCameras.js';
import {
  NEUTRAL_CMD,
  TICK_DT,
  chargeProgress,
  createFighter,
  decodeCmd,
  displaceFighter,
  packFighter,
  stepFighter,
  stunFighter,
} from '../src/game/fighter.js';

const PATCH_RATE_MS = 1000 / 30;
// Authoritative snapshots for client reconciliation go out every other tick.
const ACK_EVERY_TICKS = 2;
// One command is consumed per tick; extra ones only when more than this many
// are waiting, which absorbs network jitter without adding lasting latency.
const CMD_BUFFER_TARGET = 2;
// Commands are paid for with real time, so a client cannot simulate faster
// than the clock beyond a small catch-up allowance and a bounded burst.
const CMD_BUDGET_PER_TICK = 1.05;
const CMD_BUDGET_MAX = 15;
const CMD_QUEUE_MAX = 30;
const CMD_BATCH_MAX = 32;
// A client that stops sending is simulated with neutral input after this long.
const CMD_SILENCE_MS = 250;
const MAX_CATCH_UP_SECONDS = 0.1;

class PlayerState extends Schema {
  constructor() {
    super();
    this.name = 'Võ sinh';
    this.x = 0; this.y = 0; this.z = 0;
    this.yaw = 0; this.pitch = 0;
    this.hp = MAX_HP;
    this.action = 'idle';
    this.actionT = 0;
    this.actionStep = 0;
    this.palm = 'chi';
    this.activePalm = 'chi';
    this.charge = 0;
    this.cooldown = 0;
    this.slowT = 0;
    this.burnT = 0;
    this.ready = false;
    this.jumps = 0;
  }
}
defineTypes(PlayerState, {
  name: 'string', x: 'number', y: 'number', z: 'number', yaw: 'number', pitch: 'number',
  hp: 'number', action: 'string', actionT: 'number', actionStep: 'number',
  palm: 'string', activePalm: 'string', charge: 'number', cooldown: 'number',
  slowT: 'number', burnT: 'number', ready: 'boolean', jumps: 'number',
});

class FightState extends Schema {
  constructor(roomKey = '') {
    super();
    this.roomKey = roomKey;
    this.phase = 'waiting';
    this.prepLeft = PREP_SECONDS;
    this.players = new MapSchema();
    this.winnerSessionId = '';
    this.resultReason = '';
    this.roundNo = 0;
    // Simulation time in seconds; clients interpolate remote fighters against it.
    this.clock = 0;
    this.viewerCount = 0;
  }
}
defineTypes(FightState, {
  roomKey: 'string', phase: 'string', prepLeft: 'number',
  players: { map: PlayerState }, winnerSessionId: 'string', resultReason: 'string', roundNo: 'number',
  clock: 'number', viewerCount: 'number',
});

function safeName(value) {
  const name = String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 20);
  return name || `Võ sinh ${Math.floor(10 + Math.random() * 90)}`;
}

function forwardVector(yaw, pitch = 0) {
  const cp = Math.cos(pitch);
  return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
}

export class FightRoom extends Room {
  static registry = new Map();

  onCreate(options) {
    this.roomKey = options.roomKey;
    this.roomLabel = options.label;
    // Two fighter seats plus up to ten read-only spectator connections.
    this.maxClients = 2 + SPECTATOR_LIMIT;
    this.autoDispose = false;
    this.patchRate = PATCH_RATE_MS;
    this.setState(new FightState(this.roomKey));
    this.runtime = new Map();
    this.spectators = new Map();
    this.ejectingSpectators = false;
    this.projectiles = [];
    this.projectileSeq = 1;
    this.ending = false;
    this._endTimer = null;
    this.tickDebt = 0;
    this.tickCount = 0;
    this.events = [];
    FightRoom.registry.set(this.roomKey, this);

    this.onMessage('select-palm', (client, payload) => this.selectPalm(client, payload));
    this.onMessage('cmds', (client, payload) => this.queueCmds(client, payload));
    this.onMessage('request-role', (client) => {
      const role = this.spectators.has(client.sessionId)
        ? 'spectator'
        : this.state.players.has(client.sessionId) ? 'player' : 'unknown';
      client.send('room-role', { role, cameraCount: 4 });
    });
    this.onMessage('spectator-snapshot-request', (client) => {
      if (!this.spectators.has(client.sessionId)) return;
      for (const projectile of this.projectiles) client.send('projectile', { ...projectile });
    });
    this.setSimulationInterval((deltaMs) => this.update(deltaMs));
  }

  onJoin(client, options) {
    const role = getRoomJoinRole(
      this.state.players.size,
      this.spectators.size,
      this.state.phase,
      this.ejectingSpectators,
    );
    if (!role) {
      throw new Error(this.state.players.size >= 2
        ? 'Sàn đã đủ người xem.'
        : 'Sàn đấu đang kết thúc hoặc không còn chỗ.');
    }

    if (role === 'spectator') {
      this.spectators.set(client.sessionId, client);
      this.state.viewerCount = this.spectators.size;
      client.send('room-role', { role: 'spectator', cameraCount: 4 });
      return;
    }

    client.send('room-role', { role: 'player' });
    const slot = this.state.players.size;
    const player = new PlayerState();
    player.name = safeName(options?.name);
    player.x = 0;
    player.y = 0;
    player.z = slot === 0 ? 4.5 : -4.5;
    player.yaw = slot === 0 ? 0 : Math.PI;
    player.palm = 'chi';
    player.activePalm = 'chi';
    this.state.players.set(client.sessionId, player);
    this.runtime.set(client.sessionId, {
      fighter: createFighter(player.x, player.z, player.yaw),
      queue: [], queuedSeq: 0, lastSeq: 0, lastCmdAt: 0, budget: 0,
      burnUntil: 0, burnNextAt: 0, burnOwnerId: '', 
    });
    if (this.state.players.size === 2) {
      this.state.phase = 'select';
      this.state.prepLeft = PREP_SECONDS;
      this.state.roundNo += 1;
      this.ending = false;
      this.projectiles = [];
      for (const [id, p] of this.state.players) {
        p.ready = false;
        p.hp = MAX_HP;
        p.charge = 0;
        p.cooldown = 0;
        p.slowT = 0;
        p.burnT = 0;
        p.action = 'idle';
        p.actionT = 0;
        const rt = this.runtime.get(id);
        if (rt) {
          rt.fighter = createFighter(p.x, p.z, p.yaw);
          rt.queue.length = 0;
          rt.burnUntil = 0;
          rt.burnNextAt = 0;
          rt.burnOwnerId = '';
          this.syncPlayer(p, rt.fighter);
        }
      }
      this.broadcast('match-starting', { prepSeconds: PREP_SECONDS });
    }
  }

  onLeave(client) {
    if (this.spectators.delete(client.sessionId)) {
      this.state.viewerCount = this.spectators.size;
      if (this.ejectingSpectators && this.state.players.size === 0 && this.spectators.size === 0) {
        this.resetWaiting();
      }
      return;
    }

    const leaving = this.state.players.get(client.sessionId);
    const previousPhase = this.state.phase;
    this.state.players.delete(client.sessionId);
    this.runtime.delete(client.sessionId);
    this.projectiles = this.projectiles.filter((p) => p.ownerId !== client.sessionId);

    if (previousPhase === 'select' || previousPhase === 'fight') {
      const remaining = [...this.state.players.keys()][0];
      if (remaining) this.endMatch(remaining, 'forfeit');
      else this.ejectSpectators();
    } else if (previousPhase === 'waiting' && this.state.players.size === 0) {
      this.resetWaiting();
    } else if (previousPhase === 'end' && this.state.players.size === 0) {
      this.ejectSpectators();
    }
    if (leaving) this.broadcast('player-left', { name: leaving.name });
  }

  ejectSpectators() {
    if (this.ejectingSpectators) return;
    this.ejectingSpectators = true;
    for (const client of this.spectators.values()) {
      client.send('spectator-eject', { reason: 'match-finished' });
    }
    if (this.spectators.size === 0 && this.state.players.size === 0) this.resetWaiting();
  }

  onDispose() {
    FightRoom.registry.delete(this.roomKey);
    if (this._endTimer) this.clock.clearTimeout(this._endTimer);
  }

  static roomList() {
    return [...FightRoom.registry.entries()].map(([key, room]) => ({
      key,
      roomId: room.roomId,
      players: room.state.players.size,
      capacity: 2,
      phase: room.state.phase,
      names: [...room.state.players.values()].map((p) => p.name),
      viewerCount: room.spectators.size,
      viewerCapacity: SPECTATOR_LIMIT,
      canWatch: room.state.players.size === 2 && !room.ejectingSpectators
        && ['select', 'fight', 'end'].includes(room.state.phase)
        && room.spectators.size < SPECTATOR_LIMIT,
    }));
  }

  selectPalm(client, payload) {
    if (this.state.phase !== 'select') return;
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    const palm = String(payload?.palm ?? 'chi');
    if (!Object.hasOwn(PALMS, palm)) return;
    p.palm = palm;
    p.activePalm = palm;
    p.ready = true;
  }

  queueCmds(client, payload) {
    const rt = this.runtime.get(client.sessionId);
    if (!rt || this.state.phase !== 'fight' || !Array.isArray(payload)) return;
    const count = Math.min(payload.length, CMD_BATCH_MAX);
    for (let i = 0; i < count; i++) {
      const cmd = decodeCmd(payload[i]);
      if (!cmd || cmd.seq <= rt.queuedSeq) continue;
      rt.queuedSeq = cmd.seq;
      rt.queue.push(cmd);
    }
    rt.lastCmdAt = Date.now();
    // A backlog this deep is stale input; skip ahead to the newest commands.
    if (rt.queue.length > CMD_QUEUE_MAX) rt.queue.splice(0, rt.queue.length - CMD_BUFFER_TARGET);
  }

  update(deltaMs) {
    const phase = this.state.phase;
    if (phase === 'select') this.stepSelect(Math.min(0.06, deltaMs / 1000));
    if (phase !== 'fight') {
      this.tickDebt = 0;
      return;
    }
    // Combat advances in fixed 60 Hz ticks so every command a client predicted
    // with is replayed here with exactly the same timestep.
    this.tickDebt = Math.min(this.tickDebt + deltaMs / 1000, MAX_CATCH_UP_SECONDS);
    while (this.tickDebt >= TICK_DT && this.state.phase === 'fight') {
      this.tickDebt -= TICK_DT;
      this.fixedTick();
    }
  }

  stepSelect(dt) {
    this.state.prepLeft = Math.max(0, this.state.prepLeft - dt);
    const entries = [...this.state.players.entries()];
    const everyoneReady = entries.length === 2 && entries.every(([, player]) => player.ready);
    if (this.state.prepLeft > 0 && !everyoneReady) return;
    if (entries.length !== 2) return;
    for (const [id, player] of entries) {
      if (player.palm === 'xiao') {
        const other = entries.find(([otherId]) => otherId !== id)?.[1];
        player.activePalm = other?.palm && other.palm !== 'xiao' ? other.palm : 'chi';
      } else {
        player.activePalm = player.palm;
      }
    }
    for (const [id, player] of entries) {
      player.ready = true;
      const rt = this.runtime.get(id);
      if (!rt) continue;
      rt.fighter.palm = player.activePalm;
      rt.queue.length = 0;
      rt.budget = 0;
      rt.lastCmdAt = Date.now();
    }
    this.state.phase = 'fight';
    this.broadcast('fight-begins', { maxHp: MAX_HP });
  }

  fixedTick() {
    this.state.clock += TICK_DT;
    for (const id of [...this.state.players.keys()]) {
      if (this.state.phase !== 'fight') break;
      const p = this.state.players.get(id);
      const rt = this.runtime.get(id);
      if (p && rt) this.stepPlayer(id, p, rt);
    }
    if (this.state.phase === 'fight') this.stepProjectiles(TICK_DT);
    // Hits move fighters after their own step, so publish positions last.
    for (const [id, p] of this.state.players) {
      const rt = this.runtime.get(id);
      if (rt) this.syncPlayer(p, rt.fighter);
    }
    this.tickCount += 1;
    if (this.tickCount % ACK_EVERY_TICKS === 0) this.sendAcks();
  }

  stepPlayer(id, p, rt) {
    const now = Date.now();
    p.burnT = Math.max(0, (rt.burnUntil - now) / 1000);
    if (rt.burnUntil > now && now >= rt.burnNextAt && p.hp > 0) {
      this.applyBurnTick(id, p, rt);
      rt.burnNextAt = now + 1000;
    } else if (rt.burnUntil <= now && rt.burnOwnerId) {
      rt.burnOwnerId = '';
      rt.burnNextAt = 0;
    }
    if (this.state.phase !== 'fight') return;

    rt.budget = Math.min(CMD_BUDGET_MAX, rt.budget + CMD_BUDGET_PER_TICK);
    let ran = false;
    while (rt.queue.length && rt.budget >= 1 && (!ran || rt.queue.length > CMD_BUFFER_TARGET)) {
      const cmd = rt.queue.shift();
      rt.budget -= 1;
      rt.lastSeq = cmd.seq;
      this.runCmd(id, rt, cmd);
      ran = true;
    }
    if (!ran && !rt.queue.length && now - rt.lastCmdAt > CMD_SILENCE_MS) this.runCmd(id, rt, NEUTRAL_CMD);
  }

  runCmd(id, rt, cmd) {
    const fighter = rt.fighter;
    const events = this.events;
    events.length = 0;
    stepFighter(fighter, cmd, TICK_DT, events);
    for (const event of events) {
      if (event === 'strike') this.meleeStrike(id, fighter);
      else if (event === 'launch') this.launchPalm(id, fighter);
      else if (event === 'charge-begin') this.broadcast('charge-begin', { ownerId: id, palm: fighter.palm });
      else if (event === 'charge-cancel') this.broadcast('charge-cancel', { ownerId: id });
      else if (event === 'jump') this.broadcast('jump-effect', { ownerId: id, double: fighter.jumps === 2 });
    }
  }

  syncPlayer(p, fighter) {
    p.x = fighter.x; p.y = fighter.y; p.z = fighter.z;
    p.yaw = fighter.yaw;
    p.action = fighter.action;
    p.actionT = fighter.actionT;
    p.actionStep = fighter.actionStep;
    p.charge = chargeProgress(fighter);
    p.cooldown = fighter.cooldown;
    p.slowT = fighter.slowT;
    p.jumps = fighter.jumps;
  }

  sendAcks() {
    for (const client of this.clients) {
      const rt = this.runtime.get(client.sessionId);
      if (rt) client.send('ack', [rt.lastSeq, packFighter(rt.fighter)]);
    }
  }

  opponentOf(id) {
    for (const [otherId, player] of this.state.players) {
      const rt = otherId !== id && this.runtime.get(otherId);
      if (rt) return { id: otherId, player, rt, fighter: rt.fighter };
    }
    return null;
  }

  meleeStrike(id, fighter) {
    const target = this.opponentOf(id);
    if (!target) return;
    const tf = target.fighter;
    const fwd = forwardVector(fighter.yaw, 0);
    const dx = tf.x - fighter.x;
    const dy = tf.y - fighter.y;
    const dz = tf.z - fighter.z;
    const d = Math.hypot(dx, dy, dz) || 1;
    const dot = (dx * fwd.x + dz * fwd.z) / d;
    if (d > 2.25 || dot < 0.58 || Math.abs(dy) > 1.5) return;
    const damage = fighter.actionStep === 3 ? 11 : 8;
    const wasCharging = tf.action === 'charge';
    displaceFighter(tf, (dx / d) * 0.85, (dz / d) * 0.85);
    stunFighter(tf, wasCharging ? 0.26 : 0.19);
    this.broadcast('impact', { palm: 'fist', x: tf.x, y: tf.y + 1, z: tf.z, targetId: target.id, damage });
    this.applyDamage(target, damage, id, { palm: 'fist', effect: 'melee' });
  }

  launchPalm(id, fighter) {
    const palm = PALMS[fighter.palm];
    const target = this.opponentOf(id);
    // Target acquisition is computed on the authoritative server. Camera pitch
    // never steers attacks; targets outside +/-25 degrees receive a straight shot.
    let dir = target
      ? computeAimDirection(fighter, target.fighter, fighter.yaw, 25)
      : { ...forwardVector(fighter.yaw, 0), locked: false };
    // Hỏa Diệm Đao is deliberately a level horizontal blade: its height is
    // fixed so opponents can evade it by jumping or dropping, not strafing.
    if (palm.slash) {
      const horizontalLength = Math.hypot(dir.x, dir.z) || 1;
      dir = { x: dir.x / horizontalLength, y: 0, z: dir.z / horizontalLength, locked: Boolean(dir.locked) };
    }
    const projectile = {
      id: `${this.roomId}-${this.projectileSeq++}`,
      ownerId: id,
      palmId: palm.id,
      x: fighter.x + dir.x * 0.72, y: fighter.y + 1.25, z: fighter.z + dir.z * 0.72,
      vx: dir.x * palm.speed, vy: dir.y * palm.speed, vz: dir.z * palm.speed,
      traveled: 0,
      range: palm.range,
      radius: palm.radius,
      depth: palm.depth ?? 0,
      terrainRadius: palm.terrainRadius ?? palm.radius,
      damage: palm.damage,
      knockback: palm.knockback,
      effect: palm.effect,
      slowSeconds: palm.slowSeconds ?? 0,
      burnSeconds: palm.burnSeconds ?? 0,
      slash: Boolean(palm.slash),
      color: palm.color,
      aimLocked: Boolean(dir.locked),
      life: palm.range / palm.speed + 0.5,
    };
    this.projectiles.push(projectile);
    this.broadcast('projectile', { ...projectile });
  }

  stepProjectiles(dt) {
    if (!this.projectiles.length || this.state.phase !== 'fight') return;
    const survivors = [];
    for (const projectile of this.projectiles) {
      const sx = projectile.vx * dt;
      const sy = projectile.vy * dt;
      const sz = projectile.vz * dt;
      projectile.x += sx; projectile.y += sy; projectile.z += sz;
      projectile.traveled += Math.hypot(sx, sy, sz);
      projectile.life -= dt;
      const solid = projectile.terrainRadius;
      const blocked = projectile.y <= solid || ARENA_PROPS.some((prop) =>
        projectileIntersectsProp(projectile.x, projectile.y, projectile.z, solid, prop),
      );
      const target = this.opponentOf(projectile.ownerId);
      let hit = false;

      if (blocked) {
        hit = this.explodeProjectile(projectile, target);
        if (this.state.phase !== 'fight') {
          // endMatch already notified clients about every active projectile.
          this.projectiles = [];
          return;
        }
        this.broadcast('projectile-end', { id: projectile.id, x: projectile.x, y: projectile.y, z: projectile.z, hit: false });
      } else if (target) {
        const dx = target.fighter.x - projectile.x;
        const dz = target.fighter.z - projectile.z;
        const dy = target.fighter.y + 1.0 - projectile.y;
        if (projectile.depth > 0) {
          // A flat front: wide and tall across the flight path, shallow along
          // it, so it cannot be sidestepped or jumped but never reaches behind.
          const speed = Math.hypot(projectile.vx, projectile.vy, projectile.vz) || 1;
          const along = (dx * projectile.vx + dy * projectile.vy + dz * projectile.vz) / speed;
          const acrossSq = dx * dx + dy * dy + dz * dz - along * along;
          hit = Math.abs(along) < projectile.depth + 0.48 && acrossSq < (projectile.radius + 0.48) ** 2;
        } else {
          const verticalReach = projectile.slash ? 0.38 : projectile.radius + 0.72;
          hit = Math.hypot(dx, dz) < projectile.radius + 0.48 && Math.abs(dy) < verticalReach;
        }
        if (hit) this.applyProjectileHit(projectile, target);
        if (this.state.phase !== 'fight') {
          this.projectiles = [];
          return;
        }
      }

      if (blocked || hit || projectile.life <= 0 || projectile.traveled >= projectile.range || Math.abs(projectile.x) > ARENA_LIMIT + 2 || Math.abs(projectile.z) > ARENA_LIMIT + 2) {
        if (!blocked) this.broadcast('projectile-end', { id: projectile.id, x: projectile.x, y: projectile.y, z: projectile.z, hit });
      } else {
        survivors.push(projectile);
      }
    }
    this.projectiles = survivors;
  }

  explodeProjectile(projectile, target = this.opponentOf(projectile.ownerId)) {
    const radius = blastRadiusForDamage(projectile.damage);
    const center = { x: projectile.x, y: Math.max(0, projectile.y), z: projectile.z };
    this.broadcast('projectile-explosion', {
      id: projectile.id,
      x: center.x, y: center.y, z: center.z,
      radius,
      damage: projectile.damage,
      palmId: projectile.palmId,
      color: projectile.color,
    });

    if (!target || radius <= 0) return false;
    const dx = target.fighter.x - center.x;
    const dy = target.fighter.y + 1.0 - center.y;
    const dz = target.fighter.z - center.z;
    if (Math.hypot(dx, dy, dz) > radius + 0.48) return false;

    // The blast carries the technique's full base damage and status effect,
    // but deliberately does not displace the victim.
    this.applyProjectileHit(projectile, target, { knockback: false });
    return true;
  }

  applyBurnTick(id, player, rt) {
    const target = { id, player, rt, fighter: rt.fighter };
    const attackerId = rt.burnOwnerId;
    this.applyDamage(target, 1, attackerId, { palm: 'hoa', effect: 'burn-over-time' });
  }

  applyDamage(target, amount, attackerId, metadata = {}) {
    if (this.state.phase !== 'fight' || !target?.player || target.player.hp <= 0) return 0;
    const damage = Math.max(0, Number(amount) || 0);
    if (damage <= 0) return 0;
    target.player.hp = applyHealthDamage(target.player.hp, damage);
    this.broadcast('damage', {
      attackerId: attackerId || '',
      targetId: target.id,
      damage,
      remainingHp: target.player.hp,
      ...metadata,
    });
    if (target.player.hp <= 0) {
      const winnerId = attackerId && this.state.players.has(attackerId)
        ? attackerId
        : [...this.state.players.keys()].find((id) => id !== target.id) ?? '';
      this.endMatch(winnerId, 'knockout');
    }
    return damage;
  }

  applyProjectileHit(projectile, target, options = {}) {
    const tf = target.fighter;
    const wasCharging = tf.action === 'charge';
    if (options.knockback !== false) {
      // A flat front shoves along its flight path; other palms push away from their core.
      let dx = projectile.depth > 0 ? projectile.vx : tf.x - projectile.x;
      let dz = projectile.depth > 0 ? projectile.vz : tf.z - projectile.z;
      const d = Math.hypot(dx, dz) || 1;
      dx /= d; dz /= d;
      displaceFighter(tf, dx * projectile.knockback, dz * projectile.knockback);
    }
    if (projectile.effect === 'slow') tf.slowT = projectile.slowSeconds;
    if (projectile.effect === 'burn') {
      target.rt.burnUntil = Date.now() + projectile.burnSeconds * 1000;
      target.rt.burnNextAt = Date.now() + 1000;
      target.rt.burnOwnerId = projectile.ownerId;
    }
    // Every successful hit interrupts charge and briefly prevents an immediate counter.
    if (wasCharging || projectile.effect === 'interrupt') stunFighter(tf, 0.26);
    else tf.comboHeld = false;
    this.broadcast('impact', {
      palm: projectile.palmId,
      x: tf.x, y: tf.y + 1, z: tf.z,
      targetId: target.id,
      damage: projectile.damage,
      effect: projectile.effect,
      explosion: options.knockback === false,
    });
    this.applyDamage(target, projectile.damage, projectile.ownerId, { palm: projectile.palmId, effect: projectile.effect });
  }

  endMatch(winnerSessionId, reason) {
    if (this.ending || this.state.phase === 'end') return;
    this.ending = true;
    this.state.phase = 'end';
    this.state.winnerSessionId = winnerSessionId || '';
    this.state.resultReason = reason;
    for (const p of this.state.players.values()) {
      p.action = 'idle'; p.charge = 0; p.ready = true;
    }
    for (const projectile of this.projectiles) {
      this.broadcast('projectile-end', {
        id: projectile.id,
        x: projectile.x, y: projectile.y, z: projectile.z,
        hit: false,
      });
    }
    this.projectiles = [];
    const winner = this.state.players.get(winnerSessionId);
    this.broadcast('match-end', {
      winnerSessionId: winnerSessionId || '',
      winnerName: winner?.name ?? '',
      reason,
      players: [...this.state.players.entries()].map(([id, p]) => ({ id, name: p.name, hp: p.hp })),
    });
    this.scheduleReset();
  }

  scheduleReset() {
    if (this._endTimer) this.clock.clearTimeout(this._endTimer);
    this._endTimer = this.clock.setTimeout(() => {
      if (this.state.players.size === 0 && this.spectators.size === 0) this.resetWaiting();
      else if (this.state.players.size === 0) this.ejectSpectators();
    }, 9000);
  }

  resetWaiting() {
    if (this.state.players.size > 0 || this.spectators.size > 0) return;
    this.ending = false;
    this.ejectingSpectators = false;
    this.projectiles = [];
    this.state.viewerCount = 0;
    this.state.players.clear();
    this.runtime.clear();
    this.state.phase = 'waiting';
    this.state.prepLeft = PREP_SECONDS;
    this.state.winnerSessionId = '';
    this.state.resultReason = '';
    if (this._endTimer) this.clock.clearTimeout(this._endTimer);
    this._endTimer = null;
  }
}
