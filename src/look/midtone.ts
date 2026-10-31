// The mid tone (docs/plans/done/soft-midtone.md, decision 0084): how wide the painter's ramp turns from light to
// shade, by material class. The default (no ?midtone) is the owner's pick, MIDTONE_DEFAULT: the figure's turn on the
// units (3), the wide mid tone on the buildings and the nature meshes (2), the ground's bands as before (0).
// ?midtone=0|1|2 sets every class (0: the three bands with edges 0.08 wide, the look before decision 0084; 1: soft band
// edges; 2: a wide mid tone, the light wrapped round the form); ?midtone=u3,b2,n2,g0 sets each class (u the units,
// b the buildings, n the nature meshes, g the ground; 3, the figure's turn, for the units alone), a class left out at
// 0. The painter (src/look/shaders/painter.glsl) reads the defines; the crowns keep their own ramp.

/** A material class's letter in ?midtone and in its define (MIDn_<letter>). */
export const MIDTONE_CLASSES = ['u', 'b', 'n', 'g'] as const
/** A material class: u the units, b the buildings, n the nature meshes, g the ground. */
export type MidtoneClass = (typeof MIDTONE_CLASSES)[number]
/** A class's mode: 0 the hard bands, 1 soft band edges, 2 a wide mid tone, 3 the figure's turn (units only). */
export type MidtoneMode = 0 | 1 | 2 | 3
/** The modes of every class. */
export type Midtone = Record<MidtoneClass, MidtoneMode>

/** The page's default (decision 0084, the owner's pick of 2026-10-30): u3, b2, n2, the ground at 0. */
export const MIDTONE_DEFAULT: Readonly<Midtone> = Object.freeze({ u: 3, b: 2, n: 2, g: 0 })

// a class's mode from its digit: 0, 1 or 2, and 3 for the units alone (the figure's turn)
const mode = (v: string, raw: string, units: boolean): MidtoneMode => {
  if (v === '0' || v === '1' || v === '2' || (units && v === '3')) return Number(v) as MidtoneMode
  throw new Error(`?midtone=${raw}: a mode is 0, 1 or 2 (3 for the units alone, u3)`)
}

/**
 * The modes ?midtone asks for, by class (null or empty: MIDTONE_DEFAULT). Throws on a malformed value or a class
 * named twice, so a typo never judges one look as another.
 */
export const parseMidtone = (raw: string | null): Midtone => {
  if (raw === null || raw === '') return { ...MIDTONE_DEFAULT }
  const m: Midtone = { u: 0, b: 0, n: 0, g: 0 }
  if (/^\d$/.test(raw)) {
    const v = mode(raw, raw, false)
    for (const k of MIDTONE_CLASSES) m[k] = v
    return m
  }
  const seen = new Set<string>()
  for (const part of raw.split(',')) {
    const k = part.slice(0, 1) as MidtoneClass
    if (!MIDTONE_CLASSES.includes(k) || part.length !== 2) {
      throw new Error(`?midtone=${raw}: each part is a class (u, b, n, g) and a mode, e.g. u2`)
    }
    if (seen.has(k)) throw new Error(`?midtone=${raw}: the class ${k} is named twice`)
    seen.add(k)
    m[k] = mode(part.slice(1), raw, k === 'u')
  }
  return m
}

/** The painter's defines for the modes: one MIDn_<CLASS> for each class not at 0. */
export const midtoneDefines = (m: Midtone): string[] =>
  MIDTONE_CLASSES.filter(k => m[k] > 0).map(k => `#define MID${m[k]}_${k.toUpperCase()}`)
