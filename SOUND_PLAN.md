# Mobius Racing Sound Plan

Goal: upgrade Mobius from simple oscillator beeps into a responsive magnetic racer soundscape: engine/drive tone scales with speed, speedups/slowdowns/rails are satisfying, steering/braking have subtle continuous feedback, and background music supports the topology/sci-fi mood without masking gameplay cues.

## 1. Are our StableAudio models good for SFX?

Yes, probably useful for **designed SFX beds and one-shots**, especially if we ask for short, non-vocal, game-ready sounds.

Good candidates for Stable Audio 3 Small Music:

- sci-fi UI pickups
- boost whooshes
- magnetic rail zaps/scrapes
- hazard impacts
- ambient loops
- background music loops/stems
- engine-like drones or hovercraft layers
- brake/turn whoosh textures

Less ideal:

- exact mechanically-loopable engine cycles without manual editing
- ultra-precise synchronized foley
- sounds that must obey exact timing envelopes
- perfectly seamless loops from the first try

Best strategy: use StableAudio to generate **raw source material**, then trim/normalize/loop/QC it. For highly responsive engine/turn/brake sounds, use **Web Audio synthesis plus optional generated texture loops** rather than only fixed samples.

## 2. Sound asset list and target lengths

### Continuous / looped sounds

| Sound | Purpose | Recommended asset length | Runtime behavior |
|---|---|---:|---|
| `music_loop` | background music | 45–90s seamless loop | low volume, sidechain/dip very slightly during impacts |
| `engine_low_loop` | base magnetic motor/hover hum | 2–4s seamless loop | always looping in race mode; volume and playbackRate scale with speed |
| `engine_high_loop` | high-speed whine layer | 2–4s seamless loop | fades in above ~45% speed; pitch rises with speed |
| `turn_air_loop` | subtle lateral whoosh/servo noise | 1–3s seamless loop | fades with steering input and lateralSpeed; pan left/right |
| `brake_loop` | magnetic braking/friction texture | 1–2s seamless loop | fades in while holding down/braking, especially at speed |
| `rail_scrape_loop` | continuous rail contact | 1–2s seamless loop | fades in while scraping wall/rail; pan by side |

### One-shot sounds

| Sound | Purpose | Target length | Notes |
|---|---|---:|---|
| `boost_hit_01..04` | speedup pad trigger | 0.4–0.9s | upward pitch/energy, magnetic launch, not too loud |
| `mud_hit_01..03` | slowdown/mud cell | 0.3–0.8s | dull drag/down-pitch, sticky magnetic resistance |
| `hazard_hit_01..03` | red hazard | 0.4–1.0s | zap + thud, obvious penalty |
| `rail_bump_01..04` | first rail impact | 0.12–0.35s | short clank/zap; currently `bumperSound()` |
| `coin_pickup_01..06` | coin collect | 0.15–0.45s | bright, tonal, can vary by pitch in code |
| `lap_complete` | all coins / lap complete | 1.0–2.2s | celebratory arpeggio/stinger |
| `start_race` | race mode entered | 0.5–1.2s | power-up / ready sound |

## 3. Prompt recipes for StableAudio

Generate multiple variants per sound, short duration, then QC/filter.

### Boost

Duration: 1–2s, trim to 0.4–0.9s.

Prompt:

> short futuristic magnetic racing game boost pickup sound, clean sci-fi whoosh, upward pitch sweep, bright electric shimmer, punchy transient, no voice, no music, dry game sound effect

### Slowdown / mud

Duration: 1–2s, trim to 0.3–0.8s.

Prompt:

> short futuristic anti-boost slowdown sound effect, magnetic drag, rubbery low pitch drop, gritty energy drain, dull impact, no voice, no music, dry game sound effect

### Hazard

Duration: 1–2s.

Prompt:

> short sci-fi racing hazard hit sound, electric zap into metallic thud, unstable magnetic field, aggressive but not horror, no voice, no music, dry game sound effect

### Rail bump / wall hit

Duration: 1s.

Prompt:

> very short magnetic rail collision sound, metallic click, electric spark, hard bumper impact, futuristic racing game UI, no voice, no music, dry isolated sound effect

### Rail scrape loop

Duration: 2–4s, loop manually.

Prompt:

> seamless loop of futuristic magnetic rail scraping, high speed hover vehicle grazing an energy rail, controlled electric friction, no impacts, no voice, no music, game ambience loop

### Engine / hover motor layers

Duration: 4–8s, loop manually.

Prompt:

> seamless loop of futuristic magnetic hover racer engine, low electric motor hum, smooth sci-fi propulsion, no melody, no percussion, no voice, clean loopable texture

