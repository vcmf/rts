// The fire and morale calibration (docs/plans/active/s1c-fire-morale.md): two 400-man lines on levelled
// ground at 50, 100 and 200 m, with bars of 114 and 71 (C-01), run to the first rout or 20 minutes over many
// seeds, in worker threads. Prints each range's times to break, losses at the break, how often the stronger
// line broke first, and what its losses cost and its shocks at the break, against the targets. Also
// (docs/plans/active/s1c2-morale-machine.md) a 3v3 brigade's contagion, reported without targets, and the
// levels' cases (docs/proposals/morale-bar-model.md § 13): C-02 level 3 against level 1 at 100 m; H-04 level 5
// against two of level 2; G-06 how long level 6 and level 2 stand one-sided fire at 50 m.
// Usage: node tools/calibrate-fire.ts [seeds=100]
import fs from 'node:fs'
import os from 'node:os'
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'
import {
  loadSimData,
  compileRuleset,
  makeWorld,
  advanceTick,
  issue,
  menOf,
  outOfFight,
  type Compiled,
  type SimData,
} from '../src/sim/index.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import {
  runFirefight,
  runBrigade,
  levelled,
  MEN,
  FIGHT_X,
  FIGHT_Z,
  type FightResult,
  type BrigadeResult,
} from '../src/scenarios/s1c-firefight.ts'

// the 1v1 at three ranges; the 100 m row again without the wavering fall-back (S1c-2: its share of the
// result); and a 3v3 brigade at 100 m (reported, no target), watched for 3 minutes after its first break
const RANGES = [50, 100, 200]
// 20 minutes; 3 minutes, in ticks
const MAX = 20 * 60 * 20
const WINDOW = 20 * 180
interface Job {
  range: number
  seed: number
  kind: 'fight' | 'brigade' | 'levels'
  name?: string
}

// the levels' cases: side 0 at the west facing east, side 1 at the east facing west, on the firefight's ground; a
// line with `bar` keeps it (a shooter that never breaks), with `hold` it does not fire
interface Line {
  side: number
  dx: number
  dz: number
  level: number
  bar?: number
  hold?: boolean
}
const E = Math.PI / 2
const LEVEL_CASES: Record<string, { lines: Line[]; max: number }> = {
  // C-02: a veteran line against a recruit line at 100 m
  'C-02': {
    lines: [
      { side: 0, dx: -50, dz: 0, level: 3 },
      { side: 1, dx: 50, dz: 0, level: 1 },
    ],
    max: MAX,
  },
  // H-04: an Old Guard's neighbour, level 5, against two line battalions side by side 100 m off
  'H-04': {
    lines: [
      { side: 0, dx: -50, dz: 0, level: 5 },
      { side: 1, dx: 50, dz: -57, level: 2 },
      { side: 1, dx: 50, dz: 57, level: 2 },
    ],
    max: MAX,
  },
  // G-06: how long a line holding fire stands a shooter that never breaks, 50 m off: level 6, and level 2
  'G-06 level 6': {
    lines: [
      { side: 0, dx: -25, dz: 0, level: 6, hold: true },
      { side: 1, dx: 25, dz: 0, level: 2, bar: 1e6 },
    ],
    max: 3 * MAX,
  },
  'G-06 level 2': {
    lines: [
      { side: 0, dx: -25, dz: 0, level: 2, hold: true },
      { side: 1, dx: 25, dz: 0, level: 2, bar: 1e6 },
    ],
    max: 3 * MAX,
  },
}
interface LevelResult {
  name: string
  first: number // the side that broke first: −1 none
  tick: number
  loss: number[] // each line's men lost at the break
}
function runLevels(data: SimData, cr: Compiled, seed: number, name: string): LevelResult {
  const { lines, max } = LEVEL_CASES[name]
  const w = makeWorld(data, cr, seed, false)
  issue(w, { type: 'side', side: 0, x: -1, z: 0 })
  issue(w, { type: 'side', side: 1, x: 1, z: 0 })
  for (const l of lines) {
    issue(w, {
      type: 'debug-spawn',
      side: l.side,
      x: FIGHT_X + l.dx,
      z: FIGHT_Z + l.dz,
      heading: l.side ? -E : E,
      shape: 'line',
      men: MEN,
      level: l.level,
      bar: l.bar,
      fire: l.hold ? 'hold' : 'at will',
    })
  }
  const loss = () => lines.map((_, i) => MEN - menOf(w, i))
  for (let t = 0; t < max; t++) {
    advanceTick(w)
    const out = lines.findIndex((_, i) => outOfFight(w.f.mstate[i]))
    if (out >= 0) return { name, first: lines[out].side, tick: w.meta[0], loss: loss() }
  }
  return { name, first: -1, tick: max, loss: loss() }
}

