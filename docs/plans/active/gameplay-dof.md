---
status: active
last_reviewed: 2026-10-13
---

# Plan: the miniature field, a gameplay depth of field

Decision 0020 (13 Oct 2026, superseding 0003) makes depth of field a gameplay setting, on by default. This builds it
on the look page. The owner's references are *Tiny Glade*'s (`design/refs/tiny-glade-img-2.jpg`,
`design/refs/tiny-glade-forest.jpg`, art bible §0): a tilt-shift blur that makes the field read as a miniature while
the painted texture still reads. Their leaf crowns are another branch's (L7a, `look/l7a-canopy-cards`, PR #58), and
their shadows too (`look/shadow-look`, PR #59). One PR.

## Problem

The look page's depth of field (`src/look/shaders/dof.frag`) is two separable 9-tap passes weighted by each
sample's own blur. Sharp crowns get haloes over the blurred ground behind them, there is no bokeh, it is off by
default and labelled "video / presentation", and its strength never changes with the zoom.

## What *Tiny Glade* does

From the GPC 2024 talk by Tomasz Stachowiak (https://www.youtube.com/watch?v=jusWW2pPnA0), in the developer's words:

- They began with Dennis Gustafsson's single-pass bokeh
  (https://blog.voxagon.se/2018/05/04/bokeh-depth-of-field-in-single-pass.html). They liked that it kept detail in
  the foreground, like a painter's background strokes.
- They moved to a lens ray march because a true tilt-shift makes the scene look tinier.
- Low dynamic range keeps the bokeh from swamping the texture.
- It costs 1.3–1.5 ms on an RTX 2080 at 1440p, with TAA cleaning the noise. We have no TAA, so we take the single
  pass.

## Scope

- **One bokeh pass** replacing the separable one, after Gustafsson (as built: at half resolution, its composite in the finishing pass; see Results):
  - 64 taps on a golden-angle (Vogel) spiral out to the largest blur;
  - each tap counted where its own blur reaches the pixel;
  - a tap behind the pixel has its blur clamped to twice the pixel's, so sharp crowns do not bleed.
- **The circle of confusion** is the thin lens's `|1 − focus/z|` past a sharp band (as built: a wider band nearer,
  and the pass at half resolution; see Results), with z the depth along the view
  axis (from the distance the materials already write to alpha, and the pixel's ray).
  - The focus is the ground under the camera's target, at its depth along the view axis.
  - The largest blur is a pixel radius at 1080 lines, strongest at the closest zoom and 40% of it at the widest.
  - The constants are `DOF` in `src/look/post.ts`.
- **The setting:** on by default; `?dof=0|1` overrides it. The panel's button shows the state the page opened with
  and calls it a gameplay setting. The "Blur strength" slider still multiplies it.
- **The tools:**
  - `tools/look-page.mjs` `shoot()` loads the page with `?dof=0` unless the URL sets `?dof`, so every check measures
    the paint (decision 0020).
  - The bench page (`?bench`) and the debug views (`?water`, `?river=debug`) open with it off unless `?dof` is set;
    `?bench=dof` measures the pass off and on.
  - The readability guard runs with `?dof=1` as well.
- **Out of scope:**
  - the game page (`app/index.html`): it has no depth of field yet, and the setting moves there with the renderer's
    post stack;
  - a settings store.

## Checks

- **Unchanged paint:** with `?dof=0`, the goldens (`tools/golden.mjs` against `origin/main` with its blur off) match
  at all cameras.
- **Readability:** the guard (`tools/guard.mjs`, start view and `--view cover`) with `?dof=1` against `?dof=0`. No
  block that separates without blur may fail with it. The guard's blocks sit at the default view's centre and
  across the cover, near and far.
- **Cost:** `?bench=dof` on the Metal proxy, 1920×1080, two runs, the post pass's GPU medians off and on.
  Acceptance: ≤ 1 ms at the default zoom (decision 0020's estimate is 0.5–1 ms).
- **Also:** `npm test`, the docs check, `tools/check-negatives.mjs`, and the water and detail self-tests (through
  `shoot()`, blur off).

## Acceptance

- The look page opens with the blur on; `?dof=0` and the button turn it off.
- The checks above pass and the cost is recorded.
- Screenshots of close, default and wide zoom, off and on, go to the owner, who sets the default strength.

## Risks

- **Blur hides a flank.** The guard gates it, and the zoom curve and `DOF` are the knobs. The player can turn it
  off.
- **Haloes at depth edges.** The far-tap clamp handles crowns over the ground. A blurred near crown over sharp
  ground keeps a soft edge, which is what a lens does.
- **Cost on the laptop.** 64 taps at full resolution; if the bench is over 1 ms, a half-resolution pass is the
  fallback. (It was: Results.)

## Estimate

1 day, one PR.

## Results

Built on 13 Oct 2026. The page opens with the blur on; `?dof=0` and the panel's button turn it off.

### What changed from the plan

- **A wider sharp band nearer than the focus** (`DOF.near` 0.25, against `DOF.band` 0.06 beyond). With one band on
  both sides, the readability guard failed at the default view's foot: wheat.France fell from 0.100 to 0.088 (blurred
  wheat in front of the block). Softening the whole lens (band 0.10, gain 3) only reached 0.093. The near band
  brings it back to 0.100, and the tilt-shift look stays at the top of the screen.
- **Half resolution, in three steps**, because a single full-resolution pass of 64 taps cost about +8.7 ms of GPU
  frame on the Metal proxy:
  - `dofdown.frag`: the scene at half resolution, each four pixels' colour averaged and the farthest of their
    distances;
  - `dof.frag`: the bokeh at half resolution, every read at a pixel's centre, the taps in five steps from 16 to 64 by
    the blur's area, the spill from taps nearer than the focus and than the pixel;
  - the composite in the finishing pass (`uber.frag` with `DOF`), which keeps the sharp scene wherever the blur is
    under a pixel.
- **A tiled early-out** (skip the taps where no blur is near) was built and dropped. Three review rounds kept finding
  ways for it to skip pixels a blur should reach, and it saved about 0.3 ms. The project's rule (more than three
  rounds means redesign) applied, and the redesign is the version above.

### Checks (final code; full output in the PR)

| Check | Exit |
|---|---|
| `tools/golden.mjs` against `origin/main`, blur off: 8 cameras match, 0.000% | 0 (the suite's first run lost headless Chrome mid-run, "DevTools socket closed"; rerun alone) |
| `tools/guard.mjs ?dof=1 --base ?dof=0`, start view: no new failure; wheat.France 0.100 against 0.100 | 0 |
| `tools/guard.mjs ?dof=1 --view cover --base ?dof=0` | 0 |
| `tools/water-look-check.mjs --selftest` | 0 |
| `tools/water-check.mjs --selftest` | 0 |
| `tools/detail-check.mjs --selftest` | 0 |
| `tools/check-negatives.mjs` | 0 |
| `npm test` (lint, typecheck, 255 tests) | 0 |
| `node tools/check-docs.mjs` | 0 |

Earlier runs of the water-look-check on this branch lost Chrome the same way; on main it passed (exit 0), and on
the final code it passes.

### Cost: not met, the owner's decision

`?bench=dof` on the Metal proxy (ANGLE Metal, Apple M1 Pro, 1920 × 1080), the GPU frame's median, blur off against
on. Another session shared the machine throughout (load 11 to 23), so these are rough:

| Version | close | default | wide |
|---|---|---|---|
| one pass, 64 taps, full resolution | +8.6 | +8.7 | +8.7 |
| half resolution (without the down pass) | | +1.2 to +1.3 | |
| the final design before review round 3's fixes | +1.8 | +1.45 to +1.5 | +1.0 |
| the final code, while another process held the GPU (blur off itself took 11 to 15 ms, against 7.7 earlier) | +3.4 | +2.0 to +3.6 | +2.2 to +4.2 |

The acceptance was ≤ 1 ms at the default zoom (decision 0020 estimated 0.5 to 1 ms), so **it is not met**: the best
figure is about +1.5 ms. Before this ships beyond the look page:

- **A clean bench** on an idle machine, and on the RTX 3060 target.
- **The owner decides:** raise the post budget, or keep the blur and cut it further, or drop the default to off.
  Cheaper options left: fewer taps at the default zoom, a quarter-resolution far band, or a lower-precision target.

### Known limits

- **Silhouettes:** the scene is 4× MSAA, and its resolve averages the distance in alpha at a silhouette, so an
  in-focus edge pixel can take a little blur. The bilinear upsample in the composite can give a 1 px fringe where a
  sharp crown meets blurred ground, and the averaged colour carries a crown's edge half a texel into the ground's blur.
- **Zooming:** the tap count steps at three points across the zoom range, and snapped taps change texel one by one,
  so the blur's grain shifts while zooming (there is no TAA).
- **The slider at 0** still pays the cost; the button turns it off.
- **Debug views at run time** (`__look.waterView`, the detail debug) are blurred when the blur is on; their URLs
  (`?water`, `?river=debug`) open with it off.
- **The game page** has no depth of field yet (out of scope).

### Reviews

- **The first design** (one full-resolution pass) went through two rounds: round 1 severe (focus inside the hill,
  radial depth), round 2 moderate. It then failed the cost check.
- **The tiled half-resolution design** went through three rounds, each with severe findings: redesign.
- **The final design** went through three rounds:
  - round 1 severe: spill from the same background, and the taps moving with the zoom;
  - round 2 severe: the farthest-of-four dropped figures narrower than 2 px;
  - round 3 moderate only: the bloom's read at odd sizes, taps back on the centre, and the weight ramp were fixed;
    the zoom steps and the per-tap depth maths are listed above.

### Related

- The *Tiny Glade* leaf crowns are L7a's (`look/l7a-canopy-cards`, PR #58), and the stronger shadows are
  `look/shadow-look` (PR #59).
- A crown spike from this session is kept on `look/l7s-glade` and was not merged. Its tips for L7a: brighten the
  dabs in the lit band, `c *= mix(0.8, 1.1, v)`; cards at 0.22 of the crown radius, 80 per crown pulled in to 0.9 of
  it. Alpha to coverage cannot be used, because alpha carries the distance.
- From the same talk, for later stages: contact shadows (a short screen-space march), and a grade LUT that keeps
  saturated hues in check (Tony McMapface or AgX).
