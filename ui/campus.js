import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const { sin, cos, abs, PI, random } = Math;
const TAU = PI * 2;

// ================= Scene =================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcfe3f5);
scene.fog = new THREE.Fog(0xd8e8f5, 140, 420);
const camera = new THREE.PerspectiveCamera(45, innerWidth/innerHeight, 0.1, 1000);
camera.position.set(0, 44, 72);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = PI * 0.47;
controls.minDistance = 2; controls.maxDistance = 180;
controls.target.set(0, 0, 6);

scene.add(new THREE.HemisphereLight(0xd6ebff, 0x7a8f62, 1.7));
const sun = new THREE.DirectionalLight(0xfff3e0, 2.8);
sun.position.set(45, 70, 35); sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 48, bottom: -48, near: 1, far: 200 });
sun.shadow.bias = -0.0004;
scene.add(sun);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.45, 1.0));
composer.addPass(new OutputPass());

// ================= Materials & helpers =================
const cache = {};
const mat = (hex, r = 0.7, m = 0) => cache[`${hex}_${r}_${m}`] ??= new THREE.MeshStandardMaterial({ color: hex, roughness: r, metalness: m });
const glow = (hex, k = 3) => cache[`g${hex}_${k}`] ??= new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k) });
const glass = new THREE.MeshStandardMaterial({ color: 0xbfe6ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.16, depthWrite: false });
const dcGlass = new THREE.MeshStandardMaterial({ color: 0x7fdcff, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.22, depthWrite: false });

const staticRoot = new THREE.Group(); scene.add(staticRoot);
function mk(geo, m, parent, x, y, z, ry = 0, rx = 0, rz = 0) {
  const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); parent.add(o); return o;
}
const box = (p, w, h, d, m, x, y, z, ry = 0) => mk(new THREE.BoxGeometry(w, h, d), m, p, x, y, z, ry);
const cyl = (p, rt, rb, h, m, x, y, z, seg = 20) => mk(new THREE.CylinderGeometry(rt, rb, h, seg), m, p, x, y, z);
const ball = (p, r, m, x, y, z, s = [1, 1, 1]) => { const o = mk(new THREE.SphereGeometry(r, 16, 12), m, p, x, y, z); o.scale.set(...s); return o; };

const pick = a => a[random() * a.length | 0];
function label(text, color, scale = 5) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 220;
  const g = c.getContext('2d');
  g.fillStyle = '#FAF9F5'; g.beginPath(); g.roundRect(10, 10, 1004, 200, 40); g.fill();
  g.strokeStyle = '#E3DFD3'; g.lineWidth = 6; g.stroke();
  g.fillStyle = color; g.beginPath(); g.arc(90, 110, 30, 0, TAU); g.fill();
  g.fillStyle = '#141413'; g.textAlign = 'center'; g.textBaseline = 'middle';
  let fs = 88; do { g.font = `500 ${fs}px 'Iowan Old Style', Palatino, Georgia, serif`; fs -= 4; } while (g.measureText(text).width > 820 && fs > 36);
  g.fillText(text, 560, 115);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex })); s.scale.set(scale, scale * 0.215, 1);
  scene.add(s); return s;
}

// Screens: 4 generated textures (code, chart, spreadsheet, design)
function screenTex(kind) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 160; const g = c.getContext('2d');
  if (kind === 0) {
    g.fillStyle = '#1e1f2e'; g.fillRect(0, 0, 256, 160);
    const cols = ['#7aa2f7', '#9ece6a', '#e0af68', '#bb9af7', '#f7768e', '#c0caf5'];
    for (let y = 10; y < 155; y += 9) { let x = 8 + (random() * 4 | 0) * 12; while (x < 220 && random() > 0.15) { const w = 10 + random() * 40; g.fillStyle = cols[random() * 6 | 0]; g.fillRect(x, y, w, 4); x += w + 6; } }
  } else if (kind === 1) {
    g.fillStyle = '#f5f7fb'; g.fillRect(0, 0, 256, 160);
    g.fillStyle = '#2b3a55'; g.fillRect(0, 0, 256, 18);
    for (let i = 0; i < 10; i++) { const h = 20 + random() * 110; g.fillStyle = ['#4f8cff', '#2fbf71', '#ff8a3d'][i % 3]; g.fillRect(14 + i * 23, 150 - h, 15, h); }
  } else if (kind === 2) {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 160); g.fillStyle = '#1f7a4a'; g.fillRect(0, 0, 256, 16);
    g.strokeStyle = '#cfd6df'; for (let x = 0; x < 256; x += 32) { g.beginPath(); g.moveTo(x, 16); g.lineTo(x, 160); g.stroke(); }
    for (let y = 16; y < 160; y += 12) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); g.fillStyle = '#555'; for (let x = 4; x < 256; x += 32) if (random() > 0.3) g.fillRect(x, y + 4, 10 + random() * 14, 4); }
  } else {
    const gr = g.createLinearGradient(0, 0, 256, 160); gr.addColorStop(0, '#ff7eb3'); gr.addColorStop(1, '#7a5cff'); g.fillStyle = gr; g.fillRect(0, 0, 256, 160);
    g.fillStyle = '#ffffffcc'; g.beginPath(); g.arc(80, 80, 40, 0, TAU); g.fill(); g.fillStyle = '#ffd166'; g.fillRect(140, 40, 80, 80);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const screenMats = [0, 1, 2, 3].map(k => new THREE.MeshBasicMaterial({ map: screenTex(k) }));

// ================= Configuration =================
const REAL = { on: true };   // real mode: employees only move when an agent produces a result
const ROOMS = [
  { key: 'Manager',         name: 'Manager',         role: 'Conductor · chats with you',            icon: '🎯', color: 0x8A7FB3, screens: [1, 2, 1], metric: 'decisions' },
  { key: 'lead-generation', name: 'Lead Generation', role: 'Finds companies on target',             icon: '🔍', color: 0x6A9BCC, screens: [2, 1, 2], metric: 'companies' },
  { key: 'data-enrichment', name: 'Data Enrichment', role: 'Decision-maker, published email, hook', icon: '🧩', color: 0x788C5D, screens: [2, 0, 2], metric: 'records processed' },
  { key: 'email-writing',   name: 'Email Writing',   role: 'Writes the first emails',               icon: '✉️', color: 0xD97757, screens: [0, 3, 1], metric: 'drafts' },
  { key: 'follow-up',       name: 'Follow-up',       role: 'Follows up prospects with no reply',    icon: '🔁', color: 0xC9A063, screens: [1, 0, 3], metric: 'follow-ups' },
];
const BIG = 1.5;             // agent size: one big agent per department
const RR = 16;              // distance centre → salle
const DC_R = 6.3;           // data center radius
const angleOf = i => i * TAU / ROOMS.length;
const polar = (r, a, y = 0) => new THREE.Vector3(r * sin(a), y, r * cos(a));

// ================= Sol =================
const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ color: 0x86b45f, roughness: 1 }));
ground.rotation.x = -PI / 2; ground.position.y = -0.03; ground.receiveShadow = true; scene.add(ground);
const BW = 26, BH = 5;                       // building half-width and height
box(staticRoot, BW * 2, 0.12, BW * 2, mat(0xd9dde2, 0.35), 0, -0.06, 0);

// ================= Salles de bureau =================
const wallMat = mat(0xeef1f5, 0.9), frameMat = mat(0x5a6475, 0.5, 0.5), metal = mat(0x8a93a3, 0.4, 0.7);
const deskMat = mat(0xd9c3a0, 0.6), darkPlastic = mat(0x22262e, 0.5), chairMat = mat(0x2e3440, 0.8);
const DESKS = [[-3.9, -2.2], [-1.7, -2.2], [1.7, -2.2], [3.9, -2.2], [-3.9, 0.6], [-1.7, 0.6], [1.7, 0.6], [3.9, 0.6]];
const WALKER_DESKS = [0, 1, 2, 3, 4, 5, 6, 7];   // everyone stands up
const roomInfo = [];

