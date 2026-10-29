// The look compiler (M4; docs/plans/active/look-austerlitz-a1.md): a window of a map's compiled layers
// (src/map/apply.ts) turned into the look world's inputs, the same the demo's authoring (author.ts, cover.ts) gives:
// the heightfield over the tile and its margin, the far ring's heights, the cover's grid, the roads' lines and the
// trees. Render side (decision 0006 does not apply), run in Node by tools/build-look-data.ts; pure functions over the
// layers, tested in test/look-from-map.test.ts. A window's point (x, z) is the map's (x + win.x, z + win.z).
//
// What the map language lacks, the compiler fills here until the language says it (the plan's table): the arable is
// one feature, so it is cut into strips (fieldAt, temporary until the language's field generator); a wood is an area,
// so its trees are scattered (woodTree); an orchard's trees stand in its rows. Each is decided by a hash of the map's
// position, so two windows agree where they overlap.
import type { Layers } from '../../map/apply.ts'
import { lineReach } from '../../map/apply.ts'
import type { Resolved } from '../../map/resolve.ts'
import type { Feature } from '../../map/schema.ts'
import type { Grid, Heightfield } from '../heightfield.ts'
import type { Derived } from '../spec.ts'
import { COVER, WEAR_STEP, resample, type CoverClass, type CoverGrid } from './cover.ts'
import { TREE_SPECIES, type TreeSpecies } from './data.ts'
import { segD } from './geom.ts'
import type { LookWindow } from './windows.ts'

type Pt = readonly [number, number]

/** A road or a track of the window: its points (window metres), its width (m) and its cover class. */
export interface MapLine {
  pts: Pt[]
  w: number
  cls: CoverClass
}

/** A tree of the window: where it stands (window metres), its species (TREE_SPECIES) and its scale. */
export interface MapTree {
  x: number
  z: number
  sp: TreeSpecies
  s: number
}

/**
 * An integer hash of a lattice point and a salt to 0..1: the same on every machine (no trigonometry), so the map's
 * strips and trees fall where they fall whatever the window.
 */
export function ihash(a: number, b: number, salt: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** The resolved feature a layer's value names (0: none). */
const featureOf = (L: Layers, v: number): Resolved | null => (v ? L.table[v - 1] : null)

/** The layers' cell holding a map point, or −1 off the layers. */
export function cellAt(L: Layers, x: number, z: number): number {
  const i = Math.floor((x - L.x0) / L.cell)
  const j = Math.floor((z - L.z0) / L.cell)
  return i < 0 || j < 0 || i >= L.nx || j >= L.nz ? -1 : j * L.nx + i
}

/**
 * The window's heights: the tile's nodes and their margin (the demo's layout, tools/build-look-data.ts) and the far
 * ring's, read from `heightAt` (map metres to m above the datum), all taken down by the lowest of them so the window
 * meets the spec's ground at 0. `base`: the height taken off, m.
 */
export function windowHeights(
  heightAt: (x: number, z: number) => number,
  win: Pick<LookWindow, 'x' | 'z'>,
  d: Derived,
): { hf: Heightfield; far: Grid; base: number } {
  const s = d.spec
  const m = d.hfMargin
  const n = s.tileSub + 1 + 2 * m
  const tx = (col: number) => Math.fround((col * s.tile) / s.tileSub - s.tile / 2)
  const h = new Float32Array(n * n)
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) h[j * n + i] = heightAt(tx(i - m) + win.x, tx(j - m) + win.z)
  const fn = s.farSub + 1
  const fx = (col: number) => Math.fround((col * s.far) / s.farSub - s.far / 2)
  const fh = new Float32Array(fn * fn)
  for (let j = 0; j < fn; j++) for (let i = 0; i < fn; i++) fh[j * fn + i] = heightAt(fx(i) + win.x, fx(j) + win.z)
  const base = Math.min(minOf(h), minOf(fh))
  for (let k = 0; k < h.length; k++) h[k] -= base
  for (let k = 0; k < fh.length; k++) fh[k] -= base
  const x0 = (-m * s.tile) / s.tileSub - s.tile / 2
  return {
    hf: { n, cell: s.tile / s.tileSub, x0, z0: x0, h, min: minOf(h), max: maxOf(h) },
    far: { n: fn, cell: s.far / s.farSub, x0: -s.far / 2, z0: -s.far / 2, h: fh },
    base,
  }
}

