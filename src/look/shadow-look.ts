// The simple shadows' look a zoom (decision 0062, docs/plans/active/soft-shadows-all.md): the close and far looks, how
// one turns into the other by the camera's distance, the gradient along each shadow from the soles, the strip each
// soldier draws it on, and the page's switches for them. Pure: src/look/units.ts gives the results to the decal's
// material (src/look/shaders/unitdecal.*), test/shadow-look.test.ts checks them.
import { sstep } from './noise.ts'

/** A look along each shadow from a contact at the soles to its tip (a real shadow's contact hardening). soft: the share
 *  of the soft bake at the tip (0: the shape's own blur, 1: the soft one; at the soles the shape's own); dark: the
 *  share of the ground's full shadow at the tip; foot: the share at the soles and over the contact's core (core, m
 *  from the soles), from where it turns to soft and dark toward the tip; len: its length along the sun from the soles
 *  (1: the shape's) */
export interface ShadowLook {
  soft: number
  dark: number
  foot: number
  core: number
  len: number
}
/** Up close (the owner, 2026-10-24: smaller, lighter, fuzzier, then darker and solid at the feet, lighter and softer
 *  away from them; softness 0.75 chosen from the review's sheet 7) and far (decision 0049's: one value end to
 *  end) */
export const SHADOW_LOOK: { readonly close: ShadowLook; readonly far: ShadowLook } = {
  close: { soft: 0.75, dark: 0.55, foot: 1.05, core: 0.4, len: 0.7 },
  far: { soft: 0, dark: 1, foot: 1, core: 0, len: 1 },
}
/** The band of the camera's distance to its focus (m) over which the close look turns into the far one */
export const SHADOW_LOOK_BAND: readonly [number, number] = [45, 85]

/** The share of the far look at the camera's distance r (m): a smoothstep across band, 0 at its start and nearer */
export function farShare(r: number, band: readonly [number, number]): number {
  return sstep(band[0], Math.max(band[1], band[0] + 1e-6), r)
}

/** The look between close (t 0) and far (t 1), written into out and returned */
export function lookBetween(close: ShadowLook, far: ShadowLook, t: number, out: ShadowLook): ShadowLook {
  const mix = (a: number, b: number) => a + (b - a) * t
  out.soft = mix(close.soft, far.soft)
  out.dark = mix(close.dark, far.dark)
  out.foot = mix(close.foot, far.foot)
  out.core = mix(close.core, far.core)
  out.len = mix(close.len, far.len)
  return out
}

/** The decal's gradient uniform for a look: [darkness at the soles, at the tip, the core's end, the tip], the last two
 *  in m from the soles; tipBase (m) is the tip at the shape's length, shortened with the look; the core is kept short
 *  of the tip (a smoothstep needs its edges apart) */
export function footUniform(l: ShadowLook, tipBase: number): [number, number, number, number] {
  const tip = tipBase * l.len
  return [l.foot, l.dark, Math.min(l.core, tip * 0.9), tip]
}

/** The along and across extent (m from a man's root, in the shadow's frame) of a box the shape fills */
export interface ShapeBox {
  across: readonly [number, number]
  along: readonly [number, number]
}
/** The strip a soldier draws his shadow on: its box [across start, along start, across span, along span] (m), and its
 *  four rows' places along it (0 to 1) */
export interface Strip {
  box: [number, number, number, number]
  rows: [number, number, number, number]
}
/** The strip a soldier draws his shadow on, by the look's far share t (0 close, 1 far: the same share as the look's,
 *  so it moves with the look and nothing jumps). Far, decision 0049's own: the box the shape alone fills (base) with
 *  its rows evenly spaced, as main draws it. Close: the full box (the soft bake's reach) with its second row at the
 *  soles (each triangle on one side of them, so a strip shortened past them keeps the feet where they are) and its
 *  third where the lift's ramp ends (liftRamp m along the drawn shadow, liftRamp / len along the shape), so the lift,
 *  linear between rows, is whole there and the grass and legs do not poke through near the feet. Between, the rows'
 *  places (m) and the box blended */
