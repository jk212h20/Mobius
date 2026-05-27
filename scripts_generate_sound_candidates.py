#!/usr/bin/env python3
"""Generate a first procedural Mobius sound candidate pack.

This is intentionally dependency-free so we can audition and give feedback before
waiting on StableAudio setup. The files are candidate placeholders/source refs;
selected final assets can later be replaced with StableAudio renders.
"""
from __future__ import annotations

import json, math, random, wave, struct
from pathlib import Path

SR = 44100
ROOT = Path(__file__).resolve().parent
OUT = ROOT / "assets" / "audio" / "candidates" / "mobius_procedural_v1"
TAU = math.tau
random.seed(212)


def clamp(x, a=-1.0, b=1.0): return max(a, min(b, x))
def env_adsr(t, dur, a=.01, d=.04, s=.7, r=.08):
    if t < a: return t / max(a, 1e-6)
    if t < a+d: return 1 - (1-s)*((t-a)/max(d, 1e-6))
    if t > dur-r: return max(0, (dur-t)/max(r, 1e-6))*s
    return s

def write_wav(path: Path, samples, gain=0.9):
    path.parent.mkdir(parents=True, exist_ok=True)
    peak = max(1e-9, max(abs(x) for frame in samples for x in frame))
    scale = min(gain / peak, 1.0)
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        data = bytearray()
        for l, r in samples:
            data += struct.pack('<hh', int(clamp(l*scale)*32767), int(clamp(r*scale)*32767))
        w.writeframes(data)

def render(dur, fn):
    n = int(dur * SR)
    return [fn(i / SR, i, n) for i in range(n)]

def sine(f, t): return math.sin(TAU*f*t)
def tri(f, t): return 2/math.pi * math.asin(math.sin(TAU*f*t))
def saw(f, t): return 2*((f*t) % 1)-1

def chirp(f0, f1, t, dur):
    k = (f1/f0) ** (t/max(dur,1e-6)) if f0 > 0 and f1 > 0 else 1
    # approximate phase by linear freq interpolation for simplicity
    f = f0 + (f1-f0)*(t/max(dur,1e-6))
    return sine(f, t)

def noise(): return random.random()*2-1

def brown_noise_state():
    state = {'x': 0.0}
    def f():
        state['x'] = state['x']*.92 + noise()*.08
        return state['x']
    return f

def stereo(x, pan=0.0):
    pan = clamp(pan, -1, 1)
    l = x * math.sqrt((1-pan)*0.5)
    r = x * math.sqrt((1+pan)*0.5)
    return l, r

def boost(var):
    dur = [0.72, .58, .86][var]
    def fn(t,i,n):
        e = env_adsr(t,dur,.015,.05,.6,.18)
        sweep = chirp(360+var*80, 1450+var*220, t, dur)
        shimmer = sine(1800+900*t/dur, t) * .22 + sine(2700+700*t/dur, t) * .10
        whoosh = brown() * (t/dur) * (1-t/dur) * .65
        x = e*(sweep*.55 + shimmer*.35) + whoosh
        return stereo(x, .08*var-.08)
    brown = brown_noise_state(); return dur, fn

def mud(var):
    dur = [.62,.78,.50][var]; brown=brown_noise_state()
    def fn(t,i,n):
        e = env_adsr(t,dur,.005,.07,.65,.18)
        drop = chirp(160-var*18, 55-var*6, t, dur)
        grit = brown()*.65 + saw(42+var*7,t)*.22
        x = e*(drop*.46 + grit*.54)
        return stereo(x, 0)
    return dur, fn

def hazard(var):
    dur = [.82,.66,.94][var]; brown=brown_noise_state()
    def fn(t,i,n):
        zap_env = math.exp(-t*9)
        thud_env = max(0, 1-abs(t-.16)/.22)
        zap = (brown()*.9 + sine(2200+var*330,t)*.35) * zap_env
        thud = sine(78-var*8,t) * thud_env*.85
        alarm = sine(330+var*45,t) * env_adsr(t,dur,.01,.05,.25,.35)*.25
        return stereo(zap+thud+alarm, (-.25,.2,.0)[var])
    return dur, fn

def rail_bump(var):
    dur = [.22,.18,.30][var]; brown=brown_noise_state()
    def fn(t,i,n):
        click = math.exp(-t*70)*(sine(95,t)*.9 + sine(1300+var*350,t)*.45)
        spark = brown()*math.exp(-t*22)*.55
        return stereo(click+spark, [-.35,.35,0][var])
    return dur, fn

def coin(var):
    dur = [.34,.38,.42][var]
    base = 640 + var*70
    def fn(t,i,n):
        e = env_adsr(t,dur,.006,.03,.42,.12)
        f = base if t < dur*.45 else base*1.5
        x = e*(tri(f,t)*.58 + sine(f*2.01,t)*.18)
        return stereo(x, 0)
    return dur, fn

def lap(var):
    dur = [1.45,1.8][var]
    notes = [523.25,659.25,783.99,1046.5,1318.5] if var == 0 else [392,493.88,587.33,783.99,987.77]
    def fn(t,i,n):
        x=0
        for j,f in enumerate(notes):
            st=j*.18
            if st <= t <= st+.62:
                tt=t-st; x += env_adsr(tt,.62,.01,.06,.4,.25)*(tri(f,tt)*.45+sine(f*2,tt)*.10)
        return stereo(x,0)
    return dur, fn

