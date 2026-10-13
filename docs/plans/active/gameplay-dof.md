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

- **One bokeh pass** replacing the separable one, after Gustafsson:
  - a golden-angle spiral of at most 64 taps;
  - each tap counted where its own blur reaches the pixel;
  - a tap behind the pixel has its blur clamped to twice the pixel's, so sharp crowns do not bleed.
- **The circle of confusion** is the thin lens's `|1 − focus/d|` past a sharp band, with d the view distance the
  materials already write to alpha.
  - The focus is the camera's target.
  - The largest blur is a pixel radius at 1080 lines, strongest at the closest zoom and 40% of it at the widest.
  - The constants are `DOF` in `src/look/post.ts`.
- **The setting:** on by default; `?dof=0|1` overrides it. The panel's button shows the state the page opened with
  and calls it a gameplay setting. The "Blur strength" slider still multiplies it.
- **The tools:**
  - `tools/look-page.mjs` `shoot()` loads the page with `?dof=0` unless the URL sets `?dof`, so every check measures
    the paint (decision 0020).
  - `tools/bench-look.mjs` does the same, and `?bench=dof` measures the pass off and on.
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
  fallback.

## Estimate

1 day, one PR.

## Results

(written when built)
