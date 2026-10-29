---
status: active
last_reviewed: 2026-10-29
---

# Plan: painted leaves on the crowns up close

Track E, the leaf-card crowns (`docs/systems/look.md`, Leaf-card crowns and Generated trees; L7a, L7b).
Art direction: `docs/art-bible.md` §4 (the soft ramp for foliage, decision 0022), §5 (big readable masses).

## Problem

The owner (2026-10-29), of a Tiny Glade close-up: "our tree texture looks weak at close; in Tiny Glade, zoomed in, we
clearly see the leaf texture, very 'art'". Tiny Glade's crowns are covered in clearly drawn, stylised leaves:
overlapping pointed leaves in a few tones, the lit side lighter, soft shade, readable as leaves up close. Ours, at
15–25 m, are blotchy dark smudges: no leaf shapes, a muddy dark-green mass with noisy flecks. The causes, in the atlas
and the card shader:

1. **The leaves are too small and too alike.** The oak picture (`data/leaf-clumps-oak-v1.png`) packs about 40 lobed
   leaves across a clump, about 0.15 m on a crown; neighbouring leaves differ in value by little, and the shader maps
   the value to only 0.80–1.12 of the albedo, so the leaves merge.
2. **The tilt is noise.** Each leaf's tilt is the gradient of the painted value (`withTilt`), which in a painting
   with veins and dabs turns the normal pixel by pixel: the flecks.

## Approach (materials and an atlas, no full-screen filter)

- **First round** (in git history, commits 63accf6e and 574d72cc): leaves drawn on load (`painted`, `sprays`), then
  the owner's sheet of simple leaves, each leaf lit by a tilt of its own (its halves apart, its clump a dome). The
  owner, of the stills: "a bit over complicated, and yet the texture is worse: basically you split a leaf in 2 halves
  and let light make one lighter than the other, we don't need that." Tiny Glade's is a painting technique, layers: a
  dark base, lighter leaves on top, highlight leaves on those, a 2D texture that already has depth; then the crown's
  ordinary 3D shading over the whole.
- **The layered sheet** (`?leaves=layered`, the default): the owner's sheet (`data/leaf-clumps-simple-v1.png`, the
  owner's `leaf-clumps-simple-greyscale-v1.png` in the git-ignored design references) read as layers: its three values
  the layer index (dark, mid, light), a share of the light leaves lifted to highlights, three of its clumps at 0.8 a
  cell (smaller leaves); no tilt. `?leafpic=<url>` swaps the sheet.
- **Smaller leaves** (the owner: "now it's beautiful … but the leaves too big"): `?leafscale=<x>` paints each cell
  from more, smaller clumps (about 3 / scale², `clumpCopies`); 1 is the first layered round, 0.6 the default (the
  closest to Tiny Glade of 0.75, 0.6 and 0.5; at 0.5 the forest's shade turns to mush). The layers fade to the mass
  sooner in proportion (`LEAF_LOD`); stills at 30 and 34 m, 50 and 55 m show no shimmer between them.
- **The card shader, under `LEAF_PAINT`**: each layer one flat tone of the crown's colour (cool dark to pale warm);
  the crown's light decides how many upper layers show (the shade side its dark and mid, the lit side the highlights),
  then the crown's ordinary light over it, a little lighter in shade than before. One texture read as before, no pass;
  the layers fade with the mip level to the old mass.

- **Clean shadows and a middle tone** (the owner, of the layered crowns in the wood): "this 'line effect' in the
  shadow looks a bit weak", and ours goes straight from lit leaves to a near-black shade where Tiny Glade has a soft,
  lighter middle tone. The streaks: another tree's shadow is read where the sun ray leaves the crown, a point that
  slides along the light at a grazing angle, and the shadow map holds the cards' leaf-cut holes, so the holes (and
  the grain-jittered four reads) stretched into lines along the light; now eight reads on two rings, no jitter
  (`shadowAtWide`). The middle tone: `LEAF_RAMP` (a wider wrap, wider overlapping bands, the shade lifted toward a cool
  mid) and the layers dropping leaf by leaf toward the shade (a draw per leaf patch in the atlas's G).

## Acceptance

- Stills at 15–25 m, the default and the widest zoom, main and each variant, with a compare page and a sheet next to
  the Tiny Glade references (`output/crown-leaves/`, not committed).
- The frame on the production build (`vite build` + `vite preview`), main against the branch at the bench's close,
  default and wide cameras and in the forest (`?wood=big&benchat=-110,-25`), alternated rounds: within +0.2 ms, or
  the trade given with numbers.
- Goldens against main (diffs expected on crowns, reported), the guard (`?armies=20`), `npm test`, `check:data`,
  `check-docs`, build.

## Results (2026-10-29, the dev Mac M1 Pro, ANGLE Metal, a proxy)

The frame interval (p50, the mean of the three yaws, ms), main (c2b90cd9) / the branch (574d72cc, `?leaves=simple`),
`vite build` + `vite preview`, `node tools/bench-look.mjs <url> --gpu metal`, three rounds, the order alternated
(round 2 the branch first), each run started at a 1-minute load of 3 or less under the bench lock:

| View | Round 1 | Round 2 | Round 3 | Branch − main |
|---|---|---|---|---|
| close (45 m) | 4.84 / 4.78 | 4.71 / 4.77 | 4.76 / 4.68 | −0.06, +0.06, −0.08 |
| default (125 m) | 7.30 / 6.56 | 6.42 / 6.41 | 6.43 / 6.44 | −0.75, −0.01, +0.02 |
| widest (260 m) | 7.44 / 7.02 | 6.80 / 6.79 | 6.76 / 6.79 | −0.42, −0.02, +0.02 |
| forest close (`?wood=big&benchat=-110,-25`) | 9.23 / 9.00 | 8.96 / 8.99 | 8.91 / 9.00 | −0.24, +0.03, +0.09 |
| forest default | 10.38 / 10.16 | 10.13 / 10.17 | 10.12 / 10.20 | −0.22, +0.04, +0.08 |
| forest widest | 7.79 / 7.66 | 7.67 / 7.65 | 7.63 / 7.68 | −0.12, −0.02, +0.06 |

- **No cost seen:** rounds 2 and 3 differ by −0.08 to +0.09 ms, within the runs' noise; round 1's main ran on a busier
  machine (its default and widest views 0.4–0.9 ms slower than its own later rounds). The same 1024² atlas; the
  textures the bench counts are 252.4 MB on both. The owner's sheet adds a 1.15 MB file to the page's download.
- **Goldens** against main differ, as expected, on every camera with crowns (the crowns' leaves and edges, and their
  shadows, cut by the new atlas); nothing else moves. **The guard** (`?armies=20`, base main): ok, no block newly
  failing (the 7 `fails*` fail on main too).

**The layered leaves at `?leafscale` 0.6** (093f5713, one round, main first, the same setup): close 5.28 / 4.94,
default 6.80 / 6.44, widest 7.11 / 7.00; the forest close 9.03 / 9.02, default 10.40 / 10.35, widest 7.75 / 7.72:
branch − main −0.36 to −0.01 ms, no cost (main's close and default ran on the busier start). Goldens: the crowns and
their shadows' edges differ on every camera with crowns (the crowns a little lighter in shade at every distance),
nothing else. The guard (`?armies=20`, base main): ok, no block newly failing.

## Open questions

- The layers' tones and how fast the light reveals them (`LEAF_LAYERS`, the 2.3 in `canopy.frag`): the owner's eye.
