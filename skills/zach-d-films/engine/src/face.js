import * as THREE from 'three';
import { smin, smax, smoothstep, ell, capsule, surfaceT, sculpt, loft } from './sculpt.js';

// One smooth sculpted head: skull, face, nose, lips, chin and hair are a single blended surface,
// with separate eyes, eyelids, eyebrows and ears. The mouth opens through a morph target.
// Head space: origin at the top of the neck, +z is the way the face looks, units are metres.
//
// A look picks the person: buildFace(M, { skin, hair, hairColor, face, hood })
//   skin       skin colour (hex)
//   hair       a key of HAIR_STYLES: short, neat, messy, thin, bald, slick (with a ponytail), long, big
//   hairColor  hex
//   face       'm' or 'f' (a softer jaw, smaller nose, fuller lips, finer brows, darker lashes)
// Geometry is built once per face + hairstyle and shared; colours are per person.

const SKIN = 0xd99b7a, HAIR = 0x3a2618, LIP = 0xc07a68, MOUTH = 0x3c1412, BLUSH = 0xe08a78;
const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
// vertex colours are stored relative to the skin, so one mesh works for every skin tone
const rel = (hex) => { const c = lin(hex), s = lin(SKIN); return [c[0] / s[0], c[1] / s[1], c[2] / s[2]]; };
const R = { skin: [1, 1, 1], lip: rel(LIP), mouth: rel(MOUTH), blush: rel(BLUSH) };

const EYE = { x: 0.034, y: 0.108, z: 0.0735, r: 0.0172 };
const JAW_PIVOT = [0.07, 0.0];          // (y, z) of the hinge, near the ears
const JAW_OPEN = 0.24;                  // radians at a full scream
const MOUTH_Y = 0.0235;                 // where the lips meet

// hl: hairline = hl0 + hl1 cos(a) + temples hl2 - sideburns hl3   (a: 0 front .. PI back)
// thick: hair thickness over the scalp; top: an extra soft volume on top (ellipsoid); lumps: messy tufts
export const HAIR_STYLES = {
  short: { hl: [0.1, 0.068, 0.01, 0.026], thick: 0.0075, top: [0.006, 0.19, 0.03, 0.074, 0.036, 0.066] },
  neat: { hl: [0.1, 0.066, 0.006, 0.026], thick: 0.0055, top: [0.004, 0.186, 0.03, 0.07, 0.03, 0.06] },
  messy: { hl: [0.1, 0.064, 0.006, 0.026], thick: 0.009, top: [0.0, 0.194, 0.034, 0.078, 0.04, 0.07], lumps: 0.008 },
  thin: { hl: [0.106, 0.084, 0.016, 0.02], thick: 0.0032 },
  bald: { hl: null },
  slick: { hl: [0.1, 0.07, 0.0, 0.016], thick: 0.0055, extra: 'ponytail' },
  long: { hl: [0.1, 0.07, 0.0, 0.0], thick: 0.006, extra: 'long' },
  big: { hl: [0.1, 0.07, 0.0, 0.0], thick: 0.007, extra: 'big' },
};
const FACES = {
  m: { jaw: [0.071, 0.78], chin: [0.03, 0.025, 0.03], nose: 1, lipU: 0.0078, lipL: 0.0082, brow: [0.13, 0.068, 0.068, 0.019, 0.032] },
  f: { jaw: [0.066, 0.74], chin: [0.026, 0.022, 0.027], nose: 0.86, lipU: 0.0088, lipL: 0.0098, brow: [0.128, 0.066, 0.064, 0.015, 0.03] },
};

// ---------- the shape ----------
function restJaw(y, z, a) {   // undo a jaw rotation of a radians about the hinge
  if (!a) return [y, z];
  const [py, pz] = JAW_PIVOT, c = Math.cos(a), s = Math.sin(a), yy = y - py, zz = z - pz;
  return [py + yy * c + zz * s, pz - yy * s + zz * c];
}
// opening the jaw bends the face below the lips down around the hinge (a smooth warp, no seam)
function warp(y, z, a) {
  const w = a * smoothstep(MOUTH_Y + 0.004, MOUTH_Y - 0.03, y) * smoothstep(-0.02, 0.06, z);
  return restJaw(y, z, w);
}
function neck(x, y, z) { return capsule(x, y, z, 0, 0.05, -0.016, 0, -0.075, -0.008, 0.046 - 0.06 * Math.min(0, y)); }

