// Era ruleset: the Napoleonic infantry battalion, cavalry regiment and foot battery (decision 0015: the engine
// is era-generic; every number here is data). The engine's copy of `prototypes/ruleset-napoleonic.js`, plus
// the block geometries, the shapes and the change times that the prototype kept in its core. Values and
// sources: docs/research/terrain-movement-speed-models.md §6 (paces, terrain factors, wading);
// docs/research/formation-movement-and-doc-systems.md (cavalry ranks and intervals, unlimbering); change
// times: docs/proposals/sim-design.md §5; the unit types: docs/plans/active/s1d1-unit-types.md.
import { type Ruleset, type UnitType, type Geometry, type Placement, rot2, withBlock } from '../sim/ruleset.ts'
import { PI } from '../sim/num.ts'

// a division (decision 0076: a figure stands for 25 men): 240 figures in 4 sections of 20 files × 3 ranks, about
// 54 m wide in line; the sections are how fire, sight and losses are reckoned, not companies the player sees
// (docs/proposals/division-scale.md § 2); a bin is 2–3 files
const geometry: Geometry = {
  companies: 4,
  files: 20,
  ranks: 3,
  fileSpacing: 0.65,
  rankSpacing: 0.85,
  minSpacing: 0.52,
  accordionGap: 0.6,
  bins: 8,
}
const BW = (g: Geometry) => g.files * g.fileSpacing // company frontage
const each = <T>(g: Geometry, f: (c: number) => T): T[] => Array.from({ length: g.companies }, (_, c) => f(c))
// the square: the companies over four faces, front and rear first (6: 2, 1, 2, 1), each face a row of
// blocks facing out at its distance from the centre; a pinwheel, so each face's end meets the next face's
// rear rank. Faces in order: front, right, rear, left. Opposite faces must match to close the square, so it
// needs an even number of companies, at least 4
function square(g: Geometry): Placement[] {
  const C = g.companies
  if (C < 4 || C % 2) throw new Error(`square: ${C} companies; it needs an even number, at least 4`)
  const base = Math.floor(C / 4)
  const extra = C % 4
  // the extras go front and rear
  const counts = [0, 1, 2, 3].map(face => base + ([0, 2, 1, 3].indexOf(face) < extra ? 1 : 0))
  const s = ((g.ranks - 1) * g.rankSpacing) / 2 + 0.3
  const len = (k: number) => k * BW(g) + (k - 1) * g.fileSpacing
  const out: Placement[] = []
  ;[0, -PI / 2, PI, PI / 2].forEach((rot, face) => {
    const k = counts[face]
    const D = (face % 2 ? len(counts[0]) : len(counts[1])) / 2 + s
    for (let j = 0; j < k; j++) {
      const [x, z] = rot2((j - (k - 1) / 2) * (BW(g) + g.fileSpacing) - s, D, rot)
      out.push({ x, z, rot, face: rot })
    }
  })
  return out
}

const infantry: UnitType = {
  geometry,
  // shapes: the company blocks placed in the battalion frame (x across, z ahead)
  formations: {
    // companies side by side, one file between them; casualties close toward the colours
    line: {
      kind: 'line',
      pace: 'ordinary',
      closeAcross: true,
      traits: { hits: { front: 1.0, flank: 1.8, rear: 1.2 } }, // enfiladed, the ball runs down the files
      place: g => each(g, c => ({ x: (c - (g.companies - 1) / 2) * (BW(g) + g.fileSpacing), z: 0, rot: 0, face: 0 })),
    },
    // the companies over four faces, facing out (square, above)
    square: {
      kind: 'column',
      pace: 'ordinary',
      allRound: true,
      traits: { hits: { front: 1.6 }, brace: 1 },
      place: square,
    },
    // column of divisions: two companies wide, one division behind another (an odd last company centred;
    // 0 − keeps the first division at +0)
    column: {
      kind: 'column',
      pace: 'ordinary',
      traits: { hits: { front: 1.6, flank: 1.2, rear: 1.1 } },
      place: g =>
        each(g, c => ({
          x: c === g.companies - 1 && g.companies % 2 ? 0 : ((c % 2) - 0.5) * (BW(g) + g.fileSpacing),
          z: 0 - Math.floor(c / 2) * (g.ranks * g.rankSpacing + 3.2),
          rot: 0,
          face: 0,
        })),
    },
    // column of route by files, ranks centred on the line of march; follows its head's trail
    march: {
      kind: 'column',
      pace: 'ordinary',
      roadPace: 'routeStep',
      trail: true,
      traits: { hits: { front: 1.6, flank: 1.5, rear: 1.0 } },
      place: g =>
        each(g, c => ({ x: ((g.ranks - 1) * g.rankSpacing) / 2, z: -c * (BW(g) + 1.0), rot: -PI / 2, face: 0 })),
    },
  },
  // regulation-like times in seconds at drill factor 1
  changeTime: {
    'line>column': 30,
    'column>line': 40,
    'column>square': 60,
    'line>square': 100,
    'square>line': 60,
    'square>column': 30,
    'line>march': 20,
    'march>line': 60,
    'column>march': 20,
    'march>column': 30,
    'march>square': 60,
    'square>march': 40,
  },
  defaultChangeTime: 30,
  start: 'line',
  fires: true,
  figure: 'foot',
  refuge: 'square', // formed against cavalry (the standing behaviour, docs/systems/melee.md)
}

