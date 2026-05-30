#!/usr/bin/env python3
"""Generate Mobius speedup/slowdown musical reaction-layer candidates.

The game should play the clean SFX transient immediately, then layer a short
music-matched tail for ~2s. This script uses the deployed music loop plus a
clean hit/noise cue as init_audio for StableAudio, then exports:
- raw StableAudio result
- trimmed 2s layer with the likely baked-in initial hit removed and faded out
- audition mix: music segment + clean deployed SFX + trimmed generated layer
"""
from __future__ import annotations

import argparse
import json
import math
import subprocess
import tempfile
import time
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
import torchaudio
from stable_audio_3 import StableAudioModel

ROOT = Path(__file__).resolve().parents[1]
MOBIUS = Path('/Users/nick/ActiveProjects/Mobius')
OUT_ROOT = MOBIUS / 'assets' / 'audio' / 'candidates'
LOCAL_MODEL_DIR = ROOT / 'untitled folder'

NEGATIVE = (
    'vocals, speech, lyrics, lead melody, full drum loop, silence, clipping, '
    'harsh digital artifacts, dry isolated sound effect, big explosion, siren'
)
SPECS = {
    'boost': {
        'sfx': MOBIUS / 'assets/audio/boost_hit_01.ogg',
        'prompt': (
            'two second musical speed boost reaction layer for a trippy acid house '
            'Mobius strip racing game, matches the input groove and key, shimmering '
            'upward spectral whoosh, acid synth sparkle, sidechained to the beat, '
            'continues after a clean boost hit, no separate loud impact transient'
        ),
        'noise': 'up',
        'gain': 0.72,
    },
    'mud': {
        'sfx': MOBIUS / 'assets/audio/mud_hit_01.ogg',
        'prompt': (
            'two second musical slowdown reaction layer for a trippy acid house '
            'Mobius strip racing game, matches the input groove and key, warm brownout '
            'tape drag, filtered synth sag, downward spectral smear, sidechained to the beat, '
            'continues after a clean slowdown hit, no separate loud impact transient'
        ),
        'noise': 'down',
        'gain': 0.70,
    },
}


def patch_local_model_alias(model_dir: Path):
    import stable_audio_3.model as model_mod

    class LocalModelConfig:
        def resolve(self):
            return str(model_dir / 'model_config.json'), str(model_dir / 'model.safetensors')

    model_mod.all_models['local-small-music'] = LocalModelConfig()


def read_audio(path: Path) -> tuple[int, np.ndarray]:
    try:
        x, sr = sf.read(str(path), always_2d=True, dtype='float32')
        return sr, to_stereo(x.T)
    except Exception:
        with tempfile.NamedTemporaryFile(suffix='.wav') as tmp:
            subprocess.check_call(['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-i', str(path), tmp.name])
            x, sr = sf.read(tmp.name, always_2d=True, dtype='float32')
            return sr, to_stereo(x.T)


def to_stereo(x: np.ndarray) -> np.ndarray:
    x = np.asarray(x, dtype=np.float32)
    if x.ndim == 1:
        x = np.stack([x, x], axis=0)
    if x.shape[0] > 8 and x.shape[-1] <= 8:
        x = x.T
    if x.shape[0] == 1:
        x = np.repeat(x, 2, axis=0)
    return x[:2]


def resample_np(audio: np.ndarray, src_sr: int, dst_sr: int) -> np.ndarray:
    if src_sr == dst_sr:
        return audio.astype(np.float32)
    n_new = int(round(audio.shape[1] * dst_sr / src_sr))
    old = np.linspace(0, audio.shape[1] / src_sr, audio.shape[1], endpoint=False)
    new = np.linspace(0, audio.shape[1] / src_sr, n_new, endpoint=False)
    return np.vstack([np.interp(new, old, ch) for ch in audio]).astype(np.float32)


def loop_segment(audio: np.ndarray, sr: int, start_sec: float, dur_sec: float) -> np.ndarray:
    n = int(round(dur_sec * sr))
    start = int(round(start_sec * sr)) % audio.shape[1]
    idx = (np.arange(n) + start) % audio.shape[1]
    return audio[:, idx].copy()


