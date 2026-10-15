// The ground's macro colour checks (docs/plans/active/l5-macro.md, L5a): the classes read apart, the fields' stripes
// do not shimmer, the bake is deterministic, and the full-size bake runs. Each renders the look page headless
// (SwiftShader unless SHOT_ANGLE says otherwise, the clock frozen) through its hooks (window.__look in
// src/look/main.ts), in the page's arm (?macro=flat|shader|bake in the URL; bake by default).
//
//   node tools/macro-check.mjs <look page URL> [outDir] [--only classes,shimmer,determinism,bake]
//   node tools/macro-check.mjs <look page URL> [outDir] --selftest     each gated check passes, and fails on its sabotage
//     (the stripes' sabotage shows in the shader arm only: the bake's texture filtering smooths even hard stripes, and
//     the flat arm has none; run the self-test with ?macro=shader)
//
// - classes (a measured stand-in for the judges' "are the classes readable?"): the terrain alone in summer at three
//   views over the cover (the far fields, the near fields and the track, the road and the village). The class view
//   (MACRO_DEBUG: the class the arm paints, unlit) finds where two classes meet: pixels BOUNDARY px apart across a
//   class change, each with a 5×5 window of its own class (far enough apart that the colours compared are the two
//   regions', not a soft edge's blend: the bake blends its edges over about 2 m, 20 px at the closest views). The CIE ΔE 2000 between the frame's two windows (their
//   mean colour, sRGB D65): its median per kind of edge, at least FIELD_DE where a field meets grass (meadow or
//   pasture), ROAD_DE where a road meets grass, TRACK_DE where a track does. Sabotage: every class painted the meadow's colour
//   (MACRO_SAB_ONECLASS).
// - shimmer (as tools/detail-check.mjs's, on the fields): the terrain alone, a ploughed field at the closest zoom and
//   the far fields at the widest, summer and winter (the furrows hold the snow), the image shifted a quarter pixel a
//   frame; on the fields' pixels (the class view), a pixel shimmers when its luma differs by over 8/255 from the
//   previous frame resampled a quarter pixel along. Under SHIMMER_MAX per pair at the closest zoom and SHIMMER_WIDE
//   at the widest (the water check's limits as they were at L5a, 1 % and 3.5 %: kept here, the water check's
//   widest re-baselined since for the temperate mood, docs/plans/done/temperate-fixes.md). In winter snow against bare ground makes
//   every edge pop (main's own ground, on the same pixels: 1.24% at the closest zoom, 1.74% at the widest; L5's
//   plan): there the closest zoom's limit is main's, rounded up (SHIMMER_WINTER), and the widest's stays SHIMMER_WIDE. Sabotage: hard
//   stripes never faded with the footprint (MACRO_SAB_STEP).
// - determinism: the bakes' hashes after the load, after a rebake, and after a second load: all equal.
// - bake: the bake's time at the page's sizes, and the full-size run (?macroBench=FULL: FULL² texels, the proposal's
//   1.8 km at 0.5 m); neither loses the context. Times are reported, not gated (SwiftShader is not a GPU).
// Frames are 1280×720. Exit 1 on a failure.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as png from './png.mjs'
import { CAMS } from './golden.mjs'
import { prepSteps, shoot, viewStep } from './look-page.mjs'
import { SPEC } from '../src/look/spec.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const W = 1280, H = 720, CAM = SPEC.camera, BOUNDARY = 24, FIELD_DE = 8, ROAD_DE = 8, TRACK_DE = 8, MIN_EDGES = 200   // road and track gated apart (#88: pooled, one hid the other)
const SHIFTS = 8, STEP = 0.25, ERR = 8, SHIMMER_MAX = 0.01, SHIMMER_WIDE = 0.035, SHIMMER_WINTER = 0.013, FULL = 3600
const [, A0] = CAMS.find(c => c[0] === 'start')
// the cover's classes (src/look/world/cover.ts): grass 0–1, wood 2, road 3, track 4, village 5, fields 6–9
const GRASS = c => c <= 1, ROAD = c => c === 3, TRACK = c => c === 4, FIELD = c => c >= 6 && c <= 10   // 10: bare earth (docs/plans/done/ground-surface.md)
const CLASS_VIEWS = [['far-fields', A0 + 0.35, 0.70, 260, [-100, 8, 150], 0], ['near-fields', A0, 0.70, 110, [90, 8, -40], 0], ['road', A0, 0.65, 110, [195, 8, -10], 0]]
const SHIMMER_VIEWS = [['closest', A0, CAM.betaMin, CAM.rMin, [78, 8, -38], 0, SHIMMER_MAX], ['widest', A0, CAM.betaMax, CAM.rMax, [120, 8, 200], 0, SHIMMER_WIDE],
  ['closest-winter', A0, CAM.betaMin, CAM.rMin, [78, 8, -38], 3, SHIMMER_WINTER], ['widest-winter', A0, CAM.betaMax, CAM.rMax, [120, 8, 200], 3, SHIMMER_WIDE]]

