// scene.js — مشهد الـ 3D: عملة دهب في النص و4 محافظ للبنود، كل محفظة طالع منها ورق العملات اللي فيها
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const KEYS = ['essentials', 'growth', 'stability', 'reward', 'sadaqa'];
const COLORS = { essentials: 0xfbbf24, growth: 0x34d399, stability: 0x60a5fa, reward: 0xf472b6, sadaqa: 0xa78bfa };
const COIN_S = 0.7; // العملة أصغر وفوق، ومحفظة الصدقة في النص
const NOTE = { AED: ['#0f766e', 'Đ'], EGP: ['#b45309', 'E£'], USD: ['#15803d', '$'], EUR: ['#1d4ed8', '€'], SAR: ['#4d7c0f', 'SR'] };

function roundedRect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

const texCache = {};
function noteTexture(cur) {
  if (texCache[cur]) return texCache[cur];
  const [color, sym] = NOTE[cur] || ['#475569', cur];
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 256, 128); g.addColorStop(0, color); g.addColorStop(1, '#0b1020');
  x.fillStyle = g; x.fillRect(0, 0, 256, 128);
  x.strokeStyle = 'rgba(255,255,255,.75)'; x.lineWidth = 5; x.strokeRect(8, 8, 240, 112);
  x.fillStyle = 'rgba(255,255,255,.16)'; x.beginPath(); x.arc(64, 64, 38, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '900 46px Cairo, Arial, sans-serif'; x.fillText(sym, 64, 66);
  x.font = '900 40px Cairo, Arial, sans-serif'; x.fillText(cur, 170, 66);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (texCache[cur] = t);
}

