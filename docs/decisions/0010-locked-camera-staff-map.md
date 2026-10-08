---
status: accepted
date: 2026-10-08
---

# 0010 A locked camera with a short zoom; the far zoom is the staff map

## Context

A strategic 3D zoom (Supreme Commander) would require terrain LOD and streaming and turns soldiers into dots.

## Decision

We will keep the 3D camera locked down (short zoom, pitch from zoom, yaw ±45°, ground-plane pan). Past the 3D range the view turns into the drawn staff map (`mapness`).

## Consequences

No distance LOD or streaming ever; uniform terrain chunks are enough at any map size.

## Alternatives considered

Strategic 3D zoom; a free orbit camera.

See: `docs/proposals/engine-design.md` §5, `docs/proposals/staff-map/design.md`.
