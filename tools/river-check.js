// River acceptance checks (docs/plans/done/w1-river-shape.md, docs/art-bible.md §6c), evaluated inside the page.
// Run: node tools/shot.mjs prototypes/painted-cinematic.html renders/tmp 800 600 \
//        "$(python3 -c 'import json;print(json.dumps([["eval",open("tools/river-check.js").read()]]))')"
// Prints the measurements; every failed limit is a console.error, so shot.mjs exits non-zero.
// Uses the page's own helpers (H, baseH, riverQuery, placeable, footprint, groups) and reads the drawn meshes
// (water vertices) instead of re-deriving their formulas.
(() => {
  const C = RIVER, r = {}, fail = []
  const check = (name, ok, value) => { r[name] = value; if (!ok) fail.push(`${name}=${JSON.stringify(value)}`) }

  // 1. formation zones and the central hill are untouched by the valley and channel. Sampled at the tile's grid
  //    nodes (TSUB cells over SMW, at the positions the mesh stores): there H is the authored height exactly, while
  //    between nodes the look page's H interpolates the heightfield and would count the hill's curvature as lowering
  let lowered = 0
  const node = k => Math.fround((k * SMW) / TSUB - SMW / 2), k0 = Math.floor((SMW / 2 - 60) * TSUB / SMW), k1 = Math.ceil((SMW / 2 + 50) * TSUB / SMW)
  for (let i = k0; i <= k1; i++) for (let j = k0; j <= k1; j++) { const x = node(i), z = node(j); if (KEEP_CLEAR(x, z) && baseH(x, z) - H(x, z) > 0.01) lowered++ }   // covers all three zones
  check('keepClearLowered', lowered === 0, lowered)
  const hillDrop = Math.max(baseH(0, 6) - H(0, 6), baseH(-15, 6) - H(-15, 6))
  check('hillDrop', hillDrop < 0.05, +hillDrop.toFixed(2))

  // 2. nothing in the water except stones: every instance's footprint (exact reach from its pivot) clears the
  //    water and stays out of the formation zones; stones only on dry land or riffles; fields off the floodplain
  let wet = 0, inZone = 0, stonesInPools = 0, wheatOnFloodplain = 0
  const overlapsWater = (x, z, r) => { const q = riverQuery(x, z); return q && q.dist < lerpA(C.W, q) / 2 + r }
  for (const [model, items] of Object.entries(groups)) for (const [x, z, sc] of items) {
    const fp = footprint(model, sc)
    if (touchesZone(x, z, fp)) inZone++
    if (/^Rock/.test(model)) { const q = riverQuery(x, z); if (q && q.dist < lerpA(C.W, q) / 2 + fp && lerpA(C.riffle, q) <= 0.6) stonesInPools++; continue }
    if (overlapsWater(x, z, fp)) wet++
    if (model === 'Wheat' && Math.abs(x - C.axisX(z)) < C.P.floodplainW / 2) wheatOnFloodplain++
  }
  for (const [x, z, sc] of FAR) if (overlapsWater(x, z, footprint('Bush_1', sc))) wet++
  check('instancesOverWater', wet === 0, wet)
  check('instancesInZones', inZone === 0, inZone)
  check('stonesInPools', stonesInPools === 0, stonesInPools)
  check('wheatOnFloodplain', wheatOnFloodplain === 0, wheatOnFloodplain)
  // bank trees exist: docs/art-bible.md §6c asks for a broken line of willows along the banks near the scene
  const willows = Object.entries(groups).filter(([m]) => /^Willow/.test(m)).reduce((a, [, v]) => a + v.length, 0)
  check('willows', willows >= 12, willows)

  // the scene is populated (guards every "nothing in X" check above against passing on an empty scene)
  const count = re => Object.entries(groups).filter(([m]) => re.test(m)).reduce((a, [, v]) => a + v.length, 0)
  const pop = { trees: count(/Tree/), grass: count(/Grass|Flowers|Plant/), wheat: count(/Wheat/), bushes: count(/Bush/), far: FAR.length }
  check('population', pop.trees >= 60 && pop.grass >= 2000 && pop.wheat >= 150 && pop.bushes >= 30 && pop.far >= 400, pop)

  // 3. bends turn back (samples moving against the overall flow), also near the scene
  const dir = Math.sign(C.pz[C.n - 1] - C.pz[0]); let back = 0, backNear = 0
  for (let i = 1; i < C.n; i++) if ((C.pz[i] - C.pz[i - 1]) * dir < 0) { back++; if (Math.abs(C.pz[i]) < 200) backNear++ }
  check('backtrack', back >= 100, back)
  check('backtrackNear', backNear >= 10, backNear)

  // 4. width: 4–11 m of water, narrower at bends than in straight reaches, visibly varied (docs/art-bible.md §6c)
  let wmin = Infinity, wmax = 0, bendW = 0, bendN = 0, strW = 0, strN = 0
  for (let i = 0; i < C.n; i++) { const w = C.W[i], b = Math.min(1, Math.abs(C.kappa[i]) * C.P.W0 * 2.3)
    wmin = Math.min(wmin, w); wmax = Math.max(wmax, w); if (b > 0.7) { bendW += w; bendN++ } else if (b < 0.3) { strW += w; strN++ } }
  check('widthRange', wmin >= 3.99 && wmax <= 11.01, [+wmin.toFixed(2), +wmax.toFixed(2)])
  // stretches differ (the owner's complaint): width averaged over one bend wavelength (~11 W0, ±22 samples), widest stretch
  // vs narrowest in the tile. Pointwise percentiles would pass on the bend/straight alternation alone.
  const inTileIdx = []; for (let i = 0; i < C.n; i++) if (Math.abs(C.px[i]) < SMW / 2 && Math.abs(C.pz[i]) < SMW / 2) inTileIdx.push(i)
  const avgs = []; for (let k = 22; k < inTileIdx.length - 22; k += 5) { let a = 0; for (let j = -22; j <= 22; j++) a += C.W[inTileIdx[k + j]]; avgs.push(a / 45) }
  if (avgs.length < 10) check('stretchContrast', false, `only ${avgs.length} stretches in the tile`)
  else check('stretchContrast', Math.max(...avgs) / Math.min(...avgs) >= 1.7, [+Math.min(...avgs).toFixed(2), +Math.max(...avgs).toFixed(2)])
  // width changes smoothly along the river (a per-sample jump notches both banks)
  let wstep = 0; for (let i = 1; i < C.n; i++) wstep = Math.max(wstep, Math.abs(C.W[i] - C.W[i - 1]) / (C.s[i] - C.s[i - 1]))
  check('maxWidthStep', wstep < 0.25, +wstep.toFixed(3))
  check('bendNarrowerThanReach', bendW / bendN < strW / strN, [+(bendW / bendN).toFixed(2), +(strW / strN).toFixed(2)])

  // 4b. pools and riffles alternate smoothly
  let step = 0; for (let i = 1; i < C.n; i++) step = Math.max(step, Math.abs(C.riffle[i] - C.riffle[i - 1]))
  check('maxRiffleStep', step < 0.15, +step.toFixed(3))

  // 5. no floating water anywhere: both banks (1.6 half-widths out) are at or above the water. The detailed tile
  //    draws carve(), so H() is the drawn surface there (the far ring has no water).
  let floating = 0, worst = 0
  const detailed = (x, z) => Math.abs(x) < SMW / 2 && Math.abs(z) < SMW / 2
  for (let i = 0; i < C.n; i += 2) { if (!detailed(C.px[i], C.pz[i])) continue
    for (const side of [-1, 1]) {
      const off = C.W[i] / 2 * 1.6, x = C.px[i] - C.tz[i] * side * off, z = C.pz[i] + C.tx[i] * side * off
      const d = C.zw[i] - H(x, z); if (d > 0.05) { floating++; worst = Math.max(worst, d) } } }
  check('floatingBankSamples', floating === 0, floating)
  r.floatingWorst = +worst.toFixed(2)

  // 6. the water mesh is valid (one non-finite vertex breaks its bounds and culls the whole river)
  const wm = scene.getMeshByName('water'), wp = wm.getVerticesData(B.VertexBuffer.PositionKind)
  let bad = 0; for (const v of wp) if (!Number.isFinite(v)) bad++
  check('waterNonFinite', bad === 0, bad)
  // 7. the water never rises downstream (centre column), and inside the channel no water vertex sits below the bed
  //    (a dived column there would show the dry bed through the water)
  let rises = 0, prev = null, underBed = 0
  for (let k = 0; k < wp.length; k += 3) { const col = (k / 3) % 13
    const q = riverQuery(wp[k], wp[k + 2]), inChannel = q && q.dist < lerpA(C.W, q) / 2 - 0.3
    if (col === 6 && inChannel) { if (prev !== null && wp[k + 1] > prev + 0.001) rises++; prev = wp[k + 1] }   // clamped rows at the tile edge can put the centre on the bank (dived: not surface)
    if (inChannel && wp[k + 1] < H(wp[k], wp[k + 2]) - 0.01) underBed++ }
  check('uphillSteps', rises === 0, rises)
  check('waterUnderBed', underBed === 0, underBed)

  // 7a. the two grids meet exactly (no overlap, no slit, no T-junction): no far triangle inside the band; every apron
  //     vertex IS a tile or far vertex; every tile-edge vertex and every far vertex on the band line is used by the
  //     apron; and the apron's area equals the band's (no gap, no double cover)
  const half = SMW / 2, key = (x, z) => `${Math.round(x * 1000)},${Math.round(z * 1000)}`
  const verts = g => { const p = g.getVerticesData(B.VertexBuffer.PositionKind), m = new Map(); for (let k = 0; k < p.length; k += 3) m.set(key(p[k], p[k + 2]), p[k + 1]); return m }
  const tv = verts(tileGround), fv = verts(farGround)
  const fp = farGround.getVerticesData(B.VertexBuffer.PositionKind), fi = farGround.getIndices()
  let farInBand = 0
  for (let t = 0; t < fi.length; t += 3) { const cx = (fp[fi[t] * 3] + fp[fi[t + 1] * 3] + fp[fi[t + 2] * 3]) / 3, cz = (fp[fi[t] * 3 + 2] + fp[fi[t + 1] * 3 + 2] + fp[fi[t + 2] * 3 + 2]) / 3
    if (Math.max(Math.abs(cx), Math.abs(cz)) < BAND) farInBand++ }
  const apron = scene.getMeshByName('apron'), ap = apron.getVerticesData(B.VertexBuffer.PositionKind), ai = apron.getIndices()
  let foreign = 0, area = 0; const used = new Set()
  for (let k = 0; k < ap.length; k += 3) { const id = key(ap[k], ap[k + 2]), y = tv.has(id) ? tv.get(id) : fv.get(id)
    if (y === undefined || Math.abs(y - ap[k + 1]) > 1e-4) foreign++; used.add(id) }
  for (let t = 0; t < ai.length; t += 3) { const a = ai[t] * 3, b = ai[t + 1] * 3, c = ai[t + 2] * 3
    area += Math.abs((ap[b] - ap[a]) * (ap[c + 2] - ap[a + 2]) - (ap[c] - ap[a]) * (ap[b + 2] - ap[a + 2])) / 2 }
  let unused = 0
  for (const [m, line] of [[tv, half], [fv, BAND]]) for (const id of m.keys()) { const [x, z] = id.split(',').map(v => v / 1000)
    if (Math.abs(Math.max(Math.abs(x), Math.abs(z)) - line) < 1e-3 && !used.has(id)) unused++ }
  check('farInBand', farInBand === 0, farInBand)
  check('apronForeignVerts', foreign === 0, foreign)
  check('apronUnusedEdgeVerts', unused === 0, unused)
  const bandArea = (2 * BAND) ** 2 - SMW ** 2
  check('apronArea', Math.abs(area - bandArea) < 1, [Math.round(area), Math.round(bandArea)])

  // 7c. no cliffs on the floodplain: outside the channel, the detailed terrain rises < 1.2 m per metre
  let cliffs = 0, steepest = 0
  for (let i = 0; i < C.n; i += 3) { if (!detailed(C.px[i], C.pz[i])) continue
    for (let a = -30; a <= 30; a += 1) { const x = C.px[i] - C.tz[i] * a, z = C.pz[i] + C.tx[i] * a, q = riverQuery(x, z)
      if (!detailed(x, z) || (q && q.dist < lerpA(C.W, q) / 2 * 1.05)) continue
      for (const [dx, dz] of [[1, 0], [0, 1]]) { const g = Math.abs(H(x + dx, z + dz) - H(x, z)); steepest = Math.max(steepest, g); if (g > 1.2) cliffs++ } } }
  check('cliffs', cliffs === 0, cliffs)
  r.steepestPerMetre = +steepest.toFixed(2)

  // 8. the channel stays inside its floodplain (else the carve trenches the valley side)
  let edge = 0; for (let i = 0; i < C.n; i++) edge = Math.max(edge, Math.abs(C.px[i] - C.axisX(C.pz[i])) + C.W[i] / 2)
  check('channelEdge', edge < C.P.floodplainW / 2 - 1, `${edge.toFixed(1)} / ${C.P.floodplainW / 2}`)

  r.buildMs = Math.round(window.__buildMs)
  if (fail.length) console.error('river-check FAILED: ' + fail.join(', '))
  return JSON.stringify(r)
})()
