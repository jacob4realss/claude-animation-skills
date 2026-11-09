#!/usr/bin/env python3
"""Synthesizes every sound in the reel (no samples, no cloud): gentle ice cuts, crystalline chimes, soft landings,
a grain patter for the piles, the burst and the reassembly whoosh. Cue times come from scripts/events.mts, which
reads the same timeline as the picture. Mixes in the opening voiceover and writes public/audio/mix.wav.

    node --no-warnings scripts/events.mts > /tmp/events.json
    python scripts/make_audio.py /tmp/events.json public/audio/vo.wav public/audio/mix.wav
"""
import json
import sys

import numpy as np
import soundfile as sf
from scipy.signal import butter, fftconvolve, resample_poly, sosfilt

SR = 48000
DUR = 30.0
N = int(SR * DUR)
rng = np.random.default_rng(7)
L = np.zeros(N)
R = np.zeros(N)

PENTA = [0, 2, 4, 7, 9]                       # major pentatonic, so every chime agrees with every other


def note(semi, base=1046.5):                   # semitones above C6
    return base * 2 ** (semi / 12)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], btype="band", fs=SR, output="sos"), x)


def lp(x, f, order=2):
    return sosfilt(butter(order, f, btype="low", fs=SR, output="sos"), x)


def add(sig, t, gain=1.0, pan=0.0):
    i = int(round(t * SR))
    if i >= N or i + len(sig) <= 0:
        return
    s = sig
    if i < 0:
        s, i = s[-i:], 0
    s = s[: N - i]
    L[i:i + len(s)] += s * gain * np.sqrt(0.5 * (1 - pan))
    R[i:i + len(s)] += s * gain * np.sqrt(0.5 * (1 + pan))


def env(n, a, r):
    e = np.ones(n)
    na, nr = max(1, int(a * SR)), max(1, int(r * SR))
    e[:na] = np.linspace(0, 1, na)
    e[-nr:] *= np.linspace(1, 0, nr)
    return e


def bell(f, dur=1.6, bright=1.0):
    t = np.arange(int(dur * SR)) / SR
    parts = [(1, 1.0, 1.0), (2.0, 0.45, 1.6), (3.01, 0.28 * bright, 2.4), (4.2, 0.16 * bright, 3.2), (5.43, 0.1 * bright, 4.0)]
    s = sum(a * np.sin(2 * np.pi * f * m * t + m) * np.exp(-t * 3.2 * d) for m, a, d in parts)
    return s * np.minimum(1, t / 0.002)


def ice_cut(dur, gain):
    """a soft scrape with crackle: band-passed noise plus sparse glassy ticks"""
    n = int((dur + 0.12) * SR)
    s = bp(rng.standard_normal(n), 2200, 7500) * 0.5 + bp(rng.standard_normal(n), 600, 1800) * 0.18
    s *= env(n, 0.03, 0.1)
    ticks = np.zeros(n)
    for _ in range(int(dur * 70)):
        i = rng.integers(0, n - 600)
        f = rng.uniform(3000, 8000)
        tt = np.arange(500) / SR
        ticks[i:i + 500] += np.sin(2 * np.pi * f * tt) * np.exp(-tt * 300) * rng.uniform(0.2, 0.6)
    return (s + ticks) * gain


def tock(f=170, gain=1.0):
    t = np.arange(int(0.18 * SR)) / SR
    body = np.sin(2 * np.pi * (f + 40 * np.exp(-t * 40)) * t) * np.exp(-t * 28)
    click = lp(rng.standard_normal(len(t)), 2500) * np.exp(-t * 120) * 0.3
    return (body + click) * gain


def clink(f, gain):
    t = np.arange(int(0.09 * SR)) / SR
    return (np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 1.51 * t)) * np.exp(-t * 70) * gain


def whoosh(dur, rise=True):
    n = int(dur * SR)
    x = rng.standard_normal(n)
    out = np.zeros(n)
    k = 8
    for j in range(k):                          # a band that sweeps up (or down) in steps, crossfaded
        a, b = j * n // k, (j + 1) * n // k
        lo = 300 * 2 ** ((j if rise else k - j) * 0.55)
        seg = bp(x, lo, min(lo * 2.2, 15000))
        w = np.zeros(n)
        w[a:b] = 1
        w = lp(w, 6)
        out += seg * w
    e = np.sin(np.linspace(0, np.pi, n)) ** 1.5
    return out * e


ev = json.load(open(sys.argv[1]))
vo_path, out_path = sys.argv[2], sys.argv[3]

