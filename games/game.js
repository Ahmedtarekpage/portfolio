// Camera Volley 3D - Kinect-style volleyball. Your body drives a 3D avatar.
// The view is the Xbox one: the camera stands behind your side of the court
// and looks over the net. Step left and right and the avatar runs along the
// net; step back from your webcam and it backs away from the net.
import * as THREE from './vendor/three.module.js';
import { PoseLandmarker, FilesetResolver } from './vendor/tasks-vision/vision_bundle.mjs';

// ---------- Tuning ----------
const COURT_X = 8;           // half length (net at x = 0)
const COURT_Z = 4.5;         // half width
const NET_H = 2.43;
const BALL_R = 0.28;
const G = 7.0;               // gravity (lower = floatier, easier)
const HIT_REACH = 0.8;       // how close a hand must be to the ball
const Z_FORGIVE = 0.45;      // depth errors count this much (camera depth is rough)
const HIT_COOLDOWN = 0.45;
const BODY_SCALE = 1.1;
const CPU_SKILL = 0.82;      // chance the CPU returns the ball
const CPU_SPEED = 5.0;       // m/s
const WIN_SCORE = 7;
const SERVE_DELAY = 2.2;

const TEAM = {
  left: { name: 'BLUE', color: 0x2f80ff, css: '#2f80ff' },
  right: { name: 'RED', color: 0xff3b3b, css: '#ff3b3b' },
};
const SIDES = ['left', 'right'];
const other = (s) => (s === 'left' ? 'right' : 'left');
const dirOf = (s) => (s === 'left' ? -1 : 1);

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
scene.background = new THREE.Color(0x0a1022);
scene.fog = new THREE.Fog(0x0a1022, 36, 75);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
camera.position.set(-15.5, 7.4, 0);     // behind the blue (near) side, looking over the net
const camTarget = new V3(1.8, 1.0, 0);

scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x2a1d1d, 0.75));
const sun = new THREE.DirectionalLight(0xffffff, 2.0);
sun.position.set(4, 15, 9);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 10, bottom: -10, near: 1, far: 40 });
scene.add(sun);
const rim = new THREE.DirectionalLight(0x88aaff, 0.6);
rim.position.set(-6, 8, -10);
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

// Court floor: 18 x 11 m, 100 px per metre
{
  const [c, g] = makeCanvas(1800, 1100);
  g.fillStyle = '#1f6f8b'; g.fillRect(0, 0, 1800, 1100);
  g.fillStyle = '#e07a3f'; g.fillRect(100, 100, 1600, 900);
  g.globalAlpha = 0.07;
  for (let y = 100; y < 1000; y += 30) { g.fillStyle = (y / 30) % 2 ? '#fff' : '#000'; g.fillRect(100, y, 1600, 15); }
  g.globalAlpha = 1;
  g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(600, 100, 600, 900);
  g.strokeStyle = '#fff'; g.lineWidth = 8;
  g.strokeRect(100, 100, 1600, 900);
  for (const x of [900, 600, 1200]) { g.beginPath(); g.moveTo(x, 100); g.lineTo(x, 1000); g.stroke(); }
  const court = new THREE.Mesh(new THREE.PlaneGeometry(18, 11),
    new THREE.MeshStandardMaterial({ map: canvasTexture(c), roughness: 0.55, metalness: 0.05 }));
  court.rotation.x = -Math.PI / 2;
  court.receiveShadow = true;
  scene.add(court);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 50), new THREE.MeshStandardMaterial({ color: 0x132a40, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.01;
  floor.receiveShadow = true;
  scene.add(floor);
}

// Net, posts, antennas
{
  const [c, g] = makeCanvas(980, 100);
  g.strokeStyle = 'rgba(15,15,20,.9)'; g.lineWidth = 2;
  for (let x = 0; x <= 980; x += 10) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 100); g.stroke(); }
  for (let y = 0; y <= 100; y += 10) { g.beginPath(); g.moveTo(0, y); g.lineTo(980, y); g.stroke(); }
  g.fillStyle = '#fff'; g.fillRect(0, 0, 980, 7); g.fillRect(0, 95, 980, 5);
  const net = new THREE.Mesh(new THREE.PlaneGeometry(9.8, 1.0),
    new THREE.MeshStandardMaterial({ map: canvasTexture(c), transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  net.rotation.y = Math.PI / 2;
  net.position.set(0, NET_H - 0.5, 0);
  scene.add(net);

  const postMat = new THREE.MeshStandardMaterial({ color: 0xdfe6f0, metalness: 0.6, roughness: 0.3 });
  for (const z of [-5.2, 5.2]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.7, 16), postMat);
    post.position.set(0, 1.35, z);
    post.castShadow = true;
    scene.add(post);
  }
  const [ac, ag] = makeCanvas(8, 64);
  for (let i = 0; i < 8; i++) { ag.fillStyle = i % 2 ? '#fff' : '#e11'; ag.fillRect(0, i * 8, 8, 8); }
  for (const z of [-4.5, 4.5]) {
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.8, 8), new THREE.MeshStandardMaterial({ map: canvasTexture(ac) }));
    ant.position.set(0, NET_H + 0.4, z);
    scene.add(ant);
  }
  const cord = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 10.4), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x666666 }));
  cord.position.set(0, NET_H, 0);
  scene.add(cord);
}

