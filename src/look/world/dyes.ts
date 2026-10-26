// The dye palette (docs/plans/active/dye-palette.md, decision 0068): an era's uniforms name dyes by cloth part
// (src/rulesets/<era>-uniforms.ts, <era>-dyes.ts), resolved here into the colours by the figure's roles that the
// renderer paints (a Uniform, src/sim/ruleset.ts). No era named (decision 0015): the dyes and the dress are data;
// the parts are garments any era's figure wears. No Babylon: the tests read it in Node.
import type { ClothPart, Dress, DyeSet, Uniform } from '../../sim/ruleset.ts'
import type { Battalion } from './armies.ts'

/** what each of the figure's colour roles (tools/bake-figure.py's palette) shows: a cloth part, the boots, or a
 *  material (by name, the dye set's materials). The line infantryman's, the one baked figure: its 'white' role holds
 *  the breeches, the waistcoat, the lapels and the belts at once, and its 'dark' role the headgear with the boots and
 *  gaiters; so here the white role shows the trousers and the dark role the boots, and a dress's waistcoat and
 *  headgear show on no role of this figure (the plan's gaps). A stand-in until the bake writes each role's part */
export const FIGURE_PARTS: Readonly<Record<string, ClothPart | 'boots' | { material: string }>> = {
  coat: 'coat',
  facings: 'facings',
  white: 'trousers',
  dark: 'boots',
  skin: { material: 'skin' },
  leather: { material: 'leather' },
  pack: { material: 'pack' },
  wood: { material: 'wood' },
  metal: { material: 'metal' },
}

/** a dress resolved into a uniform for the figure's roles (FIGURE_PARTS): each part's dye looked up by name, the
 *  flag's bands among the flag dyes; the boots the set's. greatcoat: worn by every man (the all-greatcoat test; the
 *  share by the cold is a later step), over the coat and the facings (it has no coloured facings; the belts, the
 *  trousers below it and the headgear stay); a dress without one keeps its coat. An unknown dye, flag dye, material
 *  or part: a loud failure */
export function dressed(d: Dress, set: DyeSet, { greatcoat = false } = {}): Uniform {
  const look = (table: Readonly<Record<string, string>>, name: string, what: string) => {
    const hex = table[name]
    if (!hex) throw new Error(`dyes: ${d.id}'s ${what} names no dye ${name} (${Object.keys(table).join(', ')})`)
    return hex
  }
  const dye = (name: string, what: string) => look(set.dyes, name, what)
  const over = greatcoat ? d.parts.greatcoat : undefined
  const colours: Record<string, string> = {}
  for (const [role, part] of Object.entries(FIGURE_PARTS)) {
    if (typeof part === 'object') {
      const hex = set.materials[part.material]
      if (!hex) throw new Error(`dyes: the set has no material ${part.material} (the figure's ${role} role)`)
      colours[role] = hex
    } else if (part === 'boots') {
      colours[role] = dye(set.boots, 'boots')
    } else {
      const name = over !== undefined && (part === 'coat' || part === 'facings') ? over : d.parts[part]
      if (name === undefined) throw new Error(`dyes: ${d.id} names no dye for its ${part} (the figure's ${role} role)`)
      colours[role] = dye(name, part)
    }
  }
  return {
    id: d.id,
    colours,
    flag: d.flag.map(n => look(set.flags, n, 'flag')),
    ...(d.far ? { far: d.far } : {}),
  }
}

/** every dress of an era resolved (dressed), by id */
export const dressAll = (
  dress: Readonly<Record<string, Dress>>,
  set: DyeSet,
  opts: { greatcoat?: boolean } = {},
): Record<string, Uniform> => Object.fromEntries(Object.entries(dress).map(([id, d]) => [id, dressed(d, set, opts)]))

/** ?dye=<dye>:<#rrggbb>[;…], a test switch: the set with those cloth dyes' values swapped (every uniform that names
 *  the dye follows). null or '': the set as it is. A malformed entry, an unknown dye or a dye named twice: a loud
 *  failure */
export function dyeOverride(spec: string | null, set: DyeSet): DyeSet {
  if (spec === null || spec === '') return set
  const dyes: Record<string, string> = { ...set.dyes }
  const seen = new Set<string>()
  for (const e of spec.split(';')) {
    const m = /^([^:;]+):#?([0-9a-fA-F]{6})$/.exec(e)
    if (!m) throw new Error(`?dye must be <dye>:<#rrggbb>[;…], not ${e}`)
    const [, name, hex] = m
    if (!set.dyes[name]) throw new Error(`?dye: no dye ${name} (${Object.keys(set.dyes).join(', ')})`)
    if (seen.has(name)) throw new Error(`?dye names the dye ${name} twice`)
    seen.add(name)
    dyes[name] = `#${hex.toUpperCase()}`
  }
  return { ...set, dyes }
}

/** the battalions with each side's uniforms worn in turn (the k-th battalion of side s wears sides[s][k mod n], in
 *  the layout's order: its lines first). A side without a list keeps its own */
export function wearInTurn(battalions: readonly Battalion[], sides: readonly (readonly string[])[]): Battalion[] {
  const k = sides.map(() => 0)
  return battalions.map(b => {
    const l = sides[b.side]
    if (!l || l.length === 0) return b
    return { ...b, uniform: l[k[b.side]++ % l.length] }
  })
}

/** CIE L*a*b* (D65) of an sRGB hex colour */
export function labOf(hex: string): [number, number, number] {
  const f = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const [r, g, b] = [f(1), f(3), f(5)]
  const k = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116)
  const x = k((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047)
  const y = k(0.2126 * r + 0.7152 * g + 0.0722 * b)
  const z = k((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883)
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
}
/** the CIE76 colour difference of two sRGB hex colours */
export function deltaE(a: string, b: string): number {
  const [p, q] = [labOf(a), labOf(b)]
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])
}
