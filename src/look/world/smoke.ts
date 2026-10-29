// Musket smoke's pure parts (docs/plans/active/smoke-bank.md, decision 0083): when the scripted battalions' ranks go
// off, the puffs a volley leaves along the front, a puff's motion, growth, opacity and thinning with age (mirrored by
// src/look/shaders/smoke.vert and smoke.frag), the formations' mask and the opacity cap it sets over them, the zoom's
// thinning, and the page's switches. No Babylon: the tests read it in Node. The engine names no weapon: the smoke's
// values are the era's (PuffDef, src/rulesets/<era>-smoke.ts), the shot's moment the figure's own clip event.
import type { PuffDef } from '../../sim/ruleset.ts'
import { CYCLE, RANK_LAG, slots, type Battalion, type Drill } from './armies.ts'

/** a clip of the figure registry (data/figures/index.json): its length in source frames and its events' frames */
export interface ClipInfo {
  frames: number
  events: Readonly<Record<string, readonly number[]>>
}

/** The moment a role's piece goes off, s after the role's clip chain starts: the first `event` of the clips the role
 *  chains, on the bake's timeline (tools/bake-figure.py: the first clip whole, each later one joined on the frame the
 *  one before ends on, so it adds its frames less one). clips: the registry's, by name; fps: their source rate */
export function shotAt(
  roleClips: readonly string[],
  clips: Readonly<Record<string, ClipInfo>>,
  fps: number,
  event = 'fire',
): number {
  let index = 0 // the timeline's frames before this clip's first new one
  for (let i = 0; i < roleClips.length; i++) {
    const c = clips[roleClips[i]]
    if (!c) throw new Error(`smoke: the figure has no clip ${roleClips[i]} (data/figures/index.json)`)
    const at = c.events[event]?.[0]
    // (frame `at` counts from 1; a later clip's frame 1 is the one before's last, already on the timeline)
    if (at !== undefined) return (i === 0 ? at - 1 : index + at - 2) / fps
    index += i === 0 ? c.frames : c.frames - 1
  }
  throw new Error(`smoke: no clip of ${roleClips.join(', ')} has a ${event} event (data/figures/index.json)`)
}

/** a battalion's fire: when its line starts firing (s, local: fireStart), when a man's piece goes off in his fire
 *  loop (shotAt) and how long the loop is (s), its ranks, and the script's hold (scriptClock: null, or the fire's
 *  start) */
export interface FireTiming {
  start: number
  shot: number
  period: number
  ranks: number
  hold: number | null
}
/** a rank's discharge: its clock (s, nominal: the men's own spread about it is the puffs'), its rank, the script's
 *  cycle and the volley's number in it */
export interface Shot {
  t: number
  rank: number
  cycle: number
  volley: number
}

/** The shots a battalion in line fires with nominal clocks in (t0, t1] (s), oldest first, into out (cleared). Each
 *  cycle of the script (scriptClock: CYCLE long, or under the hold the fire phase's length) its rank r goes off at
 *  its fire's start + r · RANK_LAG + the shot's moment, then once a loop, until the cycle ends (the stand-in's jump
 *  back) */
export function shotsBetween(t0: number, t1: number, offset: number, f: FireTiming, out: Shot[]): Shot[] {
  out.length = 0
  if (!(t1 > t0)) return out
  // (a loop of no length, or a hold past the cycle, would never end: validateSmoke checks them once, this guards)
  if (!(f.period > 0) || (f.hold !== null && !(f.hold < CYCLE))) {
    throw new Error('smoke: shotsBetween needs period > 0 and hold < CYCLE')
  }
  const from = f.hold ?? 0
  const len = CYCLE - from
  for (let k = Math.floor((t0 - offset) / len); k <= Math.floor((t1 - offset) / len); k++) {
    const base = offset + k * len - from // the clock at the cycle's local time 0
    for (let j = 0; ; j++) {
      const first = f.start + f.shot + j * f.period
      if (first >= CYCLE) break
      for (let r = 0; r < f.ranks; r++) {
        const local = first + r * RANK_LAG
        if (local >= CYCLE) break
        const t = base + local
        if (t > t0 && t <= t1) out.push({ t, rank: r, cycle: k, volley: j })
      }
    }
  }
  return out.sort((a, b) => a.t - b.t || a.rank - b.rank)
}

