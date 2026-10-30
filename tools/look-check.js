// Look page checks (docs/plans/done/l0-spine.md, L0a), evaluated inside the page:
// 1. the ground used is the ground drawn: H(x, z) (the heightfield, and the far ring's nodes beyond the tile) agrees
//    with Babylon's own reading of the drawn meshes (GroundMesh.getHeightAtCoordinates), an independent oracle,
//    at sampled points on the tile and on the far ring;
// 2. the camera cannot leave yaw ±SPEC.camera.yawRange (decision 0010), whatever is asked of it;
// 3. every placed instance stands on the drawn ground: Babylon's reading of the tile or far mesh under its pivot
//    (instances may sink, never float), and none stands in the apron band, which the heightfield does not describe;
//    the soldiers by their poses (?armies: their meshes have no thin-instance matrices).
// Run (after npm run build and npx vite preview): node tools/shot.mjs <look page URL> renders/tmp 800 600 \
//        "$(python3 -c 'import json;print(json.dumps([["eval",open("tools/look-check.js").read()]]))')"
// Prints the measurements; every failed limit is a console.error, so shot.mjs exits non-zero.
;(() => {
  const out = {}
  const fail = []
  const S = SPEC
  // 1. heights: a fixed pseudo-random set of points, away from the apron band (approximated there by design)
  let worstTile = 0
  let worstFar = 0
  let n = 0
  for (let k = 0; k < 4000; k++) {
    const a = Math.sin(k * 12.9898) * 43758.5453
    const b = Math.sin(k * 78.233) * 43758.5453
    const u = a - Math.floor(a)
    const v = b - Math.floor(b)
    if (k % 2 === 0) {
      const x = (u - 0.5) * (S.tile - 2)
      const z = (v - 0.5) * (S.tile - 2)
      worstTile = Math.max(worstTile, Math.abs(H(x, z) - tileGround.getHeightAtCoordinates(x, z)))
    } else {
      const x = (u - 0.5) * (S.far - 40)
      const z = (v - 0.5) * (S.far - 40)
      if (Math.max(Math.abs(x), Math.abs(z)) < BAND + 1) continue
      worstFar = Math.max(worstFar, Math.abs(H(x, z) - farGround.getHeightAtCoordinates(x, z)))
    }
    n++
  }
  out.heights = { n, worstTile: +worstTile.toExponential(2), worstFar: +worstFar.toExponential(2) }
  if (worstTile > 1e-3) fail.push(`tileHeights: H differs from the drawn tile by ${worstTile.toFixed(4)} m`)
  if (worstFar > 1e-3) fail.push(`farHeights: H differs from the drawn far ring by ${worstFar.toFixed(4)} m`)
  // 2. yaw: ask for a turn past each limit and render; the camera must stay inside
  const cam = __proto.camera
  const a0 = cam.alpha
  const c = S.camera
  const tol = 1e-6
  const yaws = []
  for (const ask of [c.yaw0 + Math.PI / 2, c.yaw0 - Math.PI / 2, c.yaw0 + Math.PI]) {
    cam.alpha = ask
    scene.render()
    yaws.push(+cam.alpha.toFixed(4))
    if (Math.abs(cam.alpha - c.yaw0) > c.yawRange + tol) {
      fail.push(
        `yaw: asked ${ask.toFixed(2)}, the camera stayed at ${cam.alpha.toFixed(2)} (outside ±${c.yawRange.toFixed(3)})`,
      )
    }
  }
  cam.alpha = a0
  scene.render()
  out.yaw = yaws
  // 2b. the meadow's grass (docs/plans/done/l5c-meadow.md) never floats: where it grows, the height it stands on
  // (its meadow map, half floats, bilinear, sunk by SINK) is at or under the tile mesh's, at 4000 growing points over
  // the ground the rings can reach (its crops too, docs/plans/done/l5d-crops.md)
  const meadow = window.__look && window.__look.meadow
  if (meadow) {
    const SINK = 0.06 // src/look/meadow-spec.ts, MEADOW_SINK
    let worst = -1
    let n = 0
    for (let k = 0; k < 40000 && n < 4000; k++) {
      const x = (Math.random() - 0.5) * 670
      const z = (Math.random() - 0.5) * 670
      if (meadow.growthAt(x, z) <= 0 && meadow.cropAt(x, z) <= 0) continue
      n++
      worst = Math.max(worst, meadow.groundAt(x, z) - SINK - tileGround.getHeightAtCoordinates(x, z))
    }
    out.meadowFloat = +worst.toFixed(3)
    if (n < 1000) fail.push(`meadow: only ${n} growing points sampled`)
    if (worst > 0) fail.push(`meadow: a clump floats ${worst.toFixed(3)} m over the drawn tile`)
  }
  // 3. every instance's pivot on the drawn ground
  let floating = 0
  let worstFloat = 0
  let tested = 0
  let inBand = 0
  const stands = (x, y, z) => {
    const e = Math.max(Math.abs(x), Math.abs(z))
    tested++
    if (e > S.tile / 2 && e < BAND) {
      inBand++
      return
    }
    const g = (e <= S.tile / 2 ? tileGround : farGround).getHeightAtCoordinates(x, z)
    if (y > g + 1e-3) {
      floating++
      worstFloat = Math.max(worstFloat, y - g)
    }
  }
  for (const m of scene.meshes) {
    if (!m.thinInstanceCount) continue
    for (const W of m.thinInstanceGetWorldMatrices()) {
      const o = W.getTranslation()
      stands(o.x, o.y, o.z)
    }
  }
  // the soldiers (?armies): no thin-instance matrices, each man's pose (src/look/units.ts poses; one not drawn far
  // under the ground)
  const u = window.__units
  for (const p of u?.poses() ?? []) {
    for (let o = 0; o < p.length; o += 4) if (!u.isHidden(p[o + 1])) stands(p[o], p[o + 1], p[o + 2])
  }
  out.instances = { tested, floating, worstFloat: +worstFloat.toFixed(3), inBand }
  if (tested < 1000) fail.push(`instances: only ${tested} tested`)
  if (inBand) fail.push(`instancesInBand: ${inBand} instances stand in the apron band`)
  if (floating) {
    fail.push(`instancesFloating: ${floating} of ${tested} instances float, worst ${worstFloat.toFixed(3)} m`)
  }
  // the drawn ground stays inside the world's ground range, from its look data (the camera's checks assume it:
  // checkView, src/look/spec.ts)
  const t = tileGround.getVerticesData(B.VertexBuffer.PositionKind)
  let lo = Infinity
  let hi = -Infinity
  for (let k = 1; k < t.length; k += 3) {
    lo = Math.min(lo, t[k])
    hi = Math.max(hi, t[k])
  }
  out.ground = [+lo.toFixed(2), +hi.toFixed(2)]
  const G = window.GROUND
  if (!G) fail.push('groundRange: the page gives no GROUND')
  else if (lo < G.lo - 1e-3 || hi > G.hi + 1e-3) {
    fail.push(`groundRange: ${lo.toFixed(1)}..${hi.toFixed(1)} m outside ${G.lo.toFixed(1)}..${G.hi.toFixed(1)} m`)
  }
  if (fail.length) console.error('look-check FAILED: ' + fail.join(', '))
  return JSON.stringify(out)
})()
