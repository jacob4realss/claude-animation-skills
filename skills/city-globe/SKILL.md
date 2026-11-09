---
name: city-globe
description: Makes a "comment your city" globe reel. A dotted dark globe turns once while a glowing line flies from the creator's home to every commenter's city, a pin lands with the city name and @handle, and a counter ticks up. With no cities it makes the teaser that asks people to comment. Use when the user runs /city-globe or asks for a weekly city map, a "where are you watching from" reel or a globe with lines to followers' cities.
---

# /city-globe

```
┌──────────────────────┐
│  WEEK 3 · FROM NYC   │  mono kicker
│     24 cities        │  counter ticks up as pins land
│     .::::::::.       │
│   .::╭──●London      │  dotted globe turns once (12 s)
│   ::●╯  ::::::       │  lines fly from home to each city
│    '::::::::'        │
│  Comment your city   │  call to action at the end
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
1. **Cities.** Ask the user to paste the comments (or a list of cities). Pull out each city and, if they want shout-outs, the commenter's @handle. Look up each city's latitude and longitude yourself (city centre, 3 decimals). Skip anything that isn't a real place, and tell the user what you skipped. The same city twice is fine: it gets one pin and the label says "@first +2".
2. **Spec.** Write `<name>.globe.json` (below). For the teaser, leave `cities` empty.
3. **Build.** Run `python3 "$SKILL_DIR/build.py" <spec.json>`. A render takes about 3 minutes. Run with `--snap 3,6,9,11.5` first to check the labels.
4. **Check** the sheet: the counter and the call to action sit inside the red frame, and the labels don't pile up.
5. **Hand over** the mp4 path.

## Spec
```json
{
  "home": {"name": "Midtown, NYC", "lat": 40.755, "lon": -73.984},
  "week": 3,
  "cities": [{"name": "London", "lat": 51.507, "lon": -0.128, "by": "@sam"},
             {"name": "Lagos", "lat": 6.524, "lon": 3.379, "by": "@tola"}],
  "accent": "#F5B942"
}
```
- **`home`**: required. Where every line starts. The name shows at the start and the end.
- **`cities`**: each needs `name`, `lat` and `lon`. `by` (optional) is a handle or a list of handles. Keep it under about 80; pick the most-liked comments past that.
- **`week`** (optional): puts "Week N" in the kicker.
- **`accent`**: lines, pins and the counter (hex).
- **`kicker`**, **`headline`**, **`cta`**, **`sub`** (optional): override the default text. The defaults are "Where are you watching from?" for the teaser, "Comment your city" for the call to action, and "Next week's map flies to you" under it.
- **`hold`** (optional): extra seconds at the end. **`out`** (optional): the output path.

## How it lands
Each line launches so it lands about when its city turns to face the camera. The globe turns once, east first, and ends back on home with every line showing. `land.json` holds the land dots; `make_land.mjs` regenerates it from Natural Earth (world-atlas).

## Taste
- Short city names ("NYC", "São Paulo"). Leave out the country unless two cities share a name.
- Only add handles of people who commented publicly asking to be on the map.
