// 物を掴んで運ぶ協働ロボットアーム (自作の形。特定の機種のデータは使っていない)
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const host = document.getElementById('arm');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
} catch (e) {
  host.style.display = 'none';
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
host.appendChild(renderer.domElement);

const BG = 0x101218;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(BG, 2.6, 5.2);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.6;

const camera = new THREE.PerspectiveCamera(26, 1, 0.01, 20);
const lookAt = new THREE.Vector3(0.12, 0.26, -0.04);

const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(1.0, 2.8, 1.6);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -1, right: 1, top: 1, bottom: -1, near: 0.5, far: 6 });
key.shadow.radius = 10;
key.shadow.blurSamples = 20;
key.shadow.bias = -0.0004;
scene.add(key);
const rim = new THREE.DirectionalLight(0x5aa8ff, 2.6);
rim.position.set(-2.2, 1.4, -1.8);
scene.add(rim);
scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x0b0d12, 0.4));

// 材質
const shell = new THREE.MeshPhysicalMaterial({ color: 0xeef0f4, roughness: 0.34, clearcoat: 0.5, clearcoatRoughness: 0.3 });
const seam = new THREE.MeshStandardMaterial({ color: 0x3a404d, metalness: 0.3, roughness: 0.6 });
const alu = new THREE.MeshStandardMaterial({ color: 0xa9b1be, metalness: 0.95, roughness: 0.28 });
const black = new THREE.MeshStandardMaterial({ color: 0x1b1e26, metalness: 0.2, roughness: 0.55 });
const blue = new THREE.MeshPhysicalMaterial({ color: 0x2f6bff, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08, emissive: 0x153ccc, emissiveIntensity: 0.28 });
const glow = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false });

function shadowed(m) { m.castShadow = true; m.receiveShadow = true; return m; }

// 角を丸めた筒 (y 軸)。f = 角の丸み
function filletCyl(r, h, f, mat, seg = 72) {
  const pts = [new THREE.Vector2(0, -h / 2)];
  for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + (i / 8) * Math.PI / 2; pts.push(new THREE.Vector2(r - f + Math.cos(a) * f, -h / 2 + f + Math.sin(a) * f)); }
  for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI / 2; pts.push(new THREE.Vector2(r - f + Math.cos(a) * f, h / 2 - f + Math.sin(a) * f)); }
  pts.push(new THREE.Vector2(0, h / 2));
  return shadowed(new THREE.Mesh(new THREE.LatheGeometry(pts, seg), mat));
}
// 少し盛り上がったふた (y 軸の +側を向く)
function dome(r, hgt, mat) {
  const pts = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector2(r * Math.sin(t * Math.PI / 2), hgt * Math.cos(t * Math.PI / 2))); }
  pts.reverse();
  return shadowed(new THREE.Mesh(new THREE.LatheGeometry(pts, 72), mat));
}
function toAxisZ(o) { o.rotation.x = Math.PI / 2; return o; }

// 関節: 角の丸い白い筒 + 両側の溝 + 青いドームのふた (軸は z)
function joint(r, len) {
  const g = new THREE.Group();
  g.add(toAxisZ(filletCyl(r, len, r * 0.18, shell)));
  for (const s of [1, -1]) {
    const groove = toAxisZ(filletCyl(r * 0.86, 0.006, 0.002, seam));
    groove.position.z = s * (len / 2 + 0.001); g.add(groove);
    const d = dome(r * 0.8, r * 0.12, blue);
    d.rotation.x = s > 0 ? Math.PI / 2 : -Math.PI / 2;
    d.position.z = s * (len / 2 + 0.003); g.add(d);
  }
  // 腕と会う所の細い継ぎ目
  const belt = new THREE.Mesh(new THREE.TorusGeometry(r * 1.002, 0.0018, 8, 96), seam);
  belt.position.z = len * 0.18; g.add(belt);
  return g;
}
// 腕: 両端が関節に向かって広がる管 (y 軸、0〜len)
function arm(r, len, flareR) {
  const pts = [];
  const flare = 0.05;
  pts.push(new THREE.Vector2(0, 0));
  for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector2(flareR + (r - flareR) * (1 - Math.cos(t * Math.PI / 2)), t * flare)); }
  for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector2(r + (flareR - r) * (1 - Math.cos(t * Math.PI / 2)), len - flare + t * flare)); }
  pts.push(new THREE.Vector2(0, len));
  // 外形を整える (中間はまっすぐ)
  const prof = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) prof.push(pts[i]);
  prof.push(pts[pts.length - 1]);
  return shadowed(new THREE.Mesh(new THREE.LatheGeometry(prof, 72), shell));
}

