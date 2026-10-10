// The terrain detail layer's checks (docs/plans/active/l2-detail.md, L2b): scale stability, seams, shimmer, and the
// image set for the tiling review. Each renders the look page headless (SwiftShader, the clock frozen) through the
// page's hooks (window.__look in src/look/main.ts).
//
//   node tools/detail-check.mjs <look page URL> [outDir] [--only scale,seams,shimmer,tiling]
//   node tools/detail-check.mjs <look page URL> [outDir] --defines DETAIL_L0     the checks on a variant (e.g. the L0 arm)
//   node tools/detail-check.mjs <look page URL> --selftest [outDir]
//     each check passes on the page and fails on its sabotage (a variant of the terrain's shader, by define)
//
// The debug view (DETAIL_DEBUG): the terrain alone, no finishing passes, its detail grain in red and its view
// distance in green and blue (16 bits over 0–1000 m).
// - scale: the debug view over a zoom sweep at two pitches. In windows at the near edge, the centre and the far edge
//   of each frame, the grain's correlation length (the lag where its autocorrelation falls to one half) along x and
//   y; the wavelength is their geometric mean. Every window within ±25% of the median.
// - seams: a test hill (src/look/lab.ts) on the ground, the grain swapped for a smooth one, the debug view at three
//   zooms. Away from silhouettes (depth jumps), edge-on faces and the hill's foot, a smooth texture draws a smooth
//   image, so a step between neighbouring pixels larger than the smooth texture can make, much larger than the steps
//   beside it, and as large again at twice the resolution (a smooth but fast transition, such as the biplanar blend
//   on a rounded crest, halves when magnified; a seam keeps its step) is a seam or a mip line. None allowed.
// - shimmer: the final image, terrain alone, at the default view, the image shifted a quarter pixel a frame right and
//   down (the projection's offset: the sampling grid moves under a still world, as in a slow pan). A pixel shimmers
//   when its luma differs by over 8/255 from the previous frame resampled a quarter pixel along: a filtered image
//   is predicted that way, hard edges and sub-pixel specks are not. Under 1% of pixels per frame pair.
// - tiling: the widest zoom at three yaws, summer and winter, the terrain alone, the detail layer and the L0 grain:
//   12 images under random names and an answer sheet, for the 3-reviewer test. Also reported, not gated: the
//   debug view's autocorrelation at the shorter lags one tile can repeat at (the frame holds no longer ones).
// Frames are 1280×720 (a 1920×1080 screenshot crashes headless Chrome here); the grain's size is set in 1080-line
// pixels and does not depend on the frame's, so the checks scale their pixel numbers by H / 1080.
// Exit 1 on a failure.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as png from './png.mjs'
import { CAMS } from './golden.mjs'
import { prepSteps, shoot, viewStep } from './look-page.mjs'
import { SPEC } from '../src/look/spec.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const W = 1280, H = 720
const CAM = SPEC.camera, DET = SPEC.detail
const [, A0, BETA0, R0, FOCUS] = CAMS.find(c => c[0] === 'start')   // the default view
const TILE_PX = DET.px * H / DET.lines                              // one texture tile at octave weight 0, in frame pixels

// ---------- page steps ----------
const detail = (defs, debug) => ['eval', `(async () => { __look.terrainOnly(true); __look.finishing(${!debug}); __look.setDetail(${JSON.stringify([...(debug ? ['DETAIL_DEBUG'] : []), ...defs])}); return "detail ${defs.join(' ') || 'l2'}${debug ? ' debug' : ''}" })()`]
const render = tag => ['eval', `(async () => { await __proto.scene.whenReadyAsync(true); for (let i = 0; i < 3; i++) __proto.scene.render(); return "${tag}" })()`]
const view = (name, alpha, beta, radius, season = 0) => viewStep([name, alpha, beta, radius, `${FOCUS}`, season])

// ---------- frame helpers ----------
const load = (dir, name) => png.read(fs.readFileSync(path.join(dir, name + '.png')))
const red = img => { const v = new Float32Array(img.w * img.h); for (let i = 0; i < v.length; i++) v[i] = img.data[i * 4]; return v }
const depth = img => { const v = new Float32Array(img.w * img.h); for (let i = 0; i < v.length; i++) v[i] = (img.data[i * 4 + 1] * 256 + img.data[i * 4 + 2]) / 65535 * 1000; return v }
const luma = img => { const v = new Float32Array(img.w * img.h); for (let i = 0; i < v.length; i++) v[i] = 0.2126 * img.data[i * 4] + 0.7152 * img.data[i * 4 + 1] + 0.0722 * img.data[i * 4 + 2]; return v }
const median = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }

