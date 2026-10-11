// The painted water's checks (docs/plans/active/w4-water-surface.md, W4): the shore band, the seam, pools against
// riffles, and shimmer. Each renders the look page headless (SwiftShader, the clock frozen) through its hooks
// (window.__look in src/look/main.ts).
//
//   node tools/water-look-check.mjs <look page URL> [outDir] [--only band,seam,pools,shimmer]
//   node tools/water-look-check.mjs <look page URL> [outDir] --selftest     each check passes, and fails on its sabotage
//
// - band: the ribbon as built (its triangles, rasterised at 0.25 m) against the drawn ground (the tile mesh's own
//   triangles) and the water data (read as the GPU reads it). The water shows over dry ground only within the band
//   (SPEC.water.band) of the shore; the drawn ground stands above the water only within the band; no wet point lies
//   outside the ribbon past the band; past the band in the water, the ground never comes within 2 cm of the water's
//   surface (z-fighting). Sabotage: the ribbon's columns kept at the water's level (?watersab=nodive).
// - seam: the tile's ground drawn with the terrain's material, then with the water's (src/look/water.ts,
//   groundMat): same geometry, so the same pixels and world points. At the ground's pixels within the band (from the
//   raw data view), the two frames' largest channel difference: 95th percentile within SEAM_P95, largest within
//   SEAM_MAX (out of 255). With the band check, equal colours in the band leave no seam where the two surfaces meet
//   (they intersect there, so they share the world point). What follows each surface's own screen derivatives (the
//   detail grain's blur, the edges' anti-aliasing) one geometry cannot show; comparing neighbours across the real
//   boundary cannot tell it from the painted shoreline there (tried: the sabotage and the page measured alike).
//   Terrain alone, no finishing passes; the sharpest bend at the closest zoom, and two default views. Sabotages: the
//   water painting itself in the band (WATER_SAB_OWN), the terrain without the band (WATER_SAB_TERRAIN).
// - pools: the default view at three reaches. At the river's samples on screen (the centre line and 0.3 half-widths
//   either side, where the water is what the camera sees), the frame's luma (Rec. 709, 0..1) in 5×5 pixels,
//   classed by the riffle there (pool ≤ POOL, riffle ≥ RIFFLE). Pools' median under riffles' by LUMA_GAP; riffles'
//   share of bright pixels (over the water's median by BRIGHT) at least FOAM_RATIO times the pools' and FOAM_MIN.
//   Sabotage: the riffle ignored (WATER_SAB_FLAT).
// - shimmer (as tools/detail-check.mjs's, on the water): the sharpest bend at the closest zoom, everything drawn,
//   the image shifted a quarter pixel a frame; within 6 px of the water's pixels, a pixel shimmers when its luma
//   differs by over 8/255 from the previous frame resampled a quarter pixel along. Under SHIMMER_MAX per pair.
//   Sabotage: aliased hard edges (WATER_SAB_STEP).
// Frames are 1280×720. Exit 1 on a failure.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as png from './png.mjs'
import { CAMS } from './golden.mjs'
import { prepSteps, shoot, viewStep } from './look-page.mjs'
import { D, SPEC } from '../src/look/spec.ts'
import { setRiver } from '../src/look/river.ts'
import { checkLookData, decodeLook } from '../src/look/world/data.ts'
import { LOOK_FILE } from './build-look-data.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const W = 1280, H = 720, CAM = SPEC.camera, BAND = SPEC.water.band, SDF = SPEC.water.sdf
const [, A0, BETA0, R0] = CAMS.find(c => c[0] === 'start')
const SEAM_P95 = 2, SEAM_MAX = 6, SEAM_MIN_PX = 500
const POOL = 0.2, RIFFLE = 0.5, LUMA_GAP = 0.03, BRIGHT = 0.2, FOAM_RATIO = 2, FOAM_MIN = 0.02
const SHIFTS = 8, STEP = 0.25, ERR = 8, SHIMMER_MAX = 0.01

