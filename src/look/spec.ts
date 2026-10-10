// The world spec (docs/proposals/engine-design.md §2–§6, docs/plans/done/l0-spine.md L0a): sizes are declared
// once, everything else is derived from them, and the invariants are checked when the spec is derived: a bad
// spec throws at load instead of drawing something subtly wrong. No DOM here, so tools and tests import it.

export interface Spec {
  tile: number          // the detailed tile's side, m: the heightfield's mesh, the river's water, the bakes
  tileSub: number       // tile grid cells per side
  far: number           // the far ring's side, m: the backdrop out to the edge of any view
  farSub: number        // far grid cells per side
  play: number          // the camera focus stays within ±play in x and z
  margin: number        // detail ⊇ play ⊕ margin: views near the play edge see the far ring only toward the top (checked against the camera)
  aoMargin: number      // the heightfield extends this far beyond the tile, so the occlusion bake reads real ground at the edge
  aoRing: number        // the occlusion bake's widest ring radius, m (it must fit in aoMargin)
  camera: {
    yaw0: number; yawRange: number            // yaw = yaw0 ± yawRange (decision 0010: ±45°)
    betaMin: number; betaMax: number          // pitch from vertical, rad
    rMin: number; rMax: number                // zoom, m
    fov: number                               // vertical field of view, rad
    aspectMax: number                         // the widest frame checked; wider screens keep this horizontal field of view (src/look/post.ts)
    horizonMargin: number                     // no frame corner comes nearer the horizon than this, rad (decision 0002)
    focusY: number                            // the focus height, m
  }
  ground: { lo: number; hi: number }          // lo: the lowest ground anywhere; hi: the highest on the tile, m (checked against the data)
  texel: { shadow: number; light: number; ao: number }   // the largest texel each bake may have, m
  sizes: { lightMap: number; aoCell: number; riverMask: number; reflMask: number; aoTex: number }   // texels per side; aoCell in m
  minSpec: { maxTexture: number; bakeMB: number }         // decision 0011: RTX 3060 laptop
  depth: { near: number; far: number }        // the sun camera's depth range, m
  shadowFade: number                          // shadows fade out over the shadow box's outer metres
}

export const SPEC: Spec = {
  tile: 800, tileSub: 448, far: 2600, farSub: 182, play: 235, margin: 165, aoMargin: 40, aoRing: 40,
  camera: { yaw0: -Math.PI / 2 - 0.35, yawRange: Math.PI / 4, betaMin: 0.3, betaMax: 0.98, rMin: 45, rMax: 260, fov: 0.62, aspectMax: 16 / 9, horizonMargin: 0.1, focusY: 8 },
  ground: { lo: 0, hi: 25 },   // the tile spans 0.4..20.3 m, the far ring 2.2..27.5 m; checked at load
  texel: { shadow: 0.33, light: 0.5, ao: 4 },
  sizes: { lightMap: 3072, aoCell: 3, riverMask: 2048, reflMask: 1536, aoTex: 768 },
  minSpec: { maxTexture: 8192, bakeMB: 600 },
  depth: { near: 100, far: 1600 },
  shadowFade: 32,
}

export interface Derived {
  spec: Spec
  cell: number; farCell: number
  band: number          // the far ring drops every triangle inside this half-size; the apron fills the band
  hfMargin: number      // heightfield nodes beyond the tile on each side
  footprint: number     // the largest ground distance from the focus to a frame corner over every allowed view, m
  sbias: string         // the shadow bias, 0.96 m in the sun camera's depth, as shader text
  defines: string[]     // the numbers the shaders read as macros
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(a))
const isInt = (x: number) => near(x, Math.round(x))