// the lag (px, interpolated) where a window's autocorrelation along (dx, dy) falls to one half; null past maxLag
function halfLag(v, w, x0, y0, n, dx, dy, maxLag = 40) {
  let m = 0; for (let y = y0; y < y0 + n; y++) for (let x = x0; x < x0 + n; x++) m += v[y * w + x]; m /= n * n
  let prev = 1, c0 = 0
  for (let k = 0; k <= maxLag; k++) {
    let s = 0, cnt = 0
    for (let y = y0; y < y0 + n - k * dy; y++) for (let x = x0; x < x0 + n - k * dx; x++) { s += (v[y * w + x] - m) * (v[(y + k * dy) * w + x + k * dx] - m); cnt++ }
    s /= cnt
    if (k === 0) { c0 = s; if (!(c0 > 0)) return null; continue }
    const c = s / c0
    if (c <= 0.5) return k - 1 + (prev - 0.5) / (prev - c)
    prev = c
  }
  return null
}

// ---------- scale ----------
const SWEEP = Array.from({ length: 8 }, (_, i) => CAM.rMin * (CAM.rMax / CAM.rMin) ** (i / 7))
const PITCHES = [BETA0, CAM.betaMax]
const WIN = 192, WINDOWS = [['far', 32], ['centre', H / 2 - WIN / 2], ['near', H - 32 - WIN]]
function scale(url, dir, defs) {
  const steps = [...prepSteps(), detail(defs, true)]
  for (const b of PITCHES) for (const r of SWEEP) steps.push(view(`b${b}-r${r.toFixed(0)}`, A0, b, r), ['shot', `scale.b${b}.r${r.toFixed(0)}`])
  shoot(url, dir, steps, W, H)
  const rows = []
  for (const b of PITCHES) for (const r of SWEEP) {
    const img = load(dir, `scale.b${b}.r${r.toFixed(0)}`), v = red(img)
    for (const [wn, y0] of WINDOWS) {
      const x0 = Math.round(img.w / 2 - WIN / 2), lx = halfLag(v, img.w, x0, y0, WIN, 1, 0), ly = halfLag(v, img.w, x0, y0, WIN, 0, 1)
      rows.push({ frame: `beta ${b} r ${r.toFixed(0)}`, win: wn, lx, ly, lam: lx && ly ? Math.sqrt(lx * ly) : null })
    }
  }
  const med = median(rows.filter(r => r.lam).map(r => r.lam))
  let ok = rows.every(r => r.lam)
  const lines = [`scale: the grain's wavelength (px at ${H} lines) per window; pass within ±25% of the median ${med?.toFixed(2)}`]
  for (const r of rows) {
    const dev = r.lam ? r.lam / med - 1 : null, bad = dev == null || Math.abs(dev) > 0.25
    if (bad) ok = false
    lines.push(`  ${r.frame.padEnd(18)} ${r.win.padEnd(7)} x ${r.lx?.toFixed(2) ?? '–'}  y ${r.ly?.toFixed(2) ?? '–'}  λ ${r.lam?.toFixed(2) ?? '–'}  ${dev == null ? 'NO MEASURE' : (dev >= 0 ? '+' : '') + (dev * 100).toFixed(0) + '%'}${bad ? '  FAIL' : ''}`)
  }
  return { ok, lines, median: med }
}

