// time-sky.js — the 3D sky over the prayer times on /time (owner, 2026-11-21: "3D shapes").
// A clay sun (or moon at night) travels an arc from sunrise to Maghrib; a glowing lantern
// stands on the arc at each prayer; a clay mascot on the hill bounces on every win and smiles
// with the day's %. The sky's colour follows the hour (dawn, noon, Asr gold, sunset, night).
// Fed by time.js events: time:prayer (the times), time:day (%), time:cheer (a win).
// No WebGL → the same sky as a gradient with the labels, still useful.
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
const box = document.getElementById('prayerSky');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const KEYS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
const min = hm => { const [h, m] = String(hm).split(':').map(Number); return h * 60 + m; };

let data = null, pct = 0, three = null, cheerAt = -9;
const T0 = performance.now();
const labels = {}, nowEl = document.createElement('div');
nowEl.className = 'sky__now';

// where a moment of the day sits on the arc: x across (fajr−40min … isha+40min), y on the sun's curve
function arcPoint(m, t) {
  const a = min(t.fajr) - 40, b = min(t.isha) + 40, rise = min(t.sunrise), set = min(t.maghrib);
  const fx = Math.max(0, Math.min(1, (m - a) / (b - a)));
  const fy = m <= rise || m >= set ? 0 : Math.sin(Math.PI * (m - rise) / (set - rise));
  return { fx, fy };
}
function skyColors(m, t) {
  const f = min(t.fajr), r = min(t.sunrise), d = min(t.dhuhr), as = min(t.asr), mg = min(t.maghrib), i = min(t.isha);
  if (m < f - 20 || m > i + 30) return ['#0C1529', '#263C6B', 'night'];
  if (m < r) return ['#243C70', '#F0998F', 'dawn'];
  if (m < r + 60) return ['#7C91BE', '#ffc59a', 'morning'];
  if (m < as) return ['#748ABA', '#D4DBEA', 'day'];
  if (m < mg - 35) return ['#7A8FBD', '#ffd38a', 'asr'];
  if (m < mg + 15) return ['#9E463C', '#ff8a5b', 'sunset'];
  return ['#1B2F5B', '#B0554B', 'dusk'];
}
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; };

function nextText() {
  const t = data.times, n = nowMin();
  if (!data.today) return { big: data.names.dhuhr + ' ' + clock(t.dhuhr), small: '' };
  const k = KEYS.filter(k => k !== 'sunrise').find(k => min(t[k]) > n);
  const ar = (window.T || (e => e))('en', 'ar') === 'ar';
  if (!k) return { big: ar ? 'تصبح على خير 🌙' : 'Good night 🌙', small: (ar ? 'الفجر ' : 'Fajr ') + clock(t.fajr) };
  const left = Math.round(min(t[k]) - n), h = Math.floor(left / 60), mm = left % 60;
  const span = ar ? (h ? h + ' س ' : '') + mm + ' د' : (h ? h + 'h ' : '') + mm + 'm';
  return { big: data.names[k] + ' ' + clock(t[k]), small: ar ? 'كمان ' + span : 'in ' + span };
}
function clock(hm) { const m = min(hm), h = Math.floor(m / 60) % 12 || 12; return h + ':' + String(m % 60).padStart(2, '0'); }

function layout() {
  // labels + the sky colour; works with or without WebGL
  const t = data.times, w = box.clientWidth, h = box.clientHeight, n = data.today ? nowMin() : min(t.dhuhr);
  const [top, bot] = skyColors(n, t);
  box.style.setProperty('--sky-top', top); box.style.setProperty('--sky-bot', bot);
  const nxt = data.today ? KEYS.filter(k => k !== 'sunrise').find(k => min(t[k]) > nowMin()) : null;
  KEYS.forEach(k => {
    let el = labels[k];
    if (!el) { el = labels[k] = document.createElement('span'); el.className = 'sky__label'; box.appendChild(el); }
    const p = arcPoint(min(t[k]), t), s = toScreen(p, w, h);
    const narrow = w < 520;
    el.textContent = narrow && k !== nxt ? clock(t[k]) : data.names[k] + ' ' + clock(t[k]);
    el.classList.toggle('below', k === 'fajr' || k === 'isha');
    el.style.left = s.x + 'px'; el.style.top = s.y + 'px';
    el.classList.toggle('is-next', k === nxt);
    el.style.opacity = k === 'sunrise' ? .8 : 1;
  });
  const nt = nextText(); nowEl.innerHTML = '';
  nowEl.append(nt.big); if (nt.small) { const s = document.createElement('small'); s.textContent = nt.small; nowEl.append(s); }
  if (!nowEl.isConnected) box.appendChild(nowEl);
}
// arc (fx, fy) → pixels; the 3D scene uses the same mapping so labels sit on the lanterns
function toScreen(p, w, h) { return { x: w * (0.1 + 0.8 * p.fx), y: h * (0.66 - 0.5 * p.fy) }; }

