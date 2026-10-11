// The water data's checks (docs/plans/done/w3-water-data.md, W3): the bake in the committed look data against the
// authoring step, and the page's texture against the bake.
//
//   node tools/water-check.mjs                          the bake (Node only)
//   node tools/water-check.mjs <look page URL> [outDir] the bake, the page, and the debug views' screenshots
//   ... --selftest                                      each check passes, and fails on its sabotage
//
// - bake: in twelve 48 m regions along the river (the play area's sharpest bend and eleven others, seeded), at random
//   points read bilinearly from the decoded data as the GPU reads it:
//   - depth: against the exact depth at the four texel centres, read the same way: within half an encoding step
//     (placement and encoding exact); the error against the depth at the point itself is reported (the 0.5 m grid's);
//   - shore distance: within 1.5 m of the shore (where foam and the wet band will read it; farther out, bilinear reads
//     round the ridge midway between two shores), against a brute-force reference (the nearest of the shoreline's
//     points on the edges of a 0.125 m grid, each found by bisection): the largest error under SDF_MAX m, half an
//     encoding step (6.25 cm) and the shoreline's chords. Sabotage: the distance from the section's water's edge
//     (right where the section alone shapes the shore, wrong where the carve meets the trough);
//   - flow: over 1 m into the water, its direction against the river's at the point: 95th percentile under FLOW_P95°;
//   - against the drawn ground (reported for W4): the share of the data's wet texels where the drawn heightfield
//     stands above the water, and how far into the water the farthest of them lies.
// - page: the raw debug views (the texel's RGB, then its alpha) of the terrain alone at the closest zoom over the
//   sharpest bend, at points projected onto the drawn ground, against the decoded data: at most PAGE_BAD of them off
//   by over 3/255. Sabotage: the texture read upside down (WATER_SAB_FLIP).
// - views (with a URL, not gated): the depth, shore distance and flow views at three zooms, for the owner's eye.
// Frames are 1280×720. Exit 1 on a failure.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as png from './png.mjs'
import { CAMS } from './golden.mjs'
import { prepSteps, shoot, viewStep } from './look-page.mjs'
import { D, SPEC } from '../src/look/spec.ts'
import { mulberry } from '../src/look/noise.ts'
import { lerpA, riverQuery } from '../src/look/river.ts'
import { heightAt, setHeightfield } from '../src/look/heightfield.ts'
import { authorWorld } from '../src/look/world/author.ts'
import { checkLookData, decodeLook, unpackSpans } from '../src/look/world/data.ts'
import { DEPTH_STEP, WATER_FILL, bakeWater, decodeWater, packWater, sampleRGBA, shoreCrossing, waterAt, wetAt } from '../src/look/world/water-data.ts'
import { LOOK_FILE } from './build-look-data.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const W = 1280, H = 720, CAM = SPEC.camera, WS = SPEC.water
const [, A0, BETA0, R0] = CAMS.find(c => c[0] === 'start')
const SDF_MAX = 0.12, FLOW_P95 = 5, PAGE_BAD = 0.01, REGIONS = 12, REGION = 48, FINE = 0.125, SHORE = 1.5

let world = null, look = null
const setup = () => {
  world ??= authorWorld()
  if (!look) {
    const b = fs.readFileSync(LOOK_FILE); look = decodeLook(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))
    checkLookData(D, look)   // a file built for another spec fails here, not as odd errors below
    setHeightfield(look.hf, look.far, SPEC.tile / 2)
  }
}
const C = () => world.samples
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))] }
const inPlay = i => Math.abs(C().px[i]) < SPEC.play - 30 && Math.abs(C().pz[i]) < SPEC.play - 30
const sharpest = () => { let bi = -1; for (let i = 0; i < C().n; i++) if (inPlay(i) && (bi < 0 || Math.abs(C().A[i]) > Math.abs(C().A[bi]))) bi = i; return bi }

