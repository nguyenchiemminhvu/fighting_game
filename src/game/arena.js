import HavokPhysics from '@babylonjs/havok';
import {
  Engine, Scene, Vector3, Color3,
  FreeCamera, HemisphericLight, DirectionalLight, PointLight,
  StandardMaterial, DynamicTexture, MeshBuilder, TransformNode,
  ShadowGenerator, GlowLayer,
} from '@babylonjs/core';
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import { ARENA_PROPS, PALMS } from './rules.js';

const FORWARD = (yaw) => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });
const RIGHT = (yaw) => ({ x: Math.cos(yaw), z: -Math.sin(yaw) });

function makeMat(scene, name, diffuse, options = {}) {
  const mat = new StandardMaterial(name, scene);
  mat.diffuseColor = Color3.FromHexString(diffuse);
  mat.specularColor = new Color3(0.22, 0.19, 0.15);
  if (options.emissive) mat.emissiveColor = Color3.FromHexString(options.emissive);
  if (options.alpha != null) mat.alpha = options.alpha;
  if (options.metallic) mat.specularPower = 72;
  return mat;
}

function addBox(scene, name, position, scaling, material, shadow = true) {
  const mesh = MeshBuilder.CreateBox(name, { width: scaling.x, height: scaling.y, depth: scaling.z }, scene);
  mesh.position.copyFrom(position);
  mesh.material = material;
  mesh.receiveShadows = true;
  if (shadow) mesh.receiveShadows = true;
  return mesh;
}

function makeLimb(scene, root, name, length, diameter, material, x, y, z) {
  const pivot = new TransformNode(`${name}-pivot`, scene);
  pivot.parent = root;
  pivot.position.set(x, y, z);
  const bone = MeshBuilder.CreateCylinder(name, { height: length, diameterTop: diameter * 0.88, diameterBottom: diameter, tessellation: 10 }, scene);
  bone.parent = pivot;
  bone.position.y = -length / 2;
  bone.material = material;
  bone.receiveShadows = true;
  const joint = MeshBuilder.CreateSphere(`${name}-joint`, { diameter: diameter * 1.24, segments: 10 }, scene);
  joint.parent = pivot;
  joint.position.y = -length;
  joint.material = material;
  return { pivot, bone, joint };
}

