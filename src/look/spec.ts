// The world spec (docs/proposals/engine-design.md §2–§6, docs/plans/done/l0-spine.md L0a): sizes are declared
// once, everything else is derived from them, and the invariants are checked when the spec is derived: a bad
// spec throws at load instead of drawing something subtly wrong. No DOM here, so tools and tests import it.

export interface Spec {
  tile: number // the detailed tile's side, m: the heightfield's mesh, the river's water, the bakes
  tileSub: number // tile grid cells per side
  far: number // the far ring's side, m: the backdrop out to the edge of any view
  farSub: number // far grid cells per side
  play: number // the camera focus stays within ±play in x and z
  // detail ⊇ play ⊕ margin: views near the play edge see the far ring only toward the top (checked against the camera)
  margin: number
  // the heightfield extends this far beyond the tile, so the occlusion bake reads real ground at the edge
  aoMargin: number
  aoRing: number // the occlusion bake's widest ring radius, m (it must fit in aoMargin)
  camera: {
    // yaw = yaw0 ± yawRange (decision 0010: ±45°)
    yaw0: number
    yawRange: number
    // pitch from vertical, rad
    betaMin: number
    betaMax: number
    // zoom, m
    rMin: number
    rMax: number
    fov: number // vertical field of view, rad
    aspectMax: number // the widest frame checked; wider screens keep this horizontal field of view (src/look/post.ts)
    horizonMargin: number // no frame corner comes nearer the horizon than this, rad (decision 0002)
    focusY: number // the demo world's focus height, m (a map world's focus follows its ground: FocusFollow)
    clearance: number // the eye never comes nearer the ground under it than this, m: the zoom
    // is held out where it would (clearRadius, ZoomHold; src/look/post.ts)
  }
  texel: { shadow: number; light: number; ao: number } // the largest texel each bake may have, m
  // texels per side; aoCell in m
  sizes: { lightMap: number; aoCell: number; riverMask: number; reflMask: number; aoTex: number; grain: number }
  minSpec: { maxTexture: number; bakeMB: number } // decision 0011: RTX 3060 laptop
  depth: { near: number; far: number } // the sun camera's depth range, m
  shadowFade: number // shadows fade out over the shadow box's outer metres
  // the terrain's detail layer (docs/plans/active/l2-detail.md, L2b): one texture tile spans `px` pixels of a frame
  // `lines` pixels tall at every zoom; the anti-tiling index varies over `index` metres of the world; the grain's
  // deviation is `amp` times the texture's own; the footprint's incidence never counts below `minCos`
  detail: { px: number; lines: number; index: number; amp: number; minCos: number }
  // the fine bank normals (docs/plans/done/w2-river-banks.md): texels of `texel` m over the tile, covering the
  // river's corridor out to `reach` m from its centre line, faded out over the last `fade` m, and over the last
  // `edge` m before the tile's edge (where the apron and the far ring shade with their vertex normals)
  // paint: the banks' colours reach this far from the water, m (W5a)
  bank: { texel: number; reach: number; fade: number; edge: number; paint: number }
  // the roads (docs/plans/done/roads.md): a grid of `cell` m cells over the tile, each listing the road segments within
  // their half width and `reach` m of it; their paint reaches `paint` m past a side (the cover's warp and wobble), the
  // junction weight is full within it of another line's side and gone by `junction` m; a pixel looks for a road only
  // where the cover's distance to a line (2 m cells) is under `near` m: the paint reaches at most `edge` m past a side
  // at the warped point (roadPaint, shore.glsl, clamps its ragged edge there), a cover texel's centre lies within √2 m
  // of it, its distance is rounded to 0.05 m, so 2.6 m loses no painted pixel (docs/plans/done/headroom.md). Before
  // the warp a pixel looks only within the gate (Derived.roadGate: `near` plus the warp's reach and slack)
  road: { cell: number; reach: number; paint: number; junction: number; near: number; edge: number }
  // the water data (docs/plans/done/w3-water-data.md): texels of `texel` m over the tile; the depth (the water level
  // minus the ground, signed) stored over depth[0]..depth[1] m, the shore distance over ±sdf m. The shore band
  // (docs/plans/done/w4-water-surface.md): within `band` m of the shoreline, on either side, the terrain and the
  // water paint the same colour (the drawn surfaces disagree on the shore by less: tools/water-look-check.mjs)
  // stones: the most stones in the water whose foam the water paints (W5a)
  water: { texel: number; depth: [number, number]; sdf: number; band: number; stones: number }
  // the ground's macro colour (docs/plans/active/l5-macro.md, L5a): baked at `texel` m over the tile and `far` m over
  // the far ring, `bakeTile` texels square a draw; the cover grid (src/look/world/cover.ts) has `cover` m cells; arm 5
  // (L5b) filters the bake over `kuwahara` m (on the far ring, a texel); the cover is read at a point swayed by up to
  // `warp`/2 m on each axis (coverWarp, macro.glsl: the class edges and the roads' paint wander)
  macro: { texel: number; far: number; bakeTile: number; cover: number; kuwahara: number; warp: number }
}

