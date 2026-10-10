// The look page (app/look.html): the painted world in the game's toolchain, ported from
// prototypes/painted-cinematic.html with no change to the look (docs/plans/active/l0-spine.md, L0c). Built in the
// prototype's order: mesh and material creation order decides draw order, and the goldens compare pixels.
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js'
import { Engine } from '@babylonjs/core/Engines/engine.js'
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js'
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector.js'
import { CreateLines } from '@babylonjs/core/Meshes/Builders/linesBuilder.js'
import { Scene } from '@babylonjs/core/scene.js'
import '../../prototypes/nature-pack.data.js'
import { buildBakes } from './bakes.ts'
import { grainTexture, lumOf, makeGrainCanvas } from './grain.ts'
import { CLEAR, Materials, PAL, S } from './materials.ts'
import { buildNature } from './nature.ts'
import { Post, buildCamera } from './post.ts'
import { H, RIVER, baseH, carve, lerpA, riverQuery } from './river.ts'
import { BAND, MASK_N, PLAY, SM_FADE_M, TILE_W } from './spec.ts'
import { buildTerrain } from './terrain.ts'
import { buildWater } from './water.ts'

const T0 = performance.now()   // load-time measurement (window.__buildMs)
const canvas = document.getElementById('c') as HTMLCanvasElement
const engine = new Engine(canvas, false, { preserveDrawingBuffer: false, stencil: false }, false)
engine.setHardwareScalingLevel(1)
const scene = new Scene(engine); scene.skipPointerMovePicking = true
scene.clearColor = CLEAR

const mats = new Materials(scene, grainTexture(scene, makeGrainCanvas(null)))
const terrain = buildTerrain(scene, mats)
const water = buildWater(scene, mats)
const nature = buildNature(scene, mats, water.reflAdd)
water.finish(scene)
const bakes = buildBakes(scene, mats, terrain.tileGround, nature.canopy)
const camera = buildCamera(scene, canvas)
const post = new Post(camera, engine, S, () => mats.grain); post.build()

/* ---------- UI ---------- */
const el = (id: string) => document.getElementById(id) as HTMLInputElement
el('dofamt').oninput = e => { S.dofAmt = +(e.target as HTMLInputElement).value }
el('res').onchange = e => { S.res = +(e.target as HTMLSelectElement).value; engine.setHardwareScalingLevel(1 / S.res) }
type Toggle = 'grain' | 'edges' | 'clouds' | 'shadows' | 'ao' | 'mist' | 'shafts' | 'back' | 'grade' | 'bloom' | 'dof'
document.querySelectorAll<HTMLButtonElement>('.tg').forEach(b => b.onclick = () => {
  const k = b.dataset.k as Toggle; S[k] = S[k] ? 0 : 1; b.classList.toggle('on', !!S[k]); b.textContent = S[k] ? 'On' : 'Off'; if (k === 'dof') post.build()
})
el('gamt').oninput = e => { S.gamt = +(e.target as HTMLInputElement).value }
const SEASONS = ['Summer', 'Early autumn', 'Late autumn', 'Winter']
el('season').oninput = e => { S.season = +(e.target as HTMLInputElement).value; el('slabel').textContent = SEASONS[Math.min(3, Math.round(S.season))] }
const dropEl = el('drop')
addEventListener('dragover', e => { e.preventDefault(); dropEl.style.display = 'flex' })
addEventListener('dragleave', () => dropEl.style.display = 'none')
addEventListener('drop', e => {
  e.preventDefault(); dropEl.style.display = 'none'; const f = e.dataTransfer?.files[0]; if (!f || !/image/.test(f.type)) return
  const img = new Image()
  img.onload = () => {
    const old = mats.grain; mats.grain = grainTexture(scene, makeGrainCanvas(lumOf(img)))
    for (const m of mats.all) m.setTexture('uGrain', mats.grain)
    bakes.bakeMat.setTexture('uGrain', mats.grain); bakes.lightMap.resetRefreshCounter(); old.dispose()
  }
  img.src = URL.createObjectURL(f)
})

/* ---------- loop ---------- */
const fpsEl = el('fps')
const FROZEN = new URLSearchParams(location.search).has('frozen')   // golden screenshots (tools/golden.mjs): the clock stays at 0
// sun colour follows the season: warm gold in summer and autumn, pale gold in winter (keeps snow white, not yellow)
const SUNCOL = PAL.sun.clone(), WINTER_SUN = new Color3(0.98, 0.95, 0.88)
scene.onBeforeRenderObservable.add(() => { const w = Math.max(0, Math.min(1, S.season - 2)); SUNCOL.copyFrom(Color3.Lerp(PAL.sun, WINTER_SUN, w)) })
scene.onBeforeRenderObservable.add(() => {
  if (!FROZEN) S.t += Math.min(engine.getDeltaTime() / 1000, 0.05)
  for (const m of mats.all) {
    m.setVector3('uCamPos', camera.position); m.setVector3('uFocus', camera.target); m.setFloat('uTime', S.t)
    m.setFloat('uGrainAmt', S.grain ? S.gamt : 0); m.setFloat('uShadowsOn', S.shadows); m.setFloat('uSeason', S.season); m.setColor3('uSunCol', SUNCOL); m.setFloat('uEdges', S.edges); m.setFloat('uClouds', S.clouds)
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
  __proto: { S, scene, camera, buildPost: () => post.build(), play: PLAY },
  B: { Vector3, Matrix, DynamicTexture, VertexBuffer },
  scene, engine, camera, RIVER, H, baseH, carve, riverQuery, lerpA, BAND, PLAY, SMW: TILE_W, MASKN: MASK_N, SM_FADE_M,
  tileGround: terrain.tileGround, farGround: terrain.farGround, farTerrainMat: terrain.farTerrainMat, riverMask: terrain.riverMask, riverMaskCanvas: terrain.riverMaskCanvas,
  groups: nature.groups, FAR: nature.far, KEEP_CLEAR: nature.KEEP_CLEAR, touchesZone: nature.touchesZone, placeable: nature.placeable, footprint: nature.footprint,
  lightCam: bakes.lightCam, shadowRT: bakes.shadowRT,
  __buildMs: performance.now() - T0,
})
