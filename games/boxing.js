// Camera Boxing - Kinect Sports style boxing against the CPU. Your body drives
// a 3D boxer seen over your shoulder; the CPU boxer stands across the ring.
// Punch toward the screen to hit, both gloves up to block, lean to slip a
// straight punch, duck to go under a hook. The keys do the same without a
// camera (and let the game be tested without one).
import * as THREE from './vendor/three.module.js';
import { PoseLandmarker, FilesetResolver } from './vendor/tasks-vision/vision_bundle.mjs';

// ---------- Tuning ----------
const BODY_SCALE = 1.1;
const ROUND_SECONDS = 90;
const MAX_HP = 100;
const PUNCH_SPEED = 2.0;      // a hand moving this fast toward the CPU is a punch (m/s)
const HAND_COOLDOWN = 0.45;   // seconds before the same hand can land again
const DAMAGE = { you: { head: 9, body: 6, blocked: 1, counter: 1.6 }, cpu: { jab: 6, cross: 10, hook: 12, body: 8, blocked: 2 } };
const CPU_MIN_WAIT = 0.9, CPU_MAX_WAIT = 2.1;   // seconds between CPU actions

const TEAM = {
  you: { name: 'YOU', color: 0x2f80ff, css: '#2f80ff' },
  cpu: { name: 'CPU', color: 0xff3b3b, css: '#ff3b3b' },
};

const V3 = THREE.Vector3;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const mapRange = (v, a, b, c, d) => c + (d - c) * clamp((v - a) / (b - a), 0, 1);
const $ = (id) => document.getElementById(id);

// ---------- Renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ canvas: $('scene'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x06080f);
scene.fog = new THREE.Fog(0x06080f, 14, 40);

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
const CAM_HOME = new V3(-4.0, 2.8, 2.3);      // over your right shoulder, so the CPU is not hidden behind you
camera.position.copy(CAM_HOME);
const camTarget = new V3(0.9, 1.35, 0);
let shake = 0;

scene.add(new THREE.HemisphereLight(0xdde8ff, 0x1a1012, 0.5));
const sun = new THREE.SpotLight(0xfff2dd, 320, 30, Math.PI / 5, 0.5, 1.4);
sun.position.set(0, 9, 0);
sun.target.position.set(0, 0, 0);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun, sun.target);
const rim = new THREE.DirectionalLight(0x6a8cff, 0.8);
rim.position.set(6, 6, -6);
scene.add(rim);

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function canvasTexture(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

// The ring: a raised square canvas, four posts, three ropes a side, and a crowd in the dark
const RING = 3.4;
{
  const [c, g] = makeCanvas(1024, 1024);
  g.fillStyle = '#1b2a5a'; g.fillRect(0, 0, 1024, 1024);
  g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 6; g.strokeRect(90, 90, 844, 844);
  g.font = 'italic 900 120px system-ui, sans-serif'; g.fillStyle = 'rgba(255,255,255,.12)'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.save(); g.translate(512, 512); g.rotate(Math.PI / 2); g.fillText('CAMERA BOXING', 0, 0); g.restore();
  const mat = new THREE.MeshStandardMaterial({ map: canvasTexture(c), roughness: 0.75 });
  const canvasMesh = new THREE.Mesh(new THREE.BoxGeometry(RING * 2 + 0.8, 0.5, RING * 2 + 0.8), mat);
  canvasMesh.position.y = -0.25;
  canvasMesh.receiveShadow = true;
  scene.add(canvasMesh);
  const apron = new THREE.Mesh(new THREE.BoxGeometry(RING * 2 + 1.6, 0.5, RING * 2 + 1.6), new THREE.MeshStandardMaterial({ color: 0x0f1630, roughness: 0.9 }));
  apron.position.y = -0.26;
  scene.add(apron);

  const postMat = new THREE.MeshStandardMaterial({ color: 0xe6e9f0, metalness: 0.5, roughness: 0.35 });
  const padMats = [0x2f80ff, 0xff3b3b].map((col) => new THREE.MeshStandardMaterial({ color: col, roughness: 0.6 }));
  const corners = [[-RING, -RING], [-RING, RING], [RING, -RING], [RING, RING]];
  corners.forEach(([x, z], i) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.7, 12), postMat);
    post.position.set(x, 0.85, z);
    post.castShadow = true;
    scene.add(post);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 1.1, 12), padMats[x < 0 ? 0 : 1]);
    pad.position.set(x, 1.0, z);
    scene.add(pad);
  });
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
  for (const h of [0.55, 0.95, 1.35]) {
    for (const side of [-1, 1]) {
      const a = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, RING * 2, 8), ropeMat);   // along z
      a.rotation.x = Math.PI / 2; a.position.set(side * RING, h, 0); scene.add(a);
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, RING * 2, 8), ropeMat);   // along x
      b.rotation.z = Math.PI / 2; b.position.set(0, h, side * RING); scene.add(b);
    }
  }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x090c16, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.52; scene.add(floor);
}

