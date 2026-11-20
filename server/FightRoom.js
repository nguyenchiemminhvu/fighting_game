import { Room } from '@colyseus/core';
import { Schema, MapSchema, defineTypes } from '@colyseus/schema';
import {
  ARENA_LIMIT,
  ARENA_PROPS,
  MATCH_SECONDS,
  PALMS,
  PREP_SECONDS,
  clamp,
} from '../src/game/rules.js';

class PlayerState extends Schema {
  constructor() {
    super();
    this.name = 'Võ sinh';
    this.x = 0; this.y = 0; this.z = 0;
    this.yaw = 0; this.pitch = 0;
    this.score = 0;
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
  score: 'number', action: 'string', actionT: 'number', actionStep: 'number',
  palm: 'string', activePalm: 'string', charge: 'number', cooldown: 'number',
  slowT: 'number', burnT: 'number', ready: 'boolean', jumps: 'number',
});

class FightState extends Schema {
  constructor(roomKey = '') {
    super();
    this.roomKey = roomKey;
    this.phase = 'waiting';
    this.prepLeft = PREP_SECONDS;
    this.timeLeft = MATCH_SECONDS;
    this.players = new MapSchema();
    this.winnerSessionId = '';
    this.resultReason = '';
    this.roundNo = 0;
  }
}
defineTypes(FightState, {
  roomKey: 'string', phase: 'string', prepLeft: 'number', timeLeft: 'number',
  players: { map: PlayerState }, winnerSessionId: 'string', resultReason: 'string', roundNo: 'number',
});

function safeName(value) {
  const name = String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 20);
  return name || `Võ sinh ${Math.floor(10 + Math.random() * 90)}`;
}

function forwardVector(yaw, pitch = 0) {
  const cp = Math.cos(pitch);
  return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
}