let C = null
const river = () => {
  if (!C) {
    const b = fs.readFileSync(LOOK_FILE), look = decodeLook(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))
    checkLookData(D, look); C = setRiver(look.river)
  }
  return C
}
// the sample of the play area's sharpest bend
const sharpest = () => { const c = river(); let bi = -1; for (let i = 0; i < c.n; i++) if (Math.abs(c.px[i]) < SPEC.play - 30 && Math.abs(c.pz[i]) < SPEC.play - 30 && (bi < 0 || Math.abs(c.A[i]) > Math.abs(c.A[bi]))) bi = i; return bi }

// ---------- page steps and frames ----------
const render = tag => ['eval', `(async () => { await __proto.scene.whenReadyAsync(true); for (let i = 0; i < 3; i++) __proto.scene.render(); return "${tag}" })()`]
const sabStep = defs => ['eval', `__look.waterSab(${JSON.stringify(defs)}); "water sabotage ${defs.join(' ') || 'none'}"`]
// the value a page eval returned as "TAG <json>"
const evalTag = (out, tag) => { const line = out.split('\n').find(l => l.startsWith(`EVAL "${tag} `)); if (!line) throw new Error(`no ${tag} in the page's output:\n${out}`); return JSON.parse(JSON.parse(line.slice(5)).slice(tag.length + 1)) }
const load = (dir, name) => png.read(fs.readFileSync(path.join(dir, name + '.png')))
const lumaAt = (img, i) => (0.2126 * img.data[i * 4] + 0.7152 * img.data[i * 4 + 1] + 0.0722 * img.data[i * 4 + 2]) / 255
const white = (img, i) => img.data[i * 4] >= 250 && img.data[i * 4 + 1] >= 250 && img.data[i * 4 + 2] >= 250
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN }

// ---------- band ----------
const BAND_JS = `(() => { const rib = scene.getMeshByName('water'), P = rib.getVerticesData('position'), I = rib.getIndices(), G = tileGround, st = 0.25, B = ${BAND}
  const seen = new Set(), key = (i, j) => (i + 8192) * 16384 + j + 8192
  const r = { points: 0, dryN: 0, dryMax: 0, pokeN: 0, pokeMax: 0, pokeH: 0, zfight: 0, wetN: 0, uncoveredN: 0, uncoveredMax: 0 }
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3, ax = P[a], az = P[a + 2], bx = P[b], bz = P[b + 2], cx = P[c], cz = P[c + 2]
    const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz); if (Math.abs(det) < 1e-9) continue
    for (let i = Math.ceil(Math.min(ax, bx, cx) / st); i <= Math.floor(Math.max(ax, bx, cx) / st); i++) for (let j = Math.ceil(Math.min(az, bz, cz) / st); j <= Math.floor(Math.max(az, bz, cz) / st); j++) {
      const k = key(i, j); if (seen.has(k)) continue
      const x = i * st, z = j * st, l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det, l3 = 1 - l1 - l2
      if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue
      seen.add(k); r.points++
      const ry = l1 * P[a + 1] + l2 * P[b + 1] + l3 * P[c + 1], gy = G.getHeightAtCoordinates(x, z), w = __look.waterAt(x, z)
      if (ry > gy) { if (w.sdf < 0) { r.dryN++; r.dryMax = Math.max(r.dryMax, -w.sdf) } if (w.sdf > B && ry - gy < 0.02) r.zfight++ }
      else if (w.sdf > 0) { r.pokeN++; r.pokeMax = Math.max(r.pokeMax, w.sdf); r.pokeH = Math.max(r.pokeH, gy - ry) }
    }
  }
  // the wet texel centres the ribbon does not cover (they lie on the 0.25 m grid)
  const half = SMW / 2, tex = ${SPEC.water.texel}
  for (let x = -half + tex / 2; x < half; x += tex) for (let z = -half + tex / 2; z < half; z += tex) {
    const w = __look.waterAt(x, z); if (w.sdf <= 0) continue
    r.wetN++; if (!seen.has(key(Math.round(x / st), Math.round(z / st)))) { r.uncoveredN++; r.uncoveredMax = Math.max(r.uncoveredMax, w.sdf) }
  }
  return "BAND " + JSON.stringify(r) })()`
