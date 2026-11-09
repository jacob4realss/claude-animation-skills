import * as THREE from 'three';

// Low-poly toy people: a big faceted head with dot eyes and a line mouth, chunky limbs, flat shading.
// Same joint names and setPose()/setFace() as human.js, so the same poses work on both.
// Units are metres; a toy stands about 1.2 m tall with its feet at y = 0.
//
//   makeToy({ skin, hair, hairColor, shirt, sleeves, trousers, shoes, apron, vest, dress, jacket, face })
//     hair: 'short' | 'spiky' | 'side' | 'bob' | 'long' | 'layered' | 'bun' | 'bald'
//     sleeves: 'short' | 'long'     dress: a long skirt colour (wedding dress, gowns)
//     face: 'm' | 'f' (f adds lashes and a little blush)

const cache = new Map();
const once = (k, f) => { if (!cache.has(k)) cache.set(k, f()); return cache.get(k); };
export const toyMat = (color, rough = 0.75, extra = {}) => once(`toy:${color}:${rough}:${JSON.stringify(extra)}`,
  () => new THREE.MeshStandardMaterial({ color, roughness: rough, flatShading: true, ...extra }));
function mesh(g, m, pos, rot, scl) {
  const o = new THREE.Mesh(g, m);
  if (pos) o.position.set(...pos); if (rot) o.rotation.set(...rot); if (scl) o.scale.set(...scl);
  o.castShadow = o.receiveShadow = true; return o;
}
// a tapered limb hanging down from its joint, ending in a ball so bends stay closed
function limb(r0, r1, len, m, seg = 8) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(r0, r1, len, seg), m, [0, -len / 2, 0]));
  g.add(mesh(new THREE.SphereGeometry(r0, seg, 6), m));
  return g;
}

const HEAD_R = 0.15;
function hair(style, m) {
  const g = new THREE.Group(), R = HEAD_R * 1.07;
  const cap = (theta = 1.15, tilt = -0.35, sx = 1, sy = 1, sz = 1) => {
    const c = mesh(new THREE.SphereGeometry(R, 12, 6, 0, Math.PI * 2, 0, theta), m, [0, 0.0, -0.008], [tilt, 0, 0], [sx, sy, sz]);
    g.add(c); return c;
  };
  if (style === 'bald') return g;
  if (style === 'short') { cap(1.2, -0.4); g.add(mesh(new THREE.SphereGeometry(0.1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), m, [0, 0.12, 0.06], [0.45, 0, 0], [1, 0.4, 0.8])); }
  if (style === 'spiky') {
    cap(1.2, -0.4);
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; g.add(mesh(new THREE.ConeGeometry(0.035, 0.07, 5), m, [Math.sin(a) * 0.07, 0.15, Math.cos(a) * 0.07 - 0.01], [Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5])); }
  }
  if (style === 'side') { cap(1.25, -0.4); const f = mesh(new THREE.SphereGeometry(0.11, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), m, [0.03, 0.115, 0.05], [0.5, 0, -0.25], [1, 0.45, 0.8]); g.add(f); }
  if (style === 'bob') {
    cap(1.3, -0.25);
    g.add(mesh(new THREE.CylinderGeometry(R * 1.02, R * 1.08, 0.16, 12, 1, true, Math.PI * 0.3, Math.PI * 1.4), m, [0, -0.02, -0.01]));   // open at the front (theta 0 = +z)
    g.add(mesh(new THREE.BoxGeometry(0.22, 0.05, 0.06), m, [0, 0.12, 0.1], [0.35, 0, 0]));
  }
  if (style === 'long' || style === 'layered') {
    cap(1.3, -0.25);
    const back = mesh(new THREE.CylinderGeometry(R * 1.03, R * 1.18, 0.34, 12, 1, true, Math.PI * 0.34, Math.PI * 1.32), m, [0, -0.1, -0.02]); g.add(back);
    if (style === 'layered') for (const s of [1, -1]) g.add(mesh(new THREE.BoxGeometry(0.05, 0.2, 0.07), m, [s * 0.13, -0.05, 0.06], [0.1, 0, s * 0.12]));
    g.add(mesh(new THREE.BoxGeometry(0.2, 0.045, 0.06), m, [0, 0.125, 0.1], [0.4, 0, 0]));
  }
  if (style === 'bun') { cap(1.3, -0.25); g.add(mesh(new THREE.SphereGeometry(0.06, 8, 6), m, [0, 0.13, -0.11])); }
  g.traverse(o => { if (o.material) { o.material = o.material.clone(); o.material.side = THREE.DoubleSide; } });
  return g;
}

