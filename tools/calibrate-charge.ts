// The charge calibration (docs/plans/active/s1d2-charges.md): a regiment of 256 charges a battalion of 400 in
// square, in line, in column and in the flank, and two regiments charge each other, on an open, level field,
// for 3 minutes (5 for the regiments) over many seeds, in worker threads. Prints each case's outcomes and checks
// them against the plan's targets.
// Usage: node tools/calibrate-charge.ts [seeds=50] [case: square|line|column|flank|cavalry]
import fs from 'node:fs'
import os from 'node:os'
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'
import { loadSimData, compileRuleset, buildTerrain, rebuildImpassable } from '../src/sim/index.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { levelled } from '../src/scenarios/s1c-firefight.ts'
import { runCharge, CASES, CAV, INF, type ChargeCase, type ChargeResult } from '../src/scenarios/s1d-charge.ts'

const MAX: Record<ChargeCase, number> = { square: 3600, line: 3600, column: 3600, flank: 3600, cavalry: 6000 }   // ticks
interface Job { kind: ChargeCase; seed: number }

if (!isMainThread) {
  const data = levelled(loadSimData(new Uint8Array(fs.readFileSync(new URL('../data/formation-field.simdata', import.meta.url))))), cr = compileRuleset(napoleonic)
  const t = buildTerrain(data, cr); t.cls.fill(Object.keys(napoleonic.terrain).indexOf('open')); t.depth.fill(0); rebuildImpassable(t)
  for (const j of workerData as Job[]) parentPort!.postMessage({ ...j, r: runCharge(data, cr, t, j.seed, j.kind, MAX[j.kind]) })
} else {
  const seeds = Number(process.argv[2] ?? 50), only = process.argv[3] as ChargeCase | undefined, jobs: Job[] = []
  for (const kind of CASES) if (!only || kind === only) for (let seed = 1; seed <= seeds; seed++) jobs.push({ kind, seed })
  const n = Math.max(1, Math.min(os.availableParallelism() - 1, 12)), out: (Job & { r: ChargeResult })[] = [], t0 = Date.now()
  await Promise.all(Array.from({ length: n }, (_, k) => new Promise<void>((done, fail) => {
    const wk = new Worker(new URL(import.meta.url), { workerData: jobs.filter((_, q) => q % n === k) })
    wk.on('message', m => out.push(m)); wk.on('error', fail); wk.on('exit', () => done())
  })))
  const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN }
  const pct = (k: number, of: number) => `${Math.round(100 * k / Math.max(1, of))}%`
  console.log(`${seeds} seeds per case, ${n} workers, ${((Date.now() - t0) / 1000).toFixed(0)} s\n`)
  console.log('case | target broke | regiment broke | neither | contact | recoiled | time to break, s (p10 / median / p90) | losses at the end: regiment / target (median)')
  const of = (kind: ChargeCase) => out.filter(o => o.kind === kind).map(o => o.r)
  for (const kind of CASES) {
    const rs = of(kind); if (!rs.length) continue
    const broke = rs.filter(r => r.first === 1), t = broke.map(r => r.tick / 20)
    console.log(`${kind} | ${pct(broke.length, rs.length)} | ${pct(rs.filter(r => r.first === 0).length, rs.length)} | ${pct(rs.filter(r => r.first < 0).length, rs.length)} | ${pct(rs.filter(r => r.contact).length, rs.length)} | ${pct(rs.filter(r => r.recoiled).length, rs.length)} | ${q(t, 0.1)} / ${q(t, 0.5)} / ${q(t, 0.9)} | ${q(rs.map(r => r.loss0), 0.5)} of ${CAV} / ${q(rs.map(r => r.loss1), 0.5)} of ${kind === 'cavalry' ? CAV : INF}`)
  }
  const share = (kind: ChargeCase, p: (r: ChargeResult) => boolean) => { const rs = of(kind); return rs.length ? rs.filter(p).length / rs.length : NaN }
  const all: [string, boolean][] = [
    ['square: holds in at least 90%', share('square', r => r.first !== 1) >= 0.9],
    ['square: the regiment recoils in at least 80%', share('square', r => r.recoiled) >= 0.8],
    ['line: breaks in at least 70%', share('line', r => r.first === 1) >= 0.7],
    ['flank: breaks in at least 90%', share('flank', r => r.first === 1) >= 0.9],
    ['cavalry: each wins 30–70%', share('cavalry', r => r.first === 1) >= 0.3 && share('cavalry', r => r.first === 0) >= 0.3],
  ], checks = all.filter(c => !only || c[0].startsWith(only))
  console.log('')
  for (const [name, ok] of checks) console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`)
  process.exit(checks.every(c => c[1]) ? 0 : 1)
}