function wall(g, x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1, L = Math.hypot(dx, dz), ry = Math.atan2(-dz, dx), mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
  box(g, L, 1.0, 0.15, wallMat, mx, 0.5, mz, ry);
  box(g, L, 1.6, 0.04, glass, mx, 1.8, mz, ry);
  box(g, L, 0.08, 0.16, frameMat, mx, 2.62, mz, ry);
}
function chair(g, x, cz, dyn) {
  let p = g, ox = x, oz = cz;
  if (dyn) { p = new THREE.Group(); g.updateMatrixWorld(true); p.position.copy(g.localToWorld(new THREE.Vector3(x, 0, cz))); g.getWorldQuaternion(p.quaternion); g.getWorldScale(p.scale); scene.add(p); ox = 0; oz = 0; }
  box(p, 0.48, 0.07, 0.46, chairMat, ox, 0.47, oz);
  box(p, 0.46, 0.55, 0.06, chairMat, ox, 0.8, oz + 0.22);
  cyl(p, 0.03, 0.03, 0.4, metal, ox, 0.24, oz);
  for (let k = 0; k < 5; k++) { const a = k * TAU / 5; box(p, 0.05, 0.04, 0.3, metal, ox + 0.13 * sin(a), 0.05, oz + 0.13 * cos(a), a); }
  if (dyn) p.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  return dyn ? p : null;
}
function desk(g, x, z, screenK, dyn) {
  box(g, 1.4, 0.05, 0.7, deskMat, x, 0.74, z);
  for (const [lx, lz] of [[-0.65, -0.3], [0.65, -0.3], [-0.65, 0.3], [0.65, 0.3]]) box(g, 0.04, 0.72, 0.04, metal, x + lx, 0.36, z + lz);
  box(g, 1.3, 0.35, 0.02, deskMat, x, 0.5, z - 0.32);
  // main screen
  box(g, 0.25, 0.02, 0.18, darkPlastic, x, 0.775, z - 0.2);
  box(g, 0.05, 0.25, 0.05, darkPlastic, x, 0.89, z - 0.22);
  box(g, 0.62, 0.38, 0.03, darkPlastic, x, 1.1, z - 0.22);
  mk(new THREE.PlaneGeometry(0.58, 0.34), screenMats[screenK], g, x, 1.1, z - 0.204);
  if (random() > 0.5) {  // second screen
    const sx = x + 0.55;
    box(g, 0.05, 0.25, 0.05, darkPlastic, sx, 0.89, z - 0.16);
    box(g, 0.46, 0.3, 0.03, darkPlastic, sx, 1.07, z - 0.16, -0.35);
    mk(new THREE.PlaneGeometry(0.42, 0.26), screenMats[(screenK + 1) % 4], g, sx + 0.005, 1.07, z - 0.144, -0.35);
  }
  box(g, 0.45, 0.02, 0.15, darkPlastic, x - 0.05, 0.775, z + 0.12);
  box(g, 0.06, 0.025, 0.1, darkPlastic, x + 0.3, 0.775, z + 0.12);
  cyl(g, 0.04, 0.035, 0.1, mat([0xffffff, 0xd9483b, 0x3b6fd8, 0xf2c14e][random() * 4 | 0], 0.4), x - 0.55, 0.815, z - 0.05);
  if (random() > 0.6) box(g, 0.21, 0.03, 0.3, mat(0xf4f4f4, 0.8), x + 0.45, 0.78, z + 0.05, 0.3); // documents
  return chair(g, x, z + 0.75, dyn);
}
function plant(g, x, z) {
  cyl(g, 0.22, 0.17, 0.4, mat(0xf0ece4, 0.8), x, 0.2, z);
  for (let k = 0; k < 7; k++) ball(g, 0.18 + random() * 0.08, mat(0x3f8f4a, 0.8), x + (random() - 0.5) * 0.3, 0.55 + random() * 0.45, z + (random() - 0.5) * 0.3);
}
function buildRoom(i) {
  const R = ROOMS[i], a = angleOf(i), col = new THREE.Color(R.color);
  const g = new THREE.Group(); g.position.copy(polar(RR, a)); g.rotation.y = a + PI; staticRoot.add(g); g.updateMatrixWorld(true);
  // floor, carpet, colour strip at the entrance
  box(g, 11, 0.1, 8, mat(col.clone().lerp(new THREE.Color(0xffffff), 0.82).getHex(), 0.9), 0, -0.04, 0);
  box(g, 9.8, 0.02, 5.2, mat(col.clone().lerp(new THREE.Color(0x40485a), 0.7).getHex(), 1), 0, 0.02, -0.75);
  box(g, 1.8, 0.02, 0.7, glow(R.color, 1.2), 0, 0.025, 3.6);
  // walls (solid base + glass), door in the middle of the front wall (towards the data center)
  wall(g, -5.5, -4, 5.5, -4); wall(g, -5.5, -4, -5.5, 4); wall(g, 5.5, -4, 5.5, 4);
  wall(g, -5.5, 4, -0.9, 4); wall(g, 0.9, 4, 5.5, 4);
  box(g, 0.12, 2.66, 0.22, frameMat, -0.9, 1.33, 4); box(g, 0.12, 2.66, 0.22, frameMat, 0.9, 1.33, 4);
  box(g, 1.92, 0.1, 0.22, glow(R.color, 2.5), 0, 2.62, 4);
  // the department agent's big desk
  const bg = new THREE.Group(); bg.position.set(0, 0, -1.2); bg.scale.setScalar(BIG); g.add(bg); g.updateMatrixWorld(true);
  const bigChair = desk(bg, 0, 0, R.screens[0], true);
  // tableau blanc
  box(g, 2.6, 1.3, 0.05, frameMat, 0, 1.55, -3.9); box(g, 2.5, 1.2, 0.02, mat(0xffffff, 0.3), 0, 1.55, -3.865);
  for (let k = 0; k < 6; k++) box(g, 0.3 + random() * 0.8, 0.025, 0.01, mat([0x3b6fd8, 0xd9483b, 0x2fbf71][k % 3], 0.5), -0.9 + random() * 1.2, 1.2 + k * 0.12, -3.85);
  // bookcase
  box(g, 1.3, 2.0, 0.4, mat(0x6b5a48, 0.8), -4.6, 1.0, -3.7);
  for (let s = 0; s < 4; s++) { let bx = -5.15; while (bx < -4.1) { const w = 0.06 + random() * 0.06, h = 0.28 + random() * 0.12; box(g, w, h, 0.28, mat([0xd9483b, 0x3b6fd8, 0xf2c14e, 0x2fbf71, 0xeeeeee, 0x444c5c][random() * 6 | 0], 0.8), bx + w / 2, 0.15 + s * 0.48 + h / 2, -3.62); bx += w + 0.01; } }
  // filing cabinet
  box(g, 1.2, 1.3, 0.5, mat(0x9aa3b0, 0.5, 0.4), 3.2, 0.65, -3.72);
  for (let d = 0; d < 4; d++) { box(g, 1.1, 0.012, 0.01, mat(0x5a6475, 0.5), 3.2, 0.3 + d * 0.3, -3.465); box(g, 0.18, 0.03, 0.03, metal, 3.2, 0.42 + d * 0.3, -3.46); }
  for (let d = 0; d < 5; d++) box(g, 0.05, 0.3, 0.24, mat([0xd9483b, 0x3b6fd8, 0xf2c14e][d % 3], 0.8), 2.85 + d * 0.13, 1.45, -3.72);
  // printer, water cooler, sofa, plants
  box(g, 0.8, 0.7, 0.6, mat(0xdde2e8, 0.6), 4.5, 0.35, 3.3); box(g, 0.7, 0.32, 0.55, mat(0xf4f6f8, 0.5), 4.5, 0.86, 3.3);
  box(g, 0.5, 0.02, 0.3, glow(0x7dfc9a, 1.5), 4.5, 1.03, 3.2);
  box(g, 0.38, 1.0, 0.38, mat(0xf4f6f8, 0.5), 3.5, 0.5, 3.45); cyl(g, 0.16, 0.16, 0.42, mat(0x7fc8ff, 0.1), 3.5, 1.21, 3.45);
  const sofa = mat(col.clone().lerp(new THREE.Color(0x2a2f3a), 0.45).getHex(), 0.9);
  box(g, 2.0, 0.42, 0.85, sofa, -3.6, 0.21, 3.25); box(g, 2.0, 0.55, 0.22, sofa, -3.6, 0.6, 3.6);
  box(g, 0.22, 0.6, 0.85, sofa, -4.6, 0.3, 3.25); box(g, 0.22, 0.6, 0.85, sofa, -2.6, 0.3, 3.25);
  plant(g, 4.9, -3.4); plant(g, -5.0, 2.0); plant(g, 2.6, 3.5);
  // sign above the door
  label(R.name, '#' + col.getHexString(), 5).position.copy(g.localToWorld(new THREE.Vector3(0, 3.5, 4.3)));
  roomInfo.push({ g, a, bg, chair: bigChair });
}
ROOMS.forEach((_, i) => buildRoom(i));
const roomLights = roomInfo.map(({ g }, i) => {
  const L = new THREE.PointLight(ROOMS[i].color, 0, 16, 1.4);
  L.position.copy(g.localToWorld(new THREE.Vector3(0, 3.2, 0))); scene.add(L); return L;
});

// ================= Paths to the data center =================
const pathMat = mat(0x3a4458, 0.8);
for (let i = 0; i < ROOMS.length; i++) {
  const a = angleOf(i), L = RR - 4 - DC_R, mid = DC_R + L / 2, c = ROOMS[i].color;
  const p = polar(mid, a, 0.03);
  box(staticRoot, 1.9, 0.06, L, pathMat, p.x, 0.03, p.z, a);
  for (const s of [-1, 1]) {
    const e = polar(mid, a).add(new THREE.Vector3(cos(a), 0, -sin(a)).multiplyScalar(0.95 * s));
    box(staticRoot, 0.06, 0.03, L, glow(c, 2.5), e.x, 0.07, e.z, a);
    for (let r = DC_R + 0.8; r < RR - 4; r += 1.4) {
      const b = polar(r, a).add(new THREE.Vector3(cos(a), 0, -sin(a)).multiplyScalar(1.2 * s));
      cyl(staticRoot, 0.06, 0.08, 0.5, frameMat, b.x, 0.25, b.z, 10);
      cyl(staticRoot, 0.065, 0.065, 0.08, glow(0xfff2cc, 2.2), b.x, 0.54, b.z, 10);
    }
  }
}
// light dots that "flow" towards the data center
const DOTS = 9;
const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), ROOMS.length * DOTS);
for (let i = 0; i < ROOMS.length; i++) for (let k = 0; k < DOTS; k++) dots.setColorAt(i * DOTS + k, new THREE.Color(ROOMS[i].color).multiplyScalar(3));
scene.add(dots);

// ================= Data center =================
mk(new THREE.CylinderGeometry(DC_R + 0.1, DC_R + 0.1, 0.12, 72), mat(0x1b2230, 0.6, 0.3), staticRoot, 0, 0.06, 0);
for (const r of [2.0, 3.0, 5.2]) mk(new THREE.RingGeometry(r, r + 0.03, 96), glow(0xE08A65, 0.8), staticRoot, 0, 0.125, 0, 0, -PI / 2);
const doorHalf = 1.05 / DC_R;
const isDoor = a => ROOMS.some((_, i) => abs(((a - angleOf(i) + PI) % TAU + TAU) % TAU - PI) < doorHalf + 0.02);
const N = 72, step = TAU / N;
for (let k = 0; k < N; k++) {
  const a = (k + 0.5) * step; if (isDoor(a)) continue;
  const p = polar(DC_R, a);
  box(staticRoot, DC_R * step + 0.01, 3.0, 0.06, dcGlass, p.x, 1.62, p.z, a);
  box(staticRoot, DC_R * step + 0.01, 0.22, 0.1, mat(0x2a3446, 0.5, 0.6), p.x, 0.23, p.z, a);
  if (k % 3 === 0) { const q = polar(DC_R, k * step); box(staticRoot, 0.08, 3.2, 0.12, frameMat, q.x, 1.7, q.z, k * step); }
}
mk(new THREE.TorusGeometry(DC_R, 0.06, 8, 128), glow(0xE08A65, 2.5), staticRoot, 0, 3.15, 0, 0, PI / 2);
for (let i = 0; i < ROOMS.length; i++) {
  const a = angleOf(i);
  for (const s of [-1, 1]) { const q = polar(DC_R, a + s * doorHalf); box(staticRoot, 0.14, 3.2, 0.2, frameMat, q.x, 1.7, q.z, a); }
  const h = polar(DC_R, a); box(staticRoot, 2.2, 0.14, 0.2, glow(ROOMS[i].color, 3), h.x, 3.05, h.z, a);
}
const dcLabel = label('DATA CENTER', '#D97757', 7); dcLabel.position.set(0, 5.8, 0);

// baies de serveurs
const RACKS = 4 * ROOMS.length, LED_COLS = 3, LED_ROWS = 14, LPR = LED_COLS * LED_ROWS;
const rackMat = mat(0x1c2230, 0.4, 0.7), rackFront = mat(0x0b0f17, 0.15, 0.6);
const leds = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.022, 0.01), new THREE.MeshBasicMaterial({ color: 0xffffff }), RACKS * LPR);
const ledOn = new Uint8Array(RACKS * LPR).map(() => random() > 0.4);
const ledPal = [0x3dff8a, 0xE08A65, 0xffb13d].map(c => new THREE.Color(c).multiplyScalar(2.5));
const ledOff = new THREE.Color(0x0a1a12), ledFlash = new THREE.Color(0xbfffff).multiplyScalar(4);
const rackFlash = new Float32Array(RACKS), rackFronts = [];
const dummy = new THREE.Object3D();
for (let k = 0; k < RACKS; k++) {
  const a = k * TAU / RACKS, rg = new THREE.Group();
  rg.position.copy(polar(4, a)); rg.rotation.y = a; staticRoot.add(rg); rg.updateMatrixWorld(true);
  box(rg, 0.8, 2.2, 1.0, rackMat, 0, 1.22, 0);
  box(rg, 0.74, 2.1, 0.02, rackFront, 0, 1.22, 0.505);
  for (let s = 0; s < 13; s++) box(rg, 0.7, 0.012, 0.01, mat(0x2c3446, 0.5, 0.6), 0, 0.3 + s * 0.15, 0.52);
  box(rg, 0.03, 0.5, 0.03, metal, 0.32, 1.2, 0.53);
  // glowing floor cable towards the core
  box(rg, 0.06, 0.02, 2.4, glow(0xE08A65, 1.2), 0, 0.13, -1.7);
  for (let c = 0; c < LED_COLS; c++) for (let r = 0; r < LED_ROWS; r++) {
    dummy.position.set(-0.24 + c * 0.17, 0.32 + r * 0.135, 0.525);
    dummy.updateMatrix(); dummy.matrix.premultiply(rg.matrixWorld);
    leds.setMatrixAt(k * LPR + c * LED_ROWS + r, dummy.matrix);
  }
  rackFronts.push(rg.localToWorld(new THREE.Vector3(0, 1.2, 0.6)));
}
for (let j = 0; j < RACKS * LPR; j++) leds.setColorAt(j, ledOff);
scene.add(leds);

