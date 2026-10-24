// The artillery calibration (docs/plans/active/s1d3-artillery.md): a battery of 8 pieces fires on a battalion of 400
// that holds its fire, on levelled ground (the crest case on a ridge), over many seeds in worker threads: in line
// and in column end-on at about 400 m, in line at 150 m (canister), and in line behind a crest. Prints each case's
// losses and breaks and checks them against the plan's targets. (The crest hides the battalion from the guns, so
// they do not fire: a ball carried over a crest onto men in the hollow is test/artillery.test.ts's.)
// Usage: node tools/calibrate-artillery.ts [seeds=50] [case]
import fs from 'node:fs'
import os from 'node:os'
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'
import { loadSimData, compileRuleset } from '../src/sim/index.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { levelled } from '../src/scenarios/s1c-firefight.ts'
import { runGuns, ridged, INF, type GunCase, type GunResult } from '../src/scenarios/s1d-guns.ts'

const MIN = 1200 // ticks a minute
// each case's run: 5 and 10 minutes at 400 m (the 5-minute losses compare line and column), 3 minutes of canister
const RUNS: [GunCase, number][] = [
  ['line', 5],
  ['column', 5],
  ['line', 10],
  ['column', 10],
  ['canister', 3],
  ['crest', 10],
]
interface Job {
  kind: GunCase
  minutes: number
  seed: number
}

if (!isMainThread) {
  const raw = loadSimData(new Uint8Array(fs.readFileSync(new URL('../data/formation-field.simdata', import.meta.url))))
  const flat = levelled(raw)
  const ridge = ridged(raw)
  const cr = compileRuleset(napoleonic)
  for (const j of workerData as Job[]) {
    parentPort!.postMessage({
      ...j,
      r: runGuns(j.kind === 'crest' ? ridge : flat, cr, j.seed, j.kind, j.minutes * MIN),
    })
  }
} else {
  const seeds = Number(process.argv[2] ?? 50)
  const only = process.argv[3] as GunCase | undefined
  const jobs: Job[] = []
  for (const [kind, minutes] of RUNS) {
    if (!only || kind === only) for (let seed = 1; seed <= seeds; seed++) jobs.push({ kind, minutes, seed })
  }
  const n = Math.max(1, Math.min(os.availableParallelism() - 1, 12))
  const out: (Job & { r: GunResult })[] = []
  const t0 = Date.now()
  await Promise.all(
    Array.from(
      { length: n },
      (_, k) =>
        new Promise<void>((done, fail) => {
          const wk = new Worker(new URL(import.meta.url), { workerData: jobs.filter((_, q) => q % n === k) })
          wk.on('message', m => out.push(m))
          wk.on('error', fail)
          wk.on('exit', () => done())
        }),
    ),
  )
  const q = (a: number[], p: number) => {
    const s = [...a].sort((x, y) => x - y)
    return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN
  }
  const of = (kind: GunCase, minutes: number) => out.filter(o => o.kind === kind && o.minutes === minutes).map(o => o.r)
  const med = (kind: GunCase, minutes: number) =>
    q(
      of(kind, minutes).map(r => r.lost),
      0.5,
    )
  // men lost a minute until the break or the end (a column that breaks stops losing men)
  const rate = (kind: GunCase, minutes: number) =>
    q(
      of(kind, minutes).map(r => r.lost / (r.broke >= 0 ? r.broke / MIN : minutes)),
      0.5,
    )
  const broke = (kind: GunCase, minutes: number) => {
    const rs = of(kind, minutes)
    return rs.filter(r => r.broke >= 0).length / Math.max(1, rs.length)
  }
  console.log(`${seeds} seeds per case, ${n} workers, ${((Date.now() - t0) / 1000).toFixed(0)} s\n`)
  console.log('case | minutes | men lost (p10 / median / p90) | a minute, until the break (median) | broke')
  for (const [kind, minutes] of RUNS) {
    const rs = of(kind, minutes)
    if (!rs.length) continue
    const l = rs.map(r => r.lost)
    console.log(
      `${kind} | ${minutes} | ${q(l, 0.1)} / ${q(l, 0.5)} / ${q(l, 0.9)} of ${INF} | ${rate(kind, minutes).toFixed(1)} | ${Math.round(100 * broke(kind, minutes))}%`,
    )
  }
  // each check names the cases it reads: with a case filter, only checks whose cases all ran are made
  const all: [string, GunCase[], () => boolean][] = [
    [
      'column: loses men at least 2× as fast as the line (5 minutes)',
      ['column', 'line'],
      () => rate('column', 5) >= 2 * rate('line', 5),
    ],
    ['line: loses 4–15% in 10 minutes', ['line'], () => med('line', 10) >= 0.04 * INF && med('line', 10) <= 0.15 * INF],
    ['line: breaks in at most 20% in 10 minutes', ['line'], () => broke('line', 10) <= 0.2],
    ['column: breaks in at least 30% in 10 minutes', ['column'], () => broke('column', 10) >= 0.3],
    ['canister: loses at least 15% in 3 minutes', ['canister'], () => med('canister', 3) >= 0.15 * INF],
    // concealment: the battery cannot see over the crest and does not fire (a ball carried over a crest onto men
    // in the hollow is test/artillery.test.ts's)
    [
      'crest: a battalion hidden behind a crest loses under a quarter of the line in the open (10 minutes)',
      ['crest', 'line'],
      () => med('crest', 10) < 0.25 * Math.max(1, med('line', 10)),
    ],
  ]
  const checks = all
    .filter(c => !only || c[1].every(k => k === only))
    .map(([name, , ok]) => [name, ok()] as [string, boolean])
  console.log('')
  for (const [name, ok] of checks) console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`)
  process.exit(checks.every(c => c[1]) ? 0 : 1)
}
