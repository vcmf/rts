// Look page checks (docs/plans/done/l0-spine.md, L0a), evaluated inside the page:
// 1. the ground used is the ground drawn: H(x, z) (the heightfield, and the far ring's nodes beyond the tile) agrees
//    with Babylon's own reading of the drawn meshes (GroundMesh.getHeightAtCoordinates), an independent oracle,
//    at sampled points on the tile and on the far ring;
// 2. the camera cannot leave yaw ±SPEC.camera.yawRange (decision 0010), whatever is asked of it;
// 3. every placed instance stands on the drawn ground: Babylon's reading of the tile or far mesh under its pivot
//    (instances may sink, never float), and none stands in the apron band, which the heightfield does not describe.
// Run (after npm run build and npx vite preview): node tools/shot.mjs <look page URL> renders/tmp 800 600 \
//        "$(python3 -c 'import json;print(json.dumps([["eval",open("tools/look-check.js").read()]]))')"
// Prints the measurements; every failed limit is a console.error, so shot.mjs exits non-zero.
(() => {
  const out = {}, fail = [], S = SPEC
  // 1. heights: a fixed pseudo-random set of points, away from the apron band (approximated there by design)
  let worstTile = 0, worstFar = 0, n = 0
  for (let k = 0; k < 4000; k++) {
    const a = Math.sin(k * 12.9898) * 43758.5453, b = Math.sin(k * 78.233) * 43758.5453, u = a - Math.floor(a), v = b - Math.floor(b)
    if (k % 2 === 0) { const x = (u - 0.5) * (S.tile - 2), z = (v - 0.5) * (S.tile - 2); worstTile = Math.max(worstTile, Math.abs(H(x, z) - tileGround.getHeightAtCoordinates(x, z))) }
    else { const x = (u - 0.5) * (S.far - 40), z = (v - 0.5) * (S.far - 40); if (Math.max(Math.abs(x), Math.abs(z)) < BAND + 1) continue; worstFar = Math.max(worstFar, Math.abs(H(x, z) - farGround.getHeightAtCoordinates(x, z))) }
    n++
  }
  out.heights = { n, worstTile: +worstTile.toExponential(2), worstFar: +worstFar.toExponential(2) }
  if (worstTile > 1e-3) fail.push(`tileHeights: H differs from the drawn tile by ${worstTile.toFixed(4)} m`)
  if (worstFar > 1e-3) fail.push(`farHeights: H differs from the drawn far ring by ${worstFar.toFixed(4)} m`)
  // 2. yaw: ask for a turn past each limit and render; the camera must stay inside
  const cam = __proto.camera, a0 = cam.alpha, c = S.camera, tol = 1e-6
  const yaws = []
  for (const ask of [c.yaw0 + Math.PI / 2, c.yaw0 - Math.PI / 2, c.yaw0 + Math.PI]) { cam.alpha = ask; scene.render(); yaws.push(+cam.alpha.toFixed(4)); if (Math.abs(cam.alpha - c.yaw0) > c.yawRange + tol) fail.push(`yaw: asked ${ask.toFixed(2)}, the camera stayed at ${cam.alpha.toFixed(2)} (outside ±${c.yawRange.toFixed(3)})`) }
  cam.alpha = a0; scene.render()
  out.yaw = yaws
  // 3. every instance's pivot on the drawn ground
  let floating = 0, worstFloat = 0, tested = 0, inBand = 0
  for (const m of scene.meshes) {
    if (!m.thinInstanceCount) continue
    for (const W of m.thinInstanceGetWorldMatrices()) {
      const o = W.getTranslation(), e = Math.max(Math.abs(o.x), Math.abs(o.z)); tested++
      if (e > S.tile / 2 && e < BAND) { inBand++; continue }
      const g = (e <= S.tile / 2 ? tileGround : farGround).getHeightAtCoordinates(o.x, o.z)
      if (o.y > g + 1e-3) { floating++; worstFloat = Math.max(worstFloat, o.y - g) }
    }
  }
  out.instances = { tested, floating, worstFloat: +worstFloat.toFixed(3), inBand }
  if (tested < 1000) fail.push(`instances: only ${tested} tested`)
  if (inBand) fail.push(`instancesInBand: ${inBand} instances stand in the apron band`)
  if (floating) fail.push(`instancesFloating: ${floating} of ${tested} instances float, worst ${worstFloat.toFixed(3)} m`)
  // the drawn ground stays inside the spec's ground range (the camera footprint assumes it)
  const t = tileGround.getVerticesData(B.VertexBuffer.PositionKind); let lo = Infinity, hi = -Infinity
  for (let k = 1; k < t.length; k += 3) { lo = Math.min(lo, t[k]); hi = Math.max(hi, t[k]) }
  out.ground = [+lo.toFixed(2), +hi.toFixed(2)]
  if (lo < S.ground.lo || hi > S.ground.hi) fail.push(`groundRange: ${lo.toFixed(1)}..${hi.toFixed(1)} m outside ${S.ground.lo}..${S.ground.hi} m`)
  if (fail.length) console.error('look-check FAILED: ' + fail.join(', '))
  return JSON.stringify(out)
})()