// 寸法 (m)
const L1 = 0.42, L2 = 0.39, SHOULDER_Y = 0.2;
const W1 = 0.085, W2 = 0.085, FL = 0.02, TCP = 0.072;
const DOWN = W1 + W2 + FL + TCP; // 手首 1 の軸から指の中心まで

// 台座
const base = new THREE.Group(); scene.add(base);
const plate = filletCyl(0.1, 0.014, 0.004, alu); plate.position.y = 0.007; base.add(plate);
for (let i = 0; i < 8; i++) {
  const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
  const b = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.006, 16), black));
  b.position.set(Math.cos(a) * 0.085, 0.016, Math.sin(a) * 0.085); base.add(b);
}
const ring = new THREE.Mesh(new THREE.RingGeometry(0.135, 0.142, 128), glow(0x6ebeff, 0.45));
ring.rotation.x = -Math.PI / 2; ring.position.y = 0.002; scene.add(ring);

const j1 = new THREE.Group(); j1.position.y = 0.014; base.add(j1);
const col = filletCyl(0.068, 0.12, 0.01, shell); col.position.y = 0.06; j1.add(col);
const colSeam = new THREE.Mesh(new THREE.TorusGeometry(0.0682, 0.0018, 8, 96), seam);
colSeam.rotation.x = Math.PI / 2; colSeam.position.y = 0.035; j1.add(colSeam);
const topCap = dome(0.06, 0.008, shell); topCap.position.y = 0.12; j1.add(topCap);

const j2 = new THREE.Group(); j2.position.y = SHOULDER_Y - 0.014; j1.add(j2);
j2.add(joint(0.066, 0.15));
const upper = arm(0.044, L1, 0.058); j2.add(upper);

const j3 = new THREE.Group(); j3.position.y = L1; j2.add(j3);
j3.add(joint(0.056, 0.13));
const fore = arm(0.036, L2, 0.048); j3.add(fore);

const j4 = new THREE.Group(); j4.position.y = L2; j3.add(j4);
j4.add(joint(0.044, 0.105));
// 手首 2 (軸は腕と直角)、手首 3 (先端の回転)
const w1neck = filletCyl(0.04, W1, 0.006, shell); w1neck.position.y = W1 / 2; j4.add(w1neck);
const w2 = joint(0.044, 0.1); w2.rotation.y = Math.PI / 2; w2.position.y = W1; j4.add(w2);
const w3 = filletCyl(0.038, W2, 0.006, shell); w3.position.y = W1 + W2 / 2; j4.add(w3);
const w3seam = new THREE.Mesh(new THREE.TorusGeometry(0.0382, 0.0016, 8, 96), seam);
w3seam.rotation.x = Math.PI / 2; w3seam.position.y = W1 + W2 * 0.7; j4.add(w3seam);
const flange = filletCyl(0.031, FL, 0.003, alu); flange.position.y = W1 + W2 + FL / 2; j4.add(flange);