/** where a rank's puffs are born across the front, m in the battalion's frame (x, right of its centre): the middle of
 *  each group of `files` files, company by company (a company's last group may be smaller), from the line's slots */
export function muzzles(d: Drill, files: number): number[] {
  if (!(files >= 1)) throw new Error(`smoke: a puff for ${files} files`)
  const line = slots(d).line
  const xs: number[] = []
  for (let c = 0; c < d.companies; c++) {
    for (let f0 = 0; f0 < d.files; f0 += files) {
      const f1 = Math.min(d.files, f0 + files)
      let sum = 0
      for (let f = f0; f < f1; f++) sum += line[c * d.files * d.ranks + f][0]
      xs.push(sum / (f1 - f0))
    }
  }
  return xs
}

/** the ring's size in puffs (src/look/smoke.ts): every line battalion's puffs alive at once at the most (a volley's
 *  ranks × muzzles × the era's strung puffs, as many volleys as a puff's longest life, its spread and the ranks' lag
 *  span, and one more), at
 *  least 64 and at most max (64 B each) */
export function ringSize(lines: number, muzzlesN: number, f: FireTiming, def: PuffDef, max = 8192): number {
  const volleys = Math.ceil((def.life[1] + 2 * def.jitter + def.stagger + (f.ranks - 1) * RANK_LAG) / f.period) + 1
  return Math.max(64, Math.min(max, lines * f.ranks * muzzlesN * volleys * def.strung[0]))
}