def engine_low(var):
    dur=4.0
    base=[48,56,64][var]
    def fn(t,i,n):
        seam = math.sin(math.pi*t/dur)**0.15
        wob = 1 + .015*sine(.5,t) + .008*sine(1.7,t)
        x = (sine(base*wob,t)*.55 + sine(base*2.01*wob,t)*.22 + tri(base*.5,t)*.18) * seam
        return stereo(x,0)
    return dur, fn

def engine_high(var):
    dur=4.0
    base=[220,280,340][var]
    def fn(t,i,n):
        seam = math.sin(math.pi*t/dur)**0.18
        x=(sine(base*(1+.01*sine(.7,t)),t)*.38+saw(base*1.5,t)*.12+sine(base*2.02,t)*.12)*seam
        return stereo(x,0)
    return dur, fn

def air_loop(var):
    dur=3.0; brown=brown_noise_state()
    def fn(t,i,n):
        seam=math.sin(math.pi*t/dur)**0.25
        pan=math.sin(TAU*t/dur)*(.25+var*.1)
        x=(brown()*.58 + sine(900+var*240,t)*.035) * seam
        return stereo(x,pan)
    return dur, fn

def brake_loop(var):
    dur=2.2; brown=brown_noise_state()
    def fn(t,i,n):
        seam=math.sin(math.pi*t/dur)**0.22
        x=(brown()*.72 + saw(95+var*22,t)*.11 + sine(410+var*80,t)*.08)*seam
        return stereo(x,0)
    return dur, fn

def scrape_loop(var):
    dur=2.0; brown=brown_noise_state()
    def fn(t,i,n):
        seam=math.sin(math.pi*t/dur)**0.22
        pulse=.55+.45*max(0,sine(12+var*3,t))
        x=(brown()*.82 + sine(2400+var*400,t)*.10 + saw(170+var*30,t)*.10)*pulse*seam
        return stereo(x,[-.2,.2,0][var])
    return dur, fn

def music(var):
    dur=32.0
    scale=[0,3,5,7,10,12,15,17]
    root=[55,65.41][var]
    def fn(t,i,n):
        beat=128/60
        step=int(t*beat*2)%len(scale)
        f=root*2**(scale[step]/12)
        gate=.5+.5*(1 if (t*beat*2)%1 < .42 else 0)
        bass=sine(root,t)*.16*(.55+.45*sine(beat/4,t))
        arp=(tri(f*4,t)*.09+sine(f*8,t)*.035)*gate
        pad=(sine(root*2,t)*.06+sine(root*3,t)*.04)*(0.6+0.4*sine(.07,t))
        kick=math.exp(-((t*beat)%1)*18)*sine(58,t)*.18
        x=bass+arp+pad+kick
        return stereo(x, math.sin(.09*t)*.18)
    return dur, fn

GENERATORS = {
    'boost_hit': (boost, 3, 'one-shot', 'Speedup pad trigger: magnetic upward whoosh.'),
    'mud_hit': (mud, 3, 'one-shot', 'Slowdown pad: low magnetic drag/drop.'),
    'hazard_hit': (hazard, 3, 'one-shot', 'Hazard: zap plus penalty thud.'),
    'rail_bump': (rail_bump, 3, 'one-shot', 'First rail contact impact.'),
    'coin_pickup': (coin, 3, 'one-shot', 'Coin pickup tonal ping.'),
    'lap_complete': (lap, 2, 'one-shot', 'Completion stinger.'),
    'engine_low_loop': (engine_low, 3, 'loop', 'Low speed-scaled magnetic motor layer.'),
    'engine_high_loop': (engine_high, 3, 'loop', 'High speed whine layer.'),
    'turn_air_loop': (air_loop, 3, 'loop', 'Subtle turning/lateral air/servo texture.'),
    'brake_loop': (brake_loop, 3, 'loop', 'Magnetic braking friction texture.'),
    'rail_scrape_loop': (scrape_loop, 3, 'loop', 'Continuous rail scrape texture.'),
    'music_loop': (music, 2, 'loop', 'Background racing music bed, placeholder length 32s.'),
}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    items=[]
    for slot,(gen,count,kind,desc) in GENERATORS.items():
        for v in range(count):
            dur, fn = gen(v)
            samples = render(dur, fn)
            name = f"{slot}__v{v+1:02d}.wav"
            path = OUT / name
            write_wav(path, samples, .88 if slot != 'music_loop' else .65)
            items.append({
                'id': f'{slot}__v{v+1:02d}',
                'slot': slot,
                'variant': v+1,
                'kind': kind,
                'description': desc,
                'duration_seconds': round(dur,2),
                'path': str(path.relative_to(ROOT)),
                'status': 'candidate',
                'source': 'procedural_v1',
            })
    manifest={'batch':'mobius_procedural_v1','created_by':'scripts_generate_sound_candidates.py','items':items}
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2))
    (ROOT/'assets'/'audio'/'review_manifest.json').write_text(json.dumps(manifest,indent=2))
    print(f'generated {len(items)} files in {OUT}') 

if __name__ == '__main__': main()