export const SPEC: Spec = {
  tile: 800,
  tileSub: 448,
  far: 2600,
  farSub: 182,
  play: 235,
  margin: 165,
  aoMargin: 40,
  aoRing: 40,
  camera: {
    yaw0: -Math.PI / 2 - 0.35,
    yawRange: Math.PI / 4,
    betaMin: 0.3,
    betaMax: 0.98,
    rMin: 15,
    rMax: 260,
    fov: 0.62,
    aspectMax: 16 / 9,
    horizonMargin: 0.1,
    focusY: 8,
    clearance: 6,
  },
  // light: 0.52 m looked the same as 0.26 m at every zoom, the trunks' strips kept (decision 0082)
  texel: { shadow: 0.33, light: 0.53, ao: 4 },
  sizes: { lightMap: 1536, aoCell: 3, riverMask: 2048, reflMask: 1536, aoTex: 768, grain: 512 },
  minSpec: { maxTexture: 8192, bakeMB: 600 },
  depth: { near: 100, far: 1600 },
  shadowFade: 32,
  detail: { px: 2048, lines: 1080, index: 400, amp: 0.4, minCos: 0.05 },
  bank: { texel: 0.5, reach: 14, fade: 3, edge: 10, paint: 7.5 },
  road: { cell: 8, reach: 7, paint: 3.2, junction: 6, near: 2.6, edge: 1.07 },
  water: { texel: 0.5, depth: [-1, 2], sdf: 16, band: 0.75, stones: 24 },
  macro: { texel: 0.5, far: 4, bakeTile: 512, cover: 2, kuwahara: 2, warp: 3 },
}

export interface Derived {
  spec: Spec
  cell: number
  farCell: number
  band: number // the far ring drops every triangle inside this half-size; the apron fills the band
  hfMargin: number // heightfield nodes beyond the tile on each side
  bankN: number // the bank normal map's texels per side
  roadGate: number // a pixel looks for a road only where the cover's distance to a line is under it, m (spec road)
  roadN: number // the roads' grid cells per side
  // the macro bakes' texels per side: the tile's, the far ring's
  macroN: number
  macroFarN: number
  waterN: number // the water data's texels per side
  sbias: string // the shadow bias, 0.96 m in the sun camera's depth, as shader text
  defines: string[] // the numbers the shaders read as macros
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(a))
const isInt = (x: number) => near(x, Math.round(x))

/** The heights a world's camera meets, m (groundOf, from its look data at load): the tile's lowest and highest ground
 *  (its heightfield, margin included), the far ring's lowest, and the range the focus keeps to (FocusFollow clamps
 *  its height to it: the demo's a single height, SPEC.camera.focusY; a map world's its ground in play) */
export interface WorldGround {
  lo: number
  hi: number
  farLo: number
  focus: readonly [number, number]
}

// Points of the frame (image x, y in −1..1, y up), cast onto ground planes `drop` m below the focus (the focus's
// height less the ground's; negative: ground above the focus. A ray's hit is convex in the plane's height, so the
// range's two ends bound it) for every allowed zoom and pitch:
// the largest distance from the focus, or Infinity when a ray comes within `horizonMargin` of the horizon (it
// would show the sky, decision 0002). Yaw turns the footprint without changing its distances. Over ground that high
// the closest zoom is held out until the eye is `clearance` above it (src/look/post.ts): the reach is affine in the
// radius, so the held radius and rMax bound it; held past rMax, the camera would be inside the ground.
function reachOf(s: Spec, pts: number[][], drops: number[]): number {
  const c = s.camera
  const tv = Math.tan(c.fov / 2)
  const th = tv * c.aspectMax
  let R = 0
  for (const drop of drops) {
    for (const beta of [c.betaMin, c.betaMax]) {
      for (const r0 of [c.rMin, c.rMax]) {
        for (const [sx, sy] of pts) {
          const r = Math.max(r0, (c.clearance - drop) / Math.cos(beta))
          // the camera would be inside the ground
          if (r > c.rMax + 1e-9 || r * Math.cos(beta) + drop <= 0) return Infinity
          // camera frame: forward tilted beta from straight down; up in the image is away from the camera on the ground
          const fy = -Math.cos(beta)
          const fz = Math.sin(beta)
          const uy = Math.sin(beta)
          const uz = Math.cos(beta)
          const dx = sx * th
          const dy = fy + sy * tv * uy
          const dz = fz + sy * tv * uz
          const len = Math.hypot(dx, dy, dz)
          if (-dy / len < Math.sin(c.horizonMargin)) return Infinity
          // camera above that ground, behind the focus
          const camY = r * Math.cos(beta) + drop
          const camZ = -r * Math.sin(beta)
          const t = camY / -dy
          R = Math.max(R, Math.hypot(dx * t, camZ + dz * t))
        }
      }
    }
  }
  return R
}
// the whole frame: the far ring must hold it. Its top reaches farthest on the lowest ground anywhere, the focus at
// its highest
export const footprintOf = (s: Spec, g: WorldGround): number =>
  reachOf(
    s,
    [
      [-1, 1],
      [1, 1],
      [-1, -1],
      [1, -1],
    ],
    [g.focus[1] - Math.min(g.lo, g.farLo)],
  )
