// Era ruleset: Napoleonic infantry (decision 0015: the engine is era-generic; every number here is
// data). The engine's copy of `prototypes/ruleset-napoleonic.js`, plus the block geometry, the shapes
// and the change times that the prototype kept in its core. Values and sources:
// docs/research/terrain-movement-speed-models.md §6; change times: docs/proposals/sim-design.md §5.
import { type Ruleset, type Geometry, rot2 } from '../sim/ruleset.ts'
import { PI } from '../sim/num.ts'

const geometry: Geometry = { companies: 4, files: 9, ranks: 3, fileSpacing: 0.65, rankSpacing: 0.85, minSpacing: 0.52, accordionGap: 0.6 }
const BW = (g: Geometry) => g.files * g.fileSpacing   // company frontage

export const napoleonic: Ruleset = {
  name: 'Napoleonic (infantry)',
  geometry,
  // paces in m/s
  pace: { ordinary: 0.9, routeStep: 1.125 },
  // quick-step factor: how much faster a lagging file may hurry, by pace and ground class
  q: { ordinary: { open: 1.3, light: 1.1, hard: 1.0 }, routeStep: { open: 1.15, light: 1.0, hard: 1.0 } },
  // shapes: four company blocks placed in the battalion frame (x across, z ahead)
  formations: {
    // companies side by side, one file between them; casualties close toward the colours
    line: { kind: 'line', pace: 'ordinary', closeAcross: true,
      place: g => [0, 1, 2, 3].map(c => ({ x: (c - 1.5) * (BW(g) + g.fileSpacing), z: 0, rot: 0, face: 0 })) },
    // each company one face, facing out; pinwheel, so each face's end meets the next face's rear rank
    square: { kind: 'column', pace: 'ordinary',
      place: g => { const s = (g.ranks - 1) * g.rankSpacing / 2 + 0.3, D = BW(g) / 2 + s
        return [0, -PI / 2, PI, PI / 2].map(rot => { const [x, z] = rot2(-s, D, rot); return { x, z, rot, face: rot } }) } },
    // column of divisions: two companies wide, two deep
    column: { kind: 'column', pace: 'ordinary',
      place: g => [0, 1, 2, 3].map(c => ({ x: ((c % 2) - 0.5) * (BW(g) + g.fileSpacing), z: c < 2 ? 0 : -(g.ranks * g.rankSpacing + 3.2), rot: 0, face: 0 })) },
    // column of route by files, ranks centred on the line of march; follows its head's trail
    march: { kind: 'column', pace: 'ordinary', roadPace: 'routeStep', trail: true,
      place: g => [0, 1, 2, 3].map(c => ({ x: (g.ranks - 1) * g.rankSpacing / 2, z: -c * (BW(g) + 1.0), rot: -PI / 2, face: 0 })) },
  },
  // regulation-like times in seconds at drill factor 1
  changeTime: {
    'line>column': 30, 'column>line': 40, 'column>square': 60, 'line>square': 100, 'square>line': 60, 'square>column': 30,
    'line>march': 20, 'march>line': 60, 'column>march': 20, 'march>column': 30, 'march>square': 60, 'square>march': 40,
  },
  defaultChangeTime: 30,
  start: { shape: 'line', orders: 'normal' },
  // slope: g = min(1, k · exp(-3.5 (|s + 0.05| - 0.05))), s = rise over run along the travel direction
  slopeK: 1.3,
  // terrain classes: g per formation kind (relative to the pace on firm level open ground), the ground
  // class that sets q, roads, and level ground (a bridge deck takes no slope from the valley under it)
  terrain: {
    open:      { g: { line: 1.0,  column: 1.0,  skirmish: 1.0 },  q: 'open' },
    road:      { g: { line: 1.0,  column: 1.0,  skirmish: 1.0 },  q: 'open', road: true },
    crops:     { g: { line: 0.9,  column: 0.95, skirmish: 1.0 },  q: 'open' },
    ploughed:  { g: { line: 0.85, column: 0.9,  skirmish: 0.95 }, q: 'light' },
    rough:     { g: { line: 0.75, column: 0.8,  skirmish: 0.9 },  q: 'light' },
    woods:     { g: { line: 0.55, column: 0.7,  skirmish: 0.85 }, q: 'hard' },
    denseWood: { g: { line: 0.35, column: 0.5,  skirmish: 0.7 },  q: 'hard' },
    marsh:     { g: { line: 0.6,  column: 0.65, skirmish: 0.75 }, q: 'hard' },
    hedge:     { g: { line: 0.2,  column: 0.25, skirmish: 0.5 },  q: 'hard' },
    bridge:    { g: { line: 1.0,  column: 1.0,  skirmish: 1.0 },  q: 'open', level: true },
    water:     { g: { line: 1.0,  column: 1.0,  skirmish: 1.0 },  q: 'hard' },   // times the depth curve below
  },
  // wading: g by water depth (m), linear between points; deeper than the limit is impassable
  water: { curve: [[0, 1.0], [0.35, 0.6], [0.9, 0.5]], limit: 0.9 },
  // order presets: how far one file (Lmax) and the line on average (Lmean) may fall behind, metres;
  // tau: seconds to close a lag
  orders: {
    keep:   { Lmax: 1.5, Lmean: 0.5, tau: 3 },
    normal: { Lmax: 4,   Lmean: 1.5, tau: 3 },
    push:   { Lmax: 12,  Lmean: 4,   tau: 3 },
  },
  disorder: { Lok: 1.25, kLag: 0.02, kBow: 0.03, kRec: 0.01, scale: { line: 1.0, column: 0.4, skirmish: 0.1 } },
  faceTime: 3, dressTime: 30,
  // fire: the hit chances are not historical rates: they are calibrated so two 100-man lines at 100 m
  // break the weaker in 6–10 minutes (docs/proposals/sim-design.md §8; tools/calibrate-fire.ts)
  fire: {
    arc: 0.75, maxRange: 250,
    pRange: [[0, 0.06], [50, 0.04], [100, 0.019], [150, 0.008], [200, 0.004], [250, 0]],
    reload: 25, reloadJitter: 0.2, firingRanks: 2, misfire: 0.15,
    depth: { line: 1.0, column: 1.6, skirmish: 0.5 },
    state: { steady: 1.0, shaken: 0.85, wavering: 0.6 },
    cohesion: 0.5, eye: 1.6,
    sight: { woods: 40, denseWood: 15 },
  },
  morale: {
    quality: 0.75, losses: 1.25, recent: 3, recentTime: 10, relaxTime: 20,
    shaken: [0.6, 0.65], wavering: [0.5, 0.55], rout: 0.4, routPace: 2,
  },
}