// A crowd on three sides, a ring of capsules that hops when something lands
const crowd = { mesh: null, base: [], cheer: 0 };
{
  const rows = 4, perRow = 70;
  const people = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.2, 0.35, 4, 8), new THREE.MeshStandardMaterial({ roughness: 0.8 }), rows * perRow);
  const m = new THREE.Matrix4();
  const palette = [0x2f80ff, 0xff3b3b, 0xffd23f, 0xdddddd, 0x22c55e, 0xff8a3d, 0x9b5de5, 0x555b6e];
  let k = 0;
  for (let r = 0; r < rows; r++) {
    const radius = 7.5 + r * 1.2, y = 0.4 + r * 0.6;
    for (let i = 0; i < perRow; i++) {
      const ang = -Math.PI * 0.72 + (i / (perRow - 1)) * Math.PI * 1.44;   // the gap is behind the camera
      const x = Math.cos(ang) * radius, z = Math.sin(ang) * radius;
      crowd.base.push([x, y, z, rand(0, Math.PI * 2)]);
      m.makeTranslation(x, y, z);
      people.setMatrixAt(k, m);
      people.setColorAt(k, new THREE.Color(palette[(Math.random() * palette.length) | 0]).multiplyScalar(0.55));
      k++;
    }
  }
  crowd.mesh = people;
  scene.add(people);
}

// Glove flashes when a punch lands
const bursts = [];
function burst(pos, color) {
  const mesh = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.2, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  mesh.position.copy(pos);
  mesh.lookAt(camera.position);
  scene.add(mesh);
  bursts.push({ mesh, t: 0 });
}

// ---------- Avatars (the same body as the volleyball, gloves instead of bare hands) ----------
const MS = 33, MH = 34, HEAD = 35, HAND_L = 36, HAND_R = 37, NPTS = 38;
const UP = new V3(0, 1, 0);
const tmpV = new V3();
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 14);
const sphGeo = new THREE.SphereGeometry(1, 20, 14);

function makeLabel(text, css) {
  const [c, g] = makeCanvas(256, 96);
  g.fillStyle = css; g.beginPath(); g.roundRect(8, 8, 240, 70, 35); g.fill();
  g.font = 'italic 900 44px system-ui, sans-serif'; g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 45);
  g.beginPath(); g.moveTo(112, 78); g.lineTo(144, 78); g.lineTo(128, 94); g.fillStyle = css; g.fill();
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTexture(c), depthTest: false }));
  s.scale.set(0.7, 0.26, 1);
  return s;
}

class Avatar {
  constructor(key) {
    const team = TEAM[key];
    this.group = new THREE.Group();
    scene.add(this.group);
    const jersey = new THREE.MeshStandardMaterial({ color: 0xe8b98f, roughness: 0.7 });   // bare chest
    const skin = new THREE.MeshStandardMaterial({ color: 0xe8b98f, roughness: 0.7 });
    const shorts = new THREE.MeshStandardMaterial({ color: team.color, roughness: 0.6 });
    const shoes = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 });
    const glove = new THREE.MeshStandardMaterial({ color: team.color, emissive: team.color, emissiveIntensity: 0.35, roughness: 0.4 });
    this.bones = [
      [MS, MH, [0.2, 0.13], jersey],
      [11, 12, 0.095, jersey], [23, 24, 0.11, shorts],
      [11, 13, 0.08, skin], [12, 14, 0.08, skin],
      [13, 15, 0.062, skin], [14, 16, 0.062, skin],
      [23, 25, 0.105, shorts], [24, 26, 0.105, shorts],
      [25, 27, 0.08, skin], [26, 28, 0.08, skin],
      [MS, HEAD, 0.06, skin],
    ].map(([a, b, r, mat]) => {
      const mesh = new THREE.Mesh(cylGeo, mat);
      mesh.castShadow = true;
      this.group.add(mesh);
      return { a, b, r, mesh };
    });
    this.joints = [
      [11, 0.095, skin], [12, 0.095, skin], [13, 0.075, skin], [14, 0.075, skin],
      [25, 0.1, skin], [26, 0.1, skin], [27, 0.1, shoes], [28, 0.1, shoes],
      [HEAD, 0.15, skin], [HAND_L, 0.13, glove], [HAND_R, 0.13, glove],
    ].map(([i, r, mat]) => {
      const mesh = new THREE.Mesh(sphGeo, mat);
      mesh.scale.setScalar(r);
      mesh.castShadow = true;
      this.group.add(mesh);
      return { i, mesh };
    });
    this.label = makeLabel(team.name, team.css);
    this.group.add(this.label);
    this.gloveMat = glove;
  }
  update(pts) {
    for (const { a, b, r, mesh } of this.bones) {
      tmpV.subVectors(pts[b], pts[a]);
      const len = tmpV.length();
      if (len < 1e-4) { mesh.visible = false; continue; }
      mesh.visible = true;
      mesh.position.copy(pts[a]).addScaledVector(tmpV, 0.5);
      mesh.quaternion.setFromUnitVectors(UP, tmpV.divideScalar(len));
      if (Array.isArray(r)) mesh.scale.set(r[0], len, r[1]);
      else mesh.scale.set(r, len, r);
    }
    for (const { i, mesh } of this.joints) mesh.position.copy(pts[i]);
    this.label.position.copy(pts[HEAD]).add(tmpV.set(0, 0.5, 0));
  }
}

