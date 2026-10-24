// The painted water's checks (docs/plans/done/w4-water-surface.md, W4): the shore band, the seam, pools against
// riffles, and shimmer; the banks and the stones' foam (docs/plans/done/w5-banks.md, W5a); the ice and the autumn
// leaves (W5b). Each renders the look page headless (SwiftShader, the clock frozen) through its hooks
// (window.__look in src/look/main.ts).
//
//   node tools/water-look-check.mjs <look page URL> [outDir] [--only band,seam,pools,shimmer,banks,foam,winter,leaves]
//   node tools/water-look-check.mjs <look page URL> [outDir] --selftest     each check passes, and fails on its sabotage
//   SHIMMER_ONLY=closest-winter,widest-winter node tools/water-look-check.mjs <url> --only shimmer     those views only
//
// - band: the ribbon as built (its triangles, rasterised at 0.25 m) against the drawn ground (the tile mesh's own
//   triangles) and the water data (read as the GPU reads it). The water shows over dry ground only within the band
//   (SPEC.water.band) of the shore; the drawn ground stands above the water only within the band; no wet point lies
//   outside the ribbon past the band; past the band in the water, the ground never comes within 2 cm of the water's
//   surface (z-fighting). Sabotage: the ribbon's columns kept at the water's level (?watersab=nodive).
// - seam: the tile's ground drawn with the terrain's material, then with the water's (src/look/water.ts,
//   groundMat): same geometry, so the same pixels and world points. At the ground's pixels within the band (from the
//   raw data view), the two frames' largest channel difference: 95th percentile within SEAM_P95, largest within
//   SEAM_MAX (out of 255). (W4 allowed 0.1% over: isolated shoreline pixels then differed by up to 12, which W5a found
//   to be undefined derivatives, the shoreline's branches reaching too little past its blend; now exact.) With the band check, equal colours in the band leave no seam where the two surfaces meet
//   (they intersect there, so they share the world point). What follows each surface's own screen derivatives (the
//   detail grain's blur, the edges' anti-aliasing) one geometry cannot show; comparing neighbours across the real
//   boundary cannot tell it from the painted shoreline there (tried: the sabotage and the page measured alike).
//   Terrain alone, no finishing passes; the sharpest bend at the closest zoom, and two default views, one of them in
//   winter too (the ice is in the band, W5b). Sabotages: the
//   water painting itself in the band (WATER_SAB_OWN), the terrain without the band (WATER_SAB_TERRAIN).
// - pools: the default view at three reaches. At the river's samples on screen (the centre line and 0.3 half-widths
//   either side, where the water is what the camera sees), the frame's luma (Rec. 709, 0..1) in 5×5 pixels,
//   classed by the riffle there (pool ≤ POOL, riffle ≥ RIFFLE). Pools' median under riffles' by LUMA_GAP; riffles'
//   share of bright pixels (over the water's median by BRIGHT) at least FOAM_RATIO times the pools' and FOAM_MIN.
//   Sabotage: the riffle ignored (WATER_SAB_FLAT).
// - shimmer (as tools/detail-check.mjs's, on the water): the sharpest bend at the closest and the widest zoom
//   (the data's textures have no mips), in summer, and in autumn (the leaves) and winter (the ice's edges, W5b), everything drawn, the image shifted a quarter pixel a frame; within 6 px of the water's pixels, a pixel shimmers when its luma
//   differs by over 8/255 from the previous frame resampled a quarter pixel along. Under SHIMMER_MAX per pair at the
//   closest zoom; at the widest, where the river's outline (the painted shoreline, the banks hiding the water) is a
//   large share of the mask, under SHIMMER_WIDE (main measured 6.3% there at W4, the same mask and view: W4's plan; re-baselined since, below). In
//   winter, bright snow and ice make every painted edge and the grain's clusters pop more (main measures 3.3% at the
//   closest zoom and 10.9% at the widest, the same views and mask, with W4's even ice; and on the water's own pixels,
//   the surface eroded 2 px, 3.1% and 11.3%: W5b's plan), so there the limits are main's, rounded down: the mask
//   under SHIMMER_WINTER and SHIMMER_WINTER_WIDE, the water's own pixels (the ice, its edges and rime, the open
//   riffles) under SHIMMER_ICE and SHIMMER_ICE_WIDE: W5b's water had to shimmer less than main's (since decision 0042: the dark water's own measurements, below).
//   The widest limits re-baselined for the temperate mood (decision 0034, the owner's call,
//   docs/plans/done/temperate-fixes.md), so no longer main's rounded down: its frame is about 7 % more contrasty (half the rise), the
//   rest spread over the grain, the painted edges and the bloom. Main measured 3.68 to 3.84 % in summer, 4.11 % in
//   autumn (after the ground's straw turn) and 11.03 to 11.4 % in winter; the limits sit a run's spread above them:
//   4.0, 4.4 and 11.8 %.
//   Re-baselined for the dark water (decision 0042, the owner's call, docs/plans/done/dark-water.md): dark water
//   against pale banks and light foam makes every painted edge more contrasty, so more of its pixels pass 8/255 under
//   the same quarter-pixel move. It measured, worst of a run: 1.17 % closest (1.19 % in autumn), 5.57 % widest
//   (5.99 % in autumn), winter 3.20 % and 12.52 %, the water's own 2.97 % and 14.51 %; the limits sit a run's spread
//   above them: 1.3, 6.0, 6.5, 3.5, 13.5, 3.2 and 15.5 %.
//   Re-baselined again for the epic mood, the default (decision 0044, the owner's call): its thinner mist and air make
//   the river's edges more contrasty. Measured, worst of a run: 1.15 % closest (1.22 % in autumn), 6.83 % widest (6.82 %
//   in autumn), winter 3.83 % and 13.90 %, the water's own 3.51 % and 15.73 %; the limits a run's spread above them:
//   1.3, 7.2, 7.2, 4.0, 14.5, 3.7 and 16.5 %.
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
const W = 1280
const H = 720
const CAM = SPEC.camera
const BAND = SPEC.water.band
const SDF = SPEC.water.sdf
const [, A0, BETA0, R0] = CAMS.find(c => c[0] === 'start')
const SEAM_P95 = 2
const SEAM_MAX = 6
const SEAM_MIN_PX = 500
const POOL = 0.2
const RIFFLE = 0.5
const LUMA_GAP = 0.03
const BRIGHT = 0.2
const FOAM_RATIO = 2
const FOAM_MIN = 0.02
const SHIFTS = 8
const STEP = 0.25
const ERR = 8
const SHIMMER_MAX = 0.013
const SHIMMER_WIDE = 0.072
const SHIMMER_AUTUMN_WIDE = 0.072
const SHIMMER_WINTER = 0.04
const SHIMMER_WINTER_WIDE = 0.145
const SHIMMER_ICE = 0.037
const SHIMMER_ICE_WIDE = 0.165