function buildFighter(scene, shadowGenerator, id, name, palette) {
  const root = new TransformNode(`fighter-${id}`, scene);
  const robeMat = makeMat(scene, `robe-${id}`, palette.robe);
  const trimMat = makeMat(scene, `trim-${id}`, palette.trim, { metallic: true });
  const skinMat = makeMat(scene, `skin-${id}`, '#d6a77e');
  const darkMat = makeMat(scene, `dark-${id}`, '#27221f');
  const sashMat = makeMat(scene, `sash-${id}`, palette.sash);
  const torso = MeshBuilder.CreateCylinder(`torso-${id}`, { height: 0.92, diameterTop: 0.58, diameterBottom: 0.76, tessellation: 12 }, scene);
  torso.parent = root; torso.position.y = 1.18; torso.material = robeMat; torso.receiveShadows = true;
  const robe = MeshBuilder.CreateCylinder(`robe-skirt-${id}`, { height: 0.72, diameterTop: 0.62, diameterBottom: 0.94, tessellation: 12 }, scene);
  robe.parent = root; robe.position.y = 0.68; robe.material = robeMat; robe.receiveShadows = true;
  const belt = MeshBuilder.CreateTorus(`belt-${id}`, { diameter: 0.72, thickness: 0.095, tessellation: 14 }, scene);
  belt.parent = root; belt.position.y = 0.98; belt.material = sashMat;
  const collar = MeshBuilder.CreateTorus(`collar-${id}`, { diameter: 0.39, thickness: 0.055, tessellation: 12 }, scene);
  collar.parent = root; collar.position.y = 1.62; collar.rotation.x = Math.PI / 2; collar.material = trimMat;
  const head = MeshBuilder.CreateSphere(`head-${id}`, { diameter: 0.43, segments: 14 }, scene);
  head.parent = root; head.position.y = 1.83; head.material = skinMat;
  const hair = MeshBuilder.CreateSphere(`hair-${id}`, { diameter: 0.46, segments: 12, slice: 0.52 }, scene);
  hair.parent = root; hair.position.y = 1.94; hair.material = darkMat;
  const topknot = MeshBuilder.CreateSphere(`topknot-${id}`, { diameter: 0.14, segments: 8 }, scene);
  topknot.parent = root; topknot.position.set(0, 2.17, -0.015); topknot.material = darkMat;
  const shoulderL = MeshBuilder.CreateSphere(`shoulderL-${id}`, { diameter: 0.3, segments: 10 }, scene);
  shoulderL.parent = root; shoulderL.position.set(-0.38, 1.48, 0); shoulderL.material = trimMat;
  const shoulderR = shoulderL.clone(`shoulderR-${id}`); shoulderR.parent = root; shoulderR.position.x = 0.38;
  const armL = makeLimb(scene, root, `armL-${id}`, 0.64, 0.19, skinMat, -0.38, 1.42, 0);
  const armR = makeLimb(scene, root, `armR-${id}`, 0.64, 0.19, skinMat, 0.38, 1.42, 0);
  const sleeveL = makeLimb(scene, armL.pivot, `sleeveL-${id}`, 0.39, 0.24, robeMat, 0, 0.02, 0);
  const sleeveR = makeLimb(scene, armR.pivot, `sleeveR-${id}`, 0.39, 0.24, robeMat, 0, 0.02, 0);
  const legL = makeLimb(scene, root, `legL-${id}`, 0.7, 0.22, darkMat, -0.2, 0.56, 0);
  const legR = makeLimb(scene, root, `legR-${id}`, 0.7, 0.22, darkMat, 0.2, 0.56, 0);
  const footL = MeshBuilder.CreateBox(`footL-${id}`, { width: 0.25, height: 0.12, depth: 0.42 }, scene);
  footL.parent = legL.pivot; footL.position.set(0, -0.69, 0.12); footL.material = darkMat;
  const footR = footL.clone(`footR-${id}`); footR.parent = legR.pivot;
  const handL = MeshBuilder.CreateSphere(`handL-${id}`, { diameter: 0.2, segments: 8 }, scene);
  handL.parent = armL.pivot; handL.position.y = -0.62; handL.material = skinMat;
  const handR = handL.clone(`handR-${id}`); handR.parent = armR.pivot;
  const namePlane = MeshBuilder.CreatePlane(`name-${id}`, { width: 1.55, height: 0.32 }, scene);
  namePlane.parent = root; namePlane.position.y = 2.55; namePlane.billboardMode = 7;
  const nameTex = new DynamicTexture(`name-texture-${id}`, { width: 512, height: 96 }, scene, true);
  nameTex.hasAlpha = true;
  nameTex.drawText(name.slice(0, 18), null, 66, 'bold 46px Arial', '#f4e7cf', 'transparent', true);
  const nameMat = new StandardMaterial(`name-material-${id}`, scene);
  nameMat.diffuseTexture = nameTex; nameMat.opacityTexture = nameTex; nameMat.emissiveColor = new Color3(1, 1, 1);
  nameMat.disableLighting = true; namePlane.material = nameMat;
  const aura = MeshBuilder.CreateTorus(`charge-aura-${id}`, { diameter: 1.05, thickness: 0.035, tessellation: 24 }, scene);
  aura.parent = root; aura.position.y = 0.06; aura.rotation.x = Math.PI / 2;
  aura.material = makeMat(scene, `aura-material-${id}`, '#6ecde8', { emissive: '#2d90af', alpha: 0.5 });
  aura.isVisible = false;

  const parts = [torso, robe, belt, collar, head, hair, topknot, shoulderL, shoulderR,
    armL.bone, armL.joint, armR.bone, armR.joint, sleeveL.bone, sleeveL.joint, sleeveR.bone, sleeveR.joint,
    legL.bone, legL.joint, legR.bone, legR.joint, footL, footR, handL, handR, namePlane];
  for (const mesh of parts) {
    mesh.receiveShadows = true;
    shadowGenerator.addShadowCaster(mesh, true);
  }
  return {
    root, torso, robe, armL, armR, sleeveL, sleeveR, legL, legR, aura,
    parts, target: new Vector3(0, 0, 0), lastAction: 'idle',
  };
}