function makeShape(F) {
  const [jw, jt] = F.jaw, n = F.nose, b = F.brow;
  const LIP_U = (x, y, z) => ell(x, y, z, 0, 0.031, 0.0895, 0.0225, F.lipU, 0.0105);
  const LIP_L = (x, y, z) => ell(x, y, z, 0, 0.0158, 0.0865, 0.0205, F.lipL, 0.0105);
  function faceLower(x, y, z) {               // the jaw and lower face, narrowing toward the chin
    const taper = jt + (1 - jt) * smoothstep(-0.035, 0.06, y);
    return ell(x / taper, y, z, 0, 0.052, 0.024, jw, 0.074, 0.076) * taper;
  }
  function skinShape(x, y, z) {
    const ax = Math.abs(x);
    let d = ell(x, y, z, 0, 0.113, -0.006, 0.086, 0.098, 0.096);                          // cranium
    d = smin(d, faceLower(x, y, z), 0.03);                                                 // face and jaw
    d = smin(d, ell(ax, y, z, 0.041, 0.064, 0.058, 0.03, 0.03, 0.03), 0.035);              // cheeks
    d = smin(d, ell(x, y, z, 0, b[0], b[1], b[2], b[3], b[4]), 0.02);                      // brow
    d = smin(d, ell(x, y, z, 0, -0.008, 0.059, ...F.chin), 0.02);                          // chin
    d = smin(d, capsule(x, y, z, 0, 0.108, 0.087, 0, 0.074, 0.106 - 0.004 * (1 - n), 0.0085 * n), 0.012); // nose bridge
    d = smin(d, ell(x, y, z, 0, 0.068, 0.107 - 0.004 * (1 - n), 0.0138 * n, 0.0125 * n, 0.0135 * n), 0.01); // nose tip
    d = smin(d, ell(ax, y, z, 0.0122 * n, 0.0635, 0.099, 0.0098 * n, 0.008 * n, 0.009 * n), 0.006); // nostrils
    d = smin(d, LIP_U(x, y, z), 0.009);                                                    // upper lip
    d = smin(d, LIP_L(x, y, z), 0.009);                                                    // lower lip
    d = smax(d, -ell(ax, y, z, EYE.x, EYE.y, 0.087, 0.0205, 0.0148, 0.0145), 0.01);        // eye sockets
    return d;
  }
  return { skinShape, LIP_U, LIP_L };
}

export function hairlineAt(hl, x, z) {
  const a = Math.abs(Math.atan2(x, z));
  return hl[0] + hl[1] * Math.cos(a) + hl[2] * Math.exp(-(((a - 0.72) / 0.22) ** 2)) - hl[3] * Math.exp(-(((a - 1.32) / 0.16) ** 2));
}
// hair grows out of the skin: zero thickness at the hairline, so its edge is soft, not a step
function hairOver(st, skin, x, y, z, hood) {
  if (!st.hl) return skin;
  const above = y - hairlineAt(st.hl, x, z);
  let d = skin - st.thick * smoothstep(-0.002, 0.024, above);
  if (st.top && !hood) d = smin(d, smax(ell(x, y, z, ...st.top), 0.012 - above, 0.012), 0.03);       // volume on top
  if (st.lumps) d -= st.lumps * smoothstep(0.02, 0.05, above) * Math.max(0, Math.sin(x * 62 + 1.3) * Math.sin(z * 55 + 0.4) * Math.sin(y * 48 + 0.7)) ** 0.7; // tufts
  return d + 0.0008 * Math.sin(x * 330 + Math.sin(z * 60) * 1.5) * smoothstep(0.01, 0.03, above);      // combed strands
}

const CAVITY = [0, 0.007, 0.095, 0.0215, 0.02, 0.015];   // shallow dark mouth, so the mesh stays even

// a smile lifts and widens the mouth corners and plumps the cheeks: the shape is evaluated at warped points
function smileWarp(x, y, z, s) {
  if (!s) return [x, y];
  const ax = Math.abs(x), front = smoothstep(0.05, 0.085, z);
  const corner = Math.exp(-(((ax - 0.021) / 0.011) ** 2) - (((y - MOUTH_Y) / 0.014) ** 2)) * front;
  const cheek = Math.exp(-(((ax - 0.042) / 0.018) ** 2) - (((y - 0.058) / 0.018) ** 2)) * front;
  const widen = 1 - 0.07 * Math.exp(-(((y - MOUTH_Y) / 0.012) ** 2)) * front;
  return [x * (1 - (1 - widen) * s * 1.3), y - s * (0.0095 * corner + 0.0045 * cheek)];
}

