// The tree generator (docs/research/procedural-trees.md, docs/plans/active/tree-generator.md): space colonization in a
// species' crown envelope (Runions, Lane and Prusinkiewicz 2007), pipe-model radii, tube branches, and the branch tips
// clustered into a few crown clumps (docs/art-bible.md §5: a tree is 3-6 crown clumps). A plain script, shared like
// formation-core.js: prototypes/tree-gen.html loads it with a script tag, the look page imports it
// (src/look/main.ts, ?trees=gen). It sets window.TREEGEN.
;(function () {
'use strict'
// ---------- seeded maths ----------
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
function strHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0 }
function h3(x, y, z) { let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483647); h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296 }
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = x - xi, fy = y - yi, fz = z - zi
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz), L = (a, b, t) => a + (b - a) * t
  return L(L(L(h3(xi, yi, zi), h3(xi + 1, yi, zi), u), L(h3(xi, yi + 1, zi), h3(xi + 1, yi + 1, zi), u), v),
           L(L(h3(xi, yi, zi + 1), h3(xi + 1, yi, zi + 1), u), L(h3(xi, yi + 1, zi + 1), h3(xi + 1, yi + 1, zi + 1), u), v), w)
}
const clamp = (x, a, b) => x < a ? a : x > b ? b : x, mix = (a, b, t) => a + (b - a) * t
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
const hex = s => [parseInt(s.slice(1, 3), 16) / 255, parseInt(s.slice(3, 5), 16) / 255, parseInt(s.slice(5, 7), 16) / 255]

