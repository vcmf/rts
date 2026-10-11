// The look page (app/look.html): the painted world in the game's toolchain, ported from
// prototypes/painted-cinematic.html with no change to the look (docs/plans/done/l0-spine.md, L0c). Built in the
// prototype's order: mesh and material creation order decides draw order, and the goldens compare pixels.
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js'
import { Camera } from '@babylonjs/core/Cameras/camera.js'
import { Engine } from '@babylonjs/core/Engines/engine.js'
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js'
import type { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js'
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector.js'
import { CreateLines } from '@babylonjs/core/Meshes/Builders/linesBuilder.js'
import { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import { Scene } from '@babylonjs/core/scene.js'
import '../../prototypes/nature-pack.data.js'
import { buildBakes } from './bakes.ts'
import { runBench, showBench } from './bench.ts'
import { grainMean, grainTexture, lumOf, makeGrainCanvas, makeSmoothGrainCanvas } from './grain.ts'
import { CLEAR, Materials, PAL, S } from './materials.ts'
import { buildNature } from './nature.ts'
import { Post, buildCamera } from './post.ts'
import LOOK_URL from '../../data/painted-world.lookdata?url'
import { groundAt, setHeightfield } from './heightfield.ts'
import { RIVER, bankReachAt, lerpA, riverQuery, setRiver, wetEdgeAt, wetEdges } from './river.ts'
import { D, checkGround } from './spec.ts'
import { axisX, baseH } from './world/author.ts'
import { checkLookData, decodeLook } from './world/data.ts'
import { buildTerrain } from './terrain.ts'
import { buildWater } from './water.ts'
import { spanTexture } from './span-texture.ts'
import { WATER_FILL } from './world/water-data.ts'
import { Lab } from './lab.ts'

declare global { interface Window { __T0?: number } }
const T0 = window.__T0 ?? performance.now()   // load-time measurement (window.__buildMs), started by look.html
if (!window.NATURE) { document.body.innerHTML = '<p style="padding:30px">nature-pack.data.js missing: run <code>node tools/obj-to-js.mjs</code></p>'; throw new Error('no nature data') }
// the world's data, built offline (tools/build-look-data.ts, decision 0012): the heightfield, the far ring, the river
const res = await fetch(LOOK_URL)
if (!res.ok) throw new Error(`look data: ${res.status} ${res.statusText} for ${LOOK_URL}`)
const look = decodeLook(await res.arrayBuffer())
checkLookData(D, look)
setRiver(look.river); setHeightfield(look.hf, look.far, D.spec.tile / 2)
{ // the heights themselves, not the header
  let lo = Infinity, hi = -Infinity, farLo = Infinity
  for (const v of look.hf.h) { if (v < lo) lo = v; if (v > hi) hi = v }
  for (const v of look.far.h) if (v < farLo) farLo = v
  checkGround(D.spec, lo, hi, farLo)
}
const canvas = document.getElementById('c') as HTMLCanvasElement
const engine = new Engine(canvas, false, { preserveDrawingBuffer: false, stencil: false }, false)
engine.setHardwareScalingLevel(1)
const scene = new Scene(engine); scene.skipPointerMovePicking = true
scene.clearColor = CLEAR

const grain0 = makeGrainCanvas(null), mats = new Materials(scene, grainTexture(scene, grain0), grainMean(grain0))
const keptGrains = new Set([mats.grain])   // grains the look tools switch back to (window.__look.grain): never disposed
const terrain = buildTerrain(scene, mats, look.far, look.bank)
const water = buildWater(scene, mats)
const nature = buildNature(scene, mats, water.reflAdd)
water.finish(scene)
const bakes = buildBakes(scene, mats, terrain.tileGround, nature.canopy)
const camera = buildCamera(scene, canvas)
const post = new Post(camera, engine, S, () => mats.grain); post.build()

/* ---------- UI ---------- */
const byId = <T extends HTMLElement>(id: string): T => { const e = document.getElementById(id); if (!e) throw new Error(`look.html has no #${id}`); return e as T }
const input = (id: string) => byId<HTMLInputElement>(id)
input('dofamt').oninput = () => { S.dofAmt = +input('dofamt').value }
byId<HTMLSelectElement>('res').onchange = () => { S.res = +byId<HTMLSelectElement>('res').value; engine.setHardwareScalingLevel(1 / S.res) }
const TOGGLES = ['grain', 'edges', 'clouds', 'shadows', 'ao', 'mist', 'shafts', 'back', 'grade', 'bloom', 'dof'] as const
type Toggle = typeof TOGGLES[number]
const isToggle = (k: string | undefined): k is Toggle => (TOGGLES as readonly (string | undefined)[]).includes(k)
document.querySelectorAll<HTMLButtonElement>('.tg').forEach(b => b.onclick = () => {
  const k = b.dataset.k; if (!isToggle(k)) throw new Error(`panel button with an unknown data-k: ${k}`)
  S[k] = S[k] ? 0 : 1; b.classList.toggle('on', !!S[k]); b.textContent = S[k] ? 'On' : 'Off'; if (k === 'dof') post.build()
})
input('gamt').oninput = () => { S.gamt = +input('gamt').value }
const SEASONS = ['Summer', 'Early autumn', 'Late autumn', 'Winter']
input('season').oninput = () => { S.season = +input('season').value; byId('slabel').textContent = SEASONS[Math.min(3, Math.round(S.season))] }
const dropEl = byId('drop')
addEventListener('dragover', e => { e.preventDefault(); dropEl.style.display = 'flex' })
addEventListener('dragleave', () => dropEl.style.display = 'none')
addEventListener('drop', e => {
  e.preventDefault(); dropEl.style.display = 'none'; const f = e.dataTransfer?.files[0]; if (!f || !/image/.test(f.type)) return
  const img = new Image()
  img.onload = () => {
    const old = mats.grain, cv = makeGrainCanvas(lumOf(img)); mats.setGrain(grainTexture(scene, cv), grainMean(cv))
    bakes.lightMap.resetRefreshCounter(); if (!keptGrains.has(old)) old.dispose()
  }
  img.src = URL.createObjectURL(f)
})

/* ---------- loop ---------- */
const fpsEl = byId('fps')
const FROZEN = new URLSearchParams(location.search).has('frozen')   // golden screenshots (tools/golden.mjs): the clock stays at 0
// sun colour follows the season: warm gold in summer and autumn, pale gold in winter (keeps snow white, not yellow)
const SUNCOL = PAL.sun.clone(), WINTER_SUN = new Color3(0.98, 0.95, 0.88)
scene.onBeforeRenderObservable.add(() => { const w = Math.max(0, Math.min(1, S.season - 2)); SUNCOL.copyFrom(Color3.Lerp(PAL.sun, WINTER_SUN, w)) })
// the detail layer's pixel angle (src/look/shaders/painter.glsl): the angle one pixel of a SPEC.detail.lines-tall
// frame spans, from the camera's actual vertical field of view (narrower than the SPEC's on frames wider than 16:9)
let pixA = 0
scene.onBeforeRenderObservable.add(() => {
  const tv = camera.fovMode === Camera.FOVMODE_VERTICAL_FIXED ? Math.tan(camera.fov / 2) : Math.tan(camera.fov / 2) / engine.getAspectRatio(camera)
  pixA = 2 * tv / D.spec.detail.lines
  if (!FROZEN) S.t += Math.min(engine.getDeltaTime() / 1000, 0.05)
  for (const m of mats.all) {
    m.setVector3('uCamPos', camera.position); m.setVector3('uFocus', camera.target); m.setFloat('uTime', S.t)
    m.setFloat('uGrainAmt', S.grain ? S.gamt : 0); m.setFloat('uShadowsOn', S.shadows); m.setFloat('uSeason', S.season); m.setColor3('uSunCol', SUNCOL); m.setFloat('uEdges', S.edges); m.setFloat('uClouds', S.clouds)
    m.setFloat('uPixA', pixA)
    m.setFloat('uAO', S.ao); m.setFloat('uMist', S.mist); m.setFloat('uShafts', S.shafts); m.setFloat('uBack', S.back)
  }
  fpsEl.textContent = engine.getFps().toFixed(0) + ' fps'
})
engine.runRenderLoop(() => scene.render())
addEventListener('resize', () => engine.resize())
if (new URLSearchParams(location.search).get('river') === 'debug') {   // centre line: light = riffle, dark blue = pool
  const pts: Vector3[] = [], cols: Color4[] = [], C = RIVER
  for (let i = 0; i < C.n; i += 2) { pts.push(new Vector3(C.px[i], C.zw[i] + 0.4, C.pz[i])); const r = C.riffle[i]; cols.push(new Color4(0.15 + 0.85 * r, 0.25 + 0.75 * r, 0.6 + 0.4 * r, 1)) }
  CreateLines('riverDebug', { points: pts, colors: cols }, scene)
}

// the page contract of tools/golden.mjs, and the names tools/render-check.js and tools/river-check.js read (they were
// written against the prototype's globals; SMW and MASKN are the prototype's names for TILE_W and MASK_N)
Object.assign(window, {
  __proto: { S, scene, camera, buildPost: () => post.build(), play: D.spec.play },
  B: { Vector3, Matrix, DynamicTexture, VertexBuffer },
  // H is the drawn ground (the heightfield); baseH and RIVER.axisX are the authoring formulas the river check compares with
  scene, engine, camera, apron: terrain.apron, RIVER: { ...RIVER, axisX }, H: groundAt, baseH, riverQuery, lerpA, wetEdges, wetEdgeAt, bankReachAt, BAND: D.band, PLAY: D.spec.play, SMW: D.spec.tile, TSUB: D.spec.tileSub, MASKN: D.spec.sizes.riverMask, SM_FADE_M: D.spec.shadowFade, SPEC: D.spec,
  tileGround: terrain.tileGround, farGround: terrain.farGround, farTerrainMat: terrain.farTerrainMat, riverMask: terrain.riverMask, riverMaskCanvas: terrain.riverMaskCanvas,
  groups: nature.groups, FAR: nature.far, KEEP_CLEAR: nature.KEEP_CLEAR, touchesZone: nature.touchesZone, placeable: nature.placeable, footprint: nature.footprint,
  lightCam: bakes.lightCam, shadowRT: bakes.shadowRT,
  __buildMs: performance.now() - T0,
})
// the look checks' hooks (tools/guard.mjs, tools/detail-check.mjs): test objects, the materials, the meshes by pass,
// and the detail layer's switches
const lab = new Lab(scene, mats)
const passes = { terrain: [terrain.tileGround, terrain.farGround, terrain.apron], scatter: scene.meshes.filter((m): m is Mesh => m instanceof Mesh && m.thinInstanceCount > 0), water: [water.mesh], post: () => post.passes }
const terrainMats = [terrain.terrainMat, terrain.farTerrainMat, terrain.hillMat]
// the terrain's variants (src/look/shaders/painter.glsl): the L0 grain, the debug view, the checks' sabotages
const DETAIL_DEFINES = ['DETAIL_L0', 'DETAIL_DEBUG', 'DETAIL_DEBUG_INC', 'DETAIL_DEBUG_N', 'DETAIL_SAB_IMPLICIT', 'DETAIL_SAB_STEP', 'BANKN_OFF']
const setDetail = (on: string[]) => {
  for (const d of on) if (!DETAIL_DEFINES.includes(d)) throw new Error(`unknown detail define ${d}`)
  for (const m of terrainMats) for (const d of DETAIL_DEFINES) m.setDefine(`#define ${d}`, on.includes(d))
}
// the camera's projection, then in clip space x' = k·x + tx·w, y' = k·y + ty·w (k 1, no offset: the camera's own)
const project = (k: number, tx: number, ty: number) => {
  camera.unfreezeProjectionMatrix()
  if (k !== 1 || tx || ty) camera.freezeProjectionMatrix(camera.getProjectionMatrix(true).multiply(Matrix.FromValues(k, 0, 0, 0, 0, k, 0, 0, 0, 0, 1, 0, tx, ty, 0, 1)))
}
// the water data's debug views on the tile's terrain and the water (src/look/shaders/waterdata.glsl): 0 off, 1 depth,
// 2 shore distance, 3 flow, 4 and 5 the raw texels; sab: the page check's sabotage (the texture read upside down)
const WATER_VIEWS = ['off', 'depth', 'sdf', 'flow', 'raw', 'alpha']
// The water data's texture (docs/plans/done/w3-water-data.md) is made on the first view: until W4 nothing else reads it
let waterData: RawTexture | null = null
const waterView = (v: number, sab = false) => {
  if (!WATER_VIEWS[v]) throw new Error(`unknown water view ${v}`)
  if (v > 0 && !waterData) {
    const t0 = performance.now(); waterData = spanTexture(scene, look.water, WATER_FILL, 'waterData')
    for (const m of [terrain.terrainMat, water.waterMat]) m.setTexture('uWater', waterData)
    Object.assign(window, { __waterTexMs: performance.now() - t0 })
  }
  for (const m of [terrain.terrainMat, water.waterMat]) { m.setDefine('#define WATER_DEBUG', v > 0); m.setDefine('#define WATER_SAB_FLIP', sab); m.setFloat('uWaterView', v) }
}
const paintGrain = mats.grain, paintMean = mats.grainMean
let smooth: { tex: DynamicTexture; mean: [number, number]; maxStep: number } | null = null
const hidden: Mesh[] = []
Object.assign(window, { __look: {
  lab, mats, passes, post, setDetail,
  hill: (x: number, z: number) => lab.addHill(x, z, terrain.hillMat),
  // the grain the terrain reads: the paint grain, or the seam check's smooth one (returns its steepest texel step)
  grain: (kind: 'paint' | 'smooth') => {
    const old = mats.grain
    if (kind === 'paint') mats.setGrain(paintGrain, paintMean)
    else {
      if (!smooth) { const s = makeSmoothGrainCanvas(); smooth = { tex: grainTexture(scene, s.canvas), mean: grainMean(s.canvas), maxStep: s.maxStep }; keptGrains.add(smooth.tex) }
      mats.setGrain(smooth.tex, smooth.mean)
    }
    if (old !== mats.grain && !keptGrains.has(old)) old.dispose()   // a dropped grain
    return kind === 'smooth' ? smooth!.maxStep : null
  },

  // the terrain alone (and the lab's hill), or everything; the finishing passes on or off (off: the frame is the
  // terrain's own output, as the debug view needs)
  terrainOnly: (on: boolean) => {
    if (on) for (const m of scene.meshes) { if (m instanceof Mesh && m.isEnabled() && !terrainMats.includes(m.material as never)) { m.setEnabled(false); hidden.push(m) } }
    else { for (const m of hidden) m.setEnabled(true); hidden.length = 0 }
  },
  finishing: (on: boolean) => on ? post.build() : post.clear(),
  // one quarter of the frame (column i, row j from the top) drawn over the whole frame: four of them make a frame at
  // twice the resolution (the seam check's magnification); null puts the camera's own projection back
  quarter: (i: number | null, j = 0) => i === null ? project(1, 0, 0) : project(2, i === 0 ? 1 : -1, j === 0 ? -1 : 1),
  // the image moved by (dx, dy) pixels (right, down) with nothing else changed: the shimmer check's sub-pixel shift
  shift: (dx: number, dy: number) => project(1, 2 * dx / engine.getRenderWidth(), -2 * dy / engine.getRenderHeight()),
  waterView,
} })

const params = new URLSearchParams(location.search)
// ?detail=l0: the terrain with the L0 grain (compare by eye; the goldens of main against it match)
if (params.get('detail') === 'l0') setDetail(['DETAIL_L0'])
else if (params.has('detail')) throw new Error(`?detail must be l0, not ${params.get('detail')}`)
// ?water=depth|sdf|flow: the water data's debug views
if (params.has('water')) {
  const v = WATER_VIEWS.indexOf(params.get('water') ?? ''); if (v < 1 || v > 3) throw new Error(`?water must be depth, sdf or flow, not ${params.get('water')}`)
  waterView(v)
}
// ?bench (docs/plans/active/l2-detail.md): fixed cameras, the result shown with a link to save it, and in
// window.__bench for tools/bench-look.mjs
if (params.has('bench')) {
  camera.detachControl()
  const hold = Number(params.get('hold') ?? 3)
  if (!(hold > 0)) throw new Error(`?hold must be a positive number of seconds, not ${params.get('hold')}`)
  // the arms: the detail layer, and the L0 grain it replaces (the cost gate: at most +1 ms GPU for the terrain)
  void runBench(scene, camera, passes, [{ name: 'l2', apply: () => setDetail([]) }, { name: 'l0', apply: () => setDetail(['DETAIL_L0']) }], hold).then(r => { Object.assign(window, { __bench: r }); showBench(r) },
    (e: unknown) => { Object.assign(window, { __bench: { error: String(e) } }); console.error('bench failed:', e) })
}
