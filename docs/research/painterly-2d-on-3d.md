---
status: research
last_reviewed: 2026-10-08
---

# Painted 2D brushwork on a 3D battlefield

## Purpose and feasibility

The goal is a living miniature Napoleonic battlefield: dimensional terrain and human figures,
with surfaces that read as painted rather than as glossy figurines. The generated visual target
is north-star-painted-v1.png in the design reference folder.

Using 2D brush textures inside 3D material shaders is feasible and fits the existing direction
in `docs/art-bible.md`. A shader can sample painted marks to vary surface color, break up the
boundaries between lighting bands, and control grain. The camera still sees real geometry,
occlusion, and depth; the material determines how those forms are illustrated.

This note describes a candidate implementation, not a completed system or a new binding
decision. The authoritative constraints remain in `docs/art-bible.md` and
`docs/decisions/0001-painterly-look-in-materials.md`.

## Layers of the look

| Layer | Contribution |
|---|---|
| Painted base textures | Deliberate marks on cloth, stone, foliage, and earth, following their forms |
| Brush masks in the shader | Irregular transitions between shading bands and controlled color variation |
| Painted lighting | Warm highlights, local-color midtones, and cool hue-shifted shadows, following the art bible |
| Carefully shaped geometry | Readable silhouettes, credible human proportions, and convincing volume |
| Foliage and effect geometry | Painted crown masses, leaf shapes, and smoke puffs that influence outlines as well as surfaces |

A brush mask can be authored in grayscale and tinted by the material palette. Different masks
serve different surfaces: broad meadow dabs, directional grass flicks, dry-brush earth, blocky
stone marks, and tighter cloth grain. The existing brush-library specification lives in
`docs/art-bible.md` §7.

The shader should use these marks to shape the lighting response, rather than merely multiply
a grain image over otherwise smooth realistic shading. A candidate sequence is:

1. Read the surface's local color or palette-role mask.
2. Obtain its lighting and shadow information.
3. Use a stable brush mask to vary the transitions between the three lighting bands.
4. Select the band's warm or cool palette color and add restrained surface variation.
5. Apply any graphic rim treatment without erasing the figure's silhouette.

Static terrain lighting follows the existing bake strategy; moving figures receive runtime
lighting. See `docs/proposals/engine-design.md` for ownership of bakes and figure rendering.

## Make the paint stick to the surface

Stroke placement must remain stable while the camera pans, objects move, and soldiers animate.

| Surface | Suggested coordinates | Reason |
|---|---|---|
| Stationary terrain | World-space mapping, with directional masks where needed | Ground strokes remain anchored as the camera moves |
| Buildings and rigid props | UVs or object-local projection | Marks stay attached if the asset is moved or rotated |
| Animated soldiers | Authored UVs | Cloth marks follow the deformed mesh instead of sliding through it |

World-space projection on a moving soldier makes the soldier travel through a stationary paint
field. A screen-space overlay makes the paint stick to the screen. Neither provides the desired
surface attachment. Object-local projection can suit rigid objects, but does not by itself make
strokes follow skinned cloth deformation.

Triplanar projection is a candidate for surfaces where ordinary projection stretches badly;
its extra texture samples and directional blending need evaluation. It is not necessary for
every material.

## What brush textures cannot do alone

Surface textures cannot fix oversized heads, stiff poses, weak silhouettes, or overly detailed
asset geometry. They also cannot change an object's outline without an additional geometry or
coverage technique. Silhouette breakup therefore needs separate treatment, especially for trees
and smoke; it should remain restrained on soldiers so formations stay readable.

The generated hill image is a visual target, not evidence that a particular shader reproduces
it. Its composition, model proportions, stroke direction, palette, shadows, and atmosphere all
contribute. The miniature feeling should come from the overhead camera, scale relationships,
and staging, with living human proportions and direct contact with the ground.

Follow the existing top-down camera and no-sky rules. Gameplay depth should come from overlap,
scale, color temperature, and painted atmosphere; optical blur follows
`docs/decisions/0003-no-blur-in-gameplay.md`.

## Asset preparation

Generated Tripo meshes and textures are useful starting inputs. Inspect them before integrating
them: verify silhouette, material regions, UVs, and whether generated textures contain strong
directional highlights or shadows. Lighting already painted into a base-color texture can fight
the game's own shading as the object rotates or moves.

Keep intentional brush marks and material color variation, while separating lighting from base
color according to the model contract in `docs/art-bible.md` §5. A shared material system should
own the palette and shading response across terrain, buildings, and units.

## Small validation prototype

Start with one grassy hill, one tree, and one soldier under a shared lighting direction. Compare
plain materials against painted base textures, then add brush-shaped lighting transitions. This
isolates what each layer contributes before expanding to a battlefield.

Acceptance checks:

- Pan and rotate through the supported RTS camera range: strokes remain attached to surfaces.
- Animate and translate the soldier: cloth marks move with the figure without swimming.
- Zoom through the gameplay range: brushwork retains its character without excessive shimmer,
  visible tiling, or loss of formation readability.
- Compare lit and shadowed surfaces: shadows read as deliberate cool color, while volume and
  contact remain clear.
- Add a formation: figures remain distinguishable and more visually prominent than the terrain.
- Measure GPU time against the plain-material baseline, then evaluate representative scene
  density on target hardware. No performance claim is established by this note.

Stroke sizes, mipmaps, projection choices, and instance variation need tuning from these tests.
The first milestone is a stable painted look in motion, not an exact match to a single still.

## Supporting research

- [Disney: Painterly Rendering for Animation](https://disneyanimation.com/publications/painterly-rendering-for-animation/)
  identifies keeping paint attached to surfaces across animation as a central challenge.
- [Disney: Applying Painterly Concepts in a CG Film — Bolt](https://www.disneyanimation.com/publications/applying-painterly-concepts-in-a-cg-film---bolt/)
  describes massing detail into larger shapes and varying edge quality as important parts of
  painterly rendering. These support the principles above, rather than documenting the exact
  proposed RTS shader.