// ハンド: 角の丸い本体 + 2 本指 (指先に黒い滑り止め)
const tool = new THREE.Group(); tool.position.y = W1 + W2 + FL; j4.add(tool);
const gbody = shadowed(new THREE.Mesh(new RoundedBoxGeometry(0.09, 0.04, 0.052, 4, 0.01), black));
gbody.position.y = 0.02; tool.add(gbody);
const rail = shadowed(new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.008, 0.02, 2, 0.003), alu));
rail.position.y = 0.043; tool.add(rail);
function finger() {
  const f = new THREE.Group();
  const p = shadowed(new THREE.Mesh(new RoundedBoxGeometry(0.012, 0.05, 0.026, 3, 0.004), alu));
  p.position.y = 0.025; f.add(p);
  const pad = shadowed(new THREE.Mesh(new RoundedBoxGeometry(0.004, 0.022, 0.022, 2, 0.0015), black));
  pad.position.set(0, 0.036, 0); f.add(pad);
  return f;
}
const fA = finger(), fB = finger();
fA.position.y = fB.position.y = 0.045;
tool.add(fA, fB);
const tcp = new THREE.Object3D(); tcp.position.y = TCP; tool.add(tcp);

// 床: 影を受ける面 + 名刺と同じ点の方眼
const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.ShadowMaterial({ opacity: 0.32 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
{
  const pts = [], cols = [];
  const c = new THREE.Color(0x6ebeff);
  for (let x = -1.6; x <= 1.6001; x += 0.06) for (let z = -1.6; z <= 1.6001; z += 0.06) {
    const r = Math.hypot(x, z); if (r > 1.6) continue;
    pts.push(x, 0.001, z);
    const k = Math.pow(1 - r / 1.6, 1.4) * 0.85;
    cols.push(c.r * k, c.g * k, c.b * k);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 0.011, vertexColors: true, transparent: true, depthWrite: false })));
}

// 手先の位置 (水平距離 r・高さ y・向き yaw) から関節角を出す
function ik(r, y, yaw, open) {
  const dx = r, dy = y + DOWN - SHOULDER_Y;
  const d = Math.min(Math.hypot(dx, dy), L1 + L2 - 1e-4);
  const q2 = Math.acos((d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2));
  const q1 = Math.atan2(dx, dy) - Math.atan2(L2 * Math.sin(q2), L1 + L2 * Math.cos(q2));
  return [yaw, q1, q2, open];
}
// ───────── 作業: 言葉の指示で「ピラミッドを積む」「机を片付ける」を交互に (毎回ちがう配置で、ずっと続く) ─────────
// 片付けでは、ときどき物が手から滑り落ち、転がった先を見つけて掴み直す
const fixedParam = new URLSearchParams(location.search).get('t');
const zoomParam = new URLSearchParams(location.search).has('zoom');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rand = mulberry32(fixedParam !== null ? 11 : (Math.random() * 1e9) | 0);

const SIZE = 0.05, GAP = 0.003, FLOOR_T = 0.005;
const cubeMat = new THREE.MeshPhysicalMaterial({ color: 0x4a8dff, roughness: 0.22, clearcoat: 1, emissive: 0x1f5bff, emissiveIntensity: 0.22 });
const canMat = new THREE.MeshPhysicalMaterial({ color: 0xe8ecf2, metalness: 0.35, roughness: 0.22, clearcoat: 1 });
const cubeGeo = new RoundedBoxGeometry(SIZE, SIZE, SIZE, 3, 0.006);
const canGeo = new THREE.CylinderGeometry(SIZE * 0.48, SIZE * 0.48, SIZE, 48);
const ALIGN_YAW = 0; // 置いた物の向き

// 床の四隅の印
function corners(c, w, d) {
  const g = new THREE.Group();
  const t = 0.0035, L = 0.03, mat = glow(0x6ebeff, 0.7);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const h = new THREE.Mesh(new THREE.PlaneGeometry(L, t), mat);
    h.rotation.x = -Math.PI / 2; h.position.set(sx * (w / 2 - L / 2), 0.002, sz * d / 2); g.add(h);
    const v = new THREE.Mesh(new THREE.PlaneGeometry(t, L), mat);
    v.rotation.x = -Math.PI / 2; v.position.set(sx * w / 2, 0.002, sz * (d / 2 - L / 2)); g.add(v);
  }
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(w, d), glow(0x6ebeff, 0.05));
  fill.rotation.x = -Math.PI / 2; fill.position.y = 0.0015; g.add(fill);
  g.position.set(c.x, 0, c.z); scene.add(g);
}
// ピラミッドを積む場所
const BUILD = new THREE.Vector3(0.14, 0, -0.5);
const STEP = SIZE + GAP;
const pyrSlots = [[-STEP, 0], [0, 0], [STEP, 0], [-STEP / 2, 1], [STEP / 2, 1], [0, 2]]
  .map(([dx, lv]) => new THREE.Vector3(BUILD.x + dx, SIZE / 2 + lv * SIZE + 0.0005, BUILD.z));
