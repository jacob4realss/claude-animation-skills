---
name: fruit-cut
description: Makes the "cutting a fruit with 1 cut, 2 cuts, 4 cuts ... 10,000 cuts" reel in 3D. A fresh fruit drops onto a wooden board each round, a knife (few cuts) or a grid cutter (many cuts) slices it in a top-down grid, and the pieces fall open while a big counter shows the cuts and pieces. Use when the user runs /fruit-cut or asks for a fruit (or anything) cut into more and more pieces.
---

# /fruit-cut

```
┌──────────────────────┐
│      WATERMELON      │  mono header
│     1,000 CUTS       │  counter pops in each round
│   251,001 pieces     │
│      ╱▒▒▒▒▒▒╲        │  a fresh fruit drops in, gets cut,
│     ▒▒▒▒▒▒▒▒▒▒       │  and the pieces fall open on the board
│      ╲▒▒▒▒▒▒╱        │
└──────────────────────┘
```

## First use
This skill's folder is the "Base directory" Claude Code shows when it loads it.
```bash
SKILL_DIR="<base directory of this skill>"
KIT=$(python3 -c 'import os,sys;print(os.path.realpath(os.path.join(sys.argv[1],"..","..","kit")))' "$SKILL_DIR")
[ -s "$KIT/node_modules/three/build/three.module.js" ] || bash "$KIT/setup.sh"
```
Needs ffmpeg and Node. It renders with WebGL in headless Chrome.

## Steps
1. **Fruit and rounds.** Ask which fruit and how far the counter goes. The default rounds are 1, 2, 4, 8, 16, 32, 100, 1,000, 10,000 cuts (about 21 s).
2. **Spec.** Write `<name>.fruitcut.json` (below).
3. **Check stills first.** Run `python3 "$SKILL_DIR/build.py" <spec.json> --snap 1.4,9.9,20.5`. The build prints when each round starts and ends; a round's pieces have fallen open about 0.5 s before its end.
4. **Build.** Run `python3 "$SKILL_DIR/build.py" <spec.json>`. With a GPU this takes a few minutes. Without one (a server, a VM), Chrome draws in software and the rounds past 100 cuts take around 10 s a frame, so the full reel can take about an hour (64 minutes on a 4-core server).
5. **Check** the sheet: the counter sits inside the red frame and the pieces stay on screen.
6. **Hand over** the mp4 path.

## Spec
```json
{ "fruit": "watermelon", "cuts": [1, 2, 4, 8, 16, 32, 100, 1000, 10000] }
```
- **`fruit`**: `watermelon`, `orange`, `apple` or `kiwi`. Each has its own peel, rind, flesh and seeds on every cut face.
- **`cuts`**: 1 to 14 rounds, each a whole number of cuts. Half the cuts run one way and half the other, seen from above, so `n` cuts make `(ceil(n/2)+1) × (floor(n/2)+1)` pieces: 1 → 2, 2 → 4, 4 → 9, 10,000 → 25,010,001.
- **`title`** (optional): the header; defaults to the fruit's name.
- **`knife_up_to`** (default 8): rounds with this many cuts or fewer are chopped one at a time with a chef's knife; bigger rounds use a grid cutter that presses through in one go.
- **`max_grid`** (default 100): the most pieces per side that are actually drawn. At 100 a piece is a few pixels wide on a phone. Rounds past it are drawn at this limit, with the pieces collapsing flatter and a juice puddle spreading, because that is what tens of millions of pieces look like at 1080 px. Raise it (up to 400) only on a machine with a GPU.
- **`loose`** (default 1): how readily the pieces fall over in the big rounds. 0 keeps them standing in a grid.
- **`angle`** (default -18): the camera's angle around the board, in degrees.
- **`hold`** (optional): extra seconds at the end. **`out`** (optional): the output path.

## How it works (for changes)
- Every piece is one box (its grid cell). The fragment shader ray-marches the fruit's signed distance field inside the box, so the cut faces and peel are exact for any number of pieces, and the motion (the gaps opening, the drop, the fall) is computed per piece on the GPU. The fruit shapes and colours are `sdf()` and `albedo()` in `template.html`; a new fruit is a new branch in both plus an entry in `FRUITS` (and `JUICE`).
- The timeline is worked out in `build.py` (`plan()`): every round is drop, cut, fall open, with a longer hold on the last one.

## Taste
- Keep the counter big and the numbers true: the pieces line is computed, never rounded up for effect.
- Five to ten rounds. Doubling early (1, 2, 4, 8) then jumping (100, 1,000, 10,000) is the format people know.
- Add sound in the edit: a crunch per knife chop and one thud for the grid cutter does most of the work in this format.