// light cavalry of a corps (decision 0076): 80 figures in 2 squadrons of 20 files × 2 ranks: a figure's frontage
// 1 m, a horse and the gap behind it 3 m, the squadrons 10 m apart; a bin is 4 files
const horseGeometry: Geometry = {
  companies: 2,
  files: 20,
  ranks: 2,
  fileSpacing: 1.0,
  rankSpacing: 3.0,
  minSpacing: 0.8,
  accordionGap: 1.0,
  bins: 5,
}
const SQ_GAP = 10
const cavalry: UnitType = {
  geometry: horseGeometry,
  formations: {
    // the squadrons side by side
    line: {
      kind: 'horse',
      pace: 'walk',
      traits: { hits: { flank: 1.2, rear: 1.1 } },
      place: g => each(g, c => ({ x: (c - (g.companies - 1) / 2) * (BW(g) + SQ_GAP), z: 0, rot: 0, face: 0 })),
    },
    // column of squadrons at half distance: each squadron half its frontage behind the one ahead
    column: {
      kind: 'horse',
      pace: 'walk',
      traits: { hits: { flank: 1.2, rear: 1.1 } },
      place: g => each(g, c => ({ x: 0, z: -c * ((g.ranks - 1) * g.rankSpacing + BW(g) / 2), rot: 0, face: 0 })),
    },
    // column of route by fours at the trot: each squadron's block turned along the road as a column of twos,
    // horses 3 m nose to tail, its two ranks 1 m apart; the squadrons in pairs side by side, the leading horses
    // at the anchor; follows its head's trail
    march: {
      kind: 'horse',
      pace: 'trot',
      trail: true,
      traits: { hits: { flank: 1.5, rear: 1.0 } },
      step: { file: 3.0, rank: 1.0 },
      place: g =>
        each(g, c => ({
          x: c % 2 ? 1.5 : -0.5,
          z: -(g.files - 1) * 1.5 - Math.floor(c / 2) * (g.files * 3.0 + 3.0),
          rot: -PI / 2,
          face: 0,
        })),
    },
  },
  // the squadrons move at the trot: no squadron's frame covers more than 3.3 m/s over its part of the change
  // (0.55 of it); the 157 m line and the 190 m column make these longer than the battalion's
  changeTime: {
    'line>column': 45,
    'column>line': 45,
    'line>march': 100,
    'march>line': 100,
    'column>march': 75,
    'march>column': 75,
  },
  defaultChangeTime: 60,
  start: 'line',
  fires: false,
  figure: 'mounted',
  traits: { hits: { front: 1.3 }, melee: 1.6 }, // every shape: a horseman is a large target, and strong in melee
  // the charge (docs/systems/melee.md): at the trot, the gallop over the last 150 m (the research: 50–200
  // paces), full weight after 50 m of it; blown for two minutes after, recoiling 80 m from a square
  charge: {
    shapes: ['line', 'column'],
    approach: 'trot',
    pace: 'gallop',
    gallopAt: 150,
    build: 50,
    test: 60,
    recoil: 80,
    rest: 120,
    pursue: 20,
  },
}

