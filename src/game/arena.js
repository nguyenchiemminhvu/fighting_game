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
import {
  DASH_KEYS, RUN_SPEED, TICK_DT,
  chargeProgress, encodeCmd, stepFighter, unpackFighter,
} from './fighter.js';

// Remote fighters are drawn slightly in the past so there are always two
// server snapshots to interpolate between.
const INTERP_DELAY = 0.1;
const SNAPSHOT_LIMIT = 30;
// Prediction corrections are blended away instead of snapping the fighter.
const ERROR_DECAY = 14;
const ERROR_SNAP_DISTANCE = 9;
const MAX_FRAME_SECONDS = 0.25;
const MAX_PENDING_CMDS = 180;
const STRIDE_PER_UNIT = 2.15;

const clamp1 = (value) => Math.max(-1, Math.min(1, value));
const damp = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));
const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

function restPose() {
  return {
    legL: 0, legR: 0, armLx: 0, armRx: 0, armLz: -0.12, armRz: 0.12,
    torsoX: 0, torsoZ: 0, leanX: 0, leanZ: 0,
  };
}
const POSE_KEYS = Object.keys(restPose());

const FORWARD = (yaw) => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });
// Babylon's third-person camera uses the opposite horizontal screen-right axis
// from the old movement basis; this basis keeps A visually left and D right.
const RIGHT = (yaw) => ({ x: -Math.cos(yaw), z: Math.sin(yaw) });

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
  const chargeRing = MeshBuilder.CreateTorus(`charge-ring-${id}`, { diameter: 1.48, thickness: 0.035, tessellation: 36 }, scene);
  chargeRing.parent = root; chargeRing.position.set(0, 1.36, 0); chargeRing.rotation.x = 0.25;
  chargeRing.material = makeMat(scene, `charge-ring-material-${id}`, '#80dfff', { emissive: '#3aaed1', alpha: 0.62 });
  chargeRing.isVisible = false;
  const chargeRing2 = MeshBuilder.CreateTorus(`charge-ring2-${id}`, { diameter: 1.08, thickness: 0.022, tessellation: 32 }, scene);
  chargeRing2.parent = root; chargeRing2.position.set(0, 1.36, 0); chargeRing2.rotation.z = 0.9;
  chargeRing2.material = makeMat(scene, `charge-ring2-material-${id}`, '#f3d59b', { emissive: '#bd8b42', alpha: 0.55 });
  chargeRing2.isVisible = false;
  const qiOrb = MeshBuilder.CreateSphere(`qi-orb-${id}`, { diameter: 0.42, segments: 16 }, scene);
  qiOrb.parent = root; qiOrb.position.set(0, 1.43, 0.3);
  qiOrb.material = makeMat(scene, `qi-orb-material-${id}`, '#b9f4ff', { emissive: '#79e4ff', alpha: 0.86 });
  qiOrb.isVisible = false;

  const parts = [torso, robe, belt, collar, head, hair, topknot, shoulderL, shoulderR,
    armL.bone, armL.joint, armR.bone, armR.joint, sleeveL.bone, sleeveL.joint, sleeveR.bone, sleeveR.joint,
    legL.bone, legL.joint, legR.bone, legR.joint, footL, footR, handL, handR, namePlane];
  for (const mesh of parts) {
    mesh.receiveShadows = true;
    shadowGenerator.addShadowCaster(mesh, true);
  }
  return {
    root, torso, robe, armL, armR, sleeveL, sleeveR, legL, legR, aura, chargeRing, chargeRing2, qiOrb,
    parts,
    // `view` is where and how the fighter is drawn this frame; `pose` eases
    // towards `poseTarget` so limbs flow between stances instead of snapping.
    view: { x: 0, y: 0, z: 0, yaw: 0, action: 'idle', actionT: 0, actionStep: 0, palm: 'chi' },
    pose: restPose(), poseTarget: restPose(),
    placed: false, lastX: 0, lastY: 0, lastZ: 0, velX: 0, velY: 0, velZ: 0,
    bodyYaw: 0, stride: 0, gait: 0, lastAction: null, actionStartedAt: 0,
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
  let pitch = 0.02;
  let dragging = false;
  let pointerLocked = false;
  let lastMouse = { x: 0, y: 0 };
  let lastFrameAt = performance.now();
  let lastHudSend = 0;
  let disposed = false;
  const keys = new Set();
  const lastTap = new Map();
  // Local fighter prediction: `sim` runs ahead of the server on our own input,
  // `pending` holds the commands the server has not acknowledged yet.
  const net = {
    sim: null, prev: { x: 0, y: 0, z: 0 }, pending: [], seq: 0, accumulator: 0,
    errX: 0, errY: 0, errZ: 0, jump: false, dash: 0, tapQ: false, tapC: false,
  };
  const snapshots = new Map();
  let clockOffset = null;
  let lastSnapshotClock = -1;
  const before = { x: 0, y: 0, z: 0 };
  const after = { x: 0, y: 0, z: 0 };

  function ensureFighter(id, player, index) {
    if (fighters.has(id)) return fighters.get(id);
    const model = buildFighter(scene, shadows, id, player.name, palettes[index % palettes.length]);
    fighters.set(id, model);
    return model;
  }

  function addEffectMaterial(materials, name, color, alpha = 1) {
    const material = makeMat(scene, name, color, { emissive: color, alpha });
    material.disableLighting = false;
    materials.push(material);
    return material;
  }

  function addEffectMesh(parts, mesh, material, root, position = null, rotation = null) {
    mesh.parent = root;
    mesh.material = material;
    if (position) mesh.position.copyFrom(position);
    if (rotation) mesh.rotation.copyFrom(rotation);
    parts.push(mesh);
    return mesh;
  }

  function spawnProjectile(data) {
    if (fx.has(data.id)) return;
    const palm = PALMS[data.palmId] ?? PALMS.chi;
    const root = new TransformNode(`palm-fx-${data.id}`, scene);
    const visualScale = palm.visualScale ?? 1;
    // An enlarged effect is raised so it towers over the ground instead of sinking into it.
    root.position.set(data.x, data.y + (visualScale - 1) * 0.45, data.z);
    const velocity = new Vector3(data.vx, data.vy, data.vz);
    const direction = velocity.lengthSquared() > 1e-6 ? velocity.normalize() : new Vector3(0, 0, 1);
    root.lookAt(root.position.add(direction));

    const materials = [];
    const parts = [];
    const body = [];
    const main = addEffectMaterial(materials, `palm-fx-main-${data.id}`, palm.color, 0.94);
    const bright = addEffectMaterial(materials, `palm-fx-bright-${data.id}`, '#f4fbff', 0.98);

    if (palm.id === 'chi') {
      // A focused, two-layer laser bolt: luminous outer ray and a white-hot core.
      const halo = MeshBuilder.CreateCylinder(`chi-laser-halo-${data.id}`, { height: 2.3, diameter: 0.19, tessellation: 14 }, scene);
      halo.rotation.x = Math.PI / 2; halo.position.z = 0.48;
      addEffectMesh(parts, halo, main, root);
      const core = MeshBuilder.CreateCylinder(`chi-laser-core-${data.id}`, { height: 2.15, diameter: 0.055, tessellation: 12 }, scene);
      core.rotation.x = Math.PI / 2; core.position.z = 0.5;
      addEffectMesh(parts, core, bright, root);
      const tip = MeshBuilder.CreateSphere(`chi-laser-tip-${data.id}`, { diameter: 0.22, segments: 12 }, scene);
      tip.position.z = 1.55; addEffectMesh(parts, tip, bright, root);
      const ring = MeshBuilder.CreateTorus(`chi-laser-ring-${data.id}`, { diameter: 0.25, thickness: 0.035, tessellation: 18 }, scene);
      ring.position.z = -0.62; addEffectMesh(parts, ring, main, root);
    } else if (palm.id === 'long') {
      // Stylized flying dragon: head, eyes, horns, whiskers and a sinuous tapered body.
      const dragon = addEffectMaterial(materials, `dragon-body-${data.id}`, '#168e91', 1);
      const belly = addEffectMaterial(materials, `dragon-belly-${data.id}`, '#d7b36f', 1);
      const eye = addEffectMaterial(materials, `dragon-eye-${data.id}`, '#ffe28a', 1);
      const head = MeshBuilder.CreateSphere(`dragon-head-${data.id}`, { diameter: 1, segments: 16 }, scene);
      head.scaling.set(0.37, 0.29, 0.5); head.position.set(0, 0, 0.27);
      addEffectMesh(parts, head, dragon, root);
      const muzzle = MeshBuilder.CreateSphere(`dragon-muzzle-${data.id}`, { diameter: 1, segments: 12 }, scene);
      muzzle.scaling.set(0.22, 0.14, 0.32); muzzle.position.set(0, -0.075, 0.65);
      addEffectMesh(parts, muzzle, belly, root);
      const jaw = MeshBuilder.CreateBox(`dragon-jaw-${data.id}`, { width: 0.31, height: 0.07, depth: 0.28 }, scene);
      jaw.position.set(0, -0.19, 0.61); addEffectMesh(parts, jaw, belly, root);
      for (const side of [-1, 1]) {
        const horn = MeshBuilder.CreateCylinder(`dragon-horn-${data.id}-${side}`, { height: 0.42, diameterTop: 0.015, diameterBottom: 0.13, tessellation: 8 }, scene);
        horn.position.set(side * 0.22, 0.29, 0.1); horn.rotation.z = side * -0.42;
        addEffectMesh(parts, horn, belly, root);
        const eyeBall = MeshBuilder.CreateSphere(`dragon-eye-${data.id}-${side}`, { diameter: 0.09, segments: 8 }, scene);
        eyeBall.position.set(side * 0.255, 0.075, 0.58); addEffectMesh(parts, eyeBall, eye, root);
        const whisker = MeshBuilder.CreateCylinder(`dragon-whisker-${data.id}-${side}`, { height: 0.66, diameter: 0.025, tessellation: 6 }, scene);
        whisker.position.set(side * 0.28, -0.02, 0.58); whisker.rotation.x = Math.PI / 2.8; whisker.rotation.z = side * 0.52;
        addEffectMesh(parts, whisker, belly, root);
      }
      for (let i = 0; i < 7; i++) {
        const segment = MeshBuilder.CreateSphere(`dragon-body-segment-${data.id}-${i}`, { diameter: 1, segments: 12 }, scene);
        const taper = 0.34 - i * 0.027;
        segment.scaling.set(taper * 1.08, taper * 0.84, 0.34 - i * 0.022);
        segment.position.set(0, 0, -0.23 - i * 0.38);
        addEffectMesh(parts, segment, i % 2 ? belly : dragon, root);
        body.push(segment);
      }
      const tail = MeshBuilder.CreateCylinder(`dragon-tail-${data.id}`, { height: 0.8, diameterTop: 0.015, diameterBottom: 0.22, tessellation: 8 }, scene);
      tail.rotation.x = Math.PI / 2; tail.position.set(0, 0, -3.0);
      addEffectMesh(parts, tail, dragon, root);
      const aura = MeshBuilder.CreateTorus(`dragon-aura-${data.id}`, { diameter: 1.2, thickness: 0.045, tessellation: 24 }, scene);
      aura.position.z = -0.1; aura.rotation.x = Math.PI / 2; addEffectMesh(parts, aura, bright, root);
    } else if (palm.id === 'bang') {
      // Frost shard cluster with a crystalline leading edge.
      const ice = addEffectMaterial(materials, `ice-crystal-${data.id}`, '#a9efff', 0.9);
      for (let i = 0; i < 5; i++) {
        const shard = MeshBuilder.CreatePolyhedron(`ice-shard-${data.id}-${i}`, { type: 1, size: 0.36 + (i % 2) * 0.12 }, scene);
        shard.position.set(Math.sin(i * 2.4) * 0.23, Math.cos(i * 1.7) * 0.22, 0.18 - i * 0.18);
        shard.rotation.set(i * 0.7, i * 0.9, i * 0.45);
        shard.scaling.set(0.55, 1.15, 0.55);
        addEffectMesh(parts, shard, ice, root);
      }
      const frostRing = MeshBuilder.CreateTorus(`ice-ring-${data.id}`, { diameter: 0.95, thickness: 0.035, tessellation: 24 }, scene);
      frostRing.rotation.x = Math.PI / 2; frostRing.position.z = -0.2; addEffectMesh(parts, frostRing, bright, root);
    } else if (palm.id === 'hoa') {
      // Broad horizontal fire blade with a hot core and flame-like ends.
      const blade = MeshBuilder.CreateBox(`fire-blade-${data.id}`, { width: 2.35, height: 0.2, depth: 0.14 }, scene);
      blade.position.z = 0.12; blade.rotation.z = -0.09; addEffectMesh(parts, blade, main, root);
      const core = MeshBuilder.CreateBox(`fire-blade-core-${data.id}`, { width: 1.95, height: 0.065, depth: 0.17 }, scene);
      core.position.z = 0.18; addEffectMesh(parts, core, bright, root);
      for (const side of [-1, 1]) {
        const flame = MeshBuilder.CreateSphere(`fire-flame-${data.id}-${side}`, { diameter: 0.42, segments: 10 }, scene);
        flame.scaling.set(0.75, 0.48, 1.5); flame.position.set(side * 1.12, side * 0.12, 0.16);
        addEffectMesh(parts, flame, main, root);
      }
    } else if (palm.id === 'kim') {
      // Giant palm-shaped qi seal: palm pad, four fingers and an opposing thumb.
      // Kept translucent so the caster can still see through it.
      const gold = addEffectMaterial(materials, `kim-gold-${data.id}`, '#f5d78c', 0.8);
      const fingerGlow = addEffectMaterial(materials, `kim-finger-${data.id}`, '#fff3cf', 0.82);
      const palmPad = MeshBuilder.CreateSphere(`kim-palm-${data.id}`, { diameter: 1, segments: 14 }, scene);
      palmPad.scaling.set(0.48, 0.38, 0.12); addEffectMesh(parts, palmPad, gold, root);
      for (let i = 0; i < 4; i++) {
        const finger = MeshBuilder.CreateCapsule(`kim-finger-${data.id}-${i}`, { height: 0.56 - i * 0.035, radius: 0.075, tessellation: 8 }, scene);
        finger.position.set(-0.31 + i * 0.205, 0.37 + Math.sin(i / 3 * Math.PI) * 0.04, 0.015);
        addEffectMesh(parts, finger, fingerGlow, root);
      }
      const thumb = MeshBuilder.CreateCapsule(`kim-thumb-${data.id}`, { height: 0.48, radius: 0.085, tessellation: 8 }, scene);
      thumb.position.set(-0.51, -0.02, 0); thumb.rotation.z = -0.78; addEffectMesh(parts, thumb, gold, root);
      const palmAura = MeshBuilder.CreateTorus(`kim-aura-${data.id}`, { diameter: 1.45, thickness: 0.055, tessellation: 24 }, scene);
      palmAura.rotation.x = Math.PI / 2; palmAura.position.z = -0.12; addEffectMesh(parts, palmAura, gold, root);
    } else {
      const orb = MeshBuilder.CreateSphere(`palm-orb-${data.id}`, { diameter: Math.max(0.36, data.radius * 1.55), segments: 14 }, scene);
      addEffectMesh(parts, orb, main, root);
    }

    fx.set(data.id, { root, materials, parts, body, data: { ...data }, life: data.life, age: 0, visualScale });
  }

  function burst(x, y, z, color = '#e8d4a9') {
    const material = makeMat(scene, `burst-mat-${Math.random()}`, color, { emissive: color, alpha: 0.85 });
    const mesh = MeshBuilder.CreateTorus(`impact-ring-${Math.random()}`, { diameter: 0.75, thickness: 0.08, tessellation: 20 }, scene);
    mesh.position.set(x, y, z); mesh.rotation.x = Math.PI / 2; mesh.material = material;
    rings.push({ mesh, material, life: 0.48, max: 0.48 });
  }

  // Each state patch becomes a timestamped snapshot of the remote fighters.
  // `clockOffset` maps our clock onto the server's simulation clock, smoothed
  // so that uneven packet arrival does not show up as uneven motion.
  function recordSnapshots() {
    const players = state?.players;
    if (!players || state.phase !== 'fight') {
      snapshots.clear();
      return;
    }
    const clock = Number(state.clock) || 0;
    if (clock <= lastSnapshotClock) return;
    lastSnapshotClock = clock;
    const sample = clock - performance.now() / 1000;
    clockOffset = clockOffset === null || Math.abs(sample - clockOffset) > 0.5
      ? sample
      : clockOffset + (sample - clockOffset) * 0.08;
    for (const [id, player] of players.entries()) {
      if (id === localId) continue;
      let buffer = snapshots.get(id);
      if (!buffer) snapshots.set(id, buffer = []);
      buffer.push({ t: clock, x: player.x, y: player.y, z: player.z, yaw: player.yaw });
      if (buffer.length > SNAPSHOT_LIMIT) buffer.shift();
    }
  }

  function predictedPosition(out) {
    const alpha = net.accumulator / TICK_DT;
    out.x = net.prev.x + (net.sim.x - net.prev.x) * alpha;
    out.y = net.prev.y + (net.sim.y - net.prev.y) * alpha;
    out.z = net.prev.z + (net.sim.z - net.prev.z) * alpha;
  }

  function rememberPosition() {
    net.prev.x = net.sim.x; net.prev.y = net.sim.y; net.prev.z = net.sim.z;
  }

  function resetPrediction() {
    net.sim = null;
    net.pending.length = 0;
    net.accumulator = 0;
    net.errX = 0; net.errY = 0; net.errZ = 0;
    net.jump = false; net.dash = 0; net.tapQ = false; net.tapC = false;
  }

  // Server reconciliation: adopt the authoritative fighter, then replay every
  // command it has not processed yet. Any difference from what was on screen
  // becomes a visual offset that decays, so corrections glide instead of pop.
  function reconcile(message) {
    if (state?.phase !== 'fight' || !Array.isArray(message)) return;
    const [ackSeq, values] = message;
    const wasPredicting = Boolean(net.sim);
    if (wasPredicting) predictedPosition(before);
    net.sim = unpackFighter(values, net.sim ?? undefined);
    let acked = 0;
    while (acked < net.pending.length && net.pending[acked].seq <= ackSeq) acked++;
    if (acked) net.pending.splice(0, acked);
    rememberPosition();
    for (const cmd of net.pending) {
      rememberPosition();
      stepFighter(net.sim, cmd);
    }
    if (!wasPredicting) return;
    predictedPosition(after);
    net.errX += before.x - after.x;
    net.errY += before.y - after.y;
    net.errZ += before.z - after.z;
    if (Math.hypot(net.errX, net.errY, net.errZ) > ERROR_SNAP_DISTANCE) {
      net.errX = 0; net.errY = 0; net.errZ = 0;
    }
  }

  room.onMessage('ack', reconcile);
  room.onMessage('projectile', spawnProjectile);
  room.onMessage('projectile-end', (data) => {
    const effect = fx.get(data.id);
    if (effect) {
      if (data.hit) burst(data.x, data.y, data.z, effect.data.color);
      effect.root.dispose(false, false);
      effect.materials.forEach((material) => material.dispose());
      fx.delete(data.id);
    }
  });
  room.onMessage('impact', (data) => burst(data.x, data.y, data.z, data.palm === 'hoa' ? '#ff7a35' : data.palm === 'bang' ? '#8be8ff' : '#e8d4a9'));
  room.onMessage('charge-begin', (data) => callbacks.onMessage?.('charge-begin', data));
  room.onMessage('charge-cancel', (data) => callbacks.onMessage?.('charge-cancel', data));
  room.onMessage('match-end', (data) => callbacks.onMessage?.('match-end', data));
  room.onStateChange((newState) => { state = newState; recordSnapshots(); });

  function readCmd() {
    let forward = 0; let right = 0;
    if (keys.has('KeyW')) forward += 1;
    if (keys.has('KeyS')) forward -= 1;
    if (keys.has('KeyD')) right += 1;
    if (keys.has('KeyA')) right -= 1;
    const cmd = {
      seq: ++net.seq, f: forward, r: right, yaw,
      q: keys.has('KeyQ') || net.tapQ, c: keys.has('KeyC') || net.tapC, jump: net.jump, dash: net.dash,
    };
    net.jump = false;
    net.dash = 0;
    net.tapQ = false;
    net.tapC = false;
    return cmd;
  }

  // Advance the local fighter in fixed ticks, immediately and without waiting
  // for the server; the same commands are sent for the server to replay.
  function stepPrediction(delta) {
    if (state?.phase !== 'fight') {
      if (net.sim) resetPrediction();
      return false;
    }
    if (!net.sim) return false;
    net.accumulator += delta;
    const batch = [];
    while (net.accumulator >= TICK_DT) {
      net.accumulator -= TICK_DT;
      const cmd = readCmd();
      net.pending.push(cmd);
      batch.push(encodeCmd(cmd));
      rememberPosition();
      stepFighter(net.sim, cmd);
    }
    if (batch.length) room.send('cmds', batch);
    if (net.pending.length > MAX_PENDING_CMDS) net.pending.splice(0, net.pending.length - MAX_PENDING_CMDS);
    const decay = Math.exp(-ERROR_DECAY * delta);
    net.errX *= decay; net.errY *= decay; net.errZ *= decay;
    return true;
  }

  function viewLocal(view) {
    predictedPosition(view);
    view.x += net.errX; view.y += net.errY; view.z += net.errZ;
    view.yaw = yaw;
    view.action = net.sim.action;
    view.actionT = net.sim.actionT;
    view.actionStep = net.sim.actionStep;
    view.palm = net.sim.palm;
  }

  function viewRemote(id, player, view) {
    view.action = player.action;
    view.actionT = Number(player.actionT) || 0;
    view.actionStep = Number(player.actionStep) || 0;
    view.palm = player.activePalm || player.palm;
    const buffer = snapshots.get(id);
    let from = player;
    let to = null;
    let blend = 0;
    if (buffer && buffer.length > 1 && clockOffset !== null) {
      const time = performance.now() / 1000 + clockOffset - INTERP_DELAY;
      let next = buffer.length - 1;
      if (time < buffer[next].t) {
        while (next > 0 && buffer[next - 1].t > time) next--;
        from = buffer[Math.max(0, next - 1)];
        if (next > 0) {
          to = buffer[next];
          blend = (time - from.t) / (to.t - from.t);
        }
      }
    }
    if (to) {
      view.x = from.x + (to.x - from.x) * blend;
      view.y = from.y + (to.y - from.y) * blend;
      view.z = from.z + (to.z - from.z) * blend;
      view.yaw = from.yaw + angleDelta(from.yaw, to.yaw) * blend;
    } else {
      view.x = from.x; view.y = from.y; view.z = from.z; view.yaw = from.yaw;
    }
  }

  function moveLook(dx, dy) {
    yaw += dx * 0.0022;
    // Natural vertical mouse look: move up to look up, move down to look down.
    // Keep keyboard ArrowUp / ArrowDown behavior independent and unchanged.
    pitch = Math.max(-0.72, Math.min(0.72, pitch - dy * 0.0019));
  }

  function onKeyDown(event) {
    if (disposed) return;
    const cameraKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (event.code === 'Space' || cameraKeys.includes(event.code)) event.preventDefault();
    if (cameraKeys.includes(event.code)) {
      keys.add(event.code);
      return;
    }
    if (event.repeat) return;
    if (event.code.startsWith('Key') && !['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyC'].includes(event.code)) return;
    // Held keys (WASD, Q, C) are sampled into every command; presses that must
    // not be missed between ticks (jump, double-tap dash) are latched here.
    keys.add(event.code);
    if (!net.sim) return;
    if (event.code === 'Space') net.jump = true;
    if (event.code === 'KeyQ') net.tapQ = true;
    if (event.code === 'KeyC') net.tapC = true;
    if (DASH_KEYS[event.code]) {
      const now = performance.now();
      const previous = lastTap.get(event.code) ?? 0;
      if (now - previous < 270) net.dash = DASH_KEYS[event.code];
      lastTap.set(event.code, now);
    }
  }

  function onKeyUp(event) {
    keys.delete(event.code);
  }
  function onBlur() {
    keys.clear();
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

  function updateModel(model, view, now, dt) {
    if (!model.placed) {
      model.placed = true;
      model.lastX = view.x; model.lastY = view.y; model.lastZ = view.z;
      model.bodyYaw = view.yaw + Math.PI; // rig's local forward axis is +Z.
    }
    // Animation follows the motion that is actually drawn, so the stride always
    // matches ground speed for predicted and interpolated fighters alike.
    const perSecond = dt > 1e-4 ? 1 / dt : 0;
    const velocityBlend = 1 - Math.exp(-20 * dt);
    model.velX += ((view.x - model.lastX) * perSecond - model.velX) * velocityBlend;
    model.velY += ((view.y - model.lastY) * perSecond - model.velY) * velocityBlend;
    model.velZ += ((view.z - model.lastZ) * perSecond - model.velZ) * velocityBlend;
    model.lastX = view.x; model.lastY = view.y; model.lastZ = view.z;
    const fwd = FORWARD(view.yaw);
    const right = RIGHT(view.yaw);
    const speed = Math.hypot(model.velX, model.velZ);
    const along = model.velX * fwd.x + model.velZ * fwd.z;
    const across = model.velX * right.x + model.velZ * right.z;

    // Reconstruct action time locally from the last state change. This gives
    // long moves fluid per-frame motion instead of stepping at the network rate.
    const action = view.action;
    if (model.lastAction !== action) {
      model.lastAction = action;
      model.actionStartedAt = now - view.actionT * 1000;
    }
    const actionT = Math.max(0, (now - model.actionStartedAt) / 1000);
    const onFoot = action === 'idle' || action === 'run';
    const charging = action === 'charge';
    const step = view.actionStep;

    model.gait = damp(model.gait, onFoot ? Math.min(1, speed / RUN_SPEED) : 0, 12, dt);
    model.stride += Math.min(speed, RUN_SPEED * 1.2) * STRIDE_PER_UNIT * dt * (along < -0.5 ? -1 : 1);
    const swing = Math.sin(model.stride) * model.gait;
    const bob = Math.abs(Math.cos(model.stride)) * 0.04 * model.gait;

    const target = model.poseTarget;
    Object.assign(target, restPose());
    let rate = 16;
    let spin = 0;

    if (onFoot) {
      // Lean into the direction of travel.
      target.leanX = clamp1(along / RUN_SPEED) * 0.1;
      target.leanZ = -clamp1(across / RUN_SPEED) * 0.08;
    } else if (action === 'jump') {
      // Tuck while rising, open up while falling.
      const rise = clamp1(model.velY / 5);
      const up = Math.max(0, rise);
      const down = Math.max(0, -rise);
      target.legL = -0.2 - 0.6 * up;
      target.legR = -0.05 - 0.3 * up + 0.25 * down;
      target.armLx = -0.5 - 0.6 * up;
      target.armRx = -0.5 - 0.6 * up;
      target.armLz = -0.3 - 0.55 * down;
      target.armRz = 0.3 + 0.55 * down;
      target.leanX = clamp1(along / RUN_SPEED) * 0.14;
      rate = 14;
    } else if (action === 'dash') {
      const unit = speed > 0.5 ? 1 / speed : 0;
      target.leanX = along * unit * 0.34;
      target.leanZ = -across * unit * 0.3;
      target.legL = -0.8;
      target.legR = 0.55;
      target.armLx = 0.6;
      target.armRx = 0.6;
      target.armLz = -0.35;
      target.armRz = 0.35;
      rate = 32;
    } else if (action === 'stun') {
      target.leanX = -0.16;
      target.torsoZ = Math.sin(now * 0.06) * 0.08;
      target.armLx = 0.25;
      target.armRx = 0.25;
      target.armLz = -0.55;
      target.armRz = 0.55;
      rate = 30;
    } else if (action === 'combo') {
      const punch = Math.max(0, Math.sin((actionT * 7.5) % Math.PI));
      if (step % 2 === 1) {
        target.armRx = -1.95 * punch - 0.62;
        target.torsoX = -0.1 * punch;
      } else {
        target.legR = -1.55 * punch;
        target.armLx = -1.7 * punch;
      }
      target.leanX = 0.06;
      rate = 45;
    } else if (charging) {
      model.aura.scaling.setAll(1 + Math.sin(now * 0.012) * 0.12);
      model.chargeRing.rotation.y += 2.1 * dt;
      model.chargeRing2.rotation.x += 1.6 * dt;
      model.chargeRing.scaling.setAll(0.9 + Math.sin(now * 0.009) * 0.08);
      if (view.palm === 'long') {
        // The opening of the charge sweeps the arms through a full body turn;
        // the rest pulls the released ambient qi back into the palms.
        const chargeSeconds = PALMS.long.charge;
        const sweepSeconds = chargeSeconds * 0.28;
        const sweep = Math.min(1, actionT / sweepSeconds);
        const gather = Math.max(0, Math.min(1, (actionT - sweepSeconds) / (chargeSeconds * 0.52)));
        spin = sweep * sweep * (3 - 2 * sweep) * Math.PI * 2;
        if (sweep < 1) {
          target.armLx = -0.18;
          target.armRx = -0.18;
          target.armLz = -0.82;
          target.armRz = 0.82;
          target.torsoX = -0.04;
        } else {
          target.armLx = -1.05 - gather * 0.22;
          target.armRx = -1.05 - gather * 0.22;
          target.armLz = -0.5 * (1 - gather);
          target.armRz = 0.5 * (1 - gather);
          target.torsoX = -0.08 * gather;
        }
        model.qiOrb.position.set(0, 1.45, 0.22 + gather * 0.48);
        model.qiOrb.scaling.setAll(0.18 + gather * 1.08 + Math.sin(now * 0.025) * 0.05);
        model.chargeRing.material.alpha = 0.28 + gather * 0.42;
      } else {
        target.armLx = -1.18;
        target.armRx = -1.18;
        target.armLz = -0.3;
        target.armRz = 0.3;
        model.qiOrb.position.set(0.12, 1.42, 0.36);
        model.qiOrb.scaling.setAll(0.45 + Math.sin(now * 0.018) * 0.13);
      }
      rate = 24;
    } else if (action === 'cast') {
      if (view.palm === 'long') {
        target.armRx = -2.42;
        target.armLx = -2.12;
        target.torsoX = -0.18;
      } else if (view.palm === 'chi') {
        target.armRx = -2.5;
        target.armRz = -0.05;
        target.armLx = -0.55;
      } else if (view.palm === 'hoa') {
        target.armRx = -1.95;
        target.armRz = -0.72;
        target.armLx = -0.35;
      } else if (view.palm === 'kim') {
        target.armRx = -2.15;
        target.armLx = -2.15;
        target.torsoX = -0.12;
      } else {
        target.armRx = -2.15;
        target.armLx = -0.6;
      }
      rate = 40;
    }
    model.aura.isVisible = charging;
    model.chargeRing.isVisible = charging;
    model.chargeRing2.isVisible = charging;
    model.qiOrb.isVisible = charging;

    // Ease every joint towards its target with a frame-rate independent blend.
    const pose = model.pose;
    const blend = 1 - Math.exp(-rate * dt);
    for (const key of POSE_KEYS) pose[key] += (target[key] - pose[key]) * blend;

    model.legL.pivot.rotation.x = pose.legL + swing * 0.7;
    model.legR.pivot.rotation.x = pose.legR - swing * 0.7;
    model.armL.pivot.rotation.x = pose.armLx - swing * 0.58;
    model.armR.pivot.rotation.x = pose.armRx + swing * 0.58;
    model.armL.pivot.rotation.z = pose.armLz;
    model.armR.pivot.rotation.z = pose.armRz;
    model.torso.rotation.x = pose.torsoX;
    model.torso.rotation.z = pose.torsoZ;
    model.robe.rotation.y = Math.sin(now * 0.002 + view.x) * 0.025;

    model.bodyYaw += angleDelta(model.bodyYaw, view.yaw + Math.PI) * (1 - Math.exp(-28 * dt));
    model.root.position.set(view.x, view.y + bob, view.z);
    model.root.rotation.set(pose.leanX, model.bodyYaw + spin, pose.leanZ);
  }

  function updateCameraKeys(delta) {
    const turnSpeed = 1.85;
    const lookSpeed = 1.45;
    // Increasing yaw turns the view towards screen-right in this camera basis.
    if (keys.has('ArrowLeft')) yaw -= turnSpeed * delta;
    if (keys.has('ArrowRight')) yaw += turnSpeed * delta;
    if (keys.has('ArrowUp')) pitch = Math.min(0.72, pitch + lookSpeed * delta);
    if (keys.has('ArrowDown')) pitch = Math.max(-0.72, pitch - lookSpeed * delta);
  }

  const lookTarget = new Vector3();

  function render() {
    if (disposed) return;
    const now = performance.now();
    const delta = Math.min(MAX_FRAME_SECONDS, Math.max(0, (now - lastFrameAt) / 1000));
    lastFrameAt = now;
    updateCameraKeys(delta);
    const predicting = stepPrediction(delta);
    const players = state?.players;
    if (players) {
      let index = 0;
      const liveIds = new Set();
      for (const [id, player] of players.entries()) {
        liveIds.add(id);
        const model = ensureFighter(id, player, index++);
        if (id === localId && predicting) viewLocal(model.view);
        else viewRemote(id, player, model.view);
        updateModel(model, model.view, now, delta);
      }
      for (const [id, model] of fighters.entries()) {
        if (!liveIds.has(id)) {
          model.root.dispose(false, true);
          fighters.delete(id);
          snapshots.delete(id);
        }
      }
      // The camera rides the same smoothed position the local fighter is drawn
      // at, never the raw network state.
      const anchor = fighters.get(localId)?.view;
      if (anchor) {
        const fwd = FORWARD(yaw);
        const shoulderX = Math.cos(yaw);
        const shoulderZ = -Math.sin(yaw);
        camera.position.set(
          anchor.x - fwd.x * 4.7 + shoulderX * 0.62,
          anchor.y + 2.2,
          anchor.z - fwd.z * 4.7 + shoulderZ * 0.62,
        );
        // Aim the camera over the near shoulder, not down the spell's barrel.
        // Pitch affects only this view point; the server keeps combat aim separate.
        lookTarget.set(
          anchor.x + fwd.x * 5.4,
          anchor.y + 1.55 + Math.tan(pitch) * 5.4,
          anchor.z + fwd.z * 5.4,
        );
        camera.setTarget(lookTarget);
      }
      if (callbacks.onState && now - lastHudSend > 100) {
        lastHudSend = now;
        callbacks.onState({
          phase: state.phase,
          prepLeft: Math.ceil(state.prepLeft),
          timeLeft: Math.ceil(state.timeLeft),
          winnerSessionId: state.winnerSessionId,
          resultReason: state.resultReason,
          players: [...players.entries()].map(([id, p]) => {
            // Our own charge bar and cooldown react instantly from the prediction.
            const own = id === localId && predicting ? net.sim : null;
            return {
              id, name: p.name, score: p.score, palm: p.activePalm,
              selectedPalm: p.palm, ready: p.ready,
              action: own ? own.action : p.action,
              charge: own ? chargeProgress(own) : p.charge,
              cooldown: own ? own.cooldown : p.cooldown,
              slowT: p.slowT, burnT: p.burnT, x: p.x, y: p.y, z: p.z,
            };
          }),
          localId,
        });
      }
    }

    for (const effect of fx.values()) {
      const d = effect.data;
      effect.root.position.x += d.vx * delta;
      effect.root.position.y += d.vy * delta;
      effect.root.position.z += d.vz * delta;
      effect.life -= delta;
      effect.age += delta;
      if (effect.body.length) {
        effect.body.forEach((segment, i) => {
          const phase = effect.age * 8.2 - i * 0.78;
          segment.position.x = Math.sin(phase) * (0.08 + i * 0.012);
          segment.position.y = Math.cos(phase * 0.84) * 0.105;
          segment.position.z = -0.23 - i * 0.38;
          segment.rotation.z = Math.sin(phase) * 0.22;
        });
        const head = effect.parts[0];
        if (head) head.position.y = Math.sin(effect.age * 9.5) * 0.055;
      }
      if (d.palmId === 'bang') effect.root.rotation.z += delta * 2.2;
      if (d.palmId === 'hoa') {
        const pulse = 0.92 + Math.sin(effect.age * 28) * 0.08;
        effect.root.scaling.set(pulse, pulse, 1);
      }
      // Enlarged effects swell out of the caster's hand over the first instant.
      if (effect.visualScale !== 1) {
        effect.root.scaling.setAll(effect.visualScale * Math.min(1, 0.4 + effect.age * 6));
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
      for (const effect of fx.values()) { effect.root.dispose(false, false); effect.materials.forEach((material) => material.dispose()); }
      for (const ring of rings) { ring.mesh.dispose(); ring.material.dispose(); }
      engine.stopRenderLoop(render);
      scene.dispose(); engine.dispose();
    },
  };
}
