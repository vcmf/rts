// River acceptance checks (plans/w1-river-shape.md, design.md §6c), evaluated inside the page.
// Run: node tools/shot.mjs prototypes/painted-cinematic.html renders/tmp 800 600 \
//        "$(python3 -c 'import json;print(json.dumps([["eval",open("tools/river-check.js").read()]]))')"
// Prints the measurements; every failed limit is a console.error, so shot.mjs exits non-zero.
// Uses the page's own helpers (H, baseH, riverQuery, placeable, footprint, groups) and reads the drawn meshes
// (far terrain triangles, water vertices) instead of re-deriving their formulas.
(() => {
  const C = RIVER, r = {}, fail = []
  const check = (name, ok, value) => { r[name] = value; if (!ok) fail.push(`${name}=${JSON.stringify(value)}`) }

  // 1. formation zones and the central hill are untouched by the valley and channel
  let lowered = 0
  for (let x = -50; x <= 50; x += 1) for (let z = -60; z <= 40; z += 1) if (KEEP_CLEAR(x, z) && baseH(x, z) - H(x, z) > 0.01) lowered++   // covers all three zones
  check('keepClearLowered', lowered === 0, lowered)
  const hillDrop = Math.max(baseH(0, 6) - H(0, 6), baseH(-15, 6) - H(-15, 6))
  check('hillDrop', hillDrop < 0.05, +hillDrop.toFixed(2))

  // 2. nothing in the water except stones: every instance's footprint (crown/body) clears the water,
  //    passes the placement rule as placed, and stays out of the formation zones
  let wet = 0, ruleBroken = 0, inZone = 0
  const overlapsWater = (x, z, r) => { const q = riverQuery(x, z); return q && q.dist < lerpA(C.W, q) / 2 + r }
  for (const [model, items] of Object.entries(groups)) {
    const stone = /^Rock/.test(model)
    for (const [x, z, sc] of items) {
      const r = footprint(model, sc)
      if (KEEP_CLEAR(x, z)) inZone++
      if (stone) continue
      if (overlapsWater(x, z, r)) wet++
      if (!placeable(x, z, r)) ruleBroken++
    }
  }
  for (const [x, z, sc] of FAR) { const r = footprint('Bush_1', sc); if (overlapsWater(x, z, r)) wet++; if (!placeable(x, z, r)) ruleBroken++ }
  check('instancesOverWater', wet === 0, wet)
  check('instancesBreakingRule', ruleBroken === 0, ruleBroken)
  check('instancesInZones', inZone === 0, inZone)

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

  // 5. no floating water. Detailed tile: both banks (1.6 half-widths out) are at or above the water.
  //    Far ring: the ribbon is draped on the far surface by construction, so only the detailed tile is measured.
  let floating = 0, worst = 0
  const detailed = (x, z) => Math.abs(x) < SMW / 2 && Math.abs(z) < SMW / 2
  for (let i = 0; i < C.n; i += 2) for (const side of [-1, 1]) {
    const off = C.W[i] / 2 * 1.6, x = C.px[i] - C.tz[i] * side * off, z = C.pz[i] + C.tx[i] * side * off
    if (!detailed(C.px[i], C.pz[i]) || !detailed(x, z)) continue
    const d = C.zw[i] - H(x, z); if (d > 0.05) { floating++; worst = Math.max(worst, d) }
  }
  check('floatingBankSamples', floating === 0, floating)
  r.floatingWorst = +worst.toFixed(2)

  // 6. the water mesh is valid (one non-finite vertex breaks its bounds and culls the whole river)
  const wm = scene.getMeshByName('water'), wp = wm.getVerticesData(B.VertexBuffer.PositionKind)
  let bad = 0; for (const v of wp) if (!Number.isFinite(v)) bad++
  check('waterNonFinite', bad === 0, bad)
  // 7. the river stays visible on the far ring, tested against the triangles actually drawn
  //    (inner water vertices above the far mesh) and flows downhill (centre column never rises > 0.3 m)
  const fm = scene.meshes.filter(m => m.name === 't').find(m => m.getBoundingInfo().boundingBox.extendSize.x > SMW)
  const fpos = fm.getVerticesData(B.VertexBuffer.PositionKind), fidx = fm.getIndices(), CELLF = 2600 / 170, tris = new Map()
  for (let k = 0; k < fidx.length; k += 3) { const a = fidx[k] * 3, b = fidx[k + 1] * 3, c = fidx[k + 2] * 3
    const key = Math.floor((fpos[a] + fpos[b] + fpos[c]) / 3 / CELLF) * 4096 + Math.floor((fpos[a + 2] + fpos[b + 2] + fpos[c + 2]) / 3 / CELLF)
    if (!tris.has(key)) tris.set(key, []); tris.get(key).push([a, b, c]) }
  const drawnH = (x, z) => { const t = tris.get(Math.floor(x / CELLF) * 4096 + Math.floor(z / CELLF)) || []
    for (const [a, b, c] of t) { const x1 = fpos[a], z1 = fpos[a + 2], x2 = fpos[b], z2 = fpos[b + 2], x3 = fpos[c], z3 = fpos[c + 2]
      const d = (z2 - z3) * (x1 - x3) + (x3 - x2) * (z1 - z3), l1 = ((z2 - z3) * (x - x3) + (x3 - x2) * (z - z3)) / d, l2 = ((z3 - z1) * (x - x3) + (x1 - x3) * (z - z3)) / d, l3 = 1 - l1 - l2
      if (l1 >= -1e-6 && l2 >= -1e-6 && l3 >= -1e-6) return l1 * fpos[a + 1] + l2 * fpos[b + 1] + l3 * fpos[c + 1] }
    return -Infinity }
  let hidden = 0, tested = 0, rises = 0, prev = null
  for (let k = 0; k < wp.length; k += 3) { const x = wp[k], z = wp[k + 2]; if (detailed(x, z) || Math.abs(x) > 1290 || Math.abs(z) > 1290) { if ((k / 3) % 13 === 6) prev = null; continue }
    const col = (k / 3) % 13
    if (col >= 3 && col <= 9) { tested++; if (wp[k + 1] < drawnH(x, z)) hidden++ }
    if (col === 6) { if (prev !== null && wp[k + 1] > prev + 0.3) rises++; prev = wp[k + 1] } }
  check('farHidden', hidden === 0, `${hidden}/${tested}`)
  check('farUphillSteps', rises === 0, rises)

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
