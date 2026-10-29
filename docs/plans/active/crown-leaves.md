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

- **A painted atlas drawn on load** (`src/look/leaves.ts`, canvas paths, no committed texture): four clumps of
  pointed, stylised leaves, each leaf filled with one of three tones (the inner ones darker, the outer lighter), a
  darker edge so overlapping leaves part, and its own tilt written directly (each leaf leans out of its clump, and its
  two halves lean apart along the midrib, so a leaf has a lit half and a shaded half). The same 1024² RGBA texture as
  today (about 5.3 MB with mips), so no GPU memory is added; the oak picture stays for `?leaves=oak`.
- **The card shader, under `LEAF_PAINT`**: up close the leaf's value spans more of the albedo and its tilt turns the
  normal more; both fade with the mip level to today's flat mass, so the default and widest zooms keep their read.
- **The owner's sheet** (2026-10-29, after the first stills): clumps of simple leaves, sparser than the oak sheet; the
  owner generated `leaf-clumps-simple-greyscale-v1.png` (in the git-ignored design references: four rosettes of plain
  pointed leaves, three flat values), committed as `data/leaf-clumps-simple-v1.png` and the default (`?leaves=simple`); the sheet is a swappable
  input (`?leafpic=<url>`, or Shift-drop), read with a dome tilt per clump and a darker line between values.
- **Variants for the owner to pick**: `?leaves=simple` (the owner's sheet), `?leaves=painted` (the interim: a rosette
  of 38 pointed leaves drawn on load) and `?leaves=sprays` (pinnate sprays, closer to Tiny Glade's); `?leaves=oak`
  keeps today's crowns.

## Acceptance

- Stills at 15–25 m, the default and the widest zoom, main and each variant, with a compare page and a sheet next to
  the Tiny Glade references (`output/crown-leaves/`, not committed).
- The frame on the production build (`vite build` + `vite preview`), main against the branch at the bench's close,
  default and wide cameras and in the forest (`?wood=big&benchat=-110,-25`), alternated rounds: within +0.2 ms, or
  the trade given with numbers.
- Goldens against main (diffs expected on crowns, reported), the guard (`?armies=20`), `npm test`, `check:data`,
  `check-docs`, build.

## Open questions

- Which variant the owner keeps; the other is removed in a follow-up.
