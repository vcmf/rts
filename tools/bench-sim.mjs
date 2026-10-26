// The sim page's frame bench (docs/plans/active/battle-threads.md, PR 3): a bench scenario marching, in headless Chrome
// on the machine's GPU with no vsync and no frame-rate limit (frame times are the page's own, as tools/bench-look.mjs
// measures), on the production build. Records `sec` seconds through the page's APP.record and prints, mean, p99 and
// max: the frame interval, the page's battle time per frame (stepping the battle on the page, or reading the held
// slot), the drawing, the long tasks; with the worker, its ticks, sub-steps (taken of those due) and publishing per
// advance, and its loop's gaps.
// Run `npm run build` first; hold the machine's bench lock while it runs (other work skews it).
//   node tools/bench-sim.mjs [--scenario s1b-bench|s1b-bench-80] [--thread worker|main] [--speed 1] [--sec 10]
//     [--json out.json]
// Exits 1 when the page fails or records nothing.
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { MEN_HZ, MEN_GROUPS, MEN_DT } from '../src/render/men-clock.ts'

const args = process.argv.slice(2)
const opt = (name, dflt) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : dflt
}
const scenario = opt('--scenario', 's1b-bench')
const thread = opt('--thread', 'worker')
const speed = +opt('--speed', '1')
const sec = +opt('--sec', '10')
const json = opt('--json', null)
const PORT = 4183
if (!['worker', 'main'].includes(thread) || !(speed > 0) || !(sec > 0)) {
  console.error(
    'usage: node tools/bench-sim.mjs [--scenario s1b-bench|s1b-bench-80] [--thread worker|main] [--speed 1] [--sec 10] [--json out.json]',
  )
  process.exit(2)
}
// every battalion marching: the field's 40 north-east, the battlefield's 80 north (both sides, keeping their places)
const march = scenario === 's1b-bench' ? 'APP.march(-35, 40, false)' : 'APP.march(0, 60, false)'
const steps = [
  ['wait', 1500],
  ['eval', 'if (!window.APP) throw new Error("no APP"); APP.thread'],
  ['eval', `APP.select([...Array(128).keys()].filter(i => APP.w.f.alive[i])); ${march}; APP.select([]); "marching"`],
  ['eval', `APP.speed(${speed}); "speed ${speed}"`],
  ['wait', 2000],
  ['repl', `"RECORD " + JSON.stringify(await APP.record(${sec}))`],
]

const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
let out = ''
try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://localhost:${PORT}/app/`)).ok) break
    } catch {}
    await new Promise(r => setTimeout(r, 250))
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-sim-'))
  const url = `http://localhost:${PORT}/app/?scenario=${scenario}${thread === 'main' ? '&thread=main' : ''}`
  const r = spawnSync('node', ['tools/shot.mjs', url, dir, '1600', '900', JSON.stringify(steps)], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SHOT_ANGLE: process.env.SHOT_ANGLE || 'metal',
      SHOT_CHROME_ARGS: '--disable-gpu-vsync --disable-frame-rate-limit',
    },
    timeout: (sec + 120) * 1000,
  })
  out = r.stdout + r.stderr
  if (r.status !== 0) throw new Error(`the page failed (exit ${r.status}):\n${out}`)
} finally {
  preview.kill()
}
const line = out.split('\n').find(l => l.startsWith('EVAL "RECORD '))
if (!line) {
  console.error(`no recording:\n${out}`)
  process.exit(1)
}
const rec = JSON.parse(JSON.parse(line.slice(5)).slice(7))
if (json) fs.writeFileSync(json, JSON.stringify(rec))

const p99 = a => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * 0.99))] : NaN)
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN)
const f = (a, d = 2) => `${mean(a).toFixed(d)} / ${p99(a).toFixed(d)} / ${Math.max(...a).toFixed(d)}`
const { page, longTasks, worker } = rec
console.log(`${scenario} at ${speed}×, the battle on the ${rec.thread} thread, ${sec} s (mean / p99 / max ms):`)
console.log(
  `  frames ${page.intervalMs.length}: interval ${f(page.intervalMs)}, battle ${f(page.battleMs)}, draw ${f(page.drawMs)}`,
)
console.log(
  `  long tasks ${longTasks.length}${longTasks.length ? `, longest ${Math.max(...longTasks).toFixed(0)} ms` : ''}`,
)
if (worker) {
  const ticked = worker.tickMs.filter((_, k) => worker.ticks[k] > 0)
  const perTick = worker.tickMs.filter((_, k) => worker.ticks[k] === 1)
  const stepped = worker.stepMs.filter((_, k) => worker.subSteps[k] > 0)
  const subs = worker.subSteps.reduce((a, b) => a + b, 0)
  const gaps = worker.loopMs.filter(ms => ms > 1000 / 96).length
  // the sub-steps due in the time recorded (src/render/men-clock.ts), against those taken: a busy worker drops what
  // an advance owes past MEN_ROUNDS rounds
  const due = (worker.loopMs.reduce((a, b) => a + b, 0) / 1000) * Math.max(MEN_HZ, speed / MEN_DT) * MEN_GROUPS
  console.log(
    `  worker: advances ${worker.loopMs.length}, loop ${f(worker.loopMs)}, ${gaps} (${((100 * gaps) / worker.loopMs.length).toFixed(1)} %) longer than a sub-step at 1× (10.4 ms)`,
  )
  console.log(
    `  worker: ticks ${worker.ticks.reduce((a, b) => a + b, 0)}, ticking ${f(ticked)} per advance (one tick ${f(perTick)}), sub-steps ${subs} of ${due.toFixed(0)} due (${((100 * subs) / due).toFixed(1)} %), stepping ${f(stepped)} per advance, publishing ${f(worker.pubMs)}`,
  )
}
