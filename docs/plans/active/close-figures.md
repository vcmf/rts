---
status: active
last_reviewed: 2026-10-24
---

# Plan: the close-zoom figures, a face on the back of the head (#164) and shadows off the feet (#165)

The owner's shots on main (e1e8ab7, `?armies=20`, the closest zooms): `output/armies-review/14-owner-close/`
(`face-on-back.png`, `shadow-detached.png`; the owner's checkout, not committed). The system: `docs/systems/look.md`
("The armies"); the decisions it touches: 0047, 0049, 0051 (none changed).

## Scope

In: find the cause of each at its root, fix it, guard it with a test, before/after images at the owner's two views.
Out: the figures' look at the far zooms beyond what the fix changes (below: the owner's to judge), the decals' shape.

## #164: a face on the back of the head

**Cause: every figure was drawn inside out, at every LOD and in every clip.** The bake (`tools/bake-figure.py`)
reflects the glTF into Babylon's left-handed space (y and z swapped) and then reversed each triangle's corners "to keep
their outside out". Babylon draws clockwise fronts (a front triangle's right-hand normal points into the mesh;
`src/look/nature.ts` reverses its OBJ data for the same reason), and the reflection alone already turns the glTF's
counter-clockwise fronts into them: the reversal turned them back. So the GPU culled the near side of each man and
drew the far side from within: seen from behind, the inside of his face (skin, eyes, moustache) above the inside of his
pack's front, which is why the pack and the face showed together; seen from the front, the inside of his coat's back
and of his hair. The tiny LOD's boxes (`tinyMesh`) were wound the same way.

Evidence (all on main's data and build):

- **Which LOD, which clip**: all of them. The owner's shot shows it on the nearest men (LOD0) and on those behind them
  (LOD1); the page renders it on both (a page harness in the session's scratchpad: the aimed man from behind and from the
  front, `?armies=2&frozen`, the clock at 5 s, a battalion in column).
- **The culling, tested in the page**: turning every figure material's culling over (`cullBackFaces = false`) on main's
  build put the packs on the backs and the faces on the fronts.
- **The data**: on every LOD the triangles' right-hand normals agreed with their vertex normals (99.7 % of LOD0's,
  96.7 % of LOD1's, 92.6 % of LOD2's): outward by the right hand, Babylon's back faces.