// cœur central
mk(new THREE.CylinderGeometry(1.0, 1.1, 3.6, 40), mat(0x2a3446, 0.3, 0.8), staticRoot, 0, 1.92, 0);
for (let k = 0; k < 8; k++) { const p = polar(1.02, k * TAU / 8); box(staticRoot, 0.05, 3.2, 0.04, glow(0xE08A65, 2), p.x, 1.92, p.z, k * TAU / 8); }
const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xE08A65).multiplyScalar(2) });
const coreCap = new THREE.Mesh(new THREE.SphereGeometry(0.75, 32, 16, 0, TAU, 0, PI / 2), coreMat); coreCap.position.y = 3.72; scene.add(coreCap);
const rings = [0, 1, 2, 3].map(() => { const m = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.035, 8, 64), coreMat); m.rotation.x = PI / 2; scene.add(m); return m; });
const coreLight = new THREE.PointLight(0xE08A65, 25, 12); coreLight.position.y = 2.5; scene.add(coreLight);

// ================= Building =================
const Yax = new THREE.Vector3(0, 1, 0);
const concrete = mat(0xe6e8ec, 0.8), beamMat = mat(0x8f98a5, 0.5, 0.5);
const facadeGlass = new THREE.MeshStandardMaterial({ color: 0x9ec9e8, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.28, depthWrite: false });
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
for (let side = 0; side < 4; side++) {         // 0: front facade (+z, entrance)
  const ry = side * PI / 2, at = (u, y) => new THREE.Vector3(u, y, BW).applyAxisAngle(Yax, ry);
  for (let k = 0; k < 13; k++) {
    const c = -BW + 2 + k * 4, door = side === 0 && k === 6;
    let p;
    if (!door) {
      p = at(c, 0.4); box(staticRoot, 4, 0.8, 0.3, concrete, p.x, p.y, p.z, ry);
      p = at(c, 0.8 + (BH - 1.7) / 2); box(staticRoot, 4, BH - 1.7, 0.06, facadeGlass, p.x, p.y, p.z, ry);
      p = at(c, 0.8 + (BH - 1.7) / 2); box(staticRoot, 0.06, BH - 1.7, 0.1, beamMat, p.x, p.y, p.z, ry);
    }
    p = at(c, BH - 0.45); box(staticRoot, 4, 0.9, 0.36, concrete, p.x, p.y, p.z, ry);
  }
  for (let k = 0; k <= 13; k++) { const p = at(-BW + 4 * k, BH / 2); box(staticRoot, 0.5, BH, 0.5, concrete, p.x, p.y, p.z, ry); }
  // hedges along the facade
  for (let u = -BW + 1; u < BW; u += 1.6) {
    if (side === 0 && abs(u) < 7) continue;
    const p = at(u, 0.35).add(new THREE.Vector3(0, 0, 1.1).applyAxisAngle(Yax, ry));
    ball(staticRoot, 0.55 + random() * 0.15, mat(0x4f8a3c, 0.9), p.x, p.y, p.z, [1, 0.75, 1]);
  }
}
// entrance: open glass doors, canopy, mat, sign
for (const s of [-1, 1]) { box(staticRoot, 1.6, 3.0, 0.05, facadeGlass, 2.6 * s, 1.5, BW); box(staticRoot, 0.08, 3.0, 0.1, beamMat, 1.8 * s, 1.5, BW); }
box(staticRoot, 4, 0.5, 0.36, concrete, 0, 3.25, BW);
box(staticRoot, 10, 0.25, 5, concrete, 0, 3.7, BW + 2.4);
for (const s of [-1, 1]) cyl(staticRoot, 0.16, 0.16, 3.6, beamMat, 4.5 * s, 1.8, BW + 4.4);
box(staticRoot, 4, 0.02, 2.2, mat(0x30343b, 1), 0, 0.01, BW - 1.4);
const signTex = canvasTex(1024, 128, g => { g.fillStyle = '#1d2433'; g.fillRect(0, 0, 1024, 128); g.fillStyle = '#ffffff'; g.font = 'bold 96px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('N O V A C O R P', 512, 68); });
mk(new THREE.PlaneGeometry(11, 1.0), new THREE.MeshBasicMaterial({ map: signTex }), staticRoot, 0, BH - 0.45, BW + 0.19);

// hall d'accueil
const wood = mat(0xb48a5a, 0.6), white2 = mat(0xf4f5f7, 0.5);
box(staticRoot, 3.6, 0.05, 0.8, wood, 8, 0.76, 22.4);
box(staticRoot, 3.8, 1.1, 0.08, white2, 8, 0.55, 22.85);
box(staticRoot, 3.9, 0.05, 0.32, wood, 8, 1.12, 22.86);
box(staticRoot, 3.4, 0.05, 0.02, glow(0xE08A65, 2.5), 8, 0.85, 22.9);
box(staticRoot, 0.62, 0.38, 0.03, darkPlastic, 8, 1.06, 22.58); mk(new THREE.PlaneGeometry(0.58, 0.34), screenMats[2], staticRoot, 8, 1.06, 22.564, PI);
box(staticRoot, 0.05, 0.25, 0.05, darkPlastic, 8, 0.89, 22.6); box(staticRoot, 0.45, 0.02, 0.15, darkPlastic, 8, 0.79, 22.2);
box(staticRoot, 0.48, 0.07, 0.46, chairMat, 8, 0.47, 21.75); box(staticRoot, 0.46, 0.55, 0.06, chairMat, 8, 0.8, 21.53); cyl(staticRoot, 0.03, 0.03, 0.4, metal, 8, 0.24, 21.75);
const lobbySofa = mat(0x56657d, 0.9);
for (const s of [-1, 1]) { box(staticRoot, 2.4, 0.42, 0.9, lobbySofa, -8, 0.21, 23 + 1.5 * s); box(staticRoot, 2.4, 0.55, 0.22, lobbySofa, -8, 0.6, 23 + 1.85 * s); }
box(staticRoot, 1.4, 0.05, 0.8, wood, -8, 0.42, 23); for (const s of [-1, 1]) box(staticRoot, 0.06, 0.4, 0.06, metal, -8 + 0.6 * s, 0.2, 23);
for (const [x, z] of [[-3.5, 24.6], [3.5, 24.6], [-12.5, 24.6], [12.5, 24.6], [-24.5, -24.5], [24.5, -24.5], [-24.5, 12], [24.5, 12]]) plant(staticRoot, x, z);

function car(parent, x, z, ry, color) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; parent.add(g);
  box(g, 4.2, 0.7, 1.8, mat(color, 0.35, 0.4), 0, 0.62, 0);
  box(g, 2.2, 0.6, 1.62, mat(0x22303f, 0.15, 0.6), -0.2, 1.24, 0);
  for (const [wx, wz] of [[1.35, 0.85], [1.35, -0.85], [-1.35, 0.85], [-1.35, -0.85]]) mk(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 16), mat(0x1a1a1a, 0.8), g, wx, 0.34, wz, 0, PI / 2);
  for (const s of [-1, 1]) { box(g, 0.03, 0.14, 0.32, glow(0xfff4d6, 1.4), 2.11, 0.68, 0.6 * s); box(g, 0.03, 0.12, 0.3, glow(0xff3030, 1.4), -2.11, 0.7, 0.6 * s); }
  return g;
}
const CAR_COLORS = [0xd9483b, 0x3b6fd8, 0xf2f2f2, 0x2a2a2a, 0x8a929e, 0x2fbf71, 0xf2c14e, 0x6b4c9a, 0x1f3b5c];
// ================= Outside =================
// shared by every scenery: forecourt, benches, flags, sign, clouds
const paving = mat(0xd2cbbd, 0.9);
function bench(P, x, z, ry = 0) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; P.add(g);
  box(g, 1.8, 0.08, 0.5, wood, 0, 0.45, 0); box(g, 1.8, 0.4, 0.06, wood, 0, 0.7, 0.25);
  for (const s of [-1, 1]) box(g, 0.08, 0.45, 0.45, metal, 0.8 * s, 0.22, 0);
}
function tree(P, x, z, s = 1) {
  cyl(P, 0.16 * s, 0.22 * s, 2.4 * s, mat(0x6b4a2e, 0.9), x, 1.2 * s, z, 8);
  const leaf = mat(pick([0x3f7f3a, 0x4d8f41, 0x5c9c47, 0x386e34]), 0.85);
  for (let k = 0; k < 3; k++) mk(new THREE.IcosahedronGeometry((1.2 + random() * 0.5) * s, 1), leaf, P, x + (random() - 0.5) * s, (2.8 + k * 0.7) * s, z + (random() - 0.5) * s);
}
function scatter(n, rMin, rMax, ok, fn) {
  for (let placed = 0, tries = 0; placed < n && tries < n * 30; tries++) {
    const a = random() * TAU, r = rMin + random() * (rMax - rMin), x = r * sin(a), z = r * cos(a);
    if (ok(x, z)) { fn(x, z); placed++; }
  }
}
box(staticRoot, 34, 0.05, 9, paving, 0, 0.0, BW + 4.6);
for (const x of [-7, -3, 3, 7]) bench(staticRoot, x, BW + 7.2);
[0x3b6fd8, 0xffffff, 0xd9483b].forEach((c, k) => {
  const x = -15 + k * 1.6; cyl(staticRoot, 0.05, 0.06, 8, mat(0xdddddd, 0.3, 0.8), x, 4, BW + 4);
  mk(new THREE.PlaneGeometry(1.5, 1.0), new THREE.MeshStandardMaterial({ color: c, side: THREE.DoubleSide, roughness: 0.8 }), staticRoot, x + 0.78, 7.4, BW + 4);
});
const monTex = canvasTex(1024, 256, g => { g.fillStyle = '#e9e4da'; g.fillRect(0, 0, 1024, 256); g.fillStyle = '#1d2433'; g.font = 'bold 150px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('NovaCorp', 512, 135); });
box(staticRoot, 7, 1.6, 0.7, mat(0xe9e4da, 0.8), 13, 0.8, BW + 5.5);
mk(new THREE.PlaneGeometry(6.6, 1.5), new THREE.MeshStandardMaterial({ map: monTex, roughness: 0.8 }), staticRoot, 13, 0.85, BW + 5.86);
for (let x = 9.8; x <= 16.2; x += 0.9) ball(staticRoot, 0.35, mat(0xd9483b, 0.9), x, 0.2, BW + 6.4, [1, 0.6, 1]);
const cloudMat = new THREE.MeshBasicMaterial({ color: 0xf3f7fb });
for (let k = 0; k < 14; k++) {
  const cx = (random() - 0.5) * 500, cz = (random() - 0.5) * 500, cy = 70 + random() * 40;
  for (let n = 0; n < 6; n++) ball(staticRoot, 6 + random() * 6, cloudMat, cx + (random() - 0.5) * 22, cy + random() * 4, cz + (random() - 0.5) * 12, [1.4, 0.6, 1]);
}
const nearBuilding = (x, z) => abs(x) < BW + 8 && abs(z) < BW + 12;

// ---- Scenery 1: City (street, car park, buildings in the distance)
const CITY = new THREE.Group();
{
  const asphalt = mat(0x3d4147, 0.95), sidewalk = mat(0xc4beb2, 0.9), lineMat = mat(0xf2f2f2, 0.6);
  box(CITY, 900, 0.04, 9, asphalt, 0, 0.0, 41);
  for (let x = -300; x < 300; x += 7) box(CITY, 3, 0.02, 0.18, lineMat, x, 0.035, 41);
  for (const z of [35.2, 46.8]) box(CITY, 900, 0.16, 2.4, sidewalk, 0, 0.06, z);
  box(CITY, 26, 0.04, 46, asphalt, 43, 0.0, 0); box(CITY, 8, 0.04, 14, asphalt, 43, 0.0, 29);
  for (let z = -21; z <= 21; z += 3) for (const x of [33, 53]) box(CITY, 5.2, 0.02, 0.12, lineMat, x, 0.035, z);
  for (let z = -19.5; z <= 19.5; z += 3) { if (random() < 0.75) car(CITY, 33, z, 0, pick(CAR_COLORS)); if (random() < 0.75) car(CITY, 53, z, PI, pick(CAR_COLORS)); }
  for (let x = -120; x <= 120; x += 18) for (const [z, s] of [[35.2, 1], [46.8, -1]]) {
    cyl(CITY, 0.09, 0.12, 6, mat(0x4a525e, 0.5, 0.6), x, 3, z, 10);
    box(CITY, 0.1, 0.1, 1.4, mat(0x4a525e, 0.5, 0.6), x, 5.95, z + 0.7 * s); box(CITY, 0.35, 0.12, 0.6, mat(0xf4f4f4, 0.3), x, 5.88, z + 1.3 * s);
  }
  for (let x = -110; x <= 110; x += 11) for (const z of [33.4, 48.6]) if (z > 40 || (abs(x) > 19 && abs(x - 43) > 6)) tree(CITY, x + (random() - 0.5) * 2, z, 0.9 + random() * 0.3);
  scatter(70, 40, 140, (x, z) => !nearBuilding(x, z) && !(z > 31 && z < 51) && !(x > 28 && x < 58 && z > -26 && z < 38), (x, z) => tree(CITY, x, z, 0.8 + random() * 0.6));
  const winTex = [0x9fb3c8, 0xc9b79c, 0x8a9aab].map(base => canvasTex(128, 256, g => {
    g.fillStyle = '#' + new THREE.Color(base).getHexString(); g.fillRect(0, 0, 128, 256);
    for (let y = 8; y < 250; y += 14) for (let x = 8; x < 124; x += 16) { g.fillStyle = random() > 0.3 ? '#3d5a78' : '#e8eef4'; g.fillRect(x, y, 10, 8); }
  }));
  const cityMats = winTex.map(t => new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }));
  for (let k = 0; k < 46; k++) {
    const a = random() * TAU, r = 170 + random() * 90, w = 14 + random() * 22, h = 18 + random() * 70;
    box(CITY, w, h, w * (0.7 + random() * 0.6), pick(cityMats), r * sin(a), h / 2, r * cos(a), random() * PI);
  }
}

