---
status: active
last_reviewed: 2026-10-27
---

# Plan: the soldiers' simple shadows from their pose, baked per animation step (a test)

Asked by the owner (2026-10-27, #229): a "basically correct" soldier shadow, the shadow of each man's actual pose,
crisp at the foot and blurred on top (decision 0062's gradient), no musket sticks (the blur and the lightness stay),
cheap. Today's shape (decisions 0049, 0062) is one bake a role and a facing, averaged over the clip's steps, so a
marching man's feet leave it; decision 0071 patched that with a contact oval under the feet, which carpets dense
marching and firing formations. The per-figure shadow map (decisions 0047, 0049, 0062) is the costlier alternative.

## Scope

In, behind a switch (the default page unchanged):

- `?ushstep=<steps a clip>[,<facings>[,blend]]` (0 or absent: today's shape). The shape baked per clip step bin ×
  facing (× role, a clip a role), with today's rasteriser and soft bake; the decal's vertex shader picks the man's
  cell from his clip and his current step (`units.vert`'s step rule) and blends two facings as today; between baked
  steps it holds the bin's bake (`hold`, the default) or blends two bins (`blend`: four reads instead of two).
- Works with and without the contact oval (`?ushcontact=0`).
- Measurements: the atlas's GPU memory with its mips, the bake's load cost (Metal, SwiftShader), the frame cost
  (Metal bench), the feet-on-shadow share from the figure's data with and without the oval, at a few settings.
- Review images in `output/armies-review/23-step-shadows/`: motion strips over a stride (march, run, fire) at 20 m
  and 63 m, today against per-step with and without the oval.

Out: making it the default (the owner judges first; a decision record then), the figure shadow map, a GPU bake.

## Approach

- **Bins, not points.** A clip of n steps baked in k = min(n, S) bins; bin j holds the steps from ⌊jn/k⌋ to
  ⌊(j+1)n/k⌋ − 1, its shape their average (at most a few samples a bin): with k = n each step is its own pose; with
  fewer bins the shape is the pose over that short span (march: 16 steps in 8 bins of 1/6 s). A man at step i draws
  bin ⌈(i+1)k/n⌉ − 1 (exact in float32 for the figure's step counts). `blend`: bin centres (j + ½)n/k apart, the
  two around (i + ½) mixed.
- **A 2D atlas, RG8, mips** (R the shape, G the soft bake, as today). A row of cells holds the facings of one bin;
  the rows of all roles' bins are stacked, in as many side-by-side blocks as keep the atlas near square and within
  4096 texels a side (WebGL2's guaranteed size is 2048; Metal and SwiftShader give 8192 or more: checked at load). A
  cell keeps today's size and 8-texel border, so the mips up to the third never bleed. No 2D array: the decal's shader
  stays GLSL ES 1.0-style and the cell maths is a few ALU.
- **The decal's shader:** `SH_STEPS` (and `SH_STEP_BLEND`) in `unitdecal.vert`/`.frag`; uniforms the bins a role,
  the first row a role and the rows a block. `uVATStep` set every frame while it is on.
- Pure functions with tests: the bin of a step (and its mirror against the shader's text), the atlas layout and its
  size, the cell of a (role, bin, facing).

## Acceptance

- `?ushstep` absent: the page as main (the shader's defines unchanged, the bake unchanged).
- The measurements and images above; the owner's judgement in motion; then a recommendation (default or not, which
  setting, the oval or not) and its decision record in a follow-up.
- `npm test`, `check:data`, `check-docs`, build: exit 0.

## Open questions

- Hold or blend: blend smooths the bins only where k < n; at 8 steps the march is 2 steps a bin.
- Fewer facings: 8 instead of 16 halves the memory; does the facings' blend hide the coarser step?
- Halt and fire move little at the feet: they could take fewer bins (one value a role is simple; a list later).
- The far zooms: the stepping is invisible past the default zoom; a per-step material only within a band (like the
  oval's) would keep main's cost there.