// ---------- species: data, not code ----------
// h: height range (m); base: crown base as a share of the height; w: the crown's widest radius as a share of the
// crown's height; c: where the crown is widest (0 bottom, 1 top); pb, pt: the profile's exponent below and above
// that (2 round, 1 a cone, < 1 concave); N: attraction points; D: segment length (m); di, dk: radius of influence
// and kill distance in multiples of D; g: tropism added to each growth step (negative y droops); n: the pipe
// model's exponent; r0: tip radius (m); k: crown clumps; mode: 'clumps' (k-means on the tips) or 'tiers' (bands up
// the trunk); column: tiers that follow the envelope and overlap (a columnar crown); squash: a clump's height over its width; lump: how irregular a clump's surface is; stems: trunks
// from the ground; leaf: the summer palette (dark, light); bark: the bark role's colour
const SPECIES = {
  oak:       { label: 'Oak', h: [13, 17], base: 0.3, w: 0.95, c: 0.38, pb: 2.2, pt: 2.4, N: 900, D: 0.5, di: 16, dk: 2.2, g: [0, 0.02, 0], n: 2.3, r0: 0.03, k: [5, 6], mode: 'clumps', squash: 0.72, lump: 0.28, stems: 1, lean: 0.06, leaf: ['#40662b', '#8f9c3e'], bark: '#5d4a38', deciduous: true },
  lime:      { label: 'Lime', h: [15, 19], base: 0.22, w: 0.55, c: 0.32, pb: 2.0, pt: 1.6, N: 900, D: 0.5, di: 14, dk: 2.0, g: [0, 0.1, 0], n: 2.4, r0: 0.03, k: [4, 6], mode: 'clumps', squash: 0.95, lump: 0.22, stems: 1, lean: 0.03, leaf: ['#4a7030', '#93a04a'], bark: '#5a5046', deciduous: true },
  beech:     { label: 'Beech', h: [14, 18], base: 0.25, w: 0.78, c: 0.4, pb: 2.2, pt: 2.0, N: 900, D: 0.5, di: 15, dk: 2.2, g: [0, 0.06, 0], n: 2.4, r0: 0.03, k: [4, 6], mode: 'clumps', squash: 0.8, lump: 0.22, stems: 1, lean: 0.03, leaf: ['#47702e', '#94a04a'], bark: '#7d7a72', deciduous: true },
  copper:    { label: 'Copper beech', h: [14, 18], base: 0.25, w: 0.78, c: 0.4, pb: 2.2, pt: 2.0, N: 900, D: 0.5, di: 15, dk: 2.2, g: [0, 0.06, 0], n: 2.4, r0: 0.03, k: [4, 6], mode: 'clumps', squash: 0.8, lump: 0.22, stems: 1, lean: 0.03, leaf: ['#4a262c', '#7a4044'], bark: '#7d7a72', deciduous: true, copper: true },
  birch:     { label: 'Birch', h: [12, 16], base: 0.35, w: 0.42, c: 0.45, pb: 2.0, pt: 1.4, N: 600, D: 0.45, di: 12, dk: 2.0, g: [0, -0.08, 0], n: 2.6, r0: 0.022, k: [3, 4], mode: 'clumps', squash: 1.15, lump: 0.32, stems: 1, lean: 0.08, leaf: ['#68883a', '#a6a452'], bark: '#e6e0d2', birch: true, deciduous: true },
  willow:    { label: 'White willow', h: [10, 14], base: 0.28, w: 0.85, c: 0.48, pb: 2.0, pt: 2.0, N: 750, D: 0.5, di: 14, dk: 2.0, g: [0, -0.22, 0], n: 2.3, r0: 0.028, k: [4, 6], mode: 'clumps', squash: 0.95, lump: 0.36, stems: 1, lean: 0.12, leaf: ['#4f6a40', '#97a66c'], bark: '#5f564a', deciduous: true },
  alder:     { label: 'Alder', h: [10, 14], base: 0.25, w: 0.48, c: 0.4, pb: 2.0, pt: 1.5, N: 650, D: 0.45, di: 12, dk: 2.0, g: [0, 0.08, 0], n: 2.4, r0: 0.025, k: [3, 5], mode: 'clumps', squash: 1.0, lump: 0.25, stems: 2, lean: 0.1, leaf: ['#355f2c', '#7a8f3a'], bark: '#4a443c', deciduous: true },
  apple:     { label: 'Apple (orchard)', h: [5, 7], base: 0.24, w: 0.92, c: 0.45, pb: 2.0, pt: 2.2, N: 500, D: 0.32, di: 14, dk: 2.2, g: [0, 0.0, 0], n: 2.2, r0: 0.02, k: [3, 5], mode: 'clumps', squash: 0.75, lump: 0.3, stems: 1, lean: 0.1, leaf: ['#4f7432', '#a0a84a'], bark: '#5b4a3c', deciduous: true },
  poplar:    { label: 'Lombardy poplar', h: [20, 26], base: 0.06, w: 0.13, c: 0.32, pb: 2.0, pt: 1.15, N: 650, D: 0.5, di: 10, dk: 2.0, g: [0, 0.35, 0], n: 2.5, r0: 0.025, k: [5, 6], mode: 'tiers', column: true, squash: 1.7, lump: 0.25, stems: 1, lean: 0.01, leaf: ['#3f6a2c', '#94a344'], bark: '#5e5649', deciduous: true },
  pine:      { label: 'Scots pine', h: [16, 21], base: 0.62, w: 0.5, c: 0.45, pb: 1.6, pt: 2.2, N: 500, D: 0.5, di: 12, dk: 2.2, g: [0, 0.04, 0], n: 2.4, r0: 0.03, k: [4, 6], mode: 'clumps', squash: 0.45, lump: 0.3, stems: 1, lean: 0.1, leaf: ['#2c5434', '#4e7a3e'], bark: '#8a5a3a', deciduous: false },
  spruce:    { label: 'Norway spruce', h: [16, 22], base: 0.1, w: 0.3, c: 0.0, pb: 1.0, pt: 1.0, N: 700, D: 0.5, di: 9, dk: 2.0, g: [0, -0.1, 0], n: 2.5, r0: 0.025, k: [5, 6], mode: 'tiers', squash: 0.6, lump: 0.25, stems: 1, lean: 0.0, leaf: ['#1f4630', '#3f6a40'], bark: '#4e4036', deciduous: false, cone: true },
  hawthorn:  { label: 'Hawthorn (hedge)', h: [2.6, 3.6], base: 0.12, w: 0.7, c: 0.5, pb: 2.0, pt: 2.0, N: 350, D: 0.22, di: 14, dk: 2.0, g: [0, 0.05, 0], n: 2.2, r0: 0.012, k: [3, 4], mode: 'clumps', squash: 0.85, lump: 0.32, stems: 4, lean: 0.25, leaf: ['#3d6130', '#87953f'], bark: '#4f463c', deciduous: true },
}
const SPECIES_KEYS = Object.keys(SPECIES)

