---
status: accepted
date: 2026-10-08
---

# 0001 The painterly look lives in assets and materials

## Context

Full-screen painterly filters (Kuwahara, oil-paint style) smear the image, cost GPU time every frame and blur the formations a player must read (`docs/research/cheap-painterly-postfx.md`).

## Decision

We will put the painted look in the assets and materials (ramp shading, world-space grain, painted edges, baked light). Post-processing is at most a light finishing pass.

## Consequences

Every material needs care; but the look holds at any resolution and costs little per frame.

## Alternatives considered

Kuwahara/oil filters; toon outlines only.

See: `docs/art-bible.md` §1.4.
