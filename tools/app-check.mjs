// Headless check of the built page (docs/plans/done/s1b-sim-page.md): serve dist/ with `vite preview`,
// drive it through window.APP with tools/shot.mjs, fail on any console error, then play each session's
// exported replay back in Node: it must reproduce every hash the page took. Three runs: the drill scenario
// (orders, every panel button, screenshots), the 40-battalion bench (cost), the firefight to a rout and the
// brigade to a break that spreads.
// Run `npm run build` first.
// Usage: node tools/app-check.mjs [outDir]
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { loadSimData, compileRuleset, play } from '../src/sim/index.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { PAGE_SCENARIOS } from '../src/scenarios/page.ts'

const out = process.argv[2] || 'scratch/app-check', PORT = 4178
const sleep = ms => new Promise(r => setTimeout(r, ms))
const READY = ['eval', 'if (!window.APP) throw new Error("the page did not start (no window.APP)"); "ready"']
const REPLAY = ['eval', '"REPLAY " + JSON.stringify(APP.replay())']
const drill = [
  ['wait', 1500], READY,
  ['eval', 'APP.view(-60, 0, 3.2); `map built in ${APP.buildMs.toFixed(0)} ms, map redraw ${APP.mapMs().toFixed(1)} ms`'],
  ['shot', 'drill-0-start'],
  // a multi-selection order: the three keep their places relative to each other
  ['eval', 'APP.select([0, 1, 2]); APP.march(-40, 10, false); APP.advance(20); `t ${APP.w.meta[0]} hash ${APP.hash()}`'],
  ['shot', 'drill-1-advance'],
  ['eval', 'APP.select([0]); APP.form("square"); APP.select([3]); APP.order("face"); APP.advance(60); APP.select([0]); APP.view(-130, -55, 4); "square and face about"'],
  ['eval', 'document.querySelector("[data-view=slots]").click(); APP.view(-130, -55, 4); "slots on (each battalion its own)"'],
  ['shot', 'drill-2-square'],
  // every panel order reaches the sim as a command: each button logs one; the sim may refuse some (reported)
  ['eval', 'APP.select([1]); const n = APP.log.length, bs = [...document.querySelectorAll("#shapes button, #styles button, [data-cmd]")]; for (const b of bs) b.click(); APP.advance(1); `PANEL ${bs.length} ${APP.log.length - n} refused: ${APP.dropped.map(d => d.reason).join("; ")}`'],
  // an order given while paused waits for its tick: the replay exported now must still play back
  ['eval', 'APP.order("halt"); "paused order"'],
  REPLAY,
]
const bench = [
  ['wait', 1500], READY,
  ['eval', 'APP.select([...Array(40).keys()]); APP.march(-35, 40, false); APP.advance(10); APP.view(-66, -10, 1.4); "40 marching"'],
  ['eval', 'APP.run(); "running at 1x"'],
  ['wait', 4000],   // the page runs on its own clock (headless rAF is throttled: few frames, real per-frame costs)
  ['shot', 'bench'],
  ['eval', 'const s = APP.stats(); `BENCH sim + men ${s.simMs.toFixed(2)} ms · units draw ${APP.drawMs().toFixed(2)} ms · map redraw ${APP.mapMs().toFixed(1)} ms · fps ${s.fps.toFixed(0)} (SwiftShader)`'],
  REPLAY,
]

