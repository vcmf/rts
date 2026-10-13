---
status: superseded by 0024
date: 2026-10-08
---

# 0003 No optical blur during gameplay

## Context

Tilt-shift depth of field looks magical in stills but an RTS player reads the whole screen, the camera pans constantly and blur erases the painted grain.

## Decision

We will not use depth of field or other optical blur in gameplay. It is allowed in presentation modes (photo mode, replays, fly-ins) and video export.

## Consequences

Depth must come from painting (haze, cooling, looser brushwork). Gameplay DOF exists only as an off-by-default setting.

## Alternatives considered

Subtle gameplay DOF at close zoom (kept as a fallback if playtests find the view flat).

See: `docs/art-bible.md` §1.6, §6b.
