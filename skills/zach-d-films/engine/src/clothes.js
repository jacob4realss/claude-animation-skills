import * as THREE from 'three';
import { loft } from './sculpt.js';

// Everyday clothes for makeHuman('dress', { clothes }) — all optional:
//   shirt      colour of the shirt / top (torso and, without a jacket, the sleeves)
//   jacket     colour of an open suit jacket with lapels (sleeves take its colour)
//   leather    true makes the jacket a shiny leather jacket, worn open
//   vest       colour of a V-neck sweater vest
//   tie        colour of a tie
//   trousers   colour of the trousers
//   shoes      tint for the shoes (multiplies the brown leather: 0x444444 reads black)
//   police     true adds a badge, name plate, shoulder patches, duty belt and a peaked cap
// torsoR / TORSO_SX / TORSO_SZ describe the body the clothes wrap; they come from human.js.

let TORSO = null;
export function setTorso(t) { TORSO = t; }

const cache = new Map();
const once = (k, f) => { if (!cache.has(k)) cache.set(k, f()); return cache.get(k); };

export function fabric(M, color, { rough = 0.9, bump = 1.2 } = {}) {
  return once(`fabric:${color}:${rough}:${bump}`, () => { const m = M.cloth.clone(); m.color.set(color); m.roughness = rough; m.bumpScale = bump; return m; });
}
const leatherMat = (color) => once('leather:' + color, () => new THREE.MeshPhysicalMaterial({ color, roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.35, side: THREE.DoubleSide }));
const gold = () => once('gold', () => new THREE.MeshPhysicalMaterial({ color: 0xd4a640, metalness: 1, roughness: 0.28, clearcoat: 0.4 }));
const plain = (color, rough = 0.6) => once(`plain:${color}:${rough}`, () => new THREE.MeshStandardMaterial({ color, roughness: rough }));