function computeExtras(p, d) {
  p[MS].addVectors(p[11], p[12]).multiplyScalar(0.5);
  p[MH].addVectors(p[23], p[24]).multiplyScalar(0.5);
  p[HEAD].copy(p[0]).add(tmpV.set(d * 0.08, 0.05, 0));
  p[HAND_L].addVectors(p[15], p[19]).multiplyScalar(0.5);
  p[HAND_R].addVectors(p[16], p[20]).multiplyScalar(0.5);
}

// ---------- A boxer's pose from a few numbers (the CPU, and you on the keys) ----------
// Offsets in metres from the hip centre, built facing +z and turned to face the other boxer.
const BODY = { 0: [0, 0.66, 0.1], 11: [-0.2, 0.48, 0], 12: [0.2, 0.48, 0], 23: [-0.12, 0, 0], 24: [0.12, 0, 0],
  25: [-0.16, -0.47, 0.06], 26: [0.16, -0.47, -0.06], 27: [-0.18, -0.92, 0.1], 28: [0.18, -0.92, -0.1] };
const GUARD = { 13: [-0.24, 0.26, 0.2], 14: [0.24, 0.26, 0.2], 15: [-0.13, 0.5, 0.36], 16: [0.13, 0.5, 0.36], 19: [-0.12, 0.55, 0.42], 20: [0.12, 0.55, 0.42] };
const MOVES = {
  jab:   { 13: [-0.18, 0.44, 0.45], 15: [-0.1, 0.52, 0.82], 19: [-0.09, 0.53, 0.92] },
  cross: { 14: [0.1, 0.44, 0.48], 16: [-0.02, 0.52, 0.84], 20: [-0.04, 0.53, 0.94] },
  hook:  { 14: [0.5, 0.42, 0.3], 16: [0.3, 0.52, 0.72], 20: [0.22, 0.53, 0.8] },
  body:  { 13: [-0.2, 0.2, 0.42], 15: [-0.08, 0.1, 0.78], 19: [-0.06, 0.08, 0.88] },
  block: { 13: [-0.26, 0.3, 0.14], 14: [0.26, 0.3, 0.14], 15: [-0.11, 0.66, 0.24], 16: [0.11, 0.66, 0.24], 19: [-0.1, 0.72, 0.28], 20: [0.1, 0.72, 0.28] },
  hurt:  { 13: [-0.3, 0.3, -0.1], 14: [0.3, 0.3, -0.1], 15: [-0.3, 0.5, 0.0], 16: [0.3, 0.5, 0.0], 19: [-0.3, 0.55, 0.0], 20: [0.3, 0.55, 0.0] },
};
const HIP_H = 0.92 * BODY_SCALE + 0.09;

// s: { x, z, d, lean, duck, w: { jab, cross, hook, body, block, hurt } (0..1 each), step, moving }
function boxerPose(pts, s) {
  const d = s.d;
  const root = new V3(s.x, HIP_H - s.duck * 0.35, s.z);
  const off = {};
  for (const i in BODY) off[i] = BODY[i].slice();
  for (const i in GUARD) off[i] = GUARD[i].slice();
  for (const name in MOVES) {
    const w = s.w[name] || 0;
    if (!w) continue;
    for (const i in MOVES[name]) {
      const a = off[i], b = MOVES[name][i];
      off[i] = [lerp(a[0], b[0], w), lerp(a[1], b[1], w), lerp(a[2], b[2], w)];
    }
  }
  // lean: the upper body slides sideways; hurt: it tips back
  const back = -(s.w.hurt || 0) * 0.25;
  for (const i of [0, 11, 12, 13, 14, 15, 16, 19, 20]) { off[i][0] += s.lean * 0.3; off[i][2] += back; }
  off[0][1] -= s.duck * 0.1;
  for (const i in off) {
    const [x, y, z] = off[i];
    pts[i].set(-d * z, y, d * x).multiplyScalar(BODY_SCALE).add(root);
  }
  const swing = Math.sin(s.step || 0) * 0.1 * (s.moving || 0);
  pts[25].z += swing; pts[27].z += swing * 1.6; pts[26].z -= swing; pts[28].z -= swing * 1.6;
  computeExtras(pts, d);
}

