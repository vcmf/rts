// The fire and morale calibration (docs/plans/active/s1c-fire-morale.md): two 100-man lines on levelled
// ground at 50, 100 and 200 m, the first of quality 0.8 and the second 0.65, run to the first rout or
// 20 minutes over many seeds, in worker threads. Prints each range's times to break, losses at the break,
// how often the stronger line broke first, and each morale term's share at the break, against the targets.
// Also (docs/plans/active/s1c2-morale-machine.md) the 100 m row without the wavering fall-back, and a 3v3
// brigade's contagion, reported without targets.
// Usage: node tools/calibrate-fire.ts [seeds=100]
import fs from 'node:fs'
import os from 'node:os'
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'
import { loadSimData, compileRuleset } from '../src/sim/index.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { runFirefight, runBrigade, levelled, type FightResult, type BrigadeResult } from '../src/scenarios/s1c-firefight.ts'

// the 1v1 at three ranges; the 100 m row again without the wavering fall-back (S1c-2: its share of the
// result); and a 3v3 brigade at 100 m (reported, no target), watched for 3 minutes after its first break
const RANGES = [50, 100, 200], MAX = 20 * 60 * 20, WINDOW = 20 * 180   // 20 minutes; 3 minutes, in ticks
interface Job { range: number; seed: number; kind: 'fight' | 'nofallback' | 'brigade' }

if (!isMainThread) {
  const data = levelled(loadSimData(new Uint8Array(fs.readFileSync(new URL('../data/formation-field.simdata', import.meta.url))))), cr = compileRuleset(napoleonic)
  const M = napoleonic.morale, crOff = compileRuleset({ ...napoleonic, morale: { ...M, fallback: { ...M.fallback, after: 1e9 } } })
  for (const j of workerData as Job[]) parentPort!.postMessage({ ...j, r: j.kind === 'brigade' ? runBrigade(data, cr, j.seed, j.range, MAX, WINDOW) : runFirefight(data, j.kind === 'fight' ? cr : crOff, j.seed, j.range, MAX) })
} else {
  const seeds = Number(process.argv[2] ?? 100), jobs: Job[] = []
  for (const range of RANGES) for (let seed = 1; seed <= seeds; seed++) jobs.push({ range, seed, kind: 'fight' })
  for (let seed = 1; seed <= seeds; seed++) jobs.push({ range: 100, seed, kind: 'nofallback' }, { range: 100, seed, kind: 'brigade' })
  const n = Math.max(1, Math.min(os.availableParallelism() - 1, 12)), out: (Job & { r: FightResult })[] = [], brig: BrigadeResult[] = [], t0 = Date.now()
  await Promise.all(Array.from({ length: n }, (_, k) => new Promise<void>((done, fail) => {
    const wk = new Worker(new URL(import.meta.url), { workerData: jobs.filter((_, q) => q % n === k) })
    wk.on('message', m => { if (m.kind === 'brigade') brig.push(m.r); else out.push(m) }); wk.on('error', fail); wk.on('exit', () => done())
  })))
  const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN }
  const min = (t: number) => (t / 1200).toFixed(1)
  console.log(`${seeds} seeds per range, ${n} workers, ${((Date.now() - t0) / 1000).toFixed(0)} s\n`)
  console.log('range | weaker broke | stronger first | none in 20 min | time to break, min (p10 / median / p90) | weaker losses at break (p10 / median / p90) | at the break: losses term / recent term')
  for (const [label, kind, range] of [...RANGES.map(r => [`${r} m`, 'fight', r] as const), ['100 m, no fall-back', 'nofallback', 100] as const]) {
    const rs = out.filter(o => o.range === range && o.kind === kind).map(o => o.r), weak = rs.filter(r => r.first === 1), strong = rs.filter(r => r.first === 0), none = rs.filter(r => r.first < 0)
    const broke = rs.filter(r => r.first >= 0), t = weak.map(r => r.tick), l = weak.map(r => r.lossB)
    const avg = (a: number[]) => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : '-'
    console.log(`${label} | ${weak.length} | ${strong.length} | ${none.length} | ${min(q(t, 0.1))} / ${min(q(t, 0.5))} / ${min(q(t, 0.9))} | ${q(l, 0.1)} / ${q(l, 0.5)} / ${q(l, 0.9)}% | ${avg(broke.map(r => r.termLosses))} / ${avg(broke.map(r => r.termRecent))}`)
  }
  // the brigade: who broke first, how many of the weaker side were out of the fight 3 minutes later, and the
  // time from the first break to the last within those 3 minutes
  const bw = brig.filter(b => b.first === 1), bt = bw.map(b => b.tick), spread = bw.map(b => (b.last - b.tick) / 20)
  const outs = [0, 1, 2, 3].map(k => bw.filter(b => b.outB === k).length)
  console.log(`\nbrigade 3v3 at 100 m: weaker side broke first ${bw.length}, stronger first ${brig.filter(b => b.first === 0).length}, none ${brig.filter(b => b.first < 0).length}; first break ${min(q(bt, 0.1))} / ${min(q(bt, 0.5))} / ${min(q(bt, 0.9))} min; weaker lines out 3 min later (1 / 2 / 3): ${outs.slice(1).join(' / ')}; first to last break ${q(spread, 0.1)} / ${q(spread, 0.5)} / ${q(spread, 0.9)} s; stronger lines out: ${brig.reduce((a, b) => a + b.outA, 0)}`)
  const at = (range: number) => out.filter(o => o.range === range && o.kind === 'fight').map(o => o.r)
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
