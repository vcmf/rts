// Golden screenshots (docs/plans/active/l0-spine.md): render a base and a candidate page at the same fixed
// cameras with the clock frozen, on this machine, in this run, and compare them region by region.
// Nothing is committed: the baseline is rendered fresh, from a page or from a git ref.
//
//   node tools/golden.mjs <base> <cand> [outDir]
//     <base>, <cand>: a page path, an http(s) URL, or <git-ref>:<path> (that ref's version of the page,
//     checked out to a scratch worktree), e.g. origin/main:prototypes/painted-cinematic.html
//   node tools/golden.mjs --selftest [page]
//     the negative test: the page against itself passes, and against a copy with one shader line changed fails
//
// The page contract: window.__proto = { scene, camera (ArcRotateCamera), S (state with .t, the clock, and .season),
// play (the half-size of the square the camera focus is clamped to) },
// and ?frozen keeps S.t at 0 (checked: a page that ignores it fails). The cameras are this tool's own, not
// render-check.js's (those aim at the river); each must lie inside the page's camera limits (checked).
// Writes <cam>.base.png, <cam>.cand.png, <cam>.diff.png to outDir and prints a table; exits 1 when any region
// is over its tolerance. Software GL (SwiftShader) via tools/shot.mjs: deterministic on one machine.
import { spawnSync, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import * as png from './png.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const W = 1280, H = 720
const A0 = -Math.PI / 2 - 0.35   // the prototype's start yaw
// [name, alpha, beta, radius, target, season]: yaws within ±40° of the start (decision 0010 allows ±45°, so a
// view never sits on the clamp), zooms and focus inside the camera limits and the play area
const Y40 = 40 * Math.PI / 180
export const CAMS = [
  ['start', A0, 0.80, 125, [-10, 8, 2], 0],
  ['start-yaw-40', A0 - Y40, 0.80, 125, [-10, 8, 2], 0],
  ['start-yaw+40', A0 + Y40, 0.80, 125, [-10, 8, 2], 0],
  ['close', A0 + 0.15, 0.60, 80, [-95, 8, -60], 0],
  ['river', A0, 0.80, 125, [-70, 8, 0], 0],
  ['wide', A0 + 0.35, 0.70, 260, [-100, 8, 150], 0],
  ['far-edge', A0, 0.98, 260, [-110, 8, 240], 0],   // the far ring and its seam with the tile at the top of the frame
  ['winter', A0, 0.80, 125, [-10, 8, 2], 3],
]
// Regions: a GRID×GRID split of the frame. A pixel differs when a channel moves more than PX; a region fails
// when more than FRAC of its pixels differ or its mean channel difference passes MEAN. Two renders of one page
// on one machine are identical, so the limits only absorb rounding (e.g. a bundler reordering constants).
const GRID = 4, PX = 6, FRAC = 0.002, MEAN = 0.5

// a page spec to a URL; a <ref>:<path> spec checks the ref out to a worktree outside the repo (so no test runner
// or linter finds a second copy of the code), one per commit: an interrupted run leaves at most that one, which
// the next run reuses, and a finished run removes it
const cleanups = []
const git = args => execFileSync('git', args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim()
function resolvePage(spec) {
  if (/^https?:\/\//.test(spec)) return spec
  const m = /^([^:]+):(.+)$/.exec(spec)
  let file = path.resolve(ROOT, spec)
  if (m && !fs.existsSync(file)) {
    const sha = git(['rev-parse', '--short', m[1]]), dir = path.join(os.tmpdir(), `rts-golden-base-${sha}`)
    git(['worktree', 'prune'])
    if (!fs.existsSync(path.join(dir, '.git'))) { fs.rmSync(dir, { recursive: true, force: true }); git(['worktree', 'add', '--detach', dir, sha]) }
    cleanups.push(dir)
    file = path.join(dir, m[2])
  }
  if (!fs.existsSync(file)) throw new Error(`no page at ${file}`)
  return pathToFileURL(file).href
}
// never let a failed clean-up hide the error that ended the run
const cleanup = () => { for (const dir of cleanups.splice(0)) try { git(['worktree', 'remove', '--force', dir]) } catch (e) { console.warn(`golden.mjs: could not remove the worktree ${dir}: ${e.message}`) } }

function render(url, dir, tag) {
  // a page may build after an await (the look page fetches its data): wait for its contract object first
  const steps = [['wait', 1000], ['eval', '(async () => { for (let i = 0; i < 1200 && !window.__proto; i++) await new Promise(r => setTimeout(r, 100)); if (!window.__proto) throw new Error("the page never set window.__proto (120 s)"); return "page built" })()'], ['wait', 2000],
    // the page's own loop stops: each camera renders exactly the frames asked for, and a slow frame cannot race the capture
    ['eval', 'for (const id of ["panel", "fps", "drop"]) { const e = document.getElementById(id); if (e) e.style.display = "none" } __proto.scene.getEngine().stopRenderLoop(); "ui hidden, loop stopped"'],
    // the clock must be frozen, or clouds and water move between the two renders
    ['eval', '__proto.scene.render(); __proto.scene.render(); if (__proto.S.t !== 0) throw new Error("the page ignores ?frozen (S.t = " + __proto.S.t + ")"); "frozen"']]
  for (const [name, a, b, r, t, season] of CAMS) {
    // every view must be one the player can reach: a clamped view would be rendered somewhere else, silently
    steps.push(['eval', `(async () => { const c = __proto.camera, lim = (v, lo, hi) => (lo == null || v >= lo - 1e-9) && (hi == null || v <= hi + 1e-9)
      const t = [${t}], P = __proto.play
      if (!lim(${a}, c.lowerAlphaLimit, c.upperAlphaLimit) || !lim(${b}, c.lowerBetaLimit, c.upperBetaLimit) || !lim(${r}, c.lowerRadiusLimit, c.upperRadiusLimit)
        || typeof P !== "number" || Math.abs(t[0]) > P || Math.abs(t[2]) > P)
        throw new Error("camera ${name} is outside the page's camera limits or play area")
      c.alpha = ${a}; c.beta = ${b}; c.radius = ${r}; c.target.set(...t); __proto.S.season = ${season}
      // every material and render target compiled, so nothing is skipped in one render and drawn in the other
      await Promise.race([__proto.scene.whenReadyAsync(true), new Promise((_, no) => setTimeout(() => no(new Error("scene never ready at camera ${name} (120 s)")), 120000))])
      for (let i = 0; i < 3; i++) __proto.scene.render()
      return "${name}" })()`], ['shot', `${name}.${tag}`])
  }
  const u = new URL(url); u.searchParams.set('frozen', '')
  const r = spawnSync('node', [path.join(ROOT, 'tools/shot.mjs'), u.href, dir, String(W), String(H), JSON.stringify(steps)],
    { encoding: 'utf8', env: { SHOT_TIMEOUT_S: '300', SHOT_LOAD_S: '300', ...process.env } })
  if (r.status !== 0) throw new Error(`rendering ${url} failed (shot.mjs exit ${r.status}), full output:\n${r.stdout}${r.stderr}`)
}

function compare(a, b) {
  if (a.w !== b.w || a.h !== b.h) return { size: true, cells: [], diff: null }
  const cells = [], diff = Buffer.alloc(a.w * a.h * 4)
  for (let gy = 0; gy < GRID; gy++) for (let gx = 0; gx < GRID; gx++) {
    const x0 = Math.floor(gx * a.w / GRID), x1 = Math.floor((gx + 1) * a.w / GRID), y0 = Math.floor(gy * a.h / GRID), y1 = Math.floor((gy + 1) * a.h / GRID)
    let n = 0, bad = 0, sum = 0
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const k = (y * a.w + x) * 4
      const d = Math.max(Math.abs(a.data[k] - b.data[k]), Math.abs(a.data[k + 1] - b.data[k + 1]), Math.abs(a.data[k + 2] - b.data[k + 2]))
      n++; sum += d; if (d > PX) bad++
      const g = (a.data[k] + a.data[k + 1] + a.data[k + 2]) / 12   // the base, dimmed, under the differences in red
      diff[k] = Math.min(255, g + d * 8); diff[k + 1] = g; diff[k + 2] = g; diff[k + 3] = 255
    }
    const frac = bad / n, mean = sum / n
    cells.push({ gx, gy, frac, mean, fail: frac > FRAC || mean > MEAN })
  }
  return { size: false, cells, diff: { w: a.w, h: a.h, data: diff } }
}

// returns true when every camera matches
export function golden(base, cand, outDir, { quiet = false } = {}) {
  fs.mkdirSync(outDir, { recursive: true })
  try {
    render(resolvePage(base), outDir, 'base')
    render(resolvePage(cand), outDir, 'cand')
  } finally { cleanup() }
  let ok = true
  if (!quiet) console.log(`camera          regions failed   worst region (differing px, mean diff)   limits: px>${PX} on ≤${FRAC * 100}%, mean ≤${MEAN}`)
  for (const [name] of CAMS) {
    const a = png.read(fs.readFileSync(path.join(outDir, `${name}.base.png`))), b = png.read(fs.readFileSync(path.join(outDir, `${name}.cand.png`)))
    const r = compare(a, b)
    if (r.size) { ok = false; console.log(`${name.padEnd(16)}size differs (${a.w}×${a.h} vs ${b.w}×${b.h})`); continue }
    fs.writeFileSync(path.join(outDir, `${name}.diff.png`), png.write(r.diff))
    const failed = r.cells.filter(c => c.fail), worst = r.cells.reduce((m, c) => (c.frac > m.frac ? c : m))
    if (failed.length) ok = false
    if (!quiet) console.log(`${name.padEnd(16)}${String(failed.length).padStart(2)}/${GRID * GRID}            (${worst.gx},${worst.gy}) ${(worst.frac * 100).toFixed(3)}%, ${worst.mean.toFixed(3)}`)
  }
  return ok
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  try {
    if (args[0] === '--selftest') {
      // one shader line, changed by a visible amount: the grain's weight in the value (the shared paint function)
      const page = path.resolve(ROOT, args[1] || 'prototypes/painted-cinematic.html'), FIND = 'c*=1.0+gr*0.38;', REPLACE = 'c*=1.0+gr*0.58;'
      const src = fs.readFileSync(page, 'utf8')
      if (!src.includes(FIND)) throw new Error(`selftest: "${FIND}" not found in ${page}`)
      const broken = path.join(path.dirname(page), `.golden-selftest-${process.pid}.html`)   // beside the page, so its relative scripts load
      fs.writeFileSync(broken, src.replace(FIND, REPLACE))
      const gone = () => fs.rmSync(broken, { force: true })   // an interrupted run can leave the copy: it is git-ignored
      const out = path.join(ROOT, 'scratch/golden-selftest')
      let same, changed
      try {
        console.log('1. the page against itself (must pass)'); same = golden(page, page, path.join(out, 'same'))
        console.log(`2. against "${REPLACE}" (must fail)`); changed = golden(page, broken, path.join(out, 'changed'))
      } finally { gone() }
      console.log(`selftest: same ${same ? 'passes' : 'FAILS'}, changed ${changed ? 'PASSES' : 'fails'}`)
      process.exit(same && !changed ? 0 : 1)
    }
    if (args.length < 2) { console.error('usage: node tools/golden.mjs <base> <cand> [outDir] | --selftest [page]'); process.exit(2) }
    const ok = golden(args[0], args[1], args[2] || path.join(ROOT, 'scratch/golden'))
    console.log(ok ? 'golden: match' : 'golden: DIFFERS')
    process.exit(ok ? 0 : 1)
  } catch (e) { console.error('golden.mjs:', e.message); process.exit(1) }
}
