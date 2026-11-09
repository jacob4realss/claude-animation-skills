import * as THREE from 'three';

// Signed-distance helpers for sculpting smooth, seamless shapes (faces, ears, hands).
// A shape is a function sdf(x, y, z) -> distance (negative inside). Blending parts with
// smin/smax gives one continuous surface instead of separate meshes stuck together.

export const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
export const smax = (a, b, k) => -smin(-a, -b, k);
export const smoothstep = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

export function ell(px, py, pz, cx, cy, cz, rx, ry, rz) {
  const x = px - cx, y = py - cy, z = pz - cz;
  const k0 = Math.hypot(x / rx, y / ry, z / rz);
  const k1 = Math.hypot(x / (rx * rx), y / (ry * ry), z / (rz * rz));
  return k1 === 0 ? -Math.min(rx, ry, rz) : k0 * (k0 - 1) / k1;
}

export function capsule(px, py, pz, ax, ay, az, bx, by, bz, r) {
  const pax = px - ax, pay = py - ay, paz = pz - az, bax = bx - ax, bay = by - ay, baz = bz - az;
  const h = Math.min(1, Math.max(0, (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz)));
  return Math.hypot(pax - bax * h, pay - bay * h, paz - baz * h) - r;
}

// Distance along a ray from o in direction d to the OUTERMOST surface (marching inward from tMax).
export function surfaceT(sdf, ox, oy, oz, dx, dy, dz, tMax) {
  let t = tMax;
  for (let i = 0; i < 400 && t > 0; i++) {
    const d = sdf(ox + dx * t, oy + dy * t, oz + dz * t);
    if (d < 2e-5) break;
    t -= Math.max(d * 0.6, 1e-4);
  }
  t = Math.max(t, 0);
  let lo = t, hi = Math.min(t + 0.003, tMax);
  for (let i = 0; i < 22; i++) {
    const m = (lo + hi) / 2;
    if (sdf(ox + dx * m, oy + dy * m, oz + dz * m) > 0) hi = m; else lo = m;
  }
  return (lo + hi) / 2;
}

// Average normals across the sphere's UV seam and at its poles so the surface has no visible lines.
function weldNormals(normal, w, h) {
  const n = normal.array, idx = (iy, ix) => (iy * (w + 1) + ix) * 3;
  for (let iy = 0; iy <= h; iy++) {
    if (iy === 0 || iy === h) {
      let x = 0, y = 0, z = 0;
      for (let ix = 0; ix <= w; ix++) { const i = idx(iy, ix); x += n[i]; y += n[i + 1]; z += n[i + 2]; }
      const l = Math.hypot(x, y, z) || 1;
      for (let ix = 0; ix <= w; ix++) { const i = idx(iy, ix); n[i] = x / l; n[i + 1] = y / l; n[i + 2] = z / l; }
    } else {
      const a = idx(iy, 0), b = idx(iy, w);
      const x = n[a] + n[b], y = n[a + 1] + n[b + 1], z = n[a + 2] + n[b + 2], l = Math.hypot(x, y, z) || 1;
      n[a] = n[b] = x / l; n[a + 1] = n[b + 1] = y / l; n[a + 2] = n[b + 2] = z / l;
    }
  }
  normal.needsUpdate = true;
}

// Mesh a star-shaped SDF by projecting a UV sphere around `center` onto its outer surface.
// states: [{ sdf, color(x,y,z) -> [r,g,b] linear }]. State 0 is the base shape; the others become
// morph targets with matching vertices (so a mouth can open by setting morphTargetInfluences).
// The sphere's seam sits at the back (-z) and its poles at top and bottom.
export function sculpt(states, { center = [0, 0, 0], wSeg = 160, hSeg = 120, tMax = 0.3 } = {}) {
  const base = new THREE.SphereGeometry(1, wSeg, hSeg, -Math.PI / 2);
  const dirs = base.attributes.position.array.slice();
  const [cx, cy, cz] = center;
  const n = dirs.length / 3;
  const built = states.map(({ sdf, color }) => {
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const dx = dirs[i * 3], dy = dirs[i * 3 + 1], dz = dirs[i * 3 + 2];
      const t = surfaceT(sdf, cx, cy, cz, dx, dy, dz, tMax);
      const x = cx + dx * t, y = cy + dy * t, z = cz + dz * t;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      if (color) { const c = color(x, y, z); col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2]; }
    }
    const g = base.clone();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.computeVertexNormals();
    weldNormals(g.attributes.normal, wSeg, hSeg);
    return { g, col };
  });
  const geo = built[0].g;
  if (states[0].color) geo.setAttribute('color', new THREE.BufferAttribute(built[0].col, 3));
  if (built.length > 1) {
    geo.morphAttributes.position = built.slice(1).map(b => b.g.attributes.position);
    geo.morphAttributes.normal = built.slice(1).map(b => b.g.attributes.normal);
    if (states[0].color) geo.morphAttributes.color = built.slice(1).map(b => new THREE.BufferAttribute(b.col, 3));
  }
  geo.computeBoundingSphere();
  return geo;
}

// A tube along a smooth curve whose thickness changes along its length (eyebrows, lashes).
// radii: thickness samples from start to end; flat squashes the tube along `up`.
export function loft(points, radii, { up = new THREE.Vector3(0, 0, 1), flat = 0.5, steps = 28, seg = 12 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points);
  const pos = [], idx = [];
  const rAt = (t) => { const f = t * (radii.length - 1), i = Math.min(Math.floor(f), radii.length - 2); return radii[i] + (radii[i + 1] - radii[i]) * (f - i); };
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, p = curve.getPoint(t), T = curve.getTangent(t);
    const N = up.clone().addScaledVector(T, -up.dot(T)).normalize(), B = new THREE.Vector3().crossVectors(T, N);
    const r = rAt(t) * Math.sqrt(Math.min(1, t / 0.06)) * Math.sqrt(Math.min(1, (1 - t) / 0.12));
    for (let j = 0; j <= seg; j++) {
      const a = j / seg * Math.PI * 2;
      pos.push(p.x + B.x * Math.cos(a) * r + N.x * Math.sin(a) * r * flat, p.y + B.y * Math.cos(a) * r + N.y * Math.sin(a) * r * flat, p.z + B.z * Math.cos(a) * r + N.z * Math.sin(a) * r * flat);
    }
  }
  for (let i = 0; i < steps; i++) for (let j = 0; j < seg; j++) {
    const a = i * (seg + 1) + j, b = a + seg + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