const minOf = (a: Float32Array): number => a.reduce((v, x) => Math.min(v, x), Infinity)
const maxOf = (a: Float32Array): number => a.reduce((v, x) => Math.max(v, x), -Infinity)

/** Throws unless the window's far ring (side `far` m) lies inside the layers: a collar past the map's edge waits. */
export function checkWindowInside(L: Layers, win: LookWindow, far: number): void {
  const h = far / 2
  const x1 = L.x0 + L.nx * L.cell
  const z1 = L.z0 + L.nz * L.cell
  if (win.x - h < L.x0 || win.x + h > x1 || win.z - h < L.z0 || win.z + h > z1) {
    throw new Error(
      `window ${win.name}: its far ring (${far} m about ${win.x}, ${win.z}) leaves the map (${L.x0}..${x1}, ${L.z0}..${z1})`,
    )
  }
  if (win.x % 2 || win.z % 2) throw new Error(`window ${win.name}: its centre must lie on even metres`)
}

// the way kinds drawn as tracks (a lane's or a path's earth and wheel ruts); every other way is a road
const TRACK_KINDS = ['way.road.lane', 'way.track', 'way.path']
const isTrack = (kind: string): boolean => TRACK_KINDS.some(k => kind === k || kind.startsWith(k + '.'))
// how far past the far ring a way's points are kept: a cover cell's wear reads lines up to 25.5 m and a road's half
const LINE_PAD = 40
// a line resampled every RESAMPLE m, as the demo's (src/look/world/cover.ts): few enough segments a road cell
const RESAMPLE = 8

/**
 * The window's roads and tracks: each way's line in window metres, resampled every RESAMPLE m, cut into the runs that
 * lie within the far ring (and LINE_PAD), its width twice its painted reach (src/map/apply.ts, lineReach).
 */
export function wayLines(features: readonly Feature[], table: readonly Resolved[], win: LookWindow, far: number) {
  const byId = new Map(table.map(r => [r.id, r]))
  const out: MapLine[] = []
  for (const f of features) {
    const r = byId.get(f.id)
    if (!r || !f.line || !r.kind.startsWith('way.')) continue
    const w = 2 * lineReach(r.kind, r.attrs)
    const cls = isTrack(r.kind) ? COVER.track : COVER.road
    const local = resample(
      f.line.map(([x, z]) => [x - win.x, z - win.z] as Pt),
      RESAMPLE,
    )
    for (const run of runsInside(local, far / 2 + LINE_PAD)) out.push({ pts: run, w, cls })
  }
  return out
}

/** The runs of a line's segments that touch the square ±half (each at least one segment). */
export function runsInside(pts: readonly Pt[], half: number): Pt[][] {
  const inside = (p: Pt) => Math.abs(p[0]) <= half && Math.abs(p[1]) <= half
  const runs: Pt[][] = []
  let run: Pt[] = []
  for (let k = 0; k + 1 < pts.length; k++) {
    const keep = inside(pts[k]) || inside(pts[k + 1])
    if (keep) {
      if (!run.length) run.push(pts[k])
      run.push(pts[k + 1])
    } else if (run.length) {
      runs.push(run)
      run = []
    }
  }
  if (run.length) runs.push(run)
  return runs
}

