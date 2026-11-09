#!/usr/bin/env bash
# Render preview stills: scripts/stills.sh <outdir> <frame> [frame ...]
set -e
out=$1; shift; mkdir -p "$out"
for f in "$@"; do
  npx remotion still GalaxyIce "$out/f$(printf %04d "$f").png" --frame="$f" --gl=swangle --props='{"audio":false}' --timeout=240000 --log=error
done
