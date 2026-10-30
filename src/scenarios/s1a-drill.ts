// The S1a acceptance scenario (docs/plans/done/s1a-formations-on-spine.md): two battalions drill on the
// formation field. Through the wood, every shape change, Face about, Retire, a wheel, casualties, a move
// into the stream that halts. The scenario's own commands are part of it, not of the log; `orders` are
// the external (logged) commands of the recorded run.
import type { World, Command, Scenario } from '../sim/index.ts'
import { issue, makeHandle, KIND_FORMATION } from '../sim/index.ts'
import { FULL } from './sizes.ts'

export const S1A_DRILL = 's1a-drill'
const A = makeHandle(KIND_FORMATION, 0, 0)
const B = makeHandle(KIND_FORMATION, 1, 0)

function setup(w: World): void {
  // a drill, not a fight: both hold their fire (S1c), so the drill tests the formations alone
  issue(w, { type: 'debug-spawn', side: 0, x: -45, z: 10, heading: 0, shape: 'line', men: FULL.infantry, fire: 'hold' })
  issue(w, {
    type: 'debug-spawn',
    side: 1,
    x: 20,
    z: -40,
    heading: 1.5707963267948966,
    shape: 'line',
    men: 220,
    fire: 'hold',
  })
  issue(w, { type: 'move', id: A, points: [[-45, 100]], append: false }) // through the wood
  issue(w, { type: 'move', id: B, points: [[90, -40]], append: false }) // into the stream: halts
}
export const s1aDrill: Scenario = { name: S1A_DRILL, setup }

export function s1aOrders(w: World, external: (c: Command) => void): void {
  const t = w.meta[0]
  if (t === 1900) external({ type: 'form', id: A, shape: 'column' }) // still forming at 2210
  if (t === 2203) external({ type: 'debug-kill', id: A, men: 13 })
  if (t === 2210) external({ type: 'form', id: A, shape: 'square' }) // pending across the save in the tests
  if (t === 2600) external({ type: 'face', id: B })
  if (t === 2700) external({ type: 'retire', id: B, metres: 20 })
  if (t === 4500) external({ type: 'form', id: A, shape: 'march' })
  if (t === 5000) {
    external({
      type: 'move',
      id: A,
      points: [
        [-90, 60],
        [-110, 20],
      ],
      append: false,
    })
  }
  if (t === 5100) external({ type: 'style', id: B, preset: 'keep' })
  if (t === 5101) external({ type: 'wheel', id: B, angle: 0.6 })
  if (t === 5500) external({ type: 'form', id: A, shape: 'line' })
  // no such battalion: dropped
  if (t === 5900) external({ type: 'move', id: makeHandle(KIND_FORMATION, 2, 0), points: [[0, 0]], append: false })
}
