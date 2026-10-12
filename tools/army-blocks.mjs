// The army-colour blocks on the look page (src/look/lab.ts, __look.lab.addBlocks): the coats, and the cover's spots,
// shared by the readability guard (tools/guard.mjs) and L5b's judging kit (tools/ablation-kit.mjs).
export const ARMY_HEX = { France: '#2C4FA8', Russia: '#2F6B3C', Austria: '#E9E3D3', Britain: '#B3302A' }   // docs/art-bible.md §4
export const COATS = Object.keys(ARMY_HEX)
// the cover's spots (docs/plans/active/l5-macro.md): east of the hill, the coats on each class of the ground's cover that
// a 20 m line fits on, every block wholly on it: on the ploughed field (18 m across) lines along it, 4.5 m apart; on
// the road a column of march, the lines end to end along it; on the village ground as on the default view. (The 3 m
// track holds no line; the class check measures it.) Spots: name, x, z, the blocks' yaw (Babylon's: +yaw turns +x
// toward −z), the column's direction (rad from +x toward +z; +z by default) and the spacing (7 m by default)
export const COVER_SPOTS = [['ploughed', 78, -38, -0.18, 0.18 + Math.PI / 2, 4.5], ['road', 185, -5, -Math.PI / 2, Math.PI / 2, 22], ['village', 228, -2, 0]]
// one block per coat at each spot, in a column; color: one colour for every block, else each block its coat's name
export const blocksAt = (spots, color = null) => spots.flatMap(([s, x, z, yaw, dir = Math.PI / 2, gap = 7]) => COATS.map((c, i) => ({ name: `${s}.${c}`, x: x + Math.cos(dir) * (i - 1.5) * gap, z: z + Math.sin(dir) * (i - 1.5) * gap, yaw, color: color ?? c })))