// ---- Scenery 2: Park (pond, paths, flowers, hills and mountains)
const PARK = new THREE.Group();
{
  mk(new THREE.RingGeometry(34, 36, 120), paving, PARK, 0, 0.012, 0, 0, -PI / 2);
  box(PARK, 2, 0.03, 40, paving, -44, 0.012, -10, -1.0);
  const water = mk(new THREE.CircleGeometry(1, 64), mat(0x4a9bd1, 0.08, 0.1), PARK, -62, 0.02, -26, 0, -PI / 2); water.scale.set(18, 11, 1);
  for (let k = 0; k < 60; k++) { const a = k * TAU / 60; ball(PARK, 0.5 + random() * 0.4, mat(0x9a9488, 0.9), -62 + 18.6 * sin(a), 0.1, -26 + 11.6 * cos(a), [1, 0.5, 1]); }
  for (let k = 0; k < 10; k++) { const a = k * TAU / 10 + 0.3; bench(PARK, 37 * sin(a), 37 * cos(a), a + PI); }
  const FLOWERS = [0xe84a5f, 0xf9c74f, 0x9b5de5, 0xffffff, 0xff8fab];
  for (let k = 0; k < 18; k++) {
    const a = k * TAU / 18, cx = 31 * sin(a), cz = 31 * cos(a); if (abs(cx) < 18 && cz > 25) continue;
    box(PARK, 2.6, 0.12, 1.4, mat(0x5a3d2a, 1), cx, 0.06, cz, a);
    for (let n = 0; n < 14; n++) ball(PARK, 0.13, mat(pick(FLOWERS), 0.8), cx + (random() - 0.5) * 2.2, 0.2, cz + (random() - 0.5) * 1.1);
  }
  scatter(170, 40, 160, (x, z) => !nearBuilding(x, z) && Math.hypot((x + 62) / 22, (z + 26) / 15) > 1, (x, z) => tree(PARK, x, z, 0.8 + random() * 0.8));
  for (let k = 0; k < 14; k++) { const a = k * TAU / 14 + random() * 0.3, r = 210 + random() * 60; ball(PARK, 50 + random() * 30, mat(pick([0x6fa84f, 0x7bb35a, 0x5f9a45]), 1), r * sin(a), -18, r * cos(a), [1, 0.45, 1]); }
  for (let k = 0; k < 9; k++) {
    const a = k * TAU / 9 + 0.2, r = 330 + random() * 60, h = 90 + random() * 60, x = r * sin(a), z = r * cos(a);
    mk(new THREE.ConeGeometry(h * 0.8, h, 7), mat(0x8c8f99, 0.95), PARK, x, h / 2 - 5, z);
    mk(new THREE.ConeGeometry(h * 0.27, h * 0.34, 7), mat(0xf4f6f8, 0.9), PARK, x, h - 5 - h * 0.17 + 0.5, z);
  }
}

// ---- Scenery 3: Seaside (beach, palm trees, parasols, boats)
const SEA = new THREE.Group();
{
  box(SEA, 900, 0.06, 400, mat(0x2f8fc4, 0.12, 0.15), 0, 0.0, -270);
  box(SEA, 900, 0.03, 8, mat(0xcdb98a, 0.9), 0, 0.0, -66);
  box(SEA, 900, 0.07, 1.2, glow(0xffffff, 0.9), 0, 0.0, -70);
  function palm(x, z, s = 1) {
    const lean = (random() - 0.5) * 0.5; let px = x, py = 0;
    for (let i = 0; i < 6; i++) { const h = 0.9 * s; mk(new THREE.CylinderGeometry(0.15 * s, 0.19 * s, h, 8), mat(0x8b6b45, 0.9), SEA, px, py + h / 2, z, 0, 0, -lean * i * 0.15); px += lean * i * 0.15 * h; py += h * 0.98; }
    const leaf = mat(pick([0x3f8f3a, 0x4fa043]), 0.8);
    for (let k = 0; k < 7; k++) { const a = k * TAU / 7; mk(new THREE.BoxGeometry(2.6 * s, 0.05, 0.55 * s), leaf, SEA, px + cos(a) * 1.15 * s, py - 0.35 * s, z - sin(a) * 1.15 * s, a, 0, -0.45); }
    for (let k = 0; k < 3; k++) ball(SEA, 0.16 * s, mat(0x6b4a2e, 0.7), px + (random() - 0.5) * 0.3, py - 0.15, z + (random() - 0.5) * 0.3);
  }
  for (let x = -120; x <= 120; x += 9) palm(x + (random() - 0.5) * 4, -58 + (random() - 0.5) * 6, 0.9 + random() * 0.4);
  scatter(50, 38, 120, (x, z) => !nearBuilding(x, z) && z > -50, (x, z) => palm(x, z, 0.8 + random() * 0.5));
  const UMB = [0xe84a5f, 0xf9c74f, 0x3b6fd8, 0x2fbf71, 0xff8a3d];
  for (let k = 0; k < 16; k++) {
    const x = -90 + k * 12 + (random() - 0.5) * 4, z = -63 + (random() - 0.5) * 3, c = pick(UMB);
    cyl(SEA, 0.04, 0.04, 2.4, mat(0xeeeeee, 0.5), x, 1.2, z, 8);
    mk(new THREE.ConeGeometry(1.4, 0.55, 12), mat(c, 0.7), SEA, x, 2.45, z);
    box(SEA, 0.9, 0.02, 1.8, mat(pick(UMB), 0.9), x + 1.1, 0.03, z + 0.4, random());
  }
  box(SEA, 3, 0.25, 40, wood, 0, 0.6, -78);
  for (let z = -60; z >= -98; z -= 4) for (const s of [-1, 1]) cyl(SEA, 0.12, 0.12, 1.5, wood, 1.4 * s, 0.1, z, 8);
  for (let k = 0; k < 9; k++) {
    const x = (random() - 0.5) * 300, z = -110 - random() * 150, g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = random() * TAU; SEA.add(g);
    box(g, 4, 0.7, 1.4, mat(0xf4f4f4, 0.5), 0, 0.35, 0); box(g, 0.08, 4, 0.08, mat(0x999999, 0.5), 0, 2.5, 0);
    box(g, 0.04, 3.2, 1.8, mat(pick([0xffffff, 0xf9c74f, 0xe84a5f]), 0.8), 0.15, 2.4, 0.95, 0.15);
  }
}

// ================= Static geometry merge (performance) =================
function mergeInto(root) {
  root.updateMatrixWorld(true);
  const byMat = new Map(), out = new THREE.Group();
  root.traverse(o => {
    if (!o.isMesh) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(g);
  });
  if (root.parent) root.parent.remove(root);
  for (const [m, list] of byMat) {
    const mesh = new THREE.Mesh(mergeGeometries(list), m);
    mesh.castShadow = !m.transparent && !m.isMeshBasicMaterial;
    mesh.receiveShadow = !m.isMeshBasicMaterial;
    out.add(mesh);
  }
  scene.add(out); return out;
}
mergeInto(staticRoot);

// ciel
{
  const geo = new THREE.SphereGeometry(800, 32, 16), cols = [], top = new THREE.Color(0x3f86d4), hor = new THREE.Color(0xdcecf8), c = new THREE.Color();
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) { const h = Math.max(0, pos.getY(i) / 800); c.copy(hor).lerp(top, Math.pow(h, 0.6)); cols.push(c.r, c.g, c.b); }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })));
}
const traffic = [];
const trafficGroup = new THREE.Group(); scene.add(trafficGroup);
for (let k = 0; k < 6; k++) {
  const dir = k % 2 ? 1 : -1, g = car(trafficGroup, (random() - 0.5) * 300, dir > 0 ? 39 : 43, dir > 0 ? 0 : PI, pick(CAR_COLORS));
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  traffic.push({ g, dir, speed: 9 + random() * 5 });
}
const DECORS = [
  { label: 'City', group: mergeInto(CITY), ground: 0x86b45f, traffic: true },
  { label: 'Park', group: mergeInto(PARK), ground: 0x7cb85a, traffic: false },
  { label: 'Seaside', group: mergeInto(SEA), ground: 0xe9d6a6, traffic: false },
];
let decorIdx = 0;
function setDecor(i) {
  decorIdx = i;
  DECORS.forEach((d, k) => d.group.visible = k === i);
  ground.material.color.setHex(DECORS[i].ground);
  trafficGroup.visible = DECORS[i].traffic;
}
setDecor(0);

