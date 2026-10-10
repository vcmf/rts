// The world's sizes, as the prototype typed them (prototypes/painted-cinematic.html). L0a turns this into a
// SPEC with derived sizes and load-time invariants (docs/plans/active/l0-spine.md,
// docs/proposals/engine-design.md §4).

export const TILE_W = 800          // the detailed tile (holds the river and the play area), m
export const FAR_W = 2600          // the far ring's square, m
export const TILE_SUB = 448        // tile grid cells per side: 1.79 m
export const FAR_SUB = 182         // far grid cells per side: 14.3 m, one far cell = 8 tile cells
export const FAR_CELL = FAR_W / FAR_SUB
export const BAND = TILE_W / 2 + FAR_CELL   // the far ring drops every triangle inside this half-size; the apron fills it
export const PLAY = 250            // the camera focus stays within ±PLAY in x and z
export const AO_N = 768            // canopy footprints → G channel of the light map, texels per side
export const MASK_N = 2048         // far-ring river mask, texels per side
export const REFL_N = 1536         // tree-reflection mask, texels per side
export const SM_N = 3072           // sun shadow map, texels per side
export const SM_FADE_M = 32        // shadows fade out over the shadow box's outer metres
export const LM_N = 3072           // light map texels per side: ~0.26 m over the tile
export const LZ0 = 100, LZ1 = 1600 // sun camera depth range
export const SBIAS = (0.96 / (LZ1 - LZ0)).toFixed(6)   // shadow bias = 0.96 m in the sun camera's depth

// the numbers the shaders read as macros (each text is what the prototype interpolated)
export const SHADER_DEFINES = [`#define SBIAS ${SBIAS}`, `#define FAR_W ${FAR_W.toFixed(1)}`, `#define TILE_HALF ${(TILE_W / 2).toFixed(1)}`, `#define TILE_W ${TILE_W.toFixed(1)}`]
