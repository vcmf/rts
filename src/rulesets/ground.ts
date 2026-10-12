// What lies on a cell of a map, as a ruleset reads it (docs/proposals/map-engine.md §6, docs/plans/done/m2-sim.md):
// the attributes the map engine resolved for the cell's layers, as plain data, so a ruleset can classify ground
// without importing the map engine. The map records what is there; the ruleset decides what it means for play
// (decision 0015).
export interface GroundCell {
  ground?: { material?: string; moisture?: number; stones?: number; wear?: number }
  veg?: { growth?: string; density: number; height?: number; stage?: string; undergrowth?: number }   // density 0..1, ramps evaluated
  water: number                                   // depth over the cell, m (0: dry)
  way?: { surface?: string; cut?: number }
  barrier?: { crossing?: string; height?: number; porosity?: number }
  built?: { bridge: boolean; building: boolean }
  nogo: boolean                                   // the map's overrides (zone.nogo, zone.go): impassable, or passable
  go: boolean                                     // whatever the ground would say
}

// a ruleset's reading of a cell: one of its terrain classes (the keys of its terrain table)
export type Classify = (cell: GroundCell) => string