// ================= Humains =================
const HG = {
  pelvis: new THREE.SphereGeometry(0.14, 16, 12), torso: new THREE.CapsuleGeometry(0.14, 0.24, 4, 12),
  neck: new THREE.CylinderGeometry(0.045, 0.05, 0.1, 10), head: new THREE.SphereGeometry(0.11, 20, 16),
  hair: new THREE.SphereGeometry(0.118, 20, 10, 0, TAU, 0, PI * 0.55), eye: new THREE.SphereGeometry(0.013, 8, 6),
  shoulder: new THREE.SphereGeometry(0.056, 12, 10), upper: new THREE.CapsuleGeometry(0.042, 0.2, 4, 10),
  fore: new THREE.CapsuleGeometry(0.036, 0.18, 4, 10), hand: new THREE.SphereGeometry(0.045, 10, 8),
  thigh: new THREE.CapsuleGeometry(0.068, 0.28, 4, 10), shin: new THREE.CapsuleGeometry(0.054, 0.28, 4, 10),
  shoe: new THREE.BoxGeometry(0.1, 0.075, 0.26), cube: new THREE.BoxGeometry(0.24, 0.24, 0.24),
};
const SKIN = [0xf1c9a5, 0xe2ad86, 0xc68b59, 0x8d5a3b, 0x5c3a24], HAIR = [0x1c1410, 0x3a2316, 0x6b4423, 0xc9a15a, 0x8a8a8a, 0xa0522d];
const SHIRT = [0xffffff, 0x3b6fd8, 0x2fbf71, 0xe85d4a, 0x444c5c, 0xf2c14e, 0x9b59b6, 0x87ceeb], PANTS = [0x2f4b7c, 0x333333, 0x5a4a3a, 0x22313f, 0x7a7a7a];

function makeHuman(shirtHex) {
  const skin = mat(pick(SKIN), 0.6), hair = mat(pick(HAIR), 0.9), shirt = mat(shirtHex ?? pick(SHIRT), 0.8), pants = mat(pick(PANTS), 0.9);
  const root = new THREE.Group(), J = {};
  const grp = (p, pos) => { const g = new THREE.Group(); g.position.set(...pos); p.add(g); return g; };
  const add = (geo, m, p, pos, s, r) => { const o = new THREE.Mesh(geo, m); o.position.set(...pos); if (s) o.scale.set(...s); if (r) o.rotation.set(...r); o.castShadow = true; p.add(o); return o; };
  J.hips = grp(root, [0, 0.93, 0]); add(HG.pelvis, pants, J.hips, [0, 0, 0], [1.05, 0.7, 0.78]);
  J.spine = grp(J.hips, [0, 0.05, 0]); add(HG.torso, shirt, J.spine, [0, 0.26, 0], [1.12, 1, 0.7]);
  add(HG.neck, skin, J.spine, [0, 0.52, 0]);
  J.head = grp(J.spine, [0, 0.56, 0]);
  add(HG.head, skin, J.head, [0, 0.12, 0], [0.9, 1.08, 0.95]);
  add(HG.hair, hair, J.head, [0, 0.14, -0.01], [0.92, 1.05, 1], [-0.25, 0, 0]);
  if (random() > 0.55) add(HG.head, hair, J.head, [0, 0.06, -0.06], [0.95, 1.25, 0.6]);
  for (const s of [-1, 1]) add(HG.eye, mat(0x111111, 0.3), J.head, [0.037 * s, 0.135, 0.095]);
  for (const s of [1, -1]) {
    const k = s > 0 ? 'L' : 'R';
    const sh = J[k + 'Sh'] = grp(J.spine, [0.19 * s, 0.42, 0]);
    add(HG.shoulder, shirt, sh, [0, 0, 0]); add(HG.upper, shirt, sh, [0, -0.14, 0]);
    const el = J[k + 'El'] = grp(sh, [0, -0.28, 0]);
    add(HG.fore, skin, el, [0, -0.12, 0]); add(HG.hand, skin, el, [0, -0.27, 0], [0.6, 1, 0.9]);
    const hp = J[k + 'Hip'] = grp(J.hips, [0.085 * s, -0.03, 0]); hp.rotation.order = 'ZXY';
    add(HG.thigh, pants, hp, [0, -0.2, 0]);
    const kn = J[k + 'Knee'] = grp(hp, [0, -0.42, 0]);
    add(HG.shin, pants, kn, [0, -0.2, 0]);
    const an = J[k + 'Ank'] = grp(kn, [0, -0.42, 0]);
    add(HG.shoe, mat(0x2a2a2a, 0.6), an, [0, -0.04, 0.05]);
  }
  scene.add(root);
  return { root, J };
}

const seated = [];

// moving employees: they work seated, stand up, fetch a folder,
// drop it at the data center, then come back and sit down
function makeFolder(color) {
  const f = new THREE.Group();
  f.add(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.06, 0.25), glow(color, 1.6)));
  const paper = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.02, 0.22), mat(0xffffff, 0.6)); paper.position.set(0.01, 0.04, -0.02); f.add(paper);
  f.position.set(0, 0.25, 0.4); f.visible = false; return f;
}
const walkers = [];
ROOMS.forEach((R, i) => {
  const { g, a, bg, chair: bigChair } = roomInfo[i];
  const RL = (x, z) => g.localToWorld(new THREE.Vector3(x, 0, z));      // room frame
  const BL = (x, z) => bg.localToWorld(new THREE.Vector3(x, 0, z));     // big desk frame
  const F = BL(0, 0.66), SIDE = BL(0.6, 0.66);
  const rackK = i * RACKS / ROOMS.length;
  const rack = [polar(DC_R + 0.9, a), polar(DC_R - 0.7, a), polar(5.3, a)];
  const h = makeHuman(R.color);
  h.root.scale.setScalar(BIG);
  h.root.traverse(o => { o.userData.room = i; });
  const cube = makeFolder(R.color); h.J.spine.add(cube);
  const w = { ...h, room: i, idx: i, a, sitH: a, rackFace: a + PI, cube, rackK, F,
    fetch: { route: [SIDE, RL(1.6, 1.0), RL(1.6, 2.5), RL(4.0, 2.5)], face: a + PI, back: [RL(1.6, 2.5), RL(0, 3.4), RL(0, 4.7)], what: 'printer' },
    rack, chair: bigChair, chairIn: BL(0, 0.75), chairOut: BL(0, 0.99), seatIn: BL(0, 0.78), seatOut: BL(0, 1.02),
    ret: [rack[1], rack[0], RL(0, 4.7), RL(0, 3.4), RL(1.6, 1.0), SIDE, F],
    state: 'sit', t: 0, dur: REAL.on ? Infinity : 4 + random() * 20, heading: a, prevHeading: a, off: 0, ph: random(), mw: 0, tw: 0, cur: {},
    waveT: 0, waveCD: 0, other: null, seatWaveCD: 0 };
  w.pos = w.seatIn.clone();
  walkers.push(w);
});

// receptionist at the front desk
{
  const h = makeHuman(0x2b3a55), J = h.J;
  h.root.position.set(8, 0, 21.78); h.root.rotation.y = 0;
  J.hips.position.y = 0.55; J.LHip.rotation.x = J.RHip.rotation.x = -PI / 2; J.LKnee.rotation.x = J.RKnee.rotation.x = PI / 2;
  J.spine.rotation.x = 0.08; J.LSh.rotation.x = J.RSh.rotation.x = -1.0; J.LSh.rotation.z = -0.12; J.RSh.rotation.z = 0.12;
  seated.push({ J, off: 3, pos: h.root.position, a: 0, waveT: 0, cd: 0 });
}

// ================= Interface =================
const counts = ROOMS.map(() => 0); let total = 0;
const pulses = [];
const pulseGeo = new THREE.SphereGeometry(0.12, 12, 8);
let coreFlash = 0;
function deposit(w) {
  if (!REAL.on) { counts[w.room]++; total++; const el = document.getElementById('c' + w.room); if (el) el.textContent = counts[w.room]; }
  const k = w.rackK;
  rackFlash[k] = 0.6;
  const m = new THREE.Mesh(pulseGeo, glow(ROOMS[w.room].color, 4)); scene.add(m);
  pulses.push({ m, from: rackFronts[k].clone(), t: 0 });
}

let fly = null, follow = -1, followT = 0;
function flyTo(pos, target) { follow = -1; document.getElementById('follow').textContent = ''; fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: target, t: 0 }; }
document.getElementById('bOver').onclick = () => flyTo(new THREE.Vector3(0, 44, 72), new THREE.Vector3(0, 0, 6));
document.getElementById('bOut').onclick = () => flyTo(new THREE.Vector3(-34, 14, 70), new THREE.Vector3(0, 2, 12));
document.getElementById('bDecor').onclick = e => { setDecor((decorIdx + 1) % DECORS.length); e.target.textContent = 'Scenery: ' + DECORS[decorIdx].label; };
document.getElementById('bDC').onclick = () => flyTo(new THREE.Vector3(7.5, 6.5, 9), new THREE.Vector3(0, 1.5, 0));
document.getElementById('bFollow').onclick = () => {
  fly = null; follow = (follow + 1) % walkers.length; followT = 0;
};

// ================= Boucle =================
const ease = k => k * k * (3 - 2 * k);
const angLerp = (a, b, k) => a + ((((b - a + PI) % TAU) + TAU) % TAU - PI) * k;
function setJ(w, key, v, k) {
  const [j, ax] = key.split('.'); const c = w.cur;
  c[key] = c[key] === undefined ? v : c[key] + (v - c[key]) * k;
  (ax[0] === 'p' ? w.J[j].position : w.J[j].rotation)[ax[1]] = c[key];
}
const SPEED = 0.95;                 // m/s : marche de bureau
const SL = 0.55, STANCE = 0.62;     // stance-foot travel per step, share of the cycle on the ground
const L1 = 0.42, L2 = 0.42, ANK = 0.08, TRACK = 0.1, SEAT_FOOT_Z = 0.36;
const KEYS = ['hips.px', 'hips.py', 'hips.pz', 'hips.ry', 'hips.rz', 'spine.rx', 'spine.ry', 'head.rx', 'head.ry',
  'LSh.rx', 'RSh.rx', 'LSh.rz', 'RSh.rz', 'LEl.rx', 'REl.rx', 'LEl.rz', 'REl.rz'];
const base = k => k === 'hips.py' ? 0.92 : 0;
const clamp1 = x => Math.max(-1, Math.min(1, x));
const lerp = (a, b, u) => a + (b - a) * u;
const vlerp = (a, b, u, out) => out.lerpVectors(a, b, u);
function startWalk(w, route, then, face) { w.route = route; w.ri = 0; w.state = 'walk'; w.then = then; w.face = face; w.t = 0; }
const relYaw = (from, heading, to) => (((Math.atan2(to.x - from.x, to.z - from.z) - heading + PI) % TAU) + TAU) % TAU - PI;

// one foot's path (character frame) by phase: stance (heel → toe) then swing
function footGait(ph, sl, lift) {
  const roll = Math.min(1, sl / 0.3);
  if (ph < STANCE) {
    const u = ph / STANCE; let pitch = 0;
    if (u < 0.12) pitch = -0.28 * (1 - u / 0.12) * roll;        // heel strike, the foot lands
    else if (u > 0.78) pitch = 0.55 * ((u - 0.78) / 0.22) * roll; // the heel lifts
    return { z: sl / 2 - sl * u, pitch, y: ANK + (pitch > 0 ? 0.16 * sin(pitch) : 0.06 * sin(-pitch)) };
  }
  const u = (ph - STANCE) / (1 - STANCE);
  const pitch = lerp(0.55, -0.28, Math.min(1, u * 1.3)) * roll;
  return { z: -sl / 2 + sl * ease(u), pitch, y: ANK + lift * sin(PI * u) + (pitch > 0 ? 0.16 * sin(pitch) : 0.06 * sin(-pitch)) };
}