// Advertising boards and stands with a crowd, along the far baseline
const crowd = { mesh: null, base: [], cheer: 0 };
const stage = new THREE.Group();
stage.rotation.y = -Math.PI / 2;        // built along -z, turned to sit at +x, facing the camera
scene.add(stage);
{
  const [c, g] = makeCanvas(2048, 128);
  const grad = g.createLinearGradient(0, 0, 2048, 0);
  grad.addColorStop(0, '#0f3d8c'); grad.addColorStop(0.5, '#141a33'); grad.addColorStop(1, '#8c1010');
  g.fillStyle = grad; g.fillRect(0, 0, 2048, 128);
  g.font = 'italic 900 64px system-ui, sans-serif'; g.fillStyle = '#fff'; g.textBaseline = 'middle';
  for (let x = 40; x < 2048; x += 680) g.fillText('CAMERA VOLLEY 3D', x, 66);
  const board = new THREE.Mesh(new THREE.BoxGeometry(24, 0.9, 0.15),
    new THREE.MeshStandardMaterial({ map: canvasTexture(c), emissive: 0xffffff, emissiveMap: canvasTexture(c), emissiveIntensity: 0.35 }));
  board.position.set(0, 0.45, -9.4);
  stage.add(board);

  const standMat = new THREE.MeshStandardMaterial({ color: 0x1c2440, roughness: 0.8 });
  const rows = 5, perRow = 46;
  const people = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.2, 0.35, 4, 8), new THREE.MeshStandardMaterial({ roughness: 0.7 }), rows * perRow);
  const m = new THREE.Matrix4();
  const palette = [0x2f80ff, 0xff3b3b, 0xffd23f, 0xffffff, 0x22c55e, 0xff8a3d, 0x9b5de5];
  let k = 0;
  for (let r = 0; r < rows; r++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(34, 0.7, 1.3), standMat);
    step.position.set(0, 0.35 + r * 0.7, -10.4 - r * 1.3);
    step.receiveShadow = true;
    stage.add(step);
    for (let i = 0; i < perRow; i++) {
      const x = -16 + i * (32 / perRow) + rand(-0.15, 0.15);
      const y = 0.7 + r * 0.7 + 0.38;
      const z = -10.4 - r * 1.3;
      crowd.base.push([x, y, z, rand(0, Math.PI * 2)]);
      m.makeTranslation(x, y, z);
      people.setMatrixAt(k, m);
      people.setColorAt(k, new THREE.Color(palette[(Math.random() * palette.length) | 0]));
      k++;
    }
  }
  crowd.mesh = people;
  stage.add(people);

  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff6dd });
  for (const x of [-12, -4, 4, 12]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.15, 0.8), lampMat);
    lamp.position.set(x, 14, -4);
    stage.add(lamp);
  }
}

// Ball
const ballTex = (() => {
  const [c, g] = makeCanvas(512, 256);
  g.fillStyle = '#f7f7f2'; g.fillRect(0, 0, 512, 256);
  for (const [col, v] of [['#ffd23f', 0.1], ['#1e5bd6', 0.42], ['#ffd23f', 0.74]]) {
    g.fillStyle = col;
    g.beginPath();
    for (let x = 0; x <= 512; x += 8) g.lineTo(x, v * 256 + 16 * Math.sin((x / 512) * Math.PI * 4));
    for (let x = 512; x >= 0; x -= 8) g.lineTo(x, v * 256 + 40 + 16 * Math.sin((x / 512) * Math.PI * 4));
    g.fill();
  }
  return canvasTexture(c);
})();
const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 32, 24), new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.45 }));
ballMesh.castShadow = true;
scene.add(ballMesh);