// ---------- seams ----------
const SEAM_ZOOMS = [CAM.rMin, R0, CAM.rMax]
// The largest step between neighbouring pixels a smooth texture can draw, in the debug view's red units (0–255):
// its steepest texel step × the most texels a pixel can span (octave A spans at least half a tile; the incidence
// stretches it by up to 1/√cos, the cos no less than EDGE_ON: edge-on faces are skipped) × the largest renormalisation (√8: two planes, two octaves,
// two variants) × the strength × the debug view's ½ × 255; plus 2 for rounding both pixels.
const seamLimit = maxStep => maxStep * (SPEC.sizes.grain / (TILE_PX / 2)) / Math.sqrt(Math.max(DET.minCos, EDGE_ON)) * Math.sqrt(8) * DET.amp * 0.5 * 255 + 2
const EDGE_ON = 0.17   // the incidence's cosine below which a face is edge-on (about 10° from it)
const KEEPS = 0.8    // and at twice the resolution (four quarter frames) a step there is still this fraction of it (a step is a step at any resolution; a transition under a pixel wide shrinks, if not to half)
const ISOLATED = 3   // and a seam step is this many times larger than both steps beside it (a smooth slope's are alike)
function seams(url, dir, defs) {
  const [hx, , hz] = FOCUS
  const steps = [...prepSteps(), detail(defs, true), ['eval', '"MAXSTEP " + __look.grain("smooth")']]
  for (const r of SEAM_ZOOMS) {
    steps.push(view(`r${r}`, A0, BETA0, r), ['shot', `seams.r${r}.ground`])
    steps.push(['eval', `__look.hill(${hx}, ${hz}); "hill"`], render(`hill r${r}`), ['shot', `seams.r${r}.hill`])
    // the hill alone (the ground hidden): its pixels are the ones where it is drawn at the depth the frame shows
    steps.push(['eval', '__look.passes.terrain.forEach(m => m.setEnabled(false)); "ground hidden"'], render(`hill alone r${r}`), ['shot', `seams.r${r}.hillonly`], ['eval', '__look.passes.terrain.forEach(m => m.setEnabled(true)); "ground shown"'])
    for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1]]) steps.push(['eval', `__look.quarter(${i}, ${j}); "quarter"`], render(`quarter ${i} ${j}`), ['shot', `seams.r${r}.hill.q${i}${j}`])
    steps.push(['eval', '__look.quarter(null); "whole"'])
    steps.push(detail([...defs, 'DETAIL_DEBUG_INC'], true), render(`incidence r${r}`), ['shot', `seams.r${r}.inc`], detail(defs, true), ['eval', '__look.lab.clearHills(); "cleared"'])
  }
  const out = shoot(url, dir, steps, W, H)
  const maxStep = +/MAXSTEP ([\d.e-]+)/.exec(out)[1], limit = seamLimit(maxStep)
  let ok = true, total = 0
  const lines = [`seams: steps over ${limit.toFixed(1)}/255 (the smooth texture's steepest texel step ${maxStep.toFixed(4)}), ${ISOLATED}× the steps beside them and still ${KEEPS}× as large at twice the resolution, away from silhouettes and edge-on faces`]
  for (const r of SEAM_ZOOMS) {
    const g = load(dir, `seams.r${r}.ground`), h = load(dir, `seams.r${r}.hill`), w = h.w
    const dg = depth(g), dh = depth(h), da = depth(load(dir, `seams.r${r}.hillonly`)), v = red(h), onHill = new Uint8Array(w * h.h), sil = new Uint8Array(w * h.h)
    let hillPx = 0
    // 1: the hill (drawn alone at the depth the frame shows, to the depth's 1.5 cm step), 0: the ground (likewise),
    // 2: both match (along the line where the hill meets the ground): a pair touching it is not compared
    for (let i = 0; i < onHill.length; i++) {
      const hill = Math.abs(da[i] - dh[i]) < 0.05, ground = Math.abs(dg[i] - dh[i]) < 0.05
      onHill[i] = hill && ground ? 2 : hill ? 1 : 0; if (onHill[i] === 1) hillPx++
    }
    // silhouettes: a depth step much larger than the ones beside it (a slope's steps are alike), dilated by a pixel;
    // and faces seen nearly edge-on (incidence under EDGE_ON, from the incidence view), where a smooth turn of the
    // normal fits in a pixel
    const dstep = (i, s) => Math.abs(dh[i + s] - dh[i]), inc = red(load(dir, `seams.r${r}.inc`))
    for (let y = 2; y < h.h - 2; y++) for (let x = 2; x < w - 2; x++) {
      const i = y * w + x
      if (inc[i] < EDGE_ON * 255) sil[i] = 1
      for (const s of [1, w]) if (dstep(i, s) > 0.05 + 0.002 * dh[i] && dstep(i, s) > 2 * Math.max(dstep(i - s, s), dstep(i + s, s))) for (const j of [i - s, i, i + s, i + 2 * s]) sil[j] = 1
    }
    const q = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([i, j]) => [i, j, red(load(dir, `seams.r${r}.hill.q${i}${j}`))]), w2 = 2 * w, v2 = new Float32Array(w2 * 2 * h.h)
    for (const [i, j, qv] of q) for (let y = 0; y < h.h; y++) for (let x = 0; x < w; x++) v2[(j * h.h + y) * w2 + i * w + x] = qv[y * w + x]
    const bad = []
    for (let y = 2; y < h.h - 3; y++) for (let x = 2; x < w - 3; x++) {
      const i = y * w + x
      for (const s of [1, w]) {
        if (sil[i] || sil[i + s] || onHill[i] !== onHill[i + s] || onHill[i] === 2) continue
        const d = Math.abs(v[i + s] - v[i]), side = Math.max(Math.abs(v[i] - v[i - s]), Math.abs(v[i + 2 * s] - v[i + s]))
        if (!(d > limit && d > ISOLATED * side)) continue
        // magnified, a smooth transition spreads over twice the pixels and its steps halve; a seam keeps its step
        let d2 = 0
        for (let a = 0; a < 2; a++) for (let k = 0; k < 3; k++) {
          const X = 2 * x + (s === 1 ? k : a), Y = 2 * y + (s === 1 ? a : k), sx = s === 1 ? 1 : 0, sy = 1 - sx
          d2 = Math.max(d2, Math.abs(v2[(Y + sy) * w2 + X + sx] - v2[Y * w2 + X]))
        }
        if (d2 >= KEEPS * d) bad.push([x, y, d, d2])
      }
    }
    total += bad.length; if (bad.length) ok = false
    lines.push(`  r ${String(r).padEnd(4)} hill ${hillPx} px: ${bad.length} seam steps${bad.length ? ` (largest ${Math.max(...bad.map(b => b[2])).toFixed(0)}/255, ${Math.max(...bad.map(b => b[3])).toFixed(0)} at 2×, e.g. at ${bad.slice(0, 3).map(b => b[0] + ',' + b[1]).join(' ')})` : ''}`)
    if (hillPx < 2000) { ok = false; lines.push(`  r ${r}: the hill covers only ${hillPx} px (not measured)`) }
  }
  return { ok, lines, total }
}

