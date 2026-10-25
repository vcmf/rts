---
status: research
last_reviewed: 2026-10-13
---

# Colour and light: the owner's reference review and the coats' colour, measured

Notes from a review with the owner (2026-10-13), for Track E's colour-and-light phase (LC,
`docs/plans/active/track-e-look.md`). The owner: the colour theme must become "more epic and beautiful, not colourful in the
sense of a normal camera"; the landscape needs more variants, trees first; and "the global illumination changes a lot
of things, like a blue coat in an orange [light] has an orange tilt".

## The references

Kept in the owner's local `~/workspace/napoleon-refs/` (film and game stills: not committed). What each shows:

| Reference | What it shows |
|---|---|
| Ridley Scott's *Napoleon* (2023), two stills | Low saturation, overcast neutral-to-cool light, a teal-grey sky, grey-brown ground. Red, blue and white uniforms still read: nothing else competes with them. |
| Total War: Shogun 2, a winter battle | Nearly monochrome blue-grey. The armies are dark masses; red banners are the only colour. |
| A war game, a dusty valley | A warm but desaturated dust (ochre, umber, sepia haze); trees near-black silhouettes. |
| A battle in ochre grass at dusk | Dry golden grass, dark armies, a low warm sky, little chroma. |
| A Lake District farm in autumn | An earth palette (umber, burnt orange, muted olive), a lot of atmosphere. |
| An Alpine lake | Tree variety in one view: tall narrow spruces, white birches, yellow broadleaves. |
| Tiny Glade | The brushwork (not the colours). |

**What they share:** the landscape carries little colour and its **values** make the image; haze takes the colour
out of the distance; the armies and the flags are the only strong colour. The look today is the opposite: a
saturated yellow-green meadow with bright orange patches.

## The coats' colour, measured

The guard's four coat colours (`tools/army-blocks.mjs`) as blocks at the default view (`tools/golden.mjs`'s
`start`), summer, main at 9d93337, with the gameplay depth of field off (`?dof=0`: its band at the top of the frame
blurs the ground into what it covers). Each value is the average of 8×3 pixels in the middle of a block's lit top
face; hue in degrees, saturation as HLS. Two spots: the middle of the frame (the focus, outside the valley mist) and
the valley floor (inside it). The page's switches off one at a time (`S.grade`, then `S.mist`, then also `S.back`,
`S.shafts` and `S.bloom`):

**The middle of the frame (-10, 2):**

| Coat | Painted (art bible §4) | All on | Grade off | Everything off |
|---|---|---|---|---|
| France | (44, 79, 168): hue 223, sat 0.58 | (64, 86, 114): hue 214, sat 0.28 | sat 0.33 | (59, 84, 118): sat 0.33 |
| Russia | (47, 107, 60): hue 133, sat 0.39 | (77, 107, 52): hue 93 | hue 102 | (61, 109, 41): hue 102 |
| Austria | (233, 227, 211): hue 44, sat 0.33 | (237, 209, 150): sat 0.71 | (229, 217, 180): sat 0.49 | (211, 204, 183): sat 0.24 |
| Britain | (179, 48, 42): hue 3, sat 0.62 | (150, 51, 43): sat 0.55 | sat 0.63 | sat 0.63 |

**The valley floor (30, 62):**

| Coat | All on | Grade off | Grade and mist off | Everything off |
|---|---|---|---|---|
| France | (115, 126, 135): sat 0.08 | sat 0.15 | (58, 83, 117): sat 0.34 | sat 0.34 |
| Russia | (126, 142, 99): hue 82, sat 0.18 | hue 92, sat 0.28 | (62, 110, 42): hue 102, sat 0.45 | hue 102 |

So the tilt is **three warm tints stacked**, not global illumination (the look has none):

1. **The sun's colour** (`PAL.sun`, (1.00, 0.84, 0.60), × 1.16 in the lit band): with everything else off it takes
   the French blue from 0.58 to 0.33 in saturation (its blue channel × 0.60) and turns the Russian green toward
   yellow (hue 133 to 102).
2. **The valley mist** (`mist()` in `src/look/shaders/painter.glsl`): up to 42 % of a warm air colour over every
   surface, coats included. On the valley floor it takes the blue from 0.34 to 0.15.
3. **The grade, the backlight and the bloom** (`src/look/shaders/uber.frag`, `S.back`): the grade mutes "greens"
   (the Russian coat counts as one: hue 102 to 93), adds amber to the highlights and a warm lift to the darks; with
   the backlight and the bloom it turns the Austrian white yellow (saturation 0.24 to 0.71). In the valley the blue
   ends at 0.08: nearly grey.

It breaks art bible pillar 1: the armies are no longer the most saturated objects on screen.

## How a surface's tones are chosen today

No tone is picked by hand. `paint()` (`src/look/shaders/painter.glsl`) gives every surface three tones from its
base colour:

- **Light:** the base × the sun's colour × 1.16, plus a little warmth.
- **Mid:** the base, tinted 30 % toward the sun.
- **Shadow** (`shadowOf`): the same value, turned toward a cool blue-violet (`PAL.shadow`, (0.45, 0.57, 0.76)) and
  made a little more saturated.

The crowns since L7b (decision 0022) blend the three by the light that reaches a point inside the crown. Every tone
in the frame therefore follows from a few palette constants: changing them changes everything at once, which is why
the palette comes first.

## What the review asked for, in order (the owner)

1. **The colour theme:** light moods as data, three candidates judged blind, earth-tone terrain, and the coats
   keeping their colour.
2. **Bounced light and soft shadows:** a hemisphere ambient for units and crowns (sky from above, the ground's
   colour from below), and bounce baked into the ground's light map.
3. **More variants of landscape objects, trees first:** species with their own shape (tall and narrow, tall and
   large, low) and trunk colour (brown, dark brown, white, light brown).

The phase and its PRs: `docs/plans/active/track-e-look.md` §LC.