const marker = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.5, 40),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
marker.rotation.x = -Math.PI / 2;
scene.add(marker);

// Hit burst rings
const bursts = [];
function burst(pos, color) {
  const mesh = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.4, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  mesh.position.copy(pos);
  mesh.lookAt(camera.position);
  scene.add(mesh);
  bursts.push({ mesh, t: 0 });
}

// ---------- Avatars ----------
// Extra point slots after MediaPipe's 33 landmarks
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
  s.scale.set(0.95, 0.36, 1);
  return s;
}

class Avatar {
  constructor(side) {
    const team = TEAM[side];
    this.group = new THREE.Group();
    scene.add(this.group);
    const jersey = new THREE.MeshStandardMaterial({ color: team.color, roughness: 0.55 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xe8b98f, roughness: 0.7 });
    const shorts = new THREE.MeshStandardMaterial({ color: 0x1b2133, roughness: 0.7 });
    const shoes = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 });
    const glow = new THREE.MeshStandardMaterial({ color: team.color, emissive: team.color, emissiveIntensity: 1.6 });
    this.glowMat = new THREE.MeshBasicMaterial({ color: team.color, transparent: true, opacity: 0.25, depthWrite: false });

    this.bones = [
      [MS, MH, [0.2, 0.13], jersey],
      [11, 12, 0.095, jersey], [23, 24, 0.11, shorts],
      [11, 13, 0.08, jersey], [12, 14, 0.08, jersey],
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
      [11, 0.095, jersey], [12, 0.095, jersey], [13, 0.075, skin], [14, 0.075, skin],
      [25, 0.1, skin], [26, 0.1, skin], [27, 0.1, shoes], [28, 0.1, shoes],
      [HEAD, 0.15, skin], [HAND_L, 0.1, glow], [HAND_R, 0.1, glow],
    ].map(([i, r, mat]) => {
      const mesh = new THREE.Mesh(sphGeo, mat);
      mesh.scale.setScalar(r);
      mesh.castShadow = true;
      this.group.add(mesh);
      return { i, mesh };
    });
    this.halos = [HAND_L, HAND_R].map((i) => {
      const mesh = new THREE.Mesh(sphGeo, this.glowMat);
      mesh.scale.setScalar(0.3);
      this.group.add(mesh);
      return { i, mesh };
    });
    this.labels = { you: makeLabel(side === 'left' ? 'P1' : 'P2', team.css), cpu: makeLabel('CPU', '#3a4466') };
    this.group.add(this.labels.you, this.labels.cpu);
  }

  update(pts, human) {
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
    for (const { i, mesh } of this.halos) mesh.position.copy(pts[i]);
    this.labels.you.visible = human;
    this.labels.cpu.visible = !human;
    const label = human ? this.labels.you : this.labels.cpu;
    label.position.copy(pts[HEAD]).add(tmpV.set(0, 0.55, 0));
  }
}

function computeExtras(p, d) {
  p[MS].addVectors(p[11], p[12]).multiplyScalar(0.5);
  p[MH].addVectors(p[23], p[24]).multiplyScalar(0.5);
  p[HEAD].copy(p[0]).add(tmpV.set(d * 0.08, 0.05, 0));   // the skull sits behind the nose, away from the net
  p[HAND_L].addVectors(p[15], p[19]).multiplyScalar(0.5);
  p[HAND_R].addVectors(p[16], p[20]).multiplyScalar(0.5);
}

// CPU body: offsets in metres from hip centre, built facing +z and turned to face the net
const CPU_BODY = { 0: [0, 0.68, 0.1], 11: [-0.2, 0.5, 0], 12: [0.2, 0.5, 0], 23: [-0.12, 0, 0], 24: [0.12, 0, 0],
  25: [-0.13, -0.47, 0.04], 26: [0.13, -0.47, 0.04], 27: [-0.14, -0.92, 0], 28: [0.14, -0.92, 0] };
const ARMS_DOWN = { 13: [-0.26, 0.22, 0.04], 14: [0.26, 0.22, 0.04], 15: [-0.28, -0.04, 0.12], 16: [0.28, -0.04, 0.12],
  19: [-0.28, -0.12, 0.16], 20: [0.28, -0.12, 0.16] };