// two-segment analytic IK: puts the ankle on the target, then orients the foot
const _t = new THREE.Vector3();
function solveLeg(w, side, foot) {
  const J = w.J, hip = J[side + 'Hip'], knee = J[side + 'Knee'], ank = J[side + 'Ank'];
  _t.set(foot.x, foot.y, foot.z); w.root.localToWorld(_t); J.hips.worldToLocal(_t);
  const dx = _t.x - hip.position.x, dy = _t.y - hip.position.y, dz = _t.z - hip.position.z;
  const D = Math.min(Math.max(Math.hypot(dx, dy, dz), 0.3), L1 + L2 - 0.002);
  const roll = Math.atan2(dx, -dy), phi = Math.atan2(dz, Math.hypot(dx, dy));
  const alpha = Math.acos(clamp1((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D)));
  const bend = PI - Math.acos(clamp1((L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2)));
  hip.rotation.set(-phi - alpha, 0, roll);
  knee.rotation.x = bend;
  ank.rotation.set(foot.pitch - (-phi - alpha + bend), 0, -roll - J.hips.rotation.z);
}

// seated pose: s = 0 standing in front of the chair, 1 seated; feet stay on the ground
function seatPose(P, s) {
  const e = ease(s);
  P['hips.pz'] = SEAT_FOOT_Z * (1 - ease(Math.min(1, s * 1.3)));   // the pelvis moves back…
  P['hips.py'] = 0.92 - 0.37 * e;                                     // …and down
  P['spine.rx'] = 0.08 * e + 0.6 * sin(PI * s);                       // torso leaning for balance
  P['head.rx'] = 0.08 * e - 0.25 * sin(PI * s);
  P['LSh.rx'] = P['RSh.rx'] = -1.0 * e - 0.35 * sin(PI * s);
  P['LEl.rx'] = P['REl.rx'] = -0.45 * e;
  P['LSh.rz'] = -0.12 * e; P['RSh.rz'] = 0.12 * e;
}

function updateWalker(w, dt, t) {
  const k = 1 - Math.exp(-dt * 14), P = {};
  w.t += dt; w.waveT -= dt; w.waveCD -= dt;
  const T = w.t; let moving = false, seated = false, moved = 0;
  const faceTo = f => w.heading = angLerp(w.heading, f, 1 - Math.exp(-dt * 5));

  if (w.state === 'sit') {
    seated = true; w.pos.copy(w.seatIn); w.heading = w.a; seatPose(P, 1);
    P['LEl.rx'] = -0.45 + 0.06 * sin(t * 13 + w.room); P['REl.rx'] = -0.45 + 0.06 * sin(t * 13 + w.room + 1.7);
    w.seatWaveCD -= dt;
    let near = null, best = 2.4;
    for (const o of walkers) if (o !== w && o.state === 'walk') { const d = o.root.position.distanceTo(w.seatIn); if (d < best) { best = d; near = o; } }
    P['head.ry'] = near ? Math.max(-1.1, Math.min(1.1, relYaw(w.seatIn, w.a, near.root.position))) : 0.2 * sin(t * 0.3 + w.idx * 2) ** 3;
    if (near) P['head.rx'] = -0.05;
    if (near && best < 1.6 && w.seatWaveCD <= 0 && near.waveCD <= 0) {
      w.seatWaveCD = 15; if (random() < 0.5) { w.waveT = 1.4; near.waveT = 1.4; near.waveCD = 6; near.other = w.seatIn; }
    }
    if (w.waveT > 0) { P['RSh.rz'] = -2.3; P['RSh.rx'] = -0.2; P['REl.rz'] = -0.3 + 0.3 * sin(t * 10); P['REl.rx'] = 0; }
    if (T > w.dur) { w.state = 'standUp'; w.t = 0; }
  } else if (w.state === 'standUp') {
    seated = true; w.heading = w.a;
    if (T < 0.5) { const u = ease(T / 0.5); vlerp(w.chairIn, w.chairOut, u, w.chair.position); vlerp(w.seatIn, w.seatOut, u, w.pos); seatPose(P, 1); }
    else if (T < 1.8) { w.pos.copy(w.seatOut); seatPose(P, 1 - (T - 0.5) / 1.3); }
    else { seated = false; w.pos.copy(w.F); w.cur['hips.pz'] = 0; startWalk(w, w.fetch.route, 'pickup', w.fetch.face); }
  } else if (w.state === 'walk') {
    const target = w.route[w.ri], dx = target.x - w.pos.x, dz = target.z - w.pos.z, dist = Math.hypot(dx, dz);
    const hx = sin(w.heading), hz = cos(w.heading);
    let blocked = false;
    for (const o of walkers) {
      if (o === w || o.state !== 'walk' || cos(o.heading - w.heading) < 0.5) continue;
      const ox = o.root.position.x - w.root.position.x, oz = o.root.position.z - w.root.position.z;
      const ahead = ox * hx + oz * hz, lat = abs(ox * hz - oz * hx);
      if (ahead > 0 && ahead < 0.75 && lat < 0.35) { blocked = true; break; }
    }
    const st = blocked ? 0 : SPEED * w.root.scale.x * dt;
    if (dist <= st) {
      w.pos.copy(target); moved = dist;
      if (++w.ri >= w.route.length) { w.state = w.then === 'sitDown' ? 'turnSit' : w.then; w.t = 0; }
    } else {
      w.pos.x += dx / dist * st; w.pos.z += dz / dist * st; moved = st;
      w.heading = angLerp(w.heading, Math.atan2(dx, dz), 1 - Math.exp(-dt * 7));
    }
    moving = true;
  } else if (w.state === 'turnSit') {          // turns to face the desk, back to the chair
    faceTo(w.a);
    if (T > 0.9) { w.state = 'sitDown'; w.t = 0; w.heading = w.a; w.pos.copy(w.seatOut); w.cur['hips.pz'] = SEAT_FOOT_Z; seated = true; seatPose(P, 0); }
  } else if (w.state === 'sitDown') {
    seated = true; w.heading = w.a;
    if (T < 1.3) { w.pos.copy(w.seatOut); seatPose(P, T / 1.3); }
    else if (T < 1.8) { const u = ease((T - 1.3) / 0.5); vlerp(w.chairOut, w.chairIn, u, w.chair.position); vlerp(w.seatOut, w.seatIn, u, w.pos); seatPose(P, 1); }
    else { w.state = 'sit'; w.t = 0; w.dur = REAL.on ? Infinity : 15 + random() * 35; seatPose(P, 1); }
  } else if (w.state === 'pickup') {
    faceTo(w.fetch.face);
    const reach = T > 0.4 && T < 1.2 ? 1 : 0;
    if (T > 0.9) w.cube.visible = true;
    P['LSh.rx'] = P['RSh.rx'] = -1.2 * reach; P['head.rx'] = 0.15 * reach; P['spine.rx'] = 0.12 * reach;
    if (T > 1.6) startWalk(w, [...w.fetch.back, ...w.rack], 'deposit', w.a + PI);
  } else if (w.state === 'deposit') {
    faceTo(w.a + PI);
    if (T > 0.9 && w.cube.visible) { w.cube.visible = false; deposit(w); }
    if (T > 1.8) startWalk(w, w.ret, 'sitDown', w.a);
  }

  // ---- character placement
  const turnRate = abs(angLerp(0, w.heading - w.prevHeading, 1)) / Math.max(dt, 1e-4); w.prevHeading = w.heading;
  const r = Math.hypot(w.pos.x, w.pos.z);
  w.off += (0 - w.off) * k;     // chacun garde sa droite
  w.root.position.set(w.pos.x - cos(w.heading) * w.off, 0, w.pos.z + sin(w.heading) * w.off);
  w.root.rotation.y = w.heading;

  // ---- locomotion
  let feet;
  if (seated) {
    w.mw = w.tw = 0;
    feet = { L: { x: TRACK, y: ANK, z: SEAT_FOOT_Z, pitch: 0 }, R: { x: -TRACK, y: ANK, z: SEAT_FOOT_Z, pitch: 0 } };
  } else {
    w.mw += ((moving ? 1 : 0) - w.mw) * (1 - Math.exp(-dt * 6));
    w.tw += ((!moving && turnRate > 0.7 ? 1 : 0) - w.tw) * (1 - Math.exp(-dt * 8));
    w.ph = (w.ph + moved / (SL * w.root.scale.x / STANCE) + w.tw * dt * 1.4) % 1;      // the phase advances with distance: no sliding
    const sl = SL * w.mw, lift = 0.09 * Math.max(w.mw, w.tw);
    const fl = footGait(w.ph, sl, lift), fr = footGait((w.ph + 0.5) % 1, sl, lift);
    feet = { L: { x: TRACK, ...fl }, R: { x: -TRACK, ...fr } };
    const c = cos(TAU * (w.ph - STANCE / 2)), c2 = cos(2 * TAU * (w.ph - STANCE / 2)), m = w.mw;
    P['hips.py'] = lerp(0.92 + 0.005 * sin(t * 1.7), 0.875 + 0.018 * c2, m);   // rises in the middle of each stance
    P['hips.px'] = 0.022 * c * m + 0.012 * sin(t * 0.5) * (1 - m);             // weight transfer
    P['hips.rz'] = 0.035 * c * m;
    P['hips.ry'] = -0.12 * (fl.z - fr.z) / SL * m;
    P['spine.ry'] = 0.2 * (fl.z - fr.z) / SL * m;
    P['spine.rx'] = (P['spine.rx'] ?? 0) + 0.04 * m;
    if (!w.cube.visible && w.state === 'walk') {
      P['LSh.rx'] = -0.9 * fr.z / SL * m; P['RSh.rx'] = -0.9 * fl.z / SL * m;   // arms opposite to legs
      P['LEl.rx'] = -0.25 + Math.min(0, P['LSh.rx']) * 0.5; P['REl.rx'] = -0.25 + Math.min(0, P['RSh.rx']) * 0.5;
      P['LSh.rz'] = 0.08; P['RSh.rz'] = -0.08;
    }
  }
  if (w.cube.visible) {
    const reach = w.state === 'deposit' && w.t < 1.0 ? 1 : 0;
    P['LSh.rx'] = P['RSh.rx'] = -0.9 - 0.4 * reach; P['LEl.rx'] = P['REl.rx'] = -0.7 * (1 - reach);
    P['LSh.rz'] = -0.15; P['RSh.rz'] = 0.15;
  }
  if (w.waveT > 0 && w.other && !seated) {      // waving at a colleague
    P['head.ry'] = Math.max(-1, Math.min(1, relYaw(w.root.position, w.heading, w.other)));
    if (!w.cube.visible) { P['RSh.rz'] = -2.5; P['RSh.rx'] = 0; P['REl.rz'] = -0.35 + 0.35 * sin(t * 10); P['REl.rx'] = 0; }
    else P['head.rx'] = 0.25 * Math.max(0, sin(t * 7));
  }
  for (const key of KEYS) setJ(w, key, P[key] ?? base(key), k);

  // ---- legs: inverse kinematics towards the feet
  w.root.updateMatrixWorld(true);
  solveLeg(w, 'L', feet.L); solveLeg(w, 'R', feet.R);
  if (w.ring) { w.ring.position.set(w.root.position.x, 0.04, w.root.position.z); w.tag.position.set(w.root.position.x, 3.55, w.root.position.z); }
}