export function initScene(canvas, host, onLabel) {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);

  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(3, 6, 8); scene.add(key);
  const rim = new THREE.PointLight(0x8b5cf6, 60, 40); rim.position.set(-6, -2, 4); scene.add(rim);
  const warm = new THREE.PointLight(0xffc857, 40, 30); warm.position.set(5, 3, 3); scene.add(warm);

  // العملة اللي في النص
  const gold = new THREE.MeshStandardMaterial({ color: 0xf5c542, metalness: 0.75, roughness: 0.28, emissive: 0x6b4a00, emissiveIntensity: 0.55 });
  const coin = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.2, 72), gold); disc.rotation.x = Math.PI / 2; coin.add(disc);
  coin.add(new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.075, 16, 72), gold));
  for (const z of [0.105, -0.105]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.035, 12, 60), gold); ring.position.z = z; coin.add(ring);
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), gold); star.position.z = z; star.scale.z = 0.25; coin.add(star);
  }
  scene.add(coin);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.012, 8, 120), new THREE.MeshBasicMaterial({ color: 0xf5c542, transparent: true, opacity: 0.45 }));
  halo.rotation.x = Math.PI / 2.4; halo.scale.setScalar(COIN_S); scene.add(halo);

  // المحافظ
  const bodyGeo = new THREE.ExtrudeGeometry(roundedRect(1.5, 1.0, 0.2), { depth: 0.24, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 3, curveSegments: 10 });
  bodyGeo.translate(0, 0, -0.12);
  const flapGeo = new THREE.ExtrudeGeometry(roundedRect(1.52, 0.6, 0.2), { depth: 0.05, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 3, curveSegments: 10 });
  const strapGeo = new THREE.BoxGeometry(0.3, 0.3, 0.05);
  const claspGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.07, 24);
  const noteGeo = new THREE.PlaneGeometry(1.05, 0.52);
  const nuggetGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.05, 28);

  const wallets = {};
  for (const k of KEYS) {
    const g = new THREE.Group(), col = new THREE.Color(COLORS[k]);
    const leather = new THREE.MeshStandardMaterial({ color: col, roughness: 0.5, metalness: 0.15, emissive: col, emissiveIntensity: 0.2 });
    const dark = new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.5), roughness: 0.6, metalness: 0.1, emissive: col, emissiveIntensity: 0.08 });
    const body = new THREE.Mesh(bodyGeo, dark);
    const flap = new THREE.Mesh(flapGeo, leather); flap.position.set(0, 0.2, 0.17);
    const strap = new THREE.Mesh(strapGeo, leather); strap.position.set(0, -0.12, 0.2);
    const clasp = new THREE.Mesh(claspGeo, gold); clasp.rotation.x = Math.PI / 2; clasp.position.set(0, -0.14, 0.25);
    const notes = new THREE.Group();
    g.add(body, flap, strap, clasp, notes);
    g.userData = { key: k, leather, notes, target: 1, pulse: 0, sig: null };
    scene.add(g); wallets[k] = g;
  }
  function fill(g, curs, hasGold) {
    const u = g.userData, sig = curs.join() + '|' + hasGold;
    if (u.sig === sig) return;
    u.sig = sig; u.notes.clear();
    curs.slice(0, 3).forEach((cur, i, a) => {
      const m = new THREE.Mesh(noteGeo, new THREE.MeshBasicMaterial({ map: noteTexture(cur), side: THREE.DoubleSide }));
      const o = i - (a.length - 1) / 2;
      m.position.set(o * 0.2 - (hasGold ? 0.12 : 0), 0.7 + (a.length - 1 - i) * 0.07, -0.03 - i * 0.025);
      m.rotation.z = -o * 0.16;
      u.notes.add(m);
    });
    if (hasGold) {
      const n = new THREE.Mesh(nuggetGeo, gold); n.rotation.x = Math.PI / 2; n.position.set(0.52, 0.66, 0.02); u.notes.add(n);
      const n2 = n.clone(); n2.position.set(0.32, 0.58, 0.06); u.notes.add(n2);
    }
    u.pulse = 0.8;
  }

  // نجوم
  const N = 700, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = 9 + Math.random() * 14, a = Math.random() * Math.PI * 2, b = Math.acos(2 * Math.random() - 1);
    pos.set([r * Math.sin(b) * Math.cos(a), r * Math.cos(b) * 0.6, r * Math.sin(b) * Math.sin(a) - 6], i * 3);
  }
  const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.06, transparent: true, opacity: 0.7 }));
  scene.add(stars);

  // عملات طايرة للمحافظ
  const flyGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.035, 20);
  const flying = [];
  function burst(alloc) {
    const total = KEYS.reduce((a, k) => a + Math.max(0, alloc[k] || 0), 0);
    if (!total) return;
    coin.userData.kick = 1;
    let n = 0;
    for (const k of KEYS) {
      const v = Math.max(0, alloc[k] || 0); if (v <= 0) continue;
      const count = Math.max(3, Math.round(v / total * 34));
      for (let i = 0; i < count; i++) {
        const m = new THREE.Mesh(flyGeo, gold); m.visible = false; scene.add(m);
        flying.push({ m, to: wallets[k], t0: clock.getElapsedTime() + n++ * 0.035, dur: 0.9 + Math.random() * 0.5, arc: 1.2 + Math.random() * 1.6, side: (Math.random() - 0.5) * 1.6 });
      }
    }
  }

  let W = 1, H = 1, P = {}, coinY = 0.3;
  function resize() {
    W = host.clientWidth; H = host.clientHeight;
    renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix();
    // شاشة ضيقة: ابعد الكاميرا لحد ما المحافظ تبان بالعرض، ووزّعهم بالطول
    const t21 = Math.tan(THREE.MathUtils.degToRad(21));
    const dist = Math.max(10, 3.9 / (t21 * camera.aspect));
    camera.position.z = dist;
    const halfW = t21 * dist * camera.aspect, ys = 1 + (dist / 10 - 1) * 0.9;
    if (halfW >= 7.6) {
      // شاشة عريضة: الأربع محافظ في صف واحد (2 يمين العملة و2 شمالها) والكروت تحتهم
      const outer = Math.min(halfW - 1.7, 7.4), inner = Math.max(3.2, outer - 3.7);
      P = { essentials: [outer, 0.3], growth: [inner, 0.3], stability: [-inner, 0.3], reward: [-outer, 0.3], sadaqa: [0, -0.45] };
      coinY = 1.3;
    } else {
      // شاشة أضيق: مربع 2×2 بمسافة كفاية بين الصفين عشان الكروت ما تغطيش المحافظ
      const rx = Math.max(2.2, Math.min(4.6, halfW - 1.5));
      P = { essentials: [rx, -1.3 * ys], growth: [-rx, -1.3 * ys], stability: [-rx, 1.9 * ys], reward: [rx, 1.9 * ys], sadaqa: [0, 0.35 * ys] };
      coinY = 1.9 * ys + 0.25;
    }
    halo.position.y = coinY;
  }
  new ResizeObserver(resize).observe(host); resize();

  const mouse = { x: 0, y: 0 };
  host.addEventListener('pointermove', e => {
    const r = host.getBoundingClientRect();
    mouse.x = (e.clientX - r.left) / r.width - 0.5; mouse.y = (e.clientY - r.top) / r.height - 0.5;
  });
  host.addEventListener('pointerleave', () => { mouse.x = mouse.y = 0; });

  const clock = new THREE.Clock(), v = new THREE.Vector3();
  camera.position.set(0, 0.1, camera.position.z);
  function frame() {
    const t = still ? 0 : clock.getElapsedTime();
    coin.userData.kick = (coin.userData.kick || 0) * 0.94;
    coin.rotation.y = t * 1.1 + coin.userData.kick * 6;
    coin.position.y = coinY + Math.sin(t * 1.4) * 0.14;
    coin.scale.setScalar(COIN_S * (1 + coin.userData.kick * 0.25));
    halo.rotation.z = t * 0.4;
    stars.rotation.y = t * 0.012;

    KEYS.forEach((k, i) => {
      const g = wallets[k], u = g.userData, [px, py] = P[k], sx = Math.sign(px);
      g.position.set(px + Math.sin(t * 0.4 + i * 1.7) * 0.1, py + Math.sin(t * 0.9 + i * 1.3) * 0.08, Math.sin(t * 0.5 + i * 2) * 0.3);
      g.rotation.set(-0.1 + Math.sin(t * 0.7 + i) * 0.05, Math.sin(t * 0.6 + i * 1.4) * 0.38 - sx * 0.12, Math.sin(t * 0.8 + i * 2) * 0.05 + u.pulse * Math.sin(t * 30) * 0.06);
      u.pulse *= 0.92;
      const s = THREE.MathUtils.lerp(g.scale.x, u.target * (1 + u.pulse * 0.35), 0.08);
      g.scale.setScalar(s);
      u.leather.emissiveIntensity = 0.2 + u.pulse * 1.0;
      v.copy(g.position); v.y -= 0.78 * s; v.project(camera);
      onLabel(k, (v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H, 1);
    });

    const now = clock.getElapsedTime();
    for (let i = flying.length - 1; i >= 0; i--) {
      const f = flying[i], p = (now - f.t0) / f.dur;
      if (p < 0) continue;
      if (p >= 1) { scene.remove(f.m); f.to.userData.pulse = Math.min(1.6, f.to.userData.pulse + 0.35); flying.splice(i, 1); continue; }
      const e = p * p * (3 - 2 * p), to = f.to.position;
      f.m.visible = true;
      f.m.position.set(to.x * e + f.side * Math.sin(p * Math.PI), coin.position.y * (1 - e) + (to.y + 0.4) * e + Math.sin(p * Math.PI) * f.arc, to.z * e + Math.sin(p * Math.PI) * 0.8);
      f.m.rotation.set(now * 9, now * 6, 0);
      f.m.scale.setScalar(1 - e * 0.5);
    }

    camera.position.x += (mouse.x * 2.2 - camera.position.x) * 0.05;
    camera.position.y += (0.35 - mouse.y * 1.2 - camera.position.y) * 0.05;
    camera.lookAt(0, 0.25, 0); // نزّل المشهد شوية تحت العنوان
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  frame();

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(KEYS.map(k => wallets[k]), true)[0];
    if (!hit) return null;
    let o = hit.object; while (o && !o.userData.key) o = o.parent;
    if (!o) return null;
    o.userData.pulse = 1;
    return o.userData.key;
  }

  return {
    burst, pick,
    /** info[k] = { share: 0..1, curs: ['AED','EGP'], gold: bool } */
    setWallets(info) {
      for (const k of KEYS) {
        const w = info[k] || {};
        wallets[k].userData.target = 0.92 + Math.min(1, Math.max(0, w.share || 0)) * 0.14;
        fill(wallets[k], w.curs || [], !!w.gold);
      }
    },
  };
}