const ARMS_UP = { 13: [-0.28, 0.78, 0.08], 14: [0.28, 0.78, 0.08], 15: [-0.22, 1.05, 0.12], 16: [0.22, 1.05, 0.12],
  19: [-0.2, 1.14, 0.12], 20: [0.2, 1.14, 0.12] };
const CPU_HIP_H = 0.92 * BODY_SCALE + 0.09;

function cpuPose(p) {
  const c = p.cpu;
  const root = new V3(c.x, CPU_HIP_H + c.jump, c.z);
  const d = dirOf(p.side);
  const set = (i, [x, y, z]) => p.pts[i].set(-d * z, y, d * x).multiplyScalar(BODY_SCALE).add(root);
  for (const i in CPU_BODY) set(+i, CPU_BODY[i]);
  for (const i in ARMS_UP) {
    const a = ARMS_DOWN[i], b = ARMS_UP[i];
    set(+i, [lerp(a[0], b[0], c.arms), lerp(a[1], b[1], c.arms), lerp(a[2], b[2], c.arms)]);
  }
  // Running legs
  const swing = Math.sin(c.step) * 0.16 * c.moving;
  p.pts[25].x += swing; p.pts[27].x += swing * 1.6;
  p.pts[26].x -= swing; p.pts[28].x -= swing * 1.6;
  computeExtras(p.pts, d);
}

// ---------- Players ----------
function makePlayer(side) {
  const d = dirOf(side);
  return {
    side, human: false, solo: false, lastSeen: -1e9,
    rootX: d * 4.5, rootZ: 0, jump: 0, baseY: null, raiseT: 0,
    pts: Array.from({ length: NPTS }, () => new V3()), fresh: true,
    hands: [new V3(), new V3()], prevHands: [new V3(), new V3()], handVel: [new V3(), new V3()],
    cooldown: 0,
    cpu: { x: d * 4.5, z: 0, arms: 0, step: 0, moving: 0, jump: 0, jumpT: 0, willHit: true, missOff: 0 },
    avatar: new Avatar(side),
  };
}
const players = { left: makePlayer('left'), right: makePlayer('right') };

// ---------- Game state ----------
const ball = { pos: new V3(0, 3, 0), vel: new V3(), inPlay: false };
const score = { left: 0, right: 0 };
let state = 'serve', stateT = SERVE_DELAY, server = 'left', lastHitter = null, rally = 0;
let demo = true;   // attract mode behind the menu

function startGame() {
  demo = false;
  score.left = score.right = 0;
  $('menu').classList.add('hidden');
  audio();
  whistle();
  startServe(Math.random() < 0.5 ? 'left' : 'right');
}

function startServe(side) {
  state = 'serve';
  stateT = SERVE_DELAY;
  server = side;
  lastHitter = null;
  rally = 0;
  ball.inPlay = false;
  ball.vel.set(0, 0, 0);
  players[side].cpu.willHit = true;
  players[side].cpu.missOff = 0;
  if (!demo) banner(`${TEAM[side].name} SERVES`, TEAM[side].css, 1600, players[side].human ? 'hit the ball when it drops' : '');
}

function point(scorer, reason) {
  score[scorer]++;
  server = scorer;
  state = 'point';
  stateT = 1.9;
  ball.inPlay = false;
  ball.vel.set(ball.vel.x * 0.3, Math.abs(ball.vel.y) * 0.35, ball.vel.z * 0.3);
  crowd.cheer = 1.6;
  whistle();
  if (!demo) banner(reason || `POINT ${TEAM[scorer].name}!`, TEAM[scorer].css, 1500,
    reason ? `point ${TEAM[scorer].name}` : (rally > 2 ? `${rally} hit rally` : ''));
}

function timeToHeight(y, vy, h) {
  const disc = vy * vy - 2 * G * (h - y);
  if (disc < 0) return null;
  const t = (vy + Math.sqrt(disc)) / G;
  return t > 0 ? t : null;
}