// the arable's strips (temporary, until the language's field generator): blocks round jittered seeds BLOCK m apart,
// each turned its own way; in a block, bands BAND m long along its turn, each cut across into strips 18–45 m wide
const BLOCK = 240
const BAND = 70
const STRIP_MIN = 18
const STRIP_SPREAD = 27
// a block's strips run this far either side of its seed: past a block's farthest point from its seed
const STRIP_REACH = 2 * BLOCK

/** The block (its lattice indices, its seed point and its turn, rad) whose seed lies nearest a map point. */
function blockAt(x: number, z: number): { a: number; b: number; sx: number; sz: number; turn: number } {
  const a0 = Math.floor(x / BLOCK)
  const b0 = Math.floor(z / BLOCK)
  let best = { a: 0, b: 0, sx: 0, sz: 0, turn: 0 }
  let bd = Infinity
  for (let a = a0 - 1; a <= a0 + 1; a++) {
    for (let b = b0 - 1; b <= b0 + 1; b++) {
      const sx = (a + 0.15 + 0.7 * ihash(a, b, 1)) * BLOCK
      const sz = (b + 0.15 + 0.7 * ihash(a, b, 2)) * BLOCK
      const d = (x - sx) ** 2 + (z - sz) ** 2
      if (d < bd) {
        bd = d
        best = { a, b, sx, sz, turn: ihash(a, b, 3) * Math.PI }
      }
    }
  }
  return best
}

/** The index of the strip that holds `v` m across a band, by the strips' hashed widths from −STRIP_REACH. */
function stripIndex(a: number, b: number, k: number, v: number): number {
  let edge = -STRIP_REACH
  for (let s = 0; ; s++) {
    edge += STRIP_MIN + STRIP_SPREAD * ihash(a * 7919 + k, b, 10 + s)
    if (v < edge || edge > STRIP_REACH) return s
  }
}

/** The arable's crop at a strip by the field's stage (its season's): the hash `u` picks one. */
export function cropFor(stage: string, u: number): CoverClass {
  const pick = (shares: [CoverClass, number][]): CoverClass => {
    for (const [c, p] of shares) {
      if (u < p) return c
      u -= p
    }
    return shares[shares.length - 1][0]
  }
  if (stage === 'fallow') return COVER.meadow
  if (stage === 'ploughed') {
    // winter: ploughed land, the winter corn's green, the odd stubble and grass
    return pick([
      [COVER.ploughed, 0.5],
      [COVER.green, 0.25],
      [COVER.stubble, 0.1],
      [COVER.pasture, 0.08],
      [COVER.meadow, 0.07],
    ])
  }
  if (stage === 'stubble') {
    return pick([
      [COVER.stubble, 0.4],
      [COVER.ploughed, 0.3],
      [COVER.green, 0.1],
      [COVER.pasture, 0.1],
      [COVER.meadow, 0.1],
    ])
  }
  // standing (the demo's far strips' shares, src/look/world/cover.ts)
  return pick([
    [COVER.wheat, 0.22],
    [COVER.green, 0.2],
    [COVER.ploughed, 0.18],
    [COVER.stubble, 0.1],
    [COVER.pasture, 0.15],
    [COVER.meadow, 0.15],
  ])
}

/**
 * The arable's strip at a map point: its class (by the stage), its id byte (1..255, its stripes' phase and shade) and
 * its furrows' direction (rad from +x toward +z: along the strip).
 */
export function fieldAt(x: number, z: number, stage: string): { cls: CoverClass; id: number; dir: number } {
  const { a, b, sx, sz, turn } = blockAt(x, z)
  const c = Math.cos(turn)
  const s = Math.sin(turn)
  const u = (x - sx) * c + (z - sz) * s
  const v = -(x - sx) * s + (z - sz) * c
  const k = Math.floor(u / BAND)
  const st = stripIndex(a, b, k, v)
  return {
    cls: cropFor(stage, ihash(a * 131 + k, b * 131 + st, 4)),
    id: 1 + Math.floor(ihash(a * 131 + k, b * 131 + st, 5) * 254.999),
    dir: turn,
  }
}

