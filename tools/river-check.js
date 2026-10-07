// River acceptance checks (plans/w1-river-shape.md, design.md §6c), evaluated inside the page.
// Run: node tools/shot.mjs prototypes/painted-cinematic.html renders/tmp 800 600 \
//        "$(python3 -c 'import json;print(json.dumps([["eval",open("tools/river-check.js").read()]]))')"
// Prints the measurements; every failed limit is a console.error, so shot.mjs exits non-zero.
// Uses the page's own helpers (H, baseH, riverQuery, placeable, footprint, groups) and reads the drawn meshes
// (far ring + corridor triangles, water vertices) instead of re-deriving their formulas.
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
    if (KEEP_CLEAR(x, z)) inZone++
    if (/^Rock/.test(model)) { const q = riverQuery(x, z); if (q && q.dist < lerpA(C.W, q) / 2 && lerpA(C.riffle, q) <= 0.6) stonesInPools++; continue }
    if (overlapsWater(x, z, footprint(model, sc))) wet++
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
  //    and the corridor strip both draw carve(), so H() is the drawn surface at those points.
  let floating = 0, worst = 0
  const detailed = (x, z) => Math.abs(x) < SMW / 2 && Math.abs(z) < SMW / 2
  for (let i = 0; i < C.n; i += 2) { if (Math.abs(C.px[i]) > 1250 || Math.abs(C.pz[i]) > 1250) continue
    for (const side of [-1, 1]) {
      const off = C.W[i] / 2 * 1.6, x = C.px[i] - C.tz[i] * side * off, z = C.pz[i] + C.tx[i] * side * off
      const d = C.zw[i] - H(x, z); if (d > 0.05) { floating++; worst = Math.max(worst, d) } } }
  check('floatingBankSamples', floating === 0, floating)
  r.floatingWorst = +worst.toFixed(2)

  // 6. the water mesh is valid (one non-finite vertex breaks its bounds and culls the whole river)
  const wm = scene.getMeshByName('water'), wp = wm.getVerticesData(B.VertexBuffer.PositionKind)
  let bad = 0; for (const v of wp) if (!Number.isFinite(v)) bad++
  check('waterNonFinite', bad === 0, bad)
  // 7. outside the detailed tile the river stays visible: no drawn triangle (far ring or corridor) above an inner
  //    water vertex. And the water never rises downstream: centre column over the whole river, seams included.
  const CELLF = 8, tris = new Map(), surf = []
  for (const m of scene.meshes) if (m.name === 'corridor' || (m.name === 't' && m.getBoundingInfo().boundingBox.extendSize.x > SMW)) {
    const fp = m.getVerticesData(B.VertexBuffer.PositionKind), fi = m.getIndices(), si = surf.push(fp) - 1
    for (let k = 0; k < fi.length; k += 3) { const a = fi[k] * 3, b = fi[k + 1] * 3, c = fi[k + 2] * 3
      const x0 = Math.floor(Math.min(fp[a], fp[b], fp[c]) / CELLF), x1 = Math.floor(Math.max(fp[a], fp[b], fp[c]) / CELLF)
      const z0 = Math.floor(Math.min(fp[a + 2], fp[b + 2], fp[c + 2]) / CELLF), z1 = Math.floor(Math.max(fp[a + 2], fp[b + 2], fp[c + 2]) / CELLF)
      if ((x1 - x0) * (z1 - z0) > 64) continue   // skip only degenerate slivers
      for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) { const key = gx * 65536 + gz; if (!tris.has(key)) tris.set(key, []); tris.get(key).push([si, a, b, c]) } } }
  const drawnH = (x, z) => { let best = -Infinity
    for (const [si, a, b, c] of tris.get(Math.floor(x / CELLF) * 65536 + Math.floor(z / CELLF)) || []) { const f = surf[si]
      const x1 = f[a], z1 = f[a + 2], x2 = f[b], z2 = f[b + 2], x3 = f[c], z3 = f[c + 2], d = (z2 - z3) * (x1 - x3) + (x3 - x2) * (z1 - z3)
      if (Math.abs(d) < 1e-9) continue
      const l1 = ((z2 - z3) * (x - x3) + (x3 - x2) * (z - z3)) / d, l2 = ((z3 - z1) * (x - x3) + (x1 - x3) * (z - z3)) / d, l3 = 1 - l1 - l2
      if (l1 >= -1e-6 && l2 >= -1e-6 && l3 >= -1e-6) best = Math.max(best, l1 * f[a + 1] + l2 * f[b + 1] + l3 * f[c + 1]) }
    return best }
  let hidden = 0, tested = 0, rises = 0, prev = null
  for (let k = 0; k < wp.length; k += 3) { const x = wp[k], z = wp[k + 2], col = (k / 3) % 13
    if (col === 6) { if (prev !== null && wp[k + 1] > prev + 0.001) rises++; prev = wp[k + 1] }
    if (detailed(x, z) || Math.abs(x) > 1250 || Math.abs(z) > 1250 || col < 3 || col > 9) continue
    tested++; const dh = drawnH(x, z); if (wp[k + 1] < dh - 0.01) { hidden++; if (hidden <= 4) r['hid' + hidden] = [Math.round(x), Math.round(z), +(dh - wp[k + 1]).toFixed(2), col, +riverQuery(x, z).dist.toFixed(1)] } }
  check('farHidden', hidden === 0, `${hidden}/${tested}`)
  check('uphillSteps', rises === 0, rises)

  // 7b. no cliffs on the floodplain: outside the channel, the detailed terrain rises < 1.2 m per metre
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
