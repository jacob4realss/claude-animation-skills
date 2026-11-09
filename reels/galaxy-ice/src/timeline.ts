// The whole reel as plain data and closed-form functions of time (seconds).
// No imports: Node runs this file directly (type stripping) to time the sound effects in scripts/make_audio.py.

export const FPS = 60;
export const DURATION = 30;
export const W = 1080;
export const H = 1920;

export type Axis = "x" | "y" | "z";
export type Stroke = { axis: Axis; a: number; b: number; t0: number; t1: number; pos: number };
export type Mode = "tip1" | "tip2" | "pile";
export type Round = {
  id: number;
  title: string; // the galaxy's name
  galaxy: number; // index into GALAXIES (galaxies.ts)
  cuts: number; // the real number of cuts, for the counter
  grid: [number, number, number]; // pieces drawn along x, y, z
  t0: number; // the fresh cube has landed
  drop: boolean; // falls in from above (round 1 is already there at frame 0)
  strokes: Stroke[];
  mode: Mode;
  settle: number; // pieces start to separate
  reveal: number; // galaxy name appears
  pop: number | null; // pieces shrink away (null: they stay, round 5 reassembles)
};

// cube: x, z in [-0.5, 0.5], y in [0, 1], resting on the pedestal top at y = 0
export const linePos = (axis: Axis, k: number, n: number) => (axis === "y" ? k / n : -0.5 + k / n);

const axisIndex = (a: Axis) => (a === "x" ? 0 : a === "y" ? 1 : 2);

// split each axis' lines into `per` visible strokes, played back to back in [t0, t1]
function strokes(grid: [number, number, number], order: Axis[], per: number[], t0: number, t1: number): Stroke[] {
  const out: Stroke[] = [];
  const total = per.reduce((a, b) => a + b, 0);
  const d = (t1 - t0) / total;
  let k = 0;
  order.forEach((axis, oi) => {
    const n = grid[axisIndex(axis)];
    const lines = n - 1;
    const m = Math.min(per[oi], lines);
    for (let s = 0; s < m; s++) {
      const a = Math.floor((s * lines) / m) + 1;
      const b = Math.floor(((s + 1) * lines) / m);
      out.push({ axis, a, b, t0: t0 + k * d, t1: t0 + (k + 1) * d, pos: linePos(axis, (a + b) / 2, n) });
      k++;
    }
  });
  return out;
}

export const ROUNDS: Round[] = [
  {
    id: 1, title: "Purple nebula", galaxy: 0, cuts: 1, grid: [2, 1, 1], t0: 0, drop: false,
    strokes: [{ axis: "x", a: 1, b: 1, t0: -0.45, t1: 1.05, pos: 0 }],
    mode: "tip1", settle: 0.8, reveal: 1.25, pop: 4.45,
  },
  {
    id: 2, title: "Electric-blue spiral", galaxy: 1, cuts: 2, grid: [2, 2, 1], t0: 5, drop: true,
    strokes: [
      { axis: "x", a: 1, b: 1, t0: 5.02, t1: 6.02, pos: 0 },
      { axis: "y", a: 1, b: 1, t0: 6.02, t1: 7.02, pos: 0.5 },
    ],
    mode: "tip2", settle: 6.98, reveal: 7.55, pop: 9.45,
  },
  {
    id: 3, title: "Emerald aurora", galaxy: 2, cuts: 10, grid: [5, 4, 4], t0: 10, drop: true,
    strokes: strokes([5, 4, 4], ["x", "z", "y"], [4, 3, 3], 10.08, 12.45),
    mode: "pile", settle: 12.45, reveal: 13.0, pop: 14.45,
  },
  {
    id: 4, title: "Pink galaxy + golden planets", galaxy: 3, cuts: 100, grid: [35, 34, 34], t0: 15, drop: true,
    strokes: strokes([35, 34, 34], ["x", "z", "y"], [6, 6, 6], 15.08, 17.25),
    mode: "pile", settle: 17.27, reveal: 17.75, pop: 19.45,
  },
  {
    id: 5, title: "Amber galaxy", galaxy: 4, cuts: 1000, grid: [48, 48, 48], t0: 20, drop: true,
    strokes: strokes([48, 48, 48], ["x", "z", "y"], [8, 8, 8], 20.08, 23.0),
    mode: "pile", settle: 23.02, reveal: 23.6, pop: null,
  },
];