def shaped_noise(kind: str, sr: int, dur_sec: float) -> np.ndarray:
    n = int(round(dur_sec * sr))
    rng = np.random.default_rng(1234 if kind == 'up' else 5678)
    white = rng.normal(0, 1, n).astype(np.float32)
    # Simple one-pole smoothing so StableAudio gets a cue without a brittle click.
    y = np.empty_like(white)
    prev = 0.0
    for i, v in enumerate(white):
        prev = prev * 0.78 + v * 0.22
        y[i] = prev
    t = np.linspace(0, 1, n, endpoint=False)
    env = np.sin(np.minimum(1, t / 0.18) * math.pi / 2) * np.exp(-t * 4.0)
    sweep = np.sin(2 * math.pi * (180 + (1800 if kind == 'up' else 520) * (t if kind == 'up' else 1 - t)) * np.arange(n) / sr).astype(np.float32)
    out = (y * 0.55 + sweep * 0.45) * env.astype(np.float32)
    out /= max(1e-6, float(np.max(np.abs(out))))
    return np.stack([out, out], axis=0)


def add_at(dst: np.ndarray, src: np.ndarray, gain: float, start: int = 0):
    if start >= dst.shape[1]:
        return
    n = min(src.shape[1], dst.shape[1] - start)
    dst[:, start:start+n] += src[:, :n] * gain


def normalize(x: np.ndarray, peak: float = 0.92) -> np.ndarray:
    m = float(np.max(np.abs(x))) if x.size else 0.0
    if m > peak:
        x = x * (peak / m)
    return x.astype(np.float32)


def save_wav(path: Path, x: np.ndarray, sr: int):
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(path), normalize(x).T, sr, subtype='PCM_16')


def save_tensor_wav(path: Path, audio: torch.Tensor, sr: int):
    x = audio.detach().cpu().float()
    if x.ndim == 3:
        x = x[0]
    if x.ndim == 1:
        x = x.unsqueeze(0)
    if x.shape[0] > 8 and x.shape[-1] <= 8:
        x = x.T
    if x.shape[0] == 1:
        x = x.repeat(2, 1)
    peak = float(x.abs().max()) if x.numel() else 0.0
    if peak > 0.92:
        x = x * (0.92 / peak)
    path.parent.mkdir(parents=True, exist_ok=True)
    torchaudio.save(str(path), x, sr, encoding='PCM_S', bits_per_sample=16)