// A strip of the torso surface between two angles (0 = straight ahead), lifted by `offset`.
// lo(y)/hi(y) may change with height, which is how V-necks and open jackets are cut.
export function torsoStrip(y0, y1, offset, lo, hi, { rows = 36, segs = 64 } = {}) {
  const { torsoR, TORSO_SX, TORSO_SZ } = TORSO;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= rows; i++) {
    const y = y0 + (y1 - y0) * i / rows, r = torsoR(y) + (typeof offset === 'function' ? offset(y) : offset);
    const a0 = lo(y), a1 = hi(y);
    for (let j = 0; j <= segs; j++) {
      const p = a0 + (a1 - a0) * j / segs;
      pos.push(r * Math.sin(p) * TORSO_SX, y, r * Math.cos(p) * TORSO_SZ); uv.push(j / segs * 4, i / rows * 2);
    }
  }
  for (let i = 0; i < rows; i++) for (let j = 0; j < segs; j++) {
    const a = i * (segs + 1) + j, b = a + segs + 1;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * Math.min(1, Math.max(0, t));
// add a strip split across the two torso bones (spine below y = 0.19, chest above, chest space is y - 0.2)
function addStrip(j, mat, y0, y1, offset, lo, hi) {
  const out = [];
  const mk = (a, b, parent, dy) => { const g = torsoStrip(a, b, offset, lo, hi); g.translate(0, dy, 0); const m = new THREE.Mesh(g, mat); m.castShadow = m.receiveShadow = true; parent.add(m); out.push(m); };
  if (y0 < 0.19) mk(y0, Math.min(y1, 0.2), j.spine, 0);
  if (y1 > 0.19) mk(Math.max(y0, 0.18), y1, j.chest, -0.2);
  return out;
}
function front(y, off = 0) { const { torsoR, TORSO_SZ } = TORSO; return (torsoR(y) + off) * TORSO_SZ; }

export function dress(j, M, c = {}) {
  const sleeve = c.jacket ?? c.shirt ?? 0x1d1d20;
  // jacket: open V that closes at the button, with lapels
  if (c.jacket != null) {
    const mat = c.leather ? leatherMat(c.jacket) : (() => { const m = fabric(M, c.jacket, { rough: 0.8, bump: 0.8 }).clone(); m.side = THREE.DoubleSide; return m; })();
    const cut = c.leather
      ? (y) => y < 0.3 ? 0.34 : lerp(0.34, 0.66, (y - 0.3) / 0.2)
      : (y) => y < 0.0 ? 0.06 + (0 - y) * 1.2 : y < 0.13 ? 0.06 : lerp(0.06, 0.64, (y - 0.13) / 0.32);
    addStrip(j, mat, -0.14, 0.53, (y) => 0.014 + 0.006 * Math.max(0, (0.0 - y) / 0.14), cut, (y) => TAU - cut(y));
    const lw = (y) => lerp(0, 0.3, (y - 0.12) / 0.14) * (1 - 0.5 * Math.max(0, (y - 0.46) / 0.07));
    const lap = c.leather ? mat : fabric(M, new THREE.Color(c.jacket).multiplyScalar(0.8).getHex(), { rough: 0.6, bump: 0.4 });
    addStrip(j, lap, 0.12, 0.53, 0.021, cut, (y) => cut(y) + lw(y));
    addStrip(j, lap, 0.12, 0.53, 0.021, (y) => TAU - cut(y) - lw(y), (y) => TAU - cut(y));
  }
  if (c.vest != null) {
    const vmat = fabric(M, c.vest, { rough: 0.95, bump: 2 });
    const cut = (y) => y < 0.27 ? 0.0 : lerp(0.0, 0.62, (y - 0.27) / 0.24);
    addStrip(j, vmat, -0.12, 0.51, 0.008, cut, (y) => TAU - cut(y));
  }
  // a shirt collar
  const shirt = fabric(M, c.shirt ?? 0xf2f2ee, { rough: 0.85, bump: 0.6 });
  if (c.tie != null || c.collar) {
    for (const s of [1, -1]) {
      const pts = [[s * 0.012, 0.548], [s * 0.05, 0.535], [s * 0.07, 0.51]].map(([x, y]) => new THREE.Vector3(x, y - 0.2, front(y, 0.012)));
      const m = new THREE.Mesh(loft(pts, [0.012, 0.014, 0.008], { flat: 0.3 }), shirt); m.castShadow = true; j.chest.add(m);
    }
  }
  if (c.tie != null) {
    const tm = fabric(M, c.tie, { rough: 0.55, bump: 0.3 });
    const ys = [0.53, 0.5, 0.4, 0.28, 0.16, 0.08];
    const pts = ys.map(y => new THREE.Vector3(0, y - 0.2, front(y, c.jacket != null || c.vest != null ? 0.006 : 0.005)));
    const tie = new THREE.Mesh(loft(pts, [0.011, 0.012, 0.016, 0.019, 0.021, 0.018], { up: new THREE.Vector3(0, 0, 1), flat: 0.18, steps: 36 }), tm);
    tie.castShadow = true; j.chest.add(tie);
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.014, 16, 12), tm); knot.scale.set(1, 1.1, 0.6);
    knot.position.set(0, 0.528 - 0.2, front(0.528, 0.01)); j.chest.add(knot);
  }
  if (c.police) police(j, M);
  else if (c.belt !== false) {   // a slim belt where the shirt tucks in
    const { torsoR, TORSO_SX, TORSO_SZ } = TORSO;
    const bg = new THREE.TorusGeometry(torsoR(-0.055) + 0.004, 0.009, 8, 64); bg.rotateX(Math.PI / 2); bg.scale(TORSO_SX, 0.8, TORSO_SZ);
    const b = new THREE.Mesh(bg, plain(c.beltColor ?? 0x1e1712, 0.45)); b.position.y = -0.055; j.spine.add(b);
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.018, 0.004), plain(0xb9b2a3, 0.3)); buckle.position.set(0, -0.055, front(-0.055, 0.013)); j.spine.add(buckle);
  }
  return { sleeve: c.leather && c.jacket != null ? leatherMat(c.jacket) : fabric(M, sleeve) };
}

