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
 *  end). The gain and the soles' darkness: decision 0067's 2 up close and 1.5 far, then the owner, 2026-10-27, of the
 *  shadows "darker and bluer than the tree shadow": no part darker than the ground's painted cast shadow, the shade
 *  k itself (gain 1, the soles 1; the solid foot is the contact's, SHADOW_CONTACT; decision 0071) */
export const SHADOW_LOOK: { readonly close: ShadowLook; readonly far: ShadowLook } = {
  close: { soft: 0.75, dark: 0.55, foot: 1, core: 0.4, len: 0.7, gain: 1 },
  far: { soft: 0, dark: 1, foot: 1, core: 0, len: 1, gain: 1 },
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
 *  places (m) and the box blended. reach (m, 0 by default: as before): the base and full boxes grown to hold a disc of
 *  that radius about the root (the contact shadow's, decision 0071), past the shape's cell where it must: the
 *  material with the oval reads no shape outside the cell (unitdecal.frag's vCell), so the strip may. rowsAt (m, 0 by
 *  default: as before): a figure on more than its root (SH_SPREAD, unitdecal.vert: drawn at its own length, its lift
 *  floored), its close rows at its contacts' reach and liftRamp past it, each held inside the box: the lift, linear
 *  between rows, rises across its footprint from the floor behind it to nearly whole at its contacts, so its shadow
 *  stands over the meadow's grass (from the root's ramp alone the grass hid it; its own legs measured unharmed:
 *  docs/plans/active/cavalry-artillery-demo.md) */
export function decalStrip(
  base: ShapeBox,
  full: ShapeBox,
  t: number,
  len: number,
  liftRamp: number,
  reach = 0,
  rowsAt = 0,
): Strip {
  const boxOf = (b: ShapeBox): Strip['box'] => [
    b.across[0],
    b.along[0],
    b.across[1] - b.across[0],
    b.along[1] - b.along[0],
  ]
  if (reach > 0) {
    base = grownBox(base, reach, len)
    full = grownBox(full, reach, len)
  }
  if (t >= 1) return { box: boxOf(base), rows: [0, 1 / 3, 2 / 3, 1] }
  if (!(full.along[0] < 0 && full.along[1] > 0)) throw new Error('decalStrip: the box must hold the soles (along 0)')
  const ramp = Math.min(liftRamp / Math.max(len, 1e-3), full.along[1] * 0.9)
  const closeRows =
    rowsAt > 0
      ? [
          full.along[0],
          Math.min(rowsAt, full.along[1] * 0.8),
          Math.min(rowsAt + liftRamp, full.along[1] * 0.9),
          full.along[1],
        ]
      : [full.along[0], 0, ramp, full.along[1]]
  const bs = base.along[1] - base.along[0]
  const farRows = [0, 1 / 3, 2 / 3, 1].map(r => base.along[0] + r * bs)
  const fb = boxOf(full)
  const bb = boxOf(base)
  const mix = (a: number, b: number) => a + (b - a) * Math.max(0, t)
  const box = fb.map((v, i) => mix(v, bb[i])) as Strip['box']
  const rows = closeRows.map((v, i) => (mix(v, farRows[i]) - box[1]) / box[3]) as Strip['rows']
  return { box, rows }
}

/** box grown to hold a disc of radius r (m) about the root, as drawn: past the soles the strip is drawn len as long
 *  (unitdecal.vert), so it reaches r / len along the shape there */
function grownBox(box: ShapeBox, r: number, len: number): ShapeBox {
  return {
    across: [Math.min(box.across[0], -r), Math.max(box.across[1], r)],
    along: [Math.min(box.along[0], -r), Math.max(box.along[1], r / Math.max(len, 1e-3))],
  }
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
/** The contact shadow under each soldier's feet (decision 0071). pad (m): how far the oval reaches past the feet
 *  (root: the disc's radius); dark: its darkness, a share of the ground's full shade (1: the ground's painted cast
 *  shadow, k, as a tree's shadow paints it; 0: none); soft: its fade past the oval, a share of its size; band (m, the
 *  camera's distance to its focus): the contact whole up to its start, fading out across it, none past its end */
export interface ShadowContact {
  mode: ContactMode
  pad: number
  dark: number
  soft: number
  band: readonly [number, number]
}
/** The contact by default. The owner, 2026-10-27: the oval that follows the feet (step), fully soft, 0.1 m past the
 *  feet, only where feet show (whole to about the default zoom, 63 m, gone by the wide one, 125 m); then, of the
 *  shadows being "darker and bluer than the tree shadow": its core exactly the ground's painted cast shadow (dark 1,
 *  the shade k itself: docs/plans/done/shadow-contact.md, "Matching the trees") */
export const SHADOW_CONTACT: Readonly<ShadowContact> = {
  mode: 'step',
  pad: 0.1,
  dark: 1,
  soft: 1,
  band: [60, 100],
}
/** m: the least lift of the decal with the contact's oval (unitdecal.vert): its half behind the soles, where the
 *  lift is otherwise 0, lies at the ground's sampled height, and the terrain can stand a little higher there and hide
 *  it (the oval cut along the soles, the owner, 2026-10-27); 3 cm keeps it drawn, and darkens no boot (8 cm did) */
export const CONTACT_FLOOR = 0.03

/** The decal's lift toward the camera (m) a distance along (m from the soles, along the shadow) (unitdecal.vert,
 *  mirrored here for its tests): lift, the decal's (Units.decalLift), grown over ramp m past the soles (none on his
 *  shins), and with the contact's oval at least CONTACT_FLOOR */
export function decalLift(along: number, lift: number, ramp: number, oval: boolean): number {
  const l = lift * sstep(0, ramp, along)
  return oval ? Math.max(l, CONTACT_FLOOR) : l
}

/** The share of the way the ground's shade is turned toward its own grey, its luminance kept, by default (bakes.ts
 *  unitShade, unitshade.frag): the shade of the ground's macro colour is bluer than a tree's painted shadow on the
 *  grass; measured in the plan ("Matching the trees") */
export const SHADE_DESAT = 0.65

/** The contact from the page's switches: off by default since decision 0074 (the per-step shape holds the feet);
 *  ?ushcontact=1 decision 0071's (SHADOW_CONTACT), ?ushcontact=<pad m 0..1>,<dark 0..1>[,<soft 0..1>] (a pad or
 *  darkness of 0: none; SHADOW_CONTACT's where not given), ?ushcontact=0 none; ?ushcontactat=root|stride|step,
 *  ?ushcontactband=<r0>,<r1> (m, r0 < r1) shape it when it is on, and are an error without it. Null with none: the
 *  oval's material not made */
export function applyContactParams(q: URLSearchParams): ShadowContact | null {
  const d = SHADOW_CONTACT
  const c = parseNumbers(q, 'ushcontact', [1, 2, 3], [0, 1])
  if (c?.length === 1 && c[0] !== 0 && c[0] !== 1) {
    throw new Error(`?ushcontact must be 0, 1 or <pad>,<dark>[,<soft>], not ${c[0]}`)
  }
  const at = q.get('ushcontactat') ?? d.mode
  if (!['root', 'stride', 'step'].includes(at)) throw new Error(`?ushcontactat must be root, stride or step, not ${at}`)
  const band = parseNumbers(q, 'ushcontactband', [2], [0, 1000])
  if (band && !(band[1] > band[0])) {
    throw new Error(`?ushcontactband must be <r0>,<r1> with r0 < r1, not ${q.get('ushcontactband')}`)
  }
  const whole = c?.length === 1 && c[0] === 1
  const on = whole || (c !== null && c.length > 1 && c[0] > 0 && c[1] > 0)
  if (!c || !on) {
    for (const k of ['ushcontactat', 'ushcontactband']) {
      if (q.has(k)) throw new Error(`?${k} shapes the contact's oval: it needs ?ushcontact=1 (or <pad>,<dark>)`)
    }
    return null
  }
  return {
    mode: at as ContactMode,
    pad: whole ? d.pad : c[0],
    dark: whole ? d.dark : c[1],
    soft: c?.[2] ?? d.soft,
    band: band ? [band[0], band[1]] : d.band,
  }
}

/** ?ushdesat=<0..1>: the share of the way the ground's shade is turned toward its own grey (SHADE_DESAT by default; 0:
 *  the shade as decision 0049 baked it) */
export function shadeDesat(q: URLSearchParams): number {
  return parseNumbers(q, 'ushdesat', [1], [0, 1])?.[0] ?? SHADE_DESAT
}

/** The contact's weight at the camera's distance r (m) to its focus: 1 up to band's start, 0 from its end, a
 *  smoothstep between (the oval is for feet that show) */
export function contactWeight(r: number, band: readonly [number, number]): number {
  return 1 - farShare(r, band)
}

/** Whether the decal draws with the contact's oval this frame (its weight w): only within its band and with a
 *  darkness; else the material without it (no oval's varying, read or cell test: decision 0062's; units.ts
 *  useDecalFor) */
export function contactOvalOn(c: ShadowContact | null, w: number): boolean {
  return c !== null && c.dark > 0 && w > 0
}

/** The contact's uniform for the decal (uShContact: its pad, its darkness by its weight w, its softness) and the
 *  strip's reach (m) for it: the reach only while the material with the oval draws (near; the other has no vCell, so
 *  its strip must stay within the shape's cell), none at weight 0 */
export function contactUniform(
  c: ShadowContact | null,
  w: number,
  reach: number,
  near: boolean,
): { uniform: [number, number, number, number] | null; reach: number } {
  if (!c) return { uniform: null, reach: 0 }
  // (the fourth unused)
  return { uniform: [c.pad, c.dark * w, c.soft, 0], reach: near && w > 0 && c.dark > 0 ? reach : 0 }
}

/** How far the contact reaches from a man's root (m) over every baked step's oval (contactOvals: cx, cz, ax, az a
 *  step), grown by pad and faded out to 1 + soft of its size: what the strip must hold (decalStrip's reach) */
export function contactReachOf(ovals: Float32Array, pad: number, soft: number): number {
  let r = 0
  for (let i = 0; i < ovals.length; i += 4) {
    r = Math.max(r, Math.hypot(ovals[i], ovals[i + 1]) + (Math.max(ovals[i + 2], ovals[i + 3]) + pad) * (1 + soft))
  }
  return r
}

/** A point of the strip in the contact's oval frame (unitdecal.vert, mirrored here for its tests): (across, along) m
 *  from the root in the shadow's frame (along past the soles as drawn, the look's length applied), the man turned by
 *  facing (rad, as shadowShape turns him), dir the shadow's direction on the ground; ov his step's oval [cx, cz, ax,
 *  az], grown by pad; 1 at the oval's edge */
export function contactPoint(
  across: number,
  along: number,
  facing: number,
  dir: readonly [number, number],
  ov: readonly number[],
  pad: number,
): [number, number] {
  const C = [-dir[1], dir[0]]
  const px = C[0] * across + dir[0] * along
  const pz = C[1] * across + dir[1] * along
  const ca = Math.cos(facing)
  const sa = Math.sin(facing)
  // (his axes on the ground: the matrix's first and third columns, x (ca, -sa) and z (sa, ca))
  const fx = px * ca - pz * sa
  const fz = px * sa + pz * ca
  return [(fx - ov[0]) / Math.max(ov[2] + pad, 1e-3), (fz - ov[1]) / Math.max(ov[3] + pad, 1e-3)]
}

/** The contact's share of the ground's full shade at q (the fragment's place in the oval's own frame: 1 at its
 *  edge), dark its darkness, soft its fade: solid over the oval, fading to nothing at 1 + soft */
export function contactShare(q: readonly [number, number], dark: number, soft: number): number {
  return dark * (1 - sstep(1, 1 + Math.max(soft, 1e-4), Math.hypot(q[0], q[1])))
}

/** The luminance of a colour (SHADE_LUMA) */
export function luma(c: readonly number[]): number {
  return c[0] * SHADE_LUMA[0] + c[1] * SHADE_LUMA[1] + c[2] * SHADE_LUMA[2]
}

/** The decal's rule at a fragment with the contact (unitdecal.frag under SH_CONTACT, mirrored here for its tests):
 *  decalFragment's, the contact's share ct (contactShare) one more darkness in it, its darkness c (its uniform's, by
 *  its weight) among the look's: the share of the samples covered and the darkness every covered sample takes, the
 *  same for every shadow, so the darkest share still wins whatever the order */
export function contactFragment(
  s: number,
  g: number,
  foot: number,
  dark: number,
  c: number,
  ct: number,
): { cover: number; dark: number } {
  const dm = Math.max(foot, dark, c, 1e-4)
  return { cover: Math.min(1, Math.max(s * (foot + (dark - foot) * g), ct) / dm), dark: dm }
}

/** The ground's shade turned toward its own grey by desat, its luminance kept (unitshade.frag under SH_DESAT) */
export function desaturated(k: readonly number[], desat: number): [number, number, number] {
  const l = luma(k)
  return [k[0] + (l - k[0]) * desat, k[1] + (l - k[1]) * desat, k[2] + (l - k[2]) * desat]
}

/** One of the decal's two materials (units.ts): with the contact's oval (near) or without (far) */
export type DecalSide = 'near' | 'far'
/** The background compile's state (units.ts useDecalFor): whether the material not drawn is ready, and the frames
 *  asked so far (of the one wanted, or of the idle one) */
export interface DecalPoll {
  idleReady: boolean
  polls: number
}
/** A frame's step of the decal's material (units.ts useDecalFor): switch to the wanted one only once it is ready (a
 *  material not ready draws nothing), and after a switch ask the new idle one afresh; else ask the idle one until it is
 *  ready. Every unanswered ask counts against limit, the wanted one's too; at limit, give up (gaveUp: the frame to warn
 *  once) and stay on the one drawn. ready(side): asks that material (compiling it if needed) */
export function decalStep(
  want: DecalSide,
  drawn: DecalSide,
  poll: DecalPoll,
  ready: (side: DecalSide) => boolean,
  limit: number,
): { switchTo: DecalSide | null; poll: DecalPoll; gaveUp: boolean } {
  if (poll.polls >= limit) return { switchTo: null, poll, gaveUp: false }
  if (want !== drawn) {
    if (ready(want)) return { switchTo: want, poll: { idleReady: false, polls: 0 }, gaveUp: false }
    const polls = poll.polls + 1
    return { switchTo: null, poll: { idleReady: poll.idleReady, polls }, gaveUp: polls === limit }
  }
  if (poll.idleReady) return { switchTo: null, poll, gaveUp: false }
  if (ready(drawn === 'near' ? 'far' : 'near')) {
    return { switchTo: null, poll: { idleReady: true, polls: poll.polls }, gaveUp: false }
  }
  const polls = poll.polls + 1
  return { switchTo: null, poll: { idleReady: false, polls }, gaveUp: polls === limit }
}

/** The background compile's state after the materials' defines change (units.ts setFarScale, setLodFade): both to be
 *  compiled again, with a fresh budget */
export function decalDefinesChanged(): DecalPoll {
  return { idleReady: false, polls: 0 }
}

/** The shadow's shape baked per animation step (?ushstep, docs/plans/done/step-shadows.md, #229): steps, the bins a
 *  clip (at most; a clip of fewer steps gets one a step); facings, the shape's facings; blend, two bins mixed by the
 *  man's step between their centres (four reads), else the bin he is in held (two) */
export interface StepShadow {
  steps: number
  facings: number
  blend: boolean
}
/** The per-step shape by default (decision 0074, the owner's pick, 2026-10-27): 8 bins a clip, 8 facings, held */
export const STEP_SHADOW: Readonly<StepShadow> = { steps: 8, facings: 8, blend: false }
/** ?ushstep=<steps 1..32>[,<facings 4..32>[,hold|blend]] (absent: STEP_SHADOW; 0: today's shape, averaged over the
 *  clip, null, decision 0062's); the facings 8 and hold by default. A setting whose atlas cannot fit 4096 texels a side
 *  (at 16 facings, more than 12 steps) is refused at load (stepAtlasLayout, src/look/units-data.ts) */
export function applyStepParams(q: URLSearchParams): StepShadow | null {
  const v = q.get('ushstep')
  if (v === null) return { ...STEP_SHADOW }
  const f = v.split(',')
  const steps = Number(f[0])
  const facings = f.length > 1 ? Number(f[1]) : STEP_SHADOW.facings
  const mode = f[2] ?? 'hold'
  const whole = (s: string | undefined) => s !== undefined && /^\d+$/.test(s)
  const ok =
    f.length <= 3 &&
    whole(f[0]) &&
    steps <= 32 &&
    (f.length < 2 || (whole(f[1]) && facings >= 4 && facings <= 32)) &&
    (mode === 'hold' || mode === 'blend')
  if (!ok) throw new Error(`?ushstep must be <steps 0..32>[,<facings 4..32>[,hold|blend]], not ${v}`)
  if (steps === 0) return null
  return { steps, facings, blend: mode === 'blend' }
}

/** The band of the camera's distance to its focus (m) where the per-step shape gives way to the averaged one: whole
 *  to its start, drawn to its end (decision 0074; ?ushnearband) */
export const NEAR_BAND: readonly [number, number] = [60, 100]
/** ?ushnearband=<r0>,<r1> (m, r0 < r1): the per-step shape's band (NEAR_BAND when absent) */
export function applyNearBandParams(q: URLSearchParams): [number, number] {
  const b = parseNumbers(q, 'ushnearband', [2], [0, 1000])
  if (b && !(b[1] > b[0])) throw new Error(`?ushnearband must be <r0>,<r1> with r0 < r1, not ${q.get('ushnearband')}`)
  return b ? [b[0], b[1]] : [NEAR_BAND[0], NEAR_BAND[1]]
}
/** The contact oval's own weight at the camera's distance r (m): contactWeight over its band, 0 without one */
export function ovalWeight(c: ShadowContact | null, r: number): number {
  return c && c.dark > 0 ? contactWeight(r, c.band) : 0
}
/** The near material's weight at the camera's distance r (m): the larger of the oval's (its own band) and, with the
 *  per-step shape (steps), the per-step band's (band: ?ushnearband); 0 with neither */
export function nearWeight(
  c: ShadowContact | null,
  steps: boolean,
  r: number,
  band: readonly [number, number],
): number {
  return Math.max(ovalWeight(c, r), steps ? contactWeight(r, band) : 0)
}
/** Whether the decal draws with its near material this frame (weight w): the contact's oval (contactOvalOn) or the
 *  per-step shape, within the band; else the far one (today's shape, decision 0062's material) */
export function nearOn(c: ShadowContact | null, steps: boolean, w: number): boolean {
  return contactOvalOn(c, w) || (steps && w > 0)
}

/** The per-step shape's foot sharpening at a fragment along m from the soles (unitdecal.frag under SH_STEPS,
 *  mirrored here for its tests): its share of the samples multiplied by boost at the soles (and behind them), back to
 *  1 by reach m along the shadow (a smoothstep). The share is capped at 1, so the feet go darker and crisper-edged,
 *  never past the look's darkest (the ground's shade k at foot 1, gain 1): the trees' cast shadow, decision 0071 */
export function footSharpen(along: number, boost: number, reach: number): number {
  return boost + (1 - boost) * sstep(0, Math.max(reach, 1e-3), along)
}
/** The per-step shape's foot sharpening by default (decision 0074, the owner's pick B, 2026-10-27): the share at
 *  the soles three times, back to 1 by 0.6 m */
export const FOOT_SHARP: readonly [number, number] = [3, 0.6]
/** ?ushfootk=<boost 1..4>[,<reach m 0..1>]: the per-step shape's foot sharpening (footSharpen); FOOT_SHARP when
 *  absent, the reach 0.6 m when not given; 1: none */
export function applyFootSharpParams(q: URLSearchParams): [number, number] {
  const n = parseNumbers(q, 'ushfootk', [1, 2], [1, 4], [0, 1])
  return n ? [n[0], n[1] ?? FOOT_SHARP[1]] : [FOOT_SHARP[0], FOOT_SHARP[1]]
}
