// Headless check of the built page (docs/plans/active/s1b-sim-page.md): serve dist/ with `vite preview`,
// drive it through window.APP with tools/shot.mjs, fail on any console error, then play each session's
// exported replay back in Node: it must reproduce every hash the page took. Two runs: the drill scenario
// (orders, every panel button, screenshots) and the 40-battalion bench (cost). Run `npm run build` first.
// Usage: node tools/app-check.mjs [outDir]
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { loadSimData, compileRuleset, play } from '../src/sim/index.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { S1B_SCENARIOS } from '../src/scenarios/s1b-field.ts'

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
  ['eval', 'APP.select([0]); APP.form("square"); APP.select([3]); APP.order("face"); APP.advance(60); APP.select([0]); APP.view(-60, -10, 9); "square and face about"'],
  ['eval', 'document.querySelector("[data-view=slots]").click(); APP.view(-60, -10, 9); "slots on (each battalion its own)"'],
  ['shot', 'drill-2-square'],
  // every panel order reaches the sim as a command: each button logs one; the sim may refuse some (reported)
  ['eval', 'APP.select([1]); const n = APP.log.length, bs = [...document.querySelectorAll("#shapes button, #styles button, [data-cmd]")]; for (const b of bs) b.click(); APP.advance(1); `PANEL ${bs.length} ${APP.log.length - n} refused: ${APP.dropped.map(d => d.reason).join("; ")}`'],
  REPLAY,
]
const bench = [
  ['wait', 1500], READY,
  ['eval', 'APP.select([...Array(40).keys()]); APP.march(-35, 40, false); APP.advance(10); APP.view(-30, -40, 2.4); "40 marching"'],
  ['wait', 4000],   // the page runs on its own clock for a while: its frame timings settle
  ['shot', 'bench'],
  ['eval', 'const s = APP.stats(); `BENCH sim + men ${s.simMs.toFixed(2)} ms · units draw ${APP.drawMs().toFixed(2)} ms · map redraw ${APP.mapMs().toFixed(1)} ms · fps ${s.fps.toFixed(0)} (SwiftShader)`'],
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
  const bad = play(replay, data, cr, S1B_SCENARIOS[scenario], hashes)
  console.log(bad ? `replay MISMATCH ${JSON.stringify(bad)}` : `replay: ${replay.log.length} commands, ${hashes.length} hashes reproduced in Node`)
  if (bad) return false
  const panel = text.match(/PANEL (\d+) (\d+)/)
  if (scenario === 's1b-field' && (!panel || panel[1] !== panel[2] || panel[1] === '0')) { console.log('panel buttons did not each log one command'); return false }
  return true
}

const data = loadSimData(new Uint8Array(fs.readFileSync('data/formation-field.simdata'))), cr = compileRuleset(napoleonic)
const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
let ok = false
try {
  await sleep(2500)
  ok = await run('s1b-field', drill) && await run('s1b-bench', bench)
} finally { preview.kill() }
console.log(ok ? 'app check: ok' : 'app check: FAILED')
process.exit(ok ? 0 : 1)