// ---------- the generator ----------
// A tree: skeleton (nodes with parent and radius), crown clumps (ellipsoids), and their meshes' vertex data.
function growTree(spec, seed) {
  const R = mulberry32(strHash(spec.label) ^ Math.imul(seed, 2654435761))
  const H = mix(spec.h[0], spec.h[1], R()), crownBase = H * spec.base, crownH = H - crownBase, Wmax = spec.w * crownH
  const profile = t => { const u = t < spec.c ? (spec.c - t) / Math.max(spec.c, 1e-3) : (t - spec.c) / Math.max(1 - spec.c, 1e-3), p = t < spec.c ? spec.pb : spec.pt; return Math.pow(Math.max(0, 1 - Math.pow(u, p)), 1 / p) }
  // the crown leans a little and is squeezed by a random amount sideways, so no two trees share an outline
  const leanX = (R() - 0.5) * 2 * spec.lean * H, leanZ = (R() - 0.5) * 2 * spec.lean * H, sqx = 1 + (R() - 0.5) * 0.3, sqz = 1 + (R() - 0.5) * 0.3
  const inside = (x, y, z) => { const t = (y - crownBase) / crownH; if (t < 0 || t > 1) return false; const s = t; const dx = (x - leanX * s) / sqx, dz = (z - leanZ * s) / sqz; return Math.hypot(dx, dz) <= Wmax * profile(t) }
  // attraction points, uniform in the envelope
  const P = []
  for (let tries = 0; P.length < spec.N && tries < spec.N * 60; tries++) {
    const y = crownBase + R() * crownH, a = R() * Math.PI * 2, r = Wmax * 1.35 * Math.sqrt(R()), t = (y - crownBase) / crownH
    const x = Math.cos(a) * r * sqx + leanX * t, z = Math.sin(a) * r * sqz + leanZ * t
    if (inside(x, y, z)) P.push(x, y, z)
  }
  // nodes: the trunk(s) first, straight to the crown base with a slight wander
  const nx = [], ny = [], nz = [], par = []
  const add = (x, y, z, p) => { nx.push(x); ny.push(y); nz.push(z); par.push(p); return nx.length - 1 }
  const D = spec.D
  for (let s = 0; s < spec.stems; s++) {
    const a = (s / spec.stems) * Math.PI * 2 + R() * 1.2, spread = spec.stems > 1 ? 0.35 + R() * 0.25 : 0
    let x = spec.stems > 1 ? Math.cos(a) * 0.15 : 0, z = spec.stems > 1 ? Math.sin(a) * 0.15 : 0, y = 0, p = add(x, y, z, -1)
    const top = crownBase * (spec.stems > 1 ? 0.6 + R() * 0.5 : 1) + D * 2
    let dx = Math.cos(a) * spread, dz = Math.sin(a) * spread
    while (y < top) {
      const tt = y / Math.max(top, 1e-3)
      const wx = (vnoise(y * 0.3, s * 7.1, seed) - 0.5) * 0.25, wz = (vnoise(s * 3.3, y * 0.3, seed + 9) - 0.5) * 0.25
      const tx = leanX / H + dx * (1 - tt) + wx, tz = leanZ / H + dz * (1 - tt) + wz, l = Math.hypot(tx, 1, tz)
      x += D * tx / l; y += D / l; z += D * tz / l; p = add(x, y, z, p)
    }
  }
  // space colonization: each point pulls on its nearest node within di; each pulled node grows one segment of
  // length D along the mean pull (plus the tropism); points within dk of a node are spent
  const np = P.length / 3, alive = new Uint8Array(np).fill(1), near = new Int32Array(np).fill(-1), nd2 = new Float64Array(np).fill(Infinity)
  const di2 = (spec.di * D) ** 2, dk2 = (spec.dk * D) ** 2
  let seen = 0, live = np
  for (let it = 0; it < 400 && live > 0; it++) {
    const count = nx.length
    for (let i = 0; i < np; i++) {
      if (!alive[i]) continue
      const px = P[i * 3], py = P[i * 3 + 1], pz = P[i * 3 + 2]
      for (let k = seen; k < count; k++) {
        const d2 = (nx[k] - px) ** 2 + (ny[k] - py) ** 2 + (nz[k] - pz) ** 2
        if (d2 < nd2[i]) { nd2[i] = d2; near[i] = k }
      }
      if (nd2[i] < dk2) { alive[i] = 0; live-- }
    }
    seen = count
    const acc = new Map()
    for (let i = 0; i < np; i++) {
      if (!alive[i] || nd2[i] > di2) continue
      const k = near[i], d = Math.sqrt(nd2[i]), v = acc.get(k) || [0, 0, 0]
      v[0] += (P[i * 3] - nx[k]) / d; v[1] += (P[i * 3 + 1] - ny[k]) / d; v[2] += (P[i * 3 + 2] - nz[k]) / d; acc.set(k, v)
    }
    if (!acc.size) break
    let grew = 0
    for (const [k, v] of acc) {
      let l = Math.hypot(v[0], v[1], v[2])
      if (l < 1e-6) { v[0] = R() - 0.5; v[1] = R() - 0.5; v[2] = R() - 0.5; l = Math.hypot(v[0], v[1], v[2]) }
      let gx = v[0] / l + spec.g[0], gy = v[1] / l + spec.g[1], gz = v[2] / l + spec.g[2]; l = Math.hypot(gx, gy, gz)
      const x = nx[k] + D * gx / l, y = ny[k] + D * gy / l, z = nz[k] + D * gz / l
      // a node pulled the same way twice would stack a twin on its last child: skip it
      let twin = false
      for (let c = count - 1; c > seen - 400 && c >= 0 && !twin; c--) if (par[c] === k && (nx[c] - x) ** 2 + (ny[c] - y) ** 2 + (nz[c] - z) ** 2 < D * D * 0.01) twin = true
      if (!twin) { add(x, y, z, k); grew++ }
    }
    if (!grew) break
  }
  const n = nx.length
  // the paper's relocation: each node halfway to its parent, which narrows the branching angles
  const ox = nx.slice(), oy = ny.slice(), oz = nz.slice()
  for (let i = 0; i < n; i++) { const p = par[i]; if (p >= 0 && oy[i] > crownBase * 0.9) { nx[i] = (ox[i] + ox[p]) / 2; ny[i] = (oy[i] + oy[p]) / 2; nz[i] = (oz[i] + oz[p]) / 2 } }
  // pipe model, from the tips down: r^n = sum of the children's r^n (children always come after their parent)
  const rad = new Float64Array(n), kids = Array.from({ length: n }, () => [])
  for (let i = 1; i < n; i++) if (par[i] >= 0) kids[par[i]].push(i)
  for (let i = n - 1; i >= 0; i--) {
    if (!kids[i].length) { rad[i] = spec.r0; continue }
    let s = 0; for (const c of kids[i]) s += rad[c] ** spec.n; rad[i] = s ** (1 / spec.n)
  }
  const tips = []; for (let i = 0; i < n; i++) if (rad[i] < spec.r0 * 2.2) tips.push(i)
  // stylized: limbs thicken toward the trunk faster than the pipe model says (docs/art-bible.md §12: a short
  // sturdy trunk); twigs keep their radius, so the bare crown stays fine
  let rMax = 0; for (let i = 0; i < n; i++) rMax = Math.max(rMax, rad[i])
  for (let i = 0; i < n; i++) rad[i] *= 1 + (spec.chunk ?? 0.7) * Math.sqrt(rad[i] / rMax)
  const crown = fitCrown(spec, R, tips, nx, ny, nz, crownBase, crownH, leanX, leanZ, t => Wmax * profile(t) * (sqx + sqz) / 2)
  return { spec, seed, H, crownBase, crownH, P, nx, ny, nz, par, rad, kids, clumps: crown.clumps, hull: crown.hull }
}