let C = null
const river = () => {
  if (!C) {
    const b = fs.readFileSync(LOOK_FILE)
    const look = decodeLook(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))
    checkLookData(D, look)
    C = setRiver(look.river)
  }
  return C
}
// the sample of the play area's sharpest bend
const sharpest = () => {
  const c = river()
  let bi = -1
  for (let i = 0; i < c.n; i++) {
    if (
      Math.abs(c.px[i]) < SPEC.play - 30 &&
      Math.abs(c.pz[i]) < SPEC.play - 30 &&
      (bi < 0 || Math.abs(c.A[i]) > Math.abs(c.A[bi]))
    ) {
      bi = i
    }
  }
  return bi
}

// ---------- page steps and frames ----------
const render = tag => [
  'eval',
  `(async () => { await __proto.scene.whenReadyAsync(true); for (let i = 0; i < 3; i++) __proto.scene.render(); return "${tag}" })()`,
]
const sabStep = defs => [
  'eval',
  `__look.waterSab(${JSON.stringify(defs)}); "water sabotage ${defs.join(' ') || 'none'}"`,
]
// the value a page eval returned as "TAG <json>"
const evalTag = (out, tag) => {
  const line = out.split('\n').find(l => l.startsWith(`EVAL "${tag} `))
  if (!line) throw new Error(`no ${tag} in the page's output:\n${out}`)
  return JSON.parse(JSON.parse(line.slice(5)).slice(tag.length + 1))
}
const load = (dir, name) => png.read(fs.readFileSync(path.join(dir, name + '.png')))
const lumaAt = (img, i) =>
  (0.2126 * img.data[i * 4] + 0.7152 * img.data[i * 4 + 1] + 0.0722 * img.data[i * 4 + 2]) / 255
const white = (img, i) => img.data[i * 4] >= 250 && img.data[i * 4 + 1] >= 250 && img.data[i * 4 + 2] >= 250
const pct = (a, p) => {
  const s = [...a].sort((x, y) => x - y)
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN
}

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
  const u = new URL(url)
  if (sab.length) u.searchParams.set('watersab', 'nodive')
  const r = evalTag(shoot(u.href, dir, [...prepSteps(), ['eval', BAND_JS]], W, H), 'BAND')
  const f = v => v.toFixed(2)
  const fails = []
  if (r.points < 100000 || r.wetN < 10000) fails.push('too few points')
  if (r.dryMax >= BAND) fails.push('water over dry ground')
  if (r.pokeMax >= BAND) fails.push('ground through the water')
  if (r.uncoveredMax >= BAND) fails.push('wet ground without water')
  if (r.zfight) fails.push('z-fighting')
  return {
    ok: !fails.length,
    lines: [
      `band (${BAND} m): ${r.points} ribbon points at 0.25 m, ${r.wetN} wet texels`,
      `  water over dry ground: ${r.dryN} points, the farthest ${f(r.dryMax)} m from the shore`,
      `  drawn ground above the water: ${r.pokeN} points, the farthest ${f(r.pokeMax)} m into the water, up to ${f(r.pokeH)} m above it`,
      `  wet texels outside the ribbon: ${r.uncoveredN}, the farthest ${f(r.uncoveredMax)} m into the water`,
      `  past the band, ground within 2 cm of the water: ${r.zfight}${fails.length ? '  FAIL: ' + fails.join(', ') : ''}`,
    ],
  }
}