corners(BUILD, STEP * 3 + 0.03, SIZE + 0.03);
// 片付けのトレー (立方体は青、缶は銀)
function makeTray(c, color) {
  const g = new THREE.Group();
  const S = 0.17, H = 0.03, T = 0.006;
  const fl = shadowed(new THREE.Mesh(new RoundedBoxGeometry(S, FLOOR_T, S, 2, 0.002), black));
  fl.position.y = FLOOR_T / 2; g.add(fl);
  for (const [w, d, x, z] of [[S, T, 0, S / 2], [S, T, 0, -S / 2], [T, S, S / 2, 0], [T, S, -S / 2, 0]]) {
    const wall = shadowed(new THREE.Mesh(new RoundedBoxGeometry(w, H, d, 2, 0.0025), seam));
    wall.position.set(x, H / 2, z); g.add(wall);
  }
  const lip = new THREE.Mesh(new THREE.RingGeometry(S * 0.72, S * 0.74, 4, 1), glow(color, 0.55));
  lip.rotation.x = -Math.PI / 2; lip.rotation.z = Math.PI / 4; lip.position.y = H + 0.001; g.add(lip);
  g.position.set(c.x, 0, c.z); scene.add(g);
  return { slots: [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => new THREE.Vector3(c.x + a * 0.04, FLOOR_T + SIZE / 2 + 0.0005, c.z + b * 0.04)), used: 0 };
}
const TRAY_C = { cube: new THREE.Vector3(0.6, 0, -0.3), can: new THREE.Vector3(0.24, 0, 0.56) };
const trays = { cube: makeTray(TRAY_C.cube, 0x6ebeff), can: makeTray(TRAY_C.can, 0xd8dee8) };

// 次に取る物の輪と、次に置く場所の半透明の形
const marker = new THREE.Mesh(new THREE.RingGeometry(0.042, 0.048, 64), glow(0x8ef0ff, 0));
marker.rotation.x = -Math.PI / 2; marker.position.y = 0.002; scene.add(marker);
const ghost = new THREE.Group();
ghost.add(new THREE.Mesh(new THREE.BoxGeometry(SIZE, SIZE, SIZE), glow(0x6ebeff, 0.08)));
ghost.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(SIZE, SIZE, SIZE)), new THREE.LineBasicMaterial({ color: 0x8ef0ff, transparent: true, opacity: 0.8 })));
ghost.visible = false; scene.add(ghost);

// 指示文と状態の表示 (3D の右下)
const hud = document.createElement('div');
hud.className = 'hud';
hud.innerHTML = '<div class="hud-k">instruction</div><div class="hud-p"><span class="hud-t"></span><span class="hud-c">▍</span></div><div class="hud-s"></div>';
host.appendChild(hud);
const hudT = hud.querySelector('.hud-t'), hudS = hud.querySelector('.hud-s');
let promptText = '', promptT0 = 0, statusText = '';

