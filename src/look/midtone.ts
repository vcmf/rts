// The mid tone's switch (docs/plans/active/soft-midtone.md, decision 0084, proposed): how wide the painter's ramp turns
// from light to shade, by material class, so the owner can judge each. ?midtone=0|1|2 sets every class (0: main's
// three bands with edges 0.08 wide; 1: soft band edges; 2: a wide mid tone, the light wrapped round the form);
// ?midtone=u2,b1,n1,g0 sets each class (u the units, b the buildings, n the nature meshes, g the ground), a class left
// out at 0. The painter (src/look/shaders/painter.glsl) reads the defines; the crowns keep their own ramp.

/** A material class's letter in ?midtone and in its define (MIDn_<letter>). */
export const MIDTONE_CLASSES = ['u', 'b', 'n', 'g'] as const
export type MidtoneClass = (typeof MIDTONE_CLASSES)[number]
export type Midtone = Record<MidtoneClass, 0 | 1 | 2>

const mode = (v: string, raw: string): 0 | 1 | 2 => {
  if (v === '0' || v === '1' || v === '2') return Number(v) as 0 | 1 | 2
  throw new Error(`?midtone=${raw}: a mode is 0, 1 or 2`)
}

/**
 * The modes ?midtone asks for, by class (null or empty: main's, every class at 0). Throws on a malformed value, so a
 * typo never judges main's look as the branch's.
 */
export const parseMidtone = (raw: string | null): Midtone => {
  const m: Midtone = { u: 0, b: 0, n: 0, g: 0 }
  if (raw === null || raw === '') return m
  if (/^\d$/.test(raw)) {
    const v = mode(raw, raw)
    for (const k of MIDTONE_CLASSES) m[k] = v
    return m
  }
  for (const part of raw.split(',')) {
    const k = part.slice(0, 1) as MidtoneClass
    if (!MIDTONE_CLASSES.includes(k) || part.length !== 2) {
      throw new Error(`?midtone=${raw}: each part is a class (u, b, n, g) and a mode, e.g. u2`)
    }
    m[k] = mode(part.slice(1), raw)
  }
  return m
}

/** The painter's defines for the modes: one MIDn_<CLASS> for each class not at 0. */
export const midtoneDefines = (m: Midtone): string[] =>
  MIDTONE_CLASSES.filter(k => m[k] > 0).map(k => `#define MID${m[k]}_${k.toUpperCase()}`)
