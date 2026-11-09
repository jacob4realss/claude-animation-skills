import * as THREE from 'three';
import { smin, smax, smoothstep, ell, capsule, surfaceT, sculpt, loft } from './sculpt.js';

// One smooth sculpted head: skull, face, nose, lips, chin and hair are a single blended surface,
// with separate eyes, eyelids, eyebrows and ears. The mouth opens through a morph target.
// Head space: origin at the top of the neck, +z is the way the face looks, units are metres.

const SKIN = 0xd99b7a, HAIR = 0x3a2618, LIP = 0xc07a68, MOUTH = 0x3c1412, BLUSH = 0xe08a78;
const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const C = { skin: lin(SKIN), hair: lin(HAIR), lip: lin(LIP), mouth: lin(MOUTH), blush: lin(BLUSH) };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const EYE = { x: 0.034, y: 0.108, z: 0.0735, r: 0.0172 };
const JAW_PIVOT = [0.07, 0.0];          // (y, z) of the hinge, near the ears
const JAW_OPEN = 0.24;                  // radians at a full scream
const MOUTH_Y = 0.0235;                 // where the lips meet

// ---------- the shape ----------
// jaw-side parts are evaluated in "rest" coordinates so the open state is the jaw swung down
function restJaw(y, z, a) {   // undo a jaw rotation of a radians about the hinge
  if (!a) return [y, z];
  const [py, pz] = JAW_PIVOT, c = Math.cos(a), s = Math.sin(a), yy = y - py, zz = z - pz;
  return [py + yy * c + zz * s, pz - yy * s + zz * c];
}
function faceLower(x, y, z) {               // the jaw and lower face, narrowing toward the chin
  const taper = 0.78 + 0.22 * smoothstep(-0.035, 0.06, y);
  return ell(x / taper, y, z, 0, 0.052, 0.024, 0.071, 0.074, 0.076) * taper;
}
function skinShape(x, y, z) {
  const ax = Math.abs(x);
  let d = ell(x, y, z, 0, 0.113, -0.006, 0.086, 0.098, 0.096);                      // cranium
  d = smin(d, faceLower(x, y, z), 0.03);                                             // face and jaw
  d = smin(d, ell(ax, y, z, 0.041, 0.064, 0.058, 0.03, 0.03, 0.03), 0.035);          // cheeks
  d = smin(d, ell(x, y, z, 0, 0.13, 0.068, 0.068, 0.019, 0.032), 0.02);              // brow
  d = smin(d, ell(x, y, z, 0, -0.008, 0.059, 0.03, 0.025, 0.03), 0.02);              // chin
  d = smin(d, capsule(x, y, z, 0, 0.108, 0.087, 0, 0.074, 0.106, 0.0085), 0.012);    // nose bridge
  d = smin(d, ell(x, y, z, 0, 0.068, 0.107, 0.0138, 0.0125, 0.0135), 0.01);          // nose tip
  d = smin(d, ell(ax, y, z, 0.0122, 0.0635, 0.099, 0.0098, 0.008, 0.009), 0.006);    // nostrils
  d = smin(d, LIP_U(x, y, z), 0.009);                                                // upper lip
  d = smin(d, LIP_L(x, y, z), 0.009);                                                // lower lip
  d = smax(d, -ell(ax, y, z, EYE.x, EYE.y, 0.087, 0.0205, 0.0148, 0.0145), 0.01);    // eye sockets
  return d;
}
const LIP_U = (x, y, z) => ell(x, y, z, 0, 0.031, 0.0895, 0.0225, 0.0078, 0.0105);
const LIP_L = (x, y, z) => ell(x, y, z, 0, 0.0158, 0.0865, 0.0205, 0.0082, 0.0105);
// opening the jaw bends the face below the lips down around the hinge (a smooth warp, no seam)
function warp(y, z, a) {
  const w = a * smoothstep(MOUTH_Y + 0.004, MOUTH_Y - 0.03, y) * smoothstep(-0.02, 0.06, z);
  return restJaw(y, z, w);
}
function neck(x, y, z) { return capsule(x, y, z, 0, 0.05, -0.016, 0, -0.075, -0.008, 0.046 - 0.06 * Math.min(0, y)); }
function hairline(x, y, z) {
  const a = Math.abs(Math.atan2(x, z));                                              // 0 front, PI back
  return 0.1 + 0.068 * Math.cos(a) + 0.01 * Math.exp(-(((a - 0.72) / 0.22) ** 2)) - 0.026 * Math.exp(-(((a - 1.32) / 0.16) ** 2)); // temples, sideburns
}
// hair grows out of the skin: zero thickness at the hairline, so its edge is soft, not a step
function hairOver(skin, x, y, z, hood) {
  const hl = hairline(x, y, z), above = y - hl;
  let d = skin - 0.0075 * smoothstep(-0.002, 0.024, above);
  if (!hood) d = smin(d, smax(ell(x, y, z, 0.006, 0.19, 0.03, 0.074, 0.036, 0.066), 0.012 - above, 0.012), 0.03); // volume on top
  return d + 0.0008 * Math.sin(x * 330 + Math.sin(z * 60) * 1.5) * smoothstep(0.01, 0.03, above);                // combed strands
}

