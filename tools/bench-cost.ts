// The cost benches outside vitest, split by part (S1c-5): 40 battalions marching through every shape, or
// 40 firing at the halt, at 400 men (or the ceiling's 800), on the formation field. Prints ms per tick for the
// sim, ms per frame for the soldier layer's step and its syncs, and the hash. Run with --cpu-prof to profile.
// Usage: node tools/bench-cost.ts [march|fire] [400|800] [frames=360] [warm-up seconds=1]
import fs from 'node:fs'
import { loadSimData, compileRuleset, makeWorld, issue, advanceTick, hashWorld, makeHandle, KIND_FORMATION, M_FREE, type Command, type World } from '../src/sim/index.ts'
import { napoleonic, ceiling } from '../src/rulesets/napoleonic.ts'
import { buildScene } from '../src/render/scene.ts'
import { SoldierLayer } from '../src/render/soldiers.ts'

const mode = process.argv[2] ?? 'march', men = Number(process.argv[3] ?? 400), frames = Number(process.argv[4] ?? 360), warm = Number(process.argv[5] ?? 1)
const data = loadSimData(new Uint8Array(fs.readFileSync(new URL('../data/formation-field.simdata', import.meta.url))))
const shippedCr = compileRuleset(napoleonic), rs = men > shippedCr.slots ? ceiling : napoleonic
const w: World = makeWorld(data, rs === napoleonic ? shippedCr : compileRuleset(rs), 1, process.env.DEBUG === "1")   // a release world, as the page runs (DEBUG=1: the tests' debug world)
const cmd = (c: Command) => issue(w, c)
const slots: number[] = []
const spawn = (x: number, z: number, heading: number, side = 0) => {
  const i = w.free[w.meta[M_FREE] - 1]; cmd({ type: 'debug-spawn', side, x, z, heading, shape: 'column', men })
  const r = advanceTick(w); if (r.dropped.length || !w.f.alive[i]) throw new Error(`spawn at (${x}, ${z}) refused: ${r.dropped.map(d => d.reason).join(', ')}`)
  slots.push(i)
}
if (mode === 'fire') {
  const E = Math.PI / 2
  for (let row = 0; row < 5; row++) for (let r = 0; r < 4; r++) { const z = -150 + row * 60; spawn(-115 - r * 20, z, E, 0); spawn(-15 + r * 20, z, -E, 1) }
} else {
  const shapes = Object.keys(rs.formations)
  for (let k = 0; k < 40; k++) spawn(-165 + (k % 7) * 33, -150 + Math.floor(k / 7) * 55, 0)
  slots.forEach((i, k) => { const id = makeHandle(KIND_FORMATION, i, w.f.gen[i])
    cmd({ type: 'form', id, shape: shapes[k % shapes.length] }); cmd({ type: 'move', id, points: [[w.f.x[i], w.f.z[i] + 40]], append: true }) })
}
const layer = new SoldierLayer(w, buildScene(w))
const now = () => Number(process.hrtime.bigint()) / 1e6
let acc = 0, tSim = 0, tSync = 0, tStep = 0, ticks = 0
const frame = (timed: boolean) => {
  acc += 1 / 60
  while (acc >= 0.05) { const a = now(); advanceTick(w); const b = now(); layer.sync(0); const c = now(); acc -= 0.05; if (timed) { tSim += b - a; tSync += c - b; ticks++ } }
  const a = now(); layer.step(1 / 60, acc / 0.05); if (timed) tStep += now() - a
}
for (let n = 0; n < warm * 60; n++) frame(false)
const t0 = now(); for (let n = 0; n < frames; n++) frame(true); const total = now() - t0
let tHash = 0; for (let n = 0; n < 10; n++) { const a = now(); hashWorld(w); tHash += now() - a }
console.log(`${mode} 40 × ${men}: ${(total / frames).toFixed(2)} ms per frame; sim ${(tSim / ticks).toFixed(2)} ms per tick, sync ${(tSync / frames).toFixed(2)} and step ${(tStep / frames).toFixed(2)} ms per frame; hash ${(tHash / 10).toFixed(2)} ms`)