// the frame below the focus row: the detailed tile must hold it, so the far ring shows only toward the top. Rays
// toward the camera reach farther on higher ground, so both ends of the drop from the focus to the tile's ground
// bound it (the focus highest over the lowest ground, lowest under the highest)
export const nearReachOf = (s: Spec, g: WorldGround): number =>
  reachOf(
    s,
    [
      [-1, 0],
      [1, 0],
      [-1, -1],
      [1, -1],
    ],
    [g.focus[1] - g.lo, g.focus[0] - g.hi],
  )

// flat ground with the focus on it: the camera's own checks (derive), before any world's ground is known
const FLAT: WorldGround = { lo: 0, hi: 0, farLo: 0, focus: [0, 0] }

/** The camera against a world's ground (at load: src/look/main.ts): the whole frame inside the far ring, no view held
 *  inside the ground or near the horizon (decision 0002). Throws on a world the camera cannot show; returns the two
 *  reaches, m (planes: bounds). The frame below the focus row inside the tile is the world's relief's to say: the
 *  planes' bound is far too loose on a slope (the Pratzen's 205 m against the 169 m its ground gives), so it is
 *  marched on each world's data in the tests (nearFrameOf), and only flat ground is held to the margin here (derive) */
export function checkView(s: Spec, g: WorldGround): { footprint: number; nearReach: number } {
  const bad: string[] = []
  const c = s.camera
  if (!(g.lo <= g.hi && g.focus[0] <= g.focus[1])) bad.push('ground: a range out of order')
  const nearReach = nearReachOf(s, g)
  if (!isFinite(nearReach)) {
    bad.push(
      'camera: a view would sit inside the highest tile ground (held out to its clearance past rMax), or sees the horizon below the focus row',
    )
  }
  const footprint = footprintOf(s, g)
  if (!isFinite(footprint)) {
    bad.push(`camera: a frame corner comes within ${c.horizonMargin} rad of the horizon (no sky, decision 0002)`)
  } else if (s.play + footprint > s.far / 2) {
    bad.push(
      `coverage: play + footprint = ${(s.play + footprint).toFixed(0)} m > far/2 = ${s.far / 2} m (a view sees past the world)`,
    )
  }
  if (bad.length) {
    const at = `ground ${g.lo.toFixed(1)}..${g.hi.toFixed(1)} m, far ring from ${g.farLo.toFixed(1)} m, focus ${g.focus[0].toFixed(1)}..${g.focus[1].toFixed(1)} m`
    throw new Error(`world spec (${at}): ` + bad.join('; '))
  }
  return { footprint, nearReach }
}