// a corps' battery (decision 0076): 4 guns, each a detachment of 4 files × 3 ranks (12 figures; 48 in all) as a
// section, the piece itself drawn ahead of it; one bin per piece
const gunGeometry: Geometry = {
  companies: 4,
  files: 4,
  ranks: 3,
  fileSpacing: 1.0,
  rankSpacing: 1.2,
  minSpacing: 0.6,
  accordionGap: 1.0,
  bins: 1,
}
const battery: UnitType = {
  geometry: gunGeometry,
  formations: {
    // in action: the pieces in a line 16 m apart, each detachment behind its piece; moved by hand
    unlimbered: {
      kind: 'guns',
      pace: 'manhandle',
      traits: { hits: { flank: 1.5, rear: 1.0 } },
      place: g => each(g, c => ({ x: (c - (g.companies - 1) / 2) * 16, z: 0, rot: 0, face: 0 })),
    },
    // on the move: piece, limber and team one behind the other on the trail, 18 m apart, at the walk
    limbered: {
      kind: 'guns',
      pace: 'gunWalk',
      trail: true,
      traits: { hits: { flank: 1.5, rear: 1.0 } },
      place: g => each(g, c => ({ x: 0, z: -c * 18, rot: 0, face: 0 })),
    },
  },
  // coming into action from the column (the pieces at the trot, under 2.8 m/s over their part of the change)
  // and unlimbering; limbering up and forming the column. Unsourced, to tune (sim-design §5: unlimbering about a
  // minute; the research: under a minute, limbering 1–3)
  changeTime: { 'limbered>unlimbered': 90, 'unlimbered>limbered': 120 },
  defaultChangeTime: 90,
  start: 'limbered',
  fires: false, // no musketry: its pieces fire shot
  figure: 'crewed',
  traits: { hits: { front: 0.4 }, melee: 0.3 }, // every shape: the detachment spread round its piece; weak in melee
  // roundshot and canister (docs/systems/artillery.md): a 6-pounder's ball at about 430 m/s, effective to about
  // 800 m with its grazes; canister inside 300 m (the research: 200–350 m). First guesses, tuned by
  // tools/calibrate-artillery.ts
  artillery: {
    shapes: ['unlimbered'],
    arc: 0.35,
    reload: 25,
    reloadJitter: 0.2,
    crew: 12,
    crewSlow: 3,
    ahead: 2,
    min: 15, // bayonet range: inside it the gunners fight for their pieces (docs/proposals/division-scale.md § 4)
    ray: {
      range: 1000,
      step: 2,
      muzzle: 1.0,
      speed: 430,
      energy: 1100,
      graze: 60,
      restitution: 0.3,
      bury: 0.25,
      height: 1.9,
      width: 0.6,
      perMan: 25,
      kill: 0.09,
      spread: 0.012,
      short: 0.1,
    },
    cone: {
      range: 300,
      half: 0.09,
      hits: [
        [0, 8],
        [100, 5],
        [200, 2],
        [300, 0.5],
      ],
    },
  },
}