// ---------- bake ----------
function regions() {
  const r = mulberry(3), out = [sharpest()], lim = SPEC.tile / 2 - REGION
  while (out.length < REGIONS) { const i = Math.floor(r() * C().n); if (Math.abs(C().px[i]) < lim && Math.abs(C().pz[i]) < lim) out.push(i) }
  return out.map(i => [C().px[i], C().pz[i]])
}
// the reference water on a fine grid over a region: the depth and the wet flag at each node, and the zero contour's
// points along the grid's edges (between a wet and a dry node: where the depth crosses 0, or halfway where the carve's
// extent decides)
function fineRegion(cx, cz) {
  const m = Math.round(REGION / FINE) + 1, x0 = cx - REGION / 2, z0 = cz - REGION / 2, dep = new Float64Array(m * m), wet = new Uint8Array(m * m)
  for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) {
    const x = x0 + i * FINE, z = z0 + j * FINE, q = riverQuery(x, z)
    if (!q) { dep[j * m + i] = -9; continue }
    const w = waterAt(world.H, x, z, q); dep[j * m + i] = w.depth; wet[j * m + i] = w.wet ? 1 : 0
  }
  const pts = []
  const edge = (a, b, xa, za, xb, zb) => {
    if (wet[a] === wet[b]) return
    const t = shoreCrossing(world.H, xa, za, xb, zb, !!wet[a], 10)
    pts.push([xa + (xb - xa) * t, za + (zb - za) * t])
  }
  for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) {
    const k = j * m + i, x = x0 + i * FINE, z = z0 + j * FINE
    if (i + 1 < m) edge(k, k + 1, x, z, x + FINE, z)
    if (j + 1 < m) edge(k, k + m, x, z, x, z + FINE)
  }
  return { pts }
}

function bakeCheck(data, label) {
  setup()
  const n = D.waterN, cell = WS.texel, x0 = -SPEC.tile / 2, step = DEPTH_STEP, r = mulberry(5)
  const read = (x, z) => decodeWater(...sampleRGBA(data, n, cell, x0, x0, x, z))
  // the data's depth rule, independently: the depth where it is water, else at most a step below 0, in the range
  const exactAt = (x, z) => { const q = riverQuery(x, z); if (!q) return WS.depth[0]; const w = waterAt(world.H, x, z, q); return Math.max(WS.depth[0], Math.min(WS.depth[1], w.wet ? w.depth : Math.min(w.depth, -step))) }
  // the exact depth read bilinearly from the four texel centres around (x, z)
  const exactBilinear = (x, z) => {
    const u = (x - x0) / cell - 0.5, v = (z - x0) / cell - 0.5, i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j
    const c = (a, b) => exactAt(x0 + (a + 0.5) * cell, x0 + (b + 0.5) * cell)
    return (c(i, j) * (1 - fu) + c(i + 1, j) * fu) * (1 - fv) + (c(i, j + 1) * (1 - fu) + c(i + 1, j + 1) * fu) * fv
  }
  const depthErr = [], depthTrue = [], sdfErr = [], flowErr = []
  for (const [cx, cz] of regions()) {
    const { pts } = fineRegion(cx, cz)
    for (let k = 0; k < 2400; k++) {
      const x = cx + (r() - 0.5) * (REGION - 10), z = cz + (r() - 0.5) * (REGION - 10), q = riverQuery(x, z), got = read(x, z)
      depthErr.push(Math.abs(got.depth - exactBilinear(x, z)))
      if (q) { const d = waterAt(world.H, x, z, q).depth; if (d > WS.depth[0] && d < WS.depth[1]) depthTrue.push(Math.abs(got.depth - d)) }
      // the reference shore distance: the nearest contour point, signed by the water at the point
      let best = Infinity; for (const [px, pz] of pts) best = Math.min(best, (px - x) ** 2 + (pz - z) ** 2)
      const wet = wetAt(world.H, x, z), ref = (wet ? 1 : -1) * Math.sqrt(best)
      if (Math.abs(ref) < SHORE) sdfErr.push(Math.abs(got.sdf - ref))
      if (q && ref > 1 && Math.hypot(got.fx, got.fz) > 0.05) {
        const tx = lerpA(C().tx, q), tz = lerpA(C().tz, q)
        flowErr.push(Math.acos(Math.max(-1, Math.min(1, (got.fx * tx + got.fz * tz) / Math.hypot(got.fx, got.fz) / Math.hypot(tx, tz)))) * 180 / Math.PI)
      }
    }
  }
  const dMax = Math.max(...depthErr), sMax = Math.max(...sdfErr), fP95 = pct(flowErr, 0.95)
  const okD = dMax <= step / 2 + 1e-3, okS = sdfErr.length >= 1000 && sMax <= SDF_MAX, okF = flowErr.length >= 300 && fP95 < FLOW_P95
  const lines = [`bake (${label}): ${depthErr.length} points in ${REGIONS} regions of ${REGION} m`,
    `  depth: largest error against the exact depth read the same way ${(dMax * 100).toFixed(2)} cm (limit half a step, ${(step * 50).toFixed(2)} cm)${okD ? '' : '  FAIL'}; against the depth at the point, 95th percentile ${(pct(depthTrue, 0.95) * 100).toFixed(1)} cm, largest ${(Math.max(...depthTrue) * 100).toFixed(1)} cm (the 0.5 m grid's, reported)`,
    `  shore distance: ${sdfErr.length} points within ${SHORE} m of the shore, error median ${(pct(sdfErr, 0.5) * 100).toFixed(1)} cm, 95th percentile ${(pct(sdfErr, 0.95) * 100).toFixed(1)} cm, 99th percentile ${(pct(sdfErr, 0.99) * 100).toFixed(1)} cm, largest ${(sMax * 100).toFixed(1)} cm (limit ${SDF_MAX * 100} cm; ${sdfErr.filter(e => e > SDF_MAX).length} over it)${okS ? '' : '  FAIL'}`,
    `  flow: ${flowErr.length} points over 1 m into the water, direction error median ${pct(flowErr, 0.5).toFixed(2)}°, 95th percentile ${fP95.toFixed(2)}° (limit ${FLOW_P95}°)${okF ? '' : '  FAIL'}`]
  return { ok: okD && okS && okF, okD, okS, okF, lines }
}