// the crown clumps: the tips clustered into k groups (k-means) or k bands up the trunk, each group an ellipsoid
// widthAt(t): the envelope's radius at t (0 the crown's base, 1 its top)
function fitCrown(spec, R, tips, nx, ny, nz, crownBase, crownH, leanX, leanZ, widthAt) {
  const k = spec.k[0] + Math.floor(R() * (spec.k[1] - spec.k[0] + 1)), groups = Array.from({ length: k }, () => [])
  if (spec.mode === 'tiers') {
    let y0 = Infinity, y1 = -Infinity; for (const i of tips) { y0 = Math.min(y0, ny[i]); y1 = Math.max(y1, ny[i]) }
    for (const i of tips) groups[Math.min(k - 1, Math.floor((ny[i] - y0) / (y1 - y0 + 1e-6) * k))].push(i)
  } else {
    // k-means++ seeding with the tree's own random stream, then 12 Lloyd steps on a vertically squashed metric
    // (clumps are wider than tall)
    const cx = [], cy = [], cz = [], m = tips.length, ys = 1.6
    const d2 = (i, c) => (nx[i] - cx[c]) ** 2 + ((ny[i] - cy[c]) * ys) ** 2 + (nz[i] - cz[c]) ** 2
    let f = tips[Math.floor(R() * m)]; cx.push(nx[f]); cy.push(ny[f]); cz.push(nz[f])
    while (cx.length < k) {
      let tot = 0; const w = tips.map(i => { let b = Infinity; for (let c = 0; c < cx.length; c++) b = Math.min(b, d2(i, c)); tot += b; return b })
      let r = R() * tot, j = 0; while (j < m - 1 && (r -= w[j]) > 0) j++
      cx.push(nx[tips[j]]); cy.push(ny[tips[j]]); cz.push(nz[tips[j]])
    }
    const lab = new Int32Array(m)
    for (let it = 0; it < 12; it++) {
      for (let j = 0; j < m; j++) { let b = Infinity; for (let c = 0; c < k; c++) { const d = d2(tips[j], c); if (d < b) { b = d; lab[j] = c } } }
      const sx = new Float64Array(k), sy = new Float64Array(k), sz = new Float64Array(k), sn = new Float64Array(k)
      for (let j = 0; j < m; j++) { const c = lab[j], i = tips[j]; sx[c] += nx[i]; sy[c] += ny[i]; sz[c] += nz[i]; sn[c]++ }
      for (let c = 0; c < k; c++) if (sn[c]) { cx[c] = sx[c] / sn[c]; cy[c] = sy[c] / sn[c]; cz[c] = sz[c] / sn[c] }
    }
    for (let j = 0; j < m; j++) groups[lab[j]].push(tips[j])
  }
  const clumps = []
  for (const g of groups) {
    if (g.length < 3) continue
    let sx = 0, sy = 0, sz = 0; for (const i of g) { sx += nx[i]; sy += ny[i]; sz += nz[i] }
    const c = [sx / g.length, sy / g.length, sz / g.length]
    let vh = 0, vv = 0; for (const i of g) { vh += (nx[i] - c[0]) ** 2 + (nz[i] - c[2]) ** 2; vv += (ny[i] - c[1]) ** 2 }
    const pad = spec.D * 1.2
    let rh = Math.sqrt(vh / g.length) * 1.25 + pad, rv = Math.sqrt(vv / g.length) * 1.6 + pad
    if (spec.mode === 'tiers') { const t = clamp((c[1] - crownBase) / crownH, 0, 1); c[0] = mix(c[0], leanX * t, 0.85); c[2] = mix(c[2], leanZ * t, 0.85) }
    if (spec.column) {
      // a column's tier follows the envelope's width at its height and is tall enough to overlap the next, so the
      // crown tapers to its tip with no round head on top
      const t = clamp((c[1] - crownBase) / crownH, 0, 1)
      rh = widthAt(t) * 1.05 + pad * 0.5; rv = Math.max(rh * spec.squash, crownH / k * 0.55)
    } else {
      if (spec.mode === 'tiers') rh = Math.sqrt(vh / g.length) * 1.5 + pad
      rv = clamp(rv, rh * spec.squash * 0.7, rh * spec.squash * 1.3)
    }
    clumps.push({ c, r: [rh, rv, rh], rand: R() })
  }
  // the hull: the box of the clumps as an ellipsoid; its normals make the crown shade as one mass
  let b0 = [Infinity, Infinity, Infinity], b1 = [-Infinity, -Infinity, -Infinity]
  for (const q of clumps) for (let a = 0; a < 3; a++) { b0[a] = Math.min(b0[a], q.c[a] - q.r[a]); b1[a] = Math.max(b1[a], q.c[a] + q.r[a]) }
  const hull = { c: [0, 1, 2].map(a => (b0[a] + b1[a]) / 2), r: [0, 1, 2].map(a => (b1[a] - b0[a]) / 2) }
  // a hidden core clump fills the hull's middle, so gaps between clumps show foliage and not sky-lit branches
  if (spec.mode !== 'tiers') clumps.push({ c: [hull.c[0], hull.c[1] - hull.r[1] * 0.1, hull.c[2]], r: [hull.r[0] * 0.62, hull.r[1] * 0.6, hull.r[2] * 0.62], rand: R(), core: true })
  return { clumps, hull }
}