def trim_layer(raw: np.ndarray, sr: int, trim_sec: float, layer_sec: float) -> np.ndarray:
    start = int(round(trim_sec * sr))
    n = int(round(layer_sec * sr))
    y = np.zeros((2, n), dtype=np.float32)
    if start < raw.shape[1]:
        take = min(n, raw.shape[1] - start)
        y[:, :take] = raw[:, start:start+take]
    fade_in = max(1, int(0.015 * sr))
    fade_out = max(1, int(0.85 * sr))
    y[:, :fade_in] *= np.linspace(0, 1, fade_in, dtype=np.float32)
    y[:, -fade_out:] *= np.linspace(1, 0, fade_out, dtype=np.float32)
    return normalize(y, 0.86)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--batch', default='mobius_reaction_layers_v1')
    ap.add_argument('--model', default='local-small-music')
    ap.add_argument('--offsets', default='0,5,10,15')
    ap.add_argument('--noise-levels', default='0.22,0.34,0.48')
    ap.add_argument('--steps', type=int, default=8)
    ap.add_argument('--cfg', type=float, default=1.0)
    ap.add_argument('--duration', type=float, default=2.7)
    ap.add_argument('--trim', type=float, default=0.18)
    ap.add_argument('--layer-duration', type=float, default=2.0)
    ap.add_argument('--seed', type=int, default=71001)
    ap.add_argument('--kinds', default='boost,mud')
    args = ap.parse_args()

    if args.model == 'local-small-music':
        patch_local_model_alias(LOCAL_MODEL_DIR)

    offsets = [float(x) for x in args.offsets.split(',') if x.strip()]
    noise_levels = [float(x) for x in args.noise_levels.split(',') if x.strip()]
    kinds = [x.strip() for x in args.kinds.split(',') if x.strip()]
    out = OUT_ROOT / args.batch
    out.mkdir(parents=True, exist_ok=True)

    music_sr, music = read_audio(MOBIUS / 'assets/audio/music_loop.ogg')
    print(f'loading StableAudio {args.model}', flush=True)
    t0 = time.time()
    model = StableAudioModel.from_pretrained(args.model, model_half=False)
    sr = int(model.model_config.get('sample_rate', 44100))
    print(f'loaded in {time.time()-t0:.1f}s device={model.device} sr={sr}', flush=True)
    music = resample_np(music, music_sr, sr)

    items = []
    for kind in kinds:
        spec = SPECS[kind]
        sfx_sr, sfx = read_audio(spec['sfx'])
        sfx = resample_np(sfx, sfx_sr, sr)
        cue = shaped_noise(spec['noise'], sr, min(0.9, args.duration))
        for off in offsets:
            base = loop_segment(music, sr, off, args.duration)
            for ni, nl in enumerate(noise_levels):
                init = base.copy() * 0.78
                add_at(init, sfx, spec['gain'], 0)
                add_at(init, cue, 0.24 + 0.08 * ni, 0)
                init = normalize(init, 0.90)
                stem = f'{kind}_layer__music_{off:04.1f}s__noise_{nl:.2f}'.replace('.', 'p')
                print(f'generate {stem}', flush=True)
                result = model.generate(
                    prompt=spec['prompt'],
                    negative_prompt=NEGATIVE,
                    duration=args.duration,
                    steps=args.steps,
                    cfg_scale=args.cfg,
                    seed=args.seed + int(off * 10) + ni * 101 + (0 if kind == 'boost' else 10000),
                    init_audio=(sr, torch.from_numpy(init)),
                    init_noise_level=nl,
                )
                raw_path = out / f'{stem}__raw.wav'
                save_tensor_wav(raw_path, result, sr)
                raw_sr, raw_np = read_audio(raw_path)
                raw_np = resample_np(raw_np, raw_sr, sr)
                layer = trim_layer(raw_np, sr, args.trim, args.layer_duration)
                layer_path = out / f'{stem}__trimmed_layer.wav'
                save_wav(layer_path, layer, sr)
                audition = loop_segment(music, sr, off, args.layer_duration + 0.35) * 0.72
                add_at(audition, sfx, 0.82, 0)
                add_at(audition, layer, 0.72, 0)
                audition_path = out / f'{stem}__audition_mix.wav'
                save_wav(audition_path, audition, sr)
                items.append({
                    'id': stem,
                    'slot': f'{kind}_reaction_layer',
                    'variant': len(items) + 1,
                    'style': f'{kind} musical reaction layer, music phase {off:.1f}s, init_noise_level {nl:.2f}',
                    'kind': 'one_shot_layer_audition',
                    'description': 'Audition mix contains base music + clean deployed hit + generated trimmed 2s layer. Runtime should play the clean hit separately and only the trimmed layer as an overlay.',
                    'duration_seconds': round(args.layer_duration + 0.35, 2),
                    'path': str(audition_path.relative_to(MOBIUS)),
                    'layer_path': str(layer_path.relative_to(MOBIUS)),
                    'raw_path': str(raw_path.relative_to(MOBIUS)),
                    'music_offset_seconds': off,
                    'init_noise_level': nl,
                    'trim_seconds': args.trim,
                    'source': f'stable_audio_3:{args.model} init_audio from deployed music_loop + clean {kind} hit + shaped noise',
                    'seed': args.seed,
                    'steps': args.steps,
                    'cfg': args.cfg,
                    'status': 'candidate',
                })
                (out / 'manifest.json').write_text(json.dumps({'batch': args.batch, 'note': 'Mobius musical reaction-layer candidates. Listen to audition_mix paths; layer_path is the clean deployable overlay with the initial generated transient trimmed away.', 'items': items}, indent=2))
                (MOBIUS / 'assets/audio/review_manifest.json').write_text((out / 'manifest.json').read_text())
    manifest = {'batch': args.batch, 'note': 'Mobius musical reaction-layer candidates. Listen to audition_mix paths; layer_path is the clean deployable overlay with the initial generated transient trimmed away.', 'items': items}
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=2))
    (MOBIUS / 'assets/audio/review_manifest.json').write_text(json.dumps(manifest, indent=2))
    print(f'wrote {len(items)} candidates to {out}', flush=True)


if __name__ == '__main__':
    main()