High layer:

> seamless loop of high speed magnetic racer whine, airy electric turbine, bright speed tone, no melody, no percussion, no voice, clean loopable texture

### Turning / lateral movement

Duration: 2–4s loop.

Prompt:

> seamless loop of subtle sci-fi air whoosh and servo strain for a magnetic racer turning, soft lateral motion texture, no impact, no voice, no music, clean loopable game sound

### Braking

Duration: 2–4s loop.

Prompt:

> seamless loop of magnetic braking sound, futuristic vehicle decelerating, low friction hiss, electric resistance, controlled pitch drop texture, no impact, no voice, no music

### Background music

Duration: 45–90s.

Prompt:

> futuristic topology racing game background music loop, hypnotic electronic pulse, Möbius strip sci-fi mood, driving but not too busy, 128 BPM, clean mix, no vocals

Alternative less rhythmic:

> ambient futuristic racing game music loop, glassy synth arps, magnetic energy, elegant topology puzzle mood, subtle beat, no vocals, seamless loop

## 4. QC rules before using generated sounds

Run each generated batch through an audio QC gate before listening/selection.

Reject:

- near-silence / tiny-volume files
- clipped files
- files with long dead air before the sound
- vocal artifacts for SFX
- music/beat leaking into one-shots
- one-shots with reverb tails too long for gameplay
- loops with obvious attack at the beginning

For one-shots, also inspect/trim:

- transient starts within first 20–80 ms
- tail ends cleanly or fades quickly
- normalized peak around `-3 dBFS` to `-1 dBFS`

For loops:

- no big transient at loop start
- RMS stable over time
- crossfade loop seam, 50–200 ms
- exported as stereo `.ogg` or `.mp3`, plus source `.wav`

## 5. Runtime integration plan

Current Mobius has simple procedural audio in `index.html` around these functions:

- `ensureAudio()`
- `tone()`
- `boostSound()`
- `mudSound()`
- `hazardSound()`
- `bumperSound()`
- `updateEngineSound()`
- `edgeBump()`
- `wallScrape()`
- `updateRaceCamera()`

Recommended upgrade: keep the existing oscillator beeps as fallback, but add an `AudioManager` that loads samples and controls looping layers.

### Asset folder

```text
Mobius/
  assets/
    audio/
      music_loop.ogg
      engine_low_loop.ogg
      engine_high_loop.ogg
      turn_air_loop.ogg
      brake_loop.ogg
      rail_scrape_loop.ogg
      boost_hit_01.ogg
      boost_hit_02.ogg
      mud_hit_01.ogg
      hazard_hit_01.ogg
      rail_bump_01.ogg
      coin_pickup_01.ogg
      lap_complete.ogg
```

Use `.ogg` for browser size/quality; keep `.wav` masters outside the deployed folder if needed.

## 6. Tricky sound behaviors

### A. Engine noise that scales with speed

Use layered continuous loops, not a new sample every frame.

Inputs:

- `speedAmt = abs(race.speed) / MAX_SPEED`, clamped 0–1
- `gas = keys.up`
- `brake = keys.down`
- `boosting = race.boostTimer > 0`

Behavior:

- `engine_low_loop`: always active in race mode; gain `0.05 + speedAmt * 0.18`; playbackRate `0.75 + speedAmt * 0.55`
- `engine_high_loop`: fades in after speedAmt `0.35`; gain `smoothstep(0.35, 1.0, speedAmt) * 0.12`; playbackRate `0.8 + speedAmt * 0.9`
- during boost, temporarily add gain and playbackRate shimmer
- when not in race mode, fade all loops to 0 over ~300 ms

The current oscillator engine can remain underneath as a controllable pitch layer, or be replaced by sample loops once assets are good.

### B. Braking noise

Trigger condition:

```js
const braking = keys.down && Math.abs(race.speed) > MAX_SPEED * 0.08;
```

Behavior:

- fade `brake_loop` in over 80–150 ms while braking
- gain scales with speed: `brakeGain = braking ? 0.02 + speedAmt * 0.16 : 0`
- playbackRate slightly lower at low speed and higher at high speed: `0.85 + speedAmt * 0.5`
- optional pitch dip one-shot when braking first starts, but keep it subtle

Do **not** play repeated brake one-shots every frame. It should be a loop with gain automation.

### C. Turning noise / lateral movement

Inputs:

- steering key input: left/right
- actual `race.lateralSpeed`
- speed amount

Trigger condition:

```js
const steerInput = (keys.left ? 1 : 0) + (keys.right ? -1 : 0);
const lateralAmt = clamp(Math.abs(race.lateralSpeed) / SOME_SIDE_SPEED, 0, 1);
const turnAmt = Math.max(Math.abs(steerInput) * speedAmt, lateralAmt);
```

