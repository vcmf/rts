// Headless check of the built page (docs/plans/done/s1b-sim-page.md): serve dist/ with `vite preview`,
// drive it through window.APP with tools/shot.mjs, fail on any console error, then play each session's
// exported replay back in Node: it must reproduce every hash the page took. The runs: the drill scenario
// (orders, every panel button, screenshots), the 40-battalion bench (cost), the firefight to a rout, the
// brigade to a break that spreads, the arms (the unit types changing shape), and the charge (a line caught
// forming square breaks; a square holds), and the guns (a battery fires roundshot on a column).
// Run `npm run build` first.
// Usage: node tools/app-check.mjs [outDir]
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { loadSimData, compileRuleset, play } from '../src/sim/index.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { PAGE_SCENARIOS } from '../src/scenarios/page.ts'
import { DEFAULT_MAP } from '../src/scenarios/maps.ts'
import { reportSession } from './battle-report.ts'

const out = process.argv[2] || 'scratch/app-check'
const PORT = 4178
const sleep = ms => new Promise(r => setTimeout(r, ms))
const READY = ['eval', 'if (!window.APP) throw new Error("the page did not start (no window.APP)"); "ready"']
const REPLAY = ['eval', '"REPLAY " + JSON.stringify(APP.replay())']
const drill = [
  ['wait', 1500],
  READY,
  [
    'eval',
    'APP.view(-60, 0, 3.2); `map built in ${APP.buildMs.toFixed(0)} ms, map redraw ${APP.mapMs().toFixed(1)} ms`',
  ],
  ['shot', 'drill-0-start'],
  // a multi-selection order: the three keep their places relative to each other
  [
    'eval',
    'APP.select([0, 1, 2]); APP.march(-40, 10, false); APP.advance(20); `t ${APP.w.meta[0]} hash ${APP.hash()}`',
  ],
  ['shot', 'drill-1-advance'],
  [
    'eval',
    'APP.select([0]); APP.form("square"); APP.select([3]); APP.order("face"); APP.advance(60); APP.select([0]); APP.view(-130, -55, 4); "square and face about"',
  ],
  [
    'eval',
    'document.querySelector("[data-view=slots]").click(); APP.view(-130, -55, 4); "slots on (each battalion its own)"',
  ],
  ['shot', 'drill-2-square'],
  // every panel order reaches the sim as a command: each button logs one; the sim may refuse some (reported)
  [
    'eval',
    'APP.select([1]); const n = APP.log.length, bs = [...document.querySelectorAll("#shapes button, #styles button, [data-cmd]")]; for (const b of bs) b.click(); APP.advance(1); `PANEL ${bs.length} ${APP.log.length - n} refused: ${APP.dropped.map(d => d.reason).join("; ")}`',
  ],
  // an order given while paused waits for its tick: the replay exported now must still play back
  ['eval', 'APP.order("halt"); "paused order"'],
  REPLAY,
]
const bench = [
  ['wait', 1500],
  READY,
  [
    'eval',
    'APP.select([...Array(40).keys()]); APP.march(-35, 40, false); APP.advance(10); APP.view(-66, -10, 1.4); "40 marching"',
  ],
  ['eval', 'APP.run(); "running at 1x"'],
  ['wait', 4000], // the page runs on its own clock (headless rAF is throttled: few frames, real per-frame costs)
  ['shot', 'bench'],
  [
    'eval',
    'const s = APP.stats(); `BENCH sim + men ${s.simMs.toFixed(2)} ms · units draw ${APP.drawMs().toFixed(2)} ms · map redraw ${APP.mapMs().toFixed(1)} ms · fps ${s.fps.toFixed(0)} (SwiftShader)`',
  ],
  REPLAY,
]

// the firefight played to a rout (in 3-minute steps: each eval stays inside shot.mjs's timeout), then the
// moment after it, close up
// a break: routing or later (rallying, shattered: state ≥ 3), or gone (a shattered line leaves the field at the edge)
const BROKE = 'i => !APP.w.f.alive[i] || APP.w.f.mstate[i] >= 3'
const STEP3 = [
  'eval',
  'if (![0, 1].some(' +
    BROKE +
    ')) APP.advance(180); `t ${(APP.w.meta[0] / 20 / 60).toFixed(1)} min, states ${[0, 1].map(i => APP.w.f.mstate[i]).join(" ")}`',
]
const fight = [
  ['wait', 1500],
  READY,
  ['eval', 'APP.view(-120, 120, 3); APP.advance(20); "opening volleys"'],
  ['shot', 'fight-0-volleys'],
  STEP3,
  STEP3,
  STEP3,
  STEP3,
  STEP3,
  [
    'eval',
    'const r = [0, 1].filter(' +
      BROKE +
      '); APP.advance(8); APP.view(-100, 120, 3); `ROUT ${r.length} battalion ${r.join(" ")} at ${(APP.w.meta[0] / 20 / 60).toFixed(1)} min, men ${[0, 1].map(i => { const C = APP.w.cr.maxC; return APP.w.f.alive[i] ? APP.w.f.startMen[i] - APP.w.f.men.slice(i * C, i * C + C).reduce((a, b) => a + b, 0) : "left the field" }).join(" / ")} lost`',
  ],
  ['shot', 'fight-1-rout'],
  REPLAY,
]