// ---------- seam ----------
function seamViews() {
  const c = river()
  const bi = sharpest()
  const bend = `${[c.px[bi], CAM.focusY, c.pz[bi]]}`
  return [
    ['bend-close', A0, CAM.betaMin, CAM.rMin, bend, 0],
    ['bend', A0, BETA0, R0, bend, 0],
    ['reach', A0, BETA0, R0, '-100,8,-70', 0],
    ['reach-winter', A0, BETA0, R0, '-100,8,-70', 3],
  ]
}
function seam(url, dir, sab) {
  const steps = [
    ...prepSteps(),
    ['eval', '__look.groundAs("terrain"); __look.terrainOnly(true); __look.finishing(false); "terrain alone"'],
    sabStep(sab),
  ]
  for (const v of seamViews()) {
    const n = v[0]
    steps.push(
      viewStep(v),
      ['eval', '__look.groundAs("water"); __look.waterView(6); "surface"'],
      render('surface'),
      ['shot', `${n}.surface`],
      ['eval', '__look.waterView(4); "raw"'],
      render('raw'),
      ['shot', `${n}.raw`],
      ['eval', '__look.waterView(0); __look.groundAs("terrain"); "terrain"'],
      render('terrain'),
      ['shot', `${n}.terrain`],
      ['eval', '__look.groundAs("water"); "water"'],
      render('water'),
      ['shot', `${n}.water`],
      ['eval', '__look.groundAs("terrain"); "back"'],
    )
  }
  shoot(url, dir, steps, W, H)
  let ok = true
  const lines = [
    `seam: the ground's pixels within ${BAND} m of the shore, terrain's material against the water's, largest channel difference /255 (95th percentile ≤ ${SEAM_P95}, largest ≤ ${SEAM_MAX})`,
  ]
  for (const [n] of seamViews()) {
    const surf = load(dir, `${n}.surface`)
    const raw = load(dir, `${n}.raw`)
    const ter = load(dir, `${n}.terrain`)
    const wat = load(dir, `${n}.water`)
    const d = []
    for (let i = 0; i < W * H; i++) {
      if (!white(surf, i)) continue
      const s = ((raw.data[i * 4 + 1] / 255) * 2 - 1) * SDF
      if (Math.abs(s) >= BAND - 0.125) continue // the raw view's step: 0.125 m
      let e = 0
      for (let k = 0; k < 3; k++) e = Math.max(e, Math.abs(ter.data[i * 4 + k] - wat.data[i * 4 + k]))
      d.push(e)
    }
    const p95 = pct(d, 0.95)
    const mx = d.reduce((a, b) => Math.max(a, b), 0)
    const good = d.length >= SEAM_MIN_PX && p95 <= SEAM_P95 && mx <= SEAM_MAX
    if (!good) ok = false
    lines.push(`  ${n}: ${d.length} pixels, 95th percentile ${p95}, largest ${mx}${good ? '' : '  FAIL'}`)
  }
  return { ok, lines }
}

// ---------- pools ----------
const POOL_VIEWS = [
  ['pr-south', A0, BETA0, R0, '-100,8,-70', 0],
  ['pr-mid', A0, BETA0, R0, '-100,8,30', 0],
  ['pr-north', A0, BETA0, R0, '-95,8,120', 0],
]
const PROJ_JS =
  tag => `(() => { const B = window.B, e = __proto.scene.getEngine(), T = __proto.scene.getTransformMatrix(), w = e.getRenderWidth(), h = e.getRenderHeight(), C = RIVER, out = []
  for (let i = 0; i < C.n; i++) for (const f of [-0.3, 0, 0.3]) {
    const o = f * C.W[i] / 2, x = C.px[i] - C.tz[i] * o, z = C.pz[i] + C.tx[i] * o
    const s = B.Vector3.Project(new B.Vector3(x, C.zw[i], z), B.Matrix.IdentityReadOnly, T, { x: 0, y: 0, width: w, height: h })
    if (s.z > 0 && s.z < 1 && s.x >= 3 && s.y >= 3 && s.x < w - 3 && s.y < h - 3) out.push([Math.round(s.x), Math.round(s.y), +C.riffle[i].toFixed(3)])
  }
  return "${tag} " + JSON.stringify(out) })()`
function pools(url, dir, sab) {
  const steps = [...prepSteps(), sabStep(sab)]
  for (const v of POOL_VIEWS) {
    steps.push(
      viewStep(v),
      ['eval', '__look.finishing(true); __look.waterView(0); "frame"'],
      render('frame'),
      ['shot', `${v[0]}.frame`],
      ['eval', '__look.finishing(false); __look.waterView(6); "surface"'],
      render('surface'),
      ['shot', `${v[0]}.surface`],
      ['eval', PROJ_JS(`PROJ-${v[0]}`)],
      ['eval', '__look.waterView(0); __look.finishing(true); "back"'],
    )
  }
  const out = shoot(url, dir, steps, W, H)
  const cls = { pool: [], riffle: [] }
  const all = []
  for (const [n] of POOL_VIEWS) {
    const frame = load(dir, `${n}.frame`)
    const surf = load(dir, `${n}.surface`)
    const seen = new Set()
    for (const [sx, sy, rf] of evalTag(out, `PROJ-${n}`)) {
      const k = rf <= POOL ? 'pool' : rf >= RIFFLE ? 'riffle' : null
      for (let y = sy - 2; y <= sy + 2; y++) {
        for (let x = sx - 2; x <= sx + 2; x++) {
          const i = y * W + x
          if (seen.has(i) || !white(surf, i)) continue
          seen.add(i)
          const l = lumaAt(frame, i)
          all.push(l)
          if (k) cls[k].push(l)
        }
      }
    }
  }
  const med = pct(all, 0.5)
  const share = a => a.filter(l => l > med + BRIGHT).length / Math.max(1, a.length)
  const mp = pct(cls.pool, 0.5)
  const mr = pct(cls.riffle, 0.5)
  const sp = share(cls.pool)
  const sr = share(cls.riffle)
  const enough = cls.pool.length >= 500 && cls.riffle.length >= 500
  const dark = mr - mp >= LUMA_GAP
  const foamy = sr >= FOAM_RATIO * sp && sr >= FOAM_MIN
  return {
    ok: enough && dark && foamy,
    lines: [
      `pools: ${cls.pool.length} pool pixels (riffle ≤ ${POOL}), ${cls.riffle.length} riffle pixels (≥ ${RIFFLE}) at ${POOL_VIEWS.length} reaches${enough ? '' : '  FAIL: too few'}`,
      `  median luma: pools ${mp.toFixed(3)}, riffles ${mr.toFixed(3)} (riffles lighter by ≥ ${LUMA_GAP})${dark ? '' : '  FAIL'}`,
      `  bright pixels (over the water's median ${med.toFixed(3)} by ${BRIGHT}): pools ${(sp * 100).toFixed(1)}%, riffles ${(sr * 100).toFixed(1)}% (≥ ${FOAM_RATIO}× and ≥ ${FOAM_MIN * 100}%)${foamy ? '' : '  FAIL'}`,
    ],
  }
}