// ---------- The two boxers ----------
function makeBoxer(key, d) {
  return {
    key, d, hp: MAX_HP,
    x: -d * 0.95, z: 0, lean: 0, duck: 0,
    pts: Array.from({ length: NPTS }, () => new V3()),
    hands: [new V3(), new V3()], prevHands: [new V3(), new V3()], handVel: [new V3(), new V3()],
    cooldown: [0, 0], hurtT: 0, blocking: false,
    w: { jab: 0, cross: 0, hook: 0, body: 0, block: 0, hurt: 0 },
    avatar: new Avatar(key),
  };
}
const you = makeBoxer('you', -1);    // on the near side, facing +x
const cpu = makeBoxer('cpu', 1);     // across the ring, facing -x
you.human = false; you.lastSeen = -1e9; you.fresh = true; you.baseY = null; you.raiseT = 0; you.solo = true;
you.keys = { lean: 0, duck: 0, block: 0, punch: null, punchT: 0, step: 0, moving: 0 };
cpu.ai = { wait: 1.5, action: null, t: 0, hitsTaken: 0, blockT: 0, step: 0, moving: 0 };

// ---------- Game state ----------
let state = 'menu';   // menu | fight | over
let clockLeft = ROUND_SECONDS;
let combo = 0, comboT = 0;
let lastKeyUse = -1e9;

function startFight() {
  you.hp = cpu.hp = MAX_HP;
  clockLeft = ROUND_SECONDS;
  combo = 0;
  cpu.ai.action = null; cpu.ai.wait = 1.6; cpu.ai.hitsTaken = 0; cpu.ai.blockT = 0;
  cpu.x = 0.95; cpu.z = 0;
  state = 'fight';
  $('menu').classList.add('hidden');
  audio();
  bell();
  banner('FIGHT!', '#ffd23f', 1100);
}

function endFight(winner, reason) {
  state = 'over';
  bell(); setTimeout(bell, 250); setTimeout(bell, 500);
  crowd.cheer = 3;
  banner(winner === 'you' ? 'YOU WIN!' : 'CPU WINS', TEAM[winner].css, 1e9, reason + ' · raise both hands or press R for another round');
}

function landOnCpu(hand, where, counter) {
  if (cpu.blocking) { cpu.hp -= DAMAGE.you.blocked; clack(); banner('BLOCKED', '#9fb0d8', 500); combo = 0; }
  else {
    const dmg = DAMAGE.you[where] * (counter ? DAMAGE.you.counter : 1);
    cpu.hp -= dmg;
    cpu.hurtT = 0.38;
    cpu.ai.action = null; cpu.ai.wait = rand(0.5, 1.0);   // a clean hit breaks whatever it was doing
    cpu.ai.hitsTaken++;
    combo++; comboT = 1.6;
    thud(where === 'head');
    crowd.cheer = Math.max(crowd.cheer, 0.8);
    burst(hand, 0xffffff);
    if (counter) banner('COUNTER!', '#ffd23f', 700);
    else if (combo >= 3) banner(`${combo} HIT COMBO`, '#ffd23f', 600);
    // after taking a few in a row the CPU covers up for a moment
    if (cpu.ai.hitsTaken >= 2 && Math.random() < 0.55) { cpu.ai.blockT = rand(0.8, 1.4); cpu.ai.hitsTaken = 0; }
  }
  cpu.hp = Math.max(0, cpu.hp);
  if (cpu.hp <= 0) endFight('you', 'KNOCKOUT');
}

