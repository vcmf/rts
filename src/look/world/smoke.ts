// Musket smoke's pure parts (docs/plans/active/smoke-puffs.md, decision 0080): when the scripted battalions' ranks go
// off, the puffs a volley leaves along the front, a puff's motion, growth and erosion with age (mirrored by
// src/look/shaders/smoke.vert and smoke.frag), the formations' clearance mask and the rule that cuts smoke over them,
// the zoom's thinning, and the page's switches. No Babylon: the tests read it in Node. The engine names no weapon: the
// smoke's values are the era's (PuffDef, src/rulesets/<era>-smoke.ts), the shot's moment the figure's own clip event.
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
 *  ranks × muzzles, as many volleys as a puff's longest life, its spread and the ranks' lag span, and one more), at
 *  least 64 and at most max (64 B each) */
export function ringSize(lines: number, muzzlesN: number, f: FireTiming, def: PuffDef, max = 8192): number {
  const volleys = Math.ceil((def.life[1] + 2 * def.jitter + (f.ranks - 1) * RANK_LAG) / f.period) + 1
  return Math.max(64, Math.min(max, lines * f.ranks * muzzlesN * volleys))
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
 *  and its life (s): an instance's first two columns (src/look/shaders/smoke.vert) */
export const PUFF_FLOATS = 8

/** The puffs of one shot of battalion `index` (its place in the battalions): one for each muzzle group, born at the
 *  muzzles (`ahead` m ahead of the front rank, `height` m over the ground there; a rank behind a little higher, as
 *  its muskets over the front rank's shoulders), at the shot's clock and a man's own spread (±jitter), each with its
 *  seed and life; pushed onto out, PUFF_FLOATS each. ground: the ground's height at (x, z) */
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
  for (let g = 0; g < xs.length; g++) {
    const h0 = hash(index, shot.cycle, shot.volley * 8 + shot.rank, g)
    const h1 = hash(g, index, shot.rank, shot.cycle * 31 + shot.volley)
    const h2 = hash(shot.volley, g, index * 7 + shot.rank, shot.cycle)
    const lx = xs[g] + (h1 - 0.5) * 1.2
    const lz = def.ahead + h2 * 0.6
    const x = b.x + c * lx + s * lz
    const z = b.z - s * lx + c * lz
    out.push(
      x,
      ground(x, z) + def.height + shot.rank * 0.12,
      z,
      shot.t + (h0 * 2 - 1) * def.jitter,
      s,
      c,
      h1,
      def.life[0] + (def.life[1] - def.life[0]) * h2,
    )
  }
}

/** a puff at an age (s; smoke.vert's): how far the blast has carried it ahead and the air up (m), its radius (m)
 *  and its erosion (0 whole, 1 gone: past the def's share of its life the threshold climbs to 1 at its end); the
 *  wind's carry is drift × age along the wind */