function shieldGeometry() {
  return once('shield', () => {
    const s = new THREE.Shape();
    s.moveTo(0, 0.03); s.quadraticCurveTo(0.012, 0.034, 0.022, 0.03); s.lineTo(0.022, 0.0);
    s.quadraticCurveTo(0.02, -0.02, 0, -0.032); s.quadraticCurveTo(-0.02, -0.02, -0.022, 0.0); s.lineTo(-0.022, 0.03);
    s.quadraticCurveTo(-0.012, 0.034, 0, 0.03);
    return new THREE.ExtrudeGeometry(s, { depth: 0.003, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015, bevelSegments: 2 });
  });
}
function onChest(j, mesh, x, y, off = 0.004) {
  const { torsoR, TORSO_SX, TORSO_SZ } = TORSO;
  const r = torsoR(y) + off, a = Math.asin(Math.min(1, x / (r * TORSO_SX)));
  mesh.position.set(x, y - 0.2, Math.cos(a) * r * TORSO_SZ);
  mesh.rotation.y = Math.atan2(Math.sin(a) * TORSO_SZ, Math.cos(a) * TORSO_SX) * 0.9;
  mesh.castShadow = true; j.chest.add(mesh);
}
function police(j, M) {
  const g = gold();
  onChest(j, new THREE.Mesh(shieldGeometry(), g), 0.085, 0.4);                                  // badge (wearer's left)
  onChest(j, new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.011, 0.003), g), -0.085, 0.39);       // name plate
  const patch = once('patch', () => new THREE.MeshStandardMaterial({ color: 0x2f4d8a, roughness: 0.7 }));
  for (const k of ['lSh', 'rSh']) {
    const s = k[0] === 'l' ? 1 : -1;
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.004, 24), patch);
    p.rotation.z = Math.PI / 2; p.position.set(s * 0.059, -0.07, 0.0); j[k].add(p);
    const e = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.002, 6, 24), g); e.rotation.y = Math.PI / 2; e.position.copy(p.position); e.position.x += s * 0.002; j[k].add(e);
  }
  // duty belt
  const belt = plain(0x111113, 0.4);
  const { torsoR, TORSO_SX, TORSO_SZ } = TORSO;
  const bg = new THREE.TorusGeometry(torsoR(-0.07) + 0.012, 0.016, 8, 64); bg.rotateX(Math.PI / 2); bg.scale(TORSO_SX, 0.7, TORSO_SZ);
  const b = new THREE.Mesh(bg, belt); b.position.y = -0.07; b.castShadow = true; j.spine.add(b);
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.026, 0.006), g); buckle.position.set(0, -0.07, front(-0.07, 0.026)); j.spine.add(buckle);
}

// a peaked police cap, sized for the sculpted head (head space)
export function policeCap(M) {
  const g = new THREE.Group();
  const navy = fabric(M, 0x1b2438, { rough: 0.8, bump: 0.6 });
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.112, 0.094, 0.05, 48), navy); crown.position.y = 0.04; crown.scale.z = 1.08;
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.112, 48, 8, 0, TAU, 0, 0.35), navy); top.position.y = 0.025; top.scale.set(1, 0.6, 1.08);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.096, 0.094, 0.026, 48), plain(0x0c0c0e, 0.35)); band.position.y = 0.006; band.scale.z = 1.08;
  const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.005, 40, 1, false, -1.2, 2.4), plain(0x08080a, 0.15));
  visor.position.set(0, -0.004, 0.012); visor.scale.set(1, 1, 1.35); visor.rotation.x = 0.22;
  const badge = new THREE.Mesh(shieldGeometry(), gold()); badge.scale.setScalar(0.7); badge.position.set(0, 0.045, 0.108); badge.rotation.x = -0.12;
  for (const m of [crown, top, band, visor, badge]) { m.castShadow = true; g.add(m); }
  return g;
}
