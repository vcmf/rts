// The draft raster (docs/proposals/map-engine.md §7, docs/plans/done/m1-language.md M1b): the layers as an
// RGBA image, one pixel per 2 m cell, north up. A working drawing, not the look: flat colours by category and
// attribute, hill shading and contours every 2.5 m from the heights. Pure, so Node (PNGs, tests) and the page
// draw the same pixels. Colours read attributes and categories, never kind names (a new kind draws without code).
import type { Layers } from './apply.ts'
import { categoryOf } from './catalogue.ts'
import type { Resolved } from './resolve.ts'

type RGB = [number, number, number]
export const CONTOUR = 2.5 // m

// the ground and its low growth: by growth, height and stage
function groundColour(r: Resolved | undefined, veg: Resolved | undefined, density: number): RGB {
  const v = veg?.attrs ?? r?.attrs ?? {}
  const g = r?.attrs ?? {}
  if (g.material === 'peat' || (typeof g.moisture === 'number' && g.moisture >= 0.9)) return [128, 150, 120] // marsh
  if (veg && categoryOf(veg.kind) === 'veg' && v.growth === 'stand') {
    const d = density / 255
    // orchard; woods darken with density
    return v.rows ? [120, 150, 80] : [Math.round(92 - 40 * d), Math.round(128 - 38 * d), Math.round(70 - 30 * d)]
  }
  // yards, worn ground
  if (v.growth === 'none' || (g.wear !== undefined && (g.wear as number) >= 0.5)) return [176, 160, 132]
  if (v.stage === 'ploughed') return [150, 118, 86]
  if (v.stage === 'stubble') return [214, 196, 140]
  if (v.stage === 'standing') return [222, 196, 110]
  if (typeof g.stones === 'number' && g.stones >= 0.4) return [160, 160, 120] // rough
  const h = typeof v.height === 'number' ? v.height : 0.3
  return h < 0.2 ? [176, 196, 128] : [154, 184, 112] // pasture, meadow
}

// water by depth: shallow (a ford) pale, a pool dark
const SHALLOW: RGB = [128, 178, 206]
const DEEP: RGB = [52, 96, 146]
const water = (mm: number): RGB => {
  const t = Math.min(1, mm / 1500)
  return [
    SHALLOW[0] + (DEEP[0] - SHALLOW[0]) * t,
    SHALLOW[1] + (DEEP[1] - SHALLOW[1]) * t,
    SHALLOW[2] + (DEEP[2] - SHALLOW[2]) * t,
  ]
}
const WAY: RGB = [198, 170, 126]
const SUNKEN: RGB = [150, 120, 84]
const EDIT: RGB = [120, 100, 80]
// a way by its surface: earth (tan), setts or cobbles (grey), brick (red), metalled (pale)
const SURFACE: Record<string, RGB> = {
  earth: WAY,
  paved: [150, 146, 140],
  brick: [172, 98, 76],
  metalled: [196, 190, 176],
}
// a free-standing tree's crown by its form: broadleaf round, poplar columns and conifers darker
const CROWN: Record<string, RGB> = { round: [74, 112, 58], columnar: [46, 86, 52], conical: [38, 72, 56] }
function barrierColour(r: Resolved): RGB {
  const p = typeof r.attrs.porosity === 'number' ? r.attrs.porosity : 0
  return p >= 0.6 ? [120, 92, 60] : p > 0 ? [46, 74, 40] : [92, 88, 84] // fence, hedge, wall
}
function builtColour(r: Resolved): RGB {
  if (categoryOf(r.kind) === 'work') return [130, 100, 70]
  if (r.attrs.houses !== undefined) return [200, 176, 150] // a village's ground
  if (r.attrs.roof === undefined && r.attrs.wall === undefined) return [168, 150, 128] // a bridge's deck, a farm's yard
  return typeof r.attrs.height === 'number' && r.attrs.height >= 12 ? [96, 70, 64] : [168, 92, 72] // church, house
}

