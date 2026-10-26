// The cost benches outside vitest, split by part (S1c-5): 40 battalions marching through every shape, or
// 40 firing at the halt, at 400 men (or the ceiling's 800), on the formation field, in 120 Hz frames at a game
// speed. Prints ms per tick for the sim, the soldier layer's ms per frame (stepped on its clock as the page does,
// src/render/men-clock.ts: mean and p99) and its syncs, and the hash. Run with --cpu-prof to profile.
// Usage: node tools/bench-cost.ts [march|fire] [400|800] [frames=1440] [warm-up seconds=2] [speed=1]
import fs from 'node:fs'
import {
  loadSimData,
  compileRuleset,
  makeWorld,
  issue,
  advanceTick,
  hashWorld,
  makeHandle,
  KIND_FORMATION,
  M_FREE,
  type Command,
  type World,
} from '../src/sim/index.ts'
import { napoleonic, ceiling } from '../src/rulesets/napoleonic.ts'
import { buildScene } from '../src/render/scene.ts'
import { SoldierLayer } from '../src/render/soldiers.ts'
import { MenClock } from '../src/render/men-clock.ts'

const mode = process.argv[2] ?? 'march'
const men = Number(process.argv[3] ?? 400)
const frames = Number(process.argv[4] ?? 1440)
const warm = Number(process.argv[5] ?? 2)
const speed = Number(process.argv[6] ?? 1)
if (!(speed > 0) || !Number.isFinite(speed)) throw new Error(`speed ${process.argv[6]}: a positive number (1, 2, 4, 8)`)
const data = loadSimData(new Uint8Array(fs.readFileSync(new URL('../data/formation-field.simdata', import.meta.url))))
const shippedCr = compileRuleset(napoleonic)
const rs = men > shippedCr.types[0].slots ? ceiling : napoleonic
// a release world, as the page runs (DEBUG=1: the tests' debug world)
const w: World = makeWorld(data, rs === napoleonic ? shippedCr : compileRuleset(rs), 1, process.env.DEBUG === '1')
const cmd = (c: Command) => issue(w, c)
const slots: number[] = []
const spawn = (x: number, z: number, heading: number, side = 0) => {
  const i = w.free[w.meta[M_FREE] - 1]
  cmd({ type: 'debug-spawn', side, x, z, heading, shape: 'column', men })
  const r = advanceTick(w)
  if (r.dropped.length || !w.f.alive[i]) {
    throw new Error(`spawn at (${x}, ${z}) refused: ${r.dropped.map(d => d.reason).join(', ')}`)
  }
  slots.push(i)
}
if (mode === 'fire') {
  const E = Math.PI / 2
  for (let row = 0; row < 5; row++) {
    for (let r = 0; r < 4; r++) {
      const z = -150 + row * 60
      spawn(-115 - r * 20, z, E, 0)
      spawn(-15 + r * 20, z, -E, 1)
    }
  }
} else {
  const shapes = Object.keys(rs.types.infantry.formations)
  for (let k = 0; k < 40; k++) spawn(-120 + (k % 7) * 25, -80 + Math.floor(k / 7) * 40, 0)
  slots.forEach((i, k) => {
    const id = makeHandle(KIND_FORMATION, i, w.f.gen[i])
    cmd({ type: 'form', id, shape: shapes[k % shapes.length] })
    cmd({ type: 'move', id, points: [[w.f.x[i], w.f.z[i] + 40]], append: true })
  })
}
const layer = new SoldierLayer(w, buildScene(w))
const clock = new MenClock()
const FRAME = 1 / 120
const now = () => Number(process.hrtime.bigint()) / 1e6
let acc = 0
let tSim = 0
let tSync = 0
const tStep: number[] = []
let ticks = 0
const frame = (timed: boolean) => {
  acc += FRAME * speed
  let n = 0
  for (; acc >= 0.05 && n < 20; n++) {
    const a = now()
    advanceTick(w)
    const b = now()
    layer.sync(0)
    const c = now()
    acc -= 0.05
    if (timed) {
      tSim += b - a
      tSync += c - b
      ticks++
    }
  }
  if (n === 20) acc = 0 // the rest dropped, as src/app/main.ts does
  const a = now()
  clock.advance(FRAME, speed, (group, dt) => layer.step(dt, acc / 0.05, group, clock.groups))
  if (timed) tStep.push(now() - a)
}
for (let n = 0; n < warm * 120; n++) frame(false)
const t0 = now()
for (let n = 0; n < frames; n++) frame(true)
const total = now() - t0
let tHash = 0
for (let n = 0; n < 10; n++) {
  const a = now()
  hashWorld(w)
  tHash += now() - a
}
const sorted = [...tStep].sort((a, b) => a - b)
const stepMean = sorted.reduce((a, b) => a + b, 0) / frames
const stepP99 = sorted[Math.floor(frames * 0.99)]
console.log(
  `${mode} 40 × ${men} at ${speed}×: ${(total / frames).toFixed(2)} ms per 120 Hz frame; sim ${(tSim / ticks).toFixed(2)} ms per tick, sync ${(tSync / frames).toFixed(2)} ms and step ${stepMean.toFixed(2)} (p99 ${stepP99.toFixed(2)}) ms per frame; hash ${(tHash / 10).toFixed(2)} ms`,
)