function hitBall(side, handVel) {
  const p = players[side];
  const opp = other(side), op = players[opp], od = dirOf(opp);
  let tx, tz;
  if (op.human) {   // land near the other human so rallies are possible
    tx = op.rootX + rand(-1.3, 1.3);
    tz = op.rootZ + rand(-0.8, 0.8);
  } else {
    tx = od * rand(2, 7);
    tz = rand(-3.6, 3.6);
  }
  tx = od * clamp(Math.abs(tx), 1.6, 7.3);
  tz = clamp(tz, -3.9, 3.9);

  ball.pos.y = Math.max(ball.pos.y, 0.5);
  let vy = 7 + clamp(handVel.y * 0.12, 0, 2.5) + rand(-0.4, 0.4);
  let vx = 0, vz = 0;
  for (let i = 0; i < 25; i++) {   // raise the arc until it clears the net
    const T = timeToHeight(ball.pos.y, vy, BALL_R);
    vx = (tx - ball.pos.x) / T;
    vz = (tz - ball.pos.z) / T;
    const tn = -ball.pos.x / vx;
    const yn = ball.pos.y + vy * tn - 0.5 * G * tn * tn;
    if (!(tn > 0 && tn < T) || yn > NET_H + BALL_R + 0.35) break;
    vy += 0.5;
  }
  ball.vel.set(vx, vy, vz);
  ball.inPlay = true;
  if (state === 'serve') state = 'play';
  lastHitter = side;
  rally++;
  p.cooldown = HIT_COOLDOWN;
  op.cpu.willHit = Math.random() < CPU_SKILL;
  op.cpu.missOff = op.cpu.willHit ? 0 : (Math.random() < 0.5 ? -1 : 1) * rand(1.4, 2.0);
  burst(ball.pos, TEAM[side].color);
  thump();
  $('rally').textContent = rally >= 3 && !demo ? `RALLY ×${rally}` : '';
}

// Distance from point p to segment a-b with depth errors scaled down. The webcam's
// depth is the court's length (x), so that is the forgiving axis.
function forgivingDist(p, a, b) {
  const ax = a.x * Z_FORGIVE, ay = a.y, az = a.z;
  const dx = b.x * Z_FORGIVE - ax, dy = b.y - ay, dz = b.z - az;
  const px = p.x * Z_FORGIVE - ax, py = p.y - ay, pz = p.z - az;
  const len2 = dx * dx + dy * dy + dz * dz;
  const t = len2 > 0 ? clamp((px * dx + py * dy + pz * dz) / len2, 0, 1) : 0;
  return Math.hypot(px - t * dx, py - t * dy, pz - t * dz);
}

const onSide = (side) => (side === 'left' ? ball.pos.x < 0.8 : ball.pos.x > -0.8);

function updateCpu(p, dt) {
  const c = p.cpu, d = dirOf(p.side);
  let tx = d * 4.8, tz = 0;
  const live = state === 'play' && ball.inPlay;
  const incoming = live && (onSide(p.side) || ball.vel.x * d > 0);
  if (state === 'serve' && server === p.side) { tx = c.x; tz = c.z; }
  if (incoming) {
    const t = timeToHeight(ball.pos.y, ball.vel.y, 2.3) ?? timeToHeight(ball.pos.y, ball.vel.y, BALL_R) ?? 0;
    tx = ball.pos.x + ball.vel.x * t + c.missOff;
    tz = ball.pos.z + ball.vel.z * t;
    tx = d < 0 ? clamp(tx, -7.8, -0.6) : clamp(tx, 0.6, 7.8);
    tz = clamp(tz, -4.2, 4.2);
  }
  const dx = tx - c.x, dz = tz - c.z, dist = Math.hypot(dx, dz);
  const step = Math.min(dist, CPU_SPEED * dt);
  if (dist > 1e-3) { c.x += (dx / dist) * step; c.z += (dz / dist) * step; }
  c.moving = lerp(c.moving, dist > 0.15 ? 1 : 0, 0.15);
  c.step += dt * 12 * c.moving;
  const near = (incoming || (state === 'serve' && server === p.side)) && ball.pos.distanceTo(tmpV.set(c.x, 2, c.z)) < 4;
  c.arms = lerp(c.arms, near ? 1 : 0, 0.12);
  if (c.jumpT > 0) { c.jumpT -= dt; c.jump = Math.sin(clamp(1 - c.jumpT / 0.45, 0, 1) * Math.PI) * 0.4; } else c.jump = 0;

  cpuPose(p);
  const hand = tmpV.addVectors(p.pts[HAND_L], p.pts[HAND_R]).multiplyScalar(0.5);
  if (ball.inPlay && p.cooldown <= 0 && c.willHit && onSide(p.side) && ball.pos.distanceTo(hand) < 0.9) {
    c.jumpT = 0.45;
    hitBall(p.side, new V3());
  }
}