// a CPU punch arrives: did you block, slip or duck it?
function cpuPunchLands(name) {
  const headY = you.pts[HEAD].y;
  // a block is both gloves raised to the face, not the normal guard at the chin
  const guardUp = [HAND_L, HAND_R].every((i) => you.pts[i].y > headY - 0.15 && Math.abs(you.pts[i].z - you.pts[HEAD].z) < 0.4 && you.pts[i].x > you.pts[HEAD].x - 0.1);
  const guardLow = [HAND_L, HAND_R].some((i) => you.pts[i].y < headY - 0.4 && you.pts[i].y > headY - 0.9 && you.pts[i].x > you.pts[HEAD].x - 0.1);
  const slipped = Math.abs(you.lean) > 0.3;
  const ducked = you.duck > 0.45;
  let text = null, dmg = 0;
  if (name === 'hook') {
    if (ducked) text = 'DUCKED';
    else if (guardUp) { dmg = DAMAGE.cpu.blocked; text = 'BLOCKED'; }
    else dmg = DAMAGE.cpu.hook;
  } else if (name === 'body') {
    if (guardLow || (guardUp && you.duck > 0.2)) { dmg = DAMAGE.cpu.blocked; text = 'BLOCKED'; }
    else if (slipped) text = 'SLIPPED';
    else dmg = DAMAGE.cpu.body;
  } else {   // jab, cross
    if (slipped) text = 'SLIPPED';
    else if (guardUp) { dmg = DAMAGE.cpu.blocked; text = 'BLOCKED'; }
    else dmg = DAMAGE.cpu[name];
  }
  if (dmg > DAMAGE.cpu.blocked) {
    you.hp = Math.max(0, you.hp - dmg);
    you.hurtT = 0.4;
    shake = 0.35;
    combo = 0;
    thud(name !== 'body');
    $('flash').classList.add('hit');
    setTimeout(() => $('flash').classList.remove('hit'), 60);
    if (you.hp <= 0) endFight('cpu', 'KNOCKOUT');
  } else if (dmg) { you.hp = Math.max(0, you.hp - dmg); clack(); }
  if (text) banner(text, text === 'BLOCKED' ? '#9fb0d8' : '#22c55e', 500);
}

// ---------- The CPU boxer ----------
const CPU_ACTIONS = [['jab', 0.32], ['cross', 0.26], ['hook', 0.2], ['body', 0.22]];
const PUNCH_TIME = { windup: 0.3, strike: 0.13, recover: 0.32 };
function updateCpu(dt) {
  const ai = cpu.ai;
  // footwork: mirror your lateral position a little, hold the range
  const wantZ = clamp(you.z * 0.6, -1.4, 1.4);
  const wantX = clamp(you.x + 1.7 - (ai.action ? 0.35 : 0), 0.3, 1.5);   // steps in to throw
  const dz = wantZ - cpu.z, dx = wantX - cpu.x, dist = Math.hypot(dx, dz);
  const step = Math.min(dist, 1.6 * dt);
  if (dist > 1e-3) { cpu.z += (dz / dist) * step; cpu.x += (dx / dist) * step; }
  ai.moving = lerp(ai.moving, dist > 0.05 ? 1 : 0, 0.15);
  ai.step += dt * 10 * ai.moving;

  for (const k in cpu.w) cpu.w[k] = lerp(cpu.w[k], 0, 0.25);
  cpu.blocking = false;
  if (cpu.hurtT > 0) { cpu.hurtT -= dt; cpu.w.hurt = 1; return; }
  if (ai.blockT > 0) { ai.blockT -= dt; cpu.w.block = 1; cpu.blocking = true; return; }

  if (state !== 'fight') return;
  if (!ai.action) {
    ai.wait -= dt;
    if (ai.wait <= 0) {
      let r = Math.random(), pick = 'jab';
      for (const [name, p] of CPU_ACTIONS) { r -= p; if (r <= 0) { pick = name; break; } }
      // out of range: step in first
      if (cpu.x - you.x > 2.4) { ai.wait = 0.4; cpu.x -= 0.3; return; }
      ai.action = pick; ai.t = 0; ai.landed = false;
    }
    return;
  }
  ai.t += dt;
  const { windup, strike, recover } = PUNCH_TIME;
  const name = ai.action;
  if (ai.t < windup) cpu.w[name] = Math.max(cpu.w[name], (ai.t / windup) * 0.35);           // telegraph: the glove draws back
  else if (ai.t < windup + strike) {
    cpu.w[name] = 0.35 + ((ai.t - windup) / strike) * 0.65;
    if (!ai.landed && ai.t >= windup + strike * 0.7) { ai.landed = true; cpuPunchLands(name); }
  } else if (ai.t < windup + strike + recover) cpu.w[name] = 1 - (ai.t - windup - strike) / recover;
  else { ai.action = null; ai.wait = rand(CPU_MIN_WAIT, CPU_MAX_WAIT) * (you.hp < 35 ? 0.75 : 1); }
}

