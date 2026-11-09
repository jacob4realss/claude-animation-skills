import { useThree } from "@react-three/fiber";
import React, { useMemo } from "react";
import { useCurrentFrame } from "remotion";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { galaxyTexture } from "./galaxies";
import { iceMaterial } from "./iceMaterial";
import { Layout, PEDESTAL_R, Q, buildLayout, pose, qAxis, qMul, qSlerp, rng, visible } from "./pieces";
import {
  EDGE_TOP, FPS, PH_CUT, PH_MOVE, REASSEMBLE, ROUNDS, SLICE_Z0, SLICE_Z1, Stroke,
  camera as camAt, clamp, linesOpen, ramp, smooth, smoother, strokeCutU,
} from "./timeline";

// ------------------------------------------------------------------ static scene parts
function pedestalGeometry() {
  const R = PEDESTAL_R + 0.16, Hh = 0.5, rt = 0.16, rb = 0.1;
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, -Hh)];
  for (let i = 0; i <= 3; i++) { const a = -Math.PI / 2 + (i / 3) * (Math.PI / 2); pts.push(new THREE.Vector2(R - rb + Math.cos(a) * rb, -Hh + rb + Math.sin(a) * rb)); }
  for (let i = 0; i <= 4; i++) { const a = (i / 4) * (Math.PI / 2); pts.push(new THREE.Vector2(R - rt + Math.cos(a) * rt, -rt + Math.sin(a) * rt)); }
  pts.push(new THREE.Vector2(0, 0));
  return new THREE.LatheGeometry(pts, 36);
}

function knifeObject() {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: "#f4f6fa", metalness: 0.7, roughness: 0.16, envMapIntensity: 1.6, flatShading: true });
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(1.4, 0); s.quadraticCurveTo(1.82, 0.03, 1.95, 0.36); s.lineTo(0, 0.42); s.lineTo(0, 0);
  const bg = new THREE.ExtrudeGeometry(s, { depth: 0.028, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.006, bevelSegments: 1, curveSegments: 6 });
  bg.translate(0, 0, -0.014);
  const blade = new THREE.Mesh(bg, steel); blade.castShadow = true; g.add(blade);
  const bol = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.4, 0.07), steel); bol.position.set(-0.035, 0.22, 0); bol.castShadow = true; g.add(bol);
  const hm = new THREE.MeshStandardMaterial({ color: "#4a3470", roughness: 0.5, flatShading: true });
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.1, 0.95, 8), hm);
  handle.rotation.z = Math.PI / 2; handle.position.set(-0.55, 0.27, 0); handle.castShadow = true; g.add(handle);
  const brass = new THREE.MeshStandardMaterial({ color: "#e0b45a", metalness: 0.8, roughness: 0.3, flatShading: true });
  [-0.3, -0.55, -0.8].forEach((x) => { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.205, 8), brass); r.rotation.x = Math.PI / 2; r.position.set(x, 0.27, 0); g.add(r); });
  return g;
}

function starGeometry() {
  const s = new THREE.Shape();
  for (let i = 0; i <= 10; i++) { const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.42 : 1; i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.28, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.14, bevelSegments: 1 });
  g.center();
  return g;
}

// ------------------------------------------------------------------ the knife's path
const Q_OF: Record<string, Q> = {
  x: qAxis(0, 1, 0, Math.PI / 2),
  z: qAxis(0, 1, 0, Math.PI),
  y: qMul(qAxis(0, 1, 0, Math.PI), qAxis(1, 0, 0, Math.PI / 2)),
};
type P = { p: [number, number, number]; q: Q };
const OFF: P = { p: [2.6, 5.4, 2.2], q: qMul(qAxis(0, 1, 0, 2.5), qAxis(0, 0, 1, -0.6)) };
const at = (s: Stroke, y: number, z: number): [number, number, number] =>
  s.axis === "x" ? [s.pos, y, 0] : s.axis === "z" ? [0, y, s.pos] : [0, s.pos, z];
const startPose = (s: Stroke): P => ({ p: s.axis === "y" ? at(s, 0, SLICE_Z0) : at(s, EDGE_TOP, 0), q: Q_OF[s.axis] });
const endPose = (s: Stroke): P => ({ p: s.axis === "y" ? at(s, 0, SLICE_Z1) : at(s, 0, 0), q: Q_OF[s.axis] });
const liftPose = (s: Stroke): P => ({ p: s.axis === "y" ? [0, s.pos + 0.35, SLICE_Z1 + 0.6] : at(s, EDGE_TOP + 0.12, 0), q: Q_OF[s.axis] });
const lerpP = (a: P, b: P, u: number): P => ({ p: [0, 1, 2].map((i) => a.p[i] + (b.p[i] - a.p[i]) * u) as [number, number, number], q: qSlerp(a.q, b.q, u) });

const STROKES: Stroke[] = [...ROUNDS.flatMap((r) => r.strokes), { ...ROUNDS[0].strokes[0], t0: ROUNDS[0].strokes[0].t0 + 30, t1: ROUNDS[0].strokes[0].t1 + 30 }];
const ENTER = 0.42, EXIT = 0.5;