export interface Draft {
  w: number
  h: number
  data: Uint8ClampedArray
}
export function draft(L: Layers): Draft {
  const { nx, nz, cell } = L
  const data = new Uint8ClampedArray(nx * nz * 4)
  const H = L.height
  const W = nx + 1
  const T = (k: number): Resolved | undefined => (k ? L.table[k - 1] : undefined)
  // colours per feature, worked out once; the ground's per (ground, veg) pair, and per density only under a stand
  const n = L.table.length + 1
  const cutCell: boolean[] = []
  const yard: boolean[] = []
  const way: RGB[] = []
  const barrier: RGB[] = []
  const built: RGB[] = []
  const groundCache = new Map<number, RGB>()
  for (let k = 1; k < n; k++) {
    const r = L.table[k - 1]
    const cut = r.attrs.cut
    way[k] = typeof cut === 'number' && cut > 0 ? SUNKEN : (SURFACE[r.attrs.surface as string] ?? WAY)
    barrier[k] = barrierColour(r)
    built[k] = builtColour(r)
    cutCell[k] = typeof r.attrs.depth === 'number' || (typeof cut === 'number' && cut > 0)
    yard[k] = r.attrs.roof === undefined && r.attrs.wall === undefined && r.kind !== 'built.bridge'
  }
  const ground = (g: number, v: number, d: number): RGB => {
    const stand = v && L.table[v - 1].attrs.growth === 'stand'
    const key = (g * n + v) * 256 + (stand ? d : 0)
    let col = groundCache.get(key)
    if (!col) {
      col = groundColour(T(g), T(v), d)
      groundCache.set(key, col)
    }
    return col
  }
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const cellIx = j * nx + i
      // the cell's corner heights: slope for the shading (light from the north-west, above), and contours
      const h00 = H[j * W + i]
      const h10 = H[j * W + i + 1]
      const h01 = H[(j + 1) * W + i]
      const h11 = H[(j + 1) * W + i + 1]
      const gx = (h10 + h11 - h00 - h01) / (2 * cell)
      const gz = (h01 + h11 - h00 - h10) / (2 * cell)
      // the light: from the north-west, 45° up; flat ground keeps its colour, slopes facing the light brighten
      const nlen = Math.sqrt(gx * gx + gz * gz + 1)
      const lit = (gx * 0.5 - gz * 0.5 + 0.7071) / nlen
      const shade = Math.max(0.55, Math.min(1.3, 1 + 2.2 * (lit - 0.7071)))
      let col: RGB = ground(L.ground[cellIx], L.veg[cellIx], L.density[cellIx])
      // ground-like building (a village's yard: no walls, no roof, not a bridge) lies under the road; the rest over it
      const bk = L.built[cellIx]
      const flat = bk && yard[bk]
      if (flat) col = built[bk]
      // cuts and ditches show; raised, lowered or levelled ground keeps its colour
      if (L.edit[cellIx] && cutCell[L.edit[cellIx]]) col = EDIT
      if (L.water[cellIx]) col = water(L.depth[cellIx])
      if (L.way[cellIx]) col = way[L.way[cellIx]]
      if (bk && !flat) col = built[bk]
      if (L.barrier[cellIx]) col = barrier[L.barrier[cellIx]]
      const k = L.water[cellIx] ? 1 : shade
      let r = col[0] * k
      let g = col[1] * k
      let b = col[2] * k
      if (L.zone[cellIx]) {
        r = r * 0.6 + 200 * 0.4
        g = g * 0.6 + 40 * 0.4
        b = b * 0.6 + 40 * 0.4
      }
      // a contour where the cell's corners straddle a multiple of CONTOUR (every fourth darker) (strictly: ground that
      // only touches a contour's height, like the rim of a hollow at 0 m, draws none)
      const lo = Math.min(h00, h10, h01, h11)
      const hi = Math.max(h00, h10, h01, h11)
      const band = Math.ceil(hi / CONTOUR) - 1
      const v = band * CONTOUR
      if (v > lo && v < hi && !L.water[cellIx]) {
        const k = band % 4 === 0 ? 0.62 : 0.8
        r *= k
        g *= k
        b *= k
      }
      // north up: row 0 is the northern edge
      const o = ((nz - 1 - j) * nx + i) * 4
      data[o] = r
      data[o + 1] = g
      data[o + 2] = b
      data[o + 3] = 255
    }
  }
  // the trees over everything: a disc of the crown, its middle darker
  // (a radius of at least a cell, 2 m, so a poplar reads)
  for (const t of L.trees) {
    const a = L.table[t.k - 1].attrs
    const col = CROWN[a.form as string] ?? CROWN.round
    const R = Math.max(cell, typeof a.crown === 'number' ? a.crown : 4)
    const i0 = Math.floor((t.x - R - L.x0) / cell)
    const i1 = Math.floor((t.x + R - L.x0) / cell)
    const j0 = Math.floor((t.z - R - L.z0) / cell)
    const j1 = Math.floor((t.z + R - L.z0) / cell)
    for (let j = Math.max(0, j0); j <= Math.min(nz - 1, j1); j++) {
      for (let i = Math.max(0, i0); i <= Math.min(nx - 1, i1); i++) {
        const dx = L.x0 + (i + 0.5) * cell - t.x
        const dz = L.z0 + (j + 0.5) * cell - t.z
        const d = Math.sqrt(dx * dx + dz * dz)
        if (d > R) continue
        const k = d < R / 2 ? 0.8 : 1
        const o = ((nz - 1 - j) * nx + i) * 4
        data[o] = col[0] * k
        data[o + 1] = col[1] * k
        data[o + 2] = col[2] * k
      }
    }
  }
  return { w: nx, h: nz, data }
}
