// Formation measurements (docs/plans/done/formation-feel.md, Results). Evaluated in
// prototypes/formation-map.html, which it drives through window.F (the page loop is paused while it runs):
//   node tools/shot.mjs prototypes/formation-map.html <outDir> 1400 860 \
//     "$(python3 -c 'import json;print(json.dumps([["eval",open("tools/formation-measure.js").read()]]))')"
// Prints a JSON table. Limits that must hold are console.error, so shot.mjs exits non-zero when one fails.
(() => {
  const out = {}, fail = [], FCm = window.FC
  const reload = () => { FCm.reset(); F.follow(false); F.advance(0.5) }
  // worst distance from slot, sampled every 0.5 s while `sec` seconds pass
  const run = sec => { let max = 0, mean = 0; for (let n = 0; n < sec * 2; n++) { F.advance(0.5); const e = F.slotError(); max = Math.max(max, e.max); mean = Math.max(mean, e.mean) } return { max: +max.toFixed(2), worstMean: +mean.toFixed(2) } }
  // every live soldier sits in exactly one slot, and it is his own
  const tableOk = b => { const seen = new Set(); let bad = 0
    b.grid.forEach((g, c) => g.forEach((rank, r) => rank.forEach((j, f) => { if (j < 0) return; const s = b.soldiers[j]
      if (seen.has(j) || !s.alive || s.c !== c || s.r !== r || s.f !== f) bad++; seen.add(j) })))
    return bad + b.soldiers.filter((s, j) => s.alive && !seen.has(j)).length }
  // the ranks at rest: mean soldier speed (m/s) once the battalion has halted

  reload(); F.advance(5); out.atRest = run(5)   // settled men hold within 0.25 m of their place
  reload(); F.order('square'); out.lineToSquare = run(110); out.lineToSquare.took = F.stats().changes.slice(-1)[0].took
  reload(); F.order('march'); F.advance(22); F.order('move', { x: FCm.main.x + 60, z: FCm.main.z + 30 }); out.marchTurn = run(60)
  reload(); F.order('wood'); out.wood = run(200)
  // halted in the wood: every man must come to rest (the owner saw them fidget forever). Six halt
  // points; after the halt, the largest move of any soldier over 10 s
  out.haltedInWood = []
  for (const [ox, oz] of [[0, 0], [-10, 14], [-6, 6], [-14, -10], [8, 6], [12, -8]]) {   // the 2nd–4th fidgeted before the settled state (found by a 64-point search)
    reload(); F.order('move', { x: FCm.WOOD.x + ox, z: FCm.WOOD.z + oz }); F.advance(240)
    const b = FCm.main, halted = !b.orders.length && !b.trans, inWood = b.soldiers.filter(s => s.alive && FCm.inWood(s.x, s.z)).length
    const p0 = b.soldiers.map(s => [s.x, s.z]); F.advance(10)
    const moved = Math.max(...b.soldiers.map((s, i) => s.alive ? Math.hypot(s.x - p0[i][0], s.z - p0[i][1]) : 0))
    out.haltedInWood.push({ at: [ox, oz], halted, inWood, maxMove10s: +moved.toFixed(3) })
    if (!halted || inWood < 50) fail.push(`halt at ${ox},${oz} not tested: halted ${halted}, in wood ${inWood}`)
    if (moved > 0.05) fail.push(`halt at ${ox},${oz}: a soldier still moves ${moved.toFixed(2)} m in 10 s`)
  }
  reload(); F.order('ford'); out.ford = run(260)
  // casualties in line, then a square: the slot table stays consistent, the square keeps four faces
  reload(); for (let n = 0; n < 5; n++) { F.kill(10); F.advance(3) } F.kill(30); F.advance(5)
  out.casualties = { alive: F.stats().alive, tableErrors: tableOk(FCm.main) }
  F.order('square'); F.advance(110); const sizes = [0, 0, 0, 0]; for (const s of FCm.main.soldiers) if (s.alive) sizes[s.c]++
  out.casualties.squareCompanies = sizes; out.casualties.tableErrorsAfterSquare = tableOk(FCm.main)
  if (out.casualties.tableErrors || out.casualties.tableErrorsAfterSquare) fail.push('slot table inconsistent after casualties')
  if (Math.max(...sizes) - Math.min(...sizes) > 1) fail.push(`square faces unequal: ${sizes}`)
  // casualties during a change: the square still gets four equal faces
  reload(); F.order('square'); F.advance(20); F.kill(30); F.advance(100); { const z = [0, 0, 0, 0]; for (const s of FCm.main.soldiers) if (s.alive) z[s.c]++
    out.killDuringChange = { squareCompanies: z, tableErrors: tableOk(FCm.main) }
    if (Math.max(...z) - Math.min(...z) > 1 || out.killDuringChange.tableErrors) fail.push(`kills during the change: faces ${z}, table errors ${out.killDuringChange.tableErrors}`) }
  // MOVEMENT OVER TERRAIN (docs/plans/active/terrain-movement.md). A line marches 60 m north; a 10 m deep
  // strip of woods crosses part of its front. Time lost against the same march with no strip.
  const march = (frac, style) => {
    const x = -40, z = -90; FCm.place(x, z, 0); F.follow(false); F.order('style', style)
    const half = 12.7; if (frac > 0) FCm.paintTerrain(x - half - 0.5, z + 15, x - half + frac * 2 * half - 0.5, z + 25, 'woods')
    F.order('move', { x, z: z + 60 }); let t = 0; while (FCm.main.orders.length && t < 300) { F.advance(0.5); t += 0.5 }
    const lag = FCm.stats(); if (frac > 0) FCm.paintTerrain(x - 20, z + 10, x + 20, z + 30, null); return t
  }
  out.thicket = {}
  for (const style of ['keep', 'normal']) { const base = march(0, style), row = {}
    for (const n of [1, 3, 6, 12]) row[n + '/12'] = +(march(n / 12, style) - base).toFixed(1)
    out.thicket[style] = row
    if (!(row['1/12'] < row['3/12'] + 0.01 && row['3/12'] < row['6/12'] + 0.01 && row['6/12'] < row['12/12'])) fail.push(`thicket delay does not grow with the share held up (${style}): ${JSON.stringify(row)}`) }
  // deep water: a line ordered straight across the stream stops at the bank
  FCm.place(40, -30, Math.PI / 2); F.follow(false); F.order('move', { x: 100, z: -30 }); F.advance(80)
  out.deepWater = { x: +FCm.main.x.toFixed(1), status: FCm.main.status, bank: +(FCm.STREAM_X(-30) - FCm.WATER_HALF).toFixed(1) }
  if (FCm.main.x > FCm.STREAM_X(-30) - 1) fail.push(`the line crossed deep water (x ${out.deepWater.x})`)
  // the bridge: narrow, cross, deploy beyond
  FCm.place(0, FCm.BRIDGE.z, Math.PI / 2); F.follow(false); F.order('bridge'); let tb = 0; while ((FCm.main.orders.length || FCm.main.trans) && tb < 400) { F.advance(1); tb++ }
  out.bridge = { seconds: tb, x: +FCm.main.x.toFixed(1), shape: F.stats().shape }
  if (FCm.main.x < FCm.BRIDGE.x1 || F.stats().shape !== 'line') fail.push(`bridge not crossed: ${JSON.stringify(out.bridge)}`)
  // cost: 40 battalions
  reload(); F.setMany(true); F.advance(30); F.view(-10, -40, 2.6); out.many = { soldiers: F.stats().soldiers, simMs: F.measure(60), drawMsAllInView: F.drawMs() }
  F.setMany(false); reload()
  if (fail.length) console.error('formation-measure FAILED: ' + fail.join('; '))
  return JSON.stringify(out)
})()