// ---------- meshes ----------
// an icosphere (subdivision 2: 320 triangles), shared by every clump
const ICO = (() => {
  const t = (1 + Math.sqrt(5)) / 2, v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(p => { const l = Math.hypot(...p); return p.map(x => x / l) })
  let f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]]
  for (let s = 0; s < 2; s++) {
    const cache = new Map(), mid = (a, b) => { const key = a < b ? a + ',' + b : b + ',' + a; if (cache.has(key)) return cache.get(key); const p = [0, 1, 2].map(i => (v[a][i] + v[b][i]) / 2), l = Math.hypot(...p); v.push(p.map(x => x / l)); cache.set(key, v.length - 1); return v.length - 1 }
    f = f.flatMap(([a, b, c]) => { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); return [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]] })
  }
  return { v, f }
})()

function crownGeometry(tree, scale = 1) {
  const pos = [], nor = [], col = [], idx = [], { hull } = tree
  for (const q of tree.clumps) {
    const base = pos.length / 3, s = q.rand * 97
    const vp = ICO.v.map(u => {
      const lump = 1 + tree.spec.lump * (vnoise(u[0] * 1.9 + s, u[1] * 1.9, u[2] * 1.9 - s) - 0.5) * 2
      const uy = u[1] < 0 ? u[1] * 0.72 : u[1]   // flatter undersides: the clump sits on its shadow
      return [q.c[0] + u[0] * q.r[0] * lump * scale, q.c[1] + uy * q.r[1] * lump * scale, q.c[2] + u[2] * q.r[2] * lump * scale]
    })
    for (const p of vp) pos.push(...p)
    for (const [a, b, c] of ICO.f) idx.push(base + a, base + c, base + b)
    // the normals: some of the surface's own lumps, some of the clump's ellipsoid, most of the crown's hull
    const gn = new Array(vp.length).fill(0).map(() => [0, 0, 0])
    for (const [a, b, c] of ICO.f) {
      const e1 = [0, 1, 2].map(i => vp[b][i] - vp[a][i]), e2 = [0, 1, 2].map(i => vp[c][i] - vp[a][i])
      const fn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]
      for (const j of [a, b, c]) for (let i = 0; i < 3; i++) gn[j][i] += fn[i]
    }
    vp.forEach((p, j) => {
      const g = norm(gn[j]), e = norm([0, 1, 2].map(i => (p[i] - q.c[i]) / (q.r[i] * q.r[i]))), h = norm([0, 1, 2].map(i => (p[i] - hull.c[i]) / (hull.r[i] * hull.r[i])))
      nor.push(...norm([0, 1, 2].map(i => g[i] * 0.3 + e[i] * 0.3 + h[i] * 0.4)))
      // occlusion: low in the hull and inside it is darker
      const hy = (p[1] - (hull.c[1] - hull.r[1])) / (2 * hull.r[1]), out = Math.hypot((p[0] - hull.c[0]) / hull.r[0], (p[1] - hull.c[1]) / hull.r[1], (p[2] - hull.c[2]) / hull.r[2])
      col.push(clamp(0.35 + 0.45 * smooth(0, 1, hy) + 0.35 * smooth(0.55, 1, out), 0, 1), q.rand, 0, 1)
    })
  }
  return { pos, nor, col, idx }
}
// leaf cards on each clump's surface: the card's centre, the hull's normal, and in its colour the occlusion, a
// random angle and its size; the vertex shader turns each quad to face the camera
function cardGeometry(tree) {
  const pos = [], nor = [], col = [], uv = [], idx = [], { hull } = tree, R = mulberry32(tree.seed * 977 + 3)
  for (const q of tree.clumps) {
    if (q.core) continue
    const half = clamp(0.42 * Math.min(q.r[0], q.r[1] * 1.4), 0.35, 2.4)
    const area = 4 * Math.PI * Math.pow((q.r[0] * q.r[1] + q.r[0] * q.r[2] + q.r[1] * q.r[2]) / 3, 1)
    const M = Math.ceil(area / (half * half * 1.6)), s = q.rand * 97
    for (let k = 0; k < M; k++) {
      // a point on the sphere (Fibonacci spiral with a random twist), then on the lumpy clump, sunk a little
      const yy = 1 - 2 * (k + 0.5) / M, rr = Math.sqrt(1 - yy * yy), th = k * 2.39996 + R() * 0.6, u = [Math.cos(th) * rr, yy, Math.sin(th) * rr]
      const lump = 1 + tree.spec.lump * (vnoise(u[0] * 1.9 + s, u[1] * 1.9, u[2] * 1.9 - s) - 0.5) * 2, sink = 0.82 + R() * 0.12
      const uy = u[1] < 0 ? u[1] * 0.72 : u[1], p = [q.c[0] + u[0] * q.r[0] * lump * sink, q.c[1] + uy * q.r[1] * lump * sink, q.c[2] + u[2] * q.r[2] * lump * sink]
      const e = norm([0, 1, 2].map(i => (p[i] - q.c[i]) / (q.r[i] * q.r[i]))), h = norm([0, 1, 2].map(i => (p[i] - hull.c[i]) / (hull.r[i] * hull.r[i]))), n = norm([0, 1, 2].map(i => e[i] * 0.45 + h[i] * 0.55))
      const hy = (p[1] - (hull.c[1] - hull.r[1])) / (2 * hull.r[1]), ao = clamp(0.4 + 0.5 * smooth(0, 1, hy) + 0.2 * Math.max(0, e[1]), 0, 1)
      const b = pos.length / 3, sz = half * (0.8 + R() * 0.4) / 4, ang = R()
      for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { pos.push(...p); nor.push(...n); col.push(ao, ang, sz, 1); uv.push(cx, cy) }
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3)
    }
  }
  return { pos, nor, col, uv, idx }
}
function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l] }