// ---------- Your punches (camera or keys): a fast hand toward the CPU that reaches it ----------
function updateYourHits(dt) {
  for (let h = 0; h < 2; h++) {
    you.cooldown[h] -= dt;
    if (you.cooldown[h] > 0 || state !== 'fight') continue;
    const hand = you.hands[h], vel = you.handVel[h];
    if (vel.x < PUNCH_SPEED) continue;                                   // toward +x, the CPU
    // Kinect style: a punch is an arm thrown out toward the screen at the CPU's height and side;
    // the webcam cannot judge depth well enough to ask for real contact
    if (hand.x < you.x + 0.55 || Math.abs(hand.z - cpu.z) > 0.6) continue;
    const headY = cpu.pts[HEAD].y;
    const where = hand.y > headY - 0.3 ? 'head' : hand.y > headY - 0.95 ? 'body' : null;
    if (!where) continue;
    you.cooldown[h] = HAND_COOLDOWN;
    const counter = !!cpu.ai.action && cpu.ai.t < PUNCH_TIME.windup;   // caught mid-windup
    landOnCpu(hand, where, counter);
  }
}

function updateYouFromKeys(dt, now) {
  const k = you.keys;
  you.lean = lerp(you.lean, k.lean, 0.25);
  you.duck = lerp(you.duck, k.duck, 0.25);
  you.z = lerp(you.z, k.lean * 0.4, 0.2);
  for (const n in you.w) you.w[n] = lerp(you.w[n], 0, 0.3);
  you.w.block = k.block;
  you.blocking = k.block > 0.5;
  if (you.hurtT > 0) { you.hurtT -= dt; you.w.hurt = 1; }
  if (k.punch) {
    k.punchT += dt;
    const { windup, strike, recover } = PUNCH_TIME;
    const n = k.punch;
    if (k.punchT < windup * 0.5) you.w[n] = (k.punchT / (windup * 0.5)) * 0.3;
    else if (k.punchT < windup * 0.5 + strike) you.w[n] = 0.3 + ((k.punchT - windup * 0.5) / strike) * 0.7;
    else if (k.punchT < windup * 0.5 + strike + recover) you.w[n] = 1 - (k.punchT - windup * 0.5 - strike) / recover;
    else k.punch = null;
  }
  boxerPose(you.pts, { x: you.x, z: you.z, d: -1, lean: you.lean, duck: you.duck, w: you.w, step: 0, moving: 0 });
  for (let h = 0; h < 2; h++) {
    you.prevHands[h].copy(you.hands[h]);
    you.hands[h].copy(you.pts[HAND_L + h]);
    you.handVel[h].subVectors(you.hands[h], you.prevHands[h]).divideScalar(Math.max(dt, 1 / 120));
  }
}

function updateGame(dt, now) {
  you.human = now - you.lastSeen < 1500;
  if (!you.human) updateYouFromKeys(dt, now);
  else if (you.hurtT > 0) you.hurtT -= dt;
  updateYourHits(dt);
  updateCpu(dt);
  boxerPose(cpu.pts, { x: cpu.x, z: cpu.z, d: 1, lean: 0, duck: 0, w: cpu.w, step: cpu.ai.step, moving: cpu.ai.moving });
  you.avatar.update(you.pts);
  cpu.avatar.update(cpu.pts);
  cpu.avatar.gloveMat.emissiveIntensity = cpu.ai.action && cpu.ai.t < PUNCH_TIME.windup ? 1.4 : 0.35;   // the telegraph glows

  if (state === 'fight') {
    clockLeft -= dt;
    if (clockLeft <= 0) {
      clockLeft = 0;
      if (you.hp === cpu.hp) endFight('you', 'DRAW, YOURS ON HEART');
      else endFight(you.hp > cpu.hp ? 'you' : 'cpu', 'ON POINTS');
    }
  }
  comboT -= dt;
  if (comboT <= 0) combo = 0;

  // raise both hands to start / restart
  if (state !== 'fight') {
    $('raise').firstElementChild.style.width = `${clamp(you.raiseT / 1.0, 0, 1) * 100}%`;
    if (you.raiseT >= 1.0) { you.raiseT = 0; startFight(); }
  }
}

// ---------- Body tracking ----------
const video = $('video');
const pip = $('pip'), pctx = pip.getContext('2d');
let landmarker = null, lastVideoTime = -1, lastDetect = 0;
const PIP_LINES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];

function status(text, err = false) {
  const el = $('status');
  el.textContent = text;
  el.classList.toggle('err', err);
}

