// Prints every sound cue as JSON, from the same code the picture uses, so audio and video line up exactly.
import { buildLayout } from "../src/pieces.ts";
import { REASSEMBLE, ROUNDS, strokeThrough } from "../src/timeline.ts";

const ev: Record<string, unknown>[] = [];
for (const r of ROUNDS) {
  if (r.drop) ev.push({ type: "drop", t: r.t0, round: r.id });
  for (const s of r.strokes) {
    let a = -1, b = -1;
    for (let t = s.t0; t <= s.t1; t += 1 / 240) { const th = strokeThrough(s, t); if (th > 0 && a < 0) a = t; if (th >= 1 && b < 0) b = t; }
    ev.push({ type: "cut", t: a, end: b, axis: s.axis, lines: s.b - s.a + 1, round: r.id });
  }
  ev.push({ type: "chime", t: r.reveal - 0.12, round: r.id });
  if (r.pop !== null) ev.push({ type: "pop", t: r.pop, round: r.id });
  if (r.mode === "tip1") ev.push({ type: "land", t: r.settle + 0.5, size: 1, count: 2 });
  if (r.mode === "tip2") { ev.push({ type: "slide", t: r.settle, end: r.settle + 0.55 }); ev.push({ type: "land", t: r.settle + 0.12 + 0.72, size: 0.8, count: 2 }); }
  if (r.mode === "pile") {
    const L = buildLayout(r);
    ev.push({ type: "grains", round: r.id, size: L.s[0], times: L.landings!.filter((_, i) => i % Math.max(1, Math.floor(L.n / 700)) === 0) });
    if (r.id === 5) ev.push({ type: "burst", t: r.settle });
  }
}
ev.push({ type: "reassemble", t: REASSEMBLE.t0, end: REASSEMBLE.t1 });
ev.push({ type: "chime", t: REASSEMBLE.t1 - 0.05, round: 6 });
console.log(JSON.stringify(ev));