function band(url, dir, sab) {
  const u = new URL(url); if (sab.length) u.searchParams.set('watersab', 'nodive')
  const r = evalTag(shoot(u.href, dir, [...prepSteps(), ['eval', BAND_JS]], W, H), 'BAND'), f = v => v.toFixed(2)
  const fails = []
  if (r.points < 100000 || r.wetN < 10000) fails.push('too few points')
  if (r.dryMax >= BAND) fails.push('water over dry ground')
  if (r.pokeMax >= BAND) fails.push('ground through the water')
  if (r.uncoveredMax >= BAND) fails.push('wet ground without water')
  if (r.zfight) fails.push('z-fighting')
  return { ok: !fails.length, lines: [
    `band (${BAND} m): ${r.points} ribbon points at 0.25 m, ${r.wetN} wet texels`,
    `  water over dry ground: ${r.dryN} points, the farthest ${f(r.dryMax)} m from the shore`,
    `  drawn ground above the water: ${r.pokeN} points, the farthest ${f(r.pokeMax)} m into the water, up to ${f(r.pokeH)} m above it`,
    `  wet texels outside the ribbon: ${r.uncoveredN}, the farthest ${f(r.uncoveredMax)} m into the water`,
    `  past the band, ground within 2 cm of the water: ${r.zfight}${fails.length ? '  FAIL: ' + fails.join(', ') : ''}`] }
}

// ---------- seam ----------
function seamViews() {
  const c = river(), bi = sharpest(), bend = `${[c.px[bi], CAM.focusY, c.pz[bi]]}`
  return [['bend-close', A0, CAM.betaMin, CAM.rMin, bend, 0], ['bend', A0, BETA0, R0, bend, 0], ['reach', A0, BETA0, R0, '-100,8,-70', 0]]
}
function seam(url, dir, sab) {
  const steps = [...prepSteps(), ['eval', '__look.groundAs("terrain"); __look.terrainOnly(true); __look.finishing(false); "terrain alone"'], sabStep(sab)]
  for (const v of seamViews()) {
    const n = v[0]
    steps.push(viewStep(v),
      ['eval', '__look.groundAs("water"); __look.waterView(6); "surface"'], render('surface'), ['shot', `${n}.surface`],
      ['eval', '__look.waterView(4); "raw"'], render('raw'), ['shot', `${n}.raw`],
      ['eval', '__look.waterView(0); __look.groundAs("terrain"); "terrain"'], render('terrain'), ['shot', `${n}.terrain`],
      ['eval', '__look.groundAs("water"); "water"'], render('water'), ['shot', `${n}.water`],
      ['eval', '__look.groundAs("terrain"); "back"'])
  }
  shoot(url, dir, steps, W, H)
  let ok = true
  const lines = [`seam: the ground's pixels within ${BAND} m of the shore, terrain's material against the water's, largest channel difference /255 (95th percentile ≤ ${SEAM_P95}, largest ≤ ${SEAM_MAX})`]
  for (const [n] of seamViews()) {
    const surf = load(dir, `${n}.surface`), raw = load(dir, `${n}.raw`), ter = load(dir, `${n}.terrain`), wat = load(dir, `${n}.water`), d = []
    for (let i = 0; i < W * H; i++) {
      if (!white(surf, i)) continue
      const s = (raw.data[i * 4 + 1] / 255 * 2 - 1) * SDF; if (Math.abs(s) >= BAND - 0.125) continue   // the raw view's step: 0.125 m
      let e = 0; for (let k = 0; k < 3; k++) e = Math.max(e, Math.abs(ter.data[i * 4 + k] - wat.data[i * 4 + k])); d.push(e)
    }
    const p95 = pct(d, 0.95), mx = d.length ? Math.max(...d) : NaN, good = d.length >= SEAM_MIN_PX && p95 <= SEAM_P95 && mx <= SEAM_MAX
    if (!good) ok = false
    lines.push(`  ${n}: ${d.length} pixels, 95th percentile ${p95}, largest ${mx}${good ? '' : '  FAIL'}`)
  }
  return { ok, lines }
}