// the road segments a cell of the roads' grid lists (src/look/world/data.ts, the shader's roadAt)
export const ROAD_SLOTS = 16
// the fine warp's reach on a map world's finer cover, m (about ±0.9 m: the blotches span about ±0.3 of it)
export const COVER_FINE = 3
export function derive(s: Spec = SPEC): Derived {
  const bad: string[] = []
  const cell = s.tile / s.tileSub
  const farCell = s.far / s.farSub
  const c = s.camera
  // the cover's warp moves a point up to warp/2 m on each axis (the diagonal's reach); the roads' gate before it, 8 cm
  // of slack (shore.glsl's ROAD_GATE, the road split's triangles in src/look/main.ts)
  const warpReach = (s.macro.warp / 2) * Math.SQRT2
  const roadGate = s.road.near + warpReach + 0.08
  // grids meet exactly: one far cell is a whole number of tile cells, and the tile edge lies on a far grid line
  if (!isInt(farCell / cell)) {
    bad.push(`grid: a far cell (${farCell.toFixed(4)} m) is not a whole number of tile cells (${cell.toFixed(4)} m)`)
  } else if (Math.round(farCell / cell) % 2) {
    bad.push(
      `grid: a far cell spans an odd number of tile cells (${Math.round(farCell / cell)}); the apron fans from the middle one`,
    )
  }
  if (!isInt((s.far - s.tile) / 2 / farCell)) bad.push('grid: the tile edge does not lie on a far grid line')
  // coverage: the detailed tile holds the play area and its margin; the far ring holds every view
  if (s.tile / 2 < s.play + s.margin) {
    bad.push(`coverage: tile/2 = ${s.tile / 2} m < play + margin = ${s.play + s.margin} m`)
  }
  if (!(c.clearance > 0)) bad.push("camera: the eye's clearance over the ground must be positive")
  else {
    // the camera's own checks on flat ground (each world's: checkView, at load, and nearFrameOf on its data)
    try {
      const { nearReach } = checkView(s, FLAT)
      if (nearReach > s.margin) {
        bad.push(
          `coverage: the frame below the focus reaches ${nearReach.toFixed(0)} m > margin ${s.margin} m (the far ring would show beside the play edge)`,
        )
      }
    } catch (e) {
      bad.push((e as Error).message.replace(/^world spec \([^)]*\): /, ''))
    }
  }
  if (s.aoMargin < s.aoRing) {
    bad.push(`bake: the heightfield's margin ${s.aoMargin} m < the occlusion ring ${s.aoRing} m`)
  }
  // the camera stays locked down (decision 0010)
  if (c.yawRange > Math.PI / 4 + 1e-12) {
    bad.push(`camera: yaw range ±${((c.yawRange * 180) / Math.PI).toFixed(1)}° > ±45° (decision 0010)`)
  }
  if (!(c.betaMin < c.betaMax && c.rMin < c.rMax)) bad.push('camera: limits out of order')
  // bakes fit min-spec, at their texel targets
  const light = s.tile / s.sizes.lightMap
  if (light > s.texel.light) bad.push(`bake: light map texel ${light.toFixed(3)} m > ${s.texel.light} m`)
  if (s.sizes.aoCell > s.texel.ao) bad.push(`bake: occlusion cell ${s.sizes.aoCell} m > ${s.texel.ao} m`)
  if (s.sizes.aoCell >= 4) bad.push('bake: occlusion cells must be finer than the narrowest channel (4 m)')
  for (const [k, n] of Object.entries(s.sizes)) {
    if (k !== 'aoCell' && n > s.minSpec.maxTexture) bad.push(`bake: ${k} ${n}² > ${s.minSpec.maxTexture}² (min-spec)`)
  }
  if (s.depth.near >= s.depth.far) bad.push('bake: sun depth range out of order')
  if (ROAD_SLOTS % 4) bad.push(`road: ROAD_SLOTS (${ROAD_SLOTS}) is not a whole number of RGBA texels`)
  if (!(s.road.paint < s.road.junction && s.road.junction <= s.road.reach)) {
    bad.push('road: the paint must reach less far than the junction weight, and that no further than the grid lists')
  }
  // (the cover is read at the warped point, roadAt: the edge, a cover cell's half diagonal, the distance's rounding)
  if (!(s.road.near >= s.road.edge + s.macro.cover * 0.71 + 0.05 && roadGate <= 25.5)) {
    bad.push(
      'road: near must cover the paint past the warp plus a cover cell half diagonal, within the cover distance channel (25.5 m)',
    )
  }
  if (!isInt(s.tile / s.road.cell)) {
    bad.push(`road: the tile (${s.tile} m) is not a whole number of ${s.road.cell} m cells`)
  }
  if (!isInt(s.tile / s.bank.texel)) {
    bad.push(`bank: the tile (${s.tile} m) is not a whole number of ${s.bank.texel} m texels`)
  } else if (s.tile / s.bank.texel > s.minSpec.maxTexture) {
    bad.push(`bake: bank normals ${s.tile / s.bank.texel}² > ${s.minSpec.maxTexture}² (min-spec)`)
  }
  if (!(s.bank.fade > 0 && s.bank.fade < s.bank.reach && s.bank.edge > 0 && s.bank.edge < s.tile / 2)) {
    bad.push("bank: the fades must be positive, the corridor's inside the reach and the edge's inside the tile")
  }
  if (!isInt(s.tile / s.water.texel)) {
    bad.push(`water: the tile (${s.tile} m) is not a whole number of ${s.water.texel} m texels`)
  } else if (s.tile / s.water.texel > s.minSpec.maxTexture) {
    bad.push(`bake: water data ${s.tile / s.water.texel}² > ${s.minSpec.maxTexture}² (min-spec)`)
  }
  if (!(s.water.depth[0] < 0 && s.water.depth[1] > 0 && s.water.sdf > 0)) {
    bad.push('water: the depth range must hold 0 (the shore) and the shore distance be positive')
  }
  if (!(s.bank.paint > 1 && s.bank.paint <= s.bank.reach - s.bank.fade)) {
    bad.push(
      "bank: the banks' colours must reach past a metre and stay where the bank normals are whole (reach − fade)",
    )
  }
  if (!(Number.isInteger(s.water.stones) && s.water.stones > 0 && s.water.stones <= 64)) {
    bad.push('water: the stones the water paints foam for must be a whole number, 1–64 (a fixed loop in the shader)')
  }
  if (!(s.water.band > 0 && s.water.band < s.water.sdf / 2)) {
    bad.push("water: the shore band must be positive and well inside the shore distance's range")
  }
  for (const [k, side, t] of [
    ['tile', s.tile, s.macro.texel],
    ['far ring', s.far, s.macro.far],
    ['cover', s.far, s.macro.cover],
  ] as const) {
    if (!isInt(side / t)) bad.push(`macro: the ${k} (${side} m) is not a whole number of ${t} m texels`)
    else if (side / t > s.minSpec.maxTexture) {
      bad.push(`bake: macro ${k} ${side / t}² > ${s.minSpec.maxTexture}² (min-spec)`)
    }
  }
  if (!(s.macro.bakeTile >= 64 && s.macro.bakeTile <= 2048)) {
    bad.push('macro: a bake draw must be 64–2048 texels square')
  }
  if (!(s.macro.kuwahara > 0 && s.macro.kuwahara / s.macro.texel <= 4)) {
    bad.push('macro: the Kuwahara radius must be over 0 and at most 4 tile texels (KUWAHARA_MAX, src/look/macro.ts)')
  }
  if (!(s.detail.px > 0 && s.detail.lines > 0 && s.detail.index > 0 && s.detail.amp > 0 && s.detail.minCos > 0)) {
    bad.push('detail: sizes must be positive')
  }
  if (!(s.road.paint >= warpReach + s.road.edge)) {
    bad.push('road: paint short of the warp and the edge (the junction weight is full within it)')
  }
  if (bad.length) throw new Error('world spec: ' + bad.join('; '))
  const sbias = (0.96 / (s.depth.far - s.depth.near)).toFixed(6)
  return {
    spec: s,
    cell,
    farCell,
    band: s.tile / 2 + farCell,
    hfMargin: Math.ceil(s.aoMargin / cell),
    sbias,
    bankN: Math.round(s.tile / s.bank.texel),
    roadGate,
    roadN: Math.round(s.tile / s.road.cell),
    macroN: Math.round(s.tile / s.macro.texel),
    macroFarN: Math.round(s.far / s.macro.far),
    waterN: Math.round(s.tile / s.water.texel),
    defines: [
      `#define SBIAS ${sbias}`,
      `#define FAR_W ${s.far.toFixed(1)}`,
      `#define TILE_HALF ${(s.tile / 2).toFixed(1)}`,
      `#define TILE_W ${s.tile.toFixed(1)}`,
      `#define ROAD_CELL ${s.road.cell.toFixed(1)}`,
      `#define ROAD_N ${Math.round(s.tile / s.road.cell)}.0`,
      `#define ROAD_SLOTS ${ROAD_SLOTS}`,
      `#define ROAD_PAINT ${s.road.paint.toFixed(3)}`,
      `#define ROAD_JUNCTION ${s.road.junction.toFixed(3)}`,
      `#define ROAD_NEAR ${s.road.near.toFixed(3)}`,
      `#define ROAD_GATE ${roadGate.toFixed(3)}`,
      `#define ROAD_EDGE ${s.road.edge.toFixed(3)}`,
      `#define COVER_WARP ${s.macro.warp.toFixed(3)}`,
      // a map world's finer cover (src/look/world/from-map.ts, MAP_COVER_CELL) takes a fine warp too, so a slanted
      // class edge wanders instead of stepping by its cells (macro.glsl, coverWarp); the demo's cover cells are these
      `#define COVER_CELL ${s.macro.cover.toFixed(3)}`,
      `#define COVER_FINE ${COVER_FINE.toFixed(3)}`,
      // amp: the grain's deviation, as a fraction of the texture's own; minCos: the incidence's floor (the pixel angle
      // is the uniform uPixA: it follows the camera's field of view)
      `#define DETAIL_MINCOS ${s.detail.minCos.toFixed(3)}`,
      `#define DETAIL_PX ${s.detail.px.toFixed(1)}`,
      `#define DETAIL_INDEX ${s.detail.index.toFixed(1)}`,
      `#define DETAIL_AMP ${s.detail.amp.toFixed(3)}`,
      // the water data's encoding (src/look/shaders/waterdata.glsl)
      `#define WATER_D0 ${s.water.depth[0].toFixed(3)}`,
      `#define WATER_D1 ${s.water.depth[1].toFixed(3)}`,
      `#define WATER_SDF ${s.water.sdf.toFixed(3)}`,
      `#define WATER_BAND ${s.water.band.toFixed(3)}`,
      `#define BANK_EDGE ${s.bank.edge.toFixed(3)}`,
      `#define STONES ${s.water.stones}`,
      `#define BANK_REACH ${s.bank.paint.toFixed(3)}`,
    ],
  }
}