function buildArena(scene, roomKey, shadowGenerator) {
  const arenaThemes = [
    { ground: '#39352f', lantern: '#ffb56c' },
    { ground: '#45413b', lantern: '#f1c77b' },
    { ground: '#40382f', lantern: '#ffc48b' },
    { ground: '#354147', lantern: '#8dc8d6' },
    { ground: '#344238', lantern: '#b6cf84' },
    { ground: '#423640', lantern: '#c4a2dc' },
  ];
  const roomNumber = Number(String(roomKey).match(/\d+/)?.[0] ?? 1);
  const theme = arenaThemes[(Math.max(1, roomNumber) - 1) % arenaThemes.length];
  const groundMat = makeMat(scene, 'arena-ground', theme.ground);
  const edgeMat = makeMat(scene, 'arena-edge', '#8b6844', { metallic: true });
  const woodMat = makeMat(scene, 'old-wood', '#62422e');
  const stoneMat = makeMat(scene, 'weathered-stone', '#77736c');
  const darkStoneMat = makeMat(scene, 'dark-stone', '#464744');
  const tileMat = makeMat(scene, 'tile-lines', '#5a5145');
  const ground = MeshBuilder.CreateGround('arena-ground', { width: 32, height: 32, subdivisions: 2 }, scene);
  ground.material = groundMat; ground.receiveShadows = true;
  // A kinematic collision world is mirrored on the server. Havok supplies the
  // actual rigid-body world for arena props; fighter motion remains server-authoritative.
  if (scene.getPhysicsEngine()) new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0, friction: 0.85, restitution: 0.05 }, scene);
  const ring = MeshBuilder.CreateTorus('arena-circular-mark', { diameter: 11.5, thickness: 0.075, tessellation: 64 }, scene);
  ring.position.y = 0.025; ring.material = edgeMat;
  const innerRing = MeshBuilder.CreateTorus('arena-inner-mark', { diameter: 5.3, thickness: 0.035, tessellation: 48 }, scene);
  innerRing.position.y = 0.025; innerRing.material = tileMat;
  for (let i = 0; i < 12; i++) {
    const angle = (Math.PI * 2 * i) / 12;
    const mark = MeshBuilder.CreateBox(`floor-mark-${i}`, { width: 0.045, height: 0.018, depth: 1.6 }, scene);
    mark.position.set(Math.sin(angle) * 7.0, 0.018, Math.cos(angle) * 7.0);
    mark.rotation.y = angle;
    mark.material = tileMat;
  }
  const props = [];
  for (const prop of ARENA_PROPS) {
    const material = prop.kind === 'pillar' || prop.kind === 'wall' ? woodMat : prop.kind === 'platform' ? stoneMat : darkStoneMat;
    let mesh;
    if (prop.kind === 'pillar') {
      mesh = MeshBuilder.CreateCylinder(prop.id, { height: prop.h, diameter: prop.w, tessellation: 12 }, scene);
      mesh.position.set(prop.x, prop.h / 2, prop.z); mesh.material = woodMat;
      const cap = MeshBuilder.CreateCylinder(`${prop.id}-cap`, { height: 0.22, diameter: prop.w * 1.28, tessellation: 12 }, scene);
      cap.position.set(prop.x, prop.h - 0.1, prop.z); cap.material = edgeMat;
      cap.receiveShadows = true; shadowGenerator.addShadowCaster(cap);
    } else if (prop.kind === 'rock') {
      mesh = MeshBuilder.CreatePolyhedron(prop.id, { type: 1, size: 1, sizeX: prop.w, sizeY: prop.h, sizeZ: prop.d }, scene);
      mesh.position.set(prop.x, prop.h * 0.47, prop.z); mesh.rotation.y = prop.x * 0.14; mesh.material = darkStoneMat;
    } else {
      mesh = MeshBuilder.CreateBox(prop.id, { width: prop.w, height: prop.h, depth: prop.d }, scene);
      mesh.position.set(prop.x, prop.h / 2, prop.z); mesh.material = material;
    }
    mesh.receiveShadows = true; shadowGenerator.addShadowCaster(mesh);
    if (scene.getPhysicsEngine()) new PhysicsAggregate(mesh, PhysicsShapeType.BOX, { mass: 0, friction: 0.7 }, scene);
    props.push(mesh);
  }

  // A small martial hall silhouette at the rear gives scale without blocking the duel.
  const hallBack = addBox(scene, 'hall-back', new Vector3(0, 1.0, -14.4), new Vector3(7.6, 2, 0.8), woodMat);
  const hallRoof = MeshBuilder.CreateBox('hall-roof', { width: 8.8, height: 0.42, depth: 1.8 }, scene);
  hallRoof.position.set(0, 2.25, -14.2); hallRoof.rotation.x = -0.12; hallRoof.material = darkStoneMat;
  shadowGenerator.addShadowCaster(hallBack); shadowGenerator.addShadowCaster(hallRoof);

  // Lanterns add warm points of light and a recognizable wuxia atmosphere.
  const lanternMat = makeMat(scene, 'lantern-glass', theme.lantern, { emissive: theme.lantern });
  const lanternPoints = [[-7.5, 4.0, -7.5], [7.5, 4.0, -7.5], [-7.5, 4.0, 7.5], [7.5, 4.0, 7.5]];
  lanternPoints.forEach(([x, y, z], i) => {
    const string = MeshBuilder.CreateCylinder(`lantern-string-${i}`, { height: 0.85, diameter: 0.035 }, scene);
    string.position.set(x, y + 0.42, z); string.material = darkStoneMat;
    const lantern = MeshBuilder.CreateSphere(`lantern-${i}`, { diameter: 0.52, segments: 12 }, scene);
    lantern.scaling.y = 1.25; lantern.position.set(x, y, z); lantern.material = lanternMat;
    const glow = new PointLight(`lantern-light-${i}`, new Vector3(x, y, z), scene);
    glow.diffuse = new Color3(1, 0.58, 0.28); glow.intensity = 0.48; glow.range = 7;
  });
  return { ground, props, ring, hallBack, hallRoof, mapName: roomKey };
}

