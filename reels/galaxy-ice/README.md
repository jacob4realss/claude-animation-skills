# Galaxy Ice

A 30 s vertical reel (1080 × 1920, 60 fps): a knife cuts glossy ice cubes, each hiding a different miniature
galaxy, from 1 cut up to 1,000. It ends by reassembling into the first cube, so it loops. Built with Remotion,
three.js and React Three Fiber. Every frame is a pure function of the frame number. The script and shot list
are in [SCRIPT.md](SCRIPT.md).

## Run it

```bash
npm i
npm run dev                     # Remotion Studio preview
npm run render                  # out/galaxy-ice.mp4 (without a GPU add: -- --gl=swangle)
```

On a machine without a GPU, Chrome draws WebGL in software (`--gl=swangle`). The full render then took
about an hour on 4 cores; most of it is the 110,592-piece round 5. With a GPU it takes a few minutes.

## Sound

`public/audio/mix.wav` is committed, so the steps below are only needed after changing the timeline.
Every effect is synthesized in `scripts/make_audio.py`, with cue times read from the same timeline code the
picture uses. The opening line uses Kokoro's `am_michael` voice, running locally.

```bash
python -m venv .venv && .venv/bin/pip install kokoro-onnx soundfile numpy scipy
curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
.venv/bin/python scripts/make_vo.py kokoro-v1.0.onnx voices-v1.0.bin public/audio/vo.wav
node --no-warnings scripts/events.mts > events.json
.venv/bin/python scripts/make_audio.py events.json public/audio/vo.wav public/audio/mix.wav
```

## Checks

```bash
npm run check                    # types + every pile: zero overlapping pieces, nothing inside the pedestal
scripts/stills.sh /tmp/stills 0 90 470 830 1120 1600 1799   # preview frames as PNGs
```

## Where things are

| File | What it holds |
|---|---|
| `src/timeline.ts` | Rounds, knife strokes, cut-line timing, camera path. Plain TS, so Node can run it too. |
| `src/pieces.ts` | Every piece's pose over time: the tip-open rounds, ballistic flights, the height-map pile with a 45° slope, and the reassembly. |
| `src/galaxies.ts` | The five galaxies as 72³ volume textures, built from seeded noise. |
| `src/iceMaterial.ts` | Ice shader: frosted, glossy outer faces with the galaxy seen through them; cut faces show the galaxy's cross-section, stars and golden planets. |
| `src/Scene.tsx` | Pedestal, low-poly knife and its path, stars, lights and camera. |
| `src/Overlay.tsx` | Hook text, cut counter and galaxy name. |
| `scripts/` | Audio cues, synthesis, voiceover, layout checks, stills. |

Fonts: Inter and Inter Tight (SIL Open Font License, see `public/fonts`).