// branches as tubes over the nodes of radius rMin to rMax: a chain follows the thickest child; the other children
// start chains of their own at the branching node (inside the parent's tube, so the joint needs no welding). A node
// in range whose parent is not (the twigs past a thick limb) starts a chain at that parent, so a limb's thin end
// is the twigs' and no segment falls between the two meshes.
function woodGeometry(tree, rMin, rMax) {
  const { nx, ny, nz, par, rad, kids } = tree, pos = [], nor = [], col = [], idx = []
  const inRange = i => rad[i] >= rMin && rad[i] < rMax
  const chains = [], stack = []
  for (let i = 0; i < nx.length; i++) if (inRange(i) && (par[i] < 0 || !inRange(par[i]))) stack.push([i, par[i]])
  while (stack.length) {
    const [start, from] = stack.pop(), chain = from >= 0 ? [from, start] : [start]
    let i = start
    while (true) {
      const ks = kids[i].filter(inRange); if (!ks.length) break
      ks.sort((a, b) => rad[b] - rad[a]); for (const c of ks.slice(1)) stack.push([c, i])
      i = ks[0]; chain.push(i)
    }
    if (chain.length > 1) chains.push({ chain, side: from >= 0 })
  }
  for (const { chain, side } of chains) {
    // keep a ring where the chain turns, thins or has run far: a straight run needs no rings in between
    const keep = [0]
    for (let j = 1; j < chain.length - 1; j++) {
      const a = chain[keep[keep.length - 1]], b = chain[j], c = chain[j + 1]
      const d1 = norm([nx[b] - nx[a], ny[b] - ny[a], nz[b] - nz[a]]), d2 = norm([nx[c] - nx[b], ny[c] - ny[b], nz[c] - nz[b]])
      const run = Math.hypot(nx[b] - nx[a], ny[b] - ny[a], nz[b] - nz[a])
      if (d1[0] * d2[0] + d1[1] * d2[1] + d1[2] * d2[2] < 0.985 || run > 6 * tree.spec.D || rad[b] < rad[a] * 0.7) keep.push(j)
    }
    keep.push(chain.length - 1)
    const pts = keep.map(j => chain[j]), r0 = rad[chain[side ? 1 : 0]]
    const sides = r0 > 0.2 ? 8 : r0 > 0.06 ? 6 : r0 > 0.025 ? 4 : 3
    let N = null, base = pos.length / 3
    pts.forEach((i, j) => {
      const a = pts[Math.max(0, j - 1)], b = pts[Math.min(pts.length - 1, j + 1)]
      const T = norm([nx[b] - nx[a], ny[b] - ny[a], nz[b] - nz[a]])
      if (!N) N = norm(Math.abs(T[1]) < 0.9 ? [T[2], 0, -T[0]] : [1, 0, 0])
      const d = N[0] * T[0] + N[1] * T[1] + N[2] * T[2]; N = norm([N[0] - T[0] * d, N[1] - T[1] * d, N[2] - T[2] * d])
      const B = [T[1] * N[2] - T[2] * N[1], T[2] * N[0] - T[0] * N[2], T[0] * N[1] - T[1] * N[0]]
      let r = side && j === 0 ? rad[chain[1]] : rad[i]
      let cy = ny[i]
      if (par[i] < 0) { r *= 1.45; cy -= 0.3 }   // a root flare that sinks into the ground
      for (let s = 0; s < sides; s++) {
        const an = s / sides * Math.PI * 2, ca = Math.cos(an), sa = Math.sin(an), dn = [N[0] * ca + B[0] * sa, N[1] * ca + B[1] * sa, N[2] * ca + B[2] * sa]
        pos.push(nx[i] + dn[0] * r, cy + dn[1] * r, nz[i] + dn[2] * r); nor.push(...dn); col.push(1, 0, 0, 1)
      }
      if (j > 0) for (let s = 0; s < sides; s++) { const p0 = base + (j - 1) * sides, p1 = base + j * sides, s1 = (s + 1) % sides; idx.push(p0 + s, p1 + s, p1 + s1, p0 + s, p1 + s1, p0 + s1) }
    })
    const last = pts[pts.length - 1], tip = pos.length / 3, T = norm([nx[last] - nx[pts[pts.length - 2]], ny[last] - ny[pts[pts.length - 2]], nz[last] - nz[pts[pts.length - 2]]])
    pos.push(nx[last] + T[0] * rad[last] * 2, ny[last] + T[1] * rad[last] * 2, nz[last] + T[2] * rad[last] * 2); nor.push(...T); col.push(1, 0, 0, 1)
    const lr = base + (pts.length - 1) * sides; for (let s = 0; s < sides; s++) idx.push(lr + s, tip, lr + (s + 1) % sides)
  }
  return { pos, nor, col, idx }
}

