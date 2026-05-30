# Mobius audio assets

Runtime audio now has procedural placeholders, so the game works before generated assets exist.

Future generated/edited assets should use these slot names:

- `music_loop.ogg` — 45–90s background loop
- `turn_air_loop.ogg` — 1–3s steering/lateral motion loop
- `brake_loop.ogg` — 1–2s magnetic braking loop
- `rail_scrape_loop.ogg` — 1–2s rail scrape loop
- `boost_hit_01.ogg`, `boost_hit_02.ogg` — 0.4–0.9s boost one-shots
- `mud_hit_01.ogg` — 0.3–0.8s slowdown one-shot
- `hazard_hit_01.ogg` — 0.4–1.0s hazard one-shot
- `rail_bump_01.ogg` — 0.12–0.35s rail bump one-shot
- `coin_pickup_01.ogg` — 0.15–0.45s pickup one-shot
- `lap_complete.ogg` — 1.0–2.2s completion stinger

Current direction: no engine loop/no constant motor drone. Background music fades up modestly with speed; boost, mud/slowdown, rail bump, rail scrape, braking, coin, and lap cues sit above it.

Keep uncompressed WAV masters outside this deployed folder if size matters.