/** A crop kind's class for its stage (`ground.field.<crop>`: the language's own crop). */
function cropOfKind(stage: string): CoverClass {
  return stage === 'stubble'
    ? COVER.stubble
    : stage === 'ploughed'
      ? COVER.ploughed
      : stage === 'fallow'
        ? COVER.meadow
        : COVER.wheat
}

const isWood = (r: Resolved | null): boolean => !!r && (r.kind === 'veg.wood' || r.kind.startsWith('veg.wood.'))

/**
 * The class, field id and furrow at a map point before the lines and the villages, from the features that cover it
 * (`g` its ground, `v` its vegetation, `wet` under water): wood under a wood; a strip of the arable or the field's own
 * crop; pasture on pasture and rough ground; meadow elsewhere (the water, an orchard's floor, a meadow, a marsh: no
 * paint of its own yet).
 */
export function classOf(
  g: Resolved | null,
  v: Resolved | null,
  wet: boolean,
  x: number,
  z: number,
): { cls: CoverClass; id: number; dir: number } {
  const none = { cls: COVER.meadow as CoverClass, id: 0, dir: 0 }
  if (wet) return none
  if (isWood(v)) return { ...none, cls: COVER.wood }
  // an orchard's floor is grass, whatever ground it was planted on (the arable, in Austerlitz)
  if (v?.kind.startsWith('veg.orchard')) return none
  if (!g) return none
  if (g.kind === 'ground.field') return fieldAt(x, z, String(g.attrs.stage ?? 'standing'))
  if (g.kind.startsWith('ground.field.')) {
    const f = fieldAt(x, z, 'standing')
    return { ...f, cls: cropOfKind(String(g.attrs.stage ?? 'standing')) }
  }
  if (g.kind === 'ground.pasture' || g.kind === 'ground.rough') return { ...none, cls: COVER.pasture }
  return none
}

/** classOf at one of the layers' cells (k: −1 off the layers). */
export function groundClass(L: Layers, k: number, x: number, z: number): { cls: CoverClass; id: number; dir: number } {
  if (k < 0) return classOf(null, null, false, x, z)
  return classOf(featureOf(L, L.ground[k]), featureOf(L, L.veg[k]), !!L.water[k], x, z)
}

/**
 * The window's areas at the look's own cells (`n`² of `cell` m from x0, z0 = x0, window metres): each cell's ground,
 * vegetation, water and built feature (its index in the table, plus 1; 0 none): fineAreas.
 */
export interface FineAreas {
  n: number
  cell: number
  x0: number
  ground: Uint16Array
  veg: Uint16Array
  water: Uint16Array
  built: Uint16Array
}

// how many points an ellipse's or a circle's outline takes
const OUTLINE = 64

/** A feature's area as rings (map metres): its area's rings, or its circle's or ellipse's outline; none for a line. */
export function ringsOf(f: Feature): Pt[][] {
  if (f.area) return f.area
  const e = f.ellipse ?? (f.circle ? [f.circle[0], f.circle[1], f.circle[1], 0] : null)
  if (!e) return []
  const [[cx, cz], a, b, t] = e as [Pt, number, number, number]
  const c = Math.cos(t)
  const s = Math.sin(t)
  const ring: Pt[] = []
  for (let k = 0; k < OUTLINE; k++) {
    const u = (k / OUTLINE) * 2 * Math.PI
    const p = a * Math.cos(u)
    const q = b * Math.sin(u)
    ring.push([cx + p * c - q * s, cz + p * s + q * c])
  }
  return [ring]
}

/**
 * Fills the cells whose centres lie inside `rings` (even-odd over every ring, so holes stay out) with `value`: a scan
 * of each row's crossings. `rings` in window metres; the grid `n`² cells of `cell` m from (x0, x0).
 */