const load = (dir, n) => png.read(fs.readFileSync(path.join(dir, n + '.png')))
const classOf = (img, i) => Math.round(img.data[i * 4] / 20)
// Rec. 709 weights on the frame's stored (sRGB) values, 0–1: the measure tools/detail-check.mjs and
// tools/water-look-check.mjs take, whose limits the shimmer check borrows
const lumaAt = (img, i) => (0.2126 * img.data[i * 4] + 0.7152 * img.data[i * 4 + 1] + 0.0722 * img.data[i * 4 + 2]) / 255
const render = what => ['eval', `(async () => { await __proto.scene.whenReadyAsync(true); for (let i = 0; i < 3; i++) __proto.scene.render(); return "${what}" })()`]
const checkStep = defs => ['eval', `(async () => { const r = await __look.macro.setCheck(${JSON.stringify(defs)}); return "checks ${defs.join(' ') || 'none'}, rebaked in " + r.ms.toFixed(0) + " ms" })()`]

// sRGB bytes to CIE Lab (D65)
function lab(r, g, b) {
  const l = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }, R = l(r), G = l(g), B = l(b)
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047, Y = 0.2126 * R + 0.7152 * G + 0.0722 * B, Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883
  const f = t => t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))]
}
// CIEDE2000 (Sharma, Wu and Dalal 2005)
function de2000([L1, a1, b1], [L2, a2, b2]) {
  const rad = Math.PI / 180, C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2, G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)))
  const A1 = (1 + G) * a1, A2 = (1 + G) * a2, c1 = Math.hypot(A1, b1), c2 = Math.hypot(A2, b2)
  const h = (b, a) => { if (!a && !b) return 0; const v = Math.atan2(b, a) / rad; return v < 0 ? v + 360 : v }
  const h1 = h(b1, A1), h2 = h(b2, A2), dL = L2 - L1, dC = c2 - c1
  let dh = 0; if (c1 * c2) { dh = h2 - h1; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360 }
  const dH = 2 * Math.sqrt(c1 * c2) * Math.sin(dh / 2 * rad), Lb = (L1 + L2) / 2, cb = (c1 + c2) / 2
  let hb = h1 + h2; if (c1 * c2) { if (Math.abs(h1 - h2) > 180) hb += h1 + h2 < 360 ? 360 : -360; hb /= 2 }
  const T = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad) + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.20 * Math.cos((4 * hb - 63) * rad)
  const SL = 1 + 0.015 * (Lb - 50) ** 2 / Math.sqrt(20 + (Lb - 50) ** 2), SC = 1 + 0.045 * cb, SH = 1 + 0.015 * cb * T
  const RT = -2 * Math.sqrt(cb ** 7 / (cb ** 7 + 25 ** 7)) * Math.sin(60 * Math.exp(-(((hb - 275) / 25) ** 2)) * rad)
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH))
}
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN }

// the class view of a view, then its frame: terrain alone; the class view without the finishing passes (exact values)
function classSteps(v, tag) {
  return [viewStep(v), ['eval', '__look.terrainOnly(true); __look.finishing(false); "terrain alone"'], checkStep(['MACRO_DEBUG']), render('classes'), ['shot', `${tag}.cls`],
    checkStep([]), ['eval', '__look.finishing(true); "frame"'], render('frame')]
}