// a geometry hash for the determinism check
function treeHash(t) { let h = 2166136261; const f = x => { h = Math.imul(h ^ (Math.round(x * 1e6) | 0), 16777619) }; for (let i = 0; i < t.nx.length; i++) { f(t.nx[i]); f(t.ny[i]); f(t.nz[i]); f(t.rad[i]) } for (const q of t.clumps) { q.c.forEach(f); q.r.forEach(f) } return (h >>> 0).toString(16) }

// a generated tree as a nature-pack model (src/look/nature.ts NatureModel), divided by unit (the pack places its
// trees at scale ~unit), wound as the pack's OBJ data is (the look page reverses it): the crown clumps as foliage
// (role 0) and the limbs as bark (role 2, birch bark 4); per crown vertex its clump, and the clumps' ellipsoids
// (centre, [horizontal, vertical] radii) for the cards' volume light; the twigs below the limbs as their own mesh,
// for the bare crowns of late autumn and winter
function natureModel(key, seed, unit) {
  const spec = SPECIES[key], t = growTree(spec, seed), shown = t.clumps.filter(q => !q.core)
  const thick = spec.deciduous ? Math.max(spec.r0 * 3.2, 0.06) : spec.r0 * 3.2
  const c = crownGeometry({ ...t, clumps: shown }), w = woodGeometry(t, thick, Infinity), tw = woodGeometry(t, spec.r0 * 1.2, thick)
  const pos = [...c.pos, ...w.pos].map(v => v / unit), n0 = c.pos.length / 3, bark = spec.birch ? 4 : 2
  const role = [...new Array(n0).fill(0), ...new Array(w.pos.length / 3).fill(bark)]
  const idx = [...c.idx, ...w.idx.map(i => i + n0)].reverse()
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < pos.length; i++) { min[i % 3] = Math.min(min[i % 3], pos[i]); max[i % 3] = Math.max(max[i % 3], pos[i]) }
  // crownGeometry lays the clumps out one after another, ICO.v.length vertices each
  const clump = new Array(n0).fill(0).map((_, v) => Math.floor(v / ICO.v.length))
  const clumps = shown.map(q => ({ c: q.c.map(x => x / unit), r: [q.r[0] / unit, q.r[1] / unit] }))
  const twigs = { pos: tw.pos.map(v => v / unit), idx: tw.idx.slice().reverse(), role: new Array(tw.pos.length / 3).fill(bark) }
  return { pos, idx, role, min, max, clump, clumps, twigs, deciduous: !!spec.deciduous }
}

window.TREEGEN = { SPECIES, SPECIES_KEYS, growTree, fitCrown, crownGeometry, woodGeometry, cardGeometry, treeHash, natureModel, mulberry32, strHash, vnoise, clamp, mix, smooth, hex, norm }
})()
