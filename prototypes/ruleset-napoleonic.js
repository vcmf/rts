// Era ruleset: Napoleonic infantry movement (decision 0015: the engine is era-generic; every number
// here is data). Values and sources: docs/research/terrain-movement-speed-models.md §6 (tables
// "Base speeds and hurry ratios", "Terrain factor g", "Slope, water, tolerance and flow"). Most g
// values are reasoned estimates there, to be tuned on the map. Loaded before formation-core.js.
window.RULESET = {
  name: 'Napoleonic (infantry)',
  // paces in m/s
  pace: { ordinary: 0.9, routeStep: 1.125 },
  // quick-step factor: how much faster a lagging file may hurry, by pace and ground class (French
  // 100/76 at the ordinary pace; less when already at a quicker pace)
  q: { ordinary: { open: 1.3, light: 1.1, hard: 1.0 }, routeStep: { open: 1.15, light: 1.0, hard: 1.0 } },
  // formations: terrain column used, pace off and on roads (a road pace only while every company is on
  // a road), and whether the companies follow the head's trail (a column of route)
  // closeAcross: casualties close toward the colours across company boundaries (else each company
  // closes on its own centre, and the companies are evened out when the shape starts or ends)
  formations: {
    line:   { kind: 'line',   pace: 'ordinary', closeAcross: true },
    square: { kind: 'column', pace: 'ordinary' },
    column: { kind: 'column', pace: 'ordinary' },
    march:  { kind: 'column', pace: 'ordinary', roadPace: 'routeStep', trail: true },
  },
  // a new battalion's shape and order preset; the shapes to narrow to for a passage and to deploy beyond it
  start: { shape: 'line', orders: 'normal' },
  passage: { narrow: 'march', deploy: 'line' },
  // slope: g = min(1, k · exp(-3.5 (|s + 0.05| - 0.05))), s = rise over run along the travel direction
  slopeK: 1.3,
  // terrain classes: g per formation (relative to the pace on firm level open ground) and the ground
  // class that sets q. 'impassable' blocks. Disorder scale per formation multiplies lag-driven disorder.
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
    bridge:    { g: { line: 1.0,  column: 1.0,  skirmish: 1.0 },  q: 'open' },
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
  // disorder (0..1): grows with lag beyond the dressed tolerance and with the line's bow, recovers
  // when dressed (faster when halted)
  disorder: { Lok: 1.25, kLag: 0.02, kBow: 0.03, kRec: 0.01, scale: { line: 1.0, column: 0.4, skirmish: 0.1 } },
};
