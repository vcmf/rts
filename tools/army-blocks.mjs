// The army-colour blocks on the look page (src/look/lab.ts, __look.lab.addBlocks): the coats, and the cover's spots,
// shared by the readability guard (tools/guard.mjs), the coat check (tools/coat-check.mjs) and L5b's judging kit
// (tools/ablation-kit.mjs)
import { DYES } from '../src/rulesets/napoleonic-dyes.ts'
import { UNIFORMS } from '../src/rulesets/napoleonic-uniforms.ts'

// The blocks' coats: four of the era's uniforms (decision 0068), their coat's dye; the blocks are named by uniform.
// ARMY_COATS=<name>=<rrggbb>,… (four, names without dots, the '#' optional) in the environment: other coats for a
// test (the dye palette's, docs/plans/active/dye-palette.md)
export const BLOCK_UNIFORMS = ['fr-line', 'ru-line', 'at-line', 'br-line']
const coatOf = id => {
  const coat = Object.hasOwn(UNIFORMS, id) ? UNIFORMS[id].parts.coat : undefined
  if (coat === undefined || !Object.hasOwn(DYES.dyes, coat)) {
    throw new Error(`army-blocks: no coat dye for the uniform ${id}`)
  }
  return DYES.dyes[coat]
}
/** the four uniforms' coats, from the era's data (whatever the environment says) */
export const ERA_COATS = Object.fromEntries(BLOCK_UNIFORMS.map(id => [id, coatOf(id)]))
/** the blocks' coats from an ARMY_COATS spec, the era's uniforms' without one; a malformed spec throws */
export function coatsFrom(spec) {
  if (!spec) return ERA_COATS
  const out = {}
  for (const e of spec.split(',')) {
    const m = /^([^=.,]+)=#?([0-9a-fA-F]{6})$/.exec(e)
    if (!m || Object.hasOwn(out, m[1])) {
      throw new Error(`ARMY_COATS must be four distinct <name>=<rrggbb> ('#' optional), comma-separated, not ${e}`)
    }
    out[m[1]] = `#${m[2].toUpperCase()}`
  }
  if (Object.keys(out).length !== 4) throw new Error(`ARMY_COATS names ${Object.keys(out).length} coats, not 4`)
  return out
}
export const ARMY_HEX = coatsFrom(process.env.ARMY_COATS)
export const COATS = Object.keys(ARMY_HEX)
// the cover's spots (docs/plans/active/l5-macro.md): east of the hill, the coats on each class of the ground's cover
// that a 20 m line fits on, every block wholly on it: on the ploughed field (18 m across) lines along it, 4.5 m apart;
// on the road a column of march, the lines end to end along it; on the village ground as on the default view. (The 3 m
// track holds no line; the class check measures it.) Spots: name, x, z, the blocks' yaw (Babylon's: +yaw turns +x
// toward −z), the column's direction (rad from +x toward +z; +z by default) and the spacing (7 m by default)
// --view crops (docs/plans/done/stubble-height.md): the coats on a stubble field, its crops grown. The field's
// crops span about x 98 to 138, z 118 to 146; the blocks (20 by 3 m) lie along z, eight side by side at 4.5 m: x 101
// to 135, z 122 to 142, inside the crops by 3 m or more
export const CROP_SPOTS = [
  ['stubble-w', 109.25, 132, Math.PI / 2, 0, 4.5],
  ['stubble-e', 127.25, 132, Math.PI / 2, 0, 4.5],
]
export const COVER_SPOTS = [
  ['ploughed', 78, -38, -0.18, 0.18 + Math.PI / 2, 4.5],
  ['road', 185, -5, -Math.PI / 2, Math.PI / 2, 22],
  ['village', 228, -2, 0],
]
// one block per coat at each spot, in a column; color: one colour for every block, else each block its coat's name
export const blocksAt = (spots, color = null) =>
  spots.flatMap(([s, x, z, yaw, dir = Math.PI / 2, gap = 7]) =>
    COATS.map((c, i) => ({
      name: `${s}.${c}`,
      x: x + Math.cos(dir) * (i - 1.5) * gap,
      z: z + Math.sin(dir) * (i - 1.5) * gap,
      yaw,
      color: color ?? c,
    })),
  )
