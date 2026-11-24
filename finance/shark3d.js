// shark3d.js — 🦈 قرش 3D بيعوم (three.js): جسم وزعانف وديل بيتهز، وعينين بترمش، وبُق بيفتح وهو بيتكلم.
// الحالات: idle (بيعوم) · talk (بيتكلم) · listen (بيسمعك، مايل ناحيتك) · think (بيلف ويدوّر).
// لو WebGL مش شغال بيرجع null، ووضع قرش بيستخدم الرسمة العادية.
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

export async function mountShark3D(box) {
  let THREE;
  try { THREE = await import(THREE_URL); } catch { return null; }
  const c = document.createElement('canvas'); c.className = 'sx-3d';
  let r;
  try { r = new THREE.WebGLRenderer({ canvas: c, alpha: true, antialias: true }); } catch { return null; }
  r.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  cam.position.set(0, 0.15, 7.4);
  scene.add(new THREE.HemisphereLight(0xD4DBEA, 0x1B2A4B, 1.3));
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(2, 3, 4); scene.add(key);
  const rim = new THREE.PointLight(0x6079B0, 18, 12); rim.position.set(-2.5, 1, -1.5); scene.add(rim);
  const rim2 = new THREE.PointLight(0xF76555, 14, 12); rim2.position.set(2.5, -1, -1); scene.add(rim2);

  const blue = new THREE.MeshStandardMaterial({ color: 0x768CBB, roughness: .35, metalness: .15, emissive: 0x17294F, emissiveIntensity: .35 });
  const belly = new THREE.MeshStandardMaterial({ color: 0xF7F1E7, roughness: .5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0b1020, roughness: .3 });
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .2, emissive: 0xffffff, emissiveIntensity: .2 });

  const shark = new THREE.Group(); scene.add(shark);
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), blue); body.scale.set(1.55, .95, .95); shark.add(body);
  const bel = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24, 0, Math.PI * 2, Math.PI * .45, Math.PI * .55), belly); bel.scale.set(1.5, .92, .93); bel.position.y = -.02; shark.add(bel);
  // الزعنفة اللي فوق + الجانبية
  const fin = new THREE.Mesh(new THREE.ConeGeometry(.32, .9, 24), blue); fin.position.set(-.1, .95, 0); fin.rotation.z = .35; shark.add(fin);
  const sideFin = s => { const m = new THREE.Mesh(new THREE.ConeGeometry(.18, .7, 16), blue); m.position.set(.1, -.45, .7 * s); m.rotation.set(s * 1.1, 0, -.6); shark.add(m); return m; };
  const finL = sideFin(1), finR = sideFin(-1);
  // الديل
  const tail = new THREE.Group(); tail.position.set(-1.45, 0, 0); shark.add(tail);
  const stem = new THREE.Mesh(new THREE.ConeGeometry(.42, .9, 24), blue); stem.rotation.z = Math.PI / 2; stem.position.x = -.25; tail.add(stem);
  const lobe = (y, rz) => { const m = new THREE.Mesh(new THREE.ConeGeometry(.22, .85, 16), blue); m.position.set(-.7, y, 0); m.rotation.z = rz; tail.add(m); };
  lobe(.35, .9); lobe(-.3, Math.PI - .9);
  // العينين (بتبص للكاميرا)
  const eye = (s) => { const g = new THREE.Group(); const e = new THREE.Mesh(new THREE.SphereGeometry(.17, 24, 16), dark); const h = new THREE.Mesh(new THREE.SphereGeometry(.055, 12, 8), white); h.position.set(.06, .07, .13); g.add(e, h); g.position.set(.95, .3, .5 * s); shark.add(g); return g; };
  const eyeL = eye(1), eyeR = eye(-1);
  // البُق: فك تحت بيفتح، وسنان
  const jaw = new THREE.Group(); jaw.position.set(1.05, -.22, 0); shark.add(jaw);
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(.42, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), dark); mouth.scale.set(.9, .35, 1.1); jaw.add(mouth);
  for (let i = -3; i <= 3; i++) { const t = new THREE.Mesh(new THREE.ConeGeometry(.045, .12, 6), white); t.position.set(.12, .02, i * .1); t.rotation.z = Math.PI; jaw.add(t); }
  // فقاعات
  const bubbles = [], bMat = new THREE.MeshStandardMaterial({ color: 0x95A6CB, transparent: true, opacity: .45, roughness: .1 });
  for (let i = 0; i < 10; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(.05 + Math.random() * .06, 10, 8), bMat); b.position.set(1.4 + Math.random() * .6, -1 + Math.random() * 2.4, (Math.random() - .5) * 1.2); bubbles.push(b); scene.add(b); }

  shark.rotation.y = -.55; // مايل ناحيتك شوية
  box.prepend(c);
  const size = () => { const w = box.clientWidth || 150, h = box.clientHeight || 150; r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
  size(); const ro = new ResizeObserver(size); ro.observe(box);

  let state = 'idle', t0 = performance.now(), raf = 0, blinkAt = 2;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tick = now => {
    raf = requestAnimationFrame(tick);
    if (document.hidden || !c.isConnected || !c.offsetParent) return;
    const t = (now - t0) / 1000, sp = state === 'think' ? 2.2 : state === 'talk' ? 1.4 : 1;
    if (!reduce) {
      shark.position.y = Math.sin(t * 1.6) * .12;
      shark.rotation.y = (state === 'think' ? t * 1.6 : -.55 + Math.sin(t * .7) * .25);
      shark.rotation.z = Math.sin(t * 1.1) * .06 + (state === 'listen' ? .18 : 0);
      tail.rotation.y = Math.sin(t * 5 * sp) * .45;
      finL.rotation.y = Math.sin(t * 3) * .2; finR.rotation.y = -Math.sin(t * 3) * .2;
      fin.rotation.x = Math.sin(t * 2) * .05;
      for (const b of bubbles) { b.position.y += .006 * sp; if (b.position.y > 1.6) { b.position.y = -1.2; b.position.x = 1.3 + Math.random() * .7; } }
    }
    jaw.rotation.z = state === 'talk' ? -(.12 + Math.abs(Math.sin(t * 13)) * .32) : state === 'listen' ? -.08 : 0;
    const blink = (t % 4.5) > blinkAt && (t % 4.5) < blinkAt + .12; eyeL.scale.y = eyeR.scale.y = blink ? .12 : 1;
    rim.intensity = state === 'talk' ? 26 + Math.sin(t * 12) * 8 : 18;
    r.render(scene, cam);
  };
  raf = requestAnimationFrame(tick);
  return {
    set: s => { state = s; },
    dispose: () => { cancelAnimationFrame(raf); ro.disconnect(); r.dispose(); c.remove(); },
  };
}
