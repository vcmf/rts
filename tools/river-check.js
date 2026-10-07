// Numeric acceptance checks for the river (W1), evaluated in the page: node tools/shot.mjs ... '[["eval", <this file>]]'
(() => {
  const C = RIVER, r = {}
  // 1. the trough and channel must not touch the formation zones or the central hill
  let lowered = 0, maxDrop = 0
  for (let x = -40; x <= 40; x += 1) for (let z = -60; z <= 40; z += 1) {
    const d = baseH(x, z) - H(x, z)
    if (KEEP_CLEAR(x, z) && d > 0.01) { lowered++; maxDrop = Math.max(maxDrop, d) }
  }
  r.keepClearLowered = lowered; r.keepClearMaxDrop = +maxDrop.toFixed(2)
  r.hill = [0, 6, -20, 6].reduce((a, _, i, v) => i % 2 ? a : a.concat(+(baseH(v[i], v[i + 1]) - H(v[i], v[i + 1])).toFixed(2)), [])
  // 2. houses stay dry
  r.housesInRiver = HOUSES.filter(([x, z]) => nearStream(x, z, 6 + 4)).length
  // 3. bends turn back: samples moving against the overall flow direction
  const dir = Math.sign(C.pz[C.n - 1] - C.pz[0]); let back = 0, backNear = 0
  for (let i = 1; i < C.n; i++) if ((C.pz[i] - C.pz[i - 1]) * dir < 0) { back++; if (Math.abs(C.pz[i]) < 200) backNear++ }
  r.backtrack = back; r.backtrackNear = backNear
  // 4. pool/riffle rhythm is smooth
  let step = 0; for (let i = 1; i < C.n; i++) step = Math.max(step, Math.abs(C.riffle[i] - C.riffle[i - 1])); r.maxRiffleStep = +step.toFixed(3)
  // 5. far ring: water above the coarse far terrain (bilinear over its 170-subdivision grid)
  const S = 2600, N = 170, cell = S / N
  const far = (x, z) => { const q = riverQuery(x, z); let h = carve(x, z, q) - 0.9; if (q && q.dist < lerpA(C.W, q) / 2 + 16) h = Math.min(h, lerpA(C.zw, q) - 0.8); return h }
  let hidden = 0, tested = 0
  for (let i = 0; i < C.n; i += 2) { const x = C.px[i], z = C.pz[i]; if (Math.abs(z) < 300 || Math.abs(z) > 1250 || Math.abs(x) > 1250) continue
    const gx = Math.floor((x + S / 2) / cell), gz = Math.floor((z + S / 2) / cell), fx = (x + S / 2) / cell - gx, fz = (z + S / 2) / cell - gz
    const X = k => k * cell - S / 2, h00 = far(X(gx), X(gz)), h10 = far(X(gx + 1), X(gz)), h01 = far(X(gx), X(gz + 1)), h11 = far(X(gx + 1), X(gz + 1))
    const h = h00 * (1 - fx) * (1 - fz) + h10 * fx * (1 - fz) + h01 * (1 - fx) * fz + h11 * fx * fz
    tested++; if (h > C.zw[i]) hidden++ }
  r.farHidden = `${hidden}/${tested}`
  // 6. channel stays inside its floodplain (otherwise the carve trenches the valley side)
  let edge = 0; for (let i = 0; i < C.n; i++) edge = Math.max(edge, Math.abs(C.px[i] - C.axisX(C.pz[i])) + C.W[i] / 2)
  r.channelEdge = `${edge.toFixed(1)} / ${C.P.floodplainW / 2}`
  r.buildMs = Math.round(window.__buildMs)
  return JSON.stringify(r)
})()
