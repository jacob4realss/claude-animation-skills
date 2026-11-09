import * as THREE from 'three';
import { smin, smax, smoothstep, ell, capsule, sculpt } from './sculpt.js';

// Arms, legs, hands and shoes. Limb segments are smooth tapered tubes whose rounded ends have
// exactly the radius of the joint they meet, so elbows and knees bend without seams or knobs.
// Hands and shoes are sculpted (sculpt.js) as single smooth shapes. All geometry is cached.

const cache = new Map();
const once = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };

// A limb segment hanging down from its joint: radius r0 at the top joint, r1 at y = -len.
// bulge adds a muscle swell (biceps, calf) peaking at `at` (0..1 along the segment).
// end: 'round' closes with a half sphere (a joint), 'hem' ends open with a slight flare (a sleeve or trouser end).
export function limbGeometry(r0, r1, len, { bulge = 0, at = 0.4, end = 'round', flare = 0.004 } = {}) {
  return once(`limb:${[r0, r1, len, bulge, at, end, flare].join(',')}`, () => {
    const pts = [];
    for (let i = 0; i <= 10; i++) { const a = Math.PI / 2 * (i / 10); pts.push(new THREE.Vector2(Math.sin(a) * r0, Math.cos(a) * r0)); }
    const rows = 24;
    for (let i = 1; i <= rows; i++) {
      const t = i / rows;
      const u = t < at ? 0.5 * t / at : 0.5 + 0.5 * (t - at) / (1 - at);       // 0.5 at the peak
      const sw = bulge * Math.sin(Math.PI * u) ** 2;
      let r = r0 + (r1 - r0) * smoothstep(0, 1, t) + sw;
      if (end === 'hem') r += flare * smoothstep(0.85, 1, t);
      pts.push(new THREE.Vector2(r, -len * t));
    }
    if (end === 'round') for (let i = 1; i <= 10; i++) { const a = Math.PI / 2 * (i / 10); pts.push(new THREE.Vector2(Math.cos(a) * r1, -len - Math.sin(a) * r1)); }
    else { // fold the hem inward and up into the tube, so its inside is never seen as a disc
      const rr = pts[pts.length - 1].x;
      pts.push(new THREE.Vector2(rr * 0.9, -len + 0.004), new THREE.Vector2(rr * 0.6, -len + 0.03), new THREE.Vector2(0.0001, -len + 0.06));
    }
    return new THREE.LatheGeometry(pts.reverse(), 40);              // bottom to top, so faces point outward
  });
}

// ---------- hand: a relaxed fist ----------
// Built for the left hand (s = +1, on the +x side): the back of the hand faces +x, the palm faces
// the body (-x), knuckles run front to back and the thumb sits in front (+z). Mirror for the right.
function handSDF(x, y, z) {
  let d = capsule(x, y, z, 0, 0.03, 0, 0, -0.03, 0, 0.024);                                   // wrist (runs up into the sleeve)
  d = smin(d, ell(x, y, z, 0.002, -0.05, 0.0, 0.019, 0.038, 0.035), 0.02);                    // palm and back
  const fz = [0.0235, 0.008, -0.0075, -0.0215], fl = [1.0, 1.06, 1.0, 0.86], fr = [0.0088, 0.009, 0.0086, 0.0076];
  for (let i = 0; i < 4; i++) {
    const z0 = fz[i], L = fl[i], r = fr[i];
    let f = capsule(x, y, z, 0.006, -0.08 * L, z0, -0.006, -0.104 * L, z0 * 0.95, r);          // first segment, down
    f = smin(f, capsule(x, y, z, -0.006, -0.104 * L, z0 * 0.95, -0.021, -0.096 * L, z0 * 0.93, r * 0.94), 0.004); // curls in
    f = smin(f, capsule(x, y, z, -0.021, -0.096 * L, z0 * 0.93, -0.024, -0.079 * L, z0 * 0.92, r * 0.88), 0.004); // tip toward the palm
    d = smin(d, f, 0.0045);
  }
  let th = capsule(x, y, z, -0.006, -0.03, 0.026, -0.016, -0.056, 0.036, 0.0105);              // thumb base
  th = smin(th, capsule(x, y, z, -0.016, -0.056, 0.036, -0.026, -0.074, 0.026, 0.0092), 0.004); // over the index finger
  return smin(d, th, 0.01);
}
export const handGeometry = () => once('hand', () => sculpt([{ sdf: handSDF }], { center: [-0.004, -0.06, 0.004], wSeg: 96, hSeg: 72, tMax: 0.1 }));

// ---------- shoe ----------
// Ankle at the origin, toes toward +z, flat sole on y = -SOLE.
export const SOLE = 0.07;
const UPPER = new THREE.Color(0x4a3122), SOLE_C = new THREE.Color(0x1d1714), LACE = new THREE.Color(0x2c1d14);
function shoeSDF(boot, shaftR = 0.056) {
  return (x, y, z) => {
    const ax = Math.abs(x);
    let d = ell(x, y, z, 0, -0.035, -0.012, 0.043, 0.04, 0.05);                               // heel
    d = smin(d, ell(x, y, z, 0, -0.045, 0.075, 0.046, 0.026, 0.068), 0.04);                   // toe box
    d = smin(d, capsule(x, y, z, 0, -0.03, 0.0, 0, boot ? 0.13 : 0.02, -0.004, boot ? shaftR : 0.044), 0.02); // collar or boot shaft
    d = smax(d, -SOLE - y, 0.004);                                                            // flat sole
    d = smax(d, boot ? ell(ax, y, z, 0, 0.0, 0.03, 0.065, 0.2, 0.13) : ell(ax, y, z, 0, -0.045, 0.03, 0.052, 0.06, 0.13), 0.01); // keep it shoe-shaped
    return d;
  };
}
function shoeColor(x, y, z) {
  const c = UPPER.clone();
  c.lerp(SOLE_C, smoothstep(-SOLE + 0.017, -SOLE + 0.012, y));                               // sole band
  c.lerp(LACE, 0.5 * smoothstep(0.02, 0.012, Math.abs(x)) * smoothstep(-0.02, -0.005, -Math.abs(z - 0.045) + 0.02) * smoothstep(-0.03, -0.02, y));
  return [c.r, c.g, c.b];
}
export const shoeGeometry = (boot = false) => once('shoe:' + boot, () => sculpt([{ sdf: shoeSDF(boot), color: shoeColor }], { center: [0, -0.03, 0.03], wSeg: 96, hSeg: 72, tMax: 0.25 }));

// tint multiplies the brown leather (0xffffff keeps it brown, 0x444444 reads black)
export function shoeMaterial(tint = 0xffffff) {
  return once('shoeMat:' + tint, () => new THREE.MeshPhysicalMaterial({ vertexColors: true, color: tint, roughness: 0.55, clearcoat: 0.35, clearcoatRoughness: 0.5 }));
}