function knifePose(t: number): P & { slide: number } {
  for (let k = 0; k < STROKES.length; k++) {
    const s = STROKES[k], prev = STROKES[k - 1], next = STROKES[k + 1];
    const chainedIn = prev && Math.abs(prev.t1 - s.t0) < 1e-6, chainedOut = next && Math.abs(next.t0 - s.t1) < 1e-6;
    const d = s.t1 - s.t0, tm = s.t0 + PH_MOVE * d, tc = s.t0 + PH_CUT * d;
    const from = chainedIn ? s.t0 : s.t0 - ENTER;
    const to = chainedOut ? s.t1 : s.t1 + EXIT;
    if (t < from || t >= to) continue;
    if (t < tm) {
      const a = chainedIn ? liftPose(prev) : OFF;
      return { ...lerpP(a, startPose(s), smoother(ramp(t, from, tm))), slide: 0.22 };
    }
    if (t < tc) {
      const u = strokeCutU(s, t);
      return { ...lerpP(startPose(s), endPose(s), u), slide: s.axis === "y" ? 0 : 0.22 - 0.4 * u };
    }
    const b = chainedOut ? liftPose(s) : OFF;
    return { ...lerpP(endPose(s), b, smoother(ramp(t, tc, to))), slide: s.axis === "y" ? 0 : -0.18 };
  }
  return { ...OFF, slide: 0 };
}

// ------------------------------------------------------------------ stars that burst out in round 5
const R5 = ROUNDS[4];
function starPlan(L: Layout) {
  const R = rng(4242), n = 150;
  return Array.from({ length: n }, () => {
    const u = R(), v = R(), w = Math.cbrt(R()) * 0.3;
    const th = 2 * Math.PI * u, ph = Math.acos(2 * v - 1);
    const home: [number, number, number] = [Math.sin(ph) * Math.cos(th) * w, 0.5 + Math.cos(ph) * w * 0.8, Math.sin(ph) * Math.sin(th) * w];
    const a = 2 * Math.PI * R(), r = 0.25 + 1.1 * Math.sqrt(R());
    const tx = Math.cos(a) * r, tz = Math.sin(a) * r;
    return {
      home, tgt: [tx, (L.heightAt ? L.heightAt(tx, tz) : 0) + 0.035, tz] as [number, number, number],
      d: 0.05 + 0.45 * R(), T: 0.95 + 0.35 * R(), arc: 0.9 + 0.8 * R(), rd: 0.15 + 0.6 * R(), size: 0.055 + 0.045 * R(),
      ph: R() * 6.28, f: 0.6 + 0.9 * R(), tilt: R() * 6.28,
    };
  });
}

// ------------------------------------------------------------------ the scene
const tmp = { pos: [0, 0, 0], q: [0, 0, 0, 1] as Q, k: 1 };
function writeMatrix(arr: Float32Array, o: number, px: number, py: number, pz: number, q: Q, sx: number, sy: number, sz: number) {
  const [x, y, z, w] = q, x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
  arr[o] = (1 - (yy + zz)) * sx; arr[o + 1] = (xy + wz) * sx; arr[o + 2] = (xz - wy) * sx; arr[o + 3] = 0;
  arr[o + 4] = (xy - wz) * sy; arr[o + 5] = (1 - (xx + zz)) * sy; arr[o + 6] = (yz + wx) * sy; arr[o + 7] = 0;
  arr[o + 8] = (xz + wy) * sz; arr[o + 9] = (yz - wx) * sz; arr[o + 10] = (1 - (xx + yy)) * sz; arr[o + 11] = 0;
  arr[o + 12] = px; arr[o + 13] = py; arr[o + 14] = pz; arr[o + 15] = 1;
}