// the arms (S1d-1): side 0's battery unlimbers and its regiment trots north in column of route, then forms
// column of squadrons; side 1's regiment forms column; the page draws them
const SHAPES = '[1, 2, 4, 5].map(i => APP.w.cr.types[APP.w.f.type[i]].shapes[APP.w.f.shape[i]].name).join(" ")'
const arms = [
  ['wait', 1500],
  READY,
  ['eval', 'APP.view(-60, 10, 1.9); "the three types"'],
  ['shot', 'arms-0-start'],
  [
    'eval',
    'APP.select([2]); APP.form("unlimbered"); APP.select([4]); APP.form("column"); APP.select([1]); APP.march(10, 80, false); APP.advance(95); APP.select([]); APP.view(-40, 60, 2.2); `TROT ${' +
      SHAPES +
      '} at z ${APP.w.f.z[1].toFixed(0)}`',
  ],
  ['shot', 'arms-1-trot'],
  ['eval', 'APP.select([1]); APP.form("column"); APP.advance(80); APP.select([]); `ARMS ${' + SHAPES + '}`'],
  ['shot', 'arms-2-deployed'],
  REPLAY,
]

// the charge (S1d-2): the regiment charges the line, which starts forming square and is caught: it breaks; once
// the regiment is no longer blown, it charges the square, which holds while the regiment turns away
const charge = [
  ['wait', 1500],
  READY,
  ['eval', 'APP.view(-110, 60, 1.9); "the regiment, the line and the square"'],
  ['shot', 'charge-0-start'],
  [
    'eval',
    'APP.select([0]); APP.charge(1); APP.advance(30); APP.select([]); APP.view(-125, 100, 2.5); `CHARGE line state ${APP.w.f.alive[1] ? APP.w.f.mstate[1] : 5}, ${APP.w.f.alive[1] ? APP.w.f.startMen[1] - APP.w.f.men.slice(APP.w.cr.maxC, 2 * APP.w.cr.maxC).reduce((a, b) => a + b, 0) : "left the field, all"} lost`',
  ],
  ['shot', 'charge-1-line'],
  [
    'eval',
    'APP.advance(150); APP.select([0]); APP.charge(2); APP.advance(40); APP.select([]); APP.view(-90, 130, 2.2); `SQUARE state ${APP.w.f.mstate[2]}, regiment phase ${APP.w.f.chPhase[0]} melee ${APP.w.f.foe[0] ? 1 : 0}`',
  ],
  ['shot', 'charge-2-square'],
  REPLAY,
]

// the guns (S1d-3): the battery on the hill fires on the column across the stream for a minute and a half
const guns = [
  ['wait', 1500],
  READY,
  [
    'eval',
    'APP.view(25, 50, 1.6); APP.select([0]); APP.order("fireAtWill"); APP.select([]); APP.advance(90); `GUNS column lost ${APP.w.f.startMen[1] - APP.w.f.men.slice(APP.w.cr.maxC, 2 * APP.w.cr.maxC).reduce((a, b) => a + b, 0)}, shots ${[...APP.w.f.shotKind.slice(0, 8)].filter(k => k === 1).length}`',
  ],
  ['shot', 'guns-0-fire'],
  REPLAY,
]

// the battle (S1e-1) on the 1.2 km battlefield: every formation deploys on the map; side 0's left-hand column forms
// column of route and marches over the western ford; every man stands on the map throughout
const ONMAP =
  '[...APP.layer.units.values()].every(u => u.men.every(m => !m.alive || (Math.abs(m.x) <= 600 && Math.abs(m.z) <= 600)))'
