import React, { useEffect, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, staticFile, useCurrentFrame } from "remotion";
import { FPS, REASSEMBLE, cutsShown, ramp, roundAt, smooth } from "./timeline";

const PLUM = "#3b2470";

function useFonts() {
  const [handle] = useState(() => delayRender("fonts"));
  useEffect(() => {
    const faces = [
      new FontFace("InterTight", `url(${staticFile("fonts/inter-tight-latin-800-normal.woff2")})`, { weight: "800" }),
      new FontFace("Inter", `url(${staticFile("fonts/inter-600-normal.woff2")})`, { weight: "600" }),
    ];
    Promise.all(faces.map((f) => f.load())).then((ok) => { ok.forEach((f) => document.fonts.add(f)); continueRender(handle); });
  }, [handle]);
}

const fmt = (n: number) => n.toLocaleString("en-US");

export const Overlay: React.FC = () => {
  useFonts();
  const t = useCurrentFrame() / FPS;
  // hook: on at the start and back at the end so the loop is seamless
  const hook = Math.max(1 - smooth(ramp(t, 2.0, 2.45)), smooth(ramp(t, 29.25, 29.85)));
  const hookY = 18 * (1 - hook);
  const r = roundAt(t);
  const end = r.pop !== null ? r.pop + 0.15 : REASSEMBLE.t0 + 0.4;
  const start = r.id === 1 ? 2.25 : r.t0 - 0.05;
  const n = cutsShown(r, t);
  const cIn = r.id === 1 ? smooth(ramp(t, start, start + 0.25)) : smooth(ramp(t, r.strokes[0].t0, r.strokes[0].t0 + 0.12)) * (n >= 1 ? 1 : 0);
  const cOut = 1 - smooth(ramp(t, end, end + 0.3));
  const counter = cIn * cOut;
  const shown = Math.max(1, n);
  const label = `${fmt(shown)} ${shown === 1 ? "CUT" : "CUTS"}`;
  const pop = 1 + 0.06 * Math.exp(-(((t - r.strokes[r.strokes.length - 1].t1) * 6) ** 2));
  const name = smooth(ramp(t, r.reveal, r.reveal + 0.35)) * cOut;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{
        position: "absolute", top: 268 + hookY, left: 70, right: 70, textAlign: "center", opacity: hook,
        fontFamily: "InterTight", fontWeight: 800, fontSize: 92, lineHeight: 1.02, letterSpacing: "-0.02em", color: PLUM,
        textShadow: "0 4px 0 rgba(255,255,255,0.55)",
      }}>
        GUESS WHAT&rsquo;S<br />FROZEN INSIDE.
      </div>
      <div style={{
        position: "absolute", top: 262, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 18,
        opacity: counter * (1 - hook),
      }}>
        <div style={{
          fontFamily: "InterTight", fontWeight: 800, fontSize: 124, letterSpacing: "-0.03em", color: PLUM, lineHeight: 1,
          transform: `scale(${pop})`, textShadow: "0 4px 0 rgba(255,255,255,0.55)", fontVariantNumeric: "tabular-nums",
        }}>{label}</div>
        <div style={{
          opacity: name, transform: `translateY(${10 * (1 - name)}px)`, fontFamily: "Inter", fontWeight: 600, fontSize: 38,
          color: PLUM, background: "rgba(255,250,240,0.82)", padding: "12px 28px", borderRadius: 999,
          boxShadow: "0 6px 20px rgba(80,50,140,0.12)",
        }}>{r.title}</div>
      </div>
    </AbsoluteFill>
  );
};

