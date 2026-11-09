// Every piece's pose as a closed-form function of time. Piles come from a seeded height-map stacker,
// so the result is the same on every render and resting pieces never overlap.
import {
  DROP_TIME, REASSEMBLE, type Round, clamp, linesOpen, ramp, smooth, smoother,
} from "./timeline.ts";

export type Q = [number, number, number, number];
const qId = (): Q => [0, 0, 0, 1];
export const qAxis = (x: number, y: number, z: number, a: number): Q => {
  const l = Math.hypot(x, y, z) || 1, s = Math.sin(a / 2) / l;
  return [x * s, y * s, z * s, Math.cos(a / 2)];
};
export const qMul = (a: Q, b: Q): Q => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
export const qSlerp = (a: Q, b: Q, t: number): Q => {
  let [bx, by, bz, bw] = b;
  let c = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (c < 0) { c = -c; bx = -bx; by = -by; bz = -bz; bw = -bw; }
  if (c > 0.9995) {
    const r: Q = [a[0] + (bx - a[0]) * t, a[1] + (by - a[1]) * t, a[2] + (bz - a[2]) * t, a[3] + (bw - a[3]) * t];
    const l = Math.hypot(...r); return [r[0] / l, r[1] / l, r[2] / l, r[3] / l];
  }
  const th = Math.acos(c), s = Math.sin(th), wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
  return [a[0] * wa + bx * wb, a[1] * wa + by * wb, a[2] * wa + bz * wb, a[3] * wa + bw * wb];
};
const qRot = (q: Q, v: [number, number, number]): [number, number, number] => {
  const [x, y, z, w] = q;
  const ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2];
  const iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2];
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
};

export function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export const PEDESTAL_R = 1.62; // flat top radius the pieces may rest on

export type Layout = {
  round: Round;
  n: number;
  c: Float32Array; // original centres
  s: Float32Array; // sizes
  idx: Int16Array; // grid index i, j, k
  // pile rounds
  delay?: Float32Array; dur?: Float32Array; arc?: Float32Array; tgt?: Float32Array; qT?: Float32Array;
  spinAx?: Float32Array; spin?: Float32Array;
  rdelay?: Float32Array; rdur?: Float32Array; rarc?: Float32Array; // round 5 reassembly
  landings?: number[]; // landing times, for sound
  heightAt?: (x: number, z: number) => number; // top of the pile
};

const PILE = {
  3: { K: 2.25, jit: 0.07, H: [0.35, 0.6], T: [0.55, 0.7], D: 0.5, spin: 0 },
  4: { K: 1.75, jit: 0.16, H: [0.35, 0.75], T: [0.6, 0.85], D: 0.6, spin: 1 },
  5: { K: 1.35, jit: 0.42, H: [0.6, 1.35], T: [0.75, 1.1], D: 0.75, spin: 2 },
} as Record<number, { K: number; jit: number; H: [number, number]; T: [number, number]; D: number; spin: number }>;

const ROT90: Q[] = [qId(), qAxis(1, 0, 0, Math.PI / 2), qAxis(0, 0, 1, Math.PI / 2), qAxis(1, 0, 0, -Math.PI / 2), qAxis(0, 0, 1, -Math.PI / 2), qAxis(1, 0, 0, Math.PI)];

export function buildLayout(r: Round): Layout {
  const [nx, ny, nz] = r.grid;
  const n = nx * ny * nz;
  const c = new Float32Array(n * 3), s = new Float32Array(n * 3), idx = new Int16Array(n * 3);
  let p = 0;
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) {
    c[p * 3] = -0.5 + (i + 0.5) / nx; c[p * 3 + 1] = (j + 0.5) / ny; c[p * 3 + 2] = -0.5 + (k + 0.5) / nz;
    s[p * 3] = 1 / nx; s[p * 3 + 1] = 1 / ny; s[p * 3 + 2] = 1 / nz;
    idx[p * 3] = i; idx[p * 3 + 1] = j; idx[p * 3 + 2] = k; p++;
  }
  const L: Layout = { round: r, n, c, s, idx };
  if (r.mode === "pile") pile(L);
  return L;
}

function gauss(R: () => number) { return Math.sqrt(-2 * Math.log(1 - R() * 0.999)) * Math.cos(2 * Math.PI * R()); }

