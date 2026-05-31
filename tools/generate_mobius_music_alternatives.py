#!/usr/bin/env python3
"""Generate 5 alternate Mobius racing music loops similar to the current track.

Uses the deployed music_loop as init_audio/style anchor and StableAudio local model.
Outputs WAV candidates plus OGG/MP3 previews and a review_manifest.json for audio_review.html.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import time
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
import torchaudio
from stable_audio_3 import StableAudioModel

MOBIUS = Path('/Users/nick/ActiveProjects/Mobius')
STABLE_ROOT = Path('/Users/nick/ActiveProjects/StableAudio')
OUT_ROOT = MOBIUS / 'assets' / 'audio' / 'candidates'
LOCAL_MODEL_DIR = STABLE_ROOT / 'untitled folder'

NEGATIVE = (
    'vocals, speech, lyrics, singing, famous song, copyright, harsh noise, clipping, '
    'silence, dubstep wobble, orchestral, rock guitars, excessive cymbals, annoying siren'
)
SIMILAR_PROMPTS = [
    ('neon_acid_pursuit', 'same vibe as the reference loop: trippy instrumental racing house loop, 124 BPM, acid bassline, hypnotic arpeggios, clean four on the floor drive, neon Mobius strip racing energy, game-ready mix, no vocals'),
    ('glass_tunnel_groove', 'similar to the reference loop: psychedelic instrumental house racing music, 124 BPM, glassy synth stabs, rubbery bass, tight kick, light percussion, futuristic tunnel motion, loopable, no vocals'),
    ('magnetic_filter_run', 'similar but different from the reference loop: instrumental filter house loop for anti-gravity racing, 124 BPM, magnetic pulsing bass, shimmering topology synths, sidechained pads, clean minimal arrangement, no vocals'),
    ('folded_acid_night', 'same family as the reference loop: dark neon acid house racing loop, 124 BPM, rolling bassline, folded Mobius arps, crisp hats, psychedelic but not cluttered, seamless game music, no vocals'),
    ('chromatic_drift_house', 'similar to the current Mobius racing music: instrumental chromatic deep acid house loop, 124 BPM, driving groove, warm sub, sparkling synth echoes, racing momentum, loopable, no vocals'),
]
DIVERSE_PROMPTS = [
    ('acid_rail_chase', 'distinct acid techno racing loop, 126 BPM, squelchy 303 bassline, sharp electronic drums, tense anti-gravity chase energy, sparse hypnotic hooks, loopable game music, instrumental, no vocals'),
    ('synthwave_night_drive', 'distinct neon synthwave racing loop, 122 BPM, retro analog bass, bright arpeggiated lead, gated pads, punchy electronic drums, cinematic night highway momentum, loopable, instrumental, no vocals'),
    ('breakbeat_gravity_flip', 'distinct futuristic breakbeat racing loop, 132 BPM, syncopated drums, deep sub bass, chopped glassy synth stabs, fast topology tunnel motion, clean game-ready mix, loopable, instrumental, no vocals'),
    ('minimal_motorik_pulse', 'distinct minimal motorik techno racing loop, 124 BPM, driving pulse bass, ticking percussion, pulsing filter sweeps, sleek mechanical groove, less melodic and more propulsive, loopable, instrumental, no vocals'),
    ('bright_electro_boost', 'distinct bright electro house racing loop, 128 BPM, bouncy bass, sparkling chord hits, energetic handclaps and hats, arcade boost pad feeling, upbeat but not cheesy, loopable, instrumental, no vocals'),
]


def patch_local_model_alias(model_dir: Path):
    import stable_audio_3.model as model_mod
    class LocalModelConfig:
        def resolve(self):
            return str(model_dir / 'model_config.json'), str(model_dir / 'model.safetensors')
    model_mod.all_models['local-small-music'] = LocalModelConfig()


def read_audio(path: Path) -> tuple[int, np.ndarray]:
    x, sr = sf.read(str(path), always_2d=True, dtype='float32')
    x = x.T
    if x.shape[0] == 1:
        x = np.repeat(x, 2, axis=0)
    return sr, x[:2]


def resample_np(audio: np.ndarray, src_sr: int, dst_sr: int) -> np.ndarray:
    if src_sr == dst_sr:
        return audio.astype(np.float32)
    n_new = int(round(audio.shape[1] * dst_sr / src_sr))
    old = np.linspace(0, audio.shape[1] / src_sr, audio.shape[1], endpoint=False)
    new = np.linspace(0, audio.shape[1] / src_sr, n_new, endpoint=False)
    return np.vstack([np.interp(new, old, ch) for ch in audio]).astype(np.float32)


def loop_segment(audio: np.ndarray, sr: int, dur_sec: float) -> np.ndarray:
    n = int(round(dur_sec * sr))
    idx = np.arange(n) % audio.shape[1]
    return audio[:, idx].copy()


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


def encode(src: Path, ogg: Path, mp3: Path):
    subprocess.check_call(['ffmpeg','-y','-hide_banner','-loglevel','error','-i',str(src),'-codec:a','libmp3lame','-q:a','4',str(mp3)])
    try:
        subprocess.check_call(['ffmpeg','-y','-hide_banner','-loglevel','error','-i',str(src),'-c:a','vorbis','-strict','-2','-q:a','5',str(ogg)])
    except subprocess.CalledProcessError:
        if ogg.exists():
            ogg.unlink()
        print(f'warning: ogg encode failed for {src.name}; mp3 preview is available', flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--batch', default='mobius_music_alternatives_v1')
    ap.add_argument('--model', default='local-small-music')
    ap.add_argument('--duration', type=float, default=20.0)
    ap.add_argument('--steps', type=int, default=10)
    ap.add_argument('--cfg', type=float, default=1.05)
    ap.add_argument('--init-noise-level', type=float, default=0.34)
    ap.add_argument('--seed', type=int, default=83001)
    ap.add_argument('--prompt-set', choices=['similar','diverse'], default='similar')
    ap.add_argument('--no-init-audio', action='store_true', help='Generate from text only instead of anchoring to current music_loop.')
    args = ap.parse_args()

    if args.model == 'local-small-music':
        patch_local_model_alias(LOCAL_MODEL_DIR)

    out = OUT_ROOT / args.batch
    out.mkdir(parents=True, exist_ok=True)
    music_sr, music = read_audio(MOBIUS / 'assets/audio/music_loop.ogg')

    print(f'loading StableAudio {args.model}', flush=True)
    t0 = time.time()
    model = StableAudioModel.from_pretrained(args.model, model_half=False)
    sr = int(model.model_config.get('sample_rate', 44100))
    print(f'loaded in {time.time()-t0:.1f}s device={model.device} sr={sr}', flush=True)
    init = None if args.no_init_audio else loop_segment(resample_np(music, music_sr, sr), sr, args.duration) * 0.82
    prompts = DIVERSE_PROMPTS if args.prompt_set == 'diverse' else SIMILAR_PROMPTS

    items = []
    for i, (stem, prompt) in enumerate(prompts, start=1):
        seed = args.seed + i * 137
        print(f'[{i}/5] generating {stem} seed={seed}', flush=True)
        result = model.generate(
            prompt=prompt,
            negative_prompt=NEGATIVE,
            duration=args.duration,
            steps=args.steps,
            cfg_scale=args.cfg,
            seed=seed,
            init_audio=None if init is None else (sr, torch.from_numpy(init)),
            init_noise_level=args.init_noise_level,
        )
        wav = out / f'{i:02d}_{stem}.wav'
        ogg = out / f'{i:02d}_{stem}.ogg'
        mp3 = out / f'{i:02d}_{stem}.mp3'
        save_tensor_wav(wav, result, sr)
        encode(wav, ogg, mp3)
        items.append({
            'id': stem,
            'slot': 'music_loop_alt',
            'variant': i,
            'style': stem.replace('_',' '),
            'kind': 'loop',
            'description': prompt,
            'duration_seconds': args.duration,
            'path': str(ogg.relative_to(MOBIUS)),
            'mp3_path': str(mp3.relative_to(MOBIUS)),
            'wav_path': str(wav.relative_to(MOBIUS)),
            'source': f'stable_audio_3:{args.model} ' + ('text_only' if init is None else 'init_audio=current music_loop'),
            'seed': seed,
            'steps': args.steps,
            'cfg': args.cfg,
            'init_noise_level': None if init is None else args.init_noise_level,
            'status': 'candidate',
        })
        note = 'Five more varied Mobius racing music loops.' if args.prompt_set == 'diverse' else 'Five alternate Mobius racing music loops similar to current music_loop.'
        (out / 'manifest.json').write_text(json.dumps({'batch': args.batch, 'note': note, 'items': items}, indent=2))
        (MOBIUS / 'assets/audio/review_manifest.json').write_text((out / 'manifest.json').read_text())
    print(f'wrote {len(items)} candidates to {out}', flush=True)


if __name__ == '__main__':
    main()