// ---------- classes ----------
function classes(url, dir, sab) {
  const steps = [...prepSteps()]
  for (const v of CLASS_VIEWS) steps.push(...classSteps(v, v[0]), checkStep(sab), render('frame'), ['shot', `${v[0]}.frame`], checkStep([]))
  shoot(url, dir, steps, W, H)
  const de = { 'field|grass': [], 'road|grass': [], 'track|grass': [] }, lines = []
  for (const [n] of CLASS_VIEWS) {
    const cls = load(dir, `${n}.cls`), img = load(dir, `${n}.frame`), d = img.data, r = 2
    const win = (x, y, c) => { let L = [0, 0, 0]; for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) { const i = yy * W + xx; if (classOf(cls, i) !== c) return null; L = L.map((v, k) => v + d[i * 4 + k]) } return L.map(v => v / 25) }
    let here = 0
    for (let y = r; y < H - r - BOUNDARY; y += 3) for (let x = r; x < W - r - BOUNDARY; x += 3) for (const [dx, dy] of [[BOUNDARY, 0], [0, BOUNDARY]]) {
      const a = classOf(cls, y * W + x), b = classOf(cls, (y + dy) * W + x + dx); if (a === b) continue
      const kind = (FIELD(a) && GRASS(b)) || (FIELD(b) && GRASS(a)) ? 'field|grass' : (ROAD(a) && GRASS(b)) || (ROAD(b) && GRASS(a)) ? 'road|grass' : (TRACK(a) && GRASS(b)) || (TRACK(b) && GRASS(a)) ? 'track|grass' : null; if (!kind) continue
      const p = win(x, y, a), q = win(x + dx, y + dy, b); if (!p || !q) continue
      de[kind].push(de2000(lab(...p), lab(...q))); here++
    }
    lines.push(`  ${n}: ${here} class edges sampled`)
  }
  let ok = true
  for (const [k, lim] of [['field|grass', FIELD_DE], ['road|grass', ROAD_DE], ['track|grass', TRACK_DE]]) {
    const m = median(de[k]), good = de[k].length >= MIN_EDGES && m >= lim; if (!good) ok = false
    lines.push(`  ${k}: ${de[k].length} edges, median ΔE2000 ${m.toFixed(1)} (≥ ${lim}, from ≥ ${MIN_EDGES} edges)${good ? '' : '  FAIL'}`)
  }
  return { ok, lines: [`classes: the frame's colour ${BOUNDARY} px apart across a class edge (5×5 windows, CIE ΔE 2000), terrain alone, summer`, ...lines] }
}

// ---------- shimmer ----------
function shimmer(url, dir, sab) {
  const steps = [...prepSteps()]
  for (const v of SHIMMER_VIEWS) {
    const n = v[0]
    steps.push(...classSteps(v, n), checkStep(sab), render('frame'))
    for (let k = 0; k < SHIFTS; k++) steps.push(['eval', `__look.shift(${k * STEP}, ${k * STEP}); "shift ${k}"`], render(`shifted ${k}`), ['shot', `${n}.${k}`])
    steps.push(['eval', '__look.shift(0, 0); "unshifted"'], checkStep([]))
  }
  shoot(url, dir, steps, W, H)
  const lum = img => { const v = new Float32Array(W * H); for (let i = 0; i < v.length; i++) v[i] = lumaAt(img, i) * 255; return v }
  let ok = true
  const lines = [`shimmer: the fields' pixels, luma off by over ${ERR}/255 from the previous frame resampled ${STEP} px along (per pair under ${(SHIMMER_MAX * 100).toFixed(1)}% at the closest zoom, ${(SHIMMER_WIDE * 100).toFixed(1)}% at the widest; in winter ${(SHIMMER_WINTER * 100).toFixed(1)}% at the closest, main's)`]
  for (const [n, , , , , , lim] of SHIMMER_VIEWS) {
    const cls = load(dir, `${n}.cls`), mask = new Uint8Array(W * H)
    for (let i = 0; i < W * H; i++) mask[i] = FIELD(classOf(cls, i)) ? 1 : 0
    let prev = lum(load(dir, `${n}.0`)), worst = 0, all = 0
    const fr = []
    for (let k = 1; k < SHIFTS; k++) {
      const cur = lum(load(dir, `${n}.${k}`)), S = STEP; let bad = 0; all = 0
      for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
        const i = y * W + x; if (!mask[i]) continue
        const pred = (1 - S) * (1 - S) * prev[i] + S * (1 - S) * (prev[i - 1] + prev[i - W]) + S * S * prev[i - W - 1]; all++
        if (Math.abs(cur[i] - pred) > ERR) bad++
      }
      fr.push(bad / Math.max(1, all)); worst = Math.max(worst, bad / Math.max(1, all)); prev = cur
    }
    const good = all >= 5000 && worst < lim; if (!good) ok = false
    lines.push(`  ${n}: ${all} field pixels; per pair ${fr.map(f => (f * 100).toFixed(3) + '%').join(' ')}; worst ${(worst * 100).toFixed(3)}%${good ? '' : '  FAIL'}`)
  }
  return { ok, lines }
}

