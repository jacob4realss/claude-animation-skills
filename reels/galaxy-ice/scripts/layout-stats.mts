// Builds every round's layout, times it, and checks that no two resting pieces overlap
// (exact oriented-box test via separating axes on every nearby pair).
import { performance } from "node:perf_hooks";
import { buildLayout, type Q } from "../src/pieces.ts";
import { ROUNDS } from "../src/timeline.ts";

type V = [number, number, number];
const rot = (q: Q, v: V): V => {
  const [x, y, z, w] = q, ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2];
  const iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2];
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
};
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
type Box = { c: V; ax: V[]; h: V };
function overlap(A: Box, B: Box, tol: number) {
  const d: V = [B.c[0] - A.c[0], B.c[1] - A.c[1], B.c[2] - A.c[2]];
  const axes: V[] = [...A.ax, ...B.ax];
  for (const a of A.ax) for (const b of B.ax) { const c = cross(a, b); if (dot(c, c) > 1e-10) axes.push(c); }
  for (const L of axes) {
    const l = Math.sqrt(dot(L, L)), u: V = [L[0] / l, L[1] / l, L[2] / l];
    const ra = A.h.reduce((s, h, i) => s + h * Math.abs(dot(A.ax[i], u)), 0);
    const rb = B.h.reduce((s, h, i) => s + h * Math.abs(dot(B.ax[i], u)), 0);
    if (Math.abs(dot(d, u)) > ra + rb - tol) return false;
  }
  return true;
}
for (const r of ROUNDS) {
  const a = performance.now(); const L = buildLayout(r);
  let line = `round ${r.id}: ${L.n} pieces, ${(performance.now() - a).toFixed(0)} ms`;
  if (L.tgt) {
    const boxes: Box[] = [];
    let top = 0;
    for (let p = 0; p < L.n; p++) {
      const q: Q = [L.qT![p * 4], L.qT![p * 4 + 1], L.qT![p * 4 + 2], L.qT![p * 4 + 3]];
      const c: V = [L.tgt[p * 3], L.tgt[p * 3 + 1], L.tgt[p * 3 + 2]];
      boxes.push({ c, ax: [rot(q, [1, 0, 0]), rot(q, [0, 1, 0]), rot(q, [0, 0, 1])], h: [L.s[p * 3] / 2, L.s[p * 3 + 1] / 2, L.s[p * 3 + 2] / 2] });
      top = Math.max(top, c[1] + L.s[p * 3 + 1]);
    }
    const cell = Math.max(L.s[0], L.s[1], L.s[2]) * 1.8, grid = new Map<string, number[]>();
    const key = (c: V) => `${Math.floor(c[0] / cell)},${Math.floor(c[1] / cell)},${Math.floor(c[2] / cell)}`;
    boxes.forEach((b, i) => { const k = key(b.c); (grid.get(k) ?? grid.set(k, []).get(k)!).push(i); });
    let bad = 0, below = 0;
    boxes.forEach((b, i) => {
      if (b.c[1] - b.h.reduce((s, h, k) => s + h * Math.abs(b.ax[k][1]), 0) < -1e-6) below++;
      const [cx, cy, cz] = [Math.floor(b.c[0] / cell), Math.floor(b.c[1] / cell), Math.floor(b.c[2] / cell)];
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++)
        for (const j of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) if (j > i && overlap(b, boxes[j], 1e-5)) bad++;
    });
    line += `, pile top ${top.toFixed(2)}, overlapping pairs ${bad}, below pedestal ${below}`;
  }
  console.log(line);
}