function updateSeated(s, dt, t) {
  const k = 1 - Math.exp(-dt * 8), J = s.J;
  s.waveT -= dt; s.cd -= dt;
  // looks at the colleague walking past
  let near = null, best = 2.4;
  for (const w of walkers) if (w.state !== 'sit') { const d = w.root.position.distanceTo(s.pos); if (d < best) { best = d; near = w; } }
  let yaw = 0.2 * sin(t * 0.25 + s.off) ** 3, pitch = 0.08 + 0.03 * sin(t * 0.5 + s.off);
  if (near) {
    yaw = Math.max(-1.1, Math.min(1.1, relYaw(s.pos, s.a, near.root.position))); pitch = -0.05;
    if (best < 1.6 && s.cd <= 0 && near.waveCD <= 0 && random() < 0.5) {   // little mutual wave
      s.waveT = 1.4; s.cd = 12; near.waveT = 1.4; near.waveCD = 6; near.other = s.pos;
    } else if (best < 1.6 && s.cd <= 0) s.cd = 6;
  }
  J.head.rotation.y += (yaw - J.head.rotation.y) * k;
  J.head.rotation.x += (pitch - J.head.rotation.x) * k;
  const wv = s.waveT > 0;
  J.RSh.rotation.z += ((wv ? -2.3 : 0.12) - J.RSh.rotation.z) * k;
  J.RSh.rotation.x += ((wv ? -0.2 : -1.0) - J.RSh.rotation.x) * k;
  J.REl.rotation.z += ((wv ? -0.3 + 0.3 * sin(t * 10) : 0) - J.REl.rotation.z) * k;
  J.LEl.rotation.x = -0.45 + 0.06 * sin(t * 13 + s.off);
  J.REl.rotation.x += ((wv ? 0 : -0.45 + 0.06 * sin(t * 13 + s.off + 1.7)) - J.REl.rotation.x) * k;
}

function greetings() {          // two colleagues who cross paths greet each other
  for (let a = 0; a < walkers.length; a++) for (let b = a + 1; b < walkers.length; b++) {
    const A = walkers[a], B = walkers[b];
    if (A.state !== 'walk' || B.state !== 'walk' || A.waveCD > 0 || B.waveCD > 0) continue;
    if (A.root.position.distanceTo(B.root.position) < 1.8) {
      A.waveT = B.waveT = 1.5; A.waveCD = B.waveCD = 10;
      A.other = B.root.position; B.other = A.root.position;
    }
  }
}

const clock = new THREE.Clock();
const tmpV = new THREE.Vector3(), core = new THREE.Vector3(0, 2.2, 0);
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;

  walkers.forEach(w => updateWalker(w, dt, t));
  roomLights.forEach((L, i) => { const on = LIVE.busy(i); L.intensity += ((on ? 9 + 4 * sin(t * 5) : 0) - L.intensity) * Math.min(1, dt * 4); });
  if (trafficGroup.visible) for (const c of traffic) { c.g.position.x += c.dir * c.speed * dt; if (abs(c.g.position.x) > 160) c.g.position.x = -c.dir * 160; }
  greetings();
  seated.forEach(s => updateSeated(s, dt, t));

  // server LEDs
  for (let n = 0; n < 25; n++) { const j = random() * ledOn.length | 0; ledOn[j] ^= 1; }
  for (let r = 0; r < RACKS; r++) rackFlash[r] = Math.max(0, rackFlash[r] - dt);
  for (let j = 0; j < ledOn.length; j++) {
    const r = j / LPR | 0;
    leds.setColorAt(j, rackFlash[r] > 0 && (rackFlash[r] * 10 | 0) % 2 ? ledFlash : ledOn[j] ? ledPal[j % 3] : ledOff);
  }
  leds.instanceColor.needsUpdate = true;

  // data flow along the paths
  for (let i = 0; i < ROOMS.length; i++) for (let k = 0; k < DOTS; k++) {
    const u = (t * 0.22 + k / DOTS) % 1, r = RR - 4 - u * (RR - 4 - DC_R);
    dummy.position.copy(polar(r, angleOf(i), 0.12)); dummy.scale.setScalar(sin(u * PI) + 0.01); dummy.updateMatrix();
    dots.setMatrixAt(i * DOTS + k, dummy.matrix);
  }
  dots.instanceMatrix.needsUpdate = true;

  // data center core
  coreFlash = Math.max(0, coreFlash - dt * 1.5);
  rings.forEach((m, j) => { const u = (t * 0.35 + j / 4) % 1; m.position.y = 0.3 + u * 3.3; m.scale.setScalar(1 + coreFlash * 0.25); });
  coreMat.color.setRGB(0.25, 0.85, 1).multiplyScalar(2 + coreFlash * 4 + 0.4 * sin(t * 3));
  coreLight.intensity = 22 + coreFlash * 60;

  // impulsions baie → cœur
  for (let n = pulses.length - 1; n >= 0; n--) {
    const p = pulses[n]; p.t += dt / 0.9;
    if (p.t >= 1) { scene.remove(p.m); pulses.splice(n, 1); coreFlash = 1; continue; }
    p.m.position.lerpVectors(p.from, core, ease(p.t)); p.m.position.y += sin(p.t * PI) * 1.2;
  }

  // camera
  if (fly) {
    fly.t = Math.min(1, fly.t + dt / 1.4); const e = ease(fly.t);
    camera.position.lerpVectors(fly.p0, fly.p1, e); controls.target.lerpVectors(fly.t0, fly.t1, e);
    if (fly.t >= 1) fly = null;
  } else if (follow >= 0) {
    followT += dt;
    const fw = walkers[follow];
    const what = { sit: 'is working at their desk', standUp: 'is standing up', sitDown: 'is sitting down', pickup: `is picking up a folder (${fw.fetch.what})`, deposit: 'is dropping the folder at the data center',
      walk: fw.then === 'pickup' ? `is going to fetch a folder (${fw.fetch.what})` : fw.then === 'deposit' ? 'is carrying the folder to the data center' : 'is heading back to their desk' }[fw.state];
    document.getElementById('follow').textContent = `Following: an employee from ${ROOMS[fw.room].name} who ${what}. (${follow + 1}/${walkers.length}, click again for the next one)`;
    const p = walkers[follow].root.position;
    const goal = tmpV.set(p.x, 1.0, p.z);
    const nt = controls.target.clone().lerp(goal, 0.12);
    camera.position.add(nt.clone().sub(controls.target)); controls.target.copy(nt);
    if (followT < 1.6) {
      const dir = camera.position.clone().sub(controls.target).setLength(5.5);
      dir.y = Math.max(dir.y, 2.8);
      camera.position.lerp(controls.target.clone().add(dir), 0.08);
    }
  }
  controls.update();
  composer.render();
}
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
});

// ================= Link with the real agents =================
const hex = c => '#' + new THREE.Color(c).getHexString();
const IDX = Object.fromEntries(ROOMS.map((R, i) => [R.key, i]));
const AGENT = Object.fromEntries(ROOMS.map(R => [R.key, R]));
const escH = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mdH = s => escH(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
const nameOf = k => AGENT[k] ? `${AGENT[k].icon} ${AGENT[k].name}` : (k === 'you' ? 'You' : k || '');
const colorOf = k => AGENT[k] ? hex(AGENT[k].color) : '#cfcabb';

// ---- activity: who is working right now
const LIVE = {
  until: ROOMS.map(() => 0), active: ROOMS.map(() => false),
  mark(k, sec = 10) { const i = IDX[k]; if (i !== undefined) this.until[i] = Math.max(this.until[i], performance.now() + sec * 1000); },
  busy(i) { return this.active[i] || performance.now() < this.until[i]; },
};

// ---- counters on the left and department bar
const roomsEl = document.getElementById('rooms'), dock = document.getElementById('dock');
roomsEl.innerHTML = ROOMS.map((R, i) => `<div class="dept" data-i="${i}"><i class="dot" style="background:${hex(R.color)}"></i>
  <span class="nm">${R.icon} ${R.name}<small>${R.metric}</small></span><i class="live" id="live${i}"></i><span class="val" id="c${i}">0</span></div>`).join('');
dock.innerHTML = `<button data-i="-1">⌂ Overview</button>` + ROOMS.map((R, i) => `<button data-i="${i}"><i style="background:${hex(R.color)}"></i>${R.name}</button>`).join('');
roomsEl.querySelectorAll('.dept').forEach(d => d.onclick = () => selectRoom(+d.dataset.i));
dock.querySelectorAll('button').forEach(b => b.onclick = () => +b.dataset.i < 0 ? closePanel(true) : selectRoom(+b.dataset.i));

// ---- one folder carried to the data center per real result
const pending = ROOMS.map(() => 0);
setInterval(() => {
  ROOMS.forEach((R, i) => {
    document.getElementById('live' + i).classList.toggle('on', LIVE.busy(i));
    if (pending[i] > 0) { const w = walkers[i]; if (w.state === 'sit' && w.t > 1.5) { w.dur = w.t; pending[i]--; } }
  });
  if (sel >= 0) { const st = document.getElementById('pState'); const on = LIVE.busy(sel); st.textContent = on ? 'working' : 'idle'; st.classList.toggle('on', on); }
}, 500);

let last = null, S = {};
async function pollStats() {
  try {
    S = await (await fetch('/api/stats', { cache: 'no-store' })).json();
    const p = S.by_status || {};
    const vals = { 'Manager': S.decisions || 0, 'lead-generation': S.companies, 'data-enrichment': S.companies - (p.new || 0), 'email-writing': S.drafts, 'follow-up': S.followups || 0 };
    const now = ROOMS.map(R => vals[R.key] ?? 0);
    now.forEach((v, i) => document.getElementById('c' + i).textContent = v);
    if (last) now.forEach((v, i) => { const d = v - last[i]; if (d > 0) { pending[i] = Math.min(pending[i] + d, 3); LIVE.mark(ROOMS[i].key, 8); } });
    last = now;
    (S.recent || []).forEach(r => LIVE.mark(r.agent, Math.max(3, 90 - r.age)));
    document.getElementById('srv').innerHTML = S.busy ? '<b style="color:#3f7a3d">●</b> The agents are working' : '<b style="color:#9b998f">●</b> Agents connected · idle';
    if (sel >= 0) renderResults();
  } catch {
    REAL.on = false;
    document.getElementById('srv').textContent = 'Agents server unreachable: run "python3 ui/server.py". Demo mode.';
    walkers.forEach(w => { if (w.state === 'sit' && w.dur === Infinity) w.dur = w.t + 3 + random() * 20; });
  }
}
pollStats(); setInterval(pollStats, 3000);

// ---- Claude Code event stream (everything happening behind the scenes)
const EVENTS = []; let lastId = 0, running = false;
async function pollEvents() {
  try {
    const r = await (await fetch('/api/events?since=' + lastId, { cache: 'no-store' })).json();
    running = r.busy; setButtons();
    for (const e of r.events) {
      lastId = Math.max(lastId, e.id); EVENTS.push(e);
      if (e.kind === 'delegate') { const i = IDX[e.agent]; if (i !== undefined) LIVE.active[i] = true; }
      if (e.kind === 'report') { const i = IDX[e.who]; if (i !== undefined) { LIVE.active[i] = false; LIVE.mark(e.who, 6); } }
      if (e.kind === 'done') LIVE.active.fill(false);
      if (e.who && e.kind !== 'report') LIVE.mark(e.who, 8);
      if (r.busy && e.kind !== 'done') LIVE.mark('Manager', 8);
      if (sel >= 0) appendEvent(e);
    }
    if (EVENTS.length > 2500) EVENTS.splice(0, EVENTS.length - 2500);
  } catch {}
  setTimeout(pollEvents, 900);
}
pollEvents();

// ---- selecting a department: zoom + panel
let sel = -1;
function selectRoom(i) {
  sel = i; const R = ROOMS[i], a = angleOf(i);
  flyTo(polar(RR - 9.5, a + 0.32, 9), polar(RR - 0.6, a, 0.9));   // seen from the courtyard: facing the agent
  dock.querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.i === i));
  const P = document.getElementById('panel');
  P.classList.remove('closed'); P.classList.toggle('manager', R.key === 'Manager');
  const badge = document.getElementById('pBadge'); badge.style.background = hex(R.color); badge.textContent = R.icon;
  document.getElementById('pTitle').textContent = R.name;
  document.getElementById('pRole').textContent = R.key === 'Manager' ? 'You chat with it · on the right, everything Claude Code does behind the scenes' : R.role + ' · subagent: it does not chat, here is its live activity';
  const body = document.getElementById('pbody');
  if (R.key === 'Manager') {
    body.innerHTML = `<div class="col"><h3>Chat</h3><div class="feed" id="fChat"></div>
        <div class="bar"><button class="primary" id="bCycle">▶ Run a cycle</button><button id="bStop">Stop</button><button id="bNew">New conversation</button></div>
        <form class="ask" id="ask"><textarea id="askIn" placeholder="Write to the Manager… (Enter to send)"></textarea><button class="primary" id="bSend">Send</button></form></div>
      <div class="col"><h3>Behind the scenes · Claude Code</h3><div class="feed" id="fBack"></div></div>`;
    document.getElementById('ask').onsubmit = ev => { ev.preventDefault(); const t = document.getElementById('askIn').value.trim(); if (t && !running) { document.getElementById('askIn').value = ''; post('/api/chat', { message: t }); } };
    document.getElementById('askIn').onkeydown = ev => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); document.getElementById('ask').requestSubmit(); } };
    document.getElementById('bCycle').onclick = () => post('/api/cycle', {});
    document.getElementById('bStop').onclick = () => post('/api/stop', {});
    document.getElementById('bNew').onclick = () => post('/api/new', {});
    setTimeout(() => document.getElementById('askIn')?.focus(), 350);
  } else {
    body.innerHTML = `<div class="col"><h3>Current mission</h3><div class="section"><div class="mission" id="fMission">No mission yet.</div></div>
      <h3>Live activity</h3><div class="feed" id="fAgent" style="flex:1.2"></div>
      <h3>Its results</h3><div class="feed" id="fRes" style="flex:1"></div></div>`;
  }
  EVENTS.slice(-400).forEach(appendEvent);
  ['fChat', 'fBack', 'fAgent'].forEach(id => { const f = document.getElementById(id); if (f && !f.children.length) f.innerHTML = `<div class="hint">${id === 'fChat' ? 'Write to the Manager, or run a cycle.' : 'Nothing yet.'}</div>`; });
  setButtons(); renderResults();
}
function closePanel(overview) {
  sel = -1; document.getElementById('panel').classList.add('closed');
  dock.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.i === '-1'));
  if (overview) flyTo(new THREE.Vector3(0, 44, 72), new THREE.Vector3(0, 0, 6));
}
document.getElementById('pClose').onclick = () => closePanel(true);
addEventListener('keydown', e => { if (e.key === 'Escape') closePanel(true); });