const CAVITY = [0, 0.007, 0.095, 0.0215, 0.02, 0.015];   // shallow dark mouth, so the mesh stays even
function skinOnly(a) {
  return (x, y, z) => {
    const [ry, rz] = warp(y, z, a);
    return smin(skinShape(x, ry, rz), neck(x, y, z), 0.014);
  };
}
function headSDF(a, hood) {
  const skin = skinOnly(a);
  return (x, y, z) => {
    let d = hairOver(skin(x, y, z), x, y, z, hood);
    if (!a) d = smax(d, -ell(x, y, z, 0, MOUTH_Y, 0.099, 0.0205, 0.0013, 0.012), 0.002);   // lip line
    else d = smax(d, -ell(x, y, z, ...CAVITY), 0.004);                                       // open mouth
    return d;
  };
}
function headColor(a) {
  return (x, y, z) => {
    const [ry, rz] = warp(y, z, a);
    const ax = Math.abs(x);
    let c = C.skin;
    const cheek = Math.exp(-((ax - 0.046) ** 2 + (y - 0.066) ** 2 + (z - 0.075) ** 2) / 0.0004);
    c = mix(c, C.blush, 0.22 * cheek);
    const lips = Math.min(LIP_U(x, ry, rz), LIP_L(x, ry, rz));
    c = mix(c, C.lip, smoothstep(0.0028, 0.0004, lips) * smoothstep(0.08, 0.09, rz));
    const inner = a ? ell(x, y, z, CAVITY[0], CAVITY[1], CAVITY[2], CAVITY[3] + 0.001, CAVITY[4] + 0.001, CAVITY[5] + 0.001) : ell(x, y, z, 0, MOUTH_Y, 0.099, 0.021, 0.0018, 0.013);
    c = mix(c, C.mouth, smoothstep(0.0012, -0.0006, inner));
    return c;                                  // hair colour is drawn in the shader (crisp edge)
  };
}

const cache = new Map();
function headGeometry(hood) {
  const key = hood ? 'hood' : 'bare';
  if (!cache.has(key)) {
    cache.set(key, sculpt(
      [{ sdf: headSDF(0, hood), color: headColor(0) }, { sdf: headSDF(JAW_OPEN, hood), color: headColor(JAW_OPEN) }],
      { center: [0, 0.09, 0.0], wSeg: 256, hSeg: 192, tMax: 0.3 },
    ));
  }
  return cache.get(key);
}

