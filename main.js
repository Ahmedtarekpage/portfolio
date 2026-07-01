import * as THREE from "three";

/* =========================================================
   DATA (from resume)
   ========================================================= */
// Each product: what it is, my role, what I actually built, the impact, and a live link.
// `link.url = null` renders a disabled "Link coming soon" chip — fill these in.
const JOBS = [
  {
    date: "Jun 2025 — Present",
    place: "Remote · Part-Time",
    role: "AI Product Manager",
    company: "Ashrhly.com",
    kind: "AI EdTech Platform",
    what: "An AI-powered tutoring platform that gives students on-demand, personalized learning — built with Claude and a single engineer to prove that AI-augmented teams can ship a full product.",
    built: [
      "Took the platform from concept to launch — product vision, roadmap, and go-to-market.",
      "Designed and optimized the AI-engine pipeline powering the tutoring experience.",
      "Defined the KPIs and growth loops driving post-launch scaling.",
    ],
    impact: ["Concept → Launch", "Built with Claude", "AI-augmented team"],
    tags: ["EdTech", "LLM / Claude", "0→1", "KPIs"],
    links: [{ url: "https://ashrhly.com", label: "Visit Ashrhly" }],
    featured: true,
  },
  {
    date: "Jul 2025 — Jun 2026",
    place: "Estonia · Remote",
    role: "Product Manager",
    company: "Inkrypt Videos",
    kind: "Video-Security SaaS",
    what: "A platform that protects video content with encryption — including live-stream protection — and helps creators publish on schedule.",
    built: [
      "Shipped encrypted data protection for live-stream content, end-to-end validated with QA.",
      "Led a delay-prevention feature that predicts optimal upload times for on-time availability.",
      "Turned user research into analytics feature specs, managing the backlog in Jira.",
    ],
    impact: ["Live-stream encryption", "Delay-prevention", "Analytics"],
    tags: ["Video Security", "SaaS", "Agile / Jira", "QA"],
    links: [{ url: "https://inkryptvideos.com", label: "Visit Inkrypt Videos" }],
  },
  {
    date: "Aug 2021 — Aug 2024",
    place: "UAE · Remote",
    role: "Product Manager",
    company: "Awasis.ai",
    kind: "AI Education & Robotics",
    what: "A portfolio of B2B/B2C digital products — AI education platforms, e-commerce, mobile apps and VR — delivered for international clients at Top Rated Plus (Upwork top 3%).",
    built: [
      "Owned product roadmaps for AI-driven educational robotics products.",
      "Ran discovery & stakeholder management for clients across 6 countries.",
      "Established a product-first model with flexible pricing for 50+ enterprise clients.",
    ],
    impact: ["10,000+ users", "+40% YoY revenue", "95% satisfaction", "+60% retention"],
    tags: ["AI EdTech", "VR", "E-commerce", "Top Rated Plus"],
    links: [{ url: "https://www.youtube.com/watch?v=TAHexuZxpxA", label: "Watch overview" }],
  },
  {
    date: "Feb 2024 — Oct 2024",
    place: "Dubai, UAE · Hybrid",
    role: "Product Manager",
    company: "SAKINA",
    kind: "B2B Travel Platform",
    what: "A B2B Islamic tourism platform managing VIP travel experiences through a cloud-based dynamic dashboard.",
    built: [
      "Owned product vision & strategy for the VIP experience management system.",
      "Delivered an integrated booking system and real-time availability + CMS features.",
      "Aligned engineering, design and business teams around one roadmap.",
    ],
    impact: ["+40% booking efficiency", "+35% engagement", "50+ partners"],
    tags: ["B2B", "Booking Systems", "CMS", "Cloud Dashboard"],
    links: [{ url: "https://sakeenahtours.com/", label: "Visit Sakeenah Tours" }],
  },
  {
    date: "Aug 2023 — Jan 2025",
    place: "Cairo, Egypt · Hybrid",
    role: "Product Manager",
    company: "AlaFein · Gazebo Productions",
    kind: "B2C Events App (iOS/Android)",
    what: "A B2C arts & culture events platform — iOS/Android apps plus an admin dashboard — connecting audiences with organizers and artists.",
    built: [
      "Owned the full lifecycle from discovery through launch and iteration.",
      "Ran user research & market analysis to define and prioritize the roadmap.",
      "Led a cross-functional team of 8 over a 12-month cycle.",
    ],
    impact: ["+30% acquisition", "+45% conversions", "99.5% uptime", "200+ organizers"],
    tags: ["B2C", "iOS / Android", "Team of 8", "Admin Dashboard"],
    links: [
      { url: "https://apps.apple.com/eg/app/alafein/id1611144819", label: "App Store" },
      { url: "https://www.linkedin.com/showcase/alafein/posts/?feedView=all", label: "LinkedIn" },
    ],
  },
  {
    date: "Jan 2024 — May 2025",
    place: "Saudi Arabia · Remote",
    role: "Product Manager",
    company: "Fira.Ai — Government Project",
    kind: "GovTech · Confidential",
    what: "A confidential government project for Saudi Arabia — a custom web application built around Matterport 3D-capture technology, delivered under strict compliance requirements. Details are protected under NDA.",
    built: [
      "Managed the project from proposal to delivery under strict compliance requirements.",
      "Led Matterport integration via a custom web app that improved usability.",
      "Designed team-management pipelines and tracked delivery in Jira.",
    ],
    impact: ["Saudi Government", "Matterport integration", "Custom web app"],
    tags: ["GovTech", "Compliance", "Matterport", "Jira"],
    nda: true,
  },
  {
    date: "Aug 2022 — Jan 2026",
    place: "Udacity · DECI (Egypt Gov)",
    role: "Session Lead",
    company: "Digital Egypt Cubs Initiative",
    kind: "STEAM Education Program",
    what: "A national initiative (with the Egyptian government) teaching Computer Fundamentals, AI and Python to students across levels.",
    built: [
      "Delivered 100+ virtual STEAM lessons over 3 years.",
      "Designed hands-on coding & electronics projects that lifted engagement.",
      "Ran weekly assessments with structured feedback.",
    ],
    impact: ["100+ lessons", "3 years", "AI & Python"],
    tags: ["STEAM", "AI / Python", "Education"],
    links: [],
  },
];