if (!isMainThread) {
  const data = levelled(
    loadSimData(new Uint8Array(fs.readFileSync(new URL('../data/formation-field.simdata', import.meta.url)))),
  )
  const cr = compileRuleset(napoleonic)
  for (const j of workerData as Job[]) {
    parentPort!.postMessage({
      ...j,
      r:
        j.kind === 'brigade'
          ? runBrigade(data, cr, j.seed, j.range, MAX, WINDOW)
          : j.kind === 'levels'
            ? runLevels(data, cr, j.seed, j.name!)
            : runFirefight(data, cr, j.seed, j.range, MAX),
    })
  }
} else {
  const seeds = Number(process.argv[2] ?? 100)
  const jobs: Job[] = []
  for (const range of RANGES) for (let seed = 1; seed <= seeds; seed++) jobs.push({ range, seed, kind: 'fight' })
  for (let seed = 1; seed <= seeds; seed++) {
    jobs.push({ range: 100, seed, kind: 'brigade' })
    for (const name of Object.keys(LEVEL_CASES)) jobs.push({ range: 0, seed, kind: 'levels', name })
  }
  const n = Math.max(1, Math.min(os.availableParallelism() - 1, 12))
  const out: (Job & { r: FightResult })[] = []
  const brig: BrigadeResult[] = []
  const lev: LevelResult[] = []
  const t0 = Date.now()
  await Promise.all(
    Array.from(
      { length: n },
      (_, k) =>
        new Promise<void>((done, fail) => {
          const wk = new Worker(new URL(import.meta.url), { workerData: jobs.filter((_, q) => q % n === k) })
          wk.on('message', m => {
            if (m.kind === 'brigade') brig.push(m.r)
            else if (m.kind === 'levels') lev.push(m.r)
            else out.push(m)
          })
          wk.on('error', fail)
          wk.on('exit', () => done())
        }),
    ),
  )
  const q = (a: number[], p: number) => {
    const s = [...a].sort((x, y) => x - y)
    return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN
  }
  const min = (t: number) => (t / 1200).toFixed(1)
  console.log(`${seeds} seeds per range, ${n} workers, ${((Date.now() - t0) / 1000).toFixed(0)} s\n`)
  console.log(
    'range | weaker broke | stronger first | none in 20 min | time to break, min (p10 / median / p90) | weaker losses at break (p10 / median / p90) | at the break: losses / shocks, points',
  )
  for (const [label, kind, range] of RANGES.map(r => [`${r} m`, 'fight', r] as const)) {
    const rs = out.filter(o => o.range === range && o.kind === kind).map(o => o.r)
    const weak = rs.filter(r => r.first === 1)
    const strong = rs.filter(r => r.first === 0)
    const none = rs.filter(r => r.first < 0)
    const broke = rs.filter(r => r.first >= 0)
    const t = weak.map(r => r.tick)
    // percent of the line
    const l = weak.map(r => (r.lossB * 100) / MEN)
    const avg = (a: number[]) => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : '-')
    console.log(
      `${label} | ${weak.length} | ${strong.length} | ${none.length} | ${min(q(t, 0.1))} / ${min(q(t, 0.5))} / ${min(q(t, 0.9))} | ${q(l, 0.1)} / ${q(l, 0.5)} / ${q(l, 0.9)}% | ${avg(broke.map(r => r.termLosses))} / ${avg(broke.map(r => r.termShocks))}`,
    )
  }
  // the brigade: who broke first, how many of the weaker side were out of the fight 3 minutes later, and the
  // time from the first break to the last within those 3 minutes
  const bw = brig.filter(b => b.first === 1)
  const bt = bw.map(b => b.tick)
  const spread = bw.map(b => (b.last - b.tick) / 20)
  const outs = [0, 1, 2, 3].map(k => bw.filter(b => b.outB === k).length)
  console.log(
    `\nbrigade 3v3 at 100 m: weaker side broke first ${bw.length}, stronger first ${brig.filter(b => b.first === 0).length}, both at once ${brig.filter(b => b.first === 2).length}, none ${brig.filter(b => b.first < 0).length}; first break ${min(q(bt, 0.1))} / ${min(q(bt, 0.5))} / ${min(q(bt, 0.9))} min; weaker lines out 3 min later (1 / 2 / 3): ${outs.slice(1).join(' / ')}; first to last break ${q(spread, 0.1)} / ${q(spread, 0.5)} / ${q(spread, 0.9)} s; stronger lines out: ${brig.reduce((a, b) => a + b.outA, 0)}`,
  )
  // the levels: who broke first, when, and the losses at the break (medians)
  const lv = (name: string) => lev.filter(r => r.name === name)
  console.log(
    '\nlevels | side 0 broke first | side 1 first | none | time to break, min (p10 / median / p90) | losses at the break, median, each line',
  )
  for (const name of Object.keys(LEVEL_CASES)) {
    const rs = lv(name)
    const t = rs.filter(r => r.first >= 0).map(r => r.tick)
    const losses = LEVEL_CASES[name].lines
      .map((_, i) =>
        q(
          rs.map(r => r.loss[i]),
          0.5,
        ),
      )
      .join(' / ')
    console.log(
      `${name} | ${rs.filter(r => r.first === 0).length} | ${rs.filter(r => r.first === 1).length} | ${rs.filter(r => r.first < 0).length} | ${min(q(t, 0.1))} / ${min(q(t, 0.5))} / ${min(q(t, 0.9))} | ${losses}`,
    )
  }
  // medians of the time to break over the runs that broke; every case must break in at least 90% of its runs
  const broke = (name: string) => lv(name).filter(r => r.first >= 0)
  const c02 = lv('C-02')
  const c02won = c02.filter(r => r.first === 1)
  const c02ratio = q(
    c02won.map(r => r.loss[0] / Math.max(1, r.loss[1])),
    0.5,
  )
  const h04 = lv('H-04')
  const g06 =
    q(
      broke('G-06 level 6').map(r => r.tick),
      0.5,
    ) /
    q(
      broke('G-06 level 2').map(r => r.tick),
      0.5,
    )
  console.log(
    `C-02: the veteran's losses over the recruit's at the break, median ${c02ratio.toFixed(2)}; G-06: level 6 stands ${g06.toFixed(2)} times as long as level 2`,
  )
  const at = (range: number) => out.filter(o => o.range === range && o.kind === 'fight').map(o => o.r)
  const r100 = at(100)
  const w100 = r100.filter(r => r.first === 1)
  const med =
    q(
      w100.map(r => r.tick),
      0.5,
    ) / 1200
  const lmed = q(
    w100.map(r => (r.lossB * 100) / MEN),
    0.5,
  )
  const checks: [string, boolean][] = [
    ['C-02: the veteran wins in at least 90%', c02won.length >= 0.9 * c02.length],
    ["C-02: with about half the recruit's losses (median 0.35–0.65)", c02ratio >= 0.35 && c02ratio <= 0.65],
    [
      'H-04: level 5 holds a while (median 4 min or more), then breaks first in at least 70%',
      q(
        h04.filter(r => r.first === 0).map(r => r.tick),
        0.5,
      ) /
        1200 >=
        4 && h04.filter(r => r.first === 0).length >= 0.7 * h04.length,
    ],
    [
      'G-06: level 6 stands 2–3 times the fire of level 2 (median time to break; each breaks in at least 90%)',
      g06 >= 2 && g06 <= 3 && ['G-06 level 6', 'G-06 level 2'].every(n => broke(n).length >= 0.9 * lv(n).length),
    ],
    ['100 m: median time to break 6–10 min', med >= 6 && med <= 10],
    ['100 m: weaker losses at break 12–25% (median)', lmed >= 12 && lmed <= 25],
    ['100 m: stronger breaks first in at most 15%', r100.filter(r => r.first === 0).length <= 0.15 * r100.length],
    ['200 m: no break in 20 min in at least 95%', at(200).filter(r => r.first < 0).length >= 0.95 * at(200).length],
    [
      '50 m: median time to break under 5 min',
      q(
        at(50)
          .filter(r => r.first >= 0)
          .map(r => r.tick),
        0.5,
      ) /
        1200 <
        5,
    ],
  ]
  console.log('')
  for (const [name, ok] of checks) console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`)
  process.exit(checks.every(c => c[1]) ? 0 : 1)
}