// ---------- shimmer ----------
// The image shifted by a quarter pixel a frame, right and down (the projection's offset: the sampling grid moves
// under a still world, as in a slow diagonal pan, so edges of every direction cross pixels). A filtered image is
// predicted by resampling the previous frame a quarter pixel along (bilinear); an under-filtered one (hard edges,
// specks under a pixel) is not.
// SHIMMER_MAX: set from the measured values (docs/plans/active/l2-detail.md): the page 0.48%, the L0 grain 3.1%,
// hard band edges (the sabotage) 3.4%; what is left on the page is on the baked shadows' edges (docs/known-issues.md)
const SHIFTS = 8, STEP = 0.25, ERR = 8, SHIMMER_MAX = 0.01
function shimmer(url, dir, defs) {
  const steps = [...prepSteps(), detail(defs, false), view('default', A0, BETA0, R0)]
  for (let k = 0; k < SHIFTS; k++) steps.push(['eval', `__look.shift(${k * STEP}, ${k * STEP}); "shift ${k}"`], render(`shifted ${k}`), ['shot', `shimmer.${k}`])
  steps.push(['eval', '__look.shift(0, 0); "unshifted"'])
  shoot(url, dir, steps, W, H)
  let ok = true, worst = 0
  const lines = [`shimmer: pixels whose luma differs by over ${ERR}/255 from the previous frame resampled ${STEP} px right and down, per frame pair (pass under ${SHIMMER_MAX * 100}%)`]
  let prev = luma(load(dir, 'shimmer.0'))
  const fr = []
  for (let k = 1; k < SHIFTS; k++) {
    const img = load(dir, `shimmer.${k}`), cur = luma(img), w = img.w
    let n = 0, all = 0
    for (let y = 2; y < img.h - 2; y++) for (let x = 2; x < w - 2; x++) {
      const i = y * w + x, S = STEP, pred = (1 - S) * (1 - S) * prev[i] + S * (1 - S) * (prev[i - 1] + prev[i - w]) + S * S * prev[i - w - 1]; all++
      if (Math.abs(cur[i] - pred) > ERR) n++
    }
    fr.push(n / all); worst = Math.max(worst, n / all); prev = cur
  }
  if (worst >= SHIMMER_MAX) ok = false
  lines.push(`  per pair: ${fr.map(f => (f * 100).toFixed(3) + '%').join(' ')}`, `  worst ${(worst * 100).toFixed(3)}%${ok ? '' : '  FAIL'}`)
  return { ok, lines, worst }
}