// Points of the frame (image x, y in −1..1, y up), cast onto ground planes at the given heights (a ray's hit is
// convex in the plane's height, so the range's two ends bound it) for every allowed zoom and pitch:
// the largest distance from the focus, or Infinity when a ray comes within `horizonMargin` of the horizon (it
// would show the sky, decision 0002). Yaw turns the footprint without changing its distances.
function reachOf(s: Spec, pts: number[][], planes: number[]): number {
  const c = s.camera, tv = Math.tan(c.fov / 2), th = tv * c.aspectMax
  let R = 0
  for (const groundY of planes) for (const beta of [c.betaMin, c.betaMax]) for (const r of [c.rMin, c.rMax]) for (const [sx, sy] of pts) {
    const drop = c.focusY - groundY
    if (r * Math.cos(beta) + drop <= 0) return Infinity   // the camera would be inside the ground
    // camera frame: forward tilted beta from straight down; up in the image is away from the camera on the ground
    const fy = -Math.cos(beta), fz = Math.sin(beta), uy = Math.sin(beta), uz = Math.cos(beta)
    const dx = sx * th, dy = fy + sy * tv * uy, dz = fz + sy * tv * uz, len = Math.hypot(dx, dy, dz)
    if (-dy / len < Math.sin(c.horizonMargin)) return Infinity
    const camY = r * Math.cos(beta) + drop, camZ = -r * Math.sin(beta), t = camY / -dy   // camera above that ground, behind the focus
    R = Math.max(R, Math.hypot(dx * t, camZ + dz * t))
  }
  return R
}
// the whole frame: the far ring must hold it. Its top reaches farthest on the lowest ground anywhere
export const footprintOf = (s: Spec): number => reachOf(s, [[-1, 1], [1, 1], [-1, -1], [1, -1]], [s.ground.lo])
// the frame below the focus row: the detailed tile must hold it, so the far ring shows only toward the top. Rays
// toward the camera reach farther on higher ground, so both ends of the tile's range bound it
export const nearReachOf = (s: Spec): number => reachOf(s, [[-1, 0], [1, 0], [-1, -1], [1, -1]], [s.ground.lo, s.ground.hi])

export function derive(s: Spec = SPEC): Derived {
  const bad: string[] = []
  const cell = s.tile / s.tileSub, farCell = s.far / s.farSub, c = s.camera
  // grids meet exactly: one far cell is a whole number of tile cells, and the tile edge lies on a far grid line
  if (!isInt(farCell / cell)) bad.push(`grid: a far cell (${farCell.toFixed(4)} m) is not a whole number of tile cells (${cell.toFixed(4)} m)`)
  else if (Math.round(farCell / cell) % 2) bad.push(`grid: a far cell spans an odd number of tile cells (${Math.round(farCell / cell)}); the apron fans from the middle one`)
  if (!isInt((s.far - s.tile) / 2 / farCell)) bad.push('grid: the tile edge does not lie on a far grid line')
  // coverage: the detailed tile holds the play area and its margin; the far ring holds every view
  if (s.tile / 2 < s.play + s.margin) bad.push(`coverage: tile/2 = ${s.tile / 2} m < play + margin = ${s.play + s.margin} m`)
  const nearReach = nearReachOf(s)
  if (!isFinite(nearReach)) bad.push('camera: the closest view sits at or below the highest tile ground, or sees the horizon below the focus row')
  else if (nearReach > s.margin) bad.push(`coverage: the frame below the focus reaches ${nearReach.toFixed(0)} m > margin ${s.margin} m (the far ring would show beside the play edge)`)
  if (s.aoMargin < s.aoRing) bad.push(`bake: the heightfield's margin ${s.aoMargin} m < the occlusion ring ${s.aoRing} m`)
  const footprint = footprintOf(s)
  if (!isFinite(footprint)) bad.push(`camera: a frame corner comes within ${c.horizonMargin} rad of the horizon (no sky, decision 0002)`)
  else if (s.play + footprint > s.far / 2) bad.push(`coverage: play + footprint = ${(s.play + footprint).toFixed(0)} m > far/2 = ${s.far / 2} m (a view sees past the world)`)
  // the camera stays locked down (decision 0010)
  if (c.yawRange > Math.PI / 4 + 1e-12) bad.push(`camera: yaw range ±${(c.yawRange * 180 / Math.PI).toFixed(1)}° > ±45° (decision 0010)`)
  if (!(c.betaMin < c.betaMax && c.rMin < c.rMax)) bad.push('camera: limits out of order')
  // bakes fit min-spec, at their texel targets
  const light = s.tile / s.sizes.lightMap
  if (light > s.texel.light) bad.push(`bake: light map texel ${light.toFixed(3)} m > ${s.texel.light} m`)
  if (s.sizes.aoCell > s.texel.ao) bad.push(`bake: occlusion cell ${s.sizes.aoCell} m > ${s.texel.ao} m`)
  if (s.sizes.aoCell >= 4) bad.push('bake: occlusion cells must be finer than the narrowest channel (4 m)')
  for (const [k, n] of Object.entries(s.sizes)) if (k !== 'aoCell' && n > s.minSpec.maxTexture) bad.push(`bake: ${k} ${n}² > ${s.minSpec.maxTexture}² (min-spec)`)
  if (s.depth.near >= s.depth.far) bad.push('bake: sun depth range out of order')
  if (bad.length) throw new Error('world spec: ' + bad.join('; '))
  const sbias = (0.96 / (s.depth.far - s.depth.near)).toFixed(6)
  return {
    spec: s, cell, farCell, band: s.tile / 2 + farCell, hfMargin: Math.ceil(s.aoMargin / cell), footprint, sbias,
    defines: [`#define SBIAS ${sbias}`, `#define FAR_W ${s.far.toFixed(1)}`, `#define TILE_HALF ${(s.tile / 2).toFixed(1)}`, `#define TILE_W ${s.tile.toFixed(1)}`],
  }
}