// 物
const objs = [];
function addObj(type, p, yaw, t0) {
  const m = shadowed(new THREE.Mesh(type === 'cube' ? cubeGeo : canGeo, type === 'cube' ? cubeMat : canMat));
  m.position.copy(p); m.rotation.y = yaw; m.scale.setScalar(0.001); scene.add(m);
  const o = { m, type, state: 'table', anim: { from: 0, to: 1, t0, d: 0.5 } };
  objs.push(o); return o;
}
function randomSpots(n) {
  const placed = [];
  for (let i = 0; i < n; i++) {
    let p, ok = false, tries = 0;
    while (!ok && tries++ < 400) {
      p = new THREE.Vector3(0.18 + rand() * 0.45, SIZE / 2, -0.06 + rand() * 0.46);
      const r = Math.hypot(p.x, p.z);
      const away = (c, d) => Math.hypot(p.x - c.x, p.z - c.z) > d;
      ok = r > 0.3 && r < 0.66 && p.z > -0.1 && placed.every((q) => q.distanceTo(p) > 0.085)
        && away(TRAY_C.cube, 0.15) && away(TRAY_C.can, 0.15) && away(BUILD, 0.13);
    }
    placed.push(p);
  }
  return placed;
}

// 動きの予定 (関節角 [旋回, 肩, 肘, 指の開き, 手首の回転] の区間)
const segs = [];
let planEnd = 0;
const OPEN = 0.045, CLOSE = SIZE / 2 + 0.008;
let curQ = ik(0.34, 0.36, 0.3, OPEN); curQ.push(0);
function move(q, d, ev) { segs.push({ t0: planEnd, d, a: curQ.slice(), b: q.slice(), ev, done: false }); planEnd += d; curQ = q.slice(); }
function dur(q, base = 0.45, k = 0.85) {
  let m = 0;
  for (let i = 0; i < 3; i++) m = Math.max(m, Math.abs(q[i] - curQ[i]));
  m = Math.max(m, Math.abs(q[4] - curQ[4]) * 0.6);
  return Math.min(2.2, base + m * k);
}
const yawOf = (p) => Math.atan2(-p.z, p.x);
const rOf = (p) => Math.hypot(p.x, p.z);
function Q(p, y, open, wrist) { const q = ik(rOf(p), y, yawOf(p), open); q.push(wrist); return q; }
const quarter = (a) => { a = ((a % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2); return a > Math.PI / 4 ? a - Math.PI / 2 : a; };
const wristToGrip = (p, objYaw, type) => (type === 'cube' ? quarter(yawOf(p) - objYaw) : 0);
// 置くときは、指を並び (x 方向) と直角 (z 方向) に向ける。隣のブロックに指が当たらない
const half = (a) => { a = ((a % Math.PI) + Math.PI) % Math.PI; return a > Math.PI / 2 ? a - Math.PI : a; };
const wristToPlace = (pickP, wPick, objYaw, placeP, type) =>
  (type === 'cube' ? half(yawOf(placeP) - (ALIGN_YAW + Math.PI / 2)) : wPick);
const UP = 0.2, CARRY = 0.27;
const homeQ = () => { const q = ik(0.34, 0.36, 0.3, OPEN); q.push(0); return q; };

function planPick(o, slot, drop) {
  const p = o.m.position.clone();
  const objYaw = o.m.rotation.y;
  const w = wristToGrip(p, objYaw, o.type);
  const wp = wristToPlace(p, w, objYaw, slot, o.type);
  move(Q(p, UP, OPEN, w), dur(Q(p, UP, OPEN, w)), { mark: o, ghost: slot });
  move(Q(p, UP, OPEN, w), 0.25);
  move(Q(p, p.y, OPEN, w), 0.7);
  move(Q(p, p.y, CLOSE, w), 0.35, { grasp: o });
  move(Q(p, CARRY, CLOSE, w), 0.6);
  if (drop) {
    // 運ぶ途中で滑り落ちる → 少し止まって見る (この後、掴み直しを計画し直す)
    const mid = p.clone().lerp(slot, 0.45);
    const q = Q(mid, CARRY, CLOSE, (w + wp) / 2);
    move(q, dur(q) * 0.8, { drop: o, slot });
    const q2 = q.slice(); q2[3] = OPEN;
    move(q2, 0.5);
    move(q2, 0.45);
    return;
  }
  move(Q(slot, CARRY, CLOSE, wp), dur(Q(slot, CARRY, CLOSE, wp)));
  move(Q(slot, slot.y + 0.02, CLOSE, wp), 0.55);
  move(Q(slot, slot.y, CLOSE, wp), 0.35);
  move(Q(slot, slot.y, OPEN, wp), 0.3, { release: o, slot });
  move(Q(slot, CARRY, OPEN, wp), 0.5);
}

// 作業の流れ: 予定が尽きたら次を決める
const MODES = [
  { name: 'pyramid', prompt: 'stack the blocks into a pyramid' },
  { name: 'tidy', prompt: 'tidy up the table' },
];
let modeIdx = -1, batch = null; // batch = { mode, next, dropLeft }
function planNext(T) {
  if (objs.some((o) => o.fall)) { move(curQ, 0.3); return; }
  if (!batch) {
    // 前の回を片付けて、次の作業を始める
    const h = homeQ();
    if (objs.length) { move(h, dur(h)); move(h, 1.0); move(h, 0.6, { clear: true }); }
    modeIdx = (modeIdx + 1) % MODES.length;
    move(h, 0.7, { start: MODES[modeIdx] });
    move(h, 1.2);
    return;
  }
  const left = objs.filter((o) => o.state === 'table');
  if (!left.length) { batch = null; statusText = 'done'; planNext(T); return; }
  const from = new THREE.Vector3().setFromMatrixPosition(tcp.matrixWorld);
  left.sort((a, b) => a.m.position.distanceTo(from) - b.m.position.distanceTo(from));
  const o = left[0];
  let slot;
  if (batch.mode.name === 'pyramid') slot = pyrSlots[batch.next++];
  else slot = trays[o.type].slots[trays[o.type].used++];
  o.state = 'planned';
  const drop = batch.mode.name === 'tidy' && batch.dropLeft > 0 && batch.count === batch.dropAt;
  if (drop) batch.dropLeft--;
  batch.count++;
  statusText = drop ? '' : (o.dropped ? `↺ re-grasp · step ${batch.count} / ${batch.total}` : `step ${batch.count} / ${batch.total}`);
  planPick(o, slot, drop);
}
function startBatch(mode, T) {
  promptText = mode.prompt; promptT0 = T;
  const spots = randomSpots(mode.name === 'pyramid' ? 6 : 5);
  spots.forEach((p, i) => {
    const type = mode.name === 'pyramid' ? 'cube' : (i % 2 ? 'can' : 'cube');
    addObj(type, p, rand() * Math.PI, T + i * 0.1);
  });
  trays.cube.used = trays.can.used = 0;
  batch = { mode, next: 0, count: 0, total: spots.length, dropLeft: 1, dropAt: 1 + Math.floor(rand() * 3) };
  statusText = 'planning…';
}
function clearAll(T) {
  objs.forEach((o, i) => { o.anim = { from: 1, to: 0, t0: T + i * 0.05, d: 0.45, kill: true }; });
}

const ease = (t) => t * t * (3 - 2 * t);
function poseAt(t) {
  if (!segs.length) return curQ;
  let s = segs[segs.length - 1];
  for (let i = 0; i < segs.length; i++) if (t < segs[i].t0 + segs[i].d) { s = segs[i]; break; }
  const k = ease(Math.min(1, Math.max(0, (t - s.t0) / s.d)));
  return s.a.map((v, j) => v + (s.b[j] - v) * k);
}
function fk(q, out) {
  const r = L1 * Math.sin(q[1]) + L2 * Math.sin(q[1] + q[2]);
  const y = SHOULDER_Y + L1 * Math.cos(q[1]) + L2 * Math.cos(q[1] + q[2]) - DOWN;
  return out.set(r * Math.cos(q[0]), y, -r * Math.sin(q[0]));
}

// これから動く道筋 (VLA がまとめて出す次の動き) を点の列で
const CHUNK = 16, HORIZON = 1.0;
const chunkGeo = new THREE.BufferGeometry();
const chunkPos = new Float32Array(CHUNK * 3), chunkCol = new Float32Array(CHUNK * 3);
chunkGeo.setAttribute('position', new THREE.BufferAttribute(chunkPos, 3));
chunkGeo.setAttribute('color', new THREE.BufferAttribute(chunkCol, 3));
scene.add(new THREE.Points(chunkGeo, new THREE.PointsMaterial({
  size: 0.014, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
})));
const tmp = new THREE.Vector3();
const cA = new THREE.Color(0x8ef0ff), cB = new THREE.Color(0x1e4ae6);
function updateChunk(T) {
  for (let i = 0; i < CHUNK; i++) {
    const k = (i + 1) / CHUNK;
    fk(poseAt(Math.min(T + k * HORIZON, planEnd)), tmp);
    chunkPos.set([tmp.x, tmp.y, tmp.z], i * 3);
    const c = cA.clone().lerp(cB, k).multiplyScalar(1 - k * 0.7);
    chunkCol.set([c.r, c.g, c.b], i * 3);
  }
  chunkGeo.attributes.position.needsUpdate = true;
  chunkGeo.attributes.color.needsUpdate = true;
}

// 進める
let held = null;
const offQ = new THREE.Quaternion(), offP = new THREE.Vector3(), tq = new THREE.Quaternion(), tp = new THREE.Vector3();
let markTarget = null, markA = 0, ghostSlot = null;
function applyPose(q) {
  j1.rotation.y = q[0];
  j2.rotation.z = -q[1];
  j3.rotation.z = -q[2];
  j4.rotation.z = -(Math.PI - q[1] - q[2]); // ハンドを常に真下へ
  fA.position.x = q[3]; fB.position.x = -q[3];
  tool.rotation.y = q[4];
}
function step(T, dt) {
  if (T >= planEnd - 0.02) { scene.updateMatrixWorld(true); planNext(T); }
  for (const s of segs) {
    const atStart = s.ev && (s.ev.mark || s.ev.clear || s.ev.start);
    if (s.done || T < s.t0 + (atStart ? 0 : s.d)) continue;
    s.done = true;
    const e = s.ev; if (!e) continue;
    if (e.mark) { markTarget = e.mark; ghostSlot = e.ghost; }
    if (e.clear) clearAll(T);
    if (e.start) startBatch(e.start, T);
    if (e.grasp) {
      applyPose(s.b); scene.updateMatrixWorld(true);
      held = e.grasp; held.state = 'held';
      tcp.getWorldQuaternion(tq); tcp.getWorldPosition(tp);
      offQ.copy(tq).invert().multiply(held.m.quaternion);
      offP.copy(held.m.position).sub(tp).applyQuaternion(tq.clone().invert());
      markTarget = null;
    }
    if (e.release && held) {
      held.state = 'placed';
      held.m.position.copy(e.slot); // 位置だけ合わせる。向きはそのまま
      held = null; ghostSlot = null;
    }
    if (e.drop && held) {
      // 手から滑り落ちて、少し転がる
      const o = held; o.dropped = true; held = null; ghostSlot = null; markTarget = null;
      const land = new THREE.Vector3(o.m.position.x + (rand() - 0.5) * 0.12, SIZE / 2, o.m.position.z + 0.06 + rand() * 0.08);
      if (Math.hypot(land.x, land.z) < 0.32) land.multiplyScalar(0.34 / Math.hypot(land.x, land.z)).setY(SIZE / 2);
      const yaw1 = rand() * Math.PI;
      o.fall = { p0: o.m.position.clone(), q0: o.m.quaternion.clone(), p1: land, q1: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw1, 0)), t0: T, d: 0.75, spin: (rand() - 0.5) * 6 };
      if (batch.mode.name === 'tidy') trays[o.type].used--;
      batch.count--;
      statusText = '↺ dropped — re-planning';
    }
  }
  while (segs.length > 2 && segs[0].done && T > segs[0].t0 + segs[0].d + 2) segs.shift();

  applyPose(poseAt(T));
  if (held) {
    scene.updateMatrixWorld(true);
    tcp.getWorldQuaternion(tq); tcp.getWorldPosition(tp);
    held.m.quaternion.copy(tq).multiply(offQ);
    held.m.position.copy(offP).applyQuaternion(tq).add(tp);
  }
  for (let i = objs.length - 1; i >= 0; i--) {
    const o = objs[i];
    if (o.fall) {
      const f = o.fall, k = Math.min(1, (T - f.t0) / f.d);
      const kk = k < 0.6 ? (k / 0.6) ** 2 : 1; // 落ちる
      o.m.position.lerpVectors(f.p0, f.p1, k < 0.6 ? k / 0.6 * 0.7 : 0.7 + (k - 0.6) / 0.4 * 0.3);
      o.m.position.y = k < 0.6 ? f.p0.y + (f.p1.y - f.p0.y) * kk : f.p1.y + Math.abs(Math.sin((k - 0.6) / 0.4 * Math.PI)) * 0.015 * (1 - k);
      o.m.quaternion.slerpQuaternions(f.q0, f.q1, ease(k));
      if (k < 1) o.m.rotateY(f.spin * (1 - k) * 0.05);
      if (k >= 1) { o.m.position.copy(f.p1); o.m.quaternion.copy(f.q1); o.m.rotation.y = o.m.rotation.y; o.fall = null; o.state = 'table'; statusText = 'recovering…'; }
    }
    const a = o.anim;
    if (!a) continue;
    const k = Math.min(1, Math.max(0, (T - a.t0) / a.d));
    o.m.scale.setScalar(Math.max(0.001, a.from + (a.to - a.from) * ease(k)));
    if (k >= 1) { if (a.kill) { scene.remove(o.m); objs.splice(i, 1); } else o.anim = null; }
  }
  markA += ((markTarget ? 1 : 0) - markA) * Math.min(1, dt * 6);
  if (markTarget) marker.position.set(markTarget.m.position.x, 0.002, markTarget.m.position.z);
  marker.material.opacity = 0.75 * markA;
  marker.scale.setScalar(1 + 0.08 * Math.sin(T * 6));
  ghost.visible = !!ghostSlot && (!batch || batch.mode.name === 'pyramid');
  if (ghost.visible) { ghost.position.copy(ghostSlot); ghost.rotation.y = ALIGN_YAW; ghost.children[1].material.opacity = 0.5 + 0.35 * Math.sin(T * 5); }
  // 指示文を 1 文字ずつ打つ
  const n = Math.max(0, Math.floor((T - promptT0) * 28));
  const shown = '> "' + promptText.slice(0, n) + (n >= promptText.length ? '"' : '');
  if (hudT.textContent !== shown) hudT.textContent = shown;
  if (hudS.textContent !== statusText) { hudS.textContent = statusText; hudS.classList.toggle('warn', statusText.startsWith('↺ dropped')); }
  updateChunk(T);
}