function distance3(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function overlapsProp(x, z, radius, prop) {
  const cx = clamp(x, prop.x - prop.w / 2, prop.x + prop.w / 2);
  const cz = clamp(z, prop.z - prop.d / 2, prop.z + prop.d / 2);
  return (x - cx) ** 2 + (z - cz) ** 2 < radius ** 2;
}

export class FightRoom extends Room {
  static registry = new Map();

  onCreate(options) {
    this.roomKey = options.roomKey;
    this.roomLabel = options.label;
    this.maxClients = 2;
    this.autoDispose = false;
    this.setState(new FightState(this.roomKey));
    this.runtime = new Map();
    this.projectiles = [];
    this.projectileSeq = 1;
    this.ending = false;
    this._endTimer = null;
    this._burnPulse = 0;
    FightRoom.registry.set(this.roomKey, this);

    this.onMessage('select-palm', (client, payload) => this.selectPalm(client, payload));
    this.onMessage('input', (client, payload) => this.setInput(client, payload));
    this.onMessage('q-held', (client, payload) => this.setQHeld(client, payload));
    this.onMessage('charge-start', (client) => this.startCharge(client));
    this.onMessage('charge-cancel', (client) => this.cancelCharge(client));
    this.onMessage('jump', (client) => this.jump(client));
    this.onMessage('dash', (client, payload) => this.dash(client, payload));
    this.setSimulationInterval((deltaMs) => this.tick(Math.min(0.06, deltaMs / 1000)));
  }

  onJoin(client, options) {
    if (this.state.players.size >= 2 || this.state.phase === 'end') {
      throw new Error('Sàn đã đủ hai người.');
    }
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
      forward: 0, right: 0,
      vy: 0, jumps: 0, grounded: true,
      qHeld: false, comboElapsed: 0, comboHits: 1, comboIndex: 0,
      chargeElapsed: 0, chargeLockedY: 0,
      actionElapsed: 0, actionLock: 0,
      dashElapsed: 0, dashX: 0, dashZ: 0,
      slowUntil: 0, burnUntil: 0, burnNextAt: 0,
      stunUntil: 0,
      cooldownUntil: 0,
    });
    if (this.state.players.size === 2) {
      this.state.phase = 'select';
      this.state.prepLeft = PREP_SECONDS;
      this.state.timeLeft = MATCH_SECONDS;
      this.state.roundNo += 1;
      this.ending = false;
      this.projectiles = [];
      for (const [id, p] of this.state.players) {
        p.ready = false;
        p.score = 0;
        p.charge = 0;
        p.cooldown = 0;
        p.slowT = 0;
        p.burnT = 0;
        p.action = 'idle';
        p.actionT = 0;
        const rt = this.runtime.get(id);
        if (rt) Object.assign(rt, { vy: 0, jumps: 0, grounded: true, forward: 0, right: 0 });
      }
      this.broadcast('match-starting', { prepSeconds: PREP_SECONDS });
    }
  }

  onLeave(client) {
    const leaving = this.state.players.get(client.sessionId);
    const previousPhase = this.state.phase;
    this.state.players.delete(client.sessionId);
    this.runtime.delete(client.sessionId);
    this.projectiles = this.projectiles.filter((p) => p.ownerId !== client.sessionId);

    if (previousPhase === 'select' || previousPhase === 'fight') {
      const remaining = [...this.state.players.keys()][0];
      if (remaining) this.endMatch(remaining, 'forfeit');
      else this.resetWaiting();
    } else if (previousPhase === 'waiting' && this.state.players.size === 0) {
      this.resetWaiting();
    } else if (previousPhase === 'end' && this.state.players.size === 0) {
      this.scheduleReset();
    }
    if (leaving) this.broadcast('player-left', { name: leaving.name });
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

  setInput(client, payload) {
    const p = this.state.players.get(client.sessionId);
    const rt = this.runtime.get(client.sessionId);
    if (!p || !rt || this.state.phase !== 'fight') return;
    p.yaw = Number.isFinite(payload?.yaw) ? payload.yaw : p.yaw;
    p.pitch = clamp(Number.isFinite(payload?.pitch) ? payload.pitch : p.pitch, -0.42, 0.82);
    rt.forward = clamp(Number(payload?.forward) || 0, -1, 1);
    rt.right = clamp(Number(payload?.right) || 0, -1, 1);
  }

  setQHeld(client, payload) {
    const p = this.state.players.get(client.sessionId);
    const rt = this.runtime.get(client.sessionId);
    if (!p || !rt || this.state.phase !== 'fight' || p.y > 0.08) return;
    const held = Boolean(payload?.held);
    if (held && !rt.qHeld && p.action === 'idle' && rt.stunUntil <= Date.now()) {
      rt.qHeld = true;
      rt.comboElapsed = 0;
      rt.comboHits = 1;
      rt.comboIndex = 0;
      p.action = 'combo';
      p.actionT = 0;
      p.actionStep = 0;
      rt.forward = 0; rt.right = 0;
    } else if (!held) {
      rt.qHeld = false;
    }
  }

  startCharge(client) {
    const p = this.state.players.get(client.sessionId);
    const rt = this.runtime.get(client.sessionId);
    const canCastFrom = p && (p.action === 'idle' || p.action === 'run' || (p.action === 'jump' && p.y > 0.08));
    if (!p || !rt || this.state.phase !== 'fight' || !canCastFrom || this.nowCooldown(rt) > 0 || rt.stunUntil > Date.now()) return;
    const palm = PALMS[p.activePalm];
    if (!palm || palm.effect === 'copy' || palm.charge <= 0) return;
    p.action = 'charge';
    p.actionT = 0;
    p.charge = 0;
    rt.chargeElapsed = 0;
    rt.chargeLockedY = p.y;
    rt.forward = 0; rt.right = 0;
    this.broadcast('charge-begin', { ownerId: client.sessionId, palm: p.activePalm });
  }

  cancelCharge(client) {
    const p = this.state.players.get(client.sessionId);
    const rt = this.runtime.get(client.sessionId);
    if (!p || !rt || p.action !== 'charge') return;
    p.action = 'idle';
    p.charge = 0;
    p.actionT = 0;
    rt.chargeElapsed = 0;
    this.broadcast('charge-cancel', { ownerId: client.sessionId });
  }

  jump(client) {
    const p = this.state.players.get(client.sessionId);
    const rt = this.runtime.get(client.sessionId);
    if (!p || !rt || this.state.phase !== 'fight' || p.action !== 'idle' && p.action !== 'run' && p.action !== 'jump') return;
    if (rt.jumps >= 2 || (p.y < 0.01 && rt.jumps >= 1)) return;
    rt.jumps += 1;
    rt.grounded = false;
    rt.vy = rt.jumps === 1 ? 8.0 : 7.0;
    p.jumps = rt.jumps;
    p.action = 'jump';
    p.actionT = 0;
    this.broadcast('jump-effect', { ownerId: client.sessionId, double: rt.jumps === 2 });
  }

  dash(client, payload) {
    const p = this.state.players.get(client.sessionId);
    const rt = this.runtime.get(client.sessionId);
    if (!p || !rt || this.state.phase !== 'fight' || p.y > 0.08 || p.action !== 'idle' && p.action !== 'run') return;
    if (rt.slowUntil > Date.now() || rt.dashElapsed > 0) return;
    const x = clamp(Number(payload?.x) || 0, -1, 1);
    const z = clamp(Number(payload?.z) || 0, -1, 1);
    const length = Math.hypot(x, z);
    if (length < 0.2) return;
    rt.dashX = x / length;
    rt.dashZ = z / length;
    rt.dashElapsed = 0.17;
    p.action = 'dash';
    p.actionT = 0;
    rt.forward = 0; rt.right = 0;
  }

  nowCooldown(rt) {
    return Math.max(0, (rt.cooldownUntil - Date.now()) / 1000);
  }

  tick(dt) {
    const phase = this.state.phase;
    if (phase === 'waiting' || phase === 'end') return;
    if (phase === 'select') {
      this.state.prepLeft = Math.max(0, this.state.prepLeft - dt);
      const entries = [...this.state.players.entries()];
      const everyoneReady = entries.length === 2 && entries.every(([, player]) => player.ready);
      if (this.state.prepLeft <= 0 || everyoneReady) {
        if (entries.length !== 2) return;
        for (const [id, player] of entries) {
          if (player.palm === 'xiao') {
            const other = entries.find(([otherId]) => otherId !== id)?.[1];
            player.activePalm = other?.palm && other.palm !== 'xiao' ? other.palm : 'chi';
          } else {
            player.activePalm = player.palm;
          }
        }
        for (const player of this.state.players.values()) player.ready = true;
        this.state.phase = 'fight';
        this.state.timeLeft = MATCH_SECONDS;
        this.broadcast('fight-begins', { duration: MATCH_SECONDS });
      }
      return;
    }

    this.state.timeLeft = Math.max(0, this.state.timeLeft - dt);
    const ids = [...this.state.players.keys()];
    for (const id of ids) {
      const p = this.state.players.get(id);
      const rt = this.runtime.get(id);
      if (!p || !rt) continue;
      this.stepPlayer(id, p, rt, dt);
    }
    this.stepProjectiles(dt);
    if (this.state.timeLeft <= 0 && this.state.phase === 'fight') {
      const [a, b] = [...this.state.players.entries()];
      const winner = !a || !b ? a?.[0] ?? '' : a[1].score === b[1].score ? '' : a[1].score > b[1].score ? a[0] : b[0];
      this.endMatch(winner, 'time');
    }
  }

  stepPlayer(id, p, rt, dt) {
    const now = Date.now();
    p.actionT += dt;
    p.cooldown = this.nowCooldown(rt);
    p.slowT = Math.max(0, (rt.slowUntil - now) / 1000);
    p.burnT = Math.max(0, (rt.burnUntil - now) / 1000);

    if (rt.burnUntil > now && now >= rt.burnNextAt) {
      p.score += 1;
      rt.burnNextAt = now + 1000;
    }

    if (p.action === 'charge') {
      const palm = PALMS[p.activePalm];
      rt.chargeElapsed += dt;
      p.charge = clamp(rt.chargeElapsed / palm.charge, 0, 1);
      p.y = rt.chargeLockedY;
      if (rt.chargeElapsed >= palm.charge) {
        this.launchPalm(id, p, rt, palm);
      }
      return;
    }

    if (p.action === 'combo') {
      rt.comboElapsed += dt;
      if (rt.qHeld && rt.comboElapsed >= 0.28) rt.comboHits = 3;
      const marks = [0.18, 0.69, 1.20];
      if (rt.comboIndex < rt.comboHits && rt.comboElapsed >= marks[rt.comboIndex]) {
        rt.comboIndex += 1;
        p.actionStep = rt.comboIndex;
        this.meleeStrike(id, p, rt, rt.comboIndex);
      }
      const endAt = rt.comboHits === 1 ? 0.66 : 1.58;
      if (rt.comboElapsed >= endAt) {
        p.action = 'idle'; p.actionT = 0;
        rt.comboElapsed = 0; rt.comboIndex = 0; rt.qHeld = false;
      }
      return;
    }

    if (rt.stunUntil > now) {
      p.action = 'stun';
      p.actionT += dt;
      rt.forward = 0; rt.right = 0;
    } else if (p.action === 'stun') {
      p.action = 'idle'; p.actionT = 0;
    }

    if (rt.dashElapsed > 0) {
      const dashStep = Math.min(dt, rt.dashElapsed);
      this.moveWithCollisions(p, rt.dashX * 16.5 * dashStep, rt.dashZ * 16.5 * dashStep);
      rt.dashElapsed -= dashStep;
      p.action = rt.dashElapsed > 0 ? 'dash' : 'idle';
      if (rt.dashElapsed <= 0) p.actionT = 0;
    } else if (p.action !== 'stun' && p.action !== 'cast' && p.action !== 'hit') {
      const speed = rt.slowUntil > now ? 2.9 : 5.6;
      const f = rt.forward;
      const r = rt.right;
      const mag = Math.hypot(f, r);
      if (mag > 0.08 && p.y < 0.08) {
        const nf = f / Math.max(1, mag);
        const nr = r / Math.max(1, mag);
        const forward = forwardVector(p.yaw, 0);
        const right = { x: Math.cos(p.yaw), z: -Math.sin(p.yaw) };
        const dx = (forward.x * nf + right.x * nr) * speed * dt;
        const dz = (forward.z * nf + right.z * nr) * speed * dt;
        this.moveWithCollisions(p, dx, dz);
        if (p.action !== 'jump') p.action = 'run';
      } else if (p.action !== 'jump') {
        p.action = 'idle';
      }
    }

    if (p.action === 'cast' && p.actionT >= 0.38) {
      p.action = 'idle';
      p.actionT = 0;
    }

    // Server-authoritative gravity, double jump and simple platform landing.
    if (p.action !== 'charge') {
      const oldY = p.y;
      rt.vy -= 20 * dt;
      let nextY = p.y + rt.vy * dt;
      let support = 0;
      for (const prop of ARENA_PROPS) {
        const inFootprint = Math.abs(p.x - prop.x) < prop.w / 2 - 0.18 && Math.abs(p.z - prop.z) < prop.d / 2 - 0.18;
        if (inFootprint && rt.vy <= 0 && oldY >= prop.h - 0.08 && nextY <= prop.h) support = Math.max(support, prop.h);
      }
      if (nextY <= support) {
        nextY = support; rt.vy = 0; rt.jumps = 0; rt.grounded = true;
        p.jumps = 0;
        if (p.action === 'jump') p.action = 'idle';
      } else {
        rt.grounded = false;
      }
      p.y = Math.max(0, nextY);
      if (p.y <= 0) {
        p.y = 0; rt.vy = 0; rt.jumps = 0; rt.grounded = true; p.jumps = 0;
        if (p.action === 'jump') p.action = 'idle';
      }
    }
  }

  moveWithCollisions(p, dx, dz) {
    const nextX = clamp(p.x + dx, -ARENA_LIMIT, ARENA_LIMIT);
    const nextZ = clamp(p.z + dz, -ARENA_LIMIT, ARENA_LIMIT);
    // The player's feet must be above a prop before horizontal movement can pass over it.
    const blockedX = ARENA_PROPS.some((prop) => p.y < prop.h - 0.06 && overlapsProp(nextX, p.z, 0.48, prop));
    if (!blockedX) p.x = nextX;
    const blockedZ = ARENA_PROPS.some((prop) => p.y < prop.h - 0.06 && overlapsProp(p.x, nextZ, 0.48, prop));
    if (!blockedZ) p.z = nextZ;
  }

  meleeStrike(id, p, rt, strikeNo) {
    const targetEntry = [...this.state.players.entries()].find(([otherId]) => otherId !== id);
    if (!targetEntry) return;
    const [targetId, target] = targetEntry;
    const fwd = forwardVector(p.yaw, p.pitch * 0.35);
    const dx = target.x - p.x;
    const dy = (target.y + 1.0) - (p.y + 1.0);
    const dz = target.z - p.z;
    const d = Math.hypot(dx, dy, dz) || 1;
    const dot = (dx * fwd.x + dy * fwd.y + dz * fwd.z) / d;
    if (d > 2.25 || dot < 0.58 || Math.abs(dy) > 1.5) return;
    target.score += strikeNo === 3 ? 11 : 8;
    const tr = this.runtime.get(targetId);
    if (tr) {
      this.moveWithCollisions(target, (dx / d) * 0.85, (dz / d) * 0.85);
      if (target.action === 'charge') {
        target.charge = 0;
        tr.chargeElapsed = 0;
        target.action = 'stun';
        tr.stunUntil = Date.now() + 260;
      } else {
        target.action = 'stun';
        tr.stunUntil = Date.now() + 190;
      }
      tr.forward = 0; tr.right = 0; tr.qHeld = false;
    }
    this.broadcast('impact', { palm: 'fist', x: target.x, y: target.y + 1, z: target.z, targetId, score: strikeNo === 3 ? 11 : 8 });
  }

  launchPalm(id, p, rt, palm) {
    const dir = forwardVector(p.yaw, p.pitch);
    const origin = { x: p.x + dir.x * 0.72, y: p.y + 1.25 + dir.y * 0.4, z: p.z + dir.z * 0.72 };
    const projectile = {
      id: `${this.roomId}-${this.projectileSeq++}`,
      ownerId: id,
      palmId: palm.id,
      x: origin.x, y: origin.y, z: origin.z,
      vx: dir.x * palm.speed, vy: dir.y * palm.speed, vz: dir.z * palm.speed,
      traveled: 0,
      range: palm.range,
      radius: palm.radius,
      score: palm.score,
      knockback: palm.knockback,
      effect: palm.effect,
      slowSeconds: palm.slowSeconds ?? 0,
      burnSeconds: palm.burnSeconds ?? 0,
      slash: Boolean(palm.slash),
      color: palm.color,
      life: palm.range / palm.speed + 0.5,
    };
    this.projectiles.push(projectile);
    rt.cooldownUntil = Date.now() + palm.cooldown * 1000;
    p.cooldown = palm.cooldown;
    p.charge = 0;
    p.action = 'cast'; p.actionT = 0;
    rt.chargeElapsed = 0;
    if (p.y > 0.08) rt.vy = Math.min(rt.vy, -1.2);
    this.broadcast('projectile', { ...projectile });
  }

  stepProjectiles(dt) {
    if (!this.projectiles.length) return;
    const survivors = [];
    for (const projectile of this.projectiles) {
      const sx = projectile.vx * dt;
      const sy = projectile.vy * dt;
      const sz = projectile.vz * dt;
      projectile.x += sx; projectile.y += sy; projectile.z += sz;
      projectile.traveled += Math.hypot(sx, sy, sz);
      projectile.life -= dt;
      const blocked = projectile.y <= projectile.radius || ARENA_PROPS.some((prop) =>
        Math.abs(projectile.x - prop.x) < prop.w / 2 + projectile.radius &&
        Math.abs(projectile.z - prop.z) < prop.d / 2 + projectile.radius &&
        projectile.y < prop.h + projectile.radius,
      );
      const targetEntry = [...this.state.players.entries()].find(([id]) => id !== projectile.ownerId);
      let hit = false;
      if (!blocked && targetEntry) {
        const [targetId, target] = targetEntry;
        const verticalReach = projectile.slash ? 0.38 : projectile.radius + 0.72;
        const dx = target.x - projectile.x;
        const dz = target.z - projectile.z;
        const dy = target.y + 1.0 - projectile.y;
        const horizontal = Math.hypot(dx, dz);
        if (horizontal < projectile.radius + 0.48 && Math.abs(dy) < verticalReach) {
          this.applyProjectileHit(projectile, targetId, target);
          hit = true;
        }
      }
      if (blocked || hit || projectile.life <= 0 || projectile.traveled >= projectile.range || Math.abs(projectile.x) > ARENA_LIMIT + 2 || Math.abs(projectile.z) > ARENA_LIMIT + 2) {
        this.broadcast('projectile-end', { id: projectile.id, x: projectile.x, y: projectile.y, z: projectile.z, hit });
      } else {
        survivors.push(projectile);
      }
    }
    this.projectiles = survivors;
  }

  applyProjectileHit(projectile, targetId, target) {
    target.score += projectile.score;
    const rt = this.runtime.get(targetId);
    if (rt) {
      const dx = target.x - projectile.x;
      const dz = target.z - projectile.z;
      const d = Math.hypot(dx, dz) || 1;
      this.moveWithCollisions(target, (dx / d) * projectile.knockback, (dz / d) * projectile.knockback);
      if (projectile.effect === 'slow') rt.slowUntil = Date.now() + projectile.slowSeconds * 1000;
      if (projectile.effect === 'burn') {
        rt.burnUntil = Date.now() + projectile.burnSeconds * 1000;
        rt.burnNextAt = Date.now() + 1000;
      }
      // Every successful hit interrupts charge and briefly prevents an immediate counter.
      if (target.action === 'charge' || projectile.effect === 'interrupt') {
        target.action = 'stun'; target.charge = 0;
        rt.chargeElapsed = 0;
        rt.stunUntil = Date.now() + 260;
      }
      rt.forward = 0; rt.right = 0; rt.qHeld = false;
    }
    this.broadcast('impact', { palm: projectile.palmId, x: target.x, y: target.y + 1, z: target.z, targetId, score: projectile.score, effect: projectile.effect });
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
    const winner = this.state.players.get(winnerSessionId);
    this.broadcast('match-end', {
      winnerSessionId: winnerSessionId || '',
      winnerName: winner?.name ?? '',
      reason,
      scores: [...this.state.players.entries()].map(([id, p]) => ({ id, name: p.name, score: p.score })),
    });
    this.scheduleReset();
  }

  scheduleReset() {
    if (this._endTimer) this.clock.clearTimeout(this._endTimer);
    this._endTimer = this.clock.setTimeout(() => {
      if (this.state.players.size === 0) this.resetWaiting();
    }, 9000);
  }

  resetWaiting() {
    this.ending = false;
    this.projectiles = [];
    this.state.players.clear();
    this.runtime.clear();
    this.state.phase = 'waiting';
    this.state.prepLeft = PREP_SECONDS;
    this.state.timeLeft = MATCH_SECONDS;
    this.state.winnerSessionId = '';
    this.state.resultReason = '';
    if (this._endTimer) this.clock.clearTimeout(this._endTimer);
    this._endTimer = null;
  }
}
