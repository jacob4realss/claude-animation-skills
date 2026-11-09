#!/usr/bin/env python3
"""Opening voiceover with Kokoro (am_michael), on this computer. No cloud TTS.

    python make_vo.py <kokoro-v1.0.onnx> <voices-v1.0.bin> <out.wav>
"""
import sys

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

model, voices, out = sys.argv[1:4]
k = Kokoro(model, voices)
audio, sr = k.create("Guess what's frozen inside.", voice="am_michael", speed=1.08, lang="en-us")
audio = np.asarray(audio, dtype=np.float32)
nz = np.flatnonzero(np.abs(audio) > 0.01)            # trim leading and trailing silence
audio = audio[max(0, nz[0] - int(0.02 * sr)): nz[-1] + int(0.08 * sr)]
audio = audio / (np.abs(audio).max() + 1e-9) * 0.89
sf.write(out, audio, sr)
print(f"{out}: {len(audio) / sr:.2f} s at {sr} Hz")