export const napoleonic: Ruleset = {
  name: 'Napoleonic',
  menPerFigure: 25, // decision 0076: a unit is a division, a figure 25 men
  types: { infantry, cavalry, battery },
  // paces in m/s: infantry ordinary and route step; cavalry walk, trot and the charge's gallop;
  // a battery at the walk limbered, by hand unlimbered
  pace: { ordinary: 0.9, routeStep: 1.125, walk: 1.7, trot: 3.3, gallop: 6.5, gunWalk: 0.85, manhandle: 0.3 },
  // quick-step factor: how much faster a lagging file may hurry, by pace and ground class
  q: {
    ordinary: { open: 1.3, light: 1.1, hard: 1.0 },
    routeStep: { open: 1.15, light: 1.0, hard: 1.0 },
    walk: { open: 1.5, light: 1.2, hard: 1.0 },
    trot: { open: 1.15, light: 1.0, hard: 1.0 },
    gallop: { open: 1.05, light: 1.0, hard: 1.0 },
    gunWalk: { open: 1.0, light: 1.0, hard: 1.0 },
    manhandle: { open: 1.0, light: 1.0, hard: 1.0 },
  },
  start: { orders: 'normal' },
  // slope: g = min(1, k · exp(-3.5 (|s + 0.05| - 0.05))), s = rise over run along the travel direction
  slopeK: 1.3,
  // terrain classes: g per formation kind (relative to the pace on firm level open ground), the ground
  // class that sets q, roads, and level ground (a bridge deck takes no slope from the valley under it).
  // Horses at the walk or trot; guns limbered at the walk, held to tracks in woods (0: impassable)
  terrain: {
    open: { g: { line: 1.0, column: 1.0, skirmish: 1.0, horse: 1.0, guns: 0.85 }, q: 'open' },
    road: { g: { line: 1.0, column: 1.0, skirmish: 1.0, horse: 1.0, guns: 1.0 }, q: 'open', road: true },
    crops: { g: { line: 0.9, column: 0.95, skirmish: 1.0, horse: 0.9, guns: 0.75 }, q: 'open' },
    ploughed: { g: { line: 0.85, column: 0.9, skirmish: 0.95, horse: 0.8, guns: 0.6 }, q: 'light' },
    rough: { g: { line: 0.75, column: 0.8, skirmish: 0.9, horse: 0.6, guns: 0.45 }, q: 'light' },
    woods: { g: { line: 0.55, column: 0.7, skirmish: 0.85, horse: 0.45, guns: 0 }, q: 'hard' },
    denseWood: { g: { line: 0.35, column: 0.5, skirmish: 0.7, horse: 0.25, guns: 0 }, q: 'hard' },
    marsh: { g: { line: 0.6, column: 0.65, skirmish: 0.75, horse: 0.35, guns: 0 }, q: 'hard' },
    hedge: { g: { line: 0.2, column: 0.25, skirmish: 0.5, horse: 0.15, guns: 0 }, q: 'hard' },
    bridge: { g: { line: 1.0, column: 1.0, skirmish: 1.0, horse: 1.0, guns: 1.0 }, q: 'open', level: true },
    // times the depth curve below
    water: { g: { line: 1.0, column: 1.0, skirmish: 1.0, horse: 1.0, guns: 1.0 }, q: 'hard' },
  },
  // wading: g by water depth (m), linear between points; deeper than the limit is impassable (horses wade
  // deeper, guns less deep)
  water: {
    curve: [
      [0, 1.0],
      [0.35, 0.6],
      [0.9, 0.5],
    ],
    limit: 0.9,
    limitByKind: { horse: 1.2, guns: 0.7 },
  },
  // order presets: how far one file (Lmax) and the line on average (Lmean) may fall behind, metres;
  // tau: seconds to close a lag
  orders: {
    keep: { Lmax: 1.5, Lmean: 0.5, tau: 3 },
    normal: { Lmax: 4, Lmean: 1.5, tau: 3 },
    push: { Lmax: 12, Lmean: 4, tau: 3 },
  },
  disorder: {
    Lok: 1.25,
    kLag: 0.02,
    kBow: 0.03,
    kRec: 0.01,
    scale: { line: 1.0, column: 0.4, skirmish: 0.1, horse: 0.6, guns: 0.2 },
  },
  faceTime: 3,
  dressTime: 30,
  // fire: the hit chances are not historical rates: they are calibrated so two lines at the C-01 anchor (40 m at
  // the division scale, S1c's 100 m × 0.4) break the weaker in 6–10 minutes (docs/proposals/sim-design.md §8;
  // tools/calibrate-fire.ts); the range and the table are S1c's × 0.4 (docs/proposals/division-scale.md § 3)
  fire: {
    arc: 0.75,
    maxRange: 100,
    pRange: [
      [0, 0.06],
      [20, 0.04],
      [40, 0.019],
      [60, 0.008],
      [80, 0.004],
      [100, 0],
    ],
    reload: 25,
    reloadJitter: 0.2,
    firingRanks: 2,
    misfire: 0.15,
    state: { steady: 1.0, shaken: 0.85, wavering: 0.6 },
    cohesion: 0.5,
    eye: 1.6,
    sight: { woods: 40, denseWood: 15 },
  },
  // the morale bar (docs/proposals/morale-bar-model.md § 8), in points: today's numbers × 100 / 0.35, the margin of the
  // old default quality (0.75) over the rout (0.4) being level 2's bar of 100
  morale: {
    level: 2,
    loss: 357, // level 2 breaks at 28% losses, as the old average line did
    regen: 2, // shocks wear off in the fight, under fire too: the old relax recovered a contagion shock at about 2 a
    // second at first
    scar: 1, // losses are never recovered
    shaken: [0.6, 0.7],
    wavering: [0.3, 0.45],
    routPace: 2,
    // the rest of the machine (docs/plans/active/s1c2-morale-machine.md)
    // the reaches scale with the frontage: S1c-4's for 400-man lines 113 m apart in a brigade, × 0.58 at the
    // division scale (units about 54 m wide, 65 m apart: docs/proposals/division-scale.md § 5)
    contagion: { shock: 43, front: 325, back: 163 },
    // an enemy on its flank presses a steady line (100 → 71, still steady); one behind it makes it shaken (43)
    drain: { flank: 29, rear: 57 },
    support: { bonus: 11, reach: 163, arc: 0.7853981633974483 },
    rally: { safe: 100, calm: 20, time: 30, cut: 0.25, share: 0.5, max: 2 },
    shatter: 0.5,
    leave: 12, // S1e-1: shattered formations that reach the map's edge leave the field
  },
  // experience (docs/proposals/morale-bar-model.md § 8): first guesses
  levels: [
    {
      name: 'Recruits',
      points: 0,
      bar: 70,
      toughness: 0.9,
      reload: 1.12,
      precision: 0.85,
      drill: 1.3,
      react: 2.5,
      pursue: 2,
    },
    { name: 'Line', points: 100, bar: 100, toughness: 1, reload: 1, precision: 1, drill: 1, react: 1, pursue: 1 },
    {
      name: 'Veterans',
      points: 300,
      bar: 120,
      toughness: 1.1,
      reload: 0.92,
      precision: 1.1,
      drill: 0.85,
      react: 1,
      pursue: 0.8,
    },
    {
      name: 'Young Guard',
      points: 700,
      bar: 140,
      toughness: 1.2,
      reload: 0.88,
      precision: 1.15,
      drill: 0.8,
      react: 0.5,
      pursue: 0.7,
    },
    {
      name: 'Middle Guard',
      points: 1500,
      bar: 160,
      toughness: 1.3,
      reload: 0.84,
      precision: 1.2,
      drill: 0.75,
      react: 0.5,
      pursue: 0.7,
    },
    {
      name: 'Old Guard',
      points: 3100,
      bar: 180,
      toughness: 1.4,
      reload: 0.8,
      precision: 1.25,
      drill: 0.7,
      react: 0.5,
      pursue: 0.7,
    },
  ],
  // a recruit line that wins a firefight like the calibration's (about 80 men struck, 9 minutes under fire, one enemy
  // broken) gains about 100: level 2 in a battle or two
  points: { man: 0.5, fire: 0.05, window: 10, repulse: 15, broke: 25 },
  // charges and melee (docs/plans/active/s1d2-charges.md): first guesses, tuned by tools/calibrate-charge.ts.
  // A charge's threat shakes the target at the test, its impact costs men and morale by its momentum and the
  // side it comes from, both cut by how far the target is braced (a square); melee kills per man in contact
  melee: {
    contact: 2,
    hold: 3,
    threat: { front: 34, flank: 71, rear: 86 }, // points
    impact: { kill: 0.06, shock: { front: 57, flank: 100, rear: 114 } },
    second: { flank: 43, rear: 57 }, // under the guard: 0.6 × level 2's 100
    rate: 0.01,
    cohesion: 0.5,
    refuse: 0.9,
    breach: 0.3,
    refuge: { alert: 200, closing: 1, react: 2, hold: 30 }, // the square against cavalry
  },
  // where a threat stands (docs/proposals/sectors-model.md § 8): 45°, blended 35° to 55°; a metre's corner; eight
  // slices; no threat farther than the canister's range
  sectors: { blend: { T: 0.5, H: 0.088 }, corner: 1, slices: 8, reach: 300 },
  // the end of a battle (S1e-2): a side with 35% of its men out of the fight is broken (S1e-3: at half,
  // a side whose first line had routed fought on; its rallied battalions stood at the map's edge for the rest);
  // at a time limit, shares in the fight within 5 points are a draw. It is every Napoleonic scenario's, and makes up
  // for rallied battalions far off counting as in the fight (#180)
  end: { broken: 0.65, margin: 0.05 },
}
// the ceiling (decision 0018): the same ruleset with sections of 45 files, 540 places (tests, cost benches)
export const ceiling: Ruleset = withBlock({ ...napoleonic, name: `${napoleonic.name}, the ceiling` }, 'infantry', {
  files: 45,
  bins: 15,
})