// the drawn ground against the data's water (reported for W4)
function drawnReport(data) {
  setup()
  const n = D.waterN, cell = WS.texel, x0 = -SPEC.tile / 2
  let wet = 0, above = 0, far = 0
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const o = (j * n + i) * 4, w = decodeWater(data[o] / 255, data[o + 1] / 255, data[o + 2] / 255, data[o + 3] / 255)
    if (w.sdf <= 0) continue
    wet++
    const x = x0 + (i + 0.5) * cell, z = x0 + (j + 0.5) * cell, q = riverQuery(x, z)
    if (q && lerpA(C().zw, q) - heightAt(x, z) < 0) { above++; far = Math.max(far, w.sdf) }
  }
  return [`  against the drawn ground (for W4): ${above} of ${wet} wet texels (${(100 * above / wet).toFixed(1)}%) have the drawn heightfield above the water, the farthest ${far.toFixed(2)} m into it`]
}

// ---------- page ----------
const look$ = (view, sab) => ['eval', `(async () => { __look.terrainOnly(true); __look.finishing(false); __look.waterView(${view}, ${sab}); return "water view ${view}${sab ? ' flipped' : ''}" })()`]
function pageCheck(url, dir, sab, data) {
  setup()
  const bi = sharpest(), target = [C().px[bi], CAM.focusY, C().pz[bi]], r = mulberry(9), pts = []
  for (let k = 0; k < 600; k++) pts.push([C().px[bi] + (r() - 0.5) * 30, C().pz[bi] + (r() - 0.5) * 30])
  const steps = [...prepSteps(), viewStep(['water-raw', A0, CAM.betaMin, CAM.rMin, `${target}`, 0])]
  for (const v of [4, 5]) steps.push(look$(v, sab), ['eval', `(async () => { await __proto.scene.whenReadyAsync(true); for (let i = 0; i < 3; i++) __proto.scene.render(); return "rendered" })()`], ['shot', `raw${v}`])
  steps.push(['eval', `(() => { const B = window.B, e = __proto.scene.getEngine(), T = __proto.scene.getTransformMatrix(), w = e.getRenderWidth(), h = e.getRenderHeight()
    const out = ${JSON.stringify(pts)}.map(([x, z]) => { const s = B.Vector3.Project(new B.Vector3(x, H(x, z), z), B.Matrix.IdentityReadOnly, T, { x: 0, y: 0, width: w, height: h }); return [+s.x.toFixed(2), +s.y.toFixed(2)] })
    return "PROJ " + JSON.stringify(out) })()`])
  const out = shoot(url, dir, steps, W, H)
  const proj = JSON.parse(JSON.parse(`"${/^EVAL "PROJ (.*)"$/m.exec(out)[1]}"`)), rgb = png.read(fs.readFileSync(path.join(dir, 'raw4.png'))), alpha = png.read(fs.readFileSync(path.join(dir, 'raw5.png')))
  let seen = 0, bad = 0, worst = 0
  proj.forEach(([sx, sy], k) => {
    const px = Math.floor(sx), py = Math.floor(sy); if (px < 1 || py < 1 || px >= W - 1 || py >= H - 1) return
    seen++
    const o = (py * W + px) * 4, want = sampleRGBA(data, D.waterN, WS.texel, -SPEC.tile / 2, -SPEC.tile / 2, pts[k][0], pts[k][1]).map(v => v * 255)
    const got = [rgb.data[o], rgb.data[o + 1], rgb.data[o + 2], alpha.data[o]], e = Math.max(...got.map((g, c) => Math.abs(g - want[c])))
    worst = Math.max(worst, e); if (e > 3) bad++
  })
  const ok = seen >= 300 && bad <= PAGE_BAD * seen
  return { ok, lines: [`page${sab ? ' (texture flipped)' : ''}: ${seen} points on screen over the sharpest bend at the closest zoom, ${bad} off by over 3/255 (limit ${PAGE_BAD * 100}%), the largest ${worst.toFixed(1)}/255${ok ? '' : '  FAIL'}`] }
}