// ---------- tiling ----------
function tiling(url, dir) {
  const tdir = path.join(dir, 'tiling'); fs.mkdirSync(tdir, { recursive: true })
  const views = []
  for (const [arm, defs] of [['l2', []], ['l0', ['DETAIL_L0']]]) for (const [season, sv] of [['summer', 0], ['winter', 3]]) for (const dy of [-CAM.yawRange, 0, CAM.yawRange])
    views.push({ arm, defs, season, sv, yaw: Math.round(dy * 180 / Math.PI) })
  // random names: shuffled numbers (Fisher–Yates)
  const ids = views.map((_, i) => i + 1)
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]] }
  const steps = prepSteps()
  views.forEach((v, i) => {
    v.name = `ground-${String(ids[i]).padStart(2, '0')}`
    if (i === 0 || views[i - 1].arm !== v.arm) steps.push(detail(v.defs, false))   // views are grouped by arm
    steps.push(view(v.name, A0 + v.yaw * Math.PI / 180, CAM.betaMax, CAM.rMax, v.sv), ['shot', path.join('tiling', v.name)])
  })
  steps.push(detail([], true), view('tiling-debug', A0, CAM.betaMax, CAM.rMax), ['shot', 'tiling.debug'])
  shoot(url, dir, steps, W, H)
  const answers = Object.fromEntries(views.map(v => [v.name, { arm: v.arm, season: v.season, yawDeg: v.yaw }]))
  fs.writeFileSync(path.join(tdir, 'answers.json'), JSON.stringify(answers, null, 1) + '\n')
  // the debug view's autocorrelation along x, over the lags one tile can repeat at (octave A spans ½ to 1 tile)
  const img = load(dir, 'tiling.debug'), v = red(img), w = img.w
  let m = 0; for (const x of v) m += x; m /= v.length
  let c0 = 0; for (const x of v) c0 += (x - m) ** 2; c0 /= v.length
  let best = -1, at = 0
  for (let k = Math.round(TILE_PX / 2); k <= Math.min(Math.round(TILE_PX * 2), w - 256); k += 2) {
    let s = 0, n = 0
    for (let y = 0; y < img.h; y += 2) for (let x = 0; x < w - k; x += 2) { s += (v[y * w + x] - m) * (v[y * w + x + k] - m); n++ }
    if (s / n / c0 > best) { best = s / n / c0; at = k }
  }
  return { ok: true, lines: [`tiling: ${views.length} images and answers.json in ${tdir}`, `  debug view, widest zoom: the largest autocorrelation along x at lags ${Math.round(TILE_PX / 2)}–${Math.min(Math.round(TILE_PX * 2), w - 256)} px (the shorter repeats of the smaller octave; the frame is too narrow for the rest) is ${best.toFixed(3)} (at ${at} px); reported, not gated`] }
}

const CHECKS = { scale, seams, shimmer, tiling }
// each check's sabotages: the variant must fail it
const SABOTAGE = { scale: [['DETAIL_L0']], seams: [['DETAIL_L0'], ['DETAIL_SAB_IMPLICIT']], shimmer: [['DETAIL_SAB_STEP']] }

function main() {
  const args = process.argv.slice(2), self = args.includes('--selftest'), oi = args.indexOf('--only')
  const only = oi >= 0 ? args.splice(oi, 2)[1].split(',') : Object.keys(CHECKS)
  const di = args.indexOf('--defines'), defs = di >= 0 ? args.splice(di, 2)[1].split(',') : []
  const [url, out = path.join(ROOT, 'scratch/detail-check')] = args.filter(a => a !== '--selftest')
  if (!url || only.some(k => !CHECKS[k])) { console.error('usage: node tools/detail-check.mjs <look page URL> [outDir] [--only scale,seams,shimmer,tiling] [--defines A,B] [--selftest]'); process.exit(2) }
  fs.mkdirSync(out, { recursive: true })
  let ok = true
  for (const k of only) {
    if (self && k === 'tiling') continue
    const r = CHECKS[k](url, out, defs)
    for (const l of r.lines) console.log(l)
    console.log(`${k}: ${r.ok ? 'ok' : 'FAILED'}`)
    if (!r.ok) ok = false
    if (!self) continue
    for (const defs of SABOTAGE[k]) {
      const s = CHECKS[k](url, path.join(out, 'sabotage', defs.join('-')), defs)
      for (const l of s.lines) console.log('  [sabotage] ' + l)
      console.log(`${k} with ${defs.join(' ')}: ${s.ok ? 'PASSED (the check cannot see this sabotage)' : 'fails, as it must'}`)
      if (s.ok) ok = false
    }
  }
  console.log(ok ? 'detail-check: ok' : 'detail-check: FAILED')
  process.exit(ok ? 0 : 1)
}
try { main() } catch (e) { console.error('detail-check.mjs:', e.message); process.exit(1) }