function pile(L: Layout) {
  const r = L.round, P = PILE[r.id], R = rng(1000 + r.id * 77);
  const n = L.n;
  const delay = new Float32Array(n), dur = new Float32Array(n), arc = new Float32Array(n), tgt = new Float32Array(n * 3);
  const qT = new Float32Array(n * 4), spinAx = new Float32Array(n * 3), spin = new Float32Array(n);
  const ext = new Float32Array(n * 3);
  // outer pieces leave first, so the burst peels from the outside in
  for (let p = 0; p < n; p++) {
    const x = L.c[p * 3], y = L.c[p * 3 + 1] - 0.5, z = L.c[p * 3 + 2];
    const outer = Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) * 2;
    delay[p] = P.D * (1 - outer) * (0.75 + 0.25 * R()) + 0.06 * R();
    dur[p] = P.T[0] + (P.T[1] - P.T[0]) * R();
    arc[p] = P.H[0] + (P.H[1] - P.H[0]) * R();
    const q = r.id === 3 ? ROT90[Math.floor(R() * 3)] : qMul(qAxis(0, 1, 0, (R() - 0.5) * 0.2), ROT90[Math.floor(R() * ROT90.length)]);
    qT.set(q, p * 4);
    const sx = L.s[p * 3], sy = L.s[p * 3 + 1], sz = L.s[p * 3 + 2];
    // world extents of the rotated box (with a margin for the small yaw)
    const ax = qRot(q, [sx, 0, 0]), ay = qRot(q, [0, sy, 0]), az = qRot(q, [0, 0, sz]);
    const m = r.id === 3 ? 1.0 : 1.12;
    ext[p * 3] = (Math.abs(ax[0]) + Math.abs(ay[0]) + Math.abs(az[0])) * m;
    ext[p * 3 + 1] = Math.abs(ax[1]) + Math.abs(ay[1]) + Math.abs(az[1]);
    ext[p * 3 + 2] = (Math.abs(ax[2]) + Math.abs(ay[2]) + Math.abs(az[2])) * m;
    const a = (R() * 2 - 1), b = (R() * 2 - 1), cc = (R() * 2 - 1);
    spinAx.set([a, b, cc], p * 3);
    spin[p] = P.spin === 0 ? 0 : Math.floor(R() * (P.spin + 1));
    // where it lands: pushed outward from its spot in the cube, plus scatter
    let tx = x * P.K + gauss(R) * P.jit;
    let tz = z * P.K + gauss(R) * P.jit;
    const rad = Math.hypot(tx, tz), maxR = PEDESTAL_R - Math.hypot(ext[p * 3], ext[p * 3 + 2]) / 2;
    if (rad > maxR) { tx *= maxR / rad; tz *= maxR / rad; }
    tgt[p * 3] = tx; tgt[p * 3 + 2] = tz;
  }
  // stack in landing order: one column per grid cell; a piece rolls to a lower neighbour while the drop
  // is more than one layer, which gives the pile a natural ~45 degree slope. Cells are wider than any piece
  // (rotated extents included), so resting pieces can never overlap.
  let cs = 0;
  for (let p = 0; p < n; p++) cs = Math.max(cs, ext[p * 3], ext[p * 3 + 2]);
  cs *= r.id === 3 ? 1.06 : 1.02;
  const G = Math.ceil((2 * PEDESTAL_R) / cs);
  const hm = new Float32Array(G * G), ok = new Uint8Array(G * G);
  const cc = (i: number) => -PEDESTAL_R + (i + 0.5) * cs;
  for (let i = 0; i < G; i++) for (let k = 0; k < G; k++) ok[i * G + k] = Math.hypot(cc(i), cc(k)) < PEDESTAL_R - cs * 0.75 ? 1 : 0;
  const order = Array.from({ length: n }, (_, p) => p).sort((a, b) => delay[a] + dur[a] - (delay[b] + dur[b]));
  const landings: number[] = [];
  const step = r.id === 3 ? 0.26 : cs;
  for (const p of order) {
    let i = clamp(Math.floor((tgt[p * 3] + PEDESTAL_R) / cs), 0, G - 1), k = clamp(Math.floor((tgt[p * 3 + 2] + PEDESTAL_R) / cs), 0, G - 1);
    for (let guard = 0; !ok[i * G + k] && guard < G; guard++) { i += Math.sign(G / 2 - i); k += Math.sign(G / 2 - k); }
    for (let it = 0; it < 400; it++) {
      let bi = i, bk = k, bh = hm[i * G + k] - step * 1.001;
      for (let di = -1; di <= 1; di++) for (let dk = -1; dk <= 1; dk++) {
        const ni = i + di, nk = k + dk;
        if ((di || dk) && ni >= 0 && nk >= 0 && ni < G && nk < G && ok[ni * G + nk] && hm[ni * G + nk] < bh) { bh = hm[ni * G + nk]; bi = ni; bk = nk; }
      }
      if (bi === i && bk === k) break;
      i = bi; k = bk;
    }
    const h = hm[i * G + k];
    const fx = (cs - ext[p * 3]) / 2, fz = (cs - ext[p * 3 + 2]) / 2;
    tgt[p * 3] = cc(i) + (R() * 2 - 1) * fx * 0.9;
    tgt[p * 3 + 2] = cc(k) + (R() * 2 - 1) * fz * 0.9;
    tgt[p * 3 + 1] = h + ext[p * 3 + 1] / 2;
    hm[i * G + k] = h + ext[p * 3 + 1];
    landings.push(r.settle + delay[p] + dur[p]);
  }
  Object.assign(L, { delay, dur, arc, tgt, qT, spinAx, spin, landings });
  L.heightAt = (x: number, z: number) => {
    const i = clamp(Math.floor((x + PEDESTAL_R) / cs), 0, G - 1), k = clamp(Math.floor((z + PEDESTAL_R) / cs), 0, G - 1);
    return hm[i * G + k];
  };
  if (r.id === 5) {
    // reassembly: inner pieces go home first, the outer ones arrive from outside into the remaining slots
    const rdelay = new Float32Array(n), rdur = new Float32Array(n), rarc = new Float32Array(n);
    for (let p = 0; p < n; p++) {
      const x = L.c[p * 3], y = L.c[p * 3 + 1] - 0.5, z = L.c[p * 3 + 2];
      const outer = Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) * 2;
      rdelay[p] = 0.8 * outer * (0.85 + 0.15 * R());
      rdur[p] = 0.95 + 0.4 * R();
      rarc[p] = 0.35 + 0.5 * R();
    }
    Object.assign(L, { rdelay, rdur, rarc });
  }
}

