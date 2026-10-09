// Formation measurements (docs/plans/done/formation-feel.md, Results). Evaluated in
// prototypes/formation-map.html, which it drives through window.F (the page loop is paused while it runs):
//   SHOT_TIMEOUT_S=1200 node tools/shot.mjs prototypes/formation-map.html <outDir> 1400 860 \
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
  reload(); F.order('ford'); out.ford = run(260); for (let t = 0; (FCm.main.orders.length || FCm.main.trans) && t < 200; t += 0.5) F.advance(0.5); out.ford.shape = F.stats().shape; out.ford.x = +FCm.main.x.toFixed(1); out.ford.status = FCm.main.status
  if (out.ford.shape !== 'line' || out.ford.x < FCm.STREAM_X(0) + 15 || out.ford.status) fail.push(`ford not crossed: ${JSON.stringify(out.ford)}`)
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
  // MOVEMENT OVER TERRAIN (docs/plans/done/terrain-movement.md)
  const R = FCm.RULESET, until = (sec, step = 0.1) => { let t = 0; while ((FCm.main.orders.length || FCm.main.trans) && t < sec) { F.advance(step); t += step } return +t.toFixed(1) }
  const live = b => [...b.lags].filter((l, j) => b.binN[j])
  // every live man's place this frame (slot set back by his file's lag), with his company
  const places = (b, ahead = 0) => { const fr = FCm.companyFrames(b, ahead, FCm.alpha); return b.soldiers.filter(s => s.alive).map(s => { const p = FCm.soldierPlace(b, fr[s.c], s); return [p[0], p[1], s.c] }) }
  const deep = (x, z) => FCm.WDEPTH[FCm.cellK(x, z)] > R.water.limit
  // places in deep water, now and as the soldiers aim for them (AHEAD seconds on)
  const placesInDeep = b => Math.max(places(b).filter(p => deep(p[0], p[1])).length, places(b, FCm.AHEAD).filter(p => deep(p[0], p[1])).length)
  // closest places of men in the same company (metres)
  const closestWithin = b => { const P = places(b); let m = Infinity
    for (let i = 0; i < P.length; i++) for (let k = i + 1; k < P.length; k++) if (P[i][2] === P[k][2]) m = Math.min(m, Math.hypot(P[i][0] - P[k][0], P[i][1] - P[k][1])); return m }
  // closest places of men in different companies (metres)
  const closestBetween = b => { const P = places(b); let m = Infinity
    for (let i = 0; i < P.length; i++) for (let k = i + 1; k < P.length; k++) if (P[i][2] !== P[k][2]) m = Math.min(m, Math.hypot(P[i][0] - P[k][0], P[i][1] - P[k][1])); return m }
  // a line marches 60 m north; a strip of woods exactly 10 m deep crosses the files of n of its 12 sample
  // points (each point covers 3 files); time lost against the same march with no strip
  const march = (n, style) => {
    const x = -40, z = -90; FCm.place(x, z, 0); F.follow(false); F.order('style', style)
    const files = FCm.main.soldiers.filter(s => s.r === 0).map(s => s.x).sort((a, b) => a - b)   // front-rank x, west to east
    if (n > 0) FCm.paintTerrain(files[0] - 0.3, z + 15, files[n * 3 - 1] + 0.3, z + 24, 'woods')   // cells z+15..z+24: 10 m
    F.order('move', { x, z: z + 60 }); const P = R.orders[style]; let t = 0
    // arrived and dressed (every file back in its place); the tolerances hold at every step
    let arrived = null
    while ((FCm.main.orders.length || Math.max(...live(FCm.main)) > 0.05) && t < 300) { F.advance(0.1); t += 0.1
      if (arrived === null && !FCm.main.orders.length) arrived = +t.toFixed(1)
      const L = live(FCm.main), mean = L.reduce((a, l) => a + l, 0) / L.length
      tol.mean = Math.max(tol.mean, mean - P.Lmean); tol.max = Math.max(tol.max, Math.max(...L) - P.Lmax) }
    if (n > 0) FCm.paintTerrain(x - 20, z + 10, x + 20, z + 30, null)
    return [arrived, +t.toFixed(1)]
  }
  // the research's simulation used Lmax 10 m, Lmean 2 m, τ 3 s: same tolerances for the comparison
  R.orders.research = { Lmax: 10, Lmean: 2, tau: 3 }
  out.thicket = {}; const tol = { mean: -Infinity, max: -Infinity }
  // time lost on arrival (the anchor at its target) and once dressed (every file back in its place)
  for (const style of ['research', 'keep', 'normal']) { const base = march(0, style), row = {}, dressed = {}
    for (const n of [1, 3, 6, 12]) { const [a, d] = march(n, style); row[n + '/12'] = +(a - base[0]).toFixed(1); dressed[n + '/12'] = +(d - base[1]).toFixed(1) }
    out.thicket[style] = row; out.thicket[style + 'Dressed'] = dressed
    if (!(row['1/12'] <= row['3/12'] && row['3/12'] <= row['6/12'] && row['6/12'] <= row['12/12'])) fail.push(`thicket delay does not grow with the share held up (${style}): ${JSON.stringify(row)}`) }
  // the full front has no choice: the delay is the strip's own, 10 m at the woods' speed against 10 m
  // at the pace (q = 1 in woods). Part of the front held up costs less, and one file almost nothing
  // with the research's tolerances. (The research's own figures used an approximation of the mean-lag
  // limit that ignores files already catching up; the engine solves it exactly: see the plan.)
  const g = R.terrain.woods.g.line * (R.q.ordinary || R.q)[R.terrain.woods.q], V0 = R.pace.ordinary, full = 10 / (V0 * g) - 10 / V0
  out.thicket.fullFrontPhysics = +full.toFixed(1)
  for (const style of ['research', 'keep', 'normal']) { const got = out.thicket[style]['12/12']
    if (Math.abs(got - full) > 0.2 * full) fail.push(`thicket 12/12 (${style}): ${got} s, the strip itself costs ${full.toFixed(1)} s`) }
  const T = out.thicket
  if (T.research['1/12'] > 1.5) fail.push(`one file in the strip costs ${T.research['1/12']} s with the research's tolerances`)
  // looser tolerances never cost more; keeping order costs a single file most of the full delay
  for (const k of ['1/12', '3/12', '6/12']) if (!(T.research[k] <= T.normal[k] + 0.1 && T.normal[k] <= T.keep[k] + 0.1)) fail.push(`thicket ${k}: research ${T.research[k]}, normal ${T.normal[k]}, keep ${T.keep[k]} not in order`)
  if (T.keep['1/12'] < 0.6 * full) fail.push(`keep order: one file in the strip costs only ${T.keep['1/12']} s`)
  // the exact mean-lag solve: the mean lag never passes Lmean, no file passes Lmax (centimetre slack for the accordion)
  out.thicket.overLmean = +tol.mean.toFixed(3); out.thicket.overLmax = +tol.max.toFixed(3)
  if (tol.mean > 0.01 || tol.max > 0.01) fail.push(`lag tolerances passed: mean by ${tol.mean.toFixed(3)} m, max by ${tol.max.toFixed(3)} m`)
  delete R.orders.research
  const deepMen = () => FCm.main.soldiers.filter(s => s.alive && FCm.WDEPTH[FCm.cellK(s.x, s.z)] > R.water.limit).length
  // deep water, oblique and along the whole front: the line stops at the bank, nobody in deep water
  out.deepWater = []
  for (const [x, z, h, tx, tz] of [[40, -30, Math.PI / 2, 100, -30], [FCm.STREAM_X(52) - 25, 52, Math.PI / 2, 110, 52]]) {
    FCm.place(x, z, h); F.follow(false); F.order('move', { x: tx, z: tz }); let worst = 0
    for (let n = 0; n < 180; n++) { F.advance(0.5); worst = Math.max(worst, placesInDeep(FCm.main)) }   // every 0.5 s on the way
    const r = { start: [+x.toFixed(1), z], status: FCm.main.status, orders: FCm.main.orders.length, placesInDeepOnTheWay: worst, menInDeepWater: deepMen() }
    out.deepWater.push(r)
    if (r.status !== 'halted: impassable ground' || r.orders || r.menInDeepWater || worst) fail.push(`deep water from ${r.start}: ${JSON.stringify(r)}`) }
  // a march column halted at deep water stays a column: companies a gap apart along the trail, facing on
  { FCm.place(30, -30, Math.PI / 2); F.follow(false); F.order('march'); F.advance(25); F.order('move', { x: 100, z: -30 }); let worst = 0
    for (let n = 0; n < 180; n++) { F.advance(0.5); worst = Math.max(worst, placesInDeep(FCm.main)) }
    const fr = FCm.companyFrames(FCm.main, 0, FCm.alpha), gaps = [1, 2, 3].map(c => +Math.hypot(fr[c].x - fr[c - 1].x, fr[c].z - fr[c - 1].z).toFixed(2))
    const faces = fr.map(f => +f.face.toFixed(2))
    out.deepWaterMarch = { status: FCm.main.status, gaps, faces, placesInDeepOnTheWay: worst, menInDeepWater: deepMen() }
    if (FCm.main.status !== 'halted: impassable ground' || gaps.some(g => Math.abs(g - 6.85) > 0.3) || faces.some(f => Math.abs(f - Math.PI / 2) > 0.05) || worst || out.deepWaterMarch.menInDeepWater)
      fail.push(`march column at deep water: ${JSON.stringify(out.deepWaterMarch)}`) }
  // a wheel toward the stream stops short of it; a square that would stand in it is refused
  { FCm.place(FCm.STREAM_X(-30) - 12, -30, Math.PI / 2); F.follow(false); F.order('wheelR'); let worst = 0
    for (let n = 0; n < 120; n++) { F.advance(0.5); worst = Math.max(worst, placesInDeep(FCm.main)) }
    out.wheelToWater = { status: FCm.main.status, placesInDeep: worst, turned: +Math.abs(Math.PI / 2 - FCm.main.heading).toFixed(2) }
    if (FCm.main.status !== 'halted: impassable ground' || worst || out.wheelToWater.turned < 0.1) fail.push(`wheel toward deep water: ${JSON.stringify(out.wheelToWater)}`) }
  // `watch`: the most places in deep water at any 0.25 s step over `sec` seconds
  const watch = (sec, then) => { let worst = 0; for (let n = 0; n < sec * 4; n++) { if (then && n === then[0] * 4) then[1](); F.advance(0.25); worst = Math.max(worst, placesInDeep(FCm.main)) } return worst }
  // the line as close to deep water as it can stand, facing it (east, at z = -30)
  const atBank = () => { let x = 40; FCm.place(x, -30, Math.PI / 2); while (!FCm.wetBins(FCm.main) && x < 150) FCm.place(x += 0.25, -30, Math.PI / 2)
    FCm.place(x -= 0.25, -30, Math.PI / 2); F.follow(false); return x }
  { atBank(); F.order('square'); F.advance(5)
    out.squareAtWater = { status: FCm.main.status, shape: F.stats().shape, placesInDeep: placesInDeep(FCm.main) }
    if (out.squareAtWater.status !== 'cannot form: impassable ground' || out.squareAtWater.shape !== 'line') fail.push(`square at deep water: ${JSON.stringify(out.squareAtWater)}`) }
  // 12 m further back the same square is accepted
  { const x = atBank(); FCm.place(x - 12, -30, Math.PI / 2); F.order('square'); F.advance(5)
    out.squareBackFromWater = { status: FCm.main.status, shape: F.stats().shape }
    if (out.squareBackFromWater.status || out.squareBackFromWater.shape !== 'line → square') fail.push(`square 12 m from deep water: ${JSON.stringify(out.squareBackFromWater)}`) }
  // a shape ordered during a change is checked too: column, then square 5 s later, at the bank
  { atBank(); F.order('column'); const worst = watch(120, [5, () => F.order('square')])
    out.changeDuringChange = { status: FCm.main.status, shape: F.stats().shape, placesInDeep: worst, menInDeepWater: deepMen() }
    if (worst || out.changeDuringChange.menInDeepWater) fail.push(`change during a change at the bank: ${JSON.stringify(out.changeDuringChange)}`) }
  // casualties at the bank: a thinned line ordered into column; the men spread over the companies (and
  // into slots that were empty) must stay off the water too. A grid of positions, headings and losses
  { let accepted = 0, refused = 0, worst = 0
    for (const k of [41, 50, 59]) for (const h of [5.25, 5.3, 5.35, 5.4, 5.45]) for (const x of [50, 52, 54]) {
      FCm.place(x, -28, h); F.follow(false); F.kill(k); F.advance(3); if (FCm.wetBins(FCm.main)) continue
      F.order('column'); F.advance(0.5); if (FCm.main.trans) accepted++; else { refused++; continue }
      worst = Math.max(worst, watch(40)) }
    out.thinnedAtBank = { accepted, refused, placesInDeep: worst }
    if (worst || accepted < 5) fail.push(`thinned line into column at the bank: ${JSON.stringify(out.thinnedAtBank)}`) }
  // a unit halted at the water: any further move order ends (halted or arrived) without oscillating
  // and without a place entering the water; Face about lets it leave; Retire steps it back in order
  const halt = shape => { FCm.place(30, -30, Math.PI / 2); F.follow(false); if (shape !== 'line') { F.order(shape); F.advance(25) }
    F.order('move', { x: 100, z: -30 }); F.advance(90); return FCm.main.status }
  // over `sec` s: the most places in deep water, heading reversals between 0.25 s samples, orders left
  const track = sec => { let worst = 0, flips = 0, h = FCm.main.heading
    for (let n = 0; n < sec * 4; n++) { F.advance(0.25); worst = Math.max(worst, placesInDeep(FCm.main)); const d = Math.atan2(Math.sin(FCm.main.heading - h), Math.cos(FCm.main.heading - h)); if (Math.abs(d) > 2) flips++; h = FCm.main.heading }
    return { worst, flips, orders: FCm.main.orders.length } }
  out.haltedAtBank = []
  for (const shape of ['line', 'march']) for (const deg of [30, 60, 90, 120, 180, -90]) {
    const halted = halt(shape), h = FCm.main.heading + deg * Math.PI / 180
    F.order('move', { x: FCm.main.x + Math.sin(h) * 40, z: FCm.main.z + Math.cos(h) * 40 }); const t = track(60)
    const r = { shape, deg, halted, status: FCm.main.status, ...t }
    out.haltedAtBank.push(r)
    if (halted !== 'halted: impassable ground' || t.worst || t.flips || t.orders) fail.push(`order at the bank: ${JSON.stringify(r)}`) }
  out.faceAboutLeaves = []
  for (const shape of ['line', 'march']) { halt(shape); F.order('face'); F.advance(4); F.order('move', { x: 0, z: -30 }); const t = track(150), b = FCm.main
    const r = { shape, status: b.status, left: +Math.hypot(b.x, b.z + 30).toFixed(1), ...t }
    out.faceAboutLeaves.push(r)
    if (r.left > 1 || t.worst || t.flips) fail.push(`face about and leave: ${JSON.stringify(r)}`) }
  { const x = atBank(), h0 = FCm.main.heading; F.order('retire', 30); const t = track(120), b = FCm.main
    const back = (x - b.x) * Math.sin(h0) + (-30 - b.z) * Math.cos(h0), dh = Math.atan2(Math.sin(b.heading - h0), Math.cos(b.heading - h0))
    out.retire = { back: +back.toFixed(2), headingChange: +dh.toFixed(3), status: b.status, ...t }
    if (Math.abs(back - 30) > 0.5 || Math.abs(dh) > 1e-6 || b.status || t.worst || t.orders) fail.push(`retire 30 m: ${JSON.stringify(out.retire)}`) }
  // face about keeps every man's place (bar the few who step up or close in) and leaves no rank hole;
  // it carries into line
  // places at the last tick (alpha 1): a moving battalion's in-between poses are not compared with its pose at rest
  const placesOf = b => { const fr = FCm.companyFrames(b, 0, 1); return b.soldiers.map(s => s.alive ? FCm.soldierPlace(b, fr[s.c], s) : null) }
  const moves = (p0, p1) => p0.map((p, i) => p ? Math.hypot(p1[i][0] - p[0], p1[i][1] - p[1]) : null).filter(d => d !== null)
  // the men in complete files (every rank filled): they keep their places through a face about; men in
  // short files step up to their new front rank
  const inFullFiles = b => b.soldiers.map(s => s.alive && b.grid[s.c].every(rank => rank[s.f] >= 0))
  const movesFull = (p0, p1, full) => moves(p0.map((p, i) => full[i] ? p : null), p1)
  { FCm.place(-20, -100, 0); F.follow(false); F.order('march'); F.advance(25); F.kill(10); F.advance(2); const b = FCm.main
    const holes = () => { let n = 0; for (let c = 0; c < 4; c++) for (let f = 0; f < FCm.FILES; f++) for (let r = 0; r < FCm.RANKS - 1; r++) if (b.grid[c][r][f] < 0 && b.grid[c].slice(r + 1).some(rank => rank[f] >= 0)) n++; return n }
    const p0 = placesOf(b); F.order('face'); F.advance(0.1); const d = moves(p0, placesOf(b))
    const holesAfterFace = holes(); F.advance(4); F.order('line'); F.advance(70)
    out.faceAboutPlaces = { kept: d.filter(x => x < 1e-6).length, moved: d.filter(x => x >= 1e-6).length, furthest: +Math.max(...d).toFixed(2), holesAfterFace, holesInLine: holes() }
    // a man who steps up moves at most two ranks; one who closes in toward the centre, a few files
    if (out.faceAboutPlaces.furthest > 2 * 0.85 + 3 * 0.65 || holesAfterFace || out.faceAboutPlaces.holesInLine) fail.push(`face about: ${JSON.stringify(out.faceAboutPlaces)}`) }
  // in every shape the men of complete files do not move; with a file held back by the water its lag is kept
  out.faceAboutShapes = {}
  for (const shape of ['line', 'column', 'square', 'march']) { FCm.place(-20, -100, 0); F.follow(false); if (shape !== 'line') { F.order(shape); F.advance(110) }
    const p0 = placesOf(FCm.main), full = inFullFiles(FCm.main), h0 = FCm.main.heading; F.order('face'); F.advance(0.1)
    const r = { status: FCm.main.status, furthest: +Math.max(...movesFull(p0, placesOf(FCm.main), full)).toFixed(6), turned: +Math.abs(Math.atan2(Math.sin(FCm.main.heading - h0), Math.cos(FCm.main.heading - h0))).toFixed(3) }
    out.faceAboutShapes[shape] = r
    if (r.status || r.furthest > 1e-6) fail.push(`face about in ${shape}: ${JSON.stringify(r)}`) }
  { FCm.place(30, -30, Math.PI / 2 - 0.5); F.follow(false); F.order('move', { x: 100, z: -30 + 70 * Math.tan(-0.5) }); let lag = 0
    for (let n = 0; n < 400 && lag < 1; n++) { F.advance(0.25); lag = Math.max(...live(FCm.main)) }
    const p0 = placesOf(FCm.main), full = inFullFiles(FCm.main); F.order('face'); F.advance(0.1)
    out.faceAboutHeld = { lagBefore: +lag.toFixed(2), status: FCm.main.status, furthest: +Math.max(...movesFull(p0, placesOf(FCm.main), full)).toFixed(6) }
    if (lag < 1 || out.faceAboutHeld.status || out.faceAboutHeld.furthest > 1e-6) fail.push(`face about with a held file: ${JSON.stringify(out.faceAboutHeld)}`) }
  // refused when closing a file would put a man where the water is: a line facing west, its rear-rank men
  // of company 0 lost, those empty rear slots over the stream
  { let x = 40, found = false
    for (; x < 70 && !found; x += 0.25) { FCm.place(x, -30, -Math.PI / 2); const b = FCm.main
      b.soldiers.forEach(s => { if (s.c === 0 && s.r === 2) { s.alive = false; b.grid[s.c][s.r][s.f] = -1 } })
      const fr = FCm.companyFrames(b, 0, FCm.alpha), empty = b.soldiers.filter(s => !s.alive).map(s => FCm.soldierPlace(b, fr[s.c], s))
      found = !FCm.wetBins(b) && empty.some(p => deep(p[0], p[1])) }
    F.follow(false); F.order('face'); F.advance(1)
    out.faceAboutRefused = { found, status: FCm.main.status, placesInDeep: placesInDeep(FCm.main) }
    if (!found || out.faceAboutRefused.status !== 'cannot face about: impassable ground' || out.faceAboutRefused.placesInDeep) fail.push(`face about at the water: ${JSON.stringify(out.faceAboutRefused)}`) }
  // a Retire cut short by the water still ends facing the front
  { let x = 40; FCm.place(x, -30, -Math.PI / 2); while (!FCm.wetBins(FCm.main) && x < 150) FCm.place(x += 0.25, -30, -Math.PI / 2)
    FCm.place(x - 8.25, -30, -Math.PI / 2); F.follow(false); const h0 = FCm.main.heading; F.order('retire', 30); const t = track(60)
    out.retireCutShort = { status: FCm.main.status, headingChange: +Math.abs(Math.atan2(Math.sin(FCm.main.heading - h0), Math.cos(FCm.main.heading - h0))).toFixed(3), ...t }
    if (out.retireCutShort.status !== 'halted: impassable ground' || out.retireCutShort.headingChange > 1e-6 || t.worst || t.orders) fail.push(`retire cut short: ${JSON.stringify(out.retireCutShort)}`) }
  // a march column ordered a short way behind it loops round on its turning radius and arrives (no flip-flop);
  // one ordered inside its turning circle halts; it cannot wheel
  { FCm.place(-20, -60, 0); F.follow(false); F.order('march'); F.advance(25); F.order('move', { x: FCm.main.x + 3, z: FCm.main.z - 10 }); const t = track(120)
    out.shortBehind = { status: FCm.main.status, ...t }
    if (t.flips || t.orders) fail.push(`column ordered a short way behind: ${JSON.stringify(out.shortBehind)}`) }
  { FCm.place(-20, -60, 0); F.follow(false); F.order('march'); F.advance(25); F.order('move', { x: FCm.main.x + 3, z: FCm.main.z }); F.advance(5)
    out.insideTurn = { orders: FCm.main.orders.length, status: FCm.main.status }
    FCm.place(-20, -60, 0); F.order('march'); F.advance(25); F.order('move', { x: FCm.main.x + 12, z: FCm.main.z }); F.advance(60)
    out.outsideTurn = { orders: FCm.main.orders.length, status: FCm.main.status }
    const w0 = closestWithin(FCm.main); F.order('wheelL'); F.advance(5)
    out.wheelColumn = { status: FCm.main.status, before: +w0.toFixed(2), withinCompany: +closestWithin(FCm.main).toFixed(2) }
    if (out.insideTurn.status !== 'arrived: as near as the column can turn' || out.insideTurn.orders) fail.push(`target inside the turning circle: ${JSON.stringify(out.insideTurn)}`)
    if (out.outsideTurn.orders || out.outsideTurn.status) fail.push(`target just outside the turning circle: ${JSON.stringify(out.outsideTurn)}`)
    if (!out.wheelColumn.status.startsWith('cannot wheel') || out.wheelColumn.withinCompany < w0 - 0.01) fail.push(`wheel on a march column: ${JSON.stringify(out.wheelColumn)}`) }
  // empty slots over the water: a thinned line whose emptied files stand over the stream is not let form
  // column (the men spread into those slots); if it may, no place enters the water
  { let x = 35, found = false
    const thin = () => { const b = FCm.main; b.soldiers.forEach((s, j) => { if (s.c === 3 && s.f >= 7) { s.alive = false; b.grid[s.c][s.r][s.f] = -1 } }) }
    for (; x < 70 && !found; x += 0.25) { FCm.place(x, -30, 0); thin(); const b = FCm.main
      const empties = []; const fr = FCm.companyFrames(b, 0, FCm.alpha); for (const s of b.soldiers) if (!s.alive) empties.push(FCm.soldierPlace(b, fr[s.c], s))
      found = !FCm.wetBins(b) && empties.every(p => deep(p[0], p[1])) }
    F.follow(false); F.order('column'); const worst = watch(60)
    out.emptySlotsOverWater = { found, x: +(x - 0.25).toFixed(2), status: FCm.main.status, placesInDeep: worst }
    if (!found || worst) fail.push(`empty slots over the water: ${JSON.stringify(out.emptySlotsOverWater)}`) }
  // turning at the bank: a line facing the water ordered north turns in place without a place entering it
  { const x = atBank(); F.order('move', { x, z: 10 }); const worst = watch(90)
    out.turnAtBank = { status: FCm.main.status, placesInDeep: worst, menInDeepWater: deepMen() }
    if (worst || out.turnAtBank.menInDeepWater) fail.push(`turn at the bank: ${JSON.stringify(out.turnAtBank)}`) }
  // a march column beside the stream turning toward it, 8 to 10 m from its edge
  out.columnTurnAtBank = []
  for (const d of [8, 9, 10]) { let e = 30; while (!deep(e, -110) && e < 150) e += 0.25   // away from the bridge (z -60)
    FCm.place(e - d - 15, -140, 0); F.follow(false); F.order('march'); F.advance(25); F.order('move', { x: e - d, z: -110 }); F.advance(25)   // formed on dry ground, then beside the stream
    F.order('move', { x: e + 30, z: FCm.main.z }); const worst = watch(60)
    out.columnTurnAtBank.push({ d, shape: F.stats().shape, status: FCm.main.status, placesInDeep: worst, menInDeepWater: deepMen() })
    if (worst || deepMen() || F.stats().shape !== 'march') fail.push(`column turning ${d} m from deep water: ${worst} places in it`) }
  // impassable ground narrower than Lmax across part of the front: nobody crosses it
  { FCm.place(-40, -90, 0); F.follow(false); F.order('style', 'push'); FCm.paintDepth(-55, -78, -40, -75, 1.5)
    F.order('move', { x: -40, z: -20 }); const worst = watch(90)
    const crossed = FCm.main.soldiers.filter(s => s.alive && s.x > -55 && s.x < -40 && s.z > -75).length
    out.narrowDitch = { status: FCm.main.status, placesInDeep: worst, crossed }
    FCm.paintDepth(-55, -78, -40, -75, null)
    if (worst || crossed || out.narrowDitch.status !== 'halted: impassable ground') fail.push(`narrow ditch: ${JSON.stringify(out.narrowDitch)}`) }
  // determinism: the same oblique approach to deep water twice gives the same state, bit for bit
  { const runOnce = () => { FCm.place(40, -30, Math.PI / 2); F.follow(false); F.order('move', { x: 100, z: -30 }); F.advance(60); const b = FCm.main; return JSON.stringify([b.x, b.z, b.heading, [...b.lags], b.status]) }
    const a = runOnce(), b = runOnce(); out.replaySame = a === b; if (a !== b) fail.push('the same run twice differs') }
  // ground impassable for one formation kind only (a ruleset with hedges a line cannot enter): the line
  // stops at it, no place on it
  { const H = R.terrain.hedge.g, keep = H.line; H.line = 0; FCm.bakeImpassable()
    FCm.place(-47, -40, 0); F.follow(false); F.order('move', { x: -47, z: 0 }); let worst = 0
    for (let n = 0; n < 120; n++) { F.advance(0.5); worst = Math.max(worst, places(FCm.main).filter(p => FCm.groundG(p[0], p[1], 'line', 0, 0) <= 0).length) }
    out.kindImpassable = { status: FCm.main.status, placesOnIt: worst }
    // a column standing on the hedge may not form line there
    FCm.place(-47, -40, 0); F.follow(false); F.order('column'); F.advance(40); F.order('move', { x: -47, z: -22.5 }); F.advance(60)   // the column's front rank on the hedge line
    const onHedge = places(FCm.main).filter(p => FCm.TERR[FCm.cellK(p[0], p[1])] === FCm.CLASSES.indexOf('hedge')).length
    F.order('line'); F.advance(3); out.kindImpassable.lineOnHedge = { columnPlacesOnHedge: onHedge, status: FCm.main.status, shape: F.stats().shape }
    H.line = keep; FCm.bakeImpassable()
    if (worst || out.kindImpassable.status !== 'halted: impassable ground') fail.push(`hedge a line cannot enter: ${JSON.stringify(out.kindImpassable)}`)
    if (!onHedge || out.kindImpassable.lineOnHedge.status !== 'cannot form: impassable ground') fail.push(`line formed on a hedge a line cannot enter: ${JSON.stringify(out.kindImpassable.lineOnHedge)}`) }
  // a company bin emptied by casualties takes no part: a line wholly in woods slows evenly, in order
  { FCm.place(-40, -90, 0); F.follow(false); F.order('style', 'normal'); const b = FCm.main
    b.soldiers.forEach(s => { if (s.c === 3 && s.f >= 6) s.alive = false }); b.soldiers.forEach((s, j) => { if (!s.alive) b.grid[s.c][s.r][s.f] = -1 })
    FCm.paintTerrain(-80, -100, 0, -20, 'woods'); F.order('move', { x: -40, z: -30 }); F.advance(30)
    out.emptyBin = { lagMax: +Math.max(...live(b)).toFixed(2), disorder: +b.disorder.toFixed(2), emptyBins: [...b.binN].filter(n => !n).length }
    FCm.paintTerrain(-80, -100, 0, -20, null)
    if (out.emptyBin.emptyBins < 1 || out.emptyBin.lagMax > 0.1 || out.emptyBin.disorder > 0.05) fail.push(`emptied bin: ${JSON.stringify(out.emptyBin)}`) }
  // the bridge deck is level ground for a column; crossing: narrow, cross, deploy beyond
  let deck = 1; for (let x = FCm.BRIDGE.x0 + 0.5; x < FCm.BRIDGE.x1; x += 0.5) deck = Math.min(deck, FCm.groundG(x, FCm.BRIDGE.z, 'column', 1, 0))   // the whole deck, eastward
  FCm.place(0, FCm.BRIDGE.z, Math.PI / 2); F.follow(false); F.order('bridge'); const tb = until(400, 0.5)
  out.bridge = { seconds: tb, deckG: +deck.toFixed(2), x: +FCm.main.x.toFixed(1), shape: F.stats().shape }
  if (deck < 0.99 || FCm.main.x < FCm.BRIDGE.x1 || F.stats().shape !== 'line' || tb > 240) fail.push(`bridge: ${JSON.stringify(out.bridge)}`)
  // the accordion: a march column whose head is held up at a hedge never walks through its own companies
  FCm.place(-60, -40, 0); F.follow(false); F.order('march'); F.advance(22); F.order('style', 'push')
  const rest = closestBetween(FCm.main); F.order('move', { x: -60, z: 0 })
  let closest = Infinity
  for (let n = 0; n < 300 && FCm.main.orders.length; n++) { F.advance(0.1); const b = FCm.main, fr = FCm.companyFrames(b, 0, FCm.alpha)
    for (let c = 1; c < 4; c++) { const a = b.soldiers.filter(s => s.alive && s.c === c - 1), f = b.soldiers.filter(s => s.alive && s.c === c)
      const back = a.map(s => FCm.soldierPlace(b, fr[s.c], s)), front = f.map(s => FCm.soldierPlace(b, fr[s.c], s))
      for (const p of back) for (const q of front) closest = Math.min(closest, Math.hypot(p[0] - q[0], p[1] - q[1])) } }
  out.accordion = { closestAtRest: +rest.toFixed(2), closestPlacesBetweenCompanies: +closest.toFixed(2) }
  if (closest < 0.4) fail.push(`march column companies walked through each other (closest places ${closest.toFixed(2)} m)`)
  if (rest - closest < 0.5) fail.push(`accordion never engaged: closest ${closest.toFixed(2)} m against ${rest.toFixed(2)} m at rest`)
  // the same column turned 90° west while its head is held: lagging companies follow the bend
  { FCm.place(-60, -40, 0); F.follow(false); F.order('march'); F.advance(22); F.order('style', 'push'); F.order('move', { x: -60, z: 0 }); F.advance(15)
    const lag0 = Math.max(...live(FCm.main)), within0 = closestWithin(FCm.main); F.order('move', { x: -110, z: FCm.main.z }); let closest = Infinity, within = Infinity, lagMax = lag0
    for (let n = 0; n < 240 && FCm.main.orders.length; n++) { F.advance(0.25); closest = Math.min(closest, closestBetween(FCm.main)); within = Math.min(within, closestWithin(FCm.main)); lagMax = Math.max(lagMax, ...live(FCm.main)) }
    out.accordionBend = { lagAtTurn: +lag0.toFixed(2), lagMax: +lagMax.toFixed(2), closest: +closest.toFixed(2), withinCompanyAtRest: +within0.toFixed(2), withinCompany: +within.toFixed(2) }
    if (closest < 0.4 || lagMax < 1 || within < 0.5) fail.push(`march column in a bend: ${JSON.stringify(out.accordionBend)}`) }
  // a square pushing into the wood: a held face never falls back into the others
  { FCm.place(-52, 30, 0); F.follow(false); F.order('square'); F.advance(110); F.order('style', 'push'); const rest = closestBetween(FCm.main)
    F.order('move', { x: -52, z: 90 }); let closest = Infinity, lagMax = 0
    for (let n = 0; n < 120 && FCm.main.orders.length; n++) { F.advance(0.5); closest = Math.min(closest, closestBetween(FCm.main)); lagMax = Math.max(lagMax, ...live(FCm.main)) }
    out.squareAccordion = { closestAtRest: +rest.toFixed(2), closest: +closest.toFixed(2), lagMax: +lagMax.toFixed(2) }
    if (closest < Math.min(0.4, rest - 0.1) || lagMax < 1) fail.push(`square in the wood: ${JSON.stringify(out.squareAccordion)}`) }
  // cost: 40 battalions
  reload(); F.setMany(true); F.advance(30); F.view(-10, -40, 2.6); out.many = { soldiers: F.stats().soldiers, simMs: F.measure(60), drawMsAllInView: F.drawMs(),
    moving: FCm.battalions.map(b => b.trans ? 'changing' : b.orders.length ? b.shape : 'idle').reduce((a, k) => (a[k] = (a[k] || 0) + 1, a), {}) }
  if (out.many.simMs > 4) fail.push(`40 battalions: simulation ${out.many.simMs} ms per frame (budget 4 ms)`)
  F.setMany(false); reload()
  if (fail.length) console.error('formation-measure FAILED: ' + fail.join('; '))
  return JSON.stringify(out)
})()