export function puffAt(
  def: PuffDef,
  age: number,
  life: number,
): { ahead: number; up: number; radius: number; erode: number } {
  const a = Math.max(0, age)
  const [jet, jetT] = def.jet
  const [rise, riseT] = def.rise
  return {
    ahead: jet * jetT * (1 - Math.exp(-a / jetT)),
    up: rise * riseT * (1 - Math.exp(-a / riseT)),
    radius: def.radius[0] + (def.radius[1] - def.radius[0]) * (1 - Math.exp(-a / def.grow)),
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

/** The formations' clearance mask (smoke.frag reads it): a square of size² texels from origin (x0, z0 m) at texel m
 *  each; a texel's value 255 inside a box and falling linearly to 0 margin m outside it, the largest over the boxes.
 *  boxes: [x0, z0, x1, z1] m each (Units.boxes), n of them. Only the texels near a box are visited */
export function drawClearance(
  boxes: Float32Array,
  n: number,
  mask: Uint8Array,
  size: number,
  origin: readonly [number, number],
  texel: number,
  margin: number,
): void {
  mask.fill(0)
  for (let k = 0; k < n; k++) {
    const x0 = boxes[k * 4]
    const z0 = boxes[k * 4 + 1]
    const x1 = boxes[k * 4 + 2]
    const z1 = boxes[k * 4 + 3]
    const i0 = Math.max(0, Math.floor((x0 - margin - origin[0]) / texel))
    const i1 = Math.min(size - 1, Math.ceil((x1 + margin - origin[0]) / texel))
    const j0 = Math.max(0, Math.floor((z0 - margin - origin[1]) / texel))
    const j1 = Math.min(size - 1, Math.ceil((z1 + margin - origin[1]) / texel))
    for (let j = j0; j <= j1; j++) {
      const z = origin[1] + (j + 0.5) * texel
      const dz = Math.max(z0 - z, 0, z - z1)
      for (let i = i0; i <= i1; i++) {
        const x = origin[0] + (i + 0.5) * texel
        const d = Math.hypot(Math.max(x0 - x, 0, x - x1), dz)
        const v = Math.round(255 * Math.max(0, 1 - d / margin))
        const o = j * size + i
        if (v > mask[o]) mask[o] = v
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

/** The clearance rule at a smoke point p seen from the camera cam (smoke.frag's, without its brush): the view ray
 *  through p followed to a man's mid height over the ground (groundY + man m, the puff's ground), and the mask read
 *  there: what the smoke would cover. Returns that value (0 to 1; the shader cuts the smoke where it, broken by the
 *  grain, passes ½); 0 for a ray that never comes down */
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

/** the smoke's look (the owner's comparisons): tone, 1 one flat tone (the staff map's) or 3 the painter's bands; edge,
 *  hard (the geometry's scallop alone) or brush (the grain breaks the rim); step, the clock stepped at that many fps
 *  (0: smooth); shade, the offset shadow on the ground; a2c, the edge by alpha to coverage (the lens term then the
 *  one behind) instead of a cut; clear, the clearance rule */
export interface SmokeLook {
  tone: 1 | 3
  edge: 'hard' | 'brush'
  step: number
  shade: boolean
  a2c: boolean
  clear: boolean
}
/** the variants (?smoke=a|b|c): A the staff map's (one tone, a hard scallop, its offset shadow); B the painter's three
 *  tones with a brush edge; C B stepped at 12 fps with the offset shadow */
export const SMOKE_LOOKS: Readonly<Record<'a' | 'b' | 'c', Readonly<SmokeLook>>> = {
  a: { tone: 1, edge: 'hard', step: 0, shade: true, a2c: false, clear: true },
  b: { tone: 3, edge: 'brush', step: 0, shade: false, a2c: false, clear: true },
  c: { tone: 3, edge: 'brush', step: 12, shade: true, a2c: false, clear: true },
}
/** the variant drawn without ?smoke */
export const SMOKE_DEFAULT: keyof typeof SMOKE_LOOKS = 'c'

/** The page's smoke switches: ?smoke=0 (none: null), ?smoke=a|b|c (a variant; 1 or absent: the default), and the
 *  knobs over it: ?smoketone=1|3, ?smokeedge=hard|brush, ?smokestep=<fps> (0: smooth), ?smokeshade=0|1,
 *  ?smokea2c=0|1, ?smokeclear=0|1. A bad value throws */
export function smokeLook(params: URLSearchParams): SmokeLook | null {
  const v = params.get('smoke') ?? '1'
  if (v === '0') return null
  const key = v === '1' ? SMOKE_DEFAULT : v
  if (!(key === 'a' || key === 'b' || key === 'c')) throw new Error(`?smoke must be 0, 1, a, b or c, not ${v}`)
  const look: SmokeLook = { ...SMOKE_LOOKS[key] }
  const bit = (k: string): boolean | null => {
    const x = params.get(k)
    if (x === null) return null
    if (x !== '0' && x !== '1') throw new Error(`?${k} must be 0 or 1, not ${x}`)
    return x === '1'
  }
  const tone = params.get('smoketone')
  if (tone !== null) {
    if (tone !== '1' && tone !== '3') throw new Error(`?smoketone must be 1 or 3, not ${tone}`)
    look.tone = tone === '1' ? 1 : 3
  }
  const edge = params.get('smokeedge')
  if (edge !== null) {
    if (edge !== 'hard' && edge !== 'brush') throw new Error(`?smokeedge must be hard or brush, not ${edge}`)
    look.edge = edge
  }
  const step = params.get('smokestep')
  if (step !== null) {
    if (!/^\d+$/.test(step) || +step > 60) throw new Error(`?smokestep must be 0 to 60 fps, not ${step}`)
    look.step = +step
  }
  look.shade = bit('smokeshade') ?? look.shade
  look.a2c = bit('smokea2c') ?? look.a2c
  look.clear = bit('smokeclear') ?? look.clear
  return look
}

/** A unit icosphere (the puffs' mesh): the icosahedron's 12 corners, each triangle split in four `levels` times, the
 *  new vertices pushed out to the sphere and shared along each edge. 2 levels: 162 vertices, 320 triangles. Triangles
 *  wound clockwise seen from outside (Babylon's fronts, as the figures', #164) */
export function icosphere(levels: number): { positions: Float32Array; indices: Uint32Array } {
  const t = (1 + Math.sqrt(5)) / 2
  const p: number[] = []
  const add = (x: number, y: number, z: number) => {
    const l = Math.hypot(x, y, z)
    p.push(x / l, y / l, z / l)
    return p.length / 3 - 1
  }
  for (const [x, y, z] of [
    [-1, t, 0],
    [1, t, 0],
    [-1, -t, 0],
    [1, -t, 0],
    [0, -1, t],
    [0, 1, t],
    [0, -1, -t],
    [0, 1, -t],
    [t, 0, -1],
    [t, 0, 1],
    [-t, 0, -1],
    [-t, 0, 1],
  ]) {
    add(x, y, z)
  }
  // (counter-clockwise from outside, flipped at the end)
  let f = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ]
  for (let l = 0; l < levels; l++) {
    const mid = new Map<string, number>()
    const m = (a: number, b: number) => {
      const k = a < b ? `${a},${b}` : `${b},${a}`
      let v = mid.get(k)
      if (v === undefined) {
        v = add(p[a * 3] + p[b * 3], p[a * 3 + 1] + p[b * 3 + 1], p[a * 3 + 2] + p[b * 3 + 2])
        mid.set(k, v)
      }
      return v
    }
    f = f.flatMap(([a, b, c]) => {
      const ab = m(a, b)
      const bc = m(b, c)
      const ca = m(c, a)
      return [
        [a, ab, ca],
        [b, bc, ab],
        [c, ca, bc],
        [ab, bc, ca],
      ]
    })
  }
  return { positions: Float32Array.from(p), indices: Uint32Array.from(f.flatMap(([a, b, c]) => [a, c, b])) }
}