Behavior:

- fade `turn_air_loop` based on `turnAmt`
- pan left/right based on steering sign or lateral direction
- keep volume low; this is tactile feedback, not an effect
- add mild filter brightness as speed rises

Suggested gain:

```js
turnGain = smoothstep(0.05, 0.65, turnAmt) * 0.08;
```

### D. Rail scrape vs rail bump

There are two different rail sounds:

1. **Initial bump**: short one-shot when entering wall contact.
2. **Continuous scrape**: loop while still rubbing the rail.

Existing logic already distinguishes this:

- `edgeBump()` = initial contact
- `wallScrape()` = continued wall contact

Upgrade:

- `edgeBump()` plays `rail_bump_0N` one-shot.
- `wallScrape()` should not repeatedly play `bumperSound()` every 0.22s. Instead set a state like `audio.railScrapeTarget = ...` and let the audio manager fade a scrape loop.
- pan scrape left/right by `sign`.
- scrape gain scales with speed and contact strength.

Suggested:

```js
railScrapeGain = isScraping ? (0.03 + speedAmt * 0.14) : 0;
railScrapePlaybackRate = 0.8 + speedAmt * 0.7;
```

### E. Boost / mud / hazard one-shots

Use randomized variants to avoid repetition:

```js
playOneShot(randomChoice(boostHits), { gain: 0.8 + Math.random()*0.1 });
```

Behavior:

- Boost: one-shot plus a brief engine high-layer boost.
- Mud: one-shot plus temporary lowpass/filter dulling of engine.
- Hazard: louder one-shot plus very short music duck.

### F. Background music

Start only after first user gesture / race mode due to browser autoplay rules.

Behavior:

- menu/view mode: off or very quiet
- race mode: fade in to `0.15–0.25`
- on hazard/rail impact: duck music by 2–4 dB for 150–300 ms
- do not make music too dense; Mobius needs space for engine cues

## 7. Implementation milestones

### Milestone 1: Add asset-based audio manager

- Add `assets/audio/`.
- Implement sample loading with `fetch -> decodeAudioData`.
- Add `playOneShot(name)`.
- Add looping layer nodes for music, engine, turn, brake, rail scrape.
- Keep procedural `tone()` fallback if samples fail.

### Milestone 2: Procedural continuous controls before final assets

Even before generated files exist, implement the control logic using existing oscillators/noise:

- braking loop using filtered noise
- turning loop using filtered noise + stereo panner
- rail scrape loop using harsher noise
- engine low/high layers

This lets us tune responsiveness before committing to assets.

### Milestone 3: Generate and QC assets

- Generate 8–16 candidates per one-shot category.
- Generate 4–8 candidates per loop category.
- QC for silence/tiny volume/clipping.
- Manually select the best 1–4 variants.
- Trim, normalize, crossfade loops.

### Milestone 4: Integrate selected assets

- Replace or layer over current `boostSound`, `mudSound`, `hazardSound`, `bumperSound`, `coinSound`, `runCompleteSound`.
- Add continuous update call inside `updateEngineSound()` or a new `updateAudio(dt)`.
- Test race mode for fatigue: turning/braking should be felt, not constantly heard.

### Milestone 5: Mix pass

Target rough loudness balance:

- Music: low bed, around 20–30% perceived loudness
- Engine: always readable but not annoying
- Turn/brake: subtle, only obvious when focusing
- Boost/hazard/coin: clear front-of-mix one-shots
- Rail scrape: annoying enough to communicate penalty, not painful

## 8. First recommended action

Do not start by generating a giant sound library. First implement the runtime audio manager and procedural placeholders for engine/brake/turn/rail scrape. Then generate assets against the exact slots we know we need.

The highest-impact first sounds are:

1. `engine_low_loop`
2. `engine_high_loop`
3. `boost_hit`
4. `rail_bump`
5. `brake_loop`
6. `turn_air_loop`
7. `music_loop`

## 9. Implemented procedural placeholder layer

The first runtime pass is now in `index.html`:

- layered engine oscillator with low and high-speed whine
- filtered-noise braking loop controlled by down arrow + speed
- filtered-noise turning loop controlled by steering/lateral movement, with panning
- filtered-noise rail scrape loop controlled by continued wall contact
- enhanced procedural boost/mud/hazard/rail bump one-shots
- quiet placeholder background drone in race mode
- optional sample asset slots under `assets/audio/`; generated `.ogg` files with the documented names will be used automatically when present, otherwise procedural fallback plays

This means gameplay responsiveness can be tuned before committing generated assets.