export const REASSEMBLE = { t0: 27.0, t1: 29.3, morph0: 28.4, morph1: 29.5 };
export const DROP_TIME = 0.5; // a fresh cube falls for this long before t0

// ------------------------------------------------------------------ easing
export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const smooth = (x: number) => { const t = clamp(x); return t * t * (3 - 2 * t); };
export const smoother = (x: number) => { const t = clamp(x); return t * t * t * (t * (t * 6 - 15) + 10); };
export const ramp = (t: number, a: number, b: number) => clamp((t - a) / (b - a));

// ------------------------------------------------------------------ the knife
// A stroke spends 18% moving into place, 60% cutting through, 22% lifting out.
export const PH_MOVE = 0.18, PH_CUT = 0.78;
export const EDGE_TOP = 1.32; // a vertical stroke starts with the edge this high
export const SLICE_Z0 = -0.95, SLICE_Z1 = 0.62; // a horizontal slice runs back to front

export function strokeCutU(s: Stroke, t: number) {
  return smooth(ramp((t - s.t0) / (s.t1 - s.t0), PH_MOVE, PH_CUT));
}
// how far the blade has passed through the cube, 0..1, for this stroke's lines
export function strokeThrough(s: Stroke, t: number) {
  const u = strokeCutU(s, t);
  if (s.axis === "y") { const z = SLICE_Z0 + (SLICE_Z1 - SLICE_Z0) * u; return clamp(z + 0.5); }
  const y = EDGE_TOP * (1 - u);
  return clamp(1 - y);
}
// lines opened so far on each axis (fractional while the blade is in the cube)
export function linesOpen(r: Round, t: number): [number, number, number] {
  const d: [number, number, number] = [0, 0, 0];
  for (const s of r.strokes) d[axisIndex(s.axis)] += (s.b - s.a + 1) * strokeThrough(s, t);
  return d;
}
export function cutsShown(r: Round, t: number) {
  const d = linesOpen(r, t);
  const total = r.grid[0] + r.grid[1] + r.grid[2] - 3;
  const done = d[0] + d[1] + d[2];
  return Math.round((r.cuts * done) / total);
}

// ------------------------------------------------------------------ rounds in time
export function roundAt(t: number) {
  for (let i = ROUNDS.length - 1; i >= 0; i--) if (t >= ROUNDS[i].t0 - DROP_TIME - 0.05) return ROUNDS[i];
  return ROUNDS[0];
}

// ------------------------------------------------------------------ camera
// distance keyframes: in close on each fresh cube, out as the pieces spread. Starts and ends at the same place.
const CAM: [number, number][] = [
  [0, 8.2], [0.95, 8.3], [2.0, 11.0], [4.5, 11.2], [5.35, 8.5], [6.9, 8.5], [7.95, 10.8], [9.5, 11.0],
  [10.3, 8.6], [12.4, 8.6], [13.7, 11.2], [14.5, 11.3], [15.3, 8.6], [17.55, 8.6], [18.9, 11.6], [19.5, 11.7],
  [20.3, 8.4], [23.0, 8.8], [24.4, 12.6], [27.0, 12.3], [29.1, 8.6], [30, 8.2],
];
export function camDist(t: number) {
  for (let i = 0; i < CAM.length - 1; i++) {
    const [ta, da] = CAM[i], [tb, db] = CAM[i + 1];
    if (t <= tb) return da + (db - da) * smoother((t - ta) / (tb - ta));
  }
  return CAM[CAM.length - 1][1];
}
export function camera(t: number) {
  const d = camDist(t);
  const w = clamp((d - 8.2) / (12.6 - 8.2));
  const az = ((38 + 6 * Math.sin((2 * Math.PI * t) / DURATION)) * Math.PI) / 180;
  const el = ((27 + 10 * w + 1.5 * Math.sin((4 * Math.PI * t) / DURATION)) * Math.PI) / 180;
  const ty = 0.5 - 0.3 * w;
  return {
    pos: [Math.sin(az) * Math.cos(el) * d, ty + Math.sin(el) * d, Math.cos(az) * Math.cos(el) * d] as [number, number, number],
    target: [0, ty, 0] as [number, number, number],
  };
}