function views(url, dir) {
  setup()
  const bi = sharpest(), target = `${[C().px[bi], CAM.focusY, C().pz[bi]]}`, steps = [...prepSteps(), ['eval', '__look.finishing(false); "no finishing"']]
  for (const [v, name] of [[1, 'depth'], [2, 'sdf'], [3, 'flow']]) for (const rad of [CAM.rMin, R0, CAM.rMax]) {
    steps.push(viewStep([`${name}-r${Math.round(rad)}`, A0, BETA0, rad, target, 0]), ['eval', `__look.waterView(${v}); "${name}"`],
      ['eval', '(async () => { await __proto.scene.whenReadyAsync(true); for (let i = 0; i < 3; i++) __proto.scene.render(); return "rendered" })()'], ['shot', `view-${name}-r${Math.round(rad)}`])
  }
  shoot(url, dir, steps, W, H)
  return [`views: depth, sdf and flow at zooms ${CAM.rMin}, ${R0}, ${CAM.rMax} m in ${path.relative(ROOT, dir)}`]
}

function main() {
  const args = process.argv.slice(2), self = args.includes('--selftest'), pos = args.filter(a => !a.startsWith('--'))
  const [url, out = path.join(ROOT, 'scratch/water-check')] = pos
  fs.mkdirSync(out, { recursive: true })
  setup()
  const data = unpackSpans(look.water, WATER_FILL)
  let ok = true
  const report = (r, sabotage) => {
    for (const l of r.lines) console.log((sabotage ? '  [sabotage] ' : '') + l)
    if (sabotage) { console.log(r.ok ? '  the check PASSED its sabotage (it cannot see it)' : '  the sabotage fails, as it must'); if (r.ok) ok = false }
    else if (!r.ok) ok = false
  }
  report(bakeCheck(data, 'the committed data'))
  for (const l of drawnReport(data)) console.log(l)
  // each sabotage must fail its own part of the check
  if (self) for (const [sab, label, part] of [['centre', 'the shore distance from the section\'s water\'s edge', 'okS'], ['offset', 'texel centres half a texel off', 'okD'], ['upstream', 'the flow reversed', 'okF']]) {
    const r = bakeCheck(unpackSpans(packWater(bakeWater(world.H, sab)), WATER_FILL), label)
    report({ ok: r[part], lines: r.lines }, true)
  }
  if (url) {
    report(pageCheck(url, out, false, data))
    if (self) report(pageCheck(url, path.join(out, 'sabotage'), true, data), true)
    for (const l of views(url, path.join(out, 'views'))) console.log(l)
  }
  console.log(ok ? 'water-check: ok' : 'water-check: FAILED')
  process.exit(ok ? 0 : 1)
}
try { main() } catch (e) { console.error('water-check.mjs:', e.stack ?? e.message); process.exit(1) }