// ---------- shimmer ----------
// the closest zoom, and the widest (the data's textures have no mips: their 0.5 m texels are minified there)
function shimmerViews() {
  const c = river()
  const bi = sharpest()
  const t = `${[c.px[bi], CAM.focusY, c.pz[bi]]}`
  return (v => (process.env.SHIMMER_ONLY ? v.filter(x => process.env.SHIMMER_ONLY.split(',').includes(x[0])) : v))([
    ['closest', A0, CAM.betaMin, CAM.rMin, t, 0, SHIMMER_MAX],
    ['widest', A0, CAM.betaMax, CAM.rMax, t, 0, SHIMMER_WIDE],
    ['closest-autumn', A0, CAM.betaMin, CAM.rMin, t, 1.5, SHIMMER_MAX],
    ['widest-autumn', A0, CAM.betaMax, CAM.rMax, t, 1.5, SHIMMER_AUTUMN_WIDE],
    ['closest-winter', A0, CAM.betaMin, CAM.rMin, t, 3, SHIMMER_WINTER, SHIMMER_ICE],
    ['widest-winter', A0, CAM.betaMax, CAM.rMax, t, 3, SHIMMER_WINTER_WIDE, SHIMMER_ICE_WIDE],
  ])
}
function shimmer(url, dir, sab) {
  if (!shimmerViews().length) {
    return { ok: false, lines: [`shimmer: no view matches SHIMMER_ONLY=${process.env.SHIMMER_ONLY}  FAIL`] }
  }
  const steps = [...prepSteps(), sabStep(sab)]
  for (const v of shimmerViews()) {
    const n = v[0]
    steps.push(
      viewStep(v),
      ['eval', '__look.finishing(false); __look.waterView(6); "surface"'],
      render('surface'),
      ['shot', `${n}.surface`],
      ['eval', '__look.waterView(0); __look.finishing(true); "frame"'],
    )
    for (let k = 0; k < SHIFTS; k++) {
      steps.push(['eval', `__look.shift(${k * STEP}, ${k * STEP}); "shift ${k}"`], render(`shifted ${k}`), [
        'shot',
        `${n}.${k}`,
      ])
    }
    steps.push(['eval', '__look.shift(0, 0); "unshifted"'])
  }
  shoot(url, dir, steps, W, H)
  const lum = img => {
    const v = new Float32Array(W * H)
    for (let i = 0; i < v.length; i++) v[i] = lumaAt(img, i) * 255
    return v
  }
  let ok = true
  const lines = [
    `shimmer: the water and its shore, luma off by over ${ERR}/255 from the previous frame resampled ${STEP} px along (per pair under ${(SHIMMER_MAX * 100).toFixed(1)}% at the closest zoom, ${(SHIMMER_WIDE * 100).toFixed(1)}% at the widest (${(SHIMMER_AUTUMN_WIDE * 100).toFixed(1)}% in autumn); in winter ${(SHIMMER_WINTER * 100).toFixed(1)}% and ${(SHIMMER_WINTER_WIDE * 100).toFixed(1)}%)`,
  ]
  for (const [n, , , , , , lim, coreLim] of shimmerViews()) {
    // the water's pixels, dilated 6 px (the shore band on the terrain's side, the shore foam)
    const surf = load(dir, `${n}.surface`)
    const rows = new Uint8Array(W * H)
    const mask = new Uint8Array(W * H)
    const R = 6
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (white(surf, y * W + x)) {
          for (let xx = Math.max(0, x - R); xx <= Math.min(W - 1, x + R); xx++) rows[y * W + xx] = 1
        }
      }
    } // dilated along rows, then columns
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (rows[y * W + x]) for (let yy = Math.max(0, y - R); yy <= Math.min(H - 1, y + R); yy++) mask[yy * W + x] = 1
      }
    }
    // the water's own pixels: the surface eroded 2 px
    const core = new Uint8Array(W * H)
    if (coreLim) {
      for (let y = 2; y < H - 2; y++) {
        for (let x = 2; x < W - 2; x++) {
          let all = true
          for (let yy = y - 2; yy <= y + 2 && all; yy++) {
            for (let xx = x - 2; xx <= x + 2; xx++) {
              if (!white(surf, yy * W + xx)) {
                all = false
                break
              }
            }
          }
          if (all) core[y * W + x] = 1
        }
      }
    }
    let prev = lum(load(dir, `${n}.0`))
    let worst = 0
    let all = 0
    let worstC = 0
    let allC = 0
    const fr = []
    for (let k = 1; k < SHIFTS; k++) {
      const cur = lum(load(dir, `${n}.${k}`))
      const S = STEP
      let bad = 0
      let badC = 0
      all = 0
      allC = 0
      for (let y = 2; y < H - 2; y++) {
        for (let x = 2; x < W - 2; x++) {
          const i = y * W + x
          if (!mask[i]) continue
          const pred = (1 - S) * (1 - S) * prev[i] + S * (1 - S) * (prev[i - 1] + prev[i - W]) + S * S * prev[i - W - 1]
          const b = Math.abs(cur[i] - pred) > ERR
          all++
          if (b) bad++
          if (core[i]) {
            allC++
            if (b) badC++
          }
        }
      }
      fr.push(bad / Math.max(1, all))
      worst = Math.max(worst, bad / Math.max(1, all))
      worstC = Math.max(worstC, badC / Math.max(1, allC))
      prev = cur
    }
    const good = all >= 5000 && worst < lim && (!coreLim || (allC >= 5000 && worstC < coreLim))
    if (!good) ok = false
    lines.push(
      `  ${n}: ${all} pixels; per pair ${fr.map(f => (f * 100).toFixed(3) + '%').join(' ')}; worst ${(worst * 100).toFixed(3)}%${coreLim ? `; the water's own ${allC} pixels: worst ${(worstC * 100).toFixed(3)}% (under ${(coreLim * 100).toFixed(1)}%)` : ''}${good ? '' : '  FAIL'}`,
    )
  }
  return { ok, lines }
}