async function post(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) { const j = await r.json().catch(() => ({})); toFeed('fChat', `<div class="note">${escH(j.error || 'Error ' + r.status)}</div>`); }
}
function setButtons() { ['bCycle', 'bSend'].forEach(id => { const b = document.getElementById(id); if (b) b.disabled = running; }); const s = document.getElementById('bStop'); if (s) s.disabled = !running; }
function toFeed(id, html, color) {
  const f = document.getElementById(id); if (!f) return;
  f.querySelector('.hint')?.remove();
  const d = document.createElement('div'); d.innerHTML = html; const el = d.firstElementChild; if (color) el.style.setProperty('--c', color);
  const stick = f.scrollHeight - f.scrollTop - f.clientHeight < 90; f.appendChild(el); if (stick) f.scrollTop = f.scrollHeight;
}
const T = e => `<span class="t">${escH(e.ts || '')}</span>`;
function evLine(e) {
  if (e.kind === 'delegate') return [`<div class="ev big">${T(e)}<b>${nameOf(e.who)}</b> hands a mission to <b>${nameOf(e.agent)}</b> — ${escH(e.text)}<details><summary>read the mission</summary><div>${mdH(e.mission)}</div></details></div>`, colorOf(e.agent)];
  if (e.kind === 'tool') return [`<div class="ev">${T(e)}<b>${nameOf(e.who)}</b> · ${escH(e.tool)} — ${escH(e.text)}</div>`, colorOf(e.who)];
  if (e.kind === 'report') return [`<div class="ev big">${T(e)}<b>${nameOf(e.who)}</b> hands in its report<details><summary>read</summary><div>${mdH(e.text)}</div></details></div>`, colorOf(e.who)];
  if (e.kind === 'text') return [`<div class="ev">${T(e)}<b>${nameOf(e.who)}</b> · ${mdH(e.text.slice(0, 400))}</div>`, colorOf(e.who)];
  if (e.kind === 'start' || e.kind === 'user') return [`<div class="note">— ${e.kind === 'start' ? 'Cycle started' : 'Message received'} at ${escH(e.ts)} —</div>`];
  if (e.kind === 'done') return [`<div class="note">${e.error ? '⚠️ Error' : '✓ Done'} · ${e.duration ?? '?'} s${e.cost != null ? ' · ' + Number(e.cost).toFixed(2) + ' $' : ''}</div>`];
  if (e.kind === 'info') return [`<div class="note">${escH(e.text)}</div>`];
  return [];
}
function appendEvent(e) {
  const R = ROOMS[sel]; if (!R) return;
  if (R.key === 'Manager') {
    if (e.kind === 'user') toFeed('fChat', `<div class="bubble me">${escH(e.text)}</div>`);
    else if (e.kind === 'start') toFeed('fChat', `<div class="note">▶ Cycle started at ${escH(e.ts)}</div>`);
    else if (e.kind === 'text' && e.who === 'Manager') toFeed('fChat', `<div class="bubble mgr">${mdH(e.text)}</div>`);
    else if (e.kind === 'done' || e.kind === 'info') toFeed('fChat', evLine(e)[0]);
    if (e.kind !== 'user' && e.kind !== 'start') { const [h, c] = evLine(e); if (h) toFeed('fBack', h, c); }
  } else {
    const mine = e.who === R.key || (e.kind === 'delegate' && e.agent === R.key);
    if (!mine) return;
    if (e.kind === 'delegate') { document.getElementById('fMission').innerHTML = `<small>${escH(e.ts)} · handed out by the Manager</small>\n<b>${escH(e.text)}</b>\n\n${mdH(e.mission)}`; }
    const [h, c] = evLine(e); if (h) toFeed('fAgent', h, c);
  }
}

// ---- each subagent's results (read from the database)
async function renderResults() {
  const R = ROOMS[sel], f = document.getElementById('fRes'); if (!R || !f) return;
  try {
    let html = '';
    if (R.key === 'lead-generation' || R.key === 'data-enrichment') {
      let rows = await (await fetch('/api/companies')).json();
      if (R.key === 'data-enrichment') rows = rows.filter(r => r.status !== 'new');
      html = rows.slice(0, 30).map(r => `<div class="item"><b>${escH(r.name)}</b><span class="tag">${escH(r.status)}</span><br><small>${escH(r.city || '')}${r.category ? ' · ' + escH(r.category) : ''}${r.rating ? ' · ' + escH(r.rating) + ' ★' : ''}</small>
        ${R.key === 'data-enrichment' ? `<br>${r.contacts.map(c => `${escH(c.name)} <small>${escH(c.role || '')}${c.email ? ' · ' + escH(c.email) : ''}</small>`).join('<br>')}${r.hook ? `<br><small>Hook: ${escH(r.hook)}</small>` : ''}${r.notes ? `<br><small>Note: ${escH(r.notes)}</small>` : ''}` : ''}</div>`).join('');
    } else if (R.key === 'email-writing') {
      const rows = await (await fetch('/api/drafts')).json();
      html = rows.map(b => `<div class="item"><b>${escH(b.company)}</b><span class="tag">${escH(b.status)}</span><br><small>${escH(b.contact)} · ${escH(b.email)} · ${escH(b.created_at)}</small>
        <details><summary>read the email</summary><pre>${escH(b.content)}</pre></details>
        <div class="acts">${b.status === 'pending' ? `<button data-b="${b.id}" data-e="sent">✓ I sent it</button>` : ''}${b.status !== 'replied' && b.status !== 'pending' ? `<button data-b="${b.id}" data-e="replied">↩ They replied</button>` : ''}</div></div>`).join('');
    } else if (R.key === 'follow-up') {
      const rows = await (await fetch('/api/followups')).json();
      html = rows.map(r => `<div class="item"><b>${escH(r.company)}</b><span class="tag">follow-up ${r.number} · ${escH(r.status)}</span><br><small>${escH(r.contact)} · ${escH(r.email)} · ${escH(r.created_at)}</small>
        <details><summary>read the follow-up</summary><pre>${escH(r.content)}</pre></details>
        ${r.status === 'pending' ? `<div class="acts"><button data-r="${r.id}">✓ I sent it</button></div>` : ''}</div>`).join('')
        || `<div class="hint">No follow-ups. The agent follows up the emails you marked "sent" that got no reply ${S.sent ? '' : '(no email marked as sent yet)'}.</div>`;
    }
    if (f.dataset.html !== html) { f.dataset.html = html; f.innerHTML = html || '<div class="hint">No results yet.</div>'; }
    f.querySelectorAll('button[data-b]').forEach(b => b.onclick = async () => { await post('/api/mark', { draft_id: +b.dataset.b, state: b.dataset.e }); pollStats(); });
    f.querySelectorAll('button[data-r]').forEach(b => b.onclick = async () => { await post('/api/mark', { followup_id: +b.dataset.r }); pollStats(); });
  } catch {}
}

// ---- each big agent: a ring at its feet and its name above its head
walkers.forEach((w, i) => {
  const R = ROOMS[i];
  w.ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(R.color).multiplyScalar(1.6), transparent: true, opacity: 0.85 }));
  w.ring.rotation.x = -PI / 2; scene.add(w.ring);
  w.tag = label(`${R.icon} Agent ${R.name}`, hex(R.color), 3.2);
  w.tag.material.depthTest = false; w.tag.renderOrder = 10;
});

// ---- click in the 3D view: room or agent
const pickables = roomInfo.map(({ g }, i) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(11, 3, 8), new THREE.MeshBasicMaterial({ visible: false }));
  m.position.copy(g.position).setY(1.5); m.rotation.y = g.rotation.y; m.userData.room = i; scene.add(m); return m;
});
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(); let downAt = null;
const roomAt = ev => {
  mouse.set(ev.clientX / innerWidth * 2 - 1, -(ev.clientY / innerHeight) * 2 + 1); ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObjects([...walkers.map(w => w.root), ...pickables], true)[0];
  return hit ? hit.object.userData.room ?? -1 : -1;
};
renderer.domElement.addEventListener('pointerdown', ev => downAt = [ev.clientX, ev.clientY]);
renderer.domElement.addEventListener('pointerup', ev => {
  if (!downAt || Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]) > 5) return;
  const i = roomAt(ev); if (i >= 0) selectRoom(i);
});
let hoverT = 0;
renderer.domElement.addEventListener('pointermove', ev => { const t = performance.now(); if (t - hoverT < 80) return; hoverT = t; renderer.domElement.style.cursor = roomAt(ev) >= 0 ? 'pointer' : ''; });

animate();   // started last: the whole link with the agents is ready