/** a hash of up to four integers to [0, 1): the puffs' seeds, the same at every load */
export function hash(a: number, b = 0, c = 0, d = 0): number {
  let h = 0x811c9dc5
  for (const v of [a, b, c, d]) {
    h = Math.imul(h ^ (v | 0), 0x01000193)
    h ^= h >>> 15
  }
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** floats a puff: its birth place (x, y, z m) and clock (s), its way ahead (x, z: a unit vector), its seed (0 to 1)
 *  and its life (s), then its own factors on the era's size, reach (the blast's and the roll's), rise and density
 *  (puffVary), then the ground's rise along its way (m: pathGround) and that way's length (m): an instance's first
 *  three columns and two of its fourth (src/look/shaders/smoke.vert) */
export const PUFF_FLOATS = 14

/** The ground along a puff's way (smoke.vert lifts the puff by it, so a cloud carried tens of metres over rising
 *  ground is not cut by it): how far the blast and the roll carry it in its life (m, puffAt's at its end, its reach
 *  factor on it) and how much higher the ground is there than at its birth (m) */
export function pathGround(
  def: PuffDef,
  reach: number,
  life: number,
  x: number,
  z: number,
  way: readonly [number, number],
  ground: (x: number, z: number) => number,
): [number, number] {
  const d = puffAt(def, life, life).ahead * reach
  return [ground(x + way[0] * d, z + way[1] * d) - ground(x, z), d]
}
/** A puff's own factors on the era's values (smoke.vert reads them), each from its own hash (0 to 1) and the era's
 *  `vary` (0: every puff the era's own): size, reach and rise spread evenly about 1 by 0.45, 0.7 and 0.8 of `vary`;
 *  density 1 down to 1 - ½ vary, and one puff in seven thin (a quarter of that: the gaps between the clumps) */
export function puffVary(
  hSize: number,
  hReach: number,
  hRise: number,
  hDensity: number,
  vary: number,
): { size: number; reach: number; rise: number; density: number } {
  const thin = hDensity < 1 / 7 ? 0.25 : 1
  return {
    size: 1 + (hSize * 2 - 1) * 0.45 * vary,
    reach: 1 + (hReach * 2 - 1) * 0.7 * vary,
    rise: 1 + (hRise * 2 - 1) * 0.8 * vary,
    // (the density from the hash's own spread past the thin share: as even as the hash, and apart from the flag)
    density: (1 - fract(hDensity * 7) * 0.5 * vary) * thin,
  }
}
const fract = (x: number): number => x - Math.floor(x)

/** The volley's clumps along the front (m, the battalion's frame x): a density factor 0.2 to 1 from three waves of the
 *  era's unrelated lengths (`clumps`) whose phases the seeds a, b set, so where the shots thicken and where they leave
 *  gaps differs from volley to volley and never repeats at the muzzle groups' spacing */
export function clump(a: number, b: number, x: number, lengths: readonly [number, number, number]): number {
  const w =
    0.5 * Math.sin(x / lengths[0] + a * 6.2832) +
    0.3 * Math.sin(x / lengths[1] + b * 6.2832) +
    0.2 * Math.sin(x / lengths[2] + (a + b) * 3.1416)
  return Math.min(1, Math.max(0.2, 0.75 + 0.6 * w))
}

/** the salts of a puff's own hashes (puffHash): each of its draws from its own, so none follows another */
const H = { lateral: 0, ahead: 1, seed: 2, life: 3, jitter: 4, size: 5, reach: 6, rise: 7, density: 8 } as const
/** a puff's hash for one of its draws (H): its battalion, rank, cycle, volley and muzzle group, salted */
function puffHash(index: number, shot: Shot, g: number, salt: number): number {
  return hash(index * 8 + shot.rank, shot.cycle, shot.volley * 4096 + g, 101 + salt)
}

/** The puffs of one shot of battalion `index` (its place in the battalions): one for each muzzle group, born at the
 *  muzzles (the era's `ahead` m ahead of the front rank, a rank behind `rankReach` m nearer it and `rankLift` m higher,
 *  `height` m over the ground there; spread ±`lateral`/2 along the front), at the shot's clock, its section's own
 *  moment (±`stagger`/2: `section` m of the front go off together, the sections' grid shifted each volley) and a man's
 *  own spread (±`jitter`), each with its seed, life and own factors (puffVary, the volley's clumps), every draw from
 *  its own hash; pushed onto out, PUFF_FLOATS each. ground: the ground's height at (x, z) */
export function volleyPuffs(
  b: Battalion,
  index: number,
  shot: Shot,
  xs: readonly number[],
  def: PuffDef,
  ground: (x: number, z: number) => number,
  out: number[],
): void {
  const c = Math.cos(b.heading)
  const s = Math.sin(b.heading)
  // (the sections' grid shifted volley by volley, so their edges never fall twice in one place; the clumps' phases)
  const shift = hash(index, shot.cycle, shot.volley, 9) * def.section
  const ca = hash(index, shot.cycle, shot.volley, 3)
  const cb = hash(index, shot.cycle, shot.volley, 4)
  for (let g = 0; g < xs.length; g++) {
    const sec = hash(index, shot.cycle * 17 + shot.volley, Math.round((xs[g] + shift) / def.section), 5)
    for (let k = 0; k < def.strung[0]; k++) {
      // (the first of a group's strung puffs keeps the hashes a lone puff had)
      const h = (salt: number) => puffHash(index, shot, g + k * 1009, salt)
      const lx = xs[g] + (h(H.lateral) - 0.5) * def.lateral
      const lz = def.ahead - shot.rank * def.rankReach + h(H.ahead) * 0.3
      const x = b.x + c * lx + s * lz
      const z = b.z - s * lx + c * lz
      const v = puffVary(h(H.size), h(H.reach), h(H.rise), h(H.density), def.vary)
      const st = strungPuff(k, def.strung[0], def.strung[1])
      const life = def.life[0] + (def.life[1] - def.life[0]) * h(H.life)
      out.push(
        x,
        ground(x, z) + def.height + shot.rank * def.rankLift,
        z,
        shot.t + (sec - 0.5) * def.stagger + (h(H.jitter) * 2 - 1) * def.jitter,
        s,
        c,
        h(H.seed),
        life,
        v.size * st.size,
        v.reach * st.reach,
        v.rise,
        v.density * st.density * clump(ca, cb, lx, def.clumps),
        ...pathGround(def, v.reach * st.reach, life, x, z, [s, c], ground),
      )
    }
  }
}

/** Where puff k of the n a muzzle's shot leaves (the era's `strung`) lies along its jet, as factors on the era's
 *  reach, size and density: a lone puff (n 1) the era's own; else the nearest is the muzzle's cloud (a tenth of the
 *  reach, a little smaller and densest), the farthest `far` × the reach, each larger and fainter than the one before
 *  (the staff map's gun clouds, docs/research/smoke.md §1) */
export function strungPuff(k: number, n: number, far: number): { reach: number; size: number; density: number } {
  if (n <= 1) return { reach: 1, size: 1, density: 1 }
  const u = k / (n - 1)
  return { reach: 0.1 + (far - 0.1) * u, size: 0.8 + 0.5 * u, density: 1 - 0.45 * u }
}

/** A unit of pieces' fire (a battery's, src/look/world/arms.ts serveScript; docs/plans/active/artillery-smoke.md): its
 *  script's cycle (s) and hold (scriptClock's: null, or the local time the fire runs from, over again), its work
 *  role's loop (s) and its shot's moment in it (shotAt), and when each piece's work began (s, local: its role's
 *  start, the script's, the piece's own lag in it) */
export interface ServeTiming {
  cycle: number
  hold: number | null
  shot: number
  period: number
  starts: readonly number[]
}
/** a piece's discharge: its clock (s), the piece (its index in the unit's men), the script's cycle and the shot's
 *  number in it */
export interface PieceShot {
  t: number
  piece: number
  cycle: number
  n: number
}

/** The shots a unit of pieces fires with clocks in (t0, t1] (s), oldest first, into out (cleared): each cycle of its
 *  script (held: its run from the hold to the cycle's end) each piece goes off at its work's start + the shot's
 *  moment, then once a loop, until the cycle ends; under the hold, only the shots within the held run */
export function pieceShotsBetween(
  t0: number,
  t1: number,
  offset: number,
  f: ServeTiming,
  out: PieceShot[],
): PieceShot[] {
  out.length = 0
  if (!(t1 > t0)) return out
  if (!(f.period > 0) || !(f.cycle > 0) || (f.hold !== null && !(f.hold >= 0 && f.hold < f.cycle))) {
    throw new Error('smoke: pieceShotsBetween needs period > 0, cycle > 0 and 0 <= hold < cycle')
  }
  const from = f.hold ?? 0
  const len = f.cycle - from
  for (let k = Math.floor((t0 - offset) / len); k <= Math.floor((t1 - offset) / len); k++) {
    const base = offset + k * len - from // the clock at the cycle's local time 0
    for (let i = 0; i < f.starts.length; i++) {
      for (let j = 0; ; j++) {
        const local = f.starts[i] + f.shot + j * f.period
        if (local >= f.cycle) break
        if (local < from) continue
        const t = base + local
        if (t > t0 && t <= t1) out.push({ t, piece: i, cycle: k, n: j })
      }
    }
  }
  return out.sort((a, b) => a.t - b.t || a.piece - b.piece)
}

/** The puffs of one piece's shot, unit `index` (its place among the units that fire so): the era's `strung` puffs from
 *  its muzzle (`ahead` m before the piece's place, `height` m over the ground there; spread ±`lateral`/2 across),
 *  strung along its jet (strungPuff), at the shot's clock (± the era's `jitter`), each with its own seed, life and
 *  factors (puffVary); pushed onto out, PUFF_FLOATS each. place: the piece's place in the unit's frame (m) */
export function piecePuffs(
  b: Battalion,
  index: number,
  shot: PieceShot,
  place: readonly [number, number],
  def: PuffDef,
  ground: (x: number, z: number) => number,
  out: number[],
): void {
  const c = Math.cos(b.heading)
  const s = Math.sin(b.heading)
  const n = def.strung[0]
  for (let k = 0; k < n; k++) {
    const h = (salt: number) => hash(index * 256 + shot.piece, shot.cycle, shot.n * 64 + k, 201 + salt)
    const lx = place[0] + (h(H.lateral) - 0.5) * def.lateral
    const lz = place[1] + def.ahead
    const x = b.x + c * lx + s * lz
    const z = b.z - s * lx + c * lz
    // (the muzzle's own cloud, the first, never one of the thin ones: every shot shows at its gun)
    const hd = k === 0 && n > 1 ? 1 / 7 + h(H.density) * (6 / 7) : h(H.density)
    const v = puffVary(h(H.size), h(H.reach), h(H.rise), hd, def.vary)
    const st = strungPuff(k, n, def.strung[1])
    const life = def.life[0] + (def.life[1] - def.life[0]) * h(H.life)
    out.push(
      x,
      ground(x, z) + def.height,
      z,
      shot.t + (h(H.jitter) * 2 - 1) * def.jitter,
      s,
      c,
      h(H.seed),
      life,
      v.size * st.size,
      v.reach * st.reach,
      v.rise,
      v.density * st.density,
      ...pathGround(def, v.reach * st.reach, life, x, z, [s, c], ground),
    )
  }
}

/** the ring's size in puffs for units of pieces: every piece's puffs alive at once at the most (its shots within a
 *  puff's longest life and spread, and one more, × the era's strung puffs), at least 64 and at most max */
export function pieceRingSize(pieces: number, f: ServeTiming, def: PuffDef, max = 8192): number {
  const shots = Math.ceil((def.life[1] + 2 * def.jitter) / f.period) + 1
  return Math.max(64, Math.min(max, pieces * shots * def.strung[0]))
}

/** The era's smoke and the script's fire checked once (the Smoke's constructor): every time constant, life, size and
 *  spread positive or in its range, so no puff is NaN and no loop runs forever; a bad value throws, naming it. f: a
 *  line's fire (FireTiming: its ranks, in the infantry's CYCLE) or a unit of pieces' (its own cycle) */
export function validateSmoke(
  def: PuffDef,
  f: { period: number; hold: number | null; ranks?: number; cycle?: number },
): void {
  const bad = (what: string, v: unknown) => {
    throw new Error(`smoke: ${what} must be ${v} (src/rulesets/<era>-smoke.ts, PuffDef; or the fire timing)`)
  }
  const pos: [string, number][] = [
    ['files', def.files],
    ['life[0]', def.life[0]],
    ['grow', def.grow],
    ['jet[1]', def.jet[1]],
    ['plume[0]', def.plume[0]],
    ['plume[1]', def.plume[1]],
    ['rise[1]', def.rise[1]],
    ['bank', def.bank],
    ['section', def.section],
    ['radius[0]', def.radius[0]],
    ['body', def.body],
    ['fire period', f.period],
    ['ranks', f.ranks ?? 1],
    ['cycle', f.cycle ?? CYCLE],
    ...def.clumps.map((l, i) => [`clumps[${i}]`, l] as [string, number]),
  ]
  for (const [k, v] of pos) if (!(v > 0)) bad(`${k} > 0`, `positive, not ${v}`)
  if (!(Number.isInteger(def.strung[0]) && def.strung[0] >= 1)) {
    bad('strung[0]', `a whole number 1 or more, not ${def.strung[0]}`)
  }
  if (!(def.strung[1] > 0)) bad('strung[1]', `positive, not ${def.strung[1]}`)
  if (!(def.life[1] >= def.life[0])) bad('life', `[shortest, longest], not ${def.life.join(', ')}`)
  if (!(def.radius[1] >= def.radius[0])) bad('radius', `[birth, grown], not ${def.radius.join(', ')}`)
  if (!(def.erode >= 0 && def.erode < 1)) bad('erode', `in [0, 1), not ${def.erode}`)
  if (!(def.vary >= 0 && def.vary <= 1)) bad('vary', `in [0, 1], not ${def.vary}`)
  if (!(def.opacity > 0 && def.opacity <= 1)) bad('opacity', `in (0, 1], not ${def.opacity}`)
  for (const [k, v] of [
    ['jitter', def.jitter],
    ['stagger', def.stagger],
    ['lateral', def.lateral],
  ] as const) {
    if (!(v >= 0)) bad(k, `0 or more, not ${v}`)
  }
  const cycle = f.cycle ?? CYCLE
  if (f.hold !== null && !(f.hold >= 0 && f.hold < cycle)) bad('the fire hold', `in [0, ${cycle}), not ${f.hold}`)
}

/** the share of its densest a puff keeps at an age (s) of a life (s): whole while young, then thinning to a third at
 *  its end (smoke.frag's), its erosion (holes) on top */
export const PUFF_THIN = 0.65
/** A puff at an age (s; smoke.vert's): how far the blast and the bank's roll have carried it ahead and the air up (m),
 *  its radius (m), the plume's stretch along the shot (its length over its width, relaxing to 1), its opacity (its
 *  densest share, before its shape's own falloff) and its erosion (0 whole, 1 gone: past the def's share of its life
 *  the holes' threshold climbs to 1 at its end); the wind's carry is drift × age along the wind */
export function puffAt(
  def: PuffDef,
  age: number,
  life: number,
): { ahead: number; up: number; radius: number; stretch: number; opacity: number; erode: number } {
  const a = Math.max(0, age)
  const [jet, jetT] = def.jet
  const [rise, riseT] = def.rise
  return {
    ahead: jet * jetT * (1 - Math.exp(-a / jetT)) + def.roll * a,
    up: rise * riseT * (1 - Math.exp(-a / riseT)),
    radius: def.radius[0] + (def.radius[1] - def.radius[0]) * (1 - Math.exp(-a / def.grow)),
    stretch: 1 + (def.plume[0] - 1) * Math.exp(-a / def.plume[1]),
    opacity: def.opacity * (1 - PUFF_THIN * Math.min(1, a / life)),
    erode: Math.min(1, Math.max(0, (a / life - def.erode) / (1 - def.erode))),
  }
}
/** whether a puff is drawn at an age: born (age ≥ 0) and not yet eroded away (age < life) */
export const puffLive = (age: number, life: number): boolean => age >= 0 && age < life

/** The zoom's thinning (smoke.vert's): the share of puffs kept at a camera distance r (m): all up to near (m), then
 *  falling as near / r to floor at the widest zoom; the kept ones grow by 1/√share, so the smoke's area holds */
export function keepShare(r: number, near = 60, floor = 0.25): number {
  return Math.min(1, Math.max(floor, near / r))
}
/** a puff's size factor under the thinning: 1/√keep for a puff whose rank (0 to 1, from its seed) is kept, shrinking
 *  to 0 over a band (a share of keep) as its rank nears the cut, 0 past it; at keep 1 every puff whole */
export function keepScale(rank: number, keep: number, band = 0.08): number {
  return Math.min(1, Math.max(0, (keep * (1 + band) - rank) / (band * keep))) / Math.sqrt(keep)
}

/** floats a formation's footprint (Units.footprints, drawClearance): its place (x, z m), heading (rad) and its men's
 *  bounds in its own frame [x0, z0, x1, z1] (m: x across, z ahead) */
export const FOOT_FLOATS = 7

/** The formations' mask (smoke.frag reads it): a square of size² texels from origin (x0, z0 m) at texel m each; a
 *  texel's value 255 inside a formation's footprint (in its own frame, so a line askew to the axes covers only its own
 *  narrow ground) and falling linearly to 0 margin m outside it, the largest over the footprints. feet: FOOT_FLOATS
 *  each, n of them. Only the texels near a footprint are visited */
export function drawClearance(
  feet: Float32Array,
  n: number,
  mask: Uint8Array,
  size: number,
  origin: readonly [number, number],
  texel: number,
  margin: number,
): void {
  mask.fill(0)
  for (let k = 0; k < n; k++) {
    const o = k * FOOT_FLOATS
    const bx = feet[o]
    const bz = feet[o + 1]
    const c = Math.cos(feet[o + 2])
    const s = Math.sin(feet[o + 2])
    const [x0, z0, x1, z1] = [feet[o + 3] - margin, feet[o + 4] - margin, feet[o + 5] + margin, feet[o + 6] + margin]
    // (the footprint's world bounds: its four corners, x = bx + c·lx + s·lz, z = bz − s·lx + c·lz)
    let wx0 = Infinity
    let wx1 = -Infinity
    let wz0 = Infinity
    let wz1 = -Infinity
    for (const [lx, lz] of [
      [x0, z0],
      [x1, z0],
      [x0, z1],
      [x1, z1],
    ]) {
      wx0 = Math.min(wx0, bx + c * lx + s * lz)
      wx1 = Math.max(wx1, bx + c * lx + s * lz)
      wz0 = Math.min(wz0, bz - s * lx + c * lz)
      wz1 = Math.max(wz1, bz - s * lx + c * lz)
    }
    const i0 = Math.max(0, Math.floor((wx0 - origin[0]) / texel))
    const i1 = Math.min(size - 1, Math.ceil((wx1 - origin[0]) / texel))
    const j0 = Math.max(0, Math.floor((wz0 - origin[1]) / texel))
    const j1 = Math.min(size - 1, Math.ceil((wz1 - origin[1]) / texel))
    for (let j = j0; j <= j1; j++) {
      const dz = origin[1] + (j + 0.5) * texel - bz
      for (let i = i0; i <= i1; i++) {
        const dx = origin[0] + (i + 0.5) * texel - bx
        const lx = c * dx - s * dz
        const lz = s * dx + c * dz
        const d = Math.hypot(
          Math.max(feet[o + 3] - lx, 0, lx - feet[o + 5]),
          Math.max(feet[o + 4] - lz, 0, lz - feet[o + 6]),
        )
        const v = Math.round(255 * Math.max(0, 1 - d / margin))
        const at = j * size + i
        if (v > mask[at]) mask[at] = v
      }
    }
  }
}

/** the mask's value at a ground point (0 to 1), read as the GPU reads it (bilinear between texel centres, clamped at
 *  the edge) */
export function maskAt(
  mask: Uint8Array,
  size: number,
  origin: readonly [number, number],
  texel: number,
  x: number,
  z: number,
): number {
  const u = Math.min(size - 1, Math.max(0, (x - origin[0]) / texel - 0.5))
  const v = Math.min(size - 1, Math.max(0, (z - origin[1]) / texel - 0.5))
  const i = Math.min(size - 2, Math.floor(u))
  const j = Math.min(size - 2, Math.floor(v))
  const fu = u - i
  const fv = v - j
  const m = (a: number, b: number) => mask[b * size + a] / 255
  return (m(i, j) * (1 - fu) + m(i + 1, j) * fu) * (1 - fv) + (m(i, j + 1) * (1 - fu) + m(i + 1, j + 1) * fu) * fv
}

/** The view ray rule at a smoke point p seen from the camera cam (smoke.frag's): the view ray through p followed to a
 *  man's mid height over the ground (groundY + man m, the puff's ground), and the mask read there: how much of a
 *  formation the smoke lies over (0 to 1). 0 for a ray that never comes down */
export function coverAt(
  mask: Uint8Array,
  size: number,
  origin: readonly [number, number],
  texel: number,
  cam: readonly [number, number, number],
  p: readonly [number, number, number],
  groundY: number,
  man = 0.9,
): number {
  const dy = p[1] - cam[1]
  if (dy > -1e-3) return 0
  const t = (groundY + man - cam[1]) / dy
  return maskAt(mask, size, origin, texel, cam[0] + (p[0] - cam[0]) * t, cam[2] + (p[2] - cam[2]) * t)
}

/** The cap over the men (smoke.frag's): the factor on one card's opacity where it lies over a share `cover` (coverAt)
 *  of a formation: 1 clear of them, falling smoothly to cap over them. A factor per card, not a cap on the bank's
 *  total: cards over each other add up (three grown puffs at 0.95 × 0.6 make about 0.92); decision 0083 */
export function coverCap(cover: number, cap: number): number {
  const t = Math.min(1, Math.max(0, (cover - 0.15) / 0.5))
  return 1 - (1 - cap) * t * t * (3 - 2 * t)
}

/** the smoke's look (the owner's comparisons): step, the clock stepped at that many fps (0: smooth); cap, the
 *  opacity kept over the men (1: none taken, the formations' mask not drawn) */
export interface SmokeLook {
  step: number
  cap: number
}
/** the variants (?smoke=soft|step): soft, smooth; step, its clock stepped at 12 fps (the art bible's stepped
 *  effects) */
export const SMOKE_LOOKS: Readonly<Record<'soft' | 'step', Readonly<SmokeLook>>> = {
  soft: { step: 0, cap: 0.6 },
  step: { step: 12, cap: 0.6 },
}
/** the variant drawn without ?smoke */
export const SMOKE_DEFAULT: keyof typeof SMOKE_LOOKS = 'soft'

/** The page's smoke switches: ?smoke=0 (none: null), ?smoke=soft|step (a variant; 1 or absent: the default), and the
 *  knobs over it: ?smokestep=<fps> (0: smooth), ?smokecap=<0 to 1> (the opacity kept over the men; 1 none taken).
 *  A bad value throws */
export function smokeLook(params: URLSearchParams): SmokeLook | null {
  const v = params.get('smoke') ?? '1'
  if (v === '0') return null
  const key = v === '1' ? SMOKE_DEFAULT : v
  if (!(key === 'soft' || key === 'step')) throw new Error(`?smoke must be 0, 1, soft or step, not ${v}`)
  const look: SmokeLook = { ...SMOKE_LOOKS[key] }
  const step = params.get('smokestep')
  if (step !== null) {
    if (!/^\d+$/.test(step) || +step > 60) throw new Error(`?smokestep must be 0 to 60 fps, not ${step}`)
    look.step = +step
  }
  const cap = params.get('smokecap')
  if (cap !== null) {
    const v = cap.trim() === '' ? NaN : Number(cap)
    if (!(v >= 0 && v <= 1)) throw new Error(`?smokecap must be a number from 0 to 1, not ${cap}`)
    look.cap = v
  }
  return look
}