// ---------- banks (W5a) ----------
// the default view at the three reaches and the sharpest bend at the closest zoom, the terrain alone (the ribbon and
// the scatter hidden), finished as drawn. Pixels classed from the raw data view: the wet line (0.05–0.3 m from the
// water), the cut bank's scarp (0.3–1.2 m from it, 0.3–1 m above it: a cut bank rises that fast), the bar (1–2.5 m, under 0.45 m above it), the meadow
// (8–12 m). Against the meadow's medians: the wet line darker by BANK_WET; the cut bank warmer (red over green) by
// BANK_EARTH and no lighter; the bar lighter by BANK_BAR and greyer (chroma) by BANK_GREY.
const BANK_WET = 0.05
const BANK_EARTH = 0.03
const BANK_BAR = 0.04
const BANK_GREY = 0.03
const BANK_MIN = 300
const bankViews = () => [...POOL_VIEWS, seamViews()[0]]
function banks(url, dir, sab) {
  const steps = [
    ...prepSteps(),
    sabStep(sab),
    ['eval', '__look.groundAs("terrain"); __look.terrainOnly(true); "terrain alone"'],
  ]
  for (const v of bankViews()) {
    steps.push(
      viewStep(v),
      ['eval', '__look.finishing(false); __look.waterView(4); "raw"'],
      render('raw'),
      ['shot', `${v[0]}.raw`],
      ['eval', '__look.waterView(0); __look.finishing(true); "frame"'],
      render('frame'),
      ['shot', `${v[0]}.frame`],
    )
  }
  shoot(url, dir, steps, W, H)
  const cls = { wet: [], cut: [], bar: [], meadow: [] }
  const [D0, D1] = SPEC.water.depth
  for (const [n] of bankViews()) {
    const raw = load(dir, `${n}.raw`)
    const fr = load(dir, `${n}.frame`)
    for (let i = 0; i < W * H; i++) {
      const land = -((raw.data[i * 4 + 1] / 255) * 2 - 1) * SDF
      const h = -(D0 + (raw.data[i * 4] / 255) * (D1 - D0))
      const k =
        land >= 0.05 && land <= 0.3
          ? 'wet'
          : land >= 0.3 && land <= 1.2 && h >= 0.3 && h <= 1
            ? 'cut'
            : land >= 1 && land <= 2.5 && h < 0.45
              ? 'bar'
              : land >= 8 && land <= 12
                ? 'meadow'
                : null
      if (k) cls[k].push([fr.data[i * 4] / 255, fr.data[i * 4 + 1] / 255, fr.data[i * 4 + 2] / 255])
    }
  }
  const med = (a, f) => pct(a.map(f), 0.5)
  const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  const rg = c => c[0] - c[1]
  const chroma = c => Math.max(...c) - Math.min(...c)
  const m = k => ({ l: med(cls[k], lum), rg: med(cls[k], rg), ch: med(cls[k], chroma) })
  const M = m('meadow')
  const wet = m('wet')
  const cut = m('cut')
  const bar = m('bar')
  const f = v => v.toFixed(3)
  const enough = Object.values(cls).every(a => a.length >= BANK_MIN)
  const okWet = wet.l <= M.l - BANK_WET
  const okCut = cut.rg >= M.rg + BANK_EARTH && cut.l <= M.l
  const okBar = bar.l >= M.l + BANK_BAR && bar.ch <= M.ch - BANK_GREY
  return {
    ok: enough && okWet && okCut && okBar,
    lines: [
      `banks: pixels by the data at ${bankViews().length} views: wet line ${cls.wet.length}, cut bank ${cls.cut.length}, bar ${cls.bar.length}, meadow ${cls.meadow.length}${enough ? '' : '  FAIL: too few'}`,
      `  meadow: luma ${f(M.l)}, red over green ${f(M.rg)}, chroma ${f(M.ch)}`,
      `  wet line: luma ${f(wet.l)} (darker by ≥ ${BANK_WET})${okWet ? '' : '  FAIL'}`,
      `  cut bank: red over green ${f(cut.rg)} (warmer by ≥ ${BANK_EARTH}), luma ${f(cut.l)} (no lighter)${okCut ? '' : '  FAIL'}`,
      `  bar: luma ${f(bar.l)} (lighter by ≥ ${BANK_BAR}), chroma ${f(bar.ch)} (greyer by ≥ ${BANK_GREY})${okBar ? '' : '  FAIL'}`,
    ],
  }
}

