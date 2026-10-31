---
status: active
last_reviewed: 2026-10-31
---

# Plan: G3c, a tile's move without the long frame

Track G (`docs/plans/active/track-g.md`), the third sub-phase of G3 (`docs/plans/active/g3-austerlitz-in-3d.md`), on
`epic/gameplay-map`, after G3b (`docs/plans/done/g3b-the-detail-follows.md`: the tile follows the camera, #297,
#300, #302).

## Problem

A tile's move (`retile`, decision 0096: built beside, then swapped) runs on the page's thread in one task: 0.61–0.77 s
on the dev Mac's GPU (Metal), measured by part over three moves (Kobelnitz, (0, 0) and (400, 0)):

| Part | ms |
|---|---|
| the place: the heightfield, the tile's mesh (its heights, normals, bank values), the far ring's hole, the apron, the covers | 127–149 |
| the trees (`buildNature`: the generated models made again, the placement, the instances) | 116–189 |
| the meadow map (its growth on the 2 m grid, the rules, the shrink) | 125–144 |
| the relief's tone over the whole far ring | 92–115 |
| the flow | 52–54 |
| the bakes' CPU side (the occlusion's canvas, the sky's occlusion) | 41–57 |
| the ground's split | 25–35 |
| the colour bake (GPU) | 18–22 |
| the last parts disposed, the swap | 5–9 |

The worker spends 1.2–1.7 s on a tile, off the page's thread, much of it on what the page throws away (the far ring,
its cover, the coarse light, the window's base again).

## Approach

**Most of the move is arithmetic on the new tile's data: the worker does it.** The page keeps what needs the scene.

1. **The worker builds the tile only** (not the far ring, its cover or the light: the page's stay), the window's base
   and the ground's bound once with the map, and with the tile: the tile mesh's heights, normals and bank values; the
   relief's tone where it changed (the last and new tiles' squares, padded by the blur); the flow; the ground's split
   by cell; the meadow map's growth and crops (its inputs are the cover and the trees: the tile's data). Sent with the
   tile as transferable arrays.
2. **The page writes them in place** (`updateVerticesData`, `RawTexture.update`, the relief's sub-rectangle), the
   apron's buffers too (their sizes never change).
3. **The trees' generated models made once a page** (the generator's species and variants do not depend on the
   tile), the placement and the instances alone made again.
4. **Measured again by part.** Then, if a part still makes a long frame, the move spread over frames: each part built
   in its own frame beside the last tile (which needs the parts to read the new tile's place from their arguments, not
   from `TILE_O`: decision 0096's consequence), the swap one step.

## Acceptance

- A move's longest frame on the dev Mac's GPU measured before and after (the page's own frame times, `?benchpan` or a
  pan scripted through the follower), each part's time (`__look.moveParts`).
- A move draws as before: a page moved there against one loaded there (the frames identical with the relief's tone
  off, as G3b-2's check).
- The worker's tile's time measured before and after.

## Out of scope

The water, villages and woods past the windows' data (G3d); the frame while panning beyond the move (G3e).

## G3c-1: the move's arithmetic trimmed (built)

- **The relief's tone made again where the ground changed** (`reliefPatch`, `src/look/relief.ts`): over the last and
  new tiles' squares and the blurs' reach past them (46 cells), from heights read another reach past that, written
  into the field's kept bytes; the same tone as the whole field's to a byte (tested). 92–115 ms to 23–35 ms.
- **The worker sends a tile's per-frame cover** (coarsened to the spec's cells) **and its flow's texels**
  (`flowBytes`, `src/look/flow-field.ts`: the field's arithmetic out of `src/look/flow.ts`, no Babylon); the page
  writes the flow's texture in place (its comb is the tile's never: not made again) and takes the cover as it is. The
  tools' `retile` hook (a `--tileat` file, no worker) makes both on the page as before.
- **Each part timed** (`__look.moveParts`).

Measured (the dev Mac, Metal, Kobelnitz):

| | Before G3c | G3c-1 |
|---|---|---|
| a move followed (the worker's cover and flow) | 0.80–0.93 s | 0.46–0.61 s |
| a move by the hook (the page makes them) | 0.61–0.77 s | 0.53–0.67 s |
| its parts (followed) | | the meadow map 127–153, the trees 115–174, the bakes' CPU side 62–102, the terrain 51–66, the split 31, the relief 30, the colour bake 23 ms |

Next (G3c-2): the meadow map's arithmetic in the worker (its growth and crops read the tile's cover alone on a map
world), the trees' generated models made once a page, the ground's split by cell and the tile mesh's heights and
normals from the worker.
