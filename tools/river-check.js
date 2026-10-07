// River acceptance checks (plans/w1-river-shape.md, design.md §6c), evaluated inside the page.
// Run: node tools/shot.mjs prototypes/painted-cinematic.html renders/tmp 800 600 \
//        "$(python3 -c 'import json;print(json.dumps([["eval",open("tools/river-check.js").read()]]))')"
// Prints the measurements; every failed limit is a console.error, so shot.mjs exits non-zero.
// Uses the page's own helpers (H, baseH, riverQuery, placeable, footprint, groups) and reads the drawn meshes
// (water vertices) instead of re-deriving their formulas.
(() => {
  const C = RIVER, r = {}, fail = []
  const check = (name, ok, value) => { r[name] = value; if (!ok) fail.push(`${name}=${JSON.stringify(value)}`) }

  // 1. formation zones and the central hill are untouched by the valley and channel
  let lowered = 0
  for (let x = -50; x <= 50; x += 1) for (let z = -60; z <= 40; z += 1) if (KEEP_CLEAR(x, z) && baseH(x, z) - H(x, z) > 0.01) lowered++   // covers all three zones
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
  // bank trees exist: design.md §6c asks for a broken line of willows along the banks near the scene
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

  // 4. width: 5–8 m of water, narrower at bends than in straight reaches (design.md §6c)
  let wmin = Infinity, wmax = 0, bendW = 0, bendN = 0, strW = 0, strN = 0
  for (let i = 0; i < C.n; i++) { const w = C.W[i], b = Math.min(1, Math.abs(C.kappa[i]) * C.P.W0 * 2.3)
    wmin = Math.min(wmin, w); wmax = Math.max(wmax, w); if (b > 0.7) { bendW += w; bendN++ } else if (b < 0.3) { strW += w; strN++ } }
  check('widthRange', wmin >= 4.99 && wmax <= 8.01, [+wmin.toFixed(2), +wmax.toFixed(2)])
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
  // 7. the water lives only in the detailed tile, and never rises downstream (centre column, whole ribbon)
  let outside = 0, rises = 0, prev = null
  for (let k = 0; k < wp.length; k += 3) { const col = (k / 3) % 13
    if (!detailed(wp[k], wp[k + 2])) outside++
    if (col === 6) { if (prev !== null && wp[k + 1] > prev + 0.001) rises++; prev = wp[k + 1] } }
  check('waterOutsideTile', outside === 0, outside)
  check('uphillSteps', rises === 0, rises)

  // 7a. the far ring never covers the tile: sampled every 2 m over the tile, its drawn surface stays below the tile's
  //     (replaces the old far-hidden check, from both meshes' real triangle heights); and along the tile edge it is
  //     never above the tile edge (the apron stitches the two edges above it)
  let farOver = 0, edgeSlit = 0
  const half = SMW / 2
  for (let x = -half + 1; x < half; x += 2) for (let z = -half + 1; z < half; z += 2)
    if (farGround.getHeightAtCoordinates(x, z) > tileGround.getHeightAtCoordinates(x, z) - 0.05) farOver++
  for (let t = -half; t <= half; t += 0.5) for (const [x, z] of [[t, -half], [t, half], [-half, t], [half, t]]) {
    const xi = Math.max(-half + 1e-3, Math.min(half - 1e-3, x)), zi = Math.max(-half + 1e-3, Math.min(half - 1e-3, z))
    if (farGround.getHeightAtCoordinates(xi, zi) > tileGround.getHeightAtCoordinates(xi, zi) + 0.01) edgeSlit++ }
  check('farOverTile', farOver === 0, farOver)
  check('edgeSlit', edgeSlit === 0, edgeSlit)
  // 7b. the apron is stitched: its inner row lies on the tile surface, its outer row on the far ring
  const ap = scene.getMeshByName('apron').getVerticesData(B.VertexBuffer.PositionKind), clampIn = v => Math.max(-half + 1e-3, Math.min(half - 1e-3, v))
  let unstitched = 0
  for (let k = 0; k < ap.length; k += 6) {
    if (Math.abs(ap[k + 1] - tileGround.getHeightAtCoordinates(clampIn(ap[k]), clampIn(ap[k + 2]))) > 0.01) unstitched++
    if (Math.abs(ap[k + 4] - farGround.getHeightAtCoordinates(ap[k + 3], ap[k + 5])) > 0.01) unstitched++ }
  check('apronUnstitched', unstitched === 0, unstitched)

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