// ---------- foam (W5a) ----------
// up to FOAM_STONES stones in the water (the page's list), each at the closest zoom: the frame against the same frame
// without the stones' foam (WATER_SAB_NOFOAM). At points of the pillow (upstream, against the stone) and of the wake
// (1–5 radii downstream, within 2 radii across), projected at the water's level: pixels the foam brightens by over
// FOAM_LIFT. A stone shows its foam with at least FOAM_PILLOW such pillow points and FOAM_WAKE wake points; at least
// FOAM_SHARE of the stones must. Sabotage: no foam (the frame then equals the one without).
const FOAM_STONES = 5
const FOAM_LIFT = 0.12
const FOAM_PILLOW = 3
const FOAM_WAKE = 6
const FOAM_SHARE = 0.75
function foam(url, dir, sab) {
  const list = evalTag(
    shoot(url, dir, [...prepSteps(), ['eval', '"STONES " + JSON.stringify(STONES)']], 320, 180),
    'STONES',
  ).slice(0, FOAM_STONES)
  const pts = st => {
    const [x, z, r, ang] = st
    const fx = Math.cos(ang)
    const fz = Math.sin(ang)
    const out = []
    for (let a = -1.6; a <= 5; a += 0.2) {
      for (let b = -2; b <= 2; b += 0.2) {
        const kind = a <= -0.6 && Math.abs(b) <= 1.3 ? 'p' : a >= 1 && Math.abs(b) <= 2 ? 'w' : null
        if (!kind) continue
        out.push([x + (fx * a - fz * b) * r, z + (fz * a + fx * b) * r, kind])
      }
    }
    return out
  }
  const steps = [...prepSteps()]
  list.forEach((st, k) => {
    const P = pts(st)
    steps.push(
      viewStep([`stone${k}`, A0, CAM.betaMin, CAM.rMin, `${st[0]},${CAM.focusY},${st[1]}`, 0]),
      sabStep(sab),
      render('frame'),
      ['shot', `stone${k}.frame`],
      sabStep([...sab, 'WATER_SAB_NOFOAM']),
      render('nofoam'),
      ['shot', `stone${k}.nofoam`],
      sabStep(sab),
      [
        'eval',
        `(() => { const B = window.B, e = __proto.scene.getEngine(), T = __proto.scene.getTransformMatrix(), out = []
        for (const [x, z, kind] of ${JSON.stringify(P)}) { const q = riverQuery(x, z); if (!q) continue
          const s = B.Vector3.Project(new B.Vector3(x, lerpA(RIVER.zw, q), z), B.Matrix.IdentityReadOnly, T, { x: 0, y: 0, width: e.getRenderWidth(), height: e.getRenderHeight() })
          if (s.z > 0 && s.z < 1 && s.x >= 0 && s.y >= 0 && s.x < e.getRenderWidth() && s.y < e.getRenderHeight()) out.push([Math.floor(s.x), Math.floor(s.y), kind]) }
        return "PTS${k} " + JSON.stringify(out) })()`,
      ],
    )
  })
  const out = shoot(url, dir, steps, W, H)
  let shown = 0
  const lines = []
  list.forEach((st, k) => {
    const fr = load(dir, `stone${k}.frame`)
    const nf = load(dir, `stone${k}.nofoam`)
    const seen = new Set()
    const n = { p: 0, w: 0 }
    for (const [x, y, kind] of evalTag(out, `PTS${k}`)) {
      const i = y * W + x
      if (seen.has(i)) continue
      seen.add(i)
      if (lumaAt(fr, i) - lumaAt(nf, i) > FOAM_LIFT) n[kind]++
    }
    const good = n.p >= FOAM_PILLOW && n.w >= FOAM_WAKE
    if (good) shown++
    lines.push(
      `  stone ${k} (${st[0].toFixed(0)}, ${st[1].toFixed(0)}, r ${st[2].toFixed(2)} m): pillow ${n.p}, wake ${n.w}${good ? '' : '  (no foam)'}`,
    )
  })
  const ok = list.length >= 3 && shown >= FOAM_SHARE * list.length
  return {
    ok,
    lines: [
      `foam: ${list.length} stones in the water at the closest zoom; points the foam brightens by over ${FOAM_LIFT} (pillow ≥ ${FOAM_PILLOW}, wake ≥ ${FOAM_WAKE}); ${shown} show it (≥ ${FOAM_SHARE * 100}%)${ok ? '' : '  FAIL'}`,
      ...lines,
    ],
  }
}

