#!/usr/bin/env python3
"""/fruit-cut: spec.json -> a fruit cut with 1 cut, 2 cuts, 4 cuts ... 10,000 cuts, a fresh fruit each round (1080x1920).

    python3 build.py <spec.json> [--snap 1.2,4.0]

Every round is half vertical and half horizontal cuts, seen from above: n cuts make (ceil(n/2)+1) x (floor(n/2)+1) pieces.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / 'kit'))
import anim  # noqa: E402

FRUITS = ('watermelon', 'orange', 'apple', 'kiwi')
DEFAULTS = {
    'fruit': 'watermelon', 'title': '',
    'cuts': [1, 2, 4, 8, 16, 32, 100, 1000, 10000],
    'knife_up_to': 8,      # rounds with this many cuts or fewer use the chef's knife; more use the grid cutter
    'max_grid': 100,       # pieces per side actually drawn; past this each piece is only a few px wide on a phone
    'loose': 1.0,          # how readily the pieces fall over in the big rounds (0 = they stand, 1 = they collapse)
    'angle': -18,          # camera azimuth in degrees
}


def plan(spec):
    """the timeline: one entry per round. The template reads it as SPEC._plan."""
    t, out = 0.0, []
    for i, n in enumerate(spec['cuts']):
        v, h = (n + 1) // 2, n // 2
        knife = n <= spec['knife_up_to']
        drop = 0.32
        cut = min(1.15, 0.12 + 0.13 * n) if knife else 0.7
        bloom = 0.95 if knife else 1.15
        dur = drop + cut + bloom + 0.12 + (0.9 if i == len(spec['cuts']) - 1 else 0)
        out.append({'cuts': n, 'v': v, 'h': h, 'pieces': (v + 1) * (h + 1), 'mode': 'knife' if knife else 'grid',
                    't0': round(t, 4), 'drop': drop, 'cut': round(cut, 4), 'dur': round(dur, 4)})
        t += dur
    return out


def check(spec):
    if spec['fruit'] not in FRUITS:
        sys.exit(f'spec: "fruit" must be one of {", ".join(FRUITS)}')
    c = spec['cuts']
    if not isinstance(c, list) or not 1 <= len(c) <= 14 or not all(isinstance(n, int) and n >= 1 for n in c):
        sys.exit('spec: "cuts" needs 1 to 14 whole numbers, each 1 or more, e.g. [1, 2, 4, 8, 100, 1000]')
    if not 20 <= spec['max_grid'] <= 400:
        sys.exit('spec: "max_grid" must be between 20 and 400')
    spec['_plan'] = plan(spec)
    for r in spec['_plan']:
        print(f"{r['cuts']:>6,} cuts  {r['t0']:6.2f}-{r['t0'] + r['dur']:.2f} s  ({r['mode']}, {r['pieces']:,} pieces)")


def duration(spec):
    p = spec['_plan'][-1]
    return p['t0'] + p['dur']


if __name__ == '__main__':
    anim.build(HERE / 'template.html', DEFAULTS, duration=duration, three=True, check=check)
