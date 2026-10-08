---
status: accepted
date: 2026-10-08
---

# 0011 Play area 1–1.5 km; min-spec an RTX 3060 laptop

## Context

Budgets (bake memory, frame time, triangles) need fixed targets.

## Decision

We will target a play area of 1–1.5 km and a gaming laptop with an RTX 3060 (6 GB VRAM) at 1080p and 60 fps.

## Consequences

Bakes stay single textures (≤ 600 MB resident); the dev Macs are only a conservative proxy until a 3060 laptop is measured.

## Alternatives considered

Mid-range laptops (Iris Xe class).

See: `docs/proposals/engine-design.md` §2.