export function fillRings(
  rings: readonly Pt[][],
  grid: Uint16Array,
  n: number,
  x0: number,
  cell: number,
  value: number,
) {
  let zlo = Infinity
  let zhi = -Infinity
  for (const r of rings) for (const p of r) [zlo, zhi] = [Math.min(zlo, p[1]), Math.max(zhi, p[1])]
  const j0 = Math.max(0, Math.ceil((zlo - x0) / cell - 0.5))
  const j1 = Math.min(n - 1, Math.floor((zhi - x0) / cell - 0.5))
  const xs: number[] = []
  for (let j = j0; j <= j1; j++) {
    const z = x0 + (j + 0.5) * cell
    xs.length = 0
    for (const r of rings) {
      for (let k = 0, m = r.length - 1; k < r.length; m = k++) {
        const [ax, az] = r[m]
        const [bx, bz] = r[k]
        if (az > z !== bz > z) xs.push(ax + ((z - az) * (bx - ax)) / (bz - az))
      }
    }
    xs.sort((a, b) => a - b)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil((xs[k] - x0) / cell - 0.5))
      const i1 = Math.min(n - 1, Math.floor((xs[k + 1] - x0) / cell - 0.5))
      for (let i = i0; i <= i1; i++) grid[j * n + i] = value
    }
  }
}

/**
 * The window's areas (FineAreas) at `cell` m over the far ring (side `far` m): the ground, the stands and low growth
 * of the vegetation and the built from the map's features' own shapes, in the layers' painting order (L.table); the
 * water from the layers' cells (apply's: a pond's water stands only where its bed lies under its level, not over its
 * whole outline). `features`: the expanded map's.
 */
export function fineAreas(
  L: Layers,
  features: readonly Feature[],
  win: LookWindow,
  far: number,
  cell: number,
): FineAreas {
  const n = Math.round(far / cell)
  const x0 = -far / 2
  const U = () => new Uint16Array(n * n)
  const A: FineAreas = { n, cell, x0, ground: U(), veg: U(), water: U(), built: U() }
  const byId = new Map(features.map(f => [f.id, f]))
  const local = (r: readonly Pt[]) => r.map(([x, z]) => [x - win.x, z - win.z] as Pt)
  const grids: Record<string, Uint16Array> = { ground: A.ground, veg: A.veg, built: A.built }
  L.table.forEach((r, k) => {
    const f = byId.get(r.id)
    const grid = grids[r.kind.split('.')[0]]
    if (!f || !grid || r.attrs.growth === 'tree') return
    const rings = ringsOf(f).map(local)
    if (rings.length) fillRings(rings, grid, n, x0, cell, k + 1)
  })
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const c = cellAt(L, x0 + (i + 0.5) * cell + win.x, x0 + (j + 0.5) * cell + win.z)
      if (c >= 0) A.water[j * n + i] = L.water[c]
    }
  }
  return A
}

const WEAR_REACH = 255 * WEAR_STEP // the wear channel's reach, m
// a map world's cover cells, m: half the demo's (SPEC.macro.cover), so a slanted edge (a strip's, a wood's) steps by a
// metre, under the paint's warp (macro.glsl, coverWarp: ±1.5 m), not by the layers' 2 m
export const MAP_COVER_CELL = 1

/**
 * The window's cover grid (src/look/world/cover.ts's layout) on the areas' cells (FineAreas: their size is the
 * cover's) over the far ring: each its class (classOf), the roads and tracks over it where within their half width,
 * the villages' ground (every built cell) over all, and the distance to the nearest of those three in WEAR_STEP m. No
 * yards yet (the plan's PR b).
 */