// a bake's memory, MB: RGBA8 unless given (the min-spec budget counts every resident bake)
export const bakeMB = (w: number, h: number, bytesPerTexel = 4): number => (w * h * bytesPerTexel) / (1024 * 1024)

/** The resident bakes' memory, MB, with a w × h shadow map: every render target also holds a 4-byte depth buffer
 *  (the shadow map, the light map and the soldiers' shade, the latter the light map's size). */
export function bakesMB(d: Derived, w: number, h: number): number {
  const s = d.spec
  return (
    2 * bakeMB(w, h) +
    // the light map and the soldiers' shade (bakes.ts unitShade, its size, made under ?armies)
    4 * bakeMB(s.sizes.lightMap, s.sizes.lightMap) +
    bakeMB(s.sizes.aoTex, s.sizes.aoTex) +
    bakeMB(s.sizes.riverMask, s.sizes.riverMask) +
    bakeMB(s.sizes.reflMask, s.sizes.reflMask) +
    bakeMB(d.bankN, d.bankN) +
    bakeMB(d.waterN, d.waterN) + // the bank normals and the water data (no mips: src/look/span-texture.ts)
    bakeMB((d.roadN * ROAD_SLOTS) / 4, d.roadN, 16) +
    bakeMB(s.minSpec.maxTexture, 1, 16) + // the roads grid and at most a row of segments (RGBA float)
    ((bakeMB(d.macroN, d.macroN) + bakeMB(d.macroFarN, d.macroFarN)) * 4) / 3 +
    bakeMB(s.far / s.macro.cover, s.far / s.macro.cover) // the macro colour (mipmapped) and the cover grid
  )
}

