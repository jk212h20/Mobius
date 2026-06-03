# Klein Geometry Study

Separate prototype: `klein.html`.

This is intentionally **not** a new course in the existing Möbius racer. It is a playable geometry study that keeps the gameplay state on an abstract Klein-bottle manifold and treats the visible 3D scene as a projection of a 4D embedding.

## Surface model

Coordinates:

- `u` = longitudinal/base direction.
- `v` = girth/fiber direction.

Identifications:

```text
(u, v + 2π) ~ (u, v)
(u + 2π, v) ~ (u, -v)
```

The second rule is the Klein-bottle flip. One base circuit moves you to the mirrored fiber coordinate; two base circuits restore the original local orientation.

## 4D embedding

The prototype uses this smooth embedding in R4:

```text
x = (R + r cos v) cos u
y = (R + r cos v) sin u
z = r sin v cos(u/2)
w = r sin v sin(u/2)
```

It is well-defined under `(u + 2π, v) ~ (u, -v)` and has no self-intersection in 4D. The browser view is a 3D projection of this 4D object, so visual overlaps are projection artifacts rather than collision ambiguity.

## Lap / cycle convention

This study exposes both natural counters:

- **Base circuit**: `Δu = 2π`. This is orientation-reversing.
- **Full Klein period**: `Δu = 4π`. This restores orientation.

The aesthetic recommendation is to treat the full period as the clean completion if we want the geometry itself, not arbitrary checkpoints, to define completion.

## Controls

Open with:

```bash
npm start
# visit http://localhost:3000/klein.html
```

Controls:

- Arrow Up / W: accelerate
- Arrow Down / S: brake/reverse
- Arrow Left/Right or A/D: steer in the local tangent frame
- C: toggle chase/orbit camera
- P: cycle projection mode
- R: reset

## Design principle

The car physics never uses mesh triangle collision. It evolves deterministic `(u, v, heading, speed)` state on the manifold. Rendering samples the 4D embedding and projects it to 3D. This keeps the prototype faithful to the geometry instead of compromising it to fit ordinary 3D embedding constraints.