export function mapCover(
  A: FineAreas,
  table: readonly Resolved[],
  win: LookWindow,
  lines: readonly MapLine[],
): CoverGrid {
  const { n, cell, x0 } = A
  const tex = new Uint8Array(n * n * 4)
  const wear = new Float32Array(n * n).fill(Infinity)
  const lineCls = new Uint8Array(n * n).fill(255)
  for (const l of lines) markLine(l, n, x0, cell, wear, lineCls)
  const built = new Uint8Array(n * n)
  for (let c = 0; c < n * n; c++) if (A.built[c]) built[c] = 1
  markNear(built, n, cell, wear)
  const at = (v: number) => (v ? table[v - 1] : null)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const c = j * n + i
      const x = x0 + (i + 0.5) * cell + win.x
      const z = x0 + (j + 0.5) * cell + win.z
      const g = classOf(at(A.ground[c]), at(A.veg[c]), !!A.water[c], x, z)
      const dir = g.dir
      let { cls, id } = g
      if (lineCls[c] !== 255) [cls, id] = [lineCls[c] as CoverClass, 0]
      if (built[c]) [cls, id] = [COVER.village, 0]
      const o = c * 4
      tex[o] = cls
      tex[o + 1] = id
      tex[o + 2] = id ? Math.round(((((dir % Math.PI) + Math.PI) % Math.PI) / Math.PI) * 255) % 256 : 0
      tex[o + 3] = Math.min(255, Math.round(Math.min(wear[c], WEAR_REACH) / WEAR_STEP))
    }
  }
  return { n, cell, x0, z0: x0, tex }
}

/** A line's cells: its class where within its half width (a road over a track), and every cell's distance to it. */
function markLine(l: MapLine, n: number, x0: number, cell: number, wear: Float32Array, cls: Uint8Array): void {
  const hw = l.w / 2
  const r = hw + WEAR_REACH
  for (let k = 0; k + 1 < l.pts.length; k++) {
    const a = l.pts[k]
    const b = l.pts[k + 1]
    const i0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - r - x0) / cell))
    const i1 = Math.min(n - 1, Math.floor((Math.max(a[0], b[0]) + r - x0) / cell))
    const j0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - r - x0) / cell))
    const j1 = Math.min(n - 1, Math.floor((Math.max(a[1], b[1]) + r - x0) / cell))
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const d = segD(x0 + (i + 0.5) * cell, x0 + (j + 0.5) * cell, a, b) - hw
        const c = j * n + i
        if (d < 0 && (cls[c] === 255 || l.cls === COVER.road)) cls[c] = l.cls
        wear[c] = Math.min(wear[c], Math.max(0, d))
      }
    }
  }
}

/** Every cell's distance to the nearest marked cell's centre (0 on one), within WEAR_REACH, into `wear`. */
function markNear(mark: Uint8Array, n: number, cell: number, wear: Float32Array): void {
  const R = Math.ceil(WEAR_REACH / cell)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      if (!mark[j * n + i]) continue
      // only a cell on the marked ground's edge reaches past it
      const edge = i === 0 || j === 0 || i === n - 1 || j === n - 1 || !mark[j * n + i - 1] || !mark[j * n + i + 1]
      if (!edge && mark[(j - 1) * n + i] && mark[(j + 1) * n + i]) {
        wear[j * n + i] = 0
        continue
      }
      for (let q = Math.max(0, j - R); q <= Math.min(n - 1, j + R); q++) {
        for (let p = Math.max(0, i - R); p <= Math.min(n - 1, i + R); p++) {
          const d = Math.hypot(p - i, q - j) * cell
          if (d < wear[q * n + p]) wear[q * n + p] = d
        }
      }
    }
  }
}

// a wood's trees: a lattice of WOOD_STEP m over the map, each point moved up to WOOD_JITTER m and kept by the wood's
// density; within WOOD_RIM m of the wood's edge its rim's birches and thorns
const WOOD_STEP = 6
const WOOD_JITTER = 2.4
const WOOD_RIM = 5
// the species of a wood's inside by its leaf, and of its rim: [species, share]
const LEAF: Record<string, [TreeSpecies, number][]> = {
  broad: [
    ['oak', 0.4],
    ['beech', 0.25],
    ['lime', 0.2],
    ['birch', 0.15],
  ],
  needle: [
    ['spruce', 0.6],
    ['pine', 0.4],
  ],
  mixed: [
    ['oak', 0.3],
    ['beech', 0.2],
    ['lime', 0.1],
    ['birch', 0.1],
    ['spruce', 0.2],
    ['pine', 0.1],
  ],
}
const RIM: [TreeSpecies, number][] = [
  ['birch', 0.5],
  ['hawthorn', 0.5],
]
// the species the look draws at a pack tree's scale (src/look/nature.ts, GEN_FOR); the others stand in metres
const PACK_SCALED: readonly TreeSpecies[] = ['oak', 'lime', 'beech', 'birch', 'spruce', 'pine', 'willow', 'alder']