const SKILLS = [
  {
    title: "Product Management",
    chips: ["End-to-End Lifecycle", "Product Strategy & Vision", "Discovery & Experimentation", "Roadmap Planning", "Backlog Prioritization", "Stakeholder Management", "User Research", "A/B Testing", "B2B & B2C", "KPI & Growth"],
  },
  {
    title: "AI & Emerging Tech",
    chips: ["Claude", "Large Language Models", "AI Prototyping", "AI Pipeline Optimization", "Prompt Engineering", "AI Tutoring Platforms", "VR Experiences", "Matterport"],
  },
  {
    title: "Methodologies & Tools",
    chips: ["Agile & Scrum", "Jira", "Confluence", "Slack", "Data-Driven Decisions", "Cross-Functional Leadership", "Strategic Planning", "Risk Management", "QA Coordination"],
  },
  {
    title: "Technical",
    chips: ["Python", "Django", "Flask", "NumPy / Pandas", "SQL / MySQL", "REST APIs", "Selenium", "Web Scraping", "Power BI"],
  },
];

/* =========================================================
   INJECT CONTENT
   ========================================================= */
const timeline = document.getElementById("timeline");
function linkBtn(j) {
  if (j.nda) {
    return `<span class="prod__cta prod__cta--nda"><span class="prod__lock">🔒</span> Under NDA</span>`;
  }
  const links = j.links || [];
  if (!links.length) return "";
  return `<div class="prod__ctas">` + links
    .map((l, k) =>
      `<a class="prod__cta${k > 0 ? " prod__cta--ghost" : ""}" href="${l.url}" target="_blank" rel="noopener">
        ${l.label} <span class="prod__cta-arrow">↗</span></a>`
    )
    .join("") + `</div>`;
}
timeline.innerHTML = JOBS.map(
  (j, i) => `
  <article class="prod glass reveal${j.featured ? " prod--featured" : ""}" style="--d:${Math.min(i * 0.05, 0.3)}s">
    <div class="prod__top">
      <span class="prod__kind">${j.kind}</span>
      <span class="prod__date">${j.date}</span>
    </div>
    <h3 class="prod__name">${j.company}</h3>
    <p class="prod__role">${j.role} · ${j.place}</p>
    <p class="prod__what">${j.what}</p>
    <div class="prod__section">
      <span class="prod__label">What I built</span>
      <ul class="prod__built">${j.built.map((b) => `<li>${b}</li>`).join("")}</ul>
    </div>
    <div class="prod__impact">${j.impact.map((m) => `<span class="prod__metric">${m}</span>`).join("")}</div>
    <div class="prod__foot">
      <div class="prod__tags">${j.tags.map((t) => `<span class="job__tag">${t}</span>`).join("")}</div>
      ${linkBtn(j)}
    </div>
  </article>`
).join("");

const skillsGrid = document.getElementById("skillsGrid");
skillsGrid.innerHTML = SKILLS.map(
  (s, i) => `
  <div class="skillcat reveal" style="--d:${i * 0.08}s">
    <h3>${s.title}</h3>
    <div class="skillcat__chips">${s.chips.map((c) => `<span class="chip">${c}</span>`).join("")}</div>
  </div>`
).join("");

/* =========================================================
   REVEAL ON SCROLL
   ========================================================= */
const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("in");
        io.unobserve(e.target);
      }
    });
  },
  { threshold: 0.12 }
);
document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

/* =========================================================
   NAV + SCROLL PROGRESS
   ========================================================= */
const nav = document.getElementById("nav");
const progress = document.getElementById("scrollProgress");
function onScroll() {
  const y = window.scrollY;
  nav.classList.toggle("scrolled", y > 40);
  const h = document.documentElement.scrollHeight - window.innerHeight;
  progress.style.width = (h > 0 ? (y / h) * 100 : 0) + "%";
}
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

/* =========================================================
   COUNT-UP STATS
   ========================================================= */