- **Hypotheses ruled out**: (a) the head's pose: posed through every baked step of every role on LOD0 and LOD1 (the
  bones' texture, as `units.vert` skins), the head's skin lies on the side opposite the pack in halt, march and run (the
  cosine of the two directions −0.91 to −1.00), and the rest-pose assert holds (LOD0 skinned with LOD1's inverse binds
  is right); (b) the colour roles: on LOD0's head the bone's triangles behind its centre are mostly dark, coat and
  leather (the hair, the shako), and seen from behind with the culling corrected 8 % of the head's pixels are skin
  (the ears, the nape); the face rule (#145, `tri_role`) takes the front only;
  (c) the texture: the roles follow the texels' colours, front and back as above.

**Fix**: the bake keeps the glTF's order (no reversal) and asserts that over 90 % of each LOD's triangles are wound for
Babylon; the figure is rebaked (`data/figures/fr-line-infantry.unitdata`: the same 1,428,304 bytes, only the index
order changed; the bake reproduced main's file byte for byte first, so the change is the winding alone). The tiny LOD's
boxes are wound the same way (`tinyMesh`).

**Guards** (`test/armies.test.ts`): every LOD's fronts clockwise from outside (over 90 % of its triangles; main's data:
0.3 %); the head seen from behind and from the front at 17° above, culled as Babylon culls, on the LODs whose head has
a face (LOD0, LOD1): from behind under 15 % skin and the front more than twice that (main's data: 29 % and 32 % skin
from behind, more than from the front; now 8 % behind, 25 to 29 % in front); the tiny boxes' fronts out.

## #165: the shadows start off the feet

**Cause: the shadow proxy has no feet.** Up close the figures' shadows are the map's, cast by the proxy (`shadowProxy`:
two crossed quads along each bone's part, `boneParts`, built from the far LOD). A part needs 8 vertices and 14 cm of
length; the far LOD's feet have 8 vertices each and are shorter than that, so no part carries them, and the shin's
part ends at the ankle. Measured (the proxy posed at every baked step against the soles, the lowest posed vertex): its
lowest point on average 13 cm above the near LOD's soles in halt, march and run (14 cm above the nearest LOD's, 10 to
11 above the far LOD's), up to 15.5 cm. At the sun's 27° that is 25 to 30 cm of bare ground between the boots and the shadow's start,
the levitation in the owner's shot. The rest is not it: the map's bias is 2 cm along the sun (`SM_BIAS`), the soft
lookup's two reads three quarters of a texel or so either side of the point (2 to 4 cm at 15 to 30 m), the meadow reads
the map at the blade's root.

**Fix**: in `boneParts`, a bone too small to be a part whose vertices come within 15 cm of the figure's lowest point
lends them to the part it shares skin weights with (followed through other small bones: the toes to the foot to the
shin); that part's axis runs on to them (not its width nor its vertices). The shins' parts now reach the soles: the
proxy's lowest point is on average 1.4 to 2.6 cm under the near LOD's soles by role (0.7 to 1.6 under the nearest
LOD's), at worst 2.8 cm above (one step of the run, the push-off). The same 14 parts, 56 triangles, 112 vertices: nothing the map draws or reads changes in cost.
The tiny LOD's boxes are the same parts: their shins reach the ground too.

**Guard** (`test/armies.test.ts`): at every baked step of every role, the proxy's lowest point within 4 cm above the
far LOD's and the near LOD's soles and less than 10 cm under them (main: 14 cm above).

**The simple shadows beyond 60 m** (decision 0049) start at the feet by construction: the shape is the far LOD's own
triangles, feet included, projected from the root. Measured on the atlas (16 facings): the halt's and the fire's
shadows are a quarter of their peak within 10 cm of the root, the march's from 8 to 18 cm (its legs are averaged into
a faint wedge over the clip: the darkest part is the body's, a metre out); at 10 % of the peak every role's starts at
the root. Unchanged.

## Results

Images (SwiftShader, 1600 × 900; main's build against this branch's), in the owner's checkout,
`output/armies-review/14-owner-close/`:

- `face-on-back-before-after.png`: a battalion in column at 15 m from behind (the owner's view): before, a face above
  each pack; after, the backs of the shakos.
- `face-front-before-after.png`: the same from the front: before, the coats' backs and the hair; after, the white
  waistcoats, the crossbelts and the faces.
- `shadow-feet-crowd-before-after.png`: a battalion's front rank on the road at 15 m, the shadows across the screen.
- `shadow-feet-lone-man-15-90m.png`: one man (the others scaled to nothing), across the sun, at 15, 30, 55, 70 and 90
  m: up to 55 m the leg shadows stop short of the boots before and reach them after; at 70 m (the cross-fade) both
  shadows; at 90 m the simple shadow, the same before and after.

**The look beyond the closest zooms changes with #164's fix** (every LOD was inside out): from 45 m out a line seen
from the front shows its white waistcoats and crossbelts where it showed the coats' backs, from behind its packs and
coats where it showed the white fronts; from above the far figures show their shoulders and headgear, not their
insides. The far palette's rule (`FAR_ROLES`), the guard's figure numbers (`tools/guard.mjs --figures`) and the 32k
branch's tiny-LOD calibration were made on the inside-out figures: worth a look by the owner.

## Acceptance

- `npm test` (lint, format, typecheck, Vitest), `check:data`, `check-docs`, the build pass.
- The four new guards fail on main's data and code, pass here.
- Before/after images at the owner's two views (above).
- Cost: the proxy keeps its 56 triangles, the shaders and the map's lookup are unchanged, the figures draw the same
  triangles (culled on the other side): not benched.

## Open questions

- The far palette's rule and the coat's share from far off were tuned on the inside-out figures (above): the owner's
  call whether they still read as wanted.