// ---------- materials ----------
let FM = null;
function faceMaterials(M) {
  if (FM) return FM;
  const face = M.skin.clone();
  face.color.set(0xffffff); face.vertexColors = true;
  const hc = new THREE.Color(HAIR);
  face.onBeforeCompile = (s) => {
    // hair is coloured per pixel from the hairline (same formula as hairline() above), so its edge stays clean
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace('#include <morphtarget_vertex>', '#include <morphtarget_vertex>\nvObj = transformed;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float ha = abs(atan(vObj.x, vObj.z));
        float hl = 0.1 + 0.068 * cos(ha) + 0.01 * exp(-pow((ha - 0.72) / 0.22, 2.0)) - 0.026 * exp(-pow((ha - 1.32) / 0.16, 2.0));
        float above = vObj.y - hl;
        float hw = max(0.0022, 1.5 * fwidth(above));
        float hairF = smoothstep(0.0, hw, above);
        float strand = 0.86 + 0.14 * sin(vObj.x * 330.0 + sin(vObj.z * 60.0) * 1.5) * smoothstep(0.004, 0.02, above);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${hc.r.toFixed(5)}, ${hc.g.toFixed(5)}, ${hc.b.toFixed(5)}) * strand, hairF);`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
        #ifdef USE_SHEEN
          material.sheenColor *= (1.0 - hairF);
        #endif
        #ifdef USE_CLEARCOAT
          material.clearcoat *= (1.0 - hairF);
        #endif
        material.roughness = mix(material.roughness, 0.72, hairF);`);
  };
  face.customProgramCacheKey = () => 'sculpted-face';
  const lid = M.skin.clone(); lid.color.set(SKIN);
  FM = {
    face, lid,
    hair: new THREE.MeshStandardMaterial({ color: HAIR, roughness: 0.8 }),
    lash: new THREE.MeshStandardMaterial({ color: 0x1e140e, roughness: 0.7 }),
    iris: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 }),
    glint: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    teeth: new THREE.MeshStandardMaterial({ color: 0xf2eee4, roughness: 0.35 }),
  };
  return FM;
}

