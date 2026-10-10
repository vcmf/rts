// Negative tests for the page checks (docs/plans/active/l0-spine.md, L0b): each check must pass on the real scene
// and fail, naming the right limit, on a scene broken on purpose. A check that cannot fail checks nothing.
//   node tools/check-negatives.mjs [page|url]  (default prototypes/painted-cinematic.html)
// Runs tools/shot.mjs once per case: the real scene, then one sabotage per limit. Exit 1 if any case misbehaves.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const arg = process.argv[2] || 'prototypes/painted-cinematic.html', isUrl = /^https?:\/\//.test(arg)
const page = isUrl ? arg : path.resolve(ROOT, arg)
if (!isUrl && !fs.existsSync(page)) { console.error(`check-negatives: no page at ${page}`); process.exit(2) }
const src = f => fs.readFileSync(path.join(ROOT, 'tools', f), 'utf8')
const CHECKS = { render: src('render-check.js'), river: src('river-check.js'), look: src('look-check.js') }

// [check, case name, sabotage (evaluated in the page first; null = the real scene), text the failure must contain]
const CASES = [
  ['render', 'real scene', null, null],
  ['render', 'water sunk under the bed', 'scene.getMeshByName("water").position.y = -40', '.water='],
  ['render', 'far-ring river line blanked', '{ const g = riverMaskCanvas.getContext("2d"); g.fillStyle = "#000"; g.fillRect(0, 0, MASKN, MASKN); riverMask.update(false) }', '.farLine='],
  ['render', 'shadow box shrunk', 'lightCam.orthoLeft *= 0.6; lightCam.orthoRight *= 0.6', 'shadow box:'],
  ['render', 'panning in the view plane', 'camera.mapPanning = false', 'left the bounds'],
  ['river', 'real scene', null, null],
  ['river', 'a tree in the river', 'groups.CommonTree_1.push([RIVER.px[RIVER.n >> 1], RIVER.pz[RIVER.n >> 1], 4, 0, 0.5])', 'instancesOverWater'],
  ['river', 'a bush in a formation zone', '(groups.Bush_1 ||= []).push([-5, -20, 2, 0, 0.5])', 'instancesInZones'],
  ['river', 'wheat on the floodplain', '{ const z = 40; groups.Wheat.push([RIVER.axisX(z) + 30, z, 1.5, 0, 0.5]) }', 'wheatOnFloodplain'],
]
// the look page's own checks (tools/look-check.js): only where the page has them (the prototype has no SPEC)
const LOOK_CASES = [
  ['look', 'real scene', null, null],
  ['look', 'tile drawn 0.5 m high', 'tileGround.position.y = 0.5; tileGround.computeWorldMatrix(true)', 'tileHeights'],
  ['look', 'far ring at the old -0.9 m', 'farGround.position.y = -0.9; farGround.computeWorldMatrix(true)', 'farHeights'],
  ['look', 'yaw unlocked', 'camera.lowerAlphaLimit = camera.upperAlphaLimit = null', 'yaw:'],
  ['look', 'an instance lifted 1 m', '{ const m = scene.meshes.find(x => x.thinInstanceCount > 10), M = m.thinInstanceGetWorldMatrices()[0].clone(); M.addTranslationFromFloats(0, 1, 0); m.thinInstanceSetMatrixAt(0, M) }', 'instancesFloating'],
]

// The page records every console.error, so the check's own "<check>-check FAILED: …" line is read back whole
// (shot.mjs cuts console output at 400 characters). A case is judged only on that line, never on other output.
const CAPTURE = 'window.__errs = []; { const ce = console.error.bind(console); console.error = (...a) => { __errs.push(a.join(" ")); ce(...a) } } "capturing"'
const REPORT = 'JSON.stringify({ failed: __errs.filter(l => /^\\w+-check FAILED: /.test(l)), other: __errs.filter(l => !/^\\w+-check FAILED: /.test(l)), hasSpec: typeof SPEC !== "undefined" })'

let bad = 0, hasSpec = false   // the look cases run when the page has a SPEC (read from the first case's report)
const queue = [...CASES]
for (let q = 0; q < queue.length; q++) {
  const [check, name, sabotage, expect] = queue[q]
  const steps = [['wait', 1000], ['eval', '(async () => { for (let i = 0; i < 1200 && !window.__proto; i++) await new Promise(r => setTimeout(r, 100)); if (!window.__proto) throw new Error("the page never set window.__proto (120 s)"); return "page built" })()'], ['wait', 1000], ['eval', CAPTURE],
    ...(sabotage ? [['eval', sabotage + '; "SABOTAGED"']] : []),
    ['eval', CHECKS[check] + '; "CHECK RAN"'], ['eval', REPORT]]
  const r = spawnSync('node', [path.join(ROOT, 'tools/shot.mjs'), isUrl ? page : pathToFileURL(page).href, path.join(ROOT, 'scratch/check-negatives'), '1280', '720', JSON.stringify(steps)],
    { encoding: 'utf8', env: { SHOT_TIMEOUT_S: '300', SHOT_LOAD_S: '300', ...process.env } })
  const out = r.stdout + r.stderr
  const applied = !sabotage || out.includes('EVAL "SABOTAGED"'), ran = out.includes('EVAL "CHECK RAN"')
  const line = out.split('\n').find(l => l.startsWith('EVAL "{\\"failed\\"'))
  const rep = line ? JSON.parse(JSON.parse(line.slice(5))) : null
  if (q === 0 && rep?.hasSpec) { hasSpec = true; queue.push(...LOOK_CASES) }
  const failLine = rep?.failed.find(l => l.startsWith(`${check}-check FAILED: `)) || ''
  if (rep && /^(EXC|EVAL-EXC) /m.test(out)) rep.other.push('an uncaught page exception')   // thrown errors are not console.error calls
  let ok, why
  if (!applied || !ran || !rep) { ok = false; why = !applied ? 'the sabotage did not apply' : !ran ? 'the check did not run' : 'no report' }
  else if (sabotage) { ok = failLine.includes(expect) && !rep.other.length; why = failLine ? (failLine.includes(expect) ? `fails on ${expect}` : `fails, but not on ${expect}`) : 'PASSES (the check missed it)'; if (rep.other.length) why += '; other page errors' }
  else { ok = !failLine && !rep.other.length && r.status === 0; why = ok ? 'passes' : 'FAILS' }
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'BAD '} ${check.padEnd(7)}${name.padEnd(30)}${why}`)
  if (!ok) console.log(`--- shot.mjs exit ${r.status}, full output:\n${out}\n---`)
}
console.log(bad ? `check-negatives: ${bad} case(s) misbehaved` : 'check-negatives: every check passes the scene and catches its sabotage')
process.exit(bad ? 1 : 0)