export function decalStrip(base: ShapeBox, full: ShapeBox, t: number, len: number, liftRamp: number): Strip {
  const boxOf = (b: ShapeBox): Strip['box'] => [
    b.across[0],
    b.along[0],
    b.across[1] - b.across[0],
    b.along[1] - b.along[0],
  ]
  if (t >= 1) return { box: boxOf(base), rows: [0, 1 / 3, 2 / 3, 1] }
  if (!(full.along[0] < 0 && full.along[1] > 0)) throw new Error('decalStrip: the box must hold the soles (along 0)')
  const ramp = Math.min(liftRamp / Math.max(len, 1e-3), full.along[1] * 0.9)
  const closeRows = [full.along[0], 0, ramp, full.along[1]]
  const bs = base.along[1] - base.along[0]
  const farRows = [0, 1 / 3, 2 / 3, 1].map(r => base.along[0] + r * bs)
  const fb = boxOf(full)
  const bb = boxOf(base)
  const mix = (a: number, b: number) => a + (b - a) * Math.max(0, t)
  const box = fb.map((v, i) => mix(v, bb[i])) as Strip['box']
  const rows = closeRows.map((v, i) => (mix(v, farRows[i]) - box[1]) / box[3]) as Strip['rows']
  return { box, rows }
}

/** The decal's rule at a fragment (src/look/shaders/unitdecal.frag, mirrored here for its tests): of the shape's value
 *  s at g along the gradient (0 at the core, 1 at the tip), the share of the samples it covers and the darkness every
 *  covered sample takes (the look's darkest, the same for every shadow: so where shadows overlap and the stencil lets
 *  the first through, the darkest share wins whatever their order) */
export function decalFragment(s: number, g: number, foot: number, dark: number): { cover: number; dark: number } {
  const dm = Math.max(foot, dark, 1e-4)
  return { cover: Math.min(1, (s * (foot + (dark - foot) * g)) / dm), dark: dm }
}

/** The figures' shadow modes from the page's switches: simpleFar (?ushadowfar=map: the map at every zoom, false),
 *  simpleClose (?ushadowclose=map: the map up close, false); by default the simple shadows at every zoom, no map */
export function shadowModes(q: URLSearchParams): { simpleFar: boolean; simpleClose: boolean } {
  for (const k of ['ushadowfar', 'ushadowclose']) {
    const v = q.get(k)
    if (v !== null && v !== 'map' && v !== 'simple') throw new Error(`?${k} must be map or simple, not ${v}`)
  }
  return { simpleFar: q.get('ushadowfar') !== 'map', simpleClose: q.get('ushadowclose') !== 'map' }
}

const NUMBER = /^\d+(\.\d+)?$/
/** ?<k>=<n>[,<n>…]: count numbers (any of counts), each within [lo, hi] (the pairs' second of each pair within
 *  [lo2, hi2] when given), or null when absent; an empty or malformed field is an error, not 0 */
export function parseNumbers(
  q: URLSearchParams,
  k: string,
  counts: readonly number[],
  [lo, hi]: readonly [number, number],
  second?: readonly [number, number],
): number[] | null {
  const v = q.get(k)
  if (v === null) return null
  const f = v.split(',')
  const n = f.map(Number)
  const ok =
    counts.includes(f.length) &&
    f.every((s, i) => {
      const [a, b] = second && i % 2 ? second : [lo, hi]
      return NUMBER.test(s) && n[i] >= a && n[i] <= b
    })
  if (!ok) {
    const range = second ? `${lo} to ${hi}, then ${second[0]} to ${second[1]}` : `each ${lo} to ${hi}`
    throw new Error(`?${k} must be ${counts.join(' or ')} numbers (${range}), not ${v}`)
  }
  return n
}

/** The looks the page's switches set (main.ts): ?ushsoft, ?ushdark (0 to 1), ?ushlen (0.3 to 1.5), each
 *  <close>[,<far>]; ?ushfoot=<dark 0..1.5>,<core 0..3 m>[,<far dark>,<far core>]; ?ushband=<r0>,<r1> (m, r0 < r1).
 *  Written into close and far; the band returned, or null */
export function applyLookParams(
  q: URLSearchParams,
  close: ShadowLook,
  far: ShadowLook,
): { band: [number, number] | null } {
  const pairs = [
    ['ushsoft', 'soft', 0, 1],
    ['ushdark', 'dark', 0, 1],
    ['ushlen', 'len', 0.3, 1.5],
  ] as const
  for (const [k, f, lo, hi] of pairs) {
    const n = parseNumbers(q, k, [1, 2], [lo, hi])
    if (!n) continue
    close[f] = n[0]
    if (n.length > 1) far[f] = n[1]
  }
  const foot = parseNumbers(q, 'ushfoot', [2, 4], [0, 1.5], [0, 3])
  if (foot) {
    Object.assign(close, { foot: foot[0], core: foot[1] })
    if (foot.length > 2) Object.assign(far, { foot: foot[2], core: foot[3] })
  }
  const band = parseNumbers(q, 'ushband', [2], [0, 1000])
  if (band && !(band[1] > band[0])) throw new Error(`?ushband must be <r0>,<r1> with r0 < r1, not ${q.get('ushband')}`)
  return { band: band ? [band[0], band[1]] : null }
}