async function mount3D() {
  let THREE; try { THREE = await import(THREE_URL); } catch { return null; }
  let r; try { r = new THREE.WebGLRenderer({ alpha: true, antialias: true }); } catch { return null; }
  r.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  box.prepend(r.domElement);
  const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(0, 1, 1, 0, -6000, 6000);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(-1, 2, 3); scene.add(key);
  const clay = c => new THREE.MeshStandardMaterial({ color: c, roughness: .55, metalness: .05 });
  // hills: big clay spheres along the bottom
  const hills = new THREE.Group(); scene.add(hills);
  const hillMats = [clay(0x768CBB), clay(0xF0796C), clay(0x546FAA)];
  [[0.15, 0.45], [0.55, 0.55], [0.92, 0.42]].forEach(([x, rr], i) => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), hillMats[i]); m.userData = { x, rr }; hills.add(m); });
  // the path: little dots along the arc
  const dots = new THREE.Group(); scene.add(dots);
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .55 });
  for (let i = 0; i <= 40; i++) dots.add(new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), dotMat));
  // lanterns at each prayer
  const lanterns = {};
  KEYS.forEach(k => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1.6, 6), new THREE.MeshStandardMaterial({ color: 0xffc44d, emissive: 0xff9d00, emissiveIntensity: .7, roughness: .3, metalness: .3 }));
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.3, 1, 6), clay(0x7A322A)); cap.position.y = 1.3;
    const glow = new THREE.Mesh(new THREE.SphereGeometry(2.2, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: .22 }));
    g.add(body, cap, glow); g.userData = { glow }; scene.add(g); lanterns[k] = g;
  });
  // sun / moon
  const sun = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffa000, emissiveIntensity: .9, roughness: .4 }));
  const halo = new THREE.Mesh(new THREE.SphereGeometry(1.8, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffe28a, transparent: true, opacity: .25 }));
  scene.add(sun, halo);
  // stars
  const stars = new THREE.Group(); scene.add(stars);
  for (let i = 0; i < 40; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(1, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .8 })); s.userData = { x: Math.random(), y: .35 + Math.random() * .6, tw: Math.random() * 6 }; stars.add(s); }
  // the mascot on the left hill
  const pal = new THREE.Group(); scene.add(pal);
  const palBody = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), new THREE.MeshStandardMaterial({ color: 0xFF7D6F, roughness: .45, emissive: 0x401510, emissiveIntensity: .25 }));
  const eyeM = new THREE.MeshStandardMaterial({ color: 0x141B2A, roughness: .2 });
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(.17, 16, 12), eyeM), eyeR = eyeL.clone();
  eyeL.position.set(-.33, .2, .9); eyeR.position.set(.33, .2, .9);
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(.32, .06, 8, 24, Math.PI), eyeM); mouth.position.set(0, -.12, .92); mouth.rotation.z = Math.PI;
  const cheekM = new THREE.MeshBasicMaterial({ color: 0xFF503D, transparent: true, opacity: .45 });
  const chL = new THREE.Mesh(new THREE.SphereGeometry(.13, 10, 8), cheekM), chR = chL.clone(); chL.position.set(-.55, -.08, .8); chR.position.set(.55, -.08, .8);
  pal.add(palBody, eyeL, eyeR, mouth, chL, chR);

  let W = 1, H = 1;
  const size = () => { W = box.clientWidth || 300; H = box.clientHeight || 170; r.setSize(W, H, false); cam.left = 0; cam.right = W; cam.top = H; cam.bottom = 0; cam.updateProjectionMatrix(); };
  size(); new ResizeObserver(() => { size(); if (data) layout(); }).observe(box);
  // three's y goes up; the screen's goes down
  const at = (obj, sx, sy, z = 0) => obj.position.set(sx, H - sy, z);

  let visible = true; new IntersectionObserver(e => { visible = e[0].isIntersecting; }).observe(box);
  function frame(now) {
    requestAnimationFrame(frame);
    if (!visible || document.hidden || !data || box.hidden) return;
    const t = data.times, s = (now - T0) / 1000, u = Math.min(W, H * 2.2);
    const n = data.today ? nowMin() : min(t.dhuhr), night = n < min(t.sunrise) || n > min(t.maghrib);
    hills.children.forEach((m, i) => { const { x, rr } = m.userData; m.scale.setScalar(W * rr * .62); at(m, W * x, H + W * rr * .62 * .72, -2500); m.material.color.setHex(night ? [0x243966, 0x37496F, 0x1D2F55][i] : [0x768CBB, 0xF0796C, 0x546FAA][i]); });
    dots.children.forEach((d, i) => { const m = min(t.sunrise) + (min(t.maghrib) - min(t.sunrise)) * i / 40, p = toScreen(arcPoint(m, t), W, H); d.scale.setScalar(u * .006); at(d, p.x, p.y, -300); });
    KEYS.forEach(k => { const g = lanterns[k], p = toScreen(arcPoint(min(t[k]), t), W, H); g.scale.setScalar(u * (k === 'sunrise' ? .014 : .02)); at(g, p.x, p.y + u * .012, 300); g.rotation.y = reduce ? .4 : s * .8 + KEYS.indexOf(k); g.userData.glow.material.opacity = .18 + (reduce ? 0 : Math.sin(s * 2 + KEYS.indexOf(k)) * .08); });
    // the sun walks the arc by the clock; at night the moon takes the middle of the sky
    const sp = night ? { x: W * .5, y: H * .26 } : toScreen(arcPoint(n, t), W, H), sr = u * (night ? .05 : .065);
    sun.scale.setScalar(sr); halo.scale.setScalar(sr * (1 + (reduce ? 0 : Math.sin(s * 1.6) * .06))); at(sun, sp.x, sp.y, 0); at(halo, sp.x, sp.y, -200);
    sun.material.color.setHex(night ? 0xFBF8F4 : 0xffd23f); sun.material.emissive.setHex(night ? 0x95A6CB : 0xffa000); halo.material.color.setHex(night ? 0xD4DBEA : 0xffe28a);
    stars.visible = night; stars.children.forEach(st => { st.scale.setScalar(u * .0045); at(st, st.userData.x * W, (1 - st.userData.y) * H, -4000); st.material.opacity = reduce ? .7 : .45 + Math.sin(s * 2 + st.userData.tw) * .35; });
    // mascot: bobs, hops on a win, smiles wider as the day fills
    const hop = Math.max(0, 1 - (s - cheerAt) / .8), jump = hop > 0 ? Math.sin((1 - hop) * Math.PI) * u * .09 : 0;
    const bob = reduce ? 0 : Math.sin(s * 2.4) * u * .006;
    pal.scale.set(u * .07 * (1 + hop * .12), u * .07 * (1 - hop * .1), u * .07); at(pal, W * .5, H * .74 - bob - jump, 1500);
    pal.rotation.y = reduce ? 0 : Math.sin(s * .9) * .35; pal.rotation.z = hop ? Math.sin(s * 20) * .12 * hop : 0;
    const blink = !reduce && (s % 4) > 3.86; eyeL.scale.y = eyeR.scale.y = blink ? .15 : 1;
    mouth.scale.set(.6 + pct / 100 * .7, .4 + pct / 100 * .9, 1);
    r.render(scene, cam);
    if (Math.floor(s) !== frame.sec) { frame.sec = Math.floor(s); layout(); }
  }
  requestAnimationFrame(frame);
  return true;
}

function onPrayer(detail) {
  data = detail;
  if (!box) return;
  box.hidden = !data;
  if (!data) return;
  requestAnimationFrame(layout);
  if (!three) three = mount3D().then(ok => { if (!ok) box.classList.add('sky--flat'); return ok; });
}
window.addEventListener('time:prayer', e => onPrayer(e.detail));
// labels follow the box's size and the clock even when there is no 3D (no WebGL / power saving)
if (box) {
  new ResizeObserver(() => { if (data && !box.hidden && box.clientWidth) layout(); }).observe(box);
  setInterval(() => { if (data && !box.hidden && !document.hidden && box.clientWidth) layout(); }, 30000);
}
if (window.__timePrayer !== undefined) onPrayer(window.__timePrayer);
window.addEventListener('time:day', e => { pct = e.detail.pct || 0; });
window.addEventListener('time:cheer', () => { cheerAt = (performance.now() - T0) / 1000; });
