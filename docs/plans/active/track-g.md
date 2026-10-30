---
status: active
last_reviewed: 2026-10-30
---

# Plan: Track G, the gameplay map

On `epic/gameplay-map`, from `main` after the map engine's merge (#49). Each phase its own PR (or several) into the
epic, each with its own plan when it starts; this plan is the track's outline.

## Problem

The owner (2026-10-30): "time to start a new PR track; this time the goal is to arrive at a true gameplay map: the
draft map at the highest zoom, and after a threshold a 3D map; optimise performance; see how to apply fog of war. It's
a new world."

Today the parts exist apart:
- **The map** in the language (`maps/austerlitz.map.json`, Track M, M1–M8): a 6 km scale model at 2× (decision 0070),
  which decision 0089 (#234) makes **a 3 km map**, a 4× model: at 25 men a figure (0076) the armies hold about 1 km
  of front a side, lost on 6 km.
- **The far view**, the lit staff map (`src/render/lit/`, M6, decision 0058), only on the map page, with its own
  camera; its light is being rebuilt after Track K's campaign map (G2 below, started as "M10a").
- **The 3D world**, the look page (`src/look/`), which draws windows of Austerlitz since A1 and A1b (#259, #260): an
  800 m tile, ±235 m of play, a far ring of ±1300 m (`docs/plans/active/look-austerlitz.md`).
- **The zoom handover** and **fog of war** are sketches: the look plan's stage C and "Later".

**What 3 km changes.** The look plan's stage B was the 3D world across 6 km in tiles: 6–10 PRs (its estimate),
2.1 GB of fine light (its arithmetic). At 3 km the map is a quarter of that, and about the size of today's far ring
(2.6 km): the whole map at 2 m is 1501 × 1501 nodes; its coarse light at 2 m a texel 9 MB (RGBA8, estimate); the fine
light at 0.5 m around the camera as the look plan's test settled (#253, decision 0082). The 3D world may need no
streaming at all, only the whole map as its far ring and a fine area that follows the camera (G3 measures it).

## The phases

| Phase | What | Acceptance |
|---|---|---|
| **G0** | This plan; the epic branch | The owner accepts the outline |
| **G1** | Austerlitz at 3 km: the relief piece at 4× (decision 0089), the M8 tools' inputs (ways, works, villages, ground, labels) scaled and run again, the water and ponds recompiled | The map validates and compiles; the owner's check of the field (M8's, started over) |
| **G2** | The far view lit as a model (decision 0090, proposed): the sun's soft shadow and the sky's occlusion baked, the campaign map's palette, no height exaggeration (the owner, 2026-10-30); the staff map at the 3D world's sun (open question 1) | The owner's eye against K1's print; the bake within budget at 3 km (measured) |
| **G3** | The whole 3 km map in 3D: the far ring becomes the map, the camera's focus clamped to the map's play area, the light coarse for the whole map (2 m, at build time) and fine around the camera (0.5 m, at run time), the cover, roads, villages and water from the look compiler over the whole map, not a window | Austerlitz edge to edge on the look page; no seam where the fine light ends; the frame measured panning across the map at the widest zoom |
| **G4** | One page, one camera: past a zoom threshold (today's widest 3D view, 260 m) the lit map takes over, in the staff map's stages (`docs/proposals/staff-map/design.md` §9): the painted world's far ground fades into the paper, the figures into slabs; below it, the 3D world | Zooming from the whole map to 15 m shows one place with no jump; both renderers' cost across the blend measured |
| **G5** | Performance: 150 fps at 1080p on test machine A at every zoom and across the blend (the owner's target for K1 and the staff map, `perf-150.md`), FSR 1 above 1080p (as K1, decisions 0045, 0059), an fps meter on the page | Measured on the preview build (benches serialised by the bench lock) |
| **G6** | Fog of war: each side sees the ground around its units as far as each sees (the sim's vision); the seen ground in the painted world's colour and light, the rest as the lit map (the owner's idea of 2026-10-28: the paper as the fog), enemy units only where seen, a last-seen ghost where lost. A research note first (how RTS and wargames draw it: Total War, Company of Heroes, Supreme Commander, Scourge of War) | A side's view on Austerlitz with an army moving: what it sees, what it last saw, the frame within budget |

**Order.** G1 and G2 first, side by side (the map, and the far view on it). G3 after G1. G4 after G2 and G3. G5 runs
through every phase (each measures its frame) and closes after G4. G6 after G4 and after vision is a rule in the sim
(Track S; until then a stand-in sight radius per unit, from the page).

## What it takes over

- **The look plan's stages B and C** (`look-austerlitz.md`): B shrinks to G3 at 3 km; C becomes G4. Its stage A
  (A2: one water for every world; A3: the demo as a map file; A4: the armies on a window) stays with Track E: G3 uses
  what A1–A4 build.
- **The map engine's M9** ("the zoom and the sim", `docs/proposals/map-engine.md` §10): its zoom is G4; its "sim on
  the map" is A4 and the sim track's.
- **M6d** (`m6-lit-view.md`: the game's staff map from the lit view): G2 and G4.
- **The look plan's fog of war** ("Later"): G6.
- **"M10a"** (the staff map lit after K1, begun 2026-10-30): becomes G2, on `gmap/g2-staff-light`.

## Decisions to take

- **0090** (G2): the staff map lit as a model under a sun and the sky, with the campaign map's palette; the flat plane
  of decision 0064 stands.
- **The static light** (G3): the look plan's proposed wording, "static light is never computed per frame: baked once
  per map and sun, coarse for the whole map, fine lazily around the camera, deterministically; only moving things get
  per-frame lighting" (AGENTS.md's invariant amended).
- **The zoom threshold and the handover** (G4), superseding the staff map design's stages where they differ.
- **Fog of war** (G6): what is hidden, what is remembered, and how each zoom draws it.

## Risks

- **Two renderers at once** across the blend: the frame is both budgets there (G4, G5).
- **The bake at 3 km:** the lit view's light bake takes 4.7 s at 6 km on every second node (measured, the dev Mac);
  at 3 km about a quarter (estimate). If it is still too slow for the editor's recompiles, it moves offline, as K1's
  did (K3), or to the GPU.
- **Track E's branches** on `src/look/` (the smoke epic, A2–A4): G3 and G4 change the page's world and camera; each
  phase's plan lists the branches in flight, as the look plan does.
- **Vision in the sim** is not there yet: G6 waits for it or uses a stand-in.

## Open questions for the owner

1. **One sun.** The 3D world's sun stands in the north-west, about 27° high (`src/look/materials.ts`); K1's in the
   north-east, 20°, warm. At the handover one light is simplest. Proposed: the world's sun for both, K1's colours.
2. **The threshold**: at the 3D world's widest view (260 m) as today, or higher, so the 3D world is seen wider?
3. **What fog of war hides**: only units (the terrain known, decision 0061's "fog of war on units, the terrain
   known"), or also the ground's detail (the paper idea)?
4. **Austerlitz's border**: what lies past the 3 km map's edge (the `.rdem`'s collar of real ground, or paper)?
