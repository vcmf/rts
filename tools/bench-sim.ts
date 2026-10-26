// The sim page's frame bench (docs/plans/active/battle-threads.md, PR 3): a bench scenario marching, in headless Chrome
// on the machine's GPU with no vsync and no frame-rate limit (frame times are the page's own, as tools/bench-look.mjs
// measures), on the production build. Records `sec` seconds through the page's APP.record and prints, mean, p99 and
// max: the frame interval, the page's battle time per frame (stepping the battle on the page, or reading the held
// slot), the drawing, the long tasks; with the workers (PR 5), the sim's ticks, and the men's ticks taken and
// skipped, sub-steps (taken of those due) and publishing, per turn of their loops. Run `npm run build` first; hold the
// machine's bench lock while it runs (other work skews it).
//   node tools/bench-sim.ts [--scenario s1b-bench|s1b-bench-80] [--thread worker|main] [--speed 1] [--sec 10]
//     [--json out.json]
// Exits 1 when the page fails or records nothing.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { MEN_HZ, MEN_GROUPS, MEN_DT } from '../src/render/men-clock.ts'
import type { Recording } from '../src/app/battle-link.ts'
import { startPreview } from './preview.ts'

/** What the page's APP.record returns (src/app/main.ts). */
interface Record {
  thread: 'worker' | 'main'
  page: { intervalMs: number[]; battleMs: number[]; drawMs: number[] }
  longTasks: number[]
  worker: Recording | null
}

const args = process.argv.slice(2)
const opt = (name: string, dflt: string): string => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : dflt
}
const scenario = opt('--scenario', 's1b-bench')
const thread = opt('--thread', 'worker')
const speed = +opt('--speed', '1')
const sec = +opt('--sec', '10')
const json = opt('--json', '')
const PORT = 4183
if (!['worker', 'main'].includes(thread) || !(speed > 0) || !(sec > 0)) {
  console.error(
    'usage: node tools/bench-sim.ts [--scenario s1b-bench|s1b-bench-80] [--thread worker|main] [--speed 1] [--sec 10] [--json out.json]',
  )
  process.exit(2)
}
// every battalion marching: the field's 40 north-east, the battlefield's 80 north (both sides, keeping their places)
const march = scenario === 's1b-bench' ? 'APP.march(-35, 40, false)' : 'APP.march(0, 60, false)'
// the recording's numbers rounded to the microsecond: thousands of frames a second at no frame-rate limit
const ROUND = '(k, v) => (typeof v === "number" ? Math.round(v * 1000) / 1000 : v)'
const steps = [
  ['wait', 1500],
  ['eval', 'if (!window.APP) throw new Error("no APP"); APP.thread'],
  ['eval', `APP.select([...Array(128).keys()].filter(i => APP.w.f.alive[i])); ${march}; APP.select([]); "marching"`],
  ['eval', `APP.speed(${speed}); "speed ${speed}"`],
  ['wait', 2000],
  ['repl', `"RECORD " + JSON.stringify(await APP.record(${sec}), ${ROUND})`],
]

const stop = await startPreview(PORT)
let out = ''
try {
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
    maxBuffer: 64 * 1024 * 1024,
  })
  out = r.stdout + r.stderr
  if (r.status !== 0) {
    throw new Error(`the page failed (exit ${r.status}${r.error ? `, ${r.error.message}` : ''}):\n${out}`)
  }
} finally {
  stop()
}
const line = out.split('\n').find(l => l.startsWith('EVAL "RECORD '))
if (!line) {
  console.error(`no recording:\n${out}`)
  process.exit(1)
}
const rec = JSON.parse((JSON.parse(line.slice(5)) as string).slice(7)) as Record
if (json) fs.writeFileSync(json, JSON.stringify(rec))

const p99 = (a: number[]): number =>
  a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * 0.99))] : NaN
const mean = (a: number[]): number => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN)
const f = (a: number[], d = 2): string =>
  `${mean(a).toFixed(d)} / ${p99(a).toFixed(d)} / ${(a.length ? Math.max(...a) : NaN).toFixed(d)}`
const { page, longTasks, worker } = rec
console.log(`${scenario} at ${speed}×, the battle on the ${rec.thread} thread, ${sec} s (mean / p99 / max ms):`)
console.log(
  `  frames ${page.intervalMs.length}: interval ${f(page.intervalMs)}, battle ${f(page.battleMs)}, draw ${f(page.drawMs)}`,
)
console.log(
  `  long tasks ${longTasks.length}${longTasks.length ? `, longest ${Math.max(...longTasks).toFixed(0)} ms` : ''}`,
)
if (worker) {
  const { sim, men } = worker
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)
  const perTick = sim.tickMs.filter((_, k) => sim.ticks[k] === 1)
  const subs = sum(men.subSteps)
  const stepped = men.stepMs.filter((_, k) => men.subSteps[k] > 0)
  // the sub-steps due in the time recorded (src/render/men-clock.ts), against those taken: a busy men worker drops
  // what a turn owes past MEN_ROUNDS rounds
  const due = (sum(men.loopMs) / 1000) * Math.max(MEN_HZ, speed / MEN_DT) * MEN_GROUPS
  const taken = sum(men.taken)
  const skipped = sum(men.skipped)
  console.log(
    `  sim worker: turns ${sim.loopMs.length}, loop ${f(sim.loopMs)}, ticks ${sum(sim.ticks)}, one tick ${f(perTick)} (the ring's copy apart: ${f(sim.ringMs.filter((_, k) => sim.ticks[k] > 0))} a turn)`,
  )
  console.log(
    `  men worker: turns ${men.loopMs.length}, loop ${f(men.loopMs)}, ticks taken ${taken} (skipped ${skipped}, ${((100 * skipped) / Math.max(1, taken + skipped)).toFixed(1)} %), syncing ${f(men.syncMs)} a turn`,
  )
  console.log(
    `  men worker: sub-steps ${subs} of ${due.toFixed(0)} due (${((100 * subs) / due).toFixed(1)} %), stepping ${f(stepped)} a turn, publishing ${f(men.pubMs)}`,
  )
}
