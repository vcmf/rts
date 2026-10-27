// The simple shadows' look a zoom (decision 0062, docs/plans/done/soft-shadows-all.md): the close and far looks, how
// one turns into the other by the camera's distance, the gradient along each shadow from the soles, the strip each
// soldier draws it on, and the page's switches for them. Pure: src/look/units.ts gives the results to the decal's
// material (src/look/shaders/unitdecal.*), test/shadow-look.test.ts checks them.
import { sstep } from './noise.ts'

/** A look along each shadow from a contact at the soles to its tip (a real shadow's contact hardening). soft: the share
 *  of the soft bake at the tip (0: the shape's own blur, 1: the soft one; at the soles the shape's own); dark: the
 *  share of the ground's full shadow at the tip; foot: the share at the soles and over the contact's core (core, m
 *  from the soles), from where it turns to soft and dark toward the tip; len: its length along the sun from the soles
 *  (1: the shape's); gain: the strength of its darkening at every point along it, foot and tip alike (1: the ground's
 *  own shade, as decision 0062 shipped it; above, the darkening's luminance raised to that power, its hue kept:
 *  shadowShade) */
export interface ShadowLook {
  soft: number
  dark: number
  foot: number
  core: number
  len: number
  gain: number
}
/** Up close (the owner, 2026-10-24: smaller, lighter, fuzzier, then darker and solid at the feet, lighter and softer
 *  away from them; softness 0.75 chosen from the review's sheet 7) and far (decision 0049's: one value end to
 *  end). The gain: the owner, 2026-10-26, "a bit too weak, can we make it darker": 2 up close, 1.5 far, chosen from
 *  the sheets of docs/plans/done/shadow-darker.md (no measurable cost on Metal) */