function updateHumanHits(p) {
  if (p.cooldown > 0 || !onSide(p.side) || !(state === 'play' || (state === 'serve' && server === p.side))) return;
  for (let h = 0; h < 2; h++) {
    if (forgivingDist(ball.pos, p.prevHands[h], p.hands[h]) < HIT_REACH) {
      hitBall(p.side, p.handVel[h]);
      return;
    }
  }
}

function updateGame(dt, now) {
  for (const side of SIDES) {
    const p = players[side];
    const wasHuman = p.human;
    p.human = now - p.lastSeen < 1500;
    if (wasHuman && !p.human) { p.cpu.x = p.rootX; p.cpu.z = p.rootZ; p.fresh = true; }
    if (!p.human) { p.rootX = p.cpu.x; p.rootZ = p.cpu.z; }
    p.cooldown -= dt;
  }

  if (state === 'serve') {
    const p = players[server];
    const sx = p.human ? p.rootX : p.cpu.x, sz = p.human ? p.rootZ : p.cpu.z;
    ball.pos.set(sx - dirOf(server) * 0.45, 3.0, sz);
    stateT -= dt;
    if (stateT <= 0) { state = 'play'; ball.inPlay = true; ball.vel.set(0, 1.2, 0); }
  } else if (state === 'play' && ball.inPlay) {
    const prevX = ball.pos.x;
    ball.vel.y -= G * dt;
    ball.pos.addScaledVector(ball.vel, dt);
    const crossing = Math.sign(prevX) !== Math.sign(ball.pos.x) || Math.abs(ball.pos.x) < BALL_R;
    if (crossing && Math.abs(ball.pos.z) < 5.2) {
      if (ball.pos.y < NET_H) {            // into the net: drop back
        const s = Math.sign(prevX) || 1;
        ball.pos.x = s * (BALL_R + 0.03);
        ball.vel.x = s * Math.abs(ball.vel.x) * 0.25;
        ball.vel.z *= 0.5;
        netSound();
      } else if (ball.pos.y - BALL_R < NET_H && ball.vel.y < 0) {
        ball.vel.y = Math.abs(ball.vel.y) * 0.45;   // clipped the tape
        netSound();
      }
    }
    if (ball.pos.y <= BALL_R) {
      ball.pos.y = BALL_R;
      const landed = ball.pos.x < 0 ? 'left' : 'right';
      const out = Math.abs(ball.pos.x) > COURT_X + 0.15 || Math.abs(ball.pos.z) > COURT_Z + 0.15;
      if (out && lastHitter) point(other(lastHitter), 'OUT!');
      else point(other(landed));
    }
  } else if (state === 'point') {
    ball.vel.y -= G * dt;
    ball.pos.addScaledVector(ball.vel, dt);
    if (ball.pos.y < BALL_R) { ball.pos.y = BALL_R; ball.vel.y = Math.abs(ball.vel.y) * 0.45; ball.vel.x *= 0.8; ball.vel.z *= 0.8; }
    stateT -= dt;
    if (stateT <= 0) {
      const winner = SIDES.find((s) => score[s] >= WIN_SCORE);
      if (winner && demo) { score.left = score.right = 0; startServe(winner); }
      else if (winner) {
        state = 'over';
        banner(`${TEAM[winner].name} WINS!`, TEAM[winner].css, 1e9, 'raise both hands or press R to play again');
        fanfare();
      } else startServe(server);
    }
  }

  for (const side of SIDES) {
    const p = players[side];
    if (p.human) updateHumanHits(p);
    else updateCpu(p, dt);
    p.avatar.update(p.pts, p.human);
  }

  // Raise both hands to start / restart
  if (demo || state === 'over') {
    const best = Math.max(...SIDES.map((s) => (players[s].human ? players[s].raiseT : 0)));
    $('raise').firstElementChild.style.width = `${clamp(best / 1.0, 0, 1) * 100}%`;
    if (best >= 1.0) { SIDES.forEach((s) => (players[s].raiseT = 0)); startGame(); }
  }

  // Landing marker
  if (state === 'play' && ball.inPlay && ball.vel.y < 4) {
    const t = timeToHeight(ball.pos.y, ball.vel.y, 0.01);
    if (t) {
      marker.visible = true;
      marker.position.set(ball.pos.x + ball.vel.x * t, 0.02, ball.pos.z + ball.vel.z * t);
      marker.material.color.set(TEAM[marker.position.x < 0 ? 'left' : 'right'].color);
      marker.scale.setScalar(1 + 0.15 * Math.sin(now / 90));
    }
  } else marker.visible = false;
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
    status('Camera blocked. Allow camera access for this page and reload. (CPU demo is playing.)', true);
    return;
  }
  status('Loading body tracking…');
  const fileset = await FilesetResolver.forVisionTasks('./vendor/tasks-vision/wasm');
  const opts = (delegate) => ({
    baseOptions: { modelAssetPath: './vendor/pose_landmarker.task', delegate },
    runningMode: 'VIDEO', numPoses: 2,
    minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
  });
  try { landmarker = await PoseLandmarker.createFromOptions(fileset, opts('GPU')); }
  catch { landmarker = await PoseLandmarker.createFromOptions(fileset, opts('CPU')); }
  status('Ready! Step in front of the camera.');
}