export const Scene: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const { gl, scene, camera } = useThree();

  const world = useMemo(() => {
    gl.toneMapping = THREE.NeutralToneMapping;
    gl.toneMappingExposure = 1.0;
    const pm = new THREE.PMREMGenerator(gl);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.9;
    const rounds = ROUNDS.map((r) => {
      const L = buildLayout(r);
      const geo = new THREE.BoxGeometry(1, 1, 1);
      geo.setAttribute("aC", new THREE.InstancedBufferAttribute(L.c, 3));
      geo.setAttribute("aS", new THREE.InstancedBufferAttribute(L.s, 3));
      const mat = iceMaterial(galaxyTexture(r.galaxy), galaxyTexture(r.id === 5 ? 0 : r.galaxy), r.id === 4);
      const mesh = new THREE.InstancedMesh(geo, mat, L.n);
      mesh.castShadow = L.n < 1000; mesh.frustumCulled = false; mesh.visible = false; // the huge rounds hide their own shadow
      return { r, L, mesh, mat };
    });
    const starMesh = new THREE.InstancedMesh(starGeometry(), new THREE.MeshStandardMaterial({ color: "#ffd36b", emissive: "#ffb63a", emissiveIntensity: 0.55, metalness: 0.35, roughness: 0.3, flatShading: true }), 150);
    starMesh.castShadow = true; starMesh.frustumCulled = false;
    const stars = starPlan(rounds[4].L);
    return { rounds, starMesh, stars, knife: knifeObject(), pedestal: pedestalGeometry(), starGeo: null };
  }, [gl, scene]);

  // ---- pieces
  for (const { r, L, mesh, mat } of world.rounds) {
    const on = visible(r, t);
    mesh.visible = on;
    if (!on) continue;
    const arr = mesh.instanceMatrix.array as Float32Array;
    for (let p = 0; p < L.n; p++) {
      pose(L, p, t, tmp);
      const k = Math.max(tmp.k, 1e-4) * (L.n > 1000 ? 1.006 : 1); // a hair of overlap hides sub-pixel seams in the fine grids
      writeMatrix(arr, p * 16, tmp.pos[0], tmp.pos[1], tmp.pos[2], tmp.q, L.s[p * 3] * k, L.s[p * 3 + 1] * k, L.s[p * 3 + 2] * k);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mat.uniforms.uMix.value = r.id === 5 ? smoother(ramp(t, REASSEMBLE.morph0, REASSEMBLE.morph1)) : 0;
    {
      const D = linesOpen(r, t), total = r.grid[0] + r.grid[1] + r.grid[2] - 3;
      const cut = smooth(clamp(((D[0] + D[1] + D[2]) / total) * 4));
      const back = r.id === 5 ? smoother(ramp(t, REASSEMBLE.t1 - 0.4, REASSEMBLE.t1 + 0.1)) : 0;
      mat.uniforms.uWhole.value = Math.max(1 - cut, back);
    }
  }

  // ---- stars
  {
    const sm = world.starMesh, arr = sm.instanceMatrix.array as Float32Array;
    const on = t > R5.settle && t < REASSEMBLE.t1 + 0.4;
    sm.visible = on;
    if (on) world.stars.forEach((s, i) => {
      const u = clamp((t - R5.settle - s.d) / s.T);
      let x = s.home[0] + (s.tgt[0] - s.home[0]) * u, z = s.home[2] + (s.tgt[2] - s.home[2]) * u;
      let y = s.home[1] + (s.tgt[1] - s.home[1]) * u + s.arc * 4 * u * (1 - u);
      let k = smooth(u / 0.18) * (0.85 + 0.2 * Math.sin(t * s.f * 6.28 + s.ph));
      const ru = clamp((t - REASSEMBLE.t0 - s.rd) / 1.15);
      if (ru > 0) {
        const e = smoother(ru);
        x = s.tgt[0] + (s.home[0] - s.tgt[0]) * e; z = s.tgt[2] + (s.home[2] - s.tgt[2]) * e;
        y = s.tgt[1] + (s.home[1] - s.tgt[1]) * e + 0.6 * 4 * ru * (1 - ru);
        k *= 1 - smooth((ru - 0.55) / 0.4);
      }
      const q = qMul(qAxis(0, 1, 0, t * 1.4 + s.ph), qAxis(1, 0, 0, s.tilt * (1 - smooth(u)) + 0.35));
      const sz = s.size * Math.max(k, 1e-4);
      writeMatrix(arr, i * 16, x, y, z, q, sz, sz, sz);
    });
    sm.instanceMatrix.needsUpdate = true;
  }

  // ---- knife
  const kp = knifePose(t);
  {
    const kn = world.knife;
    const q = new THREE.Quaternion(kp.q[0], kp.q[1], kp.q[2], kp.q[3]);
    const anchor = new THREE.Vector3(0.95 - kp.slide, 0, 0).applyQuaternion(q);
    kn.quaternion.copy(q);
    kn.position.set(kp.p[0] - anchor.x, kp.p[1] - anchor.y, kp.p[2] - anchor.z);
  }

  // ---- camera
  const cam = camAt(t);
  camera.position.set(...cam.pos);
  camera.lookAt(...cam.target);
  const pc = camera as THREE.PerspectiveCamera;
  if (pc.view === null || pc.view.offsetY !== -110) { pc.setViewOffset(1080, 1920, 0, -110, 1080, 1920); }
  camera.updateMatrixWorld();

  return (
    <>
      <hemisphereLight args={["#f6f1ff", "#b9a6e6", 1.15]} />
      <directionalLight
        position={[4.5, 9, 6]} intensity={2.1} color="#fff6ec" castShadow
        shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.02}
        shadow-camera-left={-2.6} shadow-camera-right={2.6} shadow-camera-top={2.6} shadow-camera-bottom={-2.6}
        shadow-camera-near={2} shadow-camera-far={25} shadow-radius={6}
      />
      <mesh geometry={world.pedestal} receiveShadow castShadow>
        <meshStandardMaterial color="#f5e8d2" roughness={0.72} flatShading />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.5} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <shadowMaterial color="#5a3f94" opacity={0.2} />
      </mesh>
      {world.rounds.map(({ r, mesh }) => <primitive key={r.id} object={mesh} />)}
      <primitive object={world.starMesh} />
      <primitive object={world.knife} />
    </>
  );
};