// The shadow map, sized from the fitted box (known only once the ground is built): each side at the texel target.
// The texel target holds on the ground: light-space y lies in the sun's vertical plane, where one texel covers
// 1/sin(elevation) times as much ground, so that side is finer by sin(elevation).
export function shadowMapSize(d: Derived, boxW: number, boxH: number, sunSinElev: number): { w: number; h: number } {
  const s = d.spec
  const w = Math.ceil(boxW / s.texel.shadow)
  const h = Math.ceil(boxH / (s.texel.shadow * sunSinElev))
  if (w > s.minSpec.maxTexture || h > s.minSpec.maxTexture) {
    throw new Error(`world spec: bake: shadow map ${w}×${h} > ${s.minSpec.maxTexture}² (min-spec)`)
  }
  const mb = bakesMB(d, w, h)
  if (mb > s.minSpec.bakeMB) {
    throw new Error(`world spec: bake: ${mb.toFixed(0)} MB of bakes > ${s.minSpec.bakeMB} MB (min-spec)`)
  }
  return { w, h }
}

// m: the closest zoom the look was tuned at (decision 0051 keeps what was tuned there: the depth of field's zoom ease,
// the render scale's Auto edges, the bench's close camera)
export const TUNED_R = 45

// The radius that keeps the eye `clearance` above the ground under it (the closest zoom over high ground: reachOf
// assumes it): the radius asked for if the eye clears there, else the first one out that does (0.5 m steps, then
// bisected to a millimetre; the ground under the eye moves with the radius, so no fixed point is assumed), at most
// rMax. The orbit camera's eye: the focus plus r (cos a sin b, cos b, sin a sin b)
export function clearRadius(
  c: Spec['camera'],
  r: number,
  alpha: number,
  beta: number,
  tx: number,
  ty: number,
  tz: number,
  ground: (x: number, z: number) => number,
): number {
  const ca = Math.cos(alpha)
  const sa = Math.sin(alpha)
  const sb = Math.sin(beta)
  const cb = Math.cos(beta)
  const clears = (q: number) => q * cb + ty - ground(tx + q * ca * sb, tz + q * sa * sb) >= c.clearance
  if (clears(r)) return r
  let lo = r
  let hi = Math.min(c.rMax, r + 0.5)
  while (!clears(hi)) {
    if (hi >= c.rMax) return c.rMax
    lo = hi
    hi = Math.min(c.rMax, hi + 0.5)
  }
  while (hi - lo > 1e-3) {
    const m = (lo + hi) / 2
    if (clears(m)) hi = m
    else lo = m
  }
  return hi
}

/** The player's zoom kept apart from the held one: the camera shows the wanted radius, or more where the hold says
 *  (clearRadius over high ground), and comes back in when the ground falls away. The page's zoom inputs and the tools
 *  set the wanted radius (set: the wheel, the pinch and the slider scale it, not the radius shown); a radius another
 *  input gives the camera itself (Babylon's own pointers) is taken as the new wanted one */
export class ZoomHold {
  wanted = NaN
  private shown = NaN
  private explicit = false
  /** the wanted radius, as the player or a tool asks for it */
  set(r: number): void {
    this.wanted = r
    this.explicit = true
  }
  /** the radius to show, given the camera's now and the hold */
  step(current: number, hold: (r: number) => number): number {
    if (this.explicit) this.explicit = false
    else if (current !== this.shown) this.wanted = current
    this.shown = hold(this.wanted)
    return this.shown
  }
}

/** The radius, m, from which the eye clears ground `rise` m above the focus (at the steepest pitch) by its clearance:
 *  with `rise` the highest ground within the eye's reach (eyeReach) over the focus, no ground to read from there out */
export const clearBelow = (s: Spec, rise: number): number => (rise + s.camera.clearance) / Math.cos(s.camera.betaMax)

/** How far from the focus the ground under the eye can lie, m: the widest zoom at the steepest pitch */
export const eyeReach = (s: Spec): number => s.camera.rMax * Math.sin(s.camera.betaMax)

/** The orbit camera the hold steers (Babylon's ArcRotateCamera in src/look/post.ts; a stand-in in the tests) */
export interface OrbitView {
  alpha: number
  beta: number
  radius: number
  target: { x: number; y: number; z: number }
}

/** A world's ground as the camera's hold reads it (src/look/post.ts): its height at x, z (the drawn ground), the
 *  highest ground within `reach` m of x, z (or above it: a bound; maxGrid), and the focus's follower */
export interface HoldGround {
  ground: (x: number, z: number) => number
  highest: (x: number, z: number, reach: number) => number
  follow: FocusFollow
}

/** The camera's hold, once a frame before it renders (src/look/post.ts): the focus kept within ±play, its height on the
 *  ground under it (FocusFollow; dt, s, since the last frame), and the radius the zoom hold gives, held out over high
 *  ground where the eye could come within its clearance of it (clearRadius below clearBelow of the highest ground
 *  within the eye's reach), the player's wanted zoom kept apart so it comes back in on lower ground (#145) */