// the visual bench (docs/plans/active/c0-bench.md): X-09 with the overlay on, the square formed and the column through
// it (today's overlap, reported), then back to a tick and a tick on: the hash there is the one first seen there
const benchCase = [
  ['wait', 1500],
  READY,
  [
    'eval',
    'APP.overlay(true); APP.advance(100); window.H = [APP.w.meta[0], APP.hash()]; APP.advance(130); APP.view(0, 0, 5); `BENCH overlaps ${APP.overlaps()} at tick ${APP.w.meta[0]}`',
  ],
  ['shot', 'bench-x09-overlay'],
  [
    'eval',
    'APP.goTo(window.H[0]); const same = APP.hash() === window.H[1]; APP.stepTick(); `GOTO same ${same}, then a tick on ${APP.w.meta[0] === window.H[0] + 1}`',
  ],
  ['shot', 'bench-x09-back'],
  REPLAY,
]
const battle = [
  ['wait', 1500],
  READY,
  [
    'eval',
    `APP.view(0, 0, 0.6); APP.advance(5); \`DEPLOYED \${[...APP.w.f.alive].filter(a => a).length} on map \${${ONMAP}}\``,
  ],
  ['shot', 'battle-0-deployed'],
  [
    'eval',
    'APP.select([3]); APP.form("march"); APP.advance(25); APP.march(-260, -40, false); APP.march(-260, 60, true); APP.select([]); APP.advance(180); "marching"',
  ],
  ['eval', 'APP.advance(180); "marching"'],
  // about 480 s from the ridge at the ordinary pace
  [
    'eval',
    `APP.advance(180); APP.view(-260, 0, 1.5); \`FORD column at z \${APP.w.f.z[3].toFixed(0)} on map \${${ONMAP}}\``,
  ],
  ['shot', 'battle-1-ford'],
  // S1e-2: you command side 0 only; side 1 follows its plan (its first line, units 8–11, has come down from its ridge
  // at z 230 to the stream's north bank, z 70–74 for all four)
  [
    'eval',
    `APP.select([8, 0]); const sel = [...APP.selected].join(","); APP.select([]); \`SIDES selected \${sel}, enemy first line at z \${[8, 9, 10, 11].map(i => APP.w.f.z[i].toFixed(0)).join(" ")}\``,
  ],
  // S1e-3: a moment marked for the playtest; the report of the session prints it (below)
  ['eval', 'APP.mark("the enemy first line is down"); `MARKS ${APP.session().marks.length}`'],
  // on to the result (at most the scenario's 40 minutes), in 3-minute steps
  ...Array.from({ length: 12 }, () => [
    'eval',
    'if (!APP.result().tick) APP.advance(180); `t ${(APP.w.meta[0] / 1200).toFixed(1)} min`',
  ]),
  ['eval', 'APP.view(0, -60, 0.8); const r = APP.result(); `RESULT ${r.winner} at ${(r.tick / 1200).toFixed(1)} min`'],
  ['shot', 'battle-2-result'],
  ['eval', '"SESSION " + JSON.stringify(APP.session().marks)'],
  REPLAY,
]

// the brigade (S1c-2) played until a break has spread: two or more of the weaker side's lines (slots 3–5) out
// of the fight (routing, rallying or shattered: state ≥ 3), in 3-minute steps
const OUT = '[3, 4, 5].filter(' + BROKE + ').length'
const STEP3B = [
  'eval',
  `if (${OUT} < 2) APP.advance(180); \`t \${(APP.w.meta[0] / 20 / 60).toFixed(1)} min, states \${[...APP.w.f.mstate.slice(0, 6)].join(" ")}\``,
]
const brigadeFight = [
  ['wait', 1500],
  READY,
  ['eval', 'APP.view(-125, -10, 2); APP.advance(20); "opening volleys"'],
  ['shot', 'brigade-0-volleys'],
  STEP3B,
  STEP3B,
  STEP3B,
  STEP3B,
  STEP3B,
  STEP3B,
  [
    'eval',
    `APP.advance(4); APP.view(-100, -10, 2); \`CONTAGION \${${OUT}} out at \${(APP.w.meta[0] / 20 / 60).toFixed(1)} min, states \${[...APP.w.f.mstate.slice(0, 6)].join(" ")}\``,
  ],
  ['shot', 'brigade-1-contagion'],
  REPLAY,
]

