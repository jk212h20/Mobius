#!/usr/bin/env python3
"""Generate a more varied Mobius SFX candidate pack.

Still dependency-free/procedural, but intentionally explores different sound
identities instead of one generic beep/noise palette. StableAudio prompting can
replace or augment these slots later; this gives us an immediate wider review set.
"""
from __future__ import annotations
import json, math, random, struct, wave
from pathlib import Path

SR=44100; TAU=math.tau
ROOT=Path(__file__).resolve().parent
OUT=ROOT/'assets'/'audio'/'candidates'/'mobius_variety_v2'
random.seed(7331)

def clamp(x,a=-1,b=1): return max(a,min(b,x))
def sine(f,t,ph=0): return math.sin(TAU*f*t+ph)
def tri(f,t): return 2/math.pi*math.asin(math.sin(TAU*f*t))
def saw(f,t): return 2*((f*t)%1)-1
def sqr(f,t): return 1 if sine(f,t)>=0 else -1
def smooth(x): x=clamp(x,0,1); return x*x*(3-2*x)
def env(t,d,a=.01,r=.12,hold=.0):
    if t<a: return t/max(a,1e-6)
    if t>d-r: return max(0,(d-t)/max(r,1e-6))
    return 1.0 if hold<=0 else hold+(1-hold)*math.exp(-(t-a)*6)
def pan(x,p):
    p=clamp(p,-1,1); return x*math.sqrt((1-p)*.5), x*math.sqrt((1+p)*.5)
def nse(): return random.random()*2-1
class Brown:
    def __init__(self,k=.08): self.x=0; self.k=k
    def __call__(self): self.x=self.x*(1-self.k)+nse()*self.k; return self.x
class Crackle:
    def __call__(self): return nse() if random.random()<.025 else 0

