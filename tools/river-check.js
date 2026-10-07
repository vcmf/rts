// River acceptance checks (plans/w1-river-shape.md, design.md §6c), evaluated inside the page.
// Run: node tools/shot.mjs prototypes/painted-cinematic.html renders/tmp 800 600 \
//        "$(python3 -c 'import json;print(json.dumps([["eval",open("tools/river-check.js").read()]]))')"
// Prints the measurements; every failed limit is a console.error, so shot.mjs exits non-zero.
// Uses the page's own helpers (H, baseH, riverQuery, farRingH, placeable, groups): no copied formulas.
(() => {
  const C = RIVER, r = {}, fail = []
  const check = (name, ok, value) => { r[name] = value; if (!ok) fail.push(`${name}=${JSON.stringify(value)}`) }

  // 1. formation zones and the central hill are untouched by the valley and channel
  let lowered = 0
  for (let x = -40; x <= 40; x += 1) for (let z = -60; z <= 40; z += 1) if (KEEP_CLEAR(x, z) && baseH(x, z) - H(x, z) > 0.01) lowered++
  check('keepClearLowered', lowered === 0, lowered)
  const hillDrop = Math.max(baseH(0, 6) - H(0, 6), baseH(-15, 6) - H(-15, 6))
  check('hillDrop', hillDrop < 0.05, +hillDrop.toFixed(2))

  // 2. nothing in the water or on the wet bank except stones (every scatter group + far woods)
  let wet = 0
  const inWater = (x, z) => { const q = riverQuery(x, z); return q && q.dist < lerpA(C.W, q) / 2 * 1.7 }
  for (const [model, items] of Object.entries(groups)) if (!/^Rock/.test(model)) for (const [x, z] of items) if (inWater(x, z)) wet++
  for (const [x, z] of FAR) if (inWater(x, z)) wet++
  check('instancesInWater', wet === 0, wet)

  // 3. bends turn back (samples moving against the overall flow), also near the scene
  const dir = Math.sign(C.pz[C.n - 1] - C.pz[0]); let back = 0, backNear = 0
  for (let i = 1; i < C.n; i++) if ((C.pz[i] - C.pz[i - 1]) * dir < 0) { back++; if (Math.abs(C.pz[i]) < 200) backNear++ }
  check('backtrack', back >= 100, back)
  check('backtrackNear', backNear >= 10, backNear)

  // 4. pools and riffles alternate smoothly
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
  // 7. the river stays visible on the far ring: the drawn ribbon sits above the far surface
  let hidden = 0, tested = 0
  for (let k = 0; k < wp.length; k += 3) { const f = farRingH(wp[k], wp[k + 2]); if (!isFinite(f) || detailed(wp[k], wp[k + 2])) continue
    const col = (k / 3) % 13; if (col < 3 || col > 9) continue   // inner water columns only (outer ones dive on purpose)
    tested++; if (wp[k + 1] < f) hidden++ }
  check('farHidden', hidden === 0, `${hidden}/${tested}`)

  // 8. the channel stays inside its floodplain (else the carve trenches the valley side)
  let edge = 0; for (let i = 0; i < C.n; i++) edge = Math.max(edge, Math.abs(C.px[i] - C.axisX(C.pz[i])) + C.W[i] / 2)
  check('channelEdge', edge < C.P.floodplainW / 2 - 1, `${edge.toFixed(1)} / ${C.P.floodplainW / 2}`)

  r.buildMs = Math.round(window.__buildMs)
  if (fail.length) console.error('river-check FAILED: ' + fail.join(', '))
  return JSON.stringify(r)
})()