async function run(scenario, steps) {
  let text = ''
  const shot = spawn(
    'node',
    ['tools/shot.mjs', `http://localhost:${PORT}/app/?scenario=${scenario}`, out, '1600', '900', JSON.stringify(steps)],
    { stdio: ['ignore', 'pipe', 'inherit'] },
  )
  shot.stdout.on('data', d => {
    text += d
    for (const line of String(d).split('\n')) if (line && !line.includes('REPLAY ')) console.log(line)
  })
  const code = await new Promise(r => shot.on('exit', c => r(c ?? 1)))
  if (code !== 0) return false
  const line = text.split('\n').find(l => l.startsWith('EVAL "REPLAY '))
  if (!line) {
    console.log('no replay exported')
    return false
  }
  const { replay, hashes } = JSON.parse(JSON.parse(line.slice(5)).slice(7))
  const scen = PAGE_SCENARIOS[scenario]
  const data = dataOf(scen.map ?? DEFAULT_MAP)
  // the battle's session goes through the playtest's report (tools/battle-report.ts), which checks the hashes as it
  // plays, in one pass; the other scenarios only replay
  let lines = null
  let bad = null
  if (scenario === 's1e-battle') {
    const sline = text.split('\n').find(l => l.startsWith('EVAL "SESSION '))
    if (!sline) {
      console.log('no session exported')
      return false
    }
    const marks = JSON.parse(JSON.parse(sline.slice(5)).slice(8))
    try {
      lines = reportSession(data, cr, scen, { replay, hashes, marks })
    } catch (e) {
      bad = e instanceof Error ? e.message : String(e)
    }
  } else bad = play(replay, data, cr, scen, hashes)
  console.log(
    bad
      ? `replay MISMATCH ${typeof bad === 'string' ? bad : JSON.stringify(bad)}`
      : `replay: ${replay.log.length} commands, ${hashes.length} hashes reproduced in Node`,
  )
  if (bad) return false
  // the report of the session, with its mark, reaches the result
  if (lines) {
    const ok = lines.some(l => /MARK the enemy first line is down$/.test(l)) && lines.some(l => /THE END: /.test(l))
    console.log(`REPORT ${lines.length} lines, the mark ${ok ? 'and the end found' : 'or the end MISSING'}`)
    if (!ok) return false
  }
  const panel = text.match(/PANEL (\d+) (\d+)/)
  if (scenario === 's1c-firefight' && !/ROUT [12] /.test(text)) {
    console.log('the firefight did not end in a rout')
    return false
  }
  if (scenario === 's1c-brigade' && !/CONTAGION [23] /.test(text)) {
    console.log('the brigade fight did not spread a break')
    return false
  }
  if (
    scenario === 's1d-arms' &&
    !(
      /TROT march unlimbered column unlimbered at z 80/.test(text) &&
      /ARMS column unlimbered column unlimbered/.test(text)
    )
  ) {
    console.log('the arms did not change shape')
    return false
  }
  if (
    scenario === 's1d-charge' &&
    !(/CHARGE line state [35]/.test(text) && /SQUARE state [012], regiment phase 0 melee 0/.test(text))
  ) {
    console.log('the charges did not break the line and fail on the square')
    return false
  }
  if (scenario === 's1d-guns' && !/GUNS column lost [1-9]\d*, shots [1-9]/.test(text)) {
    console.log('the battery did not fire on the column')
    return false
  }
  if (
    scenario === 's1e-battle' &&
    !(
      /DEPLOYED 16 on map true/.test(text) &&
      /FORD column at z (\d+) on map true/.test(text) &&
      +text.match(/FORD column at z (\d+)/)[1] > 20
    )
  ) {
    console.log('the battle did not deploy on the map, or the column did not cross the ford')
    return false
  }
  if (
    scenario === 's1e-battle' &&
    !(
      /SIDES selected 0, enemy first line at z (-?\d+) (-?\d+) (-?\d+) (-?\d+)/.test(text) &&
      text
        .match(/enemy first line at z (-?\d+) (-?\d+) (-?\d+) (-?\d+)/)
        .slice(1)
        .every(z => +z < 200) &&
      /RESULT (side \d wins|a draw) at/.test(text)
    )
  ) {
    console.log('the battle let you select an enemy, side 1 did not advance, or it reached no result')
    return false
  }
  if (
    scenario === 'bench-x09-square-forming' &&
    !(/BENCH overlaps \d+ at tick/.test(text) && /GOTO same true, then a tick on true/.test(text))
  ) {
    console.log('the bench did not report its overlaps, or going back to a tick did not give the same world')
    return false
  }
  if (scenario === 's1b-field' && (!panel || panel[1] !== panel[2] || panel[1] === '0')) {
    console.log('panel buttons did not each log one command')
    return false
  }
  return true
}

const dataOf = name => loadSimData(new Uint8Array(fs.readFileSync(`data/${name}.simdata`)))
const cr = compileRuleset(napoleonic)
const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
let ok = false
try {
  await sleep(2500)
  ok =
    (await run('s1b-field', drill)) &&
    (await run('s1b-bench', bench)) &&
    (await run('s1c-firefight', fight)) &&
    (await run('s1c-brigade', brigadeFight)) &&
    (await run('s1d-arms', arms)) &&
    (await run('s1d-charge', charge)) &&
    (await run('s1d-guns', guns)) &&
    (await run('s1e-battle', battle)) &&
    (await run('bench-x09-square-forming', benchCase))
} finally {
  preview.kill()
}
console.log(ok ? 'app check: ok' : 'app check: FAILED')
process.exit(ok ? 0 : 1)