function animateCount(el) {
  const target = +el.dataset.count;
  const suffix = el.dataset.suffix || "";
  const dur = 1600;
  let start = null;
  const fmt = (n) => (target >= 1000 ? Math.round(n).toLocaleString() : Math.round(n));
  function step(ts) {
    if (!start) start = ts;
    const p = Math.min((ts - start) / dur, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(target * eased) + suffix;
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
const statObs = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        animateCount(e.target);
        statObs.unobserve(e.target);
      }
    });
  },
  { threshold: 0.6 }
);
document.querySelectorAll(".stat__num").forEach((el) => statObs.observe(el));

/* =========================================================
   CUSTOM CURSOR
   ========================================================= */
const cursor = document.getElementById("cursorGlow");
let cx = window.innerWidth / 2, cy = window.innerHeight / 2, tx = cx, ty = cy;
window.addEventListener("mousemove", (e) => { tx = e.clientX; ty = e.clientY; });
document.querySelectorAll("a, .btn, .glass, .prod, .prod__cta, .skillcat, .chip").forEach((el) => {
  el.addEventListener("mouseenter", () => cursor.classList.add("big"));
  el.addEventListener("mouseleave", () => cursor.classList.remove("big"));
});
function cursorLoop() {
  cx += (tx - cx) * 0.18;
  cy += (ty - cy) * 0.18;
  cursor.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`;
  requestAnimationFrame(cursorLoop);
}
cursorLoop();

/* =========================================================
   3D CARD TILT
   ========================================================= */
document.querySelectorAll(".tilt").forEach((card) => {
  card.addEventListener("mousemove", (e) => {
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    card.style.transform = `perspective(700px) rotateY(${px * 10}deg) rotateX(${-py * 10}deg) translateY(-4px)`;
  });
  card.addEventListener("mouseleave", () => { card.style.transform = ""; });
});

/* =========================================================
   THREE.JS BACKGROUND — particle constellation + core
   ========================================================= */
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const canvas = document.getElementById("bg-canvas");

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x05060c, 0.055);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.z = 14;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

/* --- particle field --- */
const COUNT = window.innerWidth < 700 ? 1400 : 3000;
const positions = new Float32Array(COUNT * 3);
const speeds = new Float32Array(COUNT);
const R = 26;
for (let i = 0; i < COUNT; i++) {
  positions[i * 3] = (Math.random() - 0.5) * R * 2;
  positions[i * 3 + 1] = (Math.random() - 0.5) * R * 2;
  positions[i * 3 + 2] = (Math.random() - 0.5) * R;
  speeds[i] = 0.2 + Math.random() * 0.8;
}
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

function makeSprite() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.25, "rgba(120,220,255,0.9)");
  grd.addColorStop(1, "rgba(120,220,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const pMat = new THREE.PointsMaterial({
  size: 0.18,
  map: makeSprite(),
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  color: 0x8fdcff,
});
const points = new THREE.Points(pGeo, pMat);
scene.add(points);

/* --- glowing wireframe core --- */
const coreGeo = new THREE.IcosahedronGeometry(3.2, 1);
const coreMat = new THREE.MeshBasicMaterial({ color: 0x8b5cff, wireframe: true, transparent: true, opacity: 0.28 });
const core = new THREE.Mesh(coreGeo, coreMat);
scene.add(core);

const coreGeo2 = new THREE.IcosahedronGeometry(2.1, 0);
const coreMat2 = new THREE.MeshBasicMaterial({ color: 0x38e8ff, wireframe: true, transparent: true, opacity: 0.45 });
const core2 = new THREE.Mesh(coreGeo2, coreMat2);
scene.add(core2);

/* --- pointer parallax --- */
const pointer = { x: 0, y: 0 };
window.addEventListener("mousemove", (e) => {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
});

let scrollY = 0;
window.addEventListener("scroll", () => { scrollY = window.scrollY; }, { passive: true });

const clock = new THREE.Clock();
function render() {
  const t = clock.getElapsedTime();
  const dt = Math.min(clock.getDelta(), 0.05);

  if (!reduceMotion) {
    // drift particles upward + wrap
    const pos = pGeo.attributes.position.array;
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3 + 1] += speeds[i] * dt * 0.6;
      if (pos[i * 3 + 1] > R) pos[i * 3 + 1] = -R;
    }
    pGeo.attributes.position.needsUpdate = true;

    points.rotation.y = t * 0.02;
    core.rotation.x = t * 0.12;
    core.rotation.y = t * 0.16;
    core2.rotation.x = -t * 0.18;
    core2.rotation.y = -t * 0.1;

    const scale = 1 + Math.sin(t * 1.5) * 0.04;
    core2.scale.setScalar(scale);
  }

  // parallax + scroll dive
  camera.position.x += (pointer.x * 2.2 - camera.position.x) * 0.04;
  camera.position.y += (-pointer.y * 1.6 - camera.position.y) * 0.04;
  const depth = 14 - Math.min(scrollY / 260, 6);
  camera.position.z += (depth - camera.position.z) * 0.05;
  camera.lookAt(0, 0, 0);

  renderer.render(scene, camera);
  requestAnimationFrame(render);
}
render();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
