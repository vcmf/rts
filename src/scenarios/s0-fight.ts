// The S0 acceptance scenario (docs/plans/active/s0-sim-spine.md): eight blocks of 100 men, four per
// side, march at each other across the formation test field and fight where they meet. The scenario's
// own commands are part of the scenario, not the log; `orders` are the external (logged) commands of the
// recorded run, at irregular ticks.
import { type World, issue, makeHandle, KIND_FORMATION, type Command, type Scenario } from '../sim/index.ts'

export const S0_FIGHT = 's0-fight'
const slot = (i: number) => makeHandle(KIND_FORMATION, i, 0)   // the scenario spawns into slots 0..7, generation 0

function setup(w: World): void {
  const lanes = [-45, -15, 15, 45]
  lanes.forEach(z => issue(w, { type: 'debug-spawn', side: 0, men: 100, x: -110, z, facing: 1.5707963267948966 }))
  lanes.forEach(z => issue(w, { type: 'debug-spawn', side: 1, men: 100, x: 20, z: z + 7, facing: -1.5707963267948966 }))
  lanes.forEach((z, k) => {
    issue(w, { type: 'move', id: slot(k), points: [[-60, z], [-30, z + 3]], append: false })
    issue(w, { type: 'move', id: slot(4 + k), points: [[-10, z + 7], [-35, z + 2]], append: false })
  })
}

export const s0Fight: Scenario = { name: S0_FIGHT, setup }

// external orders: a flank march, a halt, a reinforcement that is then destroyed and still ordered (a
// dropped command in the log), a debug kill, an appended waypoint
export function s0Orders(w: World, external: (c: Command) => void): void {
  const t = w.meta[0]
  if (t === 137) external({ type: 'move', id: slot(0), points: [[-80, -70], [-40, -40.004]], append: false })
  if (t === 601) external({ type: 'halt', id: slot(5) })
  if (t === 1203) external({ type: 'debug-spawn', side: 1, men: 60, x: 10, z: -80, facing: 0 })
  if (t === 1204) external({ type: 'move', id: makeHandle(KIND_FORMATION, 8, 0), points: [[-50, -60]], append: false })
  if (t === 1300) external({ type: 'debug-kill', id: makeHandle(KIND_FORMATION, 8, 0), men: 60 })
  if (t === 1400) external({ type: 'move', id: makeHandle(KIND_FORMATION, 8, 0), points: [[-40, -40]], append: false })   // reaped: dropped
  if (t === 1800) external({ type: 'move', id: slot(3), points: [[-25, 20]], append: true })   // pending across the save in test 3
  if (t === 2222) external({ type: 'debug-kill', id: slot(2), men: 25 })
  if (t === 2900) external({ type: 'move', id: slot(1), points: [[-20, 0]], append: true })
}
