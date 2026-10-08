// Formation measurements (docs/plans/active/formation-feel.md, Results). Evaluated in
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
  const restSpeed = () => { const b = FCm.main, live = b.soldiers.filter(s => s.alive); return +(live.reduce((a, s) => a + Math.hypot(s.vx, s.vz), 0) / live.length).toFixed(3) }

  reload(); F.advance(5); out.atRest = run(5)
  reload(); F.order('square'); out.lineToSquare = run(110); out.lineToSquare.took = F.stats().changes.slice(-1)[0].took
  reload(); F.order('march'); F.advance(22); F.order('move', { x: FCm.main.x + 60, z: FCm.main.z + 30 }); out.marchTurn = run(60)
  reload(); F.order('wood'); out.wood = run(200)
  // halted after the wood: the ranks must come to rest (the owner saw them fidget forever)
  F.order('move', { x: FCm.WOOD.x, z: FCm.WOOD.z }); run(150); F.advance(20); out.haltedInWood = { ...F.slotError(), restSpeed: restSpeed(), inWood: FCm.main.soldiers.filter(s => s.alive && FCm.inWood(s.x, s.z)).length }
  if (out.haltedInWood.restSpeed > 0.05) fail.push(`soldiers still moving at rest in the wood: ${out.haltedInWood.restSpeed} m/s`)
  reload(); F.order('ford'); out.ford = run(260)
  // casualties in line, then a square: the slot table stays consistent, the square keeps four faces
  reload(); for (let n = 0; n < 5; n++) { F.kill(10); F.advance(3) } F.kill(30); F.advance(5)
  out.casualties = { alive: F.stats().alive, tableErrors: tableOk(FCm.main) }
  F.order('square'); F.advance(110); const sizes = [0, 0, 0, 0]; for (const s of FCm.main.soldiers) if (s.alive) sizes[s.c]++
  out.casualties.squareCompanies = sizes; out.casualties.tableErrorsAfterSquare = tableOk(FCm.main)
  if (out.casualties.tableErrors || out.casualties.tableErrorsAfterSquare) fail.push('slot table inconsistent after casualties')
  if (Math.max(...sizes) - Math.min(...sizes) > 1) fail.push(`square faces unequal: ${sizes}`)
  // cost: 40 battalions
  reload(); F.setMany(true); F.advance(30); F.view(-10, -40, 2.6); out.many = { soldiers: F.stats().soldiers, simMs: F.measure(60), drawMsAllInView: F.drawMs() }
  F.setMany(false); reload()
  if (fail.length) console.error('formation-measure FAILED: ' + fail.join('; '))
  return JSON.stringify(out)
})()
