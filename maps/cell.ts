// One cell's attributes as a ruleset reads them (docs/proposals/map-engine.md §6, docs/plans/done/m2-sim.md): the
// features the map engine laid on the cell, as plain data (src/rulesets/ground.ts). Shared by the sim compiler
// (engine.ts) and the map page's overlays (src/render/lit/overlays.ts).
import type { Layers } from '../src/map/apply.ts'
import type { GroundCell } from '../src/rulesets/ground.ts'

/** One cell's attributes, from its layers. */
export function groundCell(L: Layers, cell: number): GroundCell {
  const T = (k: number) => (k ? L.table[k - 1].attrs : undefined)
  const g = T(L.ground[cell])
  const v = T(L.veg[cell])
  const w = T(L.way[cell])
  const b = T(L.barrier[cell])
  const bu = L.built[cell] ? L.table[L.built[cell] - 1] : undefined
  const n = (x: unknown) => (typeof x === 'number' ? x : undefined)
  const s = (x: unknown) => (typeof x === 'string' ? x : undefined)
  return {
    ground: g && { material: s(g.material), moisture: n(g.moisture), stones: n(g.stones), wear: n(g.wear) },
    veg: v && {
      growth: s(v.growth),
      density: L.density[cell] / 255,
      height: n(v.height),
      stage: s(v.stage),
      undergrowth: n(v.undergrowth),
    },
    water: L.depth[cell] / 1000,
    way: w && { surface: s(w.surface), cut: n(w.cut) },
    barrier: b && { crossing: s(b.crossing), height: n(b.height), porosity: n(b.porosity) },
    built: bu && {
      bridge: bu.kind.split('.')[1] === 'bridge',
      building: bu.attrs.wall !== undefined || bu.attrs.roof !== undefined,
    },
    nogo: !!L.zone[cell] && L.table[L.zone[cell] - 1].kind === 'zone.nogo',
    go: !!L.zone[cell] && L.table[L.zone[cell] - 1].kind === 'zone.go',
  }
}

// a no-go cell's depth, m: past every wading limit
export const NOGO_DEPTH = 10

/**
 * The water's depth the sim takes on a cell (m), given the class its ruleset read there: none on a bridge's deck or
 * where the map says go, past every limit where it says no-go, else the water's own. Shared by the sim compiler
 * (engine.ts) and the map page's passability overlay, so the two agree.
 */
export const simDepth = (gc: GroundCell, cls: string): number =>
  gc.nogo ? NOGO_DEPTH : cls === 'bridge' || gc.go ? 0 : gc.water