export function makeToy(look = {}) {
  const skin = toyMat(look.skin ?? 0xe8b48f, 0.6), shirt = toyMat(look.shirt ?? 0x8a1f24), pants = toyMat(look.trousers ?? 0x2e2f36);
  const shoe = toyMat(look.shoes ?? 0x2a211c, 0.5), hairM = toyMat(look.hairColor ?? 0x3a2618, 0.7);
  const dark = toyMat(0x141210, 0.35);
  const root = new THREE.Group();
  const pelvis = new THREE.Group(); pelvis.position.y = 0.5; root.add(pelvis);
  const spine = new THREE.Group(); pelvis.add(spine);
  const chest = new THREE.Group(); chest.position.y = 0.2; spine.add(chest);
  const j = { root, pelvis, spine, chest };

  // body: hips (trousers) and a faceted torso (shirt)
  spine.add(mesh(new THREE.CylinderGeometry(0.135, 0.13, 0.14, 10), pants, [0, 0.0, 0], null, [1, 1, 0.72]));
  spine.add(mesh(new THREE.CylinderGeometry(0.14, 0.135, 0.2, 10), shirt, [0, 0.13, 0], null, [1, 1, 0.72]));
  chest.add(mesh(new THREE.CylinderGeometry(0.15, 0.14, 0.2, 10), shirt, [0, 0.03, 0], null, [1, 1, 0.74]));
  chest.add(mesh(new THREE.SphereGeometry(0.15, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), shirt, [0, 0.13, 0], null, [1, 0.45, 0.74]));
  if (look.vest != null) for (const [y, h, r0, r1, p] of [[0.13, 0.2, 0.145, 0.14, spine], [0.03, 0.2, 0.155, 0.145, chest]])
    p.add(mesh(new THREE.CylinderGeometry(r0, r1, h, 10, 1, true, Math.PI * 0.1, Math.PI * 1.8), toyMat(look.vest), [0, y, 0], null, [1, 1, 0.76]));
  if (look.jacket != null) for (const [y, h, r0, r1, p] of [[0.12, 0.22, 0.15, 0.145, spine], [0.03, 0.2, 0.16, 0.15, chest]])
    p.add(mesh(new THREE.CylinderGeometry(r0, r1, h, 10, 1, true, Math.PI * 0.14, Math.PI * 1.72), toyMat(look.jacket, 0.55), [0, y, 0], null, [1, 1, 0.78]));
  if (look.apron) {
    const ap = toyMat(look.apron === true ? 0xf2efe8 : look.apron, 0.85);
    spine.add(mesh(new THREE.BoxGeometry(0.22, 0.3, 0.012), ap, [0, -0.06, 0.1]));
    spine.add(mesh(new THREE.TorusGeometry(0.135, 0.012, 4, 20), toyMat(0x1b1a1a, 0.5), [0, 0.07, 0], [Math.PI / 2, 0, 0], [1, 0.74, 1]));
  }
  if (look.dress != null) {
    const dm = toyMat(look.dress, 0.8);
    spine.add(mesh(new THREE.CylinderGeometry(0.15, 0.32, 0.56, 12), dm, [0, -0.3, 0], null, [1, 1, 0.85]));
  }

  // neck + head
  const neck = new THREE.Group(); neck.position.y = 0.22; chest.add(neck);
  neck.add(mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.05, 8), skin, [0, 0.01, 0]));
  const head = new THREE.Group(); head.position.y = 0.02; neck.add(head);
  const hc = new THREE.Group(); hc.position.y = HEAD_R * 0.95; head.add(hc);
  hc.add(mesh(new THREE.SphereGeometry(HEAD_R, 14, 10), skin, null, null, [1, 1.02, 0.96]));
  for (const s of [1, -1]) hc.add(mesh(new THREE.SphereGeometry(0.03, 6, 5), skin, [s * HEAD_R * 0.98, -0.005, 0], null, [0.5, 1, 0.8]));
  hc.add(hair(look.hair ?? 'short', hairM));
  // face: dot eyes with a glint, block brows, a line mouth (open and smile versions swap in)
  const eyes = [1, -1].map(s => {
    const e = new THREE.Group(); e.position.set(s * 0.05, 0.005, HEAD_R * 0.9); hc.add(e);
    e.add(mesh(new THREE.SphereGeometry(0.021, 10, 8), dark, null, null, [0.85, 1.15, 0.55]));
    const gl = new THREE.Mesh(new THREE.SphereGeometry(0.005, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff })); gl.position.set(-0.006, 0.008, 0.009); e.add(gl);
    if (look.face === 'f') e.add(mesh(new THREE.BoxGeometry(0.03, 0.004, 0.004), dark, [s * 0.008, 0.022, 0.004], [0, 0, s * 0.3]));
    return e;
  });
  const brows = [1, -1].map(s => {
    const b = mesh(new THREE.BoxGeometry(look.face === 'f' ? 0.04 : 0.048, look.face === 'f' ? 0.008 : 0.012, 0.01), toyMat(look.browColor ?? look.hairColor ?? 0x3a2618, 0.7), [s * 0.052, 0.048, HEAD_R * 0.9]);
    b.rotation.x = -0.25; hc.add(b); b.userData.s = s; return b;
  });
  const line = mesh(new THREE.BoxGeometry(0.042, 0.006, 0.006), dark, [0, -0.058, HEAD_R * 0.93]); hc.add(line);
  const open = mesh(new THREE.SphereGeometry(0.022, 10, 8), toyMat(0x3a0e0e, 0.6), [0, -0.062, HEAD_R * 0.9], null, [1.1, 1, 0.4]); hc.add(open);
  const grin = mesh(new THREE.TorusGeometry(0.026, 0.0035, 4, 14, Math.PI * 0.8), dark, [0, -0.05, HEAD_R * 0.93], [0, 0, Math.PI * 1.1]); hc.add(grin);
  if (look.face === 'f') [1, -1].forEach(s => { const b = mesh(new THREE.CircleGeometry(0.018, 10), toyMat(0xf08a80, 1, { transparent: true, opacity: 0.45 }), [s * 0.08, -0.03, HEAD_R * 0.87], [0, s * 0.5, 0]); hc.add(b); });

  // arms: short or long sleeves, ball hands
  for (const s of [1, -1]) {
    const k = s > 0 ? 'l' : 'r';
    const sh = new THREE.Group(); sh.position.set(s * 0.175, 0.17, 0); chest.add(sh);
    const sleeve = look.jacket != null ? toyMat(look.jacket, 0.55) : shirt;
    const longS = look.sleeves === 'long' || look.jacket != null;
    sh.add(limb(0.052, 0.045, 0.19, longS ? sleeve : skin));
    if (!longS) sh.add(mesh(new THREE.CylinderGeometry(0.058, 0.055, 0.09, 8), sleeve, [0, -0.03, 0]));
    const el = new THREE.Group(); el.position.y = -0.2; sh.add(el);
    el.add(limb(0.045, 0.04, 0.17, longS ? sleeve : skin));
    const wr = new THREE.Group(); wr.position.y = -0.18; el.add(wr);
    wr.add(mesh(new THREE.SphereGeometry(0.048, 8, 6), skin, [0, -0.03, 0], null, [0.85, 1.05, 0.8]));
    j[k + 'Sh'] = sh; j[k + 'El'] = el; j[k + 'Wr'] = wr;
    // legs
    const hip = new THREE.Group(); hip.position.set(s * 0.07, -0.02, 0); pelvis.add(hip);
    hip.add(limb(0.065, 0.058, 0.22, pants));
    const kn = new THREE.Group(); kn.position.y = -0.23; hip.add(kn);
    kn.add(limb(0.058, 0.052, 0.21, pants));
    const an = new THREE.Group(); an.position.y = -0.22; kn.add(an);
    an.add(mesh(new THREE.BoxGeometry(0.09, 0.06, 0.15), shoe, [0, -0.02, 0.03]));
    j[k + 'Hip'] = hip; j[k + 'Kn'] = kn; j[k + 'An'] = an;
  }
  j.neck = neck; j.head = head;

  const toy = {
    root, j, hairGroup: hc.children.find(c => c.isGroup),
    setPose(p = {}) {
      for (const k of ['pelvis', 'spine', 'chest', 'neck', 'head', 'lSh', 'lEl', 'lWr', 'rSh', 'rEl', 'rWr', 'lHip', 'lKn', 'lAn', 'rHip', 'rKn', 'rAn']) {
        const v = p[k] || [0, 0, 0];
        j[k].rotation.set(v[0], v[1], v[2], 'YXZ');
      }
      j.pelvis.position.y = 0.5 + (p.drop || 0);
    },
    // same keys as human.js: mouth (open), smile, lids (-0.4 wide .. 1 shut), brows (up/down), browTilt (+ worried, - stern)
    setFace({ mouth = 0, smile = 0, lids = 0, brows: up = 0, browTilt = 0 } = {}) {
      open.visible = mouth > 0.12; open.scale.set(1.1, 0.4 + mouth * 1.4, 0.4);
      grin.visible = !open.visible && smile > 0.3; line.visible = !open.visible && !grin.visible;
      for (const e of eyes) e.scale.set(1 + Math.max(0, -lids) * 0.4, Math.max(0.12, 1 - Math.max(0, lids)) * (1 + Math.max(0, -lids) * 0.4), 1);
      for (const b of brows) { b.position.y = 0.048 + up * 0.012; b.rotation.z = -b.userData.s * browTilt * 0.35; }
    },
    setMouth(v) { this.setFace({ mouth: v, lids: v * 0.6, brows: v * 0.6, browTilt: v }); },
  };
  toy.setPose({}); toy.setFace({});
  return toy;
}