async function initTracking() {
  try {
    status('Starting camera…');
    video.srcObject = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false });
    await video.play();
  } catch (e) {
    status('Camera blocked — you can still fight with the keys (J/K punch, A/D lean, S duck, B block).', true);
    return;
  }
  status('Loading body tracking…');
  const fileset = await FilesetResolver.forVisionTasks('./vendor/tasks-vision/wasm');
  const opts = (delegate) => ({
    baseOptions: { modelAssetPath: './vendor/pose_landmarker.task', delegate },
    runningMode: 'VIDEO', numPoses: 1,
    minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
  });
  try { landmarker = await PoseLandmarker.createFromOptions(fileset, opts('GPU')); }
  catch { landmarker = await PoseLandmarker.createFromOptions(fileset, opts('CPU')); }
  status('Ready! Step in front of the camera.');
}

const tmpRoot = new V3();
function updateHuman(lms, world, mx, ddt, now) {
  const p = you;
  if (!p.human) banner('YOU ARE IN', TEAM.you.css, 900);
  p.human = true;
  p.lastSeen = now;
  const sw = Math.abs(lms[11].x - lms[12].x);   // wider shoulders = closer to the webcam = further from the CPU
  const tz = mapRange(mx, 0.12, 0.88, -1.3, 1.3);
  const tx = mapRange(sw, 0.08, 0.32, -0.45, -1.7);
  p.z = p.fresh ? tz : lerp(p.z, tz, 0.35);
  p.x = p.fresh ? tx : lerp(p.x, tx, 0.2);
  p.lean = lerp(p.lean, clamp((mx - 0.5) * 3, -1, 1), 0.3);   // off-centre = slipping

  const sy = (lms[11].y + lms[12].y) / 2;
  p.baseY = p.baseY === null ? sy : lerp(p.baseY, Math.min(p.baseY + 0.002, sy), 0.02);   // settles on your standing height
  p.duck = lerp(p.duck, clamp((sy - p.baseY) * 6, 0, 1), 0.4);

  const handsUp = lms[15].y < lms[0].y && lms[16].y < lms[0].y;
  p.raiseT = handsUp ? p.raiseT + ddt : 0;

  tmpRoot.set(p.x, 0, p.z);
  const raw = world.map((w) => new V3(-w.z, -w.y, -w.x).multiplyScalar(BODY_SCALE).add(tmpRoot));   // seen from behind: facing +x, your right on the right
  const lift = 0.09 - Math.min(raw[27].y, raw[28].y);
  for (let i = 0; i < 33; i++) {
    raw[i].y += lift;
    if (p.fresh) p.pts[i].copy(raw[i]); else p.pts[i].lerp(raw[i], 0.6);
  }
  computeExtras(p.pts, -1);
  for (let h = 0; h < 2; h++) {
    p.prevHands[h].copy(p.fresh ? p.pts[HAND_L + h] : p.hands[h]);
    p.hands[h].copy(p.pts[HAND_L + h]);
    p.handVel[h].subVectors(p.hands[h], p.prevHands[h]).divideScalar(ddt);
  }
  p.blocking = [HAND_L, HAND_R].every((i) => p.pts[i].y > p.pts[HEAD].y - 0.15);
  p.fresh = false;
}