// ---------- pools ----------
const POOL_VIEWS = [['pr-south', A0, BETA0, R0, '-100,8,-70', 0], ['pr-mid', A0, BETA0, R0, '-100,8,30', 0], ['pr-north', A0, BETA0, R0, '-95,8,120', 0]]
const PROJ_JS = tag => `(() => { const B = window.B, e = __proto.scene.getEngine(), T = __proto.scene.getTransformMatrix(), w = e.getRenderWidth(), h = e.getRenderHeight(), C = RIVER, out = []
  for (let i = 0; i < C.n; i++) for (const f of [-0.3, 0, 0.3]) {
    const o = f * C.W[i] / 2, x = C.px[i] - C.tz[i] * o, z = C.pz[i] + C.tx[i] * o
    const s = B.Vector3.Project(new B.Vector3(x, C.zw[i], z), B.Matrix.IdentityReadOnly, T, { x: 0, y: 0, width: w, height: h })
    if (s.z > 0 && s.z < 1 && s.x >= 3 && s.y >= 3 && s.x < w - 3 && s.y < h - 3) out.push([Math.round(s.x), Math.round(s.y), +C.riffle[i].toFixed(3)])
  }
  return "${tag} " + JSON.stringify(out) })()`
function pools(url, dir, sab) {
  const steps = [...prepSteps(), sabStep(sab)]
  for (const v of POOL_VIEWS) steps.push(viewStep(v), ['eval', '__look.finishing(true); __look.waterView(0); "frame"'], render('frame'), ['shot', `${v[0]}.frame`],
    ['eval', '__look.finishing(false); __look.waterView(6); "surface"'], render('surface'), ['shot', `${v[0]}.surface`], ['eval', PROJ_JS(`PROJ-${v[0]}`)], ['eval', '__look.waterView(0); __look.finishing(true); "back"'])
  const out = shoot(url, dir, steps, W, H)
  const cls = { pool: [], riffle: [] }, all = []
  for (const [n] of POOL_VIEWS) {
    const frame = load(dir, `${n}.frame`), surf = load(dir, `${n}.surface`), seen = new Set()
    for (const [sx, sy, rf] of evalTag(out, `PROJ-${n}`)) {
      const k = rf <= POOL ? 'pool' : rf >= RIFFLE ? 'riffle' : null
      for (let y = sy - 2; y <= sy + 2; y++) for (let x = sx - 2; x <= sx + 2; x++) {
        const i = y * W + x; if (seen.has(i) || !white(surf, i)) continue
        seen.add(i); const l = lumaAt(frame, i); all.push(l); if (k) cls[k].push(l)
      }
    }
  }
  const med = pct(all, 0.5), share = a => a.filter(l => l > med + BRIGHT).length / Math.max(1, a.length)
  const mp = pct(cls.pool, 0.5), mr = pct(cls.riffle, 0.5), sp = share(cls.pool), sr = share(cls.riffle)
  const enough = cls.pool.length >= 500 && cls.riffle.length >= 500, dark = mr - mp >= LUMA_GAP, foamy = sr >= FOAM_RATIO * sp && sr >= FOAM_MIN
  return { ok: enough && dark && foamy, lines: [
    `pools: ${cls.pool.length} pool pixels (riffle ≤ ${POOL}), ${cls.riffle.length} riffle pixels (≥ ${RIFFLE}) at ${POOL_VIEWS.length} reaches${enough ? '' : '  FAIL: too few'}`,
    `  median luma: pools ${mp.toFixed(3)}, riffles ${mr.toFixed(3)} (riffles lighter by ≥ ${LUMA_GAP})${dark ? '' : '  FAIL'}`,
    `  bright pixels (over the water's median ${med.toFixed(3)} by ${BRIGHT}): pools ${(sp * 100).toFixed(1)}%, riffles ${(sr * 100).toFixed(1)}% (≥ ${FOAM_RATIO}× and ≥ ${FOAM_MIN * 100}%)${foamy ? '' : '  FAIL'}`] }
}