for e in ev:
    ty = e["type"]
    if ty == "cut":
        big = e["round"] <= 2
        d = max(0.08, e["end"] - e["t"])
        g = 0.32 if big else (0.2 if e["round"] == 3 else 0.13)
        pan = {"x": -0.15, "z": 0.15, "y": 0.0}[e["axis"]]
        add(ice_cut(d, g), e["t"], pan=pan)
        if e["axis"] != "y":
            add(tock(150 if big else 190, 0.22 if big else 0.08), e["end"], pan=pan)
    elif ty == "land":
        for k in range(e["count"]):
            add(tock(120, 0.42 * e["size"]), e["t"] + 0.012 * k, pan=-0.35 if k == 0 else 0.35)
            add(clink(rng.uniform(2600, 3600), 0.12), e["t"] + 0.012 * k, pan=-0.35 if k == 0 else 0.35)
    elif ty == "slide":
        n = int((e["end"] - e["t"]) * SR)
        add(bp(rng.standard_normal(n), 900, 3000) * env(n, 0.08, 0.2) * 0.05, e["t"])
    elif ty == "grains":
        size = e["size"]
        times = e["times"]
        g = 0.09 if len(times) < 100 else 0.035
        for i, t in enumerate(times):
            f = rng.uniform(2400, 6500) * (1.4 if size < 0.05 else 1.0)
            add(clink(f, g * rng.uniform(0.4, 1.0)), t, pan=rng.uniform(-0.6, 0.6))
            if len(times) < 100 or i % 6 == 0:
                add(tock(rng.uniform(170, 260), g * 1.4), t, pan=rng.uniform(-0.4, 0.4))
    elif ty == "chime":
        r = e["round"]
        root = [0, 2, 4, 7, 9, 12][r - 1]
        steps = [0, 2, 4] if r < 5 else [0, 1, 2, 3, 4]
        for k, s in enumerate(steps):
            semi = root + PENTA[s % 5] + 12 * (s // 5)
            add(bell(note(semi, 523.25), 2.2, 0.8), e["t"] + 0.075 * k, gain=0.16 if r != 1 else 0.11, pan=(k - 1) * 0.3)
    elif ty == "pop":
        for k in range(6):
            add(bell(note(PENTA[k % 5] + 12, 1046.5), 0.6, 0.6), e["t"] + 0.04 * k, gain=0.045, pan=rng.uniform(-0.5, 0.5))
    elif ty == "drop":
        add(tock(110, 0.38), e["t"])
        add(clink(3100, 0.1), e["t"])
    elif ty == "burst":
        add(whoosh(1.2, rise=False), e["t"] - 0.1, gain=0.18)
        for k in range(46):                      # a shimmering cascade of tiny bells
            semi = PENTA[rng.integers(0, 5)] + 12 * rng.integers(0, 3)
            add(bell(note(semi, 1046.5), 1.0, 0.7), e["t"] + 0.05 + 1.7 * (k / 46) ** 1.3, gain=0.07 * (1 - k / 60), pan=rng.uniform(-0.8, 0.8))
    elif ty == "reassemble":
        add(whoosh(e["end"] - e["t"] + 0.2, rise=True), e["t"], gain=0.16)
        for k in range(10):                      # rising arpeggio
            semi = PENTA[k % 5] + 12 * (k // 5)
            add(bell(note(semi, 523.25), 1.0, 0.7), e["t"] + 0.6 + 0.16 * k, gain=0.05 + 0.006 * k, pan=(k % 3 - 1) * 0.4)

# a quiet pad underneath (E major-ish), constant so the loop point is seamless
t = np.arange(N) / SR
pad = sum(np.sin(2 * np.pi * f * t + p) for f, p in [(164.81, 0.0), (246.94, 1.0), (329.63, 2.0), (415.3, 0.5)])
pad *= 0.5 + 0.5 * np.sin(2 * np.pi * t / 7.5) ** 2
pad = lp(pad, 1800) * 0.006
L += pad
R += pad

# small room: a short exponentially decaying noise tail
ir_n = int(0.9 * SR)
ir = rng.standard_normal(ir_n) * np.exp(-np.arange(ir_n) / SR * 6.5)
ir = lp(ir, 6000)
ir /= np.abs(ir).sum() / 6
L = L + 0.16 * fftconvolve(L, ir)[:N]
R = R + 0.16 * fftconvolve(R, ir[::-1].copy())[:N]

# voiceover, centred and clear: duck everything else under it
L *= 1.7
R *= 1.7
vo, vsr = sf.read(vo_path)
if vo.ndim > 1:
    vo = vo.mean(axis=1)
vo = resample_poly(vo, SR, vsr)
vo_at = 0.1
i0 = int(vo_at * SR)
duck = np.ones(N)
d0, d1 = i0, i0 + len(vo)
fade = int(0.06 * SR)
duck[d0:d1] = 0.55
duck[d0 - fade:d0] = np.linspace(1, 0.55, fade) if d0 >= fade else duck[d0 - fade:d0]
duck[d1:d1 + fade] = np.linspace(0.55, 1, fade)
L *= duck
R *= duck
L[i0:i0 + len(vo)] += vo * 0.82
R[i0:i0 + len(vo)] += vo * 0.82

mix = np.stack([L, R], axis=1)
mix = np.tanh(mix * 1.1) / np.tanh(1.1)          # gentle limiter
peak = np.abs(mix).max()
mix *= 0.89 / peak
edge = int(0.02 * SR)                             # tiny fades so the loop point never clicks
mix[:edge] *= np.linspace(0.3, 1, edge)[:, None]
mix[-edge:] *= np.linspace(1, 0.3, edge)[:, None]
sf.write(out_path, mix.astype(np.float32), SR, subtype="PCM_16")
print(f"{out_path}: {DUR:.0f} s stereo, peak {20 * np.log10(np.abs(mix).max()):.1f} dBFS")
