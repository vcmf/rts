// Render checks (plans/w1-river-shape.md, Redesign 2): render the real scene at fixed cameras, read the
// framebuffer, and test the PIXELS at projected river points. Catches what height checks can't:
// culled, missing, hidden or wrongly coloured geometry, and the painted river line on the far ring.
// Run: node tools/shot.mjs prototypes/painted-cinematic.html renders/tmp 1280 720 \
//        "$(python3 -c 'import json;print(json.dumps([["eval",open("tools/render-check.js").read()]]))')"
// Every failed limit is a console.error, so shot.mjs exits non-zero.
//
// Colour alone can't tell graded water from land in shadow, so each view is rendered twice and compared:
// once as is, once with the water mesh hidden and the far-ring mask blanked. A river point must CHANGE
// between the two frames (the water is what the camera sees there); a bank point must NOT (no water
// spills onto the land, nothing covers it).
(() => {
  const C = RIVER, cam = __proto.camera, gl = engine._gl, out = {}, fail = []
  const W = engine.getRenderWidth(true), Hh = engine.getRenderHeight(true)   // true: the screen, not the last bound render target
  const water = scene.getMeshByName('water'), blank = new B.DynamicTexture('blankMask', 4, scene, false)
  blank.getContext().fillRect(0, 0, 4, 4); blank.update(false)                // black: no river line
  const frame = hide => {
    water.isVisible = !hide; farTerrainMat.setTexture('uRiverMask', hide ? blank : riverMask)
    for (let f = 0; f < 3; f++) scene.render()
    const buf = new Uint8Array(W * Hh * 4); gl.readPixels(0, 0, W, Hh, gl.RGBA, gl.UNSIGNED_BYTE, buf); return buf
  }
  const views = [
    { name: 'mid', alpha: -Math.PI / 2 - 0.35, beta: 0.8, radius: 125, t: [-70, 8, 0] },
    { name: 'close', alpha: -Math.PI / 2 - 0.2, beta: 0.6, radius: 80, t: [-95, 8, -60] },
    { name: 'wide', alpha: -Math.PI / 2, beta: 0.7, radius: 260, t: [-100, 8, 150] },
    { name: 'far', alpha: Math.PI / 2 - 0.3, beta: 0.98, radius: 260, t: [-110, 8, -250] },   // looks out past the tile edge (-z); at the camera limits
  ]
  const half = SMW / 2, saved = { alpha: cam.alpha, beta: cam.beta, radius: cam.radius, target: cam.target.clone() }
  // views must be ones the player can reach: the camera clamps beta/radius on render, which would silently move the view
  for (const v of views) if (v.beta > cam.upperBetaLimit || v.radius > cam.upperRadiusLimit || v.radius < cam.lowerRadiusLimit || Math.abs(v.t[0]) > PLAY || Math.abs(v.t[2]) > PLAY) fail.push(`${v.name}: outside the camera limits`)
  try {
    for (const v of views) {
      cam.alpha = v.alpha; cam.beta = v.beta; cam.radius = v.radius; cam.target.set(...v.t)
      const on = frame(false), off = frame(true)
      const vp = cam.viewport.toGlobal(W, Hh), M = scene.getTransformMatrix(), I = B.Matrix.Identity()
      // summed RGB change at the projected point; null when off screen
      const delta = p => { const s = B.Vector3.Project(p, I, M, vp); if (s.z <= 0 || s.z >= 1 || s.x < 8 || s.y < 8 || s.x > W - 8 || s.y > Hh - 8) return null
        const k = ((Hh - 1 - Math.round(s.y)) * W + Math.round(s.x)) * 4; return Math.abs(on[k] - off[k]) + Math.abs(on[k + 1] - off[k + 1]) + Math.abs(on[k + 2] - off[k + 2]) }
      const hit = d => d > 24   // well above post-effect bleed (bloom, mist) from a nearby change
      const stat = { water: [0, 0], bank: [0, 0], farLine: [0, 0] }
      const add = (s, d) => { if (d !== null) { stat[s][1]++; if (hit(d)) stat[s][0]++ } }
      for (let i = 0; i < C.n; i += 3) {
        const inTile = Math.abs(C.px[i]) < half - 1 && Math.abs(C.pz[i]) < half - 1,   // up to the edge: the exits are where the meshes meet
          farOut = Math.abs(C.px[i]) > half + 20 || Math.abs(C.pz[i]) > half + 20
        if (inTile) {
          add('water', delta(new B.Vector3(C.px[i], C.zw[i], C.pz[i])))
          for (const side of [-1, 1]) { const o = C.W[i] / 2 * 1.7 + 12, x = C.px[i] - C.tz[i] * side * o, z = C.pz[i] + C.tx[i] * side * o, q = riverQuery(x, z)
            if (q && q.dist < C.W[i] / 2 * 1.7 + 6 || Math.abs(x) > half || Math.abs(z) > half) continue   // another pass of a doubled-back bend, or off the tile
            add('bank', delta(new B.Vector3(x, H(x, z), z))) }
        } else if (farOut) add('farLine', delta(new B.Vector3(C.px[i], farGround.getHeightAtCoordinates(C.px[i], C.pz[i]), C.pz[i])))   // the drawn far surface
      }
      const frac = ([a, n]) => (n ? +(a / n).toFixed(2) : null)
      out[v.name] = { water: frac(stat.water), waterN: stat.water[1], bank: frac(stat.bank), bankN: stat.bank[1], farLine: frac(stat.farLine), farN: stat.farLine[1] }
      if (stat.water[1] >= 20 && stat.water[0] / stat.water[1] < 0.8) fail.push(`${v.name}.water=${frac(stat.water)}`)
      if (stat.bank[1] >= 20 && stat.bank[0] / stat.bank[1] > 0.15) fail.push(`${v.name}.bank=${frac(stat.bank)}`)
      if (stat.farLine[1] >= 20 && stat.farLine[0] / stat.farLine[1] < 0.6) fail.push(`${v.name}.farLine=${frac(stat.farLine)}`)
    }
  } finally {
    water.isVisible = true; farTerrainMat.setTexture('uRiverMask', riverMask); blank.dispose()
    cam.alpha = saved.alpha; cam.beta = saved.beta; cam.radius = saved.radius; cam.target.copyFrom(saved.target)
  }
  // each limit must actually have been exercised somewhere
  if (!views.some(v => out[v.name]?.waterN >= 20)) fail.push('no view tested near water')
  if (!views.some(v => out[v.name]?.bankN >= 20)) fail.push('no view tested the banks')
  if (!views.some(v => out[v.name]?.farN >= 20)) fail.push('no view tested the far-ring line')
  if (fail.length) console.error('render-check FAILED: ' + fail.join(', '))
  return JSON.stringify(out)
})()
