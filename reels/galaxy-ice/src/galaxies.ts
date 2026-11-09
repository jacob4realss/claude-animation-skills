// The five miniature galaxies as 3D volume textures. Each voxel holds colour (rgb, halved so it can glow past 1)
// and density (a). Built once per browser tab from seeded noise, so every frame and every render match.
import * as THREE from "three";
import { rng } from "./pieces.ts";

export const RES = 72;

const hash = (x: number, y: number, z: number) => {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
function noise(x: number, y: number, z: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(
    l(l(hash(xi, yi, zi), hash(xi + 1, yi, zi), u), l(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), u), v),
    l(l(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), u), l(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), u), v),
    w,
  );
}
const fbm = (x: number, y: number, z: number) =>
  0.5 * noise(x, y, z) + 0.25 * noise(x * 2.03 + 5, y * 2.03, z * 2.03) + 0.125 * noise(x * 4.1, y * 4.1 + 9, z * 4.1);
const sm = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix3 = (a: number[], b: number[], t: number) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

type Sample = (x: number, y: number, z: number) => [number, number, number, number];

// disc with log-spiral arms; tilt in radians about x
function spiral(x: number, y: number, z: number, tilt: number, arms: number, wind: number) {
  const c = Math.cos(tilt), s = Math.sin(tilt);
  const py = y * c - z * s, pz = y * s + z * c, px = x;
  const rho = Math.hypot(px, pz), th = Math.atan2(pz, px);
  const a = 0.5 + 0.5 * Math.cos(arms * (th + wind * Math.log(rho + 0.06)) + 1.6 * fbm(px * 3 + 3, py * 3, pz * 3));
  const thick = Math.exp(-(py * py) / (0.02 + 0.06 * rho));
  return { rho, py, arm: Math.pow(a, 2.6), thick };
}

const GAL: Sample[] = [
  // 0 purple nebula: billowing clouds, violet to magenta, a lilac core
  (x, y, z) => {
    const wx = x + 0.4 * (fbm(x * 1.6 + 1, y * 1.6, z * 1.6) - 0.5), wy = y + 0.4 * (fbm(x * 1.6, y * 1.6 + 7, z * 1.6) - 0.5), wz = z + 0.4 * (fbm(x * 1.6, y * 1.6, z * 1.6 + 13) - 0.5);
    const r = Math.hypot(wx, wy, wz), n = fbm(wx * 2.6 + 4, wy * 2.6, wz * 2.6);
    const d = sm(0.36, 0.7, n + 0.55 * (1 - r / 0.82)) * sm(0.9, 0.62, r);
    let col = mix3([0.45, 0.2, 0.92], [1.0, 0.36, 0.86], sm(0.42, 0.75, n));
    col = mix3(col, [1.0, 0.86, 1.0], Math.exp(-(r * r) / 0.03));
    return [col[0], col[1], col[2], d];
  },
  // 1 electric-blue spiral
  (x, y, z) => {
    const { rho, py, arm, thick } = spiral(x, y, z, 0.42, 2, 2.8);
    const core = Math.exp(-(rho * rho + 6 * py * py) / 0.018);
    const d = Math.min(1, (arm * 1.05 + 0.12) * thick * sm(0.86, 0.35, rho) + core * 1.2);
    let col = mix3([0.08, 0.32, 1.0], [0.25, 0.92, 1.0], arm);
    col = mix3(col, [0.88, 0.97, 1.0], Math.min(1, core * 1.4));
    return [col[0], col[1], col[2], d];
  },
  // 2 emerald aurora: folded vertical curtains, green at the base, teal and violet at the tips
  (x, y, z) => {
    const u = x * 2.6 + 1.3 * fbm(x * 1.2, y * 0.7, z * 2.2) + 0.8 * Math.sin(z * 3.2);
    const band = Math.pow(0.5 + 0.5 * Math.sin(u * Math.PI), 5);
    const v = (y + 1) / 2;
    const d = band * sm(0.08, 0.32, v) * sm(0.95, 0.6, v) * sm(0.92, 0.66, Math.max(Math.abs(x), Math.abs(z))) * (0.55 + 0.7 * fbm(x * 5, y * 2, z * 5));
    let col = mix3([0.04, 0.95, 0.42], [0.1, 0.88, 0.86], sm(0.3, 0.75, v));
    col = mix3(col, [0.62, 0.42, 1.0], sm(0.72, 0.92, v));
    return [col[0], col[1], col[2], Math.min(1, d * 1.3)];
  },
  // 3 pink galaxy (golden planets are added in the shader as solid spheres)
  (x, y, z) => {
    const { rho, py, arm, thick } = spiral(x, y, z, -0.5, 3, 2.1);
    const core = Math.exp(-(rho * rho + 5 * py * py) / 0.025);
    const d = Math.min(1, (arm * 0.95 + 0.2) * thick * 1.25 * sm(0.88, 0.4, rho) + core * 1.1);
    let col = mix3([1.0, 0.3, 0.66], [1.0, 0.64, 0.82], arm);
    col = mix3(col, [1.0, 0.93, 0.86], Math.min(1, core * 1.3));
    return [col[0], col[1], col[2], d];
  },
  // 4 amber galaxy: a bright elliptical swirl with a dark dust lane
  (x, y, z) => {
    const e = (x * x) / 0.42 + (y * y) / 0.22 + (z * z) / 0.42;
    const sw = fbm(x * 3 + Math.atan2(z, x) * 0.8, y * 3, z * 3);
    const lane = 1 - 0.75 * Math.exp(-Math.pow((y - 0.25 * x) * 9, 2)) * sm(0.15, 0.45, Math.hypot(x, z));
    const d = Math.min(1, Math.exp(-e * 1.9) * (0.7 + 0.6 * sw) * lane * 1.5) * sm(0.95, 0.7, Math.hypot(x, y, z));
    let col = mix3([1.0, 0.42, 0.06], [1.0, 0.72, 0.22], sm(0.3, 0.9, Math.exp(-e)));
    col = mix3(col, [1.0, 0.95, 0.8], Math.exp(-e * 9));
    return [col[0], col[1], col[2], d];
  },
];