let mx = 0, my = 0, cx = 0, cy = 0;
window.addEventListener('pointermove', (e) => {
  mx = e.clientX / window.innerWidth - 0.5;
  my = e.clientY / window.innerHeight - 0.5;
});
function resize() {
  const w = host.clientWidth, h = host.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(host);
resize();

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clock = new THREE.Clock();
let T = 0;
// 確認用: ?t=秒 でその時刻まで進めた絵を出す
const target = fixedParam !== null ? parseFloat(fixedParam) : (reduce ? 40 : 0);
while (T < target) { step(T, 1 / 60); T += 1 / 60; }

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!reduce && fixedParam === null) T += dt;
  step(T, dt);
  cx += (mx - cx) * 0.04; cy += (my - cy) * 0.04;
  const narrow = host.clientWidth < 560;
  const ang = 0.82 + cx * 0.4, rad = narrow ? 2.75 : 2.6;
  camera.position.set(Math.cos(ang) * rad, 1.18 + cy * 0.25, Math.sin(ang) * rad);
  camera.lookAt(lookAt);
  if (zoomParam) { // 確認用: ハンドに寄る
    const c = new THREE.Vector3().setFromMatrixPosition(tcp.matrixWorld);
    camera.position.set(c.x + 0.42, c.y + 0.5, c.z + 0.42); camera.lookAt(c);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
