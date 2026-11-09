// Ice-piece shader. Every piece is an opaque box (so nothing sorts or flickers); translucency is faked by
// marching the galaxy volume behind each outer face, and every cut face shows the galaxy's cross-section.
import * as THREE from "three";
import { PLANETS } from "./galaxies.ts";

const VERT = /* glsl */ `
attribute vec3 aC;
attribute vec3 aS;
varying vec3 vOrig;
varying vec3 vN;
varying vec3 vNw;
varying vec3 vVo;
varying vec3 vVw;
flat varying vec3 fC;
flat varying vec3 fS;
void main() {
  vOrig = aC + aS * position;
  vN = normal;
  mat4 M = modelMatrix * instanceMatrix;
  vec4 wp = M * vec4(position, 1.0);
  mat3 m = mat3(M);
  mat3 R = mat3(normalize(m[0] + 1e-9), normalize(m[1] + 1e-9), normalize(m[2] + 1e-9));
  vNw = R * normal;
  vVw = wp.xyz - cameraPosition;
  vVo = transpose(R) * vVw;
  fC = aC; fS = aS;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */ `
precision highp float;
precision highp sampler3D;
uniform sampler3D uTexA;
uniform sampler3D uTexB;
uniform float uMix;
uniform vec3 uL;
uniform float uPlanets;
uniform float uWhole;   // 1 while the cube is intact: look through the whole cube, not just this piece
uniform vec4 uPl[5];
varying vec3 vOrig;
varying vec3 vN;
varying vec3 vNw;
varying vec3 vVo;
varying vec3 vVw;
flat varying vec3 fC;
flat varying vec3 fS;

vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
float h31(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
vec4 gal(vec3 o) {
  vec3 uvw = vec3(o.x + 0.5, o.y, o.z + 0.5);
  vec4 g = mix(texture(uTexA, uvw), texture(uTexB, uvw), uMix);
  g.rgb *= 2.0;
  return g;
}
// golden planets: returns colour in rgb, hit in a
vec4 planet(vec3 o) {
  if (uPlanets < 0.5) return vec4(0.0);
  vec3 q = (o - vec3(0.0, 0.5, 0.0)) * 2.0;
  for (int i = 0; i < 5; i++) {
    vec3 d = q - uPl[i].xyz;
    if (length(d) < uPl[i].w) {
      float lat = d.y / uPl[i].w;
      float band = 0.5 + 0.5 * sin(lat * 9.0 + float(i) * 1.7);
      vec3 c = mix(vec3(1.0, 0.72, 0.18), vec3(1.0, 0.88, 0.52), band);
      c = mix(c, vec3(0.86, 0.5, 0.12), smoothstep(0.75, 1.0, length(d) / uPl[i].w));
      return vec4(c, 1.0);
    }
  }
  return vec4(0.0);
}
void main() {
  vec3 n = normalize(vN);
  vec3 nw = normalize(vNw);
  vec3 V = normalize(-vVw);
  vec3 face = fC + n * fS * 0.5;
  bool ext = (abs(n.x) > 0.5 && abs(abs(face.x) - 0.5) < 1e-3) || (abs(n.z) > 0.5 && abs(abs(face.z) - 0.5) < 1e-3)
          || (n.y > 0.5 && abs(face.y - 1.0) < 1e-3) || (n.y < -0.5 && abs(face.y) < 1e-3);
  float dif = max(dot(nw, uL), 0.0);
  vec3 amb = mix(lin(vec3(0.78, 0.72, 0.95)) * 0.55, vec3(0.95), nw.y * 0.5 + 0.5);
  vec3 Hh = normalize(uL + V);
  float fres = pow(1.0 - max(dot(nw, V), 0.0), 3.0);
  vec3 col;
  if (ext) {
    // look into the piece: march the galaxy behind this outer face
    vec3 dir = normalize(normalize(vVo) - n * 0.35);
    vec3 bmin = mix(fC - fS * 0.5, vec3(-0.5, 0.0, -0.5), uWhole), bmax = mix(fC + fS * 0.5, vec3(0.5, 1.0, 0.5), uWhole);
    vec3 inv = 1.0 / dir, t1 = (bmin - vOrig) * inv, t2 = (bmax - vOrig) * inv, tf = max(t1, t2);
    float L = clamp(min(min(tf.x, tf.y), tf.z), 0.0, 1.8);
    float st = L / 10.0;
    vec3 acc = vec3(0.0); float A = 0.0;
    for (int i = 0; i < 10; i++) {
      vec3 p = vOrig + dir * (st * (float(i) + 0.5));
      vec4 pl = planet(p);
      vec4 g = pl.a > 0.0 ? vec4(pl.rgb, 6.0) : gal(p);
      float a = 1.0 - exp(-g.a * 7.5 * st);
      acc += (1.0 - A) * a * lin(g.rgb) * 1.25;
      A += (1.0 - A) * a;
    }
    vec3 iceBody = lin(vec3(0.84, 0.87, 1.0)) * (0.62 + 0.38 * dif) + amb * 0.05;
    float vis = 0.5;                                                  // frosted: a hint of what's inside, not the answer
    col = iceBody * (1.0 - A * vis) + acc * vis;
    col *= 0.955 + 0.06 * h31(floor(vOrig * 110.0));                // frost grain
    // crisp bright edges along the original cube's edges only (never on the seams between pieces)
    vec3 e = vec3(0.5 - abs(vOrig.x), 0.5 - abs(vOrig.y - 0.5), 0.5 - abs(vOrig.z));
    float ed = 1e3;
    if (abs(n.x) < 0.5) ed = min(ed, e.x);
    if (abs(n.y) < 0.5) ed = min(ed, e.y);
    if (abs(n.z) < 0.5) ed = min(ed, e.z);
    col += vec3(1.0) * smoothstep(0.022, 0.0, ed) * 0.35;
    // glossy: a soft studio reflection plus a sharp highlight
    vec3 rf = reflect(-V, nw);
    vec3 sky = mix(lin(vec3(0.72, 0.64, 0.92)), vec3(1.0), smoothstep(-0.2, 0.7, rf.y));
    col = mix(col, sky, 0.1 + 0.45 * fres);
    col += vec3(1.0) * (pow(max(dot(nw, Hh), 0.0), 120.0) * 1.4 + pow(max(dot(nw, Hh), 0.0), 18.0) * 0.12);
  } else {
    // a cut face: the galaxy's cross-section, polished and wet
    vec4 g = gal(vOrig);
    vec4 pl = planet(vOrig);
    vec3 ice = lin(vec3(0.88, 0.92, 1.0)) * (0.72 + 0.28 * dif);
    vec3 emis = lin(g.rgb) * (1.05 + 0.6 * g.a);
    col = mix(ice, emis, smoothstep(0.02, 0.4, g.a));
    vec3 sq = (vOrig - vec3(0.0, 0.5, 0.0)) * 56.0, cell = floor(sq);
    vec3 sp = cell + 0.2 + 0.6 * vec3(h31(cell), h31(cell + 7.1), h31(cell + 3.7));
    float star = smoothstep(0.16, 0.0, length(sq - sp)) * step(0.82, h31(cell + 11.0)) * smoothstep(0.03, 0.25, g.a);
    col += star * vec3(1.0, 0.95, 0.85) * 1.6;
    if (pl.a > 0.0) col = lin(pl.rgb) * (0.75 + 0.35 * dif);
    col += vec3(1.0) * (pow(max(dot(nw, Hh), 0.0), 90.0) * 0.55 + fres * 0.18);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function iceMaterial(texA: THREE.Data3DTexture, texB: THREE.Data3DTexture, planets: boolean) {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uTexA: { value: texA },
      uTexB: { value: texB },
      uMix: { value: 0 },
      uL: { value: new THREE.Vector3(3, 6, 4).normalize() },
      uPlanets: { value: planets ? 1 : 0 },
      uWhole: { value: 1 },
      uPl: { value: PLANETS.map((p) => new THREE.Vector4(...p)) },
    },
  });
}
