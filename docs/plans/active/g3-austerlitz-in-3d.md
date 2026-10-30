---
status: active
last_reviewed: 2026-10-30
---

# Plan: G3, the whole of Austerlitz in 3D

Track G (`docs/plans/active/track-g.md`), on `epic/gameplay-map`, after G1 (Austerlitz at 3 km) and G2 (the lit
staff map). It takes over the look plan's stage B (`docs/plans/active/look-austerlitz.md`), which was sized for 6 km;
at 3 km it is a quarter of that. This is the track's outline for G3; each sub-phase gets its own plan when it starts.

## Problem

The look page draws one window of Austerlitz: an 800 m tile in detail at 1.79 m cells, a far ring of 2.6 km at
14.3 m, the camera's focus held within ±235 m (A1, A1b). A match needs the whole 3 km map in 3D: the camera anywhere
over the play area, the detail always under it, past the map's edge paper (the owner's choice, track-g.md).

What a window costs today (measured, `look-austerlitz-a1.md`, the dev Mac): the look data built offline in 7.6 s
(716 MB peak) for one window; on the page 277 MB of textures; the bakes about 141 MB of it, the sun's shadow map
about 136 MB more. Holding the whole map at that detail is out: the light map alone would be about 23,000² texels
over 6 km (the look plan's arithmetic), about 5,800² over 3 km at 0.52 m, 135 MB raw (an estimate, RGBA8).

What the camera sees (the look plan, from the camera's limits): at its widest about 600 m across at the top of the
frame and 410 m deep, 0.46 % of a 6 km map, about 2 % of 3 km. The fine light matters only within about 150 m of the
focus; the light-resolution test (2026-10-29) settled 0.5 m near the camera and 2 m for the rest.

## Approach

**Tiles of 400 m** (decided in the look plan's outline; 3 km is 7.5 tiles a side, so 8 × 8 with the last half
outside the map, under paper). Around the focus a 3 × 3 block is drawn in detail (1200 m: the widest view and
400 m beyond the focus every way); a 5 × 5 ring is prepared ahead on the CPU. **The far ring becomes the whole map**
at 16 m (188 × 188 nodes, about 70,000 triangles), and past its edge the paper.

**Data: CPU parts per tile at build time, GPU parts per tile at run time.**
- Per tile, built in Node from the map's files (the heights, the cover, the roads, the water data, the yards and
  buildings, the trees): the look compiler's window build, cut to 400 m, written as tile files. Built locally and in
  CI, not committed (an owner question, below).
- Per tile, baked on the GPU as a tile comes in, one bake a frame: the fine light (0.5 m, decision 0082), the bounce,
  the macro colour, the buildings' light, the water's bank normals.
- For the whole map, baked once at build time at 2 m: the terrain's sun shadow and the sky's occlusion (G2's
  `bakeLight` already does both, on the staff map's sun, which is the 3D world's), the macro colour's far level.

**The static light invariant** (AGENTS.md: "static light is baked once per map") becomes, as the look plan proposed:
"static light is never computed per frame: baked once per map and sun, coarse for the whole map, fine lazily around
the camera, deterministically; only moving things get per-frame lighting". A decision record with G3a.

## Sub-phases (each its own plan and PR or PRs)

| | What | Acceptance |
|---|---|---|
| **G3a** | **The whole map as the far ring, the camera free over it.** The far ring built from the whole map at 16 m with the 2 m coarse light and macro colour, paper past the map's edge, the camera's focus clamped to the map's play area (±1500 m), the detailed tile still one fixed window. The decision record for the static light. | Pan from edge to edge on `?map=austerlitz`: the coarse map everywhere, the window's detail where it is; no error; the frame measured at the widest zoom over the far ring |
| **G3b** | **Tiles: the detail follows the camera.** The look data cut into 400 m tiles built offline; the page keeps a 3 × 3 block in detail around the focus and swaps tiles as it moves, a tile's CPU data loaded ahead from a 5 × 5 ring; every constant the spec holds per tile (the heightfield, the cover, the roads grid, the masks, the shadow box) moved from the one tile to the block. | Austerlitz in detail anywhere; no seam between tiles (the apron's contract carried to tile edges); a tile's pixels the same whichever way it was reached (golden shots from two paths) |
| **G3c** | **The bakes per tile at run time.** The fine light, bounce, macro colour, banks and buildings' light baked as a tile comes in, one bake a frame, cached for the 3 × 3 block; handing over to the coarse light within about 100 m of the focus. | No frame over budget while a tile bakes (the bench's `?benchpan`); the same look as today's window at every zoom (the guard) |
| **G3d** | **The world's content over the whole map:** the water (A2's water bodies, the ponds and the Goldbach whole), the buildings and the villages, the trees and woods, per tile. | Every water, village and wood of the map drawn where the camera goes; the look checks pass on three places (Kobelnitz, the Pratzen, Sokolnitz) |
| **G3e** | **The frame across the map:** panning at the widest zoom across Austerlitz, streaming at most about 1 ms a frame. | Measured on the preview build under the bench lock: the frame within budget (8.3 ms at 120 fps, decisions 0036, 0045, 0050; G5 then takes it to 150 fps) |

Order: G3a, then G3b and G3c together or b before c, then G3d, G3e. G3a alone is worth having: the whole field
seen in 3D, coarse, and the camera free over it.

## What it touches

- `src/look/` is Track E's: `spec.ts` (`derive`, the tile and far ring), `world/` (`from-map.ts`, `windows.ts`,
  `data.ts`), `main.ts`, the bakes (`bakes.ts`), the camera (`FocusFollow`). Ten files read `SPEC` or `derive()`.
- `tools/build-look-data.ts` (the windows' builds become the tiles').
- `src/render/lit/bake.ts`: G2's `bakeLight` reused for the 2 m coarse light.
- **Branches in flight on `src/look/`**: the smoke epic (#239: `main.ts`, `smoke.ts`, `units.ts`, `world/armies.ts`),
  `look/cavalry-artillery`, the farmland and gun-smoke tests. Each sub-phase's plan lists them and who rebases.
  Track E's A2 (one water for every world) and A4 (armies on a window) stay Track E's; G3d uses A2.

## Decisions to take

- **The static light invariant** amended (above): with G3a.
- **The tile and its block:** 400 m tiles, 3 × 3 in detail, 5 × 5 prepared: with G3b.

## Risks

- **Seams** between tiles and between the fine and coarse light: the apron's contract today holds at one tile's
  edge; it becomes every tile's.
- **Bake hitches:** a tile's bakes measured today over 800 m (the light map 14 ms, the bounce 7 ms, the buildings'
  light 28–108 ms, `docs/systems/look.md`); a 400 m tile is a quarter of the area. The buildings' light has to be cut
  per building.
- **Memory:** about 10 MB a tile at the targets, about 90 MB for 3 × 3 (the look plan's estimates), against today's
  277 MB for one window: to measure.
- **Track E's work in flight** on the same files: merge conflicts, and the look's goldens and benches move.

## Open questions for the owner

1. **The tile data:** built locally and in CI from the map's files, not committed (about 25–50 MB for 3 km, an
   estimate scaled from the look plan's 50–100 MB for 6 km)? Recommended.
2. **The static light invariant's wording** (above).
3. **G3a first** (the whole map coarse, the detail in one window), or straight to tiles (G3b)? Recommended: G3a first,
   it is visible within a PR or two and settles the far ring, the camera and the coarse light.