// stars per galaxy (count, colour) baked in as tiny bright clusters
const STARS: [number, number[]][] = [[160, [1, 0.9, 1]], [200, [0.85, 0.95, 1]], [420, [0.9, 1, 0.95]], [180, [1, 0.92, 0.7]], [520, [1, 0.88, 0.6]]];

const HAZE = [[0.62, 0.36, 0.95], [0.25, 0.55, 1.0], [0.15, 0.85, 0.6], [1.0, 0.5, 0.75], [1.0, 0.6, 0.2]];

// golden planets in round 4: x, y, z (galaxy space, -1..1) and radius
export const PLANETS: [number, number, number, number][] = [
  [0.42, 0.12, 0.18, 0.19], [-0.38, -0.1, 0.36, 0.15], [-0.12, 0.24, -0.46, 0.13], [0.2, -0.26, -0.22, 0.11], [-0.58, 0.08, -0.14, 0.09],
];

const cache = new Map<number, THREE.Data3DTexture>();
export function galaxyTexture(g: number) {
  const hit = cache.get(g);
  if (hit) return hit;
  const N = RES, data = new Uint8Array(N * N * N * 4), f = GAL[g];
  for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = ((i + 0.5) / N) * 2 - 1, y = ((j + 0.5) / N) * 2 - 1, z = ((k + 0.5) / N) * 2 - 1;
    let [r, gg, b, a] = f(x, y, z);
    // a soft coloured haze through the middle of every cube, so even sparse structure reads on a cut face
    const haze = 0.34 * sm(0.97, 0.6, Math.max(Math.abs(x), Math.abs(y), Math.abs(z))) * (0.65 + 0.35 * sm(1.3, 0.2, Math.hypot(x, y, z)));
    if (haze > a) { const [hr, hg, hb] = HAZE[g]; const t = (haze - a) / haze; r = r + (hr - r) * t; gg = gg + (hg - gg) * t; b = b + (hb - b) * t; a = haze; }
    const o = ((k * N + j) * N + i) * 4;
    data[o] = Math.min(255, r * 127); data[o + 1] = Math.min(255, gg * 127); data[o + 2] = Math.min(255, b * 127); data[o + 3] = Math.min(255, a * 255);
  }
  const R = rng(500 + g);
  const [count, sc] = STARS[g];
  for (let s = 0; s < count; s++) {
    const x = R() * 2 - 1, y = R() * 2 - 1, z = R() * 2 - 1;
    if (Math.hypot(x, y, z) > 0.85) continue;
    const i = Math.floor(((x + 1) / 2) * N), j = Math.floor(((y + 1) / 2) * N), k = Math.floor(((z + 1) / 2) * N);
    const o = ((k * N + j) * N + i) * 4, br = 0.75 + 0.5 * R();
    data[o] = Math.min(255, sc[0] * 255 * br); data[o + 1] = Math.min(255, sc[1] * 255 * br); data[o + 2] = Math.min(255, sc[2] * 255 * br); data[o + 3] = 255;
  }
  const tex = new THREE.Data3DTexture(data, N, N, N);
  tex.format = THREE.RGBAFormat; tex.type = THREE.UnsignedByteType;
  tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.ClampToEdgeWrapping;
  tex.unpackAlignment = 1; tex.needsUpdate = true;
  cache.set(g, tex);
  return tex;
}