function headParts(look) {
  const F = FACES[look.face] || FACES.m, st = HAIR_STYLES[look.hair] || HAIR_STYLES.short;
  const { skinShape, LIP_U, LIP_L } = makeShape(F);
  // a = jaw opening (radians), sm = smile 0..1
  const skinOnly = (a, sm = 0) => (x, y, z) => {
    const [sx, sy] = smileWarp(x, y, z, sm), [ry, rz] = warp(sy, z, a);
    return smin(skinShape(sx, ry, rz), neck(x, y, z), 0.014);
  };
  const headSDF = (a, sm = 0) => {
    const skin = skinOnly(a, sm);
    return (x, y, z) => {
      let d = hairOver(st, skin(x, y, z), x, y, z, look.hood);
      const [sx, sy] = smileWarp(x, y, z, sm);
      if (!a) d = smax(d, -ell(sx, sy, z, 0, MOUTH_Y, 0.099, 0.0205, 0.0013, 0.012), 0.002);  // lip line
      else d = smax(d, -ell(x, y, z, ...CAVITY), 0.004);                                       // open mouth
      return d;
    };
  };
  const headColor = (a, sm = 0) => (x, y, z) => {
    const [sx, sy] = smileWarp(x, y, z, sm), [ry, rz] = warp(sy, z, a);
    const ax = Math.abs(x);
    let c = R.skin;
    const cheek = Math.exp(-((ax - 0.046) ** 2 + (y - 0.066) ** 2 + (z - 0.075) ** 2) / 0.0004);
    c = mix(c, R.blush, (look.face === 'f' ? 0.32 : 0.22) * cheek);
    const lips = Math.min(LIP_U(sx, ry, rz), LIP_L(sx, ry, rz));
    c = mix(c, R.lip, smoothstep(0.0028, 0.0004, lips) * smoothstep(0.08, 0.09, rz) * (look.face === 'f' ? 1.25 : 1));
    const inner = a ? ell(x, y, z, CAVITY[0], CAVITY[1], CAVITY[2], CAVITY[3] + 0.001, CAVITY[4] + 0.001, CAVITY[5] + 0.001) : ell(sx, sy, z, 0, MOUTH_Y, 0.099, 0.021, 0.0018, 0.013);
    return mix(c, R.mouth, smoothstep(0.0012, -0.0006, inner));     // hair colour is drawn in the shader (crisp edge)
  };
  return { F, st, skinOnly, headSDF, headColor };
}

const geoCache = new Map();
const keyOf = (look) => `${look.face || 'm'}|${look.hair || 'short'}|${look.hood ? 1 : 0}`;
function headAssets(look) {
  const key = keyOf(look);
  if (geoCache.has(key)) return geoCache.get(key);
  const P = headParts(look);
  const head = sculpt(
    [{ sdf: P.headSDF(0), color: P.headColor(0) }, { sdf: P.headSDF(JAW_OPEN), color: P.headColor(JAW_OPEN) },
      { sdf: P.headSDF(0, 1), color: P.headColor(0, 1) }],                              // morphs: open, smile
    { center: [0, 0.09, 0.0], wSeg: 256, hSeg: 192, tMax: 0.3 },
  );
  // eyebrows sit on the surface
  const sdf0 = P.headSDF(0);
  const fem = look.face === 'f';
  const brows = [1, -1].map(s => {
    const xy = fem ? [[0.012, 0.13], [0.025, 0.1375], [0.04, 0.1405], [0.057, 0.133]] : [[0.011, 0.131], [0.024, 0.1375], [0.039, 0.139], [0.056, 0.1315]];
    const pts = xy.map(([x, y]) => new THREE.Vector3(s * x, y, surfaceT(sdf0, s * x, y, 0, 0, 0, 1, 0.25) + 0.0012));
    const c = pts[1].clone().add(pts[2]).multiplyScalar(0.5);
    pts.forEach(p => p.sub(c));
    const g = loft(pts, fem ? [0.0033, 0.0033, 0.0026, 0.0011] : [0.0044, 0.0042, 0.0034, 0.0018], { up: new THREE.Vector3(s * 0.25, 0.1, 1).normalize(), flat: 0.45 });
    return { g, c, s };
  });
  const extra = P.st.extra ? extraHair(P.st.extra, P.skinOnly(0)) : null;
  const A = { head, brows, extra, st: P.st };
  geoCache.set(key, A);
  return A;
}