export function holdView(s: Spec, zoom: ZoomHold, cam: OrbitView, w: HoldGround, dt: number): void {
  const t = cam.target
  t.x = Math.max(-s.play, Math.min(s.play, t.x))
  t.z = Math.max(-s.play, Math.min(s.play, t.z))
  t.y = w.follow.step(t.x, t.z, Number.isNaN(zoom.wanted) ? cam.radius : zoom.wanted, dt, w.ground)
  const below = clearBelow(s, w.highest(t.x, t.z, eyeReach(s)) - t.y)
  const r = zoom.step(cam.radius, q =>
    q < below ? clearRadius(s.camera, q, cam.alpha, cam.beta, t.x, t.y, t.z, w.ground) : q,
  )
  if (r !== cam.radius) cam.radius = r
}

/** The spread of the ground under the focus at the zoom `radius`, m (FOLLOW) */
export const spreadOf = (radius: number): number =>
  Math.max(FOLLOW.spreadMin, Math.min(FOLLOW.spreadMax, FOLLOW.spread * radius))

/** The focus's follow: its spread (the disc the ground is averaged over, `spread` times the zoom, within min..max m),
 *  its easing time (s), and a jump (a step of the focus over `jump` m plus `jumpR` times the zoom in one frame: a new
 *  view, taken at once). A pan moves the focus at most about a tenth of the zoom a frame (src/look/post.ts) */
export const FOLLOW = { spread: 0.15, spreadMin: 3, spreadMax: 30, tau: 0.3, jump: 10, jumpR: 0.5 }

/** The ground under the focus, m: the mean of the ground at the focus and on two rings round it (six points at half
 *  the spread `r`, six at the spread, the outer turned by 30°), so a ditch or a sunken road narrower than the spread
 *  barely moves it */
export function groundUnder(ground: (x: number, z: number) => number, x: number, z: number, r: number): number {
  let sum = ground(x, z)
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3
    sum += ground(x + 0.5 * r * Math.cos(a), z + 0.5 * r * Math.sin(a))
    sum += ground(x + r * Math.cos(a + Math.PI / 6), z + r * Math.sin(a + Math.PI / 6))
  }
  return sum / 13
}

/** The focus's height, following the ground under it (decision 0002 holds: the camera stays the top-down view, only
 *  its pivot rises and falls): the ground under the focus (groundUnder, spread by the zoom) clamped to the world's
 *  focus range, eased up over FOLLOW.tau so a pan up a ridge does not jolt, and down at once (that ground is itself a
 *  mean, so it falls smoothly; never above it, the frame reaches no farther than nearFrameOf marched); the first frame
 *  and a jump are taken at once. A range of one height (the demo's 8 m plane) never reads the ground */
export class FocusFollow {
  y = NaN
  private x = NaN
  private z = NaN
  readonly range: readonly [number, number]
  constructor(range: readonly [number, number]) {
    this.range = range
  }
  /** the focus's height this frame, at x, z, at the zoom `radius` (m), dt (s) since the last */
  step(x: number, z: number, radius: number, dt: number, ground: (x: number, z: number) => number): number {
    const [lo, hi] = this.range
    const f = FOLLOW
    const want = lo === hi ? lo : Math.max(lo, Math.min(hi, groundUnder(ground, x, z, spreadOf(radius))))
    // (NaN on the first frame: not within, so taken at once)
    const near = Math.hypot(x - this.x, z - this.z) <= f.jump + f.jumpR * radius
    this.y = near && want > this.y ? this.y + (want - this.y) * (1 - Math.exp(-Math.max(0, dt) / f.tau)) : want
    this.x = x
    this.z = z
    return this.y
  }
}

/** How far into the world the frame below the focus row reaches on a world's ground, m on either axis (the largest
 *  |x| or |z| where its rays meet the ground; the tile must hold it, so the far ring shows only toward the top): its
 *  corners and its focus row's ends, from views with the focus on the play area's edge every `step` m, at the yaw's
 *  ends and middle, the pitch's ends, the closest zoom (held out: clearRadius) and the widest. focusY: the focus's
 *  height at x, z for the zoom (the follow's want, which it is never above: FocusFollow). Marched in 2 m steps, then
 *  bisected; Infinity when a ray meets no ground within 3 km. Sampled, not a bound: the tests run it on each world's
 *  data */