// cut-line gap per axis: the hairline the blade leaves
export function gaps(r: Round): [number, number, number] {
  return r.grid.map((k) => Math.min(0.022, 0.16 / k)) as [number, number, number];
}

const BOUNCE = (tau: number, amp: number) => (tau > 0 ? amp * Math.abs(Math.sin(tau * 15)) * Math.exp(-tau * 11) : 0);

// writes pos (3), quat (4), scale factor (1) for piece p at time t
export function pose(L: Layout, p: number, t: number, out: { pos: number[]; q: Q; k: number }) {
  const r = L.round;
  const cx = L.c[p * 3], cy = L.c[p * 3 + 1], cz = L.c[p * 3 + 2];
  const [i, j, k] = [L.idx[p * 3], L.idx[p * 3 + 1], L.idx[p * 3 + 2]];
  // drop in
  let dy = 0;
  if (r.drop) {
    const u = ramp(t, r.t0 - DROP_TIME, r.t0);
    dy = 2.6 * (1 - u) * (1 - u) + BOUNCE(t - r.t0, 0.05);
  }
  // hairline gaps as the blade passes; they close again while round 5 reassembles
  const D = linesOpen(r, t), g = gaps(r);
  const close = r.id === 5 ? 1 - smoother(ramp(t, REASSEMBLE.t0 + 0.3, REASSEMBLE.t1)) : 1;
  const gx = g[0] * (Math.min(i, D[0]) - D[0] / 2) * close;
  const gy = g[1] * (Math.min(j, D[1]) - D[1] / 2) * close;
  const gz = g[2] * (Math.min(k, D[2]) - D[2] / 2) * close;
  let x = cx + gx, y = cy + gy + dy + (D[1] > 0 ? g[1] * D[1] / 2 : 0) * close, z = cz + gz;
  let q = qId();
  if (r.mode === "tip1") {
    const sg = i === 0 ? -1 : 1, u = ramp(t, r.settle, r.settle + 0.5);
    const th = (Math.PI / 2) * (u < 1 ? u * u : 1) - (u >= 1 ? 0.12 * Math.abs(Math.sin((t - r.settle - 0.5) * 13)) * Math.exp(-(t - r.settle - 0.5) * 9) : 0);
    const px = sg * (0.5 + g[0] / 2), py = 0;
    const qq = qAxis(0, 0, 1, -sg * th);
    const v = qRot(qq, [x - px, y - py, z]);
    x = px + v[0] + sg * 0.1 * smooth(u); y = py + v[1]; z = v[2];
    q = qq;
  } else if (r.mode === "tip2") {
    const sg = i === 0 ? -1 : 1;
    const slide = sg * 0.15 * smoother(ramp(t, r.settle, r.settle + 0.55));
    if (j === 0) { x += slide; }
    else {
      const ts = r.settle + 0.12, u = ramp(t, ts, ts + 0.42);
      const th = (Math.PI / 2) * u * u;
      const px = sg * (0.5 + g[0] / 2) + slide, py = 0.5 + g[1] / 2 + (D[1] > 0 ? g[1] * D[1] / 2 : 0);
      const qq = qAxis(0, 0, 1, -sg * th);
      const v = qRot(qq, [x + slide - px, y - py, z]);
      const fu = ramp(t, ts + 0.42, ts + 0.72);
      x = px + v[0] + sg * 0.09 * smooth(fu); y = py * (1 - fu * fu) + v[1] + BOUNCE(t - ts - 0.72, 0.035); z = v[2];
      q = qq;
    }
  } else if (L.tgt) {
    const s = clamp((t - r.settle - L.delay![p]) / L.dur![p]);
    if (s > 0) {
      const tx = L.tgt[p * 3], ty = L.tgt[p * 3 + 1], tz = L.tgt[p * 3 + 2];
      const qT: Q = [L.qT![p * 4], L.qT![p * 4 + 1], L.qT![p * 4 + 2], L.qT![p * 4 + 3]];
      const land = t - r.settle - L.delay![p] - L.dur![p];
      x = x + (tx - x) * s; z = z + (tz - z) * s;
      y = y + (ty - y) * s + L.arc![p] * 4 * s * (1 - s) + BOUNCE(land, 0.025 * Math.min(1, L.s[p * 3] * 6));
      const sp = qAxis(L.spinAx![p * 3], L.spinAx![p * 3 + 1], L.spinAx![p * 3 + 2], 2 * Math.PI * L.spin![p] * smooth(s));
      q = qMul(qSlerp(qId(), qT, smoother(s)), sp);
      if (r.id === 5 && L.rdelay) {
        const rs = smoother(clamp((t - REASSEMBLE.t0 - L.rdelay[p]) / L.rdur![p]));
        if (rs > 0) {
          const hx = cx + gx, hy = cy + gy + (g[1] * D[1] / 2) * close, hz = cz + gz;
          const ls = clamp((t - REASSEMBLE.t0 - L.rdelay[p]) / L.rdur![p]);
          x = tx + (hx - tx) * rs; z = tz + (hz - tz) * rs;
          y = ty + (hy - ty) * rs + L.rarc![p] * 4 * ls * (1 - ls);
          const back = qAxis(L.spinAx![p * 3 + 2], L.spinAx![p * 3], L.spinAx![p * 3 + 1], -2 * Math.PI * smooth(rs));
          q = qMul(qSlerp(qT, qId(), rs), back);
        }
      }
    }
  }
  // shrink away before the next cube
  let kk = 1;
  if (r.pop !== null) {
    const h = ((i * 73856093) ^ (j * 19349663) ^ (k * 83492791)) >>> 0;
    const st = r.pop + 0.22 * ((h % 1000) / 1000);
    const u = ramp(t, st, st + 0.3);
    kk = clamp(1 - u * u * (2.2 * u - 1.2), 0, 1.2);
    y += 0.12 * smooth(u);
  }
  out.pos[0] = x; out.pos[1] = y; out.pos[2] = z; out.q = q; out.k = kk;
}

// round visibility window (seconds)
export function visible(r: Round, t: number) {
  const from = r.drop ? r.t0 - DROP_TIME - 0.02 : -1;
  const to = r.pop !== null ? r.pop + 0.6 : 99;
  return t >= from && t < to;
}