def write(path,frames,gain=.86):
    path.parent.mkdir(parents=True,exist_ok=True)
    peak=max(1e-9,max(abs(v) for fr in frames for v in fr)); scale=min(gain/peak,1.5)
    with wave.open(str(path),'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        data=bytearray()
        for l,r in frames:
            data += struct.pack('<hh', int(clamp(l*scale)*32767), int(clamp(r*scale)*32767))
        w.writeframes(data)
def render(d,fn):
    return [fn(i/SR,i,int(d*SR)) for i in range(int(d*SR))]
def chirp(f0,f1,t,d,curve=1.0):
    u=(t/max(d,1e-6))**curve; f=f0+(f1-f0)*u
    return sine(f,t)
def fm(car,mod,idx,t): return sine(car+mod*sine(mod,t)*idx,t)
def ring(a,b,t): return sine(a,t)*sine(b,t)
def shimmer(t,base=1800): return sine(base,t)*.18+sine(base*1.37,t)*.1+sine(base*2.11,t)*.06

def one_shot(slot,style):
    b=Brown(.11); c=Crackle()
    if slot=='boost_hit':
        if style=='clean arcade launch': d=.62; fn=lambda t,i,n: pan(env(t,d,.008,.16)*(.55*chirp(420,1900,t,d,.65)+.25*tri(860+900*t/d,t)+.22*shimmer(t,2200))+b()*math.sin(math.pi*t/d)*.18,.05)
        elif style=='magnetic rail slingshot': d=.9; fn=lambda t,i,n: pan(env(t,d,.025,.24)*(.48*fm(180+520*t/d,74,3.2,t)+.28*chirp(260,1250,t,d)+.32*b()*smooth(t/d)),-.18)
        elif style=='glass prism boost': d=.78; fn=lambda t,i,n: pan(env(t,d,.012,.26)*(.35*chirp(720,2600,t,d,.5)+.22*sine(1450,t)+.22*sine(2175,t)+.18*sine(3260,t)),.22)
        elif style=='deep gravity kick': d=.72; fn=lambda t,i,n: pan(env(t,d,.004,.22)*(.55*chirp(95,52,t,d)+.35*chirp(380,1180,t,d)+.28*b()),0)
        elif style=='quantum zipper': d=.55; fn=lambda t,i,n: pan(env(t,d,.006,.14)*(.35*sqr(38+90*t/d,t)*sine(1700+700*t/d,t)+.35*chirp(1100,3800,t,d)+.2*c()),.12)
    elif slot=='mud_hit':
        if style=='viscous magnetic tar': d=.82; fn=lambda t,i,n: pan(env(t,d,.006,.28)*(.55*chirp(190,42,t,d)+.55*b()+.18*saw(36,t)),0)
        elif style=='brownout power sag': d=.7; fn=lambda t,i,n: pan(env(t,d,.02,.25)*(.5*fm(140,31,5,t)+.35*chirp(520,110,t,d)+.18*b()),-.1)
        elif style=='rubber belt drag': d=.64; fn=lambda t,i,n: pan(env(t,d,.004,.2)*(.42*saw(66,t)+.25*sqr(12,t)*b()+.25*chirp(260,80,t,d)),.1)
        elif style=='negative pickup': d=.58; fn=lambda t,i,n: pan(env(t,d,.008,.16)*(.4*chirp(800,120,t,d,.7)+.25*ring(190,53,t)+.18*b()),0)
        elif style=='muddy glitch stutter': d=.76; fn=lambda t,i,n: pan(env(t,d,.005,.25)*(.36*b()+.28*sqr(18+12*t,t)*sine(120,t)+.18*c()),-.2)
    elif slot=='hazard_hit':
        if style=='electric snap thud': d=.86; fn=lambda t,i,n: pan(math.exp(-t*8)*(b()*.8+sine(2600,t)*.25)+env(t,d,.001,.32)*chirp(130,54,t,d)*.55,.0)
        elif style=='red field overload': d=1.05; fn=lambda t,i,n: pan(env(t,d,.006,.35)*(.42*fm(220,87,7,t)+.35*b()+.18*sqr(9,t)*sine(900,t)),.15)
        elif style=='glass crack zap': d=.74; fn=lambda t,i,n: pan(math.exp(-t*18)*(c()*1.2+b()*.5+sine(4100,t)*.22)+env(t,d,.01,.18)*sine(330,t)*.22,-.18)
        elif style=='warning klaxon bite': d=.95; fn=lambda t,i,n: pan(env(t,d,.01,.25)*(.32*sqr(210,t)+.28*sine(420+60*sine(8,t),t)+.42*b()*math.exp(-t*1.5)),0)
        elif style=='unstable singularity': d=1.1; fn=lambda t,i,n: pan(env(t,d,.02,.42)*(.42*chirp(70,28,t,d)+.24*fm(600,33,11,t)+.34*b()),.05)
    elif slot=='rail_bump':
        if style=='white ceramic tick': d=.18; fn=lambda t,i,n: pan(math.exp(-t*55)*(sine(1500,t)*.5+sine(3200,t)*.35+c()*.5),-.3)
        elif style=='heavy magnet clank': d=.3; fn=lambda t,i,n: pan(math.exp(-t*24)*(sine(115,t)*.8+sine(620,t)*.28+b()*.25),.25)
        elif style=='spark kiss': d=.22; fn=lambda t,i,n: pan(math.exp(-t*35)*(b()*.55+sine(4200,t)*.18+c()),.35)
        elif style=='rubberized bumper': d=.26; fn=lambda t,i,n: pan(math.exp(-t*20)*(chirp(160,70,t,d)*.6+b()*.2),-.15)
        elif style=='rail chirp': d=.2; fn=lambda t,i,n: pan(env(t,d,.002,.12)*(chirp(900,2100,t,d)*.4+sine(110,t)*.18),0)
    elif slot=='coin_pickup':
        notes=[523,659,784,988,1175]
        idx=['tiny bell','two note chip','glass coin','soft success','alien token'].index(style)
        d=[.32,.38,.44,.48,.42][idx]; base=notes[idx]
        fn=lambda t,i,n: pan(env(t,d,.004,.14)*(.46*tri(base if t<d*.42 else base*1.5,t)+.18*sine(base*2.01,t)+.1*sine(base*3.02,t)),0)
    elif slot=='lap_complete':
        idx=['bright arpeggio','deep heroic','glass cascade','arcade flourish'].index(style); d=[1.45,1.7,1.9,1.25][idx]
        seqs=[[523,659,784,1047,1319],[196,294,392,587,784],[740,988,1245,1480,1976],[440,554,659,880]]; seq=seqs[idx]
        def fn(t,i,n):
            x=0
            for j,f in enumerate(seq):
                st=j*(.17 if idx!=3 else .13)
                if st<=t<=st+.7:
                    tt=t-st; x+=env(tt,.7,.006,.24)*(.38*tri(f,tt)+.12*sine(f*2,tt))
            return pan(x, math.sin(t*2)*.12)
    return d, fn

def loop(slot,style):
    b=Brown(.05)
    if slot=='engine_low_loop':
        base={'warm mag hum':46,'gritty rotor':58,'liquid transformer':52,'subway levitator':64,'alien purr':41}[style]; d=4
        fn=lambda t,i,n: pan((math.sin(math.pi*t/d)**.12)*(.46*sine(base*(1+.01*sine(.4,t)),t)+.22*sine(base*2.02,t)+.16*tri(base*.5,t)+(.1*b() if 'gritty' in style or 'subway' in style else .03*b())),0)
    elif slot=='engine_high_loop':
        base={'clean turbine whine':260,'glass resonance':430,'nervous inverter':310,'air blade':520,'thin neon motor':370}[style]; d=4
        fn=lambda t,i,n: pan((math.sin(math.pi*t/d)**.16)*(.32*sine(base*(1+.012*sine(.7,t)),t)+.14*saw(base*1.51,t)+.1*sine(base*2.7,t)+.06*b()),0)
    elif slot=='turn_air_loop':
        d=3; centers={'soft lateral air':900,'servo strain':520,'space wind':1350,'tireless drift':720,'glass edge hiss':1900}; cen=centers[style]
        fn=lambda t,i,n: pan((math.sin(math.pi*t/d)**.22)*(.38*b()+.06*sine(cen+80*sine(.8,t),t)+.04*saw(cen*.5,t)), math.sin(TAU*t/d)*.35)
    elif slot=='brake_loop':
        d=2.4; centers={'magnetic sandpaper':520,'low regen brake':180,'bright eddy current':1050,'rubber hiss':650,'energy clamp':380}; cen=centers[style]
        fn=lambda t,i,n: pan((math.sin(math.pi*t/d)**.2)*(.52*b()+.16*saw(cen*.25,t)+.09*sine(cen,t)+.08*sqr(18,t)*b()),0)
    elif slot=='rail_scrape_loop':
        d=2.2; centers={'ceramic rail scrape':2400,'dirty spark rail':3200,'low guardrail grind':700,'laser fence rub':4200,'magnetic chatter':1600}; cen=centers[style]
        fn=lambda t,i,n: pan((math.sin(math.pi*t/d)**.2)*(.58*b()+.12*sine(cen,t)+.08*saw(cen*.09,t))*(.65+.35*sine(13,t)), {'ceramic rail scrape':-.2,'dirty spark rail':.22,'low guardrail grind':0,'laser fence rub':.35,'magnetic chatter':-.35}[style])
    elif slot=='music_loop':
        d=32; roots={'minimal topology pulse':55,'dark magnetwave':49,'glass arps':65.41}; root=roots[style]; scale=[0,3,5,7,10,12,15,17]
        def fn(t,i,n):
            beat=124/60; step=int(t*beat*(2 if style!='dark magnetwave' else 1.5))%len(scale); f=root*2**(scale[step]/12)
            gate=1 if (t*beat*2)%1<(.35 if style!='dark magnetwave' else .55) else .25
            bass=sine(root,t)*(.14 if style!='glass arps' else .08)*(0.6+0.4*sine(.08,t))
            arp=(tri(f*4,t)*.08+sine(f*8,t)*.03)*gate
            pad=(sine(root*2,t)*.05+sine(root*3.01,t)*.035)*(0.6+0.4*sine(.05,t))
            kick=math.exp(-((t*beat)%1)*18)*sine(55,t)*(.14 if style!='glass arps' else .05)
            return pan(bass+arp+pad+kick, math.sin(.11*t)*.2)
    return d, fn

SLOTS={
'boost_hit':['clean arcade launch','magnetic rail slingshot','glass prism boost','deep gravity kick','quantum zipper'],
'mud_hit':['viscous magnetic tar','brownout power sag','rubber belt drag','negative pickup','muddy glitch stutter'],
'hazard_hit':['electric snap thud','red field overload','glass crack zap','warning klaxon bite','unstable singularity'],
'rail_bump':['white ceramic tick','heavy magnet clank','spark kiss','rubberized bumper','rail chirp'],
'coin_pickup':['tiny bell','two note chip','glass coin','soft success','alien token'],
'lap_complete':['bright arpeggio','deep heroic','glass cascade','arcade flourish'],
'engine_low_loop':['warm mag hum','gritty rotor','liquid transformer','subway levitator','alien purr'],
'engine_high_loop':['clean turbine whine','glass resonance','nervous inverter','air blade','thin neon motor'],
'turn_air_loop':['soft lateral air','servo strain','space wind','tireless drift','glass edge hiss'],
'brake_loop':['magnetic sandpaper','low regen brake','bright eddy current','rubber hiss','energy clamp'],
'rail_scrape_loop':['ceramic rail scrape','dirty spark rail','low guardrail grind','laser fence rub','magnetic chatter'],
'music_loop':['minimal topology pulse','dark magnetwave','glass arps'],
}
DESC={
'boost_hit':'Speedup pad trigger; should feel like a magnetic launch, not just a beep.',
'mud_hit':'Slowdown pad; sticky drag, power sag, or negative pickup.',
'hazard_hit':'Penalty hazard; dangerous electric/magnetic failure.',
'rail_bump':'Initial rail/edge impact, short and readable.',
'coin_pickup':'Coin collection cue, bright but not childish.',
'lap_complete':'Completion stinger for all coins / lap success.',
'engine_low_loop':'Low speed-scaled hover/magnetic motor layer.',
'engine_high_loop':'High-speed whine layer.',
'turn_air_loop':'Subtle loop for steering/lateral drift.',
'brake_loop':'Loop for magnetic braking / reverse thrust.',
'rail_scrape_loop':'Continuous rail contact scrape loop.',
'music_loop':'Background music bed; placeholder short loop candidates.',
}

def main():
    OUT.mkdir(parents=True,exist_ok=True); items=[]
    for slot,styles in SLOTS.items():
        for i,style in enumerate(styles,1):
            d,fn=(loop(slot,style) if slot.endswith('_loop') else one_shot(slot,style))
            name=f'{slot}__{i:02d}__{style.replace(" ","_")}.wav'
            write(OUT/name, render(d,fn), .62 if slot=='music_loop' else .88)
            items.append({'id':f'{slot}__{i:02d}','slot':slot,'variant':i,'style':style,'kind':'loop' if slot.endswith('_loop') else 'one-shot','description':DESC[slot]+' Style: '+style+'.','duration_seconds':round(d,2),'path':str((OUT/name).relative_to(ROOT)),'status':'candidate','source':'procedural_variety_v2'})
    manifest={'batch':'mobius_variety_v2','note':'Wider procedural variety after v1 sounded too generic. StableAudio prompt matrix is separate.','items':items}
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2))
    (ROOT/'assets'/'audio'/'review_manifest.json').write_text(json.dumps(manifest,indent=2))
    print(f'generated {len(items)} candidates in {OUT}')
if __name__=='__main__': main()