// ---------- the seasons (W5b) ----------
// the pools check's reaches at a season: per reach the frame, the surface view and the river's samples on screen
// (PROJ_JS); then, with extra page steps per reach (more frames), each sample's 5×5 pixels where the water is what
// the camera sees, classed by the riffle there (pool ≤ POOL, riffle ≥ RIFFLE)
function seasonFrames(url, dir, sab, season, extra = () => []) {
  const views = POOL_VIEWS.map(v => [...v.slice(0, 5), season])
  const steps = [...prepSteps(), sabStep(sab)]
  for (const v of views) {
    steps.push(
      viewStep(v),
      ['eval', '__look.finishing(false); __look.waterView(6); "surface"'],
      render('surface'),
      ['shot', `${v[0]}.surface`],
      ['eval', PROJ_JS(`PROJ-${v[0]}`)],
      ['eval', '__look.waterView(0); __look.finishing(true); "frame"'],
      render('frame'),
      ['shot', `${v[0]}.frame`],
      ...extra(v[0]),
    )
  }
  const out = shoot(url, dir, steps, W, H)
  const px = []
  for (const [n] of views) {
    const surf = load(dir, `${n}.surface`)
    const seen = new Set()
    for (const [sx, sy, rf] of evalTag(out, `PROJ-${n}`)) {
      const k = rf <= POOL ? 'pool' : rf >= RIFFLE ? 'riffle' : null
      if (!k) continue
      for (let y = sy - 2; y <= sy + 2; y++) {
        for (let x = sx - 2; x <= sx + 2; x++) {
          const i = y * W + x
          if (!seen.has(i) && white(surf, i)) {
            seen.add(i)
            px.push([n, i, k])
          }
        }
      }
    }
  }
  return px
}
// winter (season 3): a pixel is ice when its luma is over ICE_LUMA (the ice, pale blue-grey with snow on it, against
// the open water, dark under the haze; set between the two from the first run: the pools' 10th percentile 0.60, the
// riffles' median 0.48). Pools at least WINTER_POOL ice, riffles at least WINTER_OPEN open. Sabotage: the ice even
// over the whole water, as in W4 (WATER_SAB_EVENICE)
const ICE_LUMA = 0.56
const WINTER_POOL = 0.8
const WINTER_OPEN = 0.6
function winter(url, dir, sab) {
  const px = seasonFrames(url, dir, sab, 3)
  const frames = {}
  const n = { pool: 0, riffle: 0 }
  const ice = { pool: 0, riffle: 0 }
  const L = { pool: [], riffle: [] }
  for (const [v, i, k] of px) {
    const f = (frames[v] ??= load(dir, `${v}.frame`))
    const l = lumaAt(f, i)
    n[k]++
    L[k].push(l)
    if (l > ICE_LUMA) ice[k]++
  }
  const sp = ice.pool / Math.max(1, n.pool)
  const so = 1 - ice.riffle / Math.max(1, n.riffle)
  const f = v => v.toFixed(3)
  const enough = n.pool >= 500 && n.riffle >= 500
  const okPool = sp >= WINTER_POOL
  const okOpen = so >= WINTER_OPEN
  return {
    ok: enough && okPool && okOpen,
    lines: [
      `winter: ${n.pool} pool pixels, ${n.riffle} riffle pixels at ${POOL_VIEWS.length} reaches; ice when luma over ${ICE_LUMA}${enough ? '' : '  FAIL: too few'}`,
      `  luma, 10th/50th/90th percentile: pools ${f(pct(L.pool, 0.1))}/${f(pct(L.pool, 0.5))}/${f(pct(L.pool, 0.9))}, riffles ${f(pct(L.riffle, 0.1))}/${f(pct(L.riffle, 0.5))}/${f(pct(L.riffle, 0.9))}`,
      `  pools frozen ${(sp * 100).toFixed(1)}% (≥ ${WINTER_POOL * 100}%)${okPool ? '' : '  FAIL'}; riffles open ${(so * 100).toFixed(1)}% (≥ ${WINTER_OPEN * 100}%)${okOpen ? '' : '  FAIL'}`,
    ],
  }
}
// leaves (season 1.5): each frame against the same without the leaves (WATER_SAB_NOLEAVES); a pixel shows a leaf
// when a channel moves by over LEAF_DIFF/255. Pools' share at least LEAF_MIN; riffles' at most LEAF_RIFFLE of the
// pools'. In summer (0) and winter (3), at the first reach, no pixel of the frame moves by over LEAF_OFF/255 (the
// two compilations may round differently). Sabotages: no leaves;
// leaves at any speed (WATER_SAB_LEAFALL)
const LEAF_DIFF = 20
const LEAF_MIN = 0.01
const LEAF_RIFFLE = 1 / 3
const LEAF_OFF = 2
const moved = (a, b, i) =>
  Math.max(
    Math.abs(a.data[i * 4] - b.data[i * 4]),
    Math.abs(a.data[i * 4 + 1] - b.data[i * 4 + 1]),
    Math.abs(a.data[i * 4 + 2] - b.data[i * 4 + 2]),
  )