// a bake's memory, MB: RGBA8 unless given (the min-spec budget counts every resident bake)
export const bakeMB = (w: number, h: number, bytesPerTexel = 4): number => w * h * bytesPerTexel / (1024 * 1024)

// The shadow map, sized from the fitted box (known only once the ground is built): each side at the texel target.
// The texel target holds on the ground: light-space y lies in the sun's vertical plane, where one texel covers
// 1/sin(elevation) times as much ground, so that side is finer by sin(elevation).
export function shadowMapSize(d: Derived, boxW: number, boxH: number, sunSinElev: number): { w: number; h: number } {
  const s = d.spec, w = Math.ceil(boxW / s.texel.shadow), h = Math.ceil(boxH / (s.texel.shadow * sunSinElev))
  if (w > s.minSpec.maxTexture || h > s.minSpec.maxTexture) throw new Error(`world spec: bake: shadow map ${w}×${h} > ${s.minSpec.maxTexture}² (min-spec)`)
  // the two render targets also hold a depth buffer each (4 bytes a texel)
  const mb = 2 * bakeMB(w, h) + 2 * bakeMB(s.sizes.lightMap, s.sizes.lightMap) + bakeMB(s.sizes.aoTex, s.sizes.aoTex) + bakeMB(s.sizes.riverMask, s.sizes.riverMask) + bakeMB(s.sizes.reflMask, s.sizes.reflMask)
  if (mb > s.minSpec.bakeMB) throw new Error(`world spec: bake: ${mb.toFixed(0)} MB of bakes > ${s.minSpec.bakeMB} MB (min-spec)`)
  return { w, h }
}

// the drawn ground must stay inside the spec's range, which the camera's reach assumes: the tile within lo..hi,
// the far ring above lo
export function checkGround(s: Spec, tileLo: number, tileHi: number, farLo: number): void {
  if (tileLo < s.ground.lo || tileHi > s.ground.hi || farLo < s.ground.lo) throw new Error(`world spec: ground outside the spec: tile ${tileLo.toFixed(1)}..${tileHi.toFixed(1)} m, far ring from ${farLo.toFixed(1)} m; the spec allows ${s.ground.lo}..${s.ground.hi} m on the tile, ≥ ${s.ground.lo} m beyond`)
}

export const D = derive()