/** One of the shares' species by the hash `u` (0..1). */
function speciesOf(shares: readonly [TreeSpecies, number][], u: number): TreeSpecies {
  for (const [sp, p] of shares) {
    if (u < p) return sp
    u -= p
  }
  return shares[shares.length - 1][0]
}

/**
 * A tree's scale for its species and the feature's height (m): a pack-scaled species at the scatter's 3.4–4.8 (a
 * wood's default 20 m height), the others in metres about the height over their models' (apple 6 m, a hawthorn 5 m,
 * a poplar 20 m); `u` (0..1) spreads it.
 */
export function treeScale(sp: TreeSpecies, height: number, u: number): number {
  if (PACK_SCALED.includes(sp)) return (3.4 + 1.4 * u) * Math.min(1.5, Math.max(0.5, height / 20))
  const model = sp === 'apple' ? 6 : sp === 'hawthorn' ? 5 : 20
  return Math.min(1.6, Math.max(0.5, height / model)) * (0.85 + 0.3 * u)
}

/** Whether a map point's cell lies in a wood. */
const woodAt = (L: Layers, x: number, z: number): boolean => {
  const k = cellAt(L, x, z)
  return k >= 0 && isWood(featureOf(L, L.veg[k]))
}

/** The tree a wood's lattice point (a, b) holds, if any: its map point, species and scale. */
export function woodTree(L: Layers, a: number, b: number): MapTree | null {
  const x = a * WOOD_STEP + (ihash(a, b, 20) - 0.5) * 2 * WOOD_JITTER
  const z = b * WOOD_STEP + (ihash(a, b, 21) - 0.5) * 2 * WOOD_JITTER
  const k = cellAt(L, x, z)
  if (k < 0 || L.water[k] || L.way[k] || L.built[k]) return null
  const r = featureOf(L, L.veg[k])
  if (!isWood(r) || ihash(a, b, 22) >= L.density[k] / 255) return null
  const rim = [0, 1, 2, 3].some(
    q => !woodAt(L, x + Math.cos((q * Math.PI) / 2) * WOOD_RIM, z + Math.sin((q * Math.PI) / 2) * WOOD_RIM),
  )
  const shares = rim ? RIM : (LEAF[String(r!.attrs.leaf)] ?? LEAF.mixed)
  const sp = speciesOf(shares, ihash(a, b, 23))
  return { x, z, sp, s: treeScale(sp, Number(r!.attrs.height ?? 20), ihash(a, b, 24)) }
}

/** The tree an orchard's row point (a, b) holds, if any: its rows along `rows.dir`, `rows.spacing` apart. */
export function orchardTree(L: Layers, r: Resolved, a: number, b: number): MapTree | null {
  const rows = (r.attrs.rows ?? {}) as Record<string, number>
  const sp = Number(rows.spacing ?? 9)
  const c = Math.cos(Number(rows.dir ?? 0))
  const s = Math.sin(Number(rows.dir ?? 0))
  const u = a * sp + (ihash(a, b, 30) - 0.5) * 0.6
  const v = b * sp + (ihash(a, b, 31) - 0.5) * 0.6
  const x = u * c - v * s
  const z = u * s + v * c
  const k = cellAt(L, x, z)
  if (k < 0 || L.water[k] || L.way[k] || L.built[k] || featureOf(L, L.veg[k]) !== r) return null
  // the odd gap in a row
  if (ihash(a, b, 32) < 0.06) return null
  return { x, z, sp: 'apple', s: treeScale('apple', Number(r.attrs.height ?? 6), ihash(a, b, 33)) }
}

