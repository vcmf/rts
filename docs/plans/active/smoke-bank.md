---
status: active
last_reviewed: 2026-10-28
---

# Plan: musket smoke as soft painted banks (the smoke track's first PR, second look)

The first look (`docs/plans/done/smoke-puffs.md`: opaque cut-out puffs, cut off the formations) was rejected by the
owner on 2026-10-28: "too ugly", opaque, hard-edged grey boulders lying on the ground in front of the line. His
references (not in git: `output/smoke-refs/owner-2026-10-28/`): a film's volley (one continuous, soft, bright white
bank at muzzle height, swallowing the front of the line and rolling forward; dense at the muzzles, thinning and
translucent at its edges; the men readable through and behind it), a single shot's plume jetting from the muzzle, and
*Cossacks 2* from above (a soft translucent white streak along and just in front of the firing line). His standing
brief: "painterly 2D on 3D… like painting, simple, elegant yet beautiful"; "above all performance must be good"
(120 fps; the smoke's share about 1 to 1.5 ms at its worst views). Decision 0080 is rewritten for this look (still
proposed). Into `epic/smoke` (#239); the owner merges the track after a showcase.

## Scope

In:

- **Soft translucent smoke** for the scripted infantry's volleys on the demo map (`?armies=<n>`): a plume at each
  muzzle group when a rank fires, the volley's plumes grown into one bank along the front that rolls ahead slowly,
  rises a little, spreads, thins and breaks into holes over ten to fifteen seconds, drifting with the wind.
- **Painterly**: soft feathered edges broken by the page's paint grain (billows, not a uniform fog); a warm white lit
  side and a pale cool shade, never dark grey.
- **Readable**: translucent over the men; where it lies over a formation its opacity is capped, never cut away, the
  same rule for both sides from the locked camera (the old clearance rule removed the smoke instead).
- **Cheap**: cards, one thin-instanced quad, one draw, blended after the opaque scene with no depth
  written.
- **The depth of field**: the blend keeps the scene's alpha (the lens term), as the soldiers' simple shadows do.
- **Era-generic**: the smoke's values are ruleset data (`PuffDef`: new `plume`, `roll`, `bank`, `opacity`); the engine
  names no weapon.
- **Switches**: `?smoke=0` (main's page), `?smoke=soft|step` (smooth, or its clock stepped at 12 fps),
  `?smokecap=<0 to 1>`, `?smokestep=<fps>`; kept: `?firehold=1`, `?lookat=fight|line[,r]` (now also `line1`, the second
  side), `?bench=smoke`. The first look's knobs (`?smoketone`, `?smokeedge`, `?smokeshade`, `?smokea2c`,
  `?smokeclear`) and its offset shadow go with it.
- Tests for the pure parts (the plume, the opacity, the roll, the cap), decision 0080, `docs/systems/look.md`, the art
  bible's smoke row.

Out: as the first plan (artillery smoke, the sim's sight, dust, fire); a half-resolution smoke target (only if the
fill costs too much: see Results); soft-particle depth (a card's plane crossing the men).

## Approach

- **Spawn** unchanged (`shotsBetween`, `volleyPuffs`, the ring and its rebuild on a clock jump).
- **The card** (`smoke.vert`): one quad facing the camera, its frame across the shot's way as the eye sees it; young,
  stretched along the shot (foreshortened) with its back at the muzzle and relaxing to round over the era's time;
  `bank` times wider along the front than deep, so a rank's puffs overlap into one sheet; moved by the blast, then the
  roll, the rise and the wind (`puffAt`, mirrored); kept off its ground.
- **The shape and light** (`smoke.frag`): a soft falloff broken by the grain's blotches at two scales in the card's own
  metres; two light bands from the sun's side, their edge drawn by the billows; thinning (`PUFF_THIN`) and holes with
  age; faded out at its ground.
- **The cap**: the formations' mask and view-ray rule kept from the first look (`drawClearance`, `coverAt`); its value
  now caps the opacity (`coverCap`, 0.4 by default) instead of cutting.

## Acceptance

- **Cost**: `?armies=20&firehold=1&bench=smoke&benchr=20,40,63,125,250` on the built page, Metal, paired arms, rounds
  started at a 1-min load ≤ 3: the smoke's GPU frame cost ≤ 1.5 ms at every radius, its worst view named.
- **Looks**: stills at 20, 40 and 90 m of both sides and a sequence of a volley's life, and a sheet against the
  owner's references, in `output/armies-review/27-smoke-bank/` (not in git); the owner judges.
- **Readability**: the men of a line facing the camera read through the bank (the stills).
- **Main's look one switch away**: `?smoke=0` creates nothing.
- `npm test`, `npm run check:data`, `node tools/check-docs.mjs` and the build pass.

## Results (2026-10-28, this machine: M1 Pro, ANGLE Metal, 1920 × 1080)

- **Cost** (the built page, `?armies=20&firehold=1&bench=smoke`, paired arms A B B A in one page, GPU frame p50, the
  smoke arm's less the other's, averaged over the three yaws; each run started at a 1-min load ≤ 3, though other
  agents' work rose during the runs, so single cameras are noisy: their arms spread about as much as the difference):
  - On the fight's middle (`benchr=20,40,63,125,250`): 20 m +0.00 ms, 40 m +0.03, 63 m +0.37, 125 m +0.35, 250 m +0.17
    (a first round was spoilt at 40 and 63 m by a load spike; its other radii agree within 0.1 ms).
  - The worst views, on each side's front line (`benchat`, `benchr=25,40,90`): the first side (the camera behind it)
    25 m +0.98 ms, 40 m +0.84, 90 m +0.95; the second side (facing the camera) 25 m +1.30, 40 m +0.67, 90 m +0.37. The
    single worst camera +2.05 ms (first side, 90 m, yaw 0), with an arm spread of 3.9 ms: noise, not a measured cost.
  - So about 1 ms at its worst views, within the 1 to 1.5 ms budget; up close (25 m, the bank filling the screen) is
    the dearest. Not measured: rounds 2 and 3 at the lines, and a half-resolution target (not built; it would be the
    next step if the owner's machine finds the fill dear).
- **Memory**: the ring 1,512 puffs × 64 B (97 KB, on the GPU and the CPU), the mask 512² bytes (256 KB each), the quad
  48 B: about 0.6 MB, less than the first look (one mesh, no icosphere, no shadow mesh).
- **Looks**: stills, a volley's sequence and a sheet against the owner's references in
  `output/armies-review/27-smoke-bank/` (not in git; `00-sheet-vs-refs.png` first).

## Round 2 (2026-10-28, the owner's review at 20 to 40 m behind the French line)

The owner: "cloud form a line u see? need to be random, also it's too far away from the muskets and too big" (still
not in git: `output/smoke-refs/owner-2026-10-28/bank-too-far-too-big-a-line.png`). Found and changed:

- **Too far**: two causes. The formations' mask was drawn from each battalion's world box (`Units.boxes`); a line
  askew to the world's axes has a box that takes in the ground before it, so the cap thinned the smoke at the muzzles
  to 0.4 and the visible bank began metres out. The mask now draws each battalion's footprint in its own frame
  (`Units.footprints`, `FOOT_FLOATS`), with a 1 m fall-off. And the camera-facing card stood metres high: from the
  camera behind a line, smoke two to four metres up reads metres ahead of it. The card now lies across the front,
  tilted a little up from the level, at the muzzles' height; its back at the muzzles, densest toward them, and grown
  it rolls back over the front rank's muskets.
- **A line**: each puff has its own size, reach, rise and density (`puffVary`, the era's `vary`; one puff in seven
  thin: gaps), the line's sections (`SECTION`, 12 m) go off up to the era's `stagger` (0.8 s) apart, and each puff's
  wind drift differs a little.
- **Too big**: radius 0.3 m at birth to 1.7 m grown (was 0.6 to 3.2), the blast 0.6 m (was 1.5), the roll 0.06 m/s,
  the rise halved; the bank's width over its depth 1.5.
- **The first half second**: a young puff is a jet, long along the shot, narrow at the muzzle and widening ahead; the
  flash is a small spark at the muzzle end for 0.07 s, not the plume's core.
- Stills and a before/after sheet: `output/armies-review/27-smoke-bank/round2/` (`00-before-after.png` first).

## Risks

- **Fill cost** of blended cards where banks pile up at a wide zoom: thinned with zoom; measured, not assumed.
- **A card's straight edge across the men** where its plane passes through them: soft, translucent and capped there.
- **Unsorted cards**: one colour family, blended in birth order.

## Open questions

- The cap's value (0.4) and whether the smoke over the side facing away from the camera should thin too.
- Whether the bank should linger longer, and whether `step` (12 fps) suits the owner's "painted" better than smooth.
