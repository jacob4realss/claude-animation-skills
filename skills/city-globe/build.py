#!/usr/bin/env python3
"""/city-globe: spec.json -> a dotted globe that turns once while a line flies from home to every commenter's city (1080x1920, 12 s).

    python3 build.py <spec.json> [--snap 2,6,11]
"""
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / 'kit'))
import anim  # noqa: E402

DEFAULTS = {'home': None, 'cities': [], 'week': None, 'accent': '#F5B942',
            'kicker': None, 'headline': None, 'cta': None, 'sub': None}


def check(spec):
    h = spec['home']
    if not isinstance(h, dict) or not h.get('name') or h.get('lat') is None or h.get('lon') is None:
        sys.exit('spec: "home" needs "name", "lat" and "lon"')
    if not re.fullmatch(r'#[0-9a-fA-F]{6}', spec['accent']):
        sys.exit('spec: "accent" must be a hex colour like "#F5B942"')
    for c in spec['cities']:
        if not c.get('name') or c.get('lat') is None or c.get('lon') is None:
            sys.exit(f'spec: every city needs "name", "lat" and "lon": {c}')
        if not (-90 <= float(c['lat']) <= 90 and -180 <= float(c['lon']) <= 180):
            sys.exit(f'spec: lat/lon out of range (lat -90..90, lon -180..180): {c}')
    if len(spec['cities']) > 80:
        print('note: over ~80 cities the globe gets busy; consider the top 60 by likes')
    spec['land'] = json.loads((HERE / 'land.json').read_text())


if __name__ == '__main__':
    anim.build(HERE / 'template.html', DEFAULTS, duration=lambda s: 12.0, three=True, check=check)