const tmpRoot = new V3();
function updateHuman(p, lms, world, mx, ddt, now) {
  if (!p.human) banner(`${TEAM[p.side].name} PLAYER JOINED`, TEAM[p.side].css, 1200);
  p.human = true;
  p.lastSeen = now;

  // Xbox-style: left and right in front of the webcam is left and right on screen (along the
  // net, z); stepping toward the webcam is stepping back from the net (x), stepping away from
  // it is going up to the net. Alone, the whole webcam frame is yours; two players get a half each.
  const d = dirOf(p.side);
  const [a, b] = p.solo ? [0.08, 0.92] : (p.side === 'left' ? [0.04, 0.47] : [0.53, 0.96]);
  const sw = Math.abs(lms[11].x - lms[12].x);   // wider shoulders = closer to the webcam = further from the net
  const tz = mapRange(mx, a, b, -3.8, 3.8);
  const tx = p.side === 'left' ? mapRange(sw, 0.07, 0.3, -1.4, -7.2) : mapRange(sw, 0.07, 0.3, 1.4, 7.2);
  p.rootZ = p.fresh ? tz : lerp(p.rootZ, tz, 0.35);
  p.rootX = p.fresh ? tx : lerp(p.rootX, tx, 0.15);

  const sy = (lms[11].y + lms[12].y) / 2;       // shoulders moving up fast = jump
  p.baseY = p.baseY === null ? sy : lerp(p.baseY, sy, 0.02);
  p.jump = lerp(p.jump, clamp((p.baseY - sy) * 5, 0, 1.3), 0.5);

  const handsUp = lms[15].y < lms[0].y && lms[16].y < lms[0].y;
  p.raiseT = handsUp ? p.raiseT + ddt : 0;

  // World landmarks are metres around the hips. Seen from behind, your right hand is on the
  // right of the screen (mirror), and your front faces the net.
  tmpRoot.set(p.rootX, 0, p.rootZ);
  const raw = world.map((w) => new V3(d * w.z, -w.y, -w.x).multiplyScalar(BODY_SCALE).add(tmpRoot));
  const lift = 0.09 + p.jump - Math.min(raw[27].y, raw[28].y);
  for (let i = 0; i < 33; i++) {
    raw[i].y += lift;
    if (p.fresh) p.pts[i].copy(raw[i]); else p.pts[i].lerp(raw[i], 0.6);
  }
  computeExtras(p.pts, d);
  for (let h = 0; h < 2; h++) {
    p.prevHands[h].copy(p.fresh ? p.pts[HAND_L + h] : p.hands[h]);
    p.hands[h].copy(p.pts[HAND_L + h]);
    p.handVel[h].subVectors(p.hands[h], p.prevHands[h]).divideScalar(ddt);
  }
  p.fresh = false;
}