function leaves(url, dir, sab) {
  const without = n => [
    sabStep([...sab, 'WATER_SAB_NOLEAVES']),
    render('without'),
    ['shot', `${n}.without`],
    sabStep(sab),
  ]
  const px = seasonFrames(url, dir, sab, 1.5, without)
  const fr = {}
  const n = { pool: 0, riffle: 0 }
  const lf = { pool: 0, riffle: 0 }
  for (const [v, i, k] of px) {
    fr[v] ??= [load(dir, `${v}.frame`), load(dir, `${v}.without`)]
    n[k]++
    if (moved(fr[v][0], fr[v][1], i) > LEAF_DIFF) lf[k]++
  }
  // summer and winter: the whole frame, with and without the leaves
  const off = []
  for (const season of [0, 3]) {
    const v = [...POOL_VIEWS[0].slice(0, 5), season]
    const tag = `s${season}`
    shoot(
      url,
      dir,
      [...prepSteps(), sabStep(sab), viewStep(v), render('with'), ['shot', `${tag}.with`], ...without(tag)],
      W,
      H,
    )
    const a = load(dir, `${tag}.with`)
    const b = load(dir, `${tag}.without`)
    let m = 0
    for (let i = 0; i < W * H; i++) if (moved(a, b, i) > LEAF_OFF) m++
    off.push([season, m])
  }
  const sp = lf.pool / Math.max(1, n.pool)
  const sr = lf.riffle / Math.max(1, n.riffle)
  const enough = n.pool >= 500 && n.riffle >= 500
  const okPool = sp >= LEAF_MIN
  const okRiffle = sr <= LEAF_RIFFLE * sp
  const okOff = off.every(([, m]) => m === 0)
  return {
    ok: enough && okPool && okRiffle && okOff,
    lines: [
      `leaves: ${n.pool} pool pixels, ${n.riffle} riffle pixels at ${POOL_VIEWS.length} reaches in autumn (1.5); a leaf moves a channel by over ${LEAF_DIFF}/255${enough ? '' : '  FAIL: too few'}`,
      `  pools ${(sp * 100).toFixed(2)}% (≥ ${LEAF_MIN * 100}%)${okPool ? '' : '  FAIL'}; riffles ${(sr * 100).toFixed(2)}% (≤ ${(LEAF_RIFFLE * 100).toFixed(0)}% of the pools')${okRiffle ? '' : '  FAIL'}`,
      `  pixels the leaves move in ${off.map(([s, m]) => `${s ? 'winter' : 'summer'} ${m}`).join(', ')} (none)${okOff ? '' : '  FAIL'}`,
    ],
  }
}

const CHECKS = { band, seam, pools, shimmer, banks, foam, winter, leaves }
// each check's sabotages (shader defines; the band's is the page's ?watersab=nodive)
const SABOTAGE = {
  band: [['nodive']],
  seam: [['WATER_SAB_OWN'], ['WATER_SAB_TERRAIN']],
  pools: [['WATER_SAB_FLAT']],
  shimmer: [['WATER_SAB_STEP']],
  banks: [['WATER_SAB_BANKS']],
  foam: [['WATER_SAB_NOFOAM']],
  winter: [['WATER_SAB_EVENICE']],
  leaves: [['WATER_SAB_NOLEAVES'], ['WATER_SAB_LEAFALL']],
}

function main() {
  const args = process.argv.slice(2)
  const self = args.includes('--selftest')
  const oi = args.indexOf('--only')
  const only = oi >= 0 ? args.splice(oi, 2)[1].split(',') : Object.keys(CHECKS)
  const [url0, out = path.join(ROOT, 'scratch/water-look-check')] = args.filter(a => a !== '--selftest')
  // the river and its banks measured under the pack's trees unless the URL names a set: the generated woods (the look
  // page's default, docs/plans/done/gen-trees-default.md) overhang the river and shade the bank's meadow samples, which
  // these checks were tuned without
  const url = url0 && !/[?&]trees=/.test(url0) ? url0 + (url0.includes('?') ? '&' : '?') + 'trees=pack' : url0
  if (!url || only.some(k => !CHECKS[k])) {
    console.error(
      'usage: node tools/water-look-check.mjs <look page URL> [outDir] [--only band,seam,pools,shimmer,banks,foam,winter,leaves] [--selftest]',
    )
    process.exit(2)
  }
  let ok = true
  for (const k of only) {
    const dir = path.join(out, k)
    fs.mkdirSync(dir, { recursive: true })
    const r = CHECKS[k](url, dir, [])
    for (const l of r.lines) console.log(l)
    console.log(`${k}: ${r.ok ? 'ok' : 'FAILED'}`)
    if (!r.ok) ok = false
    if (!self) continue
    for (const defs of SABOTAGE[k]) {
      const sdir = path.join(out, 'sabotage', defs.join('-'))
      fs.mkdirSync(sdir, { recursive: true })
      const s = CHECKS[k](url, sdir, defs)
      for (const l of s.lines) console.log('  [sabotage] ' + l)
      console.log(
        `${k} with ${defs.join(' ')}: ${s.ok ? 'PASSED (the check cannot see this sabotage)' : 'fails, as it must'}`,
      )
      if (s.ok) ok = false
    }
  }
  console.log(ok ? 'water-look-check: ok' : 'water-look-check: FAILED')
  process.exit(ok ? 0 : 1)
}
try {
  main()
} catch (e) {
  console.error('water-look-check.mjs:', e.message)
  process.exit(1)
}