function detect(now) {
  if (!landmarker || video.readyState < 2 || video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;
  const res = landmarker.detectForVideo(video, now);
  const ddt = clamp((now - lastDetect) / 1000, 1 / 120, 0.2);
  lastDetect = now;
  let seen = null;
  res.landmarks.forEach((lms, i) => {
    if (seen) return;
    if (Math.min(lms[0].visibility, lms[11].visibility, lms[12].visibility) < 0.7) return;
    if (Math.abs(lms[11].x - lms[12].x) < 0.05) return;
    seen = lms;
    updateHuman(lms, res.worldLandmarks[i], 1 - (lms[11].x + lms[12].x) / 2, ddt, now);
  });
  if (pip.style.display === 'none') return;
  const W = pip.width, H = pip.height;
  pctx.save(); pctx.translate(W, 0); pctx.scale(-1, 1); pctx.drawImage(video, 0, 0, W, H); pctx.restore();
  if (seen) {
    pctx.strokeStyle = TEAM.you.css; pctx.lineWidth = 3;
    for (const [a, b] of PIP_LINES) {
      pctx.beginPath();
      pctx.moveTo((1 - seen[a].x) * W, seen[a].y * H);
      pctx.lineTo((1 - seen[b].x) * W, seen[b].y * H);
      pctx.stroke();
    }
  }
}

// ---------- Sound ----------
let actx = null;
function audio() {
  try {
    if (!actx) actx = new AudioContext();
    if (actx.state === 'suspended') actx.resume();
  } catch { /* no audio */ }
}
function tone(f, dur, type = 'sine', vol = 0.2, f2 = null, delay = 0) {
  if (!actx) return;
  const t = actx.currentTime + delay;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(actx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}
const thud = (head) => { tone(head ? 160 : 110, 0.16, 'triangle', 0.6, 60); tone(1200, 0.03, 'square', 0.06); };
const clack = () => tone(700, 0.08, 'square', 0.12, 300);
const bell = () => { tone(1800, 0.6, 'sine', 0.25); tone(2400, 0.5, 'sine', 0.12); };

// ---------- HUD ----------
let bannerTimer = 0;
function banner(text, color, ms, sub = '') {
  const el = $('banner');
  el.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`;
  el.style.color = color;
  el.classList.add('show');
  clearTimeout(bannerTimer);
  if (ms < 1e8) bannerTimer = setTimeout(() => el.classList.remove('show'), ms);
}
function updateHud() {
  $('youPts').textContent = Math.round(you.hp);
  $('cpuPts').textContent = Math.round(cpu.hp);
  $('youBar').style.width = `${(you.hp / MAX_HP) * 100}%`;
  $('cpuBar').style.width = `${(cpu.hp / MAX_HP) * 100}%`;
  const s = Math.ceil(clockLeft);
  $('clock').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  $('combo').textContent = combo >= 2 && state === 'fight' ? `×${combo}` : '';
}

// ---------- Input ----------
$('start').addEventListener('click', startFight);
addEventListener('pointerdown', audio);
const keyLean = { KeyA: -1, KeyD: 1 };
addEventListener('keydown', (e) => {
  audio();
  const k = you.keys;
  if (e.repeat && e.code !== 'KeyJ' && e.code !== 'KeyK') return;
  if (e.code === 'KeyR' || (e.code === 'Enter' && state !== 'fight')) startFight();
  else if (e.code === 'KeyC') pip.style.display = pip.style.display === 'none' ? '' : 'none';
  else if (keyLean[e.code]) k.lean = keyLean[e.code];
  else if (e.code === 'KeyS') k.duck = 1;
  else if (e.code === 'KeyB') k.block = 1;
  else if ((e.code === 'KeyJ' || e.code === 'KeyK') && !k.punch) {
    // J: left hand (jab high, body low while ducking); K: right hand (cross, hook while leaning)
    k.punch = e.code === 'KeyJ' ? (k.duck ? 'body' : 'jab') : (k.lean ? 'hook' : 'cross');
    k.punchT = 0;
  }
  lastKeyUse = performance.now();
});
addEventListener('keyup', (e) => {
  const k = you.keys;
  if (keyLean[e.code] && k.lean === keyLean[e.code]) k.lean = 0;
  else if (e.code === 'KeyS') k.duck = 0;
  else if (e.code === 'KeyB') k.block = 0;
});
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = camera.aspect < 1.3 ? 64 : 50;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---------- Loop ----------
const clock = new THREE.Clock();
const crowdM = new THREE.Matrix4();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  const now = performance.now();
  detect(now);
  updateGame(dt, now);

  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i];
    b.t += dt;
    b.mesh.scale.setScalar(1 + b.t * 7);
    b.mesh.material.opacity = 1 - b.t / 0.3;
    if (b.t > 0.3) { scene.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.material.dispose(); bursts.splice(i, 1); }
  }
  crowd.cheer = Math.max(0, crowd.cheer - dt);
  crowd.base.forEach(([x, y, z, ph], i) => {
    const hop = crowd.cheer > 0 ? Math.abs(Math.sin(now / 110 + ph)) * 0.3 : Math.sin(now / 700 + ph) * 0.03;
    crowdM.makeTranslation(x, y + hop, z);
    crowd.mesh.setMatrixAt(i, crowdM);
  });
  crowd.mesh.instanceMatrix.needsUpdate = true;

  // the camera rides behind you, and shudders when you get hit
  shake = Math.max(0, shake - dt);
  camera.position.x = lerp(camera.position.x, CAM_HOME.x + you.x * 0.5, 0.05);
  camera.position.z = lerp(camera.position.z, CAM_HOME.z + you.z * 0.6 + (shake ? Math.sin(now / 18) * shake * 0.25 : 0), 0.1);
  camera.position.y = CAM_HOME.y - you.duck * 0.25 + (shake ? Math.cos(now / 23) * shake * 0.15 : 0);
  camTarget.set(cpu.x - 0.3, 1.25, cpu.z * 0.5 - 0.1);
  camera.lookAt(camTarget);
  updateHud();
  renderer.render(scene, camera);
}
// what a test can look at
window.boxing = { you, cpu, get state() { return state; }, get clock() { return clockLeft; }, startFight };
loop();
initTracking().catch((e) => status(`Body tracking failed: ${e.message}`, true));