export const SHADOW_LOOK: { readonly close: ShadowLook; readonly far: ShadowLook } = {
  close: { soft: 0.75, dark: 0.55, foot: 1.05, core: 0.4, len: 0.7, gain: 2 },
  far: { soft: 0, dark: 1, foot: 1, core: 0, len: 1, gain: 1.5 },
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
  out.gain = mix(close.gain, far.gain)
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
 *  places (m) and the box blended. reach (m, 0 by default: as before): the base box grown to hold a disc of that radius
 *  about the root (the contact shadow's, decision 0071), never past the full box (the shape's
 *  cell: the strip never reads a neighbour's) */
export function decalStrip(base: ShapeBox, full: ShapeBox, t: number, len: number, liftRamp: number, reach = 0): Strip {
  const boxOf = (b: ShapeBox): Strip['box'] => [
    b.across[0],
    b.along[0],
    b.across[1] - b.across[0],
    b.along[1] - b.along[0],
  ]
  if (reach > 0) base = grownBox(base, full, reach)
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

/** box grown to hold a disc of radius r (m) about the root, within full */
function grownBox(box: ShapeBox, full: ShapeBox, r: number): ShapeBox {
  const grow = (b: readonly [number, number], f: readonly [number, number]): [number, number] => [
    Math.max(f[0], Math.min(b[0], -r)),
    Math.min(f[1], Math.max(b[1], r)),
  ]
  return { across: grow(box.across, full.across), along: grow(box.along, full.along) }
}

/** The decal's rule at a fragment (src/look/shaders/unitdecal.frag, mirrored here for its tests): of the shape's value
 *  s at g along the gradient (0 at the core, 1 at the tip), the share of the samples it covers and the darkness every
 *  covered sample takes (the look's darkest, the same for every shadow: so where shadows overlap and the stencil lets
 *  the first through, the darkest share wins whatever their order). The gain is not part of it: one value a frame for
 *  every shadow, it makes that darkness stronger alike for all (shadowShade), so the rule holds at any gain */
export function decalFragment(s: number, g: number, foot: number, dark: number): { cover: number; dark: number } {
  const dm = Math.max(foot, dark, 1e-4)
  return { cover: Math.min(1, (s * (foot + (dark - foot) * g)) / dm), dark: dm }
}

/** The luminance weights the gain measures the darkening by (Rec. 709, as the shader's) */
export const SHADE_LUMA: readonly [number, number, number] = [0.2126, 0.7152, 0.0722]

/** The full darkening a covered sample takes (unitdecal.frag, mirrored here for its tests): toward the ground's shade k
 *  (the ratio of its painted cast shadow to its light) by f (the zoom's cross-fade share, the shadows on, the look's
 *  darkest), clamped at 0, as before; then its luminance L raised to the gain, the three channels scaled alike
 *  (d · L^(gain-1)). So a stronger shadow never goes negative, darkens nothing where the ground is already in full
 *  shadow (k 1: d 1) and keeps the ground's shadow hue where no channel was clamped at 0; at gain 1 exactly the
 *  darkening as it was. Only this full darkness is raised to the gain: a shadow's lighter parts take it on a share of
 *  the pixel (decalPixel). The gain is at least 1 (applyLookParams), so no channel is ever brightened */
export function shadowShade(k: readonly number[], f: number, gain: number): [number, number, number] {
  const d = k.map(c => Math.max(1 + (c - 1) * f, 0))
  const m = Math.max(d[0] * SHADE_LUMA[0] + d[1] * SHADE_LUMA[1] + d[2] * SHADE_LUMA[2], 1e-3) ** (gain - 1)
  return [d[0] * m, d[1] * m, d[2] * m]
}

/** The scene's four samples' thresholds for alpha to coverage (the masks of smaller shares inside those of larger) */
export const COVER_THRESHOLDS: readonly number[] = [0.125, 0.375, 0.625, 0.875]

/** A pixel's darkening by one shadow of coverage a (unitdecal.frag, mirrored here for its tests): with COVERAGE (the
 *  scene's samples) the covered samples take the full gained darkening and the rest none, resolved as their mean;
 *  without (?msaa=1|2) the full gained darkening mixed toward none by a. The same wherever a falls on a whole number
 *  of samples */
export function decalPixel(
  k: readonly number[],
  f: number,
  gain: number,
  a: number,
  coverage: boolean,
): [number, number, number] {
  const d = shadowShade(k, f, gain)
  const share = coverage ? COVER_THRESHOLDS.filter(t => a > t).length / COVER_THRESHOLDS.length : a
  return [1 + (d[0] - 1) * share, 1 + (d[1] - 1) * share, 1 + (d[2] - 1) * share]
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

/** Whether the soldiers' simple shadows draw anywhere: armies on the page (?armies), their shadows on (not
 *  ?unitshadow=0), and the simple ones beyond close zoom (not ?ushadowfar=map: shadowModes). The page refuses
 *  ?armies=0 and any count outside 1 to 40 (src/look/main.ts), so a present ?armies means armies */
export function simpleShadowsDraw(q: URLSearchParams): boolean {
  return q.get('armies') !== null && q.get('unitshadow') !== '0' && shadowModes(q).simpleFar
}

/** Where the page puts a stencil buffer (#134), from its switches. The soldiers' simple shadows are its only use (each
 *  sample darkened once where shadows overlap): ?stencil=scene, the default, gives one to the scene's target alone
 *  (MSAA.stencil, src/look/post.ts) and only while they draw (simpleShadowsDraw), so without them the scene's depth
 *  stays DEPTH32_FLOAT, not DEPTH24_STENCIL8; ?stencil=all, the engine's own (the canvas and every target: the A/B);
 *  ?stencil=0, none */
export function stencilFor(q: URLSearchParams): 'none' | 'scene' | 'engine' {
  const v = q.get('stencil') ?? 'scene'
  if (!['scene', 'all', '0'].includes(v)) throw new Error(`?stencil must be scene, all or 0, not ${v}`)
  if (v === 'all') return 'engine'
  return v === 'scene' && simpleShadowsDraw(q) ? 'scene' : 'none'
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

/** The looks the page's switches set (main.ts): ?ushsoft, ?ushdark (0 to 1), ?ushlen (0.3 to 1.5), ?ushgain (1 to
 *  3, the darkening's strength: 1 as decision 0062 shipped it, never lighter), each <close>[,<far>];
 *  ?ushfoot=<dark 0..1.5>,<core 0..3 m>[,<far dark>,<far core>]; ?ushband=<r0>,<r1> (m, r0 < r1). Written into
 *  close and far; the band returned, or null */
export function applyLookParams(
  q: URLSearchParams,
  close: ShadowLook,
  far: ShadowLook,
): { band: [number, number] | null } {
  const pairs = [
    ['ushsoft', 'soft', 0, 1],
    ['ushdark', 'dark', 0, 1],
    ['ushlen', 'len', 0.3, 1.5],
    ['ushgain', 'gain', 1, 3],
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

/** Where the contact shadow sits (decision 0071): root, a disc about the man's root; stride, an oval over his feet's
 *  whole travel in his clip (one a clip, turned with his facing); step, an oval over his feet at the clip's step he is
 *  posed at (it follows them) */
export type ContactMode = 'root' | 'stride' | 'step'
/** The contact shadow under each soldier's feet and the cap on every shadow's darkness (decision 0071). pad (m): how
 *  far the oval reaches past the feet (root: the disc's radius); dark: its share of the cap's darkening (1: as dark as
 *  the cap allows, 0: none); soft: its fade past the oval, a share of its size; cap: the darkest any covered sample
 *  goes, the ground's shade's luminance raised to it (1: the ground's painted cast shadow, k); band (m, the camera's
 *  distance to its focus): the contact whole up to its start, fading out across it, none past its end */
export interface ShadowContact {
  mode: ContactMode
  pad: number
  dark: number
  soft: number
  cap: number
  band: readonly [number, number]
}
/** The contact and cap by default. The owner, 2026-10-27, from docs/plans/done/shadow-contact.md's candidates: the
 *  oval that follows the feet (step), fully soft, 0.9 of the cap's darkness, 0.1 m past the feet; the cap at about a
 *  tree's cast shadow (a tree's shadow is darker than the ground's shade k, its crown hiding sky too: L(k)^1.15 is
 *  about it, measured in the plan); and the oval only where feet show: whole to about the default zoom (63 m), gone
 *  by the wide one (125 m) */
export const SHADOW_CONTACT: Readonly<ShadowContact> = {
  mode: 'step',
  pad: 0.1,
  dark: 0.9,
  soft: 1,
  cap: 1.15,
  band: [60, 100],
}

/** The contact and cap from the page's switches, SHADOW_CONTACT's where not given: ?ushcontact=<pad m 0..1>,<dark
 *  0..1>[,<soft 0..1>] (0 alone, or a pad or darkness of 0: no contact), ?ushcontactat=root|stride|step,
 *  ?ushcap=<1..4> (the cap's exponent), ?ushcontactband=<r0>,<r1> (m, r0 < r1). Null with no contact and no ?ushcap:
 *  the shadows exactly as decision 0067 left them (the A/B) */
export function applyContactParams(q: URLSearchParams): ShadowContact | null {
  const d = SHADOW_CONTACT
  const c = parseNumbers(q, 'ushcontact', [1, 2, 3], [0, 1])
  if (c?.length === 1 && c[0] !== 0) throw new Error(`?ushcontact must be 0 or <pad>,<dark>[,<soft>], not ${c[0]}`)
  const capN = parseNumbers(q, 'ushcap', [1], [1, 4])
  const at = q.get('ushcontactat') ?? d.mode
  if (!['root', 'stride', 'step'].includes(at)) throw new Error(`?ushcontactat must be root, stride or step, not ${at}`)
  const band = parseNumbers(q, 'ushcontactband', [2], [0, 1000])
  if (band && !(band[1] > band[0])) {
    throw new Error(`?ushcontactband must be <r0>,<r1> with r0 < r1, not ${q.get('ushcontactband')}`)
  }
  const on = c === null || (c.length > 1 && c[0] > 0 && c[1] > 0)
  if (!on && !capN) return null
  return {
    mode: at as ContactMode,
    pad: !on ? 0 : c ? c[0] : d.pad,
    dark: !on ? 0 : c ? c[1] : d.dark,
    soft: c?.[2] ?? d.soft,
    cap: capN ? capN[0] : d.cap,
    band: band ? [band[0], band[1]] : d.band,
  }
}

/** The contact's weight at the camera's distance r (m) to its focus: 1 up to band's start, 0 from its end, a
 *  smoothstep between (the oval is for feet that show) */
export function contactWeight(r: number, band: readonly [number, number]): number {
  return 1 - farShare(r, band)
}

/** The gain the decal draws with (decision 0071): the look's within the contact's band; past it, where the decal
 *  draws with decision 0067's own uncapped shader (cheaper), no higher than the cap's exponent, so a fully covered
 *  pixel, L(k)^gain at the far look's full darkness, is still no darker than the cap's L(k)^cap; turned from one to
 *  the other by the contact's weight w, so nothing pops at the band's end (where the cap no longer binds the capped
 *  look gives the uncapped one's pixel). With the cap alone (no oval) or neither, the look's */
export function contactGain(gain: number, c: ShadowContact | null, w: number): number {
  if (!c || c.dark <= 0) return gain
  const far = Math.min(gain, c.cap)
  return far + (gain - far) * w
}

/** Whether the decal draws with the contact's oval this frame (its weight w): only within its band and with a
 *  darkness; else the material without it (no oval's varying, read or branch: the cap alone, units.ts useDecalFor) */
export function contactOvalOn(c: ShadowContact | null, w: number): boolean {
  return c !== null && c.dark > 0 && w > 0
}

/** The contact's uniform for the decal (uShContact: its pad, its darkness by its weight w, its softness, the cap) and
 *  the strip's reach (m) for it: at weight 0 the darkness 0 (the vertex shader skips the oval's read) and no reach
 *  (the strip as without a contact), so past the band only the cap is left */
export function contactUniform(
  c: ShadowContact,
  w: number,
  reach: number,
): { uniform: [number, number, number, number]; reach: number } {
  return { uniform: [c.pad, c.dark * w, c.soft, c.cap], reach: w > 0 && c.dark > 0 ? reach : 0 }
}

/** The contact's share of the cap's darkening at q (the fragment's place in the oval's own frame: 1 at its edge), dark
 *  its darkness, soft its fade: solid over the oval, fading to nothing at 1 + soft */
export function contactShare(q: readonly [number, number], dark: number, soft: number): number {
  return dark * (1 - sstep(1, 1 + Math.max(soft, 1e-4), Math.hypot(q[0], q[1])))
}

/** The luminance of a colour (SHADE_LUMA) */
export function luma(c: readonly number[]): number {
  return c[0] * SHADE_LUMA[0] + c[1] * SHADE_LUMA[1] + c[2] * SHADE_LUMA[2]
}

/** The cap's darkening (unitdecal.frag under SH_CAP, mirrored here for its tests): the ground's shade k with its
 *  luminance raised to cap, its hue kept (k · L(k)^(cap - 1): the factor baked once into the shade's alpha,
 *  unitshade.frag, so the decal raises nothing to a power for it), toward none by the zoom's cross-fade share f */
export function capShade(k: readonly number[], f: number, cap: number): [number, number, number] {
  const m = Math.max(luma(k), 1e-3) ** (cap - 1)
  return [1 + (k[0] * m - 1) * f, 1 + (k[1] * m - 1) * f, 1 + (k[2] * m - 1) * f]
}

/** The capped decal at a fragment (unitdecal.frag under SH_CAP, mirrored here for its tests): every covered sample
 *  takes the cap's darkening (capShade(k, f, cap): the same for every shadow at a pixel, so the darkest share still
 *  wins whatever the order), and the share is what gives the pixel the darkening the uncapped look would (the sun's
 *  shadow as decalFragment and the gain make it: its share of the gained full darkness), or the contact's, whichever
 *  is more, at most all of it: so no pixel goes darker than the cap, at any gain. k: the ground's shade; f: the zoom's
 *  cross-fade share (the shadows on); s, g, foot, dark, gain: the sun's shadow as before; contact: contactShare */
export function cappedCover(
  k: readonly number[],
  f: number,
  look: { s: number; g: number; foot: number; dark: number; gain: number; cap: number },
  contact: number,
): { cover: number; shade: [number, number, number] } {
  const fr = decalFragment(look.s, look.g, look.foot, look.dark)
  // (the gained darkness's luminance from the shade's, the mix being linear: the shader's one dot)
  const lg = Math.max(1 - (1 - luma(k)) * f * fr.dark, 1e-3) ** look.gain
  const shade = capShade(k, f, look.cap)
  const room = 1 - luma(shade)
  if (room < 1e-3) return { cover: 0, shade }
  return { cover: Math.min(1, Math.max((fr.cover * (1 - lg)) / room, contact)), shade }
}