export function nearFrameOf(
  s: Spec,
  ground: (x: number, z: number) => number,
  focusY: (x: number, z: number, radius: number) => number,
  step = 10,
): number {
  const c = s.camera
  const tv = Math.tan(c.fov / 2)
  const th = tv * c.aspectMax
  const p = s.play
  const foci: [number, number][] = []
  for (let u = -p; u <= p + 1e-9; u += step) foci.push([u, -p], [u, p], [-p, u], [p, u])
  let far = 0
  for (const [fx, fz] of foci) {
    for (const k of [-1, -0.5, 0, 0.5, 1]) {
      const a = c.yaw0 + k * c.yawRange
      for (const b of [c.betaMin, c.betaMax]) {
        for (const r0 of [c.rMin, c.rMax]) {
          const fy = focusY(fx, fz, r0)
          const r = clearRadius(c, r0, a, b, fx, fy, fz, ground)
          // the eye, its forward (to the focus), the image's up and right
          const ca = Math.cos(a)
          const sa = Math.sin(a)
          const sb = Math.sin(b)
          const cb = Math.cos(b)
          const e = [fx + r * ca * sb, fy + r * cb, fz + r * sa * sb]
          const F = [-ca * sb, -cb, -sa * sb]
          const U = [-ca * cb, sb, -sa * cb]
          const R = [F[1] * U[2] - F[2] * U[1], F[2] * U[0] - F[0] * U[2], F[0] * U[1] - F[1] * U[0]]
          for (const [sx, sy] of [
            [-1, 0],
            [1, 0],
            [-1, -1],
            [1, -1],
          ]) {
            const d = [0, 1, 2].map(i => F[i] + sx * th * R[i] + sy * tv * U[i])
            const l = Math.hypot(d[0], d[1], d[2])
            const above = (t: number) => e[1] + (d[1] / l) * t - ground(e[0] + (d[0] / l) * t, e[2] + (d[2] / l) * t)
            let t0 = 0
            let t1 = NaN
            for (let t = 2; t <= 3000; t += 2) {
              if (above(t) <= 0) {
                t1 = t
                break
              }
              t0 = t
            }
            if (Number.isNaN(t1)) return Infinity
            for (let i = 0; i < 12; i++) {
              const m = (t0 + t1) / 2
              if (above(m) > 0) t0 = m
              else t1 = m
            }
            far = Math.max(far, Math.abs(e[0] + (d[0] / l) * t1), Math.abs(e[2] + (d[2] / l) * t1))
          }
        }
      }
    }
  }
  return far
}

/** A grid of nodes (the heightfield, the far ring: src/look/heightfield.ts): node (i, j) at x0 + i·cell, z0 + j·cell */
export interface NodeGrid {
  n: number
  cell: number
  x0: number
  z0: number
  h: ArrayLike<number>
}

/** The highest node within `reach` m of x, z on each axis (a square: a bound of the disc), from blocks of `block`²
 *  nodes, each its own and its next row's and column's highest (so the ground between two blocks, a cell's
 *  interpolation of its four nodes, is never above its block's). -Infinity where the square misses the grid */
export function maxGrid(g: NodeGrid, block: number): (x: number, z: number, reach: number) => number {
  const nb = Math.ceil((g.n - 1) / block)
  const m = new Float64Array(nb * nb).fill(-Infinity)
  // the blocks a node belongs to: its own, and the one before where it lies on their edge
  const lo = (k: number) => Math.max(0, Math.ceil(k / block) - 1)
  const hi = (k: number) => Math.min(nb - 1, Math.floor(k / block))
  for (let j = 0; j < g.n; j++) {
    for (let i = 0; i < g.n; i++) {
      const v = g.h[j * g.n + i]
      for (let bj = lo(j); bj <= hi(j); bj++) {
        for (let bi = lo(i); bi <= hi(i); bi++) if (v > m[bj * nb + bi]) m[bj * nb + bi] = v
      }
    }
  }
  const span = g.cell * block
  return (x, z, reach) => {
    const b0 = (p: number, o: number) => Math.max(0, Math.floor((p - reach - o) / span))
    const b1 = (p: number, o: number) => Math.min(nb - 1, Math.floor((p + reach - o) / span))
    let hi = -Infinity
    for (let bj = b0(z, g.z0); bj <= b1(z, g.z0); bj++) {
      for (let bi = b0(x, g.x0); bi <= b1(x, g.x0); bi++) if (m[bj * nb + bi] > hi) hi = m[bj * nb + bi]
    }
    return hi
  }
}

/** A world's ground from its look data (src/look/main.ts at load): the heightfield's range, the far ring's lowest, and
 *  the focus's range: one height on a world whose focus keeps a plane (`plane`: the demo's), else the lowest and
 *  highest node within ±play (the ground the focus can stand over) */
export function groundOf(s: Spec, hf: NodeGrid, far: NodeGrid, plane: number | null): WorldGround {
  let lo = Infinity
  let hi = -Infinity
  let pLo = Infinity
  let pHi = -Infinity
  for (let j = 0; j < hf.n; j++) {
    const z = hf.z0 + j * hf.cell
    for (let i = 0; i < hf.n; i++) {
      const v = hf.h[j * hf.n + i]
      if (v < lo) lo = v
      if (v > hi) hi = v
      if (Math.abs(hf.x0 + i * hf.cell) <= s.play && Math.abs(z) <= s.play) {
        if (v < pLo) pLo = v
        if (v > pHi) pHi = v
      }
    }
  }
  let farLo = Infinity
  for (let k = 0; k < far.h.length; k++) if (far.h[k] < farLo) farLo = far.h[k]
  return { lo, hi, farLo, focus: plane === null ? [pLo, pHi] : [plane, plane] }
}

export const D = derive()