function lerpAngle(a, b, t) {
  let diff = (b - a + Math.PI) % (Math.PI * 2) - Math.PI;
  return a + diff * t;
}

export async function mountArena(canvas, room, roomKey, callbacks = {}) {
  const engine = new Engine(canvas, true, { antialias: true, stencil: true, adaptToDeviceRatio: true, preserveDrawingBuffer: false });
  const scene = new Scene(engine);
  scene.clearColor = new Color3(0.055, 0.052, 0.048).toColor4(1);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.009;
  scene.fogColor = new Color3(0.12, 0.115, 0.105);

  const hemi = new HemisphericLight('moonlight', new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.62; hemi.diffuse = new Color3(0.68, 0.73, 0.83); hemi.groundColor = new Color3(0.24, 0.19, 0.15);
  const sun = new DirectionalLight('warm-key', new Vector3(-0.4, -1, 0.35), scene);
  sun.position = new Vector3(10, 18, -8); sun.intensity = 1.2; sun.diffuse = new Color3(1, 0.84, 0.67);
  const shadows = new ShadowGenerator(1536, sun);
  shadows.useBlurExponentialShadowMap = true; shadows.blurKernel = 16; shadows.bias = 0.0004;
  const glow = new GlowLayer('qi-glow', scene, { blurKernelSize: 32 });
  glow.intensity = 0.48;

  // Havok is bundled with the project. Unsupported devices still get the full
  // WebGL scene and authoritative server movement if WASM initialization fails.
  try {
    const havok = await HavokPhysics();
    scene.enablePhysics(new Vector3(0, -9.81, 0), new HavokPlugin(true, havok));
  } catch (error) {
    console.warn('Havok initialization skipped; server movement/collision remains active.', error);
  }

  const arena = buildArena(scene, roomKey, shadows);
  const camera = new FreeCamera('third-person-camera', new Vector3(0, 5, 10), scene);
  camera.minZ = 0.1; camera.maxZ = 250; camera.fov = 0.86; camera.inertia = 0;
  scene.activeCamera = camera;

  const palettes = [
    { robe: '#a8442f', trim: '#e2bb81', sash: '#302b28' },
    { robe: '#344f5d', trim: '#b9d0cf', sash: '#c4a06b' },
  ];
  const fighters = new Map();
  const fx = new Map();
  const rings = [];
  let state = room.state;
  let localId = room.sessionId;
  let yaw = room.state?.players?.get(room.sessionId)?.yaw ?? 0;
  let pitch = -0.24;
  let dragging = false;
  let pointerLocked = false;
  let lastMouse = { x: 0, y: 0 };
  let lastNetSend = 0;
  let lastHudSend = 0;
  let disposed = false;
  const keys = new Set();
  const lastTap = new Map();
  const chargeKeys = new Set();

  function ensureFighter(id, player, index) {
    if (fighters.has(id)) return fighters.get(id);
    const model = buildFighter(scene, shadows, id, player.name, palettes[index % palettes.length]);
    fighters.set(id, model);
    return model;
  }

  function spawnProjectile(data) {
    if (fx.has(data.id)) return;
    const palm = PALMS[data.palmId] ?? PALMS.chi;
    const mat = makeMat(scene, `projectile-mat-${data.id}`, palm.color, { emissive: palm.color });
    const mesh = data.slash
      ? MeshBuilder.CreateBox(`projectile-${data.id}`, { width: 2.2, height: 0.11, depth: 0.24 }, scene)
      : MeshBuilder.CreateSphere(`projectile-${data.id}`, { diameter: Math.max(0.36, data.radius * 1.55), segments: 14 }, scene);
    mesh.material = mat; mesh.position.set(data.x, data.y, data.z);
    if (data.slash) mesh.rotation.y = Math.atan2(data.vx, data.vz);
    else mesh.scaling.z = 1.55;
    if (palm.id === 'long') {
      const body = [];
      for (let i = 0; i < 4; i++) {
        const segment = MeshBuilder.CreateSphere(`dragon-segment-${data.id}-${i}`, { diameter: 0.36 - i * 0.045, segments: 10 }, scene);
        segment.material = mat; segment.position.copyFrom(mesh.position); segment.isVisible = false;
        body.push(segment);
      }
      mesh.scaling.set(1.4, 0.65, 2.1);
      fx.set(data.id, { mesh, material: mat, data: { ...data }, life: data.life, body });
    } else {
      fx.set(data.id, { mesh, material: mat, data: { ...data }, life: data.life, body: [] });
    }
  }

  function burst(x, y, z, color = '#e8d4a9') {
    const material = makeMat(scene, `burst-mat-${Math.random()}`, color, { emissive: color, alpha: 0.85 });
    const mesh = MeshBuilder.CreateTorus(`impact-ring-${Math.random()}`, { diameter: 0.75, thickness: 0.08, tessellation: 20 }, scene);
    mesh.position.set(x, y, z); mesh.rotation.x = Math.PI / 2; mesh.material = material;
    rings.push({ mesh, material, life: 0.48, max: 0.48 });
  }

  room.onMessage('projectile', spawnProjectile);
  room.onMessage('projectile-end', (data) => {
    const effect = fx.get(data.id);
    if (effect) {
      if (data.hit) burst(data.x, data.y, data.z, effect.data.color);
      effect.mesh.dispose(); effect.body.forEach((m) => m.dispose()); effect.material.dispose(); fx.delete(data.id);
    }
  });
  room.onMessage('impact', (data) => burst(data.x, data.y, data.z, data.palm === 'hoa' ? '#ff7a35' : data.palm === 'bang' ? '#8be8ff' : '#e8d4a9'));
  room.onMessage('charge-begin', (data) => callbacks.onMessage?.('charge-begin', data));
  room.onMessage('charge-cancel', (data) => callbacks.onMessage?.('charge-cancel', data));
  room.onMessage('match-end', (data) => callbacks.onMessage?.('match-end', data));
  room.onStateChange((newState) => { state = newState; });

  function sendInput(now) {
    if (now - lastNetSend < 50) return;
    lastNetSend = now;
    let forward = 0; let right = 0;
    if (keys.has('KeyW')) forward += 1;
    if (keys.has('KeyS')) forward -= 1;
    if (keys.has('KeyD')) right += 1;
    if (keys.has('KeyA')) right -= 1;
    const mag = Math.hypot(forward, right);
    if (mag > 1) { forward /= mag; right /= mag; }
    room.send('input', { forward, right, yaw, pitch });
  }

  function moveLook(dx, dy) {
    yaw -= dx * 0.0022;
    pitch = Math.max(-0.62, Math.min(0.72, pitch - dy * 0.0019));
  }

  function dashFromKey(code) {
    let f = 0; let r = 0;
    if (code === 'KeyW') f = 1;
    if (code === 'KeyS') f = -1;
    if (code === 'KeyA') r = -1;
    if (code === 'KeyD') r = 1;
    const forward = FORWARD(yaw);
    const right = RIGHT(yaw);
    return { x: forward.x * f + right.x * r, z: forward.z * f + right.z * r };
  }

  function onKeyDown(event) {
    if (disposed) return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
    if (event.code === 'ArrowUp') { pitch = Math.min(0.72, pitch + 0.055); return; }
    if (event.code === 'ArrowDown') { pitch = Math.max(-0.62, pitch - 0.055); return; }
    if (event.code === 'ArrowLeft') { yaw += 0.06; return; }
    if (event.code === 'ArrowRight') { yaw -= 0.06; return; }
    if (event.repeat) return;
    if (event.code.startsWith('Key') && !['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyC'].includes(event.code)) return;
    keys.add(event.code);
    if (event.code === 'KeyQ') room.send('q-held', { held: true });
    if (event.code === 'KeyC') {
      chargeKeys.add(event.code);
      room.send('charge-start');
    }
    if (event.code === 'Space') room.send('jump');
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) {
      const now = performance.now();
      const previous = lastTap.get(event.code) ?? 0;
      if (now - previous < 270) {
        const dir = dashFromKey(event.code);
        room.send('dash', dir);
      }
      lastTap.set(event.code, now);
    }
  }

  function onKeyUp(event) {
    keys.delete(event.code);
    if (event.code === 'KeyQ') room.send('q-held', { held: false });
    if (event.code === 'KeyC') {
      chargeKeys.delete(event.code);
      room.send('charge-cancel');
    }
  }
  function onBlur() {
    keys.clear();
    room.send('q-held', { held: false });
    if (chargeKeys.size) room.send('charge-cancel');
    chargeKeys.clear();
  }
  function onPointerDown(event) {
    if (event.button !== 0) return;
    dragging = true; lastMouse = { x: event.clientX, y: event.clientY };
    canvas.setPointerCapture?.(event.pointerId);
    if (document.pointerLockElement !== canvas && canvas.requestPointerLock) {
      try { canvas.requestPointerLock(); } catch { /* drag fallback below */ }
    }
  }
  function onPointerMove(event) {
    if (document.pointerLockElement === canvas) {
      pointerLocked = true; moveLook(event.movementX, event.movementY);
    } else if (dragging) {
      moveLook(event.clientX - lastMouse.x, event.clientY - lastMouse.y);
      lastMouse = { x: event.clientX, y: event.clientY };
    }
  }
  function onPointerUp() { dragging = false; }
  function onPointerLock() { pointerLocked = document.pointerLockElement === canvas; }
  function onContextMenu(event) { event.preventDefault(); }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  document.addEventListener('pointerlockchange', onPointerLock);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('contextmenu', onContextMenu);

  function updateModel(model, player, now) {
    const target = model.target;
    target.set(player.x, player.y, player.z);
    const local = model.root.metadata?.local;
    const smoothing = local ? 0.48 : 0.24;
    model.root.position = Vector3.Lerp(model.root.position, target, smoothing);
    model.root.rotation.y = lerpAngle(model.root.rotation.y, player.yaw, 0.32);
    const runPhase = now * 0.012;
    const running = player.action === 'run';
    const jumping = player.action === 'jump' || player.y > 0.06;
    const charging = player.action === 'charge';
    const combo = player.action === 'combo';
    const dash = player.action === 'dash';
    const hit = player.action === 'stun';
    const step = Number(player.actionStep || 0);
    const swing = running ? Math.sin(runPhase) : 0;
    model.legL.pivot.rotation.x = swing * 0.66 + (jumping ? -0.52 : 0);
    model.legR.pivot.rotation.x = -swing * 0.66 + (jumping ? -0.52 : 0);
    model.armL.pivot.rotation.x = -swing * 0.55;
    model.armR.pivot.rotation.x = swing * 0.55;
    model.armL.pivot.rotation.z = -0.12;
    model.armR.pivot.rotation.z = 0.12;
    model.torso.rotation.z = dash ? -0.22 : jumping ? 0.05 : hit ? Math.sin(now * 0.06) * 0.08 : 0;
    model.torso.rotation.y = 0;
    if (combo) {
      const punch = Math.max(0, Math.sin((player.actionT * 7.5) % Math.PI));
      if (step % 2 === 1) model.armR.pivot.rotation.x = -1.9 * punch - 0.65;
      else model.legR.pivot.rotation.x = -1.5 * punch;
      model.armL.pivot.rotation.x = step % 2 === 0 ? -1.7 * punch : -0.25;
    }
    if (charging) {
      model.armL.pivot.rotation.x = -1.35;
      model.armR.pivot.rotation.x = -1.35;
      model.armL.pivot.rotation.z = -0.35;
      model.armR.pivot.rotation.z = 0.35;
      model.aura.isVisible = true;
      model.aura.scaling.setAll(1 + Math.sin(now * 0.012) * 0.12);
      model.torso.rotation.y = player.palm === 'long' ? Math.sin(player.actionT * 5.4) * 0.95 : 0;
    } else {
      model.aura.isVisible = false;
    }
    if (player.action === 'cast') {
      model.armR.pivot.rotation.x = -2.25;
      model.armL.pivot.rotation.x = -0.38;
    }
    if (player.action === 'jump') {
      model.armL.pivot.rotation.x = -0.95; model.armR.pivot.rotation.x = -0.95;
    }
    model.robe.rotation.y = Math.sin(now * 0.002 + (player.x || 0)) * 0.025;
  }

  function render() {
    if (disposed) return;
    const now = performance.now();
    const delta = Math.min(0.05, engine.getDeltaTime() / 1000 || 0.016);
    sendInput(now);
    const players = state?.players;
    const localPlayer = localId && players?.get(localId);
    if (players) {
      let index = 0;
      const liveIds = new Set();
      for (const [id, player] of players.entries()) {
        liveIds.add(id);
        const model = ensureFighter(id, player, index++);
        model.root.metadata = { ...(model.root.metadata ?? {}), local: id === localId };
        updateModel(model, player, now);
      }
      for (const [id, model] of fighters.entries()) {
        if (!liveIds.has(id)) {
          model.root.dispose(false, true);
          fighters.delete(id);
        }
      }
      if (localPlayer) {
        const fwd = FORWARD(yaw);
        const distance = 6.8;
        const target = new Vector3(localPlayer.x, localPlayer.y + 1.35, localPlayer.z);
        camera.position.set(
          target.x - fwd.x * Math.cos(pitch) * distance,
          target.y - Math.sin(pitch) * distance + 0.25,
          target.z - fwd.z * Math.cos(pitch) * distance,
        );
        camera.setTarget(target);
      }
      if (callbacks.onState && now - lastHudSend > 100) {
        lastHudSend = now;
        callbacks.onState({
          phase: state.phase,
          prepLeft: Math.ceil(state.prepLeft),
          timeLeft: Math.ceil(state.timeLeft),
          winnerSessionId: state.winnerSessionId,
          resultReason: state.resultReason,
          players: [...players.entries()].map(([id, p]) => ({
            id, name: p.name, score: p.score, action: p.action, palm: p.activePalm,
            selectedPalm: p.palm, ready: p.ready, charge: p.charge, cooldown: p.cooldown,
            slowT: p.slowT, burnT: p.burnT, x: p.x, y: p.y, z: p.z,
          })),
          localId,
        });
      }
    }

    for (const [id, effect] of fx.entries()) {
      const d = effect.data;
      effect.mesh.position.addInPlace(new Vector3(d.vx, d.vy, d.vz).scale(delta));
      effect.life -= delta;
      if (effect.body.length) {
        const velocity = new Vector3(d.vx, d.vy, d.vz).normalize();
        effect.body.forEach((segment, i) => {
          segment.isVisible = true;
          segment.position.copyFrom(effect.mesh.position.subtract(velocity.scale((i + 1) * 0.42)));
        });
      }
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const ring = rings[i]; ring.life -= delta;
      const t = 1 - ring.life / ring.max;
      ring.mesh.scaling.setAll(0.7 + t * 2.0);
      ring.material.alpha = Math.max(0, ring.life / ring.max);
      if (ring.life <= 0) { ring.mesh.dispose(); ring.material.dispose(); rings.splice(i, 1); }
    }
    scene.render();
  }

  engine.runRenderLoop(render);
  const resize = () => engine.resize();
  window.addEventListener('resize', resize);

  // Double-check the canvas received a usable viewport before rendering.
  engine.resize();

  return {
    scene,
    setPalm(palm) { room.send('select-palm', { palm }); },
    leave() { return room.leave(); },
    dispose() {
      if (disposed) return;
      disposed = true;
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('resize', resize);
      document.removeEventListener('pointerlockchange', onPointerLock);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('contextmenu', onContextMenu);
      if (document.pointerLockElement === canvas) document.exitPointerLock?.();
      for (const effect of fx.values()) { effect.mesh.dispose(); effect.body.forEach((m) => m.dispose()); effect.material.dispose(); }
      for (const ring of rings) { ring.mesh.dispose(); ring.material.dispose(); }
      engine.stopRenderLoop(render);
      scene.dispose(); engine.dispose();
    },
  };
}
