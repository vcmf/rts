---
status: done
last_reviewed: 2026-10-30
---

# Plan: A1b, the camera's focus on the ground, and the ground range per world

Step A1b of the Austerlitz look plan (PR #255, its "The steps"), cut from A1's
branch (`docs/plans/active/look-austerlitz-a1.md`) and run beside A1's other PRs (the owner, 2026-10-29). Its showcase:
the Pratzen window, centre (700, 250) in map metres, 36.6 m of relief in play (30.4 to 67.0 m after the rebase) and
68.1 m at the tile's top, which today's camera and `SPEC.ground` (0 to 25 m) refuse.

## Scope

- **In:** the camera's focus (the orbit's target) follows the ground under it on a map world, smoothed in space and
  time; the zoom's hold reads the rise near the focus, not the world's highest point; the ground range, and the camera
  checks sized from it, come from the loaded world's look data, not `SPEC.ground`; the Pratzen in the compiler's
  named windows (`src/look/world/windows.ts`) and its look data.
- **Out:** the armies on the Pratzen (A4); the bench at the window's own cameras (A4); water (A1 PR (c), A2); the
  demo's focus following its ground (below: open question).

## Approach

- **The focus** (`FocusFollow`, `src/look/spec.ts`): each frame before the hold, the target's height eases toward the
  ground under it: the mean of the ground over a small disc round the focus (its radius grows with the zoom, so a
  ditch or a sunken road does not move the camera), clamped to the world's focus range, eased over a quarter second
  (a pan over a ridge does not jolt); a jump (a new view set by a tool, the first frame) is taken at once. The RTS
  camera stays the top-down view (decision 0002), its yaw, pitch and zoom limits unchanged (decision 0010).
- **The demo keeps its focus plane at 8 m** (`SPEC.camera.focusY`): its focus range is [8, 8], so its camera, and its
  goldens, do not move. A3 turns the demo into a map world; whether its focus follows the ground then is the owner's
  (open question).
- **The ground range per world** (`groundOf`): the tile's lowest and highest node, the far ring's lowest, and the focus
  range (a map world's: the lowest and highest ground in play) from the look data at load. The camera checks that
  assumed `SPEC.ground` take the world's ground (`checkView`, at load: the whole frame inside the far ring, no view
  held inside the ground), reckoned with the drop from the focus to the ground (the focus anywhere in its range, the
  ground anywhere in the world's). The frame below the focus row inside the tile is too loose a bound on planes over
  relief (the Pratzen: 205 m against the 165 m margin), so it is marched on each world's own ground in the tests
  (`nearFrameOf`: the frame's lower corners from views on the play area's edge). `derive` keeps the camera's own
  checks on flat ground (the horizon, decision 0002). The focus follows down at once and eases only up, so it is
  never above the ground the march assumes.
- **The zoom's hold** (decision 0051): `clearBelow` from the highest ground within the eye's reach of the focus (a
  max grid of the heightfield) over the focus's own height, not `SPEC.ground.hi` over 8 m. The held radius is the same
  wherever the old bound held (the bound only says where the ground need not be read).
- **What else assumed the plane or the range:** the bench's cameras and pan keep the focus's height (the follow's)
  instead of setting 8 m; the look check (`tools/look-check.js`) checks the drawn ground against the world's range;
  the depth of field already marches the centre ray against the ground; the shadow box and the light map's camera
  are fitted to the data or far above it (checked: no change). The tools that set the demo's cameras at 8 m stay.

## Acceptance

- `?map=austerlitz&window=pratzen` loads on the production build: stills at 20 m on the plateau's top, the default
  and the widest zoom, and a pan from the low ground up onto the plateau (frames), in `output/austerlitz-a1b/`.
- The demo page unchanged: `tools/golden.mjs` against `origin/main` without `?map` equal; one bench round demo
  against the branch shows no cost.
- Vitest: the focus's smoothing (`FocusFollow`), the ground range from data (`groundOf`, `checkView`), the hold's
  local bound (`clearBelow`, `holdView`); `npm test`, `npm run check:data` (the Pratzen's data), the docs check and the
  build pass.
- `docs/systems/look.md` updated; decisions 0010 and 0051 checked (a record only if one changes).

## Open questions

- **The Pratzen's headroom below the focus row.** Marched on its ground (`nearFrameOf`: foci every 10 m on the play
  area's edge, and every 2 m: the same, 398.4 m; nine yaws, three pitches, four zooms, the focus on its ground and
  `FOLLOW.lag`, 4 m, under it), the frame below the focus row reaches 398.4 m of the tile's 400 m: 1.6 m of headroom,
  the test holds 1 m. A sample, not a bound: a view between the samples could show a sliver of the apron at the
  frame's edge. If a window needs more, its play area shrinks by a few metres or its centre moves (the owner's).

- **The demo's focus.** The demo keeps its 8 m plane so its goldens stand; following its ground (0.4 to 20.3 m) would
  move every golden camera. For the owner, at A3.

## Results (2026-10-29, the dev Mac)

| What | Value | How |
|---|---|---|
| The Pratzen's ground | the tile 22.3–68.1 m, play 30.4–67.0 m (the focus's range), the far ring from 0 m; 4.50 m taken off | `groundOf` on its data |
| Its camera reaches | the whole frame 664 m (+235 of play, inside the far ring's 1300); the frame below the focus row 398.4 m from the centre on either axis (the tile's 400; the demo 392.6, Kobelnitz 392.0) | `checkView`, `nearFrameOf` |
| `data/austerlitz-pratzen.lookdata` | 3,219,764 bytes | file size |
| The demo page | pixel-identical to `origin/main` at the goldens' eight cameras | `tools/golden.mjs`, two preview builds |
| The demo's GPU frame p50, the bench's nine cameras, `l2` (main) | close 7.19, 7.00, 6.53 (7.19, 6.99, 6.53); default 9.17, 9.06, 9.43 (9.15, 9.05, 9.41); wide 12.44, 13.61, 12.31 (12.43, 13.61, 12.30) ms | `tools/bench-look.mjs --gpu metal`, one round each, 1-min load under 3 at the start |
| A pan up the slope at 156 m/s (60 m zoom) | the focus 2.5–4.6 m under the ground under it while rising, on it when still | the pan's frames |

Stills (git-ignored, `output/austerlitz-a1b/`): the plateau's top at (−40, −190) at 20 m, the default and the widest
zoom, and seven frames of a pan from the low ground (z 200, 35 m) north up onto the top (z −235, 67 m) at 60 m.