// ---------- eyes ----------
let IRIS = null;
function irisGeometry() {
  if (IRIS) return IRIS;
  const g = new THREE.SphereGeometry(EYE.r * 1.004, 48, 16, 0, Math.PI * 2, 0, 0.64);
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  const pupil = lin(0x0b0807), inner = lin(0x8a5e38), outer = lin(0x4a2e1a), ring = lin(0x1c120c);
  for (let i = 0; i < p.count; i++) {
    const th = Math.acos(Math.min(1, p.getY(i) / (EYE.r * 1.004)));
    let c = th < 0.25 ? pupil : mix(inner, outer, smoothstep(0.27, 0.55, th));
    if (th >= 0.25) c = mix(pupil, c, smoothstep(0.25, 0.29, th));
    c = mix(c, ring, smoothstep(0.55, 0.62, th));
    col.set(c, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.rotateX(Math.PI / 2);                                   // pole (centre of the iris) faces +z
  IRIS = g;
  return g;
}
function makeEye(M, FM, s) {
  const g = new THREE.Group();
  g.position.set(s * EYE.x, EYE.y, EYE.z);
  g.rotation.y = -s * 0.05;                                // a touch of convergence
  const ball = new THREE.Mesh(new THREE.SphereGeometry(EYE.r, 40, 24), M.eyeWhite); g.add(ball);
  g.add(new THREE.Mesh(irisGeometry(), FM.iris));
  const glint = new THREE.Mesh(new THREE.SphereGeometry(0.0024, 12, 8), FM.glint);
  glint.position.set(-0.0045, 0.0055, EYE.r * 0.93); g.add(glint);
  // upper lid with a lash line, lower lid; both pivot on the eye centre
  const LR = EYE.r * 1.08;
  const upper = new THREE.Group(); g.add(upper);
  const ul = new THREE.Mesh(new THREE.SphereGeometry(LR, 40, 14, 0, Math.PI * 2, 0, 1.3), FM.lid); upper.add(ul);
  const lash = new THREE.Mesh(new THREE.TorusGeometry(LR * Math.sin(1.3), 0.0011, 6, 48), FM.lash);
  lash.rotation.x = Math.PI / 2; lash.position.y = LR * Math.cos(1.3); lash.scale.z = 1.6; upper.add(lash);
  const lower = new THREE.Group(); g.add(lower);
  const ll = new THREE.Mesh(new THREE.SphereGeometry(LR * 0.995, 40, 10, 0, Math.PI * 2, Math.PI - 1.08, 1.08), FM.lid); lower.add(ll);
  return { g, upper, lower, ball, glint };
}

// ---------- brows, ears, teeth ----------
function onFace(sdf, x, y, lift = 0) { return new THREE.Vector3(x, y, surfaceT(sdf, x, y, 0, 0, 0, 1, 0.25) + lift); }
const browCache = new Map();
function browGeometry(s) {
  if (!browCache.has(s)) {
    const sdf = headSDF(0, false);
    const pts = [[0.011, 0.131], [0.024, 0.1375], [0.039, 0.139], [0.056, 0.1315]].map(([x, y]) => onFace(sdf, s * x, y, 0.0012));
    const c = pts[1].clone().add(pts[2]).multiplyScalar(0.5);
    pts.forEach(p => p.sub(c));
    const g = loft(pts, [0.0044, 0.0042, 0.0034, 0.0018], { up: new THREE.Vector3(s * 0.25, 0.1, 1).normalize(), flat: 0.45 });
    browCache.set(s, { g, c });
  }
  return browCache.get(s);
}
let EAR = null;
function earGeometry() {
  if (EAR) return EAR;
  const sdf = (x, y, z) => {
    let d = ell(x, y, z, 0, 0, 0, 0.011, 0.027, 0.018);
    d = smax(d, -ell(x, y, z, 0.008, -0.002, 0.003, 0.007, 0.017, 0.011), 0.004);    // the hollow
    return smin(d, ell(x, y, z, -0.004, 0, -0.002, 0.008, 0.02, 0.012), 0.006);      // where it meets the head
  };
  EAR = sculpt([{ sdf }], { center: [-0.002, 0, 0], wSeg: 48, hSeg: 36, tMax: 0.05 });
  return EAR;
}

export function buildFace(M, { hood = false } = {}) {
  const FM = faceMaterials(M);
  const head = new THREE.Group();
  const jaw = new THREE.Group(); head.add(jaw);              // kept for the old API; the jaw is a morph now
  const skin = new THREE.Mesh(headGeometry(hood), FM.face);
  skin.castShadow = skin.receiveShadow = true;
  skin.morphTargetInfluences = [0];
  head.add(skin);
  const eyes = [1, -1].map(s => makeEye(M, FM, s));
  eyes.forEach(e => head.add(e.g));
  const brows = [1, -1].map(s => {
    const { g, c } = browGeometry(s);
    const m = new THREE.Mesh(g, FM.hair); m.position.copy(c); m.castShadow = true; head.add(m);
    return { m, s, y: c.y };
  });
  for (const s of [1, -1]) {
    const ear = new THREE.Mesh(earGeometry(), FM.lid);
    ear.position.set(s * 0.083, 0.094, -0.006);
    ear.rotation.set(0, s * -0.35, s * 0.08);
    if (s < 0) ear.scale.x = -1;
    ear.castShadow = ear.receiveShadow = true;
    head.add(ear);
  }
  // upper teeth behind the lips: hidden inside the head until the mouth opens
  const teeth = new THREE.Mesh(new THREE.CylinderGeometry(0.0235, 0.0235, 0.0075, 32, 1, false, -0.85, 1.7), FM.teeth);
  teeth.position.set(0, 0.0235, 0.064); head.add(teeth);
  if (hood) {
    const hd = new THREE.Mesh(new THREE.SphereGeometry(0.135, 48, 24, 0, Math.PI * 2, 0, 2.0), M.cloth);
    hd.scale.set(0.95, 1.12, 1.08); hd.position.set(0, 0.095, -0.025); hd.rotation.x = -0.75;
    hd.castShadow = hd.receiveShadow = true; head.add(hd);
  }

  // v: 0 relaxed .. 1 screaming (mouth open, eyes squeezed, brows pinched up in the middle)
  function setMouth(v) {
    skin.morphTargetInfluences[0] = v;
    for (const e of eyes) {
      e.upper.rotation.x = -0.2 + v * 0.55;
      e.lower.rotation.x = -v * 0.42;
      e.glint.visible = v < 0.35;            // the catch-light would show through a closed lid
    }
    for (const b of brows) {
      b.m.rotation.z = -b.s * v * 0.22;
      b.m.position.y = b.y + v * 0.004;
    }
  }
  setMouth(0);
  return { head, jaw, setMouth };
}