// ---------- determinism ----------
const hashStep = tag => ['eval', `(async () => "HASH ${tag} " + await __look.macro.hash("tile") + " " + await __look.macro.hash("far"))()`]
function determinism(url, dir) {
  const hashes = out => [...out.matchAll(/HASH (\S+) (\w+) (\w+)/g)].map(m => [m[1], m[2], m[3]])
  const a = hashes(shoot(url, dir, [...prepSteps(), hashStep('load'), ['eval', '(async () => { await __look.macro.bake(); return "rebaked" })()'], hashStep('rebake')], W, H))
  const b = hashes(shoot(url, dir, [...prepSteps(), hashStep('second-load')], W, H))
  const all = [...a, ...b], ok = all.length === 3 && all.every(h => h[1] === all[0][1] && h[2] === all[0][2])
  return { ok, lines: ['determinism: the bakes\' FNV-1a hashes (tile, far ring)', ...all.map(([t, x, y]) => `  ${t}: ${x} ${y}`), `  ${ok ? 'all equal' : 'DIFFER  FAIL'}`] }
}

// ---------- bake ----------
function bake(url, dir) {
  const u = new URL(url); u.searchParams.set('macroBench', String(FULL))
  const out = shoot(u.href, dir, [...prepSteps(), ['eval', 'JSON.stringify(window.__macro.bake)'],
    ['eval', `(async () => { for (let i = 0; i < 6000 && !window.__macroBench; i++) await new Promise(r => setTimeout(r, 100)); return "BENCH " + JSON.stringify(window.__macroBench ?? { error: "no result in 600 s" }) })()`]], W, H)
  const page = JSON.parse(/EVAL "(\{.*?\})"/.exec(out)?.[1]?.replaceAll('\\"', '"') ?? '{}'), full = JSON.parse(/BENCH (\{.*?\})"?$/m.exec(out)?.[1]?.replaceAll('\\"', '"') ?? '{"error":"no output"}')
  const ok = page.ms >= 0 && !page.lost && !full.error && full.ms >= 0 && !full.lost
  return { ok, lines: [`bake: at the page's sizes (${SPEC.tile / SPEC.macro.texel}² and ${SPEC.far / SPEC.macro.far}²) and the full-size run (${FULL}²); reported, not gated, but the context must hold`,
    `  page: ${page.ms?.toFixed(0)} ms, ${page.draws} draws, ${page.mb?.toFixed(1)} MB with mips, context ${page.lost ? 'LOST' : 'held'}`,
    `  full size: ${full.error ? full.error : `${full.ms.toFixed(0)} ms, ${full.draws} draws, ${full.mb.toFixed(1)} MB with mips, context ${full.lost ? 'LOST' : 'held'}`}${ok ? '' : '  FAIL'}`] }
}

const CHECKS = { classes, shimmer, determinism, bake }
const SABOTAGE = { classes: [['MACRO_SAB_ONECLASS']], shimmer: [['MACRO_SAB_STEP']] }

function main() {
  const args = process.argv.slice(2), self = args.includes('--selftest'), oi = args.indexOf('--only')
  const only = oi >= 0 ? args.splice(oi, 2)[1].split(',') : Object.keys(CHECKS)
  const [url, out = path.join(ROOT, 'scratch/macro-check')] = args.filter(a => a !== '--selftest')
  if (!url || only.some(k => !CHECKS[k])) { console.error('usage: node tools/macro-check.mjs <look page URL> [outDir] [--only classes,shimmer,determinism,bake] [--selftest]'); process.exit(2) }
  let ok = true
  for (const k of only) {
    const dir = path.join(out, k); fs.mkdirSync(dir, { recursive: true })
    const r = CHECKS[k](url, dir, [])
    for (const l of r.lines) console.log(l)
    console.log(`${k}: ${r.ok ? 'ok' : 'FAILED'}`)
    if (!r.ok) ok = false
    if (!self || !SABOTAGE[k]) continue
    for (const defs of SABOTAGE[k]) {
      const sdir = path.join(out, 'sabotage', defs.join('-')); fs.mkdirSync(sdir, { recursive: true })
      const s = CHECKS[k](url, sdir, defs)
      for (const l of s.lines) console.log('  [sabotage] ' + l)
      console.log(`${k} with ${defs.join(' ')}: ${s.ok ? 'PASSED (the check cannot see this sabotage)' : 'fails, as it must'}`)
      if (s.ok) ok = false
    }
  }
  console.log(ok ? 'macro-check: ok' : 'macro-check: FAILED')
  process.exit(ok ? 0 : 1)
}
try { main() } catch (e) { console.error('macro-check.mjs:', e.message); process.exit(1) }