// Hair that leaves the scalp: a ponytail, long hair, big hair. The masses are meshed around the
// head and include the skin shrunk by 3 mm, so where the face shows through they sit hidden under it.
function extraHair(kind, skin) {
  if (kind === 'ponytail') {
    const pts = [[0, 0.172, -0.082], [0, 0.158, -0.112], [0, 0.11, -0.13], [0, 0.045, -0.128], [0, -0.02, -0.118]].map(p => new THREE.Vector3(...p));
    return { kind, g: loft(pts, [0.019, 0.023, 0.02, 0.014, 0.004], { up: new THREE.Vector3(0, 0, -1), flat: 0.85, steps: 40, seg: 16 }), tie: [0, 0.166, -0.096] };
  }
  const big = kind === 'big';
  const mass = (x, y, z) => {
    let d = big ? ell(x, y, z, 0, 0.085, -0.02, 0.118, 0.165, 0.118) : ell(x, y, z, 0, 0.07, -0.022, 0.104, 0.165, 0.108);
    d = smax(d, (big ? -0.12 : -0.17) - y, 0.02);                                           // where it ends
    // it falls behind the face: allowed forward of the ears only below the jaw, and at the sides
    const side = smoothstep(0.055, 0.09, Math.abs(x));                                      // only beside the face, never under the chin
    const reach = (big ? 0.03 : 0.012) + side * (0.05 + 0.05 * smoothstep(0.02, -0.12, y));
    d = smax(d, z - reach, 0.025);
    d += (big ? 0.004 : 0.0022) * Math.sin(y * (big ? 90 : 110) + Math.abs(x) * 35 + Math.sin(z * 40));   // waves
    return Math.min(d, skin(x, y, z) + 0.003);
  };
  return { kind, g: sculpt([{ sdf: mass }], { center: [0, 0.06, -0.02], wSeg: 192, hSeg: 144, tMax: 0.35 }) };
}

// ---------- materials ----------
const matCache = new Map();
export function skinMaterial(M, skin = SKIN) {
  const k = 'skin:' + skin;
  if (!matCache.has(k)) { const m = M.skin.clone(); m.color.set(skin); matCache.set(k, m); }
  return matCache.get(k);
}
function faceMaterials(M, look, st) {
  const skin = look.skin ?? SKIN, hairColor = look.hairColor ?? HAIR;
  const k = `face:${skin}:${hairColor}:${keyOf(look)}:${look.face}`;
  if (matCache.has(k)) return matCache.get(k);
  const face = M.skin.clone();
  face.color.set(skin); face.vertexColors = true;
  const hl = st.hl || [9, 0, 0, 0];                          // bald: the hairline is above the head
  const u = { uHL: { value: new THREE.Vector4(...hl) }, uHairCol: { value: new THREE.Color(hairColor) } };
  face.onBeforeCompile = (s) => {
    // hair is coloured per pixel from the hairline (the same formula as hairlineAt), so its edge stays clean
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace('#include <morphtarget_vertex>', '#include <morphtarget_vertex>\nvObj = transformed;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;\nuniform vec4 uHL;\nuniform vec3 uHairCol;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float ha = abs(atan(vObj.x, vObj.z));
        float hl = uHL.x + uHL.y * cos(ha) + uHL.z * exp(-pow((ha - 0.72) / 0.22, 2.0)) - uHL.w * exp(-pow((ha - 1.32) / 0.16, 2.0));
        float above = vObj.y - hl;
        float hw = max(0.0022, 1.5 * fwidth(above));
        float hairF = smoothstep(0.0, hw, above);
        float strand = 0.86 + 0.14 * sin(vObj.x * 330.0 + sin(vObj.z * 60.0) * 1.5) * smoothstep(0.004, 0.02, above);
        diffuseColor.rgb = mix(diffuseColor.rgb, uHairCol * strand, hairF);`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
        #ifdef USE_SHEEN
          material.sheenColor *= (1.0 - hairF);
        #endif
        #ifdef USE_CLEARCOAT
          material.clearcoat *= (1.0 - hairF);
        #endif
        material.roughness = mix(material.roughness, 0.72, hairF);`);
  };
  face.customProgramCacheKey = () => 'sculpted-face-v2';
  const FM = {
    face, lid: skinMaterial(M, skin),
    hair: new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.75 }),
    lash: new THREE.MeshStandardMaterial({ color: 0x1e140e, roughness: 0.7 }),
    iris: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 }),
    glint: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    teeth: new THREE.MeshStandardMaterial({ color: 0xf2eee4, roughness: 0.35 }),
    tie: new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.5 }),
  };
  matCache.set(k, FM);
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
function makeEye(M, FM, s, fem) {
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
  upper.add(new THREE.Mesh(new THREE.SphereGeometry(LR, 40, 14, 0, Math.PI * 2, 0, 1.3), FM.lid));
  const lash = new THREE.Mesh(new THREE.TorusGeometry(LR * Math.sin(1.3), fem ? 0.0017 : 0.0011, 6, 48), FM.lash);
  lash.rotation.x = Math.PI / 2; lash.position.y = LR * Math.cos(1.3); lash.scale.z = fem ? 2.2 : 1.6; upper.add(lash);
  if (fem) {   // a small flick at the outer corner
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.0016, 0.006, 6), FM.lash);
    f.position.set(s * LR * 0.86, LR * Math.cos(1.3) + 0.002, 0.004); f.rotation.z = -s * 1.1; upper.add(f);
  }
  const lower = new THREE.Group(); g.add(lower);
  lower.add(new THREE.Mesh(new THREE.SphereGeometry(LR * 0.995, 40, 10, 0, Math.PI * 2, Math.PI - 1.08, 1.08), FM.lid));
  return { g, upper, lower, ball, glint };
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

