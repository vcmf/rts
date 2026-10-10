// The fire and morale calibration (docs/plans/active/s1c-fire-morale.md): two 100-man lines on levelled
// ground at 50, 100 and 200 m, the first of quality 0.8 and the second 0.65, run to the first rout or
// 20 minutes over many seeds, in worker threads. Prints each range's times to break, losses at the break,
// how often the stronger line broke first, and each morale term's share at the break, against the targets.
// Usage: node tools/calibrate-fire.ts [seeds=100]
import fs from 'node:fs'
import os from 'node:os'
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'
import { loadSimData, compileRuleset } from '../src/sim/index.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { runFirefight, levelled, type FightResult } from '../src/scenarios/s1c-firefight.ts'

const RANGES = [50, 100, 200], MAX = 20 * 60 * 20   // 20 minutes of ticks
interface Job { range: number; seed: number }

if (!isMainThread) {
  const data = levelled(loadSimData(new Uint8Array(fs.readFileSync(new URL('../data/formation-field.simdata', import.meta.url))))), cr = compileRuleset(napoleonic)
  for (const j of workerData as Job[]) parentPort!.postMessage({ ...j, r: runFirefight(data, cr, j.seed, j.range, MAX) })
} else {
  const seeds = Number(process.argv[2] ?? 100), jobs: Job[] = []
  for (const range of RANGES) for (let seed = 1; seed <= seeds; seed++) jobs.push({ range, seed })
  const n = Math.max(1, Math.min(os.availableParallelism() - 1, 12)), out: (Job & { r: FightResult })[] = [], t0 = Date.now()
  await Promise.all(Array.from({ length: n }, (_, k) => new Promise<void>((done, fail) => {
    const wk = new Worker(new URL(import.meta.url), { workerData: jobs.filter((_, q) => q % n === k) })
    wk.on('message', m => out.push(m)); wk.on('error', fail); wk.on('exit', () => done())
  })))
  const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN }
  const min = (t: number) => (t / 1200).toFixed(1)
  console.log(`${seeds} seeds per range, ${n} workers, ${((Date.now() - t0) / 1000).toFixed(0)} s\n`)
  console.log('range | weaker broke | stronger first | none in 20 min | time to break, min (p10 / median / p90) | weaker losses at break (p10 / median / p90) | at the break: losses term / recent term')
  for (const range of RANGES) {
    const rs = out.filter(o => o.range === range).map(o => o.r), weak = rs.filter(r => r.first === 1), strong = rs.filter(r => r.first === 0), none = rs.filter(r => r.first < 0)
    const broke = rs.filter(r => r.first >= 0), t = weak.map(r => r.tick), l = weak.map(r => r.lossB)
    const avg = (a: number[]) => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : '-'
    console.log(`${range} m | ${weak.length} | ${strong.length} | ${none.length} | ${min(q(t, 0.1))} / ${min(q(t, 0.5))} / ${min(q(t, 0.9))} | ${q(l, 0.1)} / ${q(l, 0.5)} / ${q(l, 0.9)}% | ${avg(broke.map(r => r.termLosses))} / ${avg(broke.map(r => r.termRecent))}`)
  }
  const at = (range: number) => out.filter(o => o.range === range).map(o => o.r)
  const r100 = at(100), w100 = r100.filter(r => r.first === 1), med = q(w100.map(r => r.tick), 0.5) / 1200, lmed = q(w100.map(r => r.lossB), 0.5)
  const checks: [string, boolean][] = [
    ['100 m: median time to break 6–10 min', med >= 6 && med <= 10],
    ['100 m: weaker losses at break 12–25% (median)', lmed >= 12 && lmed <= 25],
    ['100 m: stronger breaks first in at most 15%', r100.filter(r => r.first === 0).length <= 0.15 * r100.length],
    ['200 m: no break in 20 min in at least 95%', at(200).filter(r => r.first < 0).length >= 0.95 * at(200).length],
    ['50 m: median time to break under 5 min', q(at(50).filter(r => r.first >= 0).map(r => r.tick), 0.5) / 1200 < 5],
  ]
  console.log('')
  for (const [name, ok] of checks) console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`)
  process.exit(checks.every(c => c[1]) ? 0 : 1)
}