/** A free-standing tree's species by its form and kind: a poplar's column, a conifer's cone, a willow, else an oak. */
function freeSpecies(r: Resolved): TreeSpecies {
  if (r.kind.startsWith('veg.tree.willow')) return 'willow'
  if (r.attrs.form === 'columnar' || r.kind.startsWith('veg.tree.poplar')) return 'poplar'
  if (r.attrs.form === 'conical' || r.kind.startsWith('veg.tree.conifer')) return 'spruce'
  return 'oak'
}

/**
 * The window's trees, in window metres, within the far ring: the woods' scatter, the orchards' rows and the
 * free-standing trees (Layers.trees), in that order.
 */
export function mapTrees(L: Layers, win: LookWindow, far: number): MapTree[] {
  const h = far / 2
  const out: MapTree[] = []
  const keep = (t: MapTree | null) => {
    if (t && Math.abs(t.x - win.x) < h && Math.abs(t.z - win.z) < h) out.push({ ...t, x: t.x - win.x, z: t.z - win.z })
  }
  const a0 = Math.floor((win.x - h) / WOOD_STEP) - 1
  const a1 = Math.ceil((win.x + h) / WOOD_STEP) + 1
  const b0 = Math.floor((win.z - h) / WOOD_STEP) - 1
  const b1 = Math.ceil((win.z + h) / WOOD_STEP) + 1
  for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) keep(woodTree(L, a, b))
  for (const r of orchardsIn(L, win, far)) {
    const rows = (r.attrs.rows ?? {}) as Record<string, number>
    const sp = Number(rows.spacing ?? 9)
    // the rows' lattice over the window's whole far ring, in the rows' frame (a turned square's reach: its diagonal)
    const c = Math.cos(Number(rows.dir ?? 0))
    const s = Math.sin(Number(rows.dir ?? 0))
    const cu = Math.round((win.x * c + win.z * s) / sp)
    const cv = Math.round((-win.x * s + win.z * c) / sp)
    const reach = Math.ceil((h * Math.SQRT2) / sp) + 1
    for (let b = cv - reach; b <= cv + reach; b++) {
      for (let a = cu - reach; a <= cu + reach; a++) keep(orchardTree(L, r, a, b))
    }
  }
  for (const t of L.trees) {
    const r = L.table[t.k - 1]
    const sp = freeSpecies(r)
    keep({
      x: t.x,
      z: t.z,
      sp,
      s: treeScale(sp, Number(r.attrs.height ?? 15), ihash(Math.round(t.x), Math.round(t.z), 40)),
    })
  }
  return out
}

/** The orchards with a cell in the window's far ring. */
function orchardsIn(L: Layers, win: LookWindow, far: number): Resolved[] {
  const found = new Set<Resolved>()
  const h = far / 2
  for (let z = win.z - h + 1; z < win.z + h; z += L.cell) {
    for (let x = win.x - h + 1; x < win.x + h; x += L.cell) {
      const k = cellAt(L, x, z)
      const r = k >= 0 ? featureOf(L, L.veg[k]) : null
      if (r && r.kind.startsWith('veg.orchard')) found.add(r)
    }
  }
  return [...found]
}

/** The species' index in the look data (TREE_SPECIES). */
export const speciesIndex = (sp: TreeSpecies): number => TREE_SPECIES.indexOf(sp)

/** The window's trees packed for the look data: x, z, species index, scale, each tree. */
export function packTrees(trees: readonly MapTree[]): Float32Array {
  const a = new Float32Array(trees.length * 4)
  trees.forEach((t, k) => a.set([t.x, t.z, speciesIndex(t.sp), t.s], k * 4))
  return a
}