export function buildFace(M, look = {}) {
  const A = headAssets(look);
  const FM = faceMaterials(M, look, A.st);
  const fem = look.face === 'f';
  const head = new THREE.Group();
  const jaw = new THREE.Group(); head.add(jaw);              // kept for the old API; the jaw is a morph now
  const skin = new THREE.Mesh(A.head, FM.face);
  skin.castShadow = skin.receiveShadow = true;
  skin.morphTargetInfluences = [0, 0];
  head.add(skin);
  const eyes = [1, -1].map(s => makeEye(M, FM, s, fem));
  eyes.forEach(e => head.add(e.g));
  const brows = A.brows.map(({ g, c, s }) => {
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
  if (A.extra) {
    const h = new THREE.Mesh(A.extra.g, FM.hair); h.castShadow = h.receiveShadow = true; head.add(h);
    if (A.extra.tie) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.004, 8, 24), FM.tie); t.position.set(...A.extra.tie); t.rotation.x = 1.2; head.add(t); }
  }
  // upper teeth behind the lips: hidden inside the head until the mouth opens
  const teeth = new THREE.Mesh(new THREE.CylinderGeometry(0.0235, 0.0235, 0.0075, 32, 1, false, -0.85, 1.7), FM.teeth);
  teeth.position.set(0, 0.0235, 0.064); head.add(teeth);
  if (look.hood) {
    const hd = new THREE.Mesh(new THREE.SphereGeometry(0.135, 48, 24, 0, Math.PI * 2, 0, 2.0), M.cloth);
    hd.scale.set(0.95, 1.12, 1.08); hd.position.set(0, 0.095, -0.025); hd.rotation.x = -0.75;
    hd.castShadow = hd.receiveShadow = true; head.add(hd);
  }

  // setFace: mouth 0..1 open; smile 0..1; lids -0.4 (wide) .. 1 (shut); brows raise (+) or lower (-);
  // browTilt + lifts the inner ends (worried, pained), - pulls them down (stern, angry)
  function setFace({ mouth = 0, smile = 0, lids = 0, brows: up = 0, browTilt = 0 } = {}) {
    skin.morphTargetInfluences[0] = mouth;
    skin.morphTargetInfluences[1] = smile;
    for (const e of eyes) {
      e.upper.rotation.x = -0.2 + lids * 0.55;
      e.lower.rotation.x = -Math.max(0, lids) * 0.42;
      e.glint.visible = lids < 0.35;           // the catch-light would show through a closed lid
    }
    for (const b of brows) {
      b.m.rotation.z = -b.s * browTilt * 0.22;
      b.m.position.y = b.y + up * 0.006;
    }
  }
  // v: 0 relaxed .. 1 screaming (mouth open, eyes squeezed, brows pinched up in the middle)
  const setMouth = (v) => setFace({ mouth: v, lids: v, brows: v * 0.67, browTilt: v });
  setMouth(0);
  return { head, jaw, setMouth, setFace, eyes, brows };
}