// the firefight played to a rout (in 3-minute steps: each eval stays inside shot.mjs's timeout), then the
// moment after it, close up
// a break: routing or later (rallying, shattered: state ≥ 3)
const STEP3 = ['eval', 'if (!APP.w.f.mstate.some(s => s >= 3)) APP.advance(180); `t ${(APP.w.meta[0] / 20 / 60).toFixed(1)} min, states ${[0, 1].map(i => APP.w.f.mstate[i]).join(" ")}`']
const fight = [
  ['wait', 1500], READY,
  ['eval', 'APP.view(-120, 120, 3); APP.advance(20); "opening volleys"'],
  ['shot', 'fight-0-volleys'],
  STEP3, STEP3, STEP3, STEP3, STEP3,
  ['eval', 'const r = [0, 1].filter(i => APP.w.f.mstate[i] >= 3); APP.advance(8); APP.view(-100, 120, 3); `ROUT ${r.length} battalion ${r.join(" ")} at ${(APP.w.meta[0] / 20 / 60).toFixed(1)} min, men ${[0, 1].map(i => { const C = APP.w.cr.geo.companies; return APP.w.f.startMen[i] - APP.w.f.men.slice(i * C, i * C + C).reduce((a, b) => a + b, 0) }).join(" / ")} lost`'],
  ['shot', 'fight-1-rout'],
  REPLAY,
]

// the brigade (S1c-2) played until a break has spread: two or more of the weaker side's lines (slots 3–5) out
// of the fight (routing, rallying or shattered: state ≥ 3), in 3-minute steps
const OUT = 'APP.w.f.mstate.slice(3, 6).filter(s => s >= 3).length'
const STEP3B = ['eval', `if (${OUT} < 2) APP.advance(180); \`t \${(APP.w.meta[0] / 20 / 60).toFixed(1)} min, states \${[...APP.w.f.mstate.slice(0, 6)].join(" ")}\``]
const brigadeFight = [
  ['wait', 1500], READY,
  ['eval', 'APP.view(-125, -10, 2); APP.advance(20); "opening volleys"'],
  ['shot', 'brigade-0-volleys'],
  STEP3B, STEP3B, STEP3B, STEP3B, STEP3B, STEP3B,
  ['eval', `APP.advance(4); APP.view(-100, -10, 2); \`CONTAGION \${${OUT}} out at \${(APP.w.meta[0] / 20 / 60).toFixed(1)} min, states \${[...APP.w.f.mstate.slice(0, 6)].join(" ")}\``],
  ['shot', 'brigade-1-contagion'],
  REPLAY,
]

async function run(scenario, steps) {
  let text = ''
  const shot = spawn('node', ['tools/shot.mjs', `http://localhost:${PORT}/app/?scenario=${scenario}`, out, '1600', '900', JSON.stringify(steps)], { stdio: ['ignore', 'pipe', 'inherit'] })
  shot.stdout.on('data', d => { text += d; for (const line of String(d).split('\n')) if (line && !line.includes('REPLAY ')) console.log(line) })
  const code = await new Promise(r => shot.on('exit', c => r(c ?? 1)))
  if (code !== 0) return false
  const line = text.split('\n').find(l => l.startsWith('EVAL "REPLAY '))
  if (!line) { console.log('no replay exported'); return false }
  const { replay, hashes } = JSON.parse(JSON.parse(line.slice(5)).slice(7))
  const bad = play(replay, data, cr, PAGE_SCENARIOS[scenario], hashes)
  console.log(bad ? `replay MISMATCH ${JSON.stringify(bad)}` : `replay: ${replay.log.length} commands, ${hashes.length} hashes reproduced in Node`)
  if (bad) return false
  const panel = text.match(/PANEL (\d+) (\d+)/)
  if (scenario === 's1c-firefight' && !/ROUT [12] /.test(text)) { console.log('the firefight did not end in a rout'); return false }
  if (scenario === 's1c-brigade' && !/CONTAGION [23] /.test(text)) { console.log('the brigade fight did not spread a break'); return false }
  if (scenario === 's1b-field' && (!panel || panel[1] !== panel[2] || panel[1] === '0')) { console.log('panel buttons did not each log one command'); return false }
  return true
}

const data = loadSimData(new Uint8Array(fs.readFileSync('data/formation-field.simdata'))), cr = compileRuleset(napoleonic)
const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
let ok = false
try {
  await sleep(2500)
  ok = await run('s1b-field', drill) && await run('s1b-bench', bench) && await run('s1c-firefight', fight) && await run('s1c-brigade', brigadeFight)
} finally { preview.kill() }
console.log(ok ? 'app check: ok' : 'app check: FAILED')
process.exit(ok ? 0 : 1)