function detect(now) {
  if (!landmarker || video.readyState < 2 || video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;
  const res = landmarker.detectForVideo(video, now);
  const ddt = clamp((now - lastDetect) / 1000, 1 / 120, 0.2);
  lastDetect = now;

  const claimed = {};
  const found = [];
  res.landmarks.forEach((lms, i) => {
    // Ignore weak or tiny detections (posters, noise): need a clear head and shoulders
    if (Math.min(lms[0].visibility, lms[11].visibility, lms[12].visibility) < 0.7) return;
    if (Math.abs(lms[11].x - lms[12].x) < 0.05) return;
    found.push({ lms, world: res.worldLandmarks[i], mx: 1 - (lms[11].x + lms[12].x) / 2 });
  });
  found.sort((a, b) => a.mx - b.mx);
  // One person is always the blue (near) side, wherever they stand. Two people: the one on
  // the left of the webcam is blue, the other red, until one of them has been gone a while.
  const secondStillHere = players.right.human && now - players.right.lastSeen < 1500;
  const solo = found.length === 1 && !secondStillHere;
  found.slice(0, 2).forEach((f, k) => {
    const side = solo ? 'left' : (k === 0 ? 'left' : 'right');
    players[side].solo = solo;
    claimed[side] = f.lms;
    updateHuman(players[side], f.lms, f.world, f.mx, ddt, now);
  });

  if (pip.style.display === 'none') return;
  const W = pip.width, H = pip.height;
  pctx.save();
  pctx.translate(W, 0); pctx.scale(-1, 1);
  pctx.drawImage(video, 0, 0, W, H);
  pctx.restore();
  pctx.strokeStyle = 'rgba(255,255,255,.5)'; pctx.setLineDash([6, 6]);
  pctx.beginPath(); pctx.moveTo(W / 2, 0); pctx.lineTo(W / 2, H); pctx.stroke(); pctx.setLineDash([]);
  for (const side of SIDES) {
    const lms = claimed[side];
    if (!lms) continue;
    pctx.strokeStyle = TEAM[side].css; pctx.lineWidth = 3;
    for (const [a, b] of PIP_LINES) {
      pctx.beginPath();
      pctx.moveTo((1 - lms[a].x) * W, lms[a].y * H);
      pctx.lineTo((1 - lms[b].x) * W, lms[b].y * H);
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
const thump = () => { tone(190, 0.14, 'triangle', 0.5, 80); tone(900, 0.03, 'square', 0.05); };
const netSound = () => tone(140, 0.25, 'sawtooth', 0.12, 70);
const whistle = () => { tone(2300, 0.18, 'sine', 0.12); tone(2700, 0.25, 'sine', 0.12, null, 0.16); };
const fanfare = () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.3, 'triangle', 0.25, null, i * 0.14));

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
  $('leftPts').textContent = demo ? '–' : score.left;
  $('rightPts').textContent = demo ? '–' : score.right;
  $('leftLabel').textContent = players.left.human ? 'PLAYER 1' : 'CPU';
  $('rightLabel').textContent = players.right.human ? 'PLAYER 2' : 'CPU';
  if (state === 'serve' && !demo) $('rally').textContent = `SERVE IN ${Math.max(0, stateT).toFixed(1)}`;
  else if (state !== 'play') $('rally').textContent = '';
}

// ---------- Input ----------
$('start').addEventListener('click', startGame);
addEventListener('pointerdown', audio);
addEventListener('keydown', (e) => {
  audio();
  if (e.code === 'Space' && state === 'serve') stateT = 0;
  else if (e.code === 'KeyR' || (e.code === 'Enter' && demo)) startGame();
  else if (e.code === 'KeyC') pip.style.display = pip.style.display === 'none' ? '' : 'none';
});
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = camera.aspect < 1.3 ? 60 : 45;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---------- Loop ----------
const clock = new THREE.Clock();
const crowdM = new THREE.Matrix4();
const spinAxis = new V3();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  const now = performance.now();
  detect(now);
  updateGame(dt, now);

  ballMesh.position.copy(ball.pos);
  const speed = Math.hypot(ball.vel.x, ball.vel.z);
  if (speed > 0.01) {
    spinAxis.set(ball.vel.z, 0, -ball.vel.x).normalize();
    ballMesh.rotateOnWorldAxis(spinAxis, (speed * dt) / BALL_R);
  }

  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i];
    b.t += dt;
    b.mesh.scale.setScalar(1 + b.t * 9);
    b.mesh.material.opacity = 1 - b.t / 0.4;
    if (b.t > 0.4) { scene.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.material.dispose(); bursts.splice(i, 1); }
  }

  crowd.cheer = Math.max(0, crowd.cheer - dt);
  crowd.base.forEach(([x, y, z, ph], i) => {
    const hop = crowd.cheer > 0 ? Math.abs(Math.sin(now / 110 + ph)) * 0.35 : Math.sin(now / 700 + ph) * 0.03;
    crowdM.makeTranslation(x, y + hop, z);
    crowd.mesh.setMatrixAt(i, crowdM);
  });
  crowd.mesh.instanceMatrix.needsUpdate = true;

  camera.position.z = lerp(camera.position.z, ball.pos.z * 0.12, 0.03);   // a little pan with the rally
  camera.lookAt(camTarget);
  updateHud();
  renderer.render(scene, camera);
}
startServe('left');
loop();
initTracking().catch((e) => status(`Body tracking failed: ${e.message}`, true));