// ---------- shimmer ----------
function shimmer(url, dir, sab) {
  const c = river(), bi = sharpest(), v = ['shimmer', A0, CAM.betaMin, CAM.rMin, `${[c.px[bi], CAM.focusY, c.pz[bi]]}`, 0]
  const steps = [...prepSteps(), sabStep(sab), viewStep(v), ['eval', '__look.finishing(false); __look.waterView(6); "surface"'], render('surface'), ['shot', 'shimmer.surface'], ['eval', '__look.waterView(0); __look.finishing(true); "frame"']]
  for (let k = 0; k < SHIFTS; k++) steps.push(['eval', `__look.shift(${k * STEP}, ${k * STEP}); "shift ${k}"`], render(`shifted ${k}`), ['shot', `shimmer.${k}`])
  steps.push(['eval', '__look.shift(0, 0); "unshifted"'])
  shoot(url, dir, steps, W, H)
  // the water's pixels, dilated 6 px (the shore band on the terrain's side, the shore foam)
  const surf = load(dir, 'shimmer.surface'), mask = new Uint8Array(W * H), R = 6
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (white(surf, y * W + x)) for (let yy = Math.max(0, y - R); yy <= Math.min(H - 1, y + R); yy++) for (let xx = Math.max(0, x - R); xx <= Math.min(W - 1, x + R); xx++) mask[yy * W + xx] = 1
  const lum = img => { const v = new Float32Array(W * H); for (let i = 0; i < v.length; i++) v[i] = lumaAt(img, i) * 255; return v }
  let prev = lum(load(dir, 'shimmer.0')), worst = 0, all = 0
  const fr = []
  for (let k = 1; k < SHIFTS; k++) {
    const cur = lum(load(dir, `shimmer.${k}`)), S = STEP
    let n = 0; all = 0
    for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
      const i = y * W + x; if (!mask[i]) continue
      const pred = (1 - S) * (1 - S) * prev[i] + S * (1 - S) * (prev[i - 1] + prev[i - W]) + S * S * prev[i - W - 1]; all++
      if (Math.abs(cur[i] - pred) > ERR) n++
    }
    fr.push(n / Math.max(1, all)); worst = Math.max(worst, n / Math.max(1, all)); prev = cur
  }
  const ok = all >= 20000 && worst < SHIMMER_MAX
  return { ok, lines: [`shimmer: ${all} pixels of the water and its shore at the closest zoom, luma off by over ${ERR}/255 from the previous frame resampled ${STEP} px along (under ${SHIMMER_MAX * 100}% per pair)`,
    `  per pair: ${fr.map(f => (f * 100).toFixed(3) + '%').join(' ')}`, `  worst ${(worst * 100).toFixed(3)}%${ok ? '' : '  FAIL'}`] }
}

const CHECKS = { band, seam, pools, shimmer }
// each check's sabotages (shader defines; the band's is the page's ?watersab=nodive)
const SABOTAGE = { band: [['nodive']], seam: [['WATER_SAB_OWN'], ['WATER_SAB_TERRAIN']], pools: [['WATER_SAB_FLAT']], shimmer: [['WATER_SAB_STEP']] }

function main() {
  const args = process.argv.slice(2), self = args.includes('--selftest'), oi = args.indexOf('--only')
  const only = oi >= 0 ? args.splice(oi, 2)[1].split(',') : Object.keys(CHECKS)
  const [url, out = path.join(ROOT, 'scratch/water-look-check')] = args.filter(a => a !== '--selftest')
  if (!url || only.some(k => !CHECKS[k])) { console.error('usage: node tools/water-look-check.mjs <look page URL> [outDir] [--only band,seam,pools,shimmer] [--selftest]'); process.exit(2) }
  let ok = true
  for (const k of only) {
    const dir = path.join(out, k); fs.mkdirSync(dir, { recursive: true })
    const r = CHECKS[k](url, dir, [])
    for (const l of r.lines) console.log(l)
    console.log(`${k}: ${r.ok ? 'ok' : 'FAILED'}`)
    if (!r.ok) ok = false
    if (!self) continue
    for (const defs of SABOTAGE[k]) {
      const sdir = path.join(out, 'sabotage', defs.join('-')); fs.mkdirSync(sdir, { recursive: true })
      const s = CHECKS[k](url, sdir, defs)
      for (const l of s.lines) console.log('  [sabotage] ' + l)
      console.log(`${k} with ${defs.join(' ')}: ${s.ok ? 'PASSED (the check cannot see this sabotage)' : 'fails, as it must'}`)
      if (s.ok) ok = false
    }
  }
  console.log(ok ? 'water-look-check: ok' : 'water-look-check: FAILED')
  process.exit(ok ? 0 : 1)
}
try { main() } catch (e) { console.error('water-look-check.mjs:', e.message); process.exit(1) }
