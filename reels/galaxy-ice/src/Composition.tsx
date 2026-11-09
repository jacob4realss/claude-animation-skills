import { Audio } from "@remotion/media";
import { ThreeCanvas } from "@remotion/three";
import React from "react";
import { AbsoluteFill, Composition, staticFile } from "remotion";
import { Overlay } from "./Overlay";
import { Scene } from "./Scene";
import { DURATION, FPS, H, W } from "./timeline";

export const GalaxyIce: React.FC<{ audio: boolean }> = ({ audio }) => (
  <AbsoluteFill style={{ background: "radial-gradient(ellipse 85% 60% at 50% 52%, #efe8ff 0%, #dccff8 48%, #c6b4ef 100%)" }}>
    <ThreeCanvas width={W} height={H} shadows="soft" gl={{ antialias: true, alpha: true }} camera={{ fov: 30, near: 0.1, far: 100 }}>
      <Scene />
    </ThreeCanvas>
    <Overlay />
    {audio ? <Audio src={staticFile("audio/mix.wav")} /> : null}
  </AbsoluteFill>
);

export const MyComposition = () => (
  <Composition
    id="GalaxyIce"
    component={GalaxyIce}
    durationInFrames={DURATION * FPS}
    fps={FPS}
    width={W}
    height={H}
    defaultProps={{ audio: true }}
  />
);
