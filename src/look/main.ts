// The look page (app/look.html): the painted world in the game's toolchain, ported from
// prototypes/painted-cinematic.html with no change to the look (docs/plans/done/l0-spine.md, L0c). Built in the
// prototype's order: mesh and material creation order decides draw order, and the goldens compare pixels.
import type { SimPlay } from './sim-armies.ts'
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js'
import { Camera } from '@babylonjs/core/Cameras/camera.js'
import { Engine } from '@babylonjs/core/Engines/engine.js'
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js'
import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js'
import { Matrix, Vector2, Vector3 } from '@babylonjs/core/Maths/math.vector.js'
import { CreateLines } from '@babylonjs/core/Meshes/Builders/linesBuilder.js'
import { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import { Scene } from '@babylonjs/core/scene.js'
import '../../prototypes/nature-pack.data.js'
import { buildBakes, PENUMBRA_MAX, softDefines, SOFT_DEFAULTS, type SoftOptions } from './bakes.ts'
import { midtoneDefines, parseMidtone } from './midtone.ts'
import { q, runBench, showBench } from './bench.ts'
import { TR, tr, trNow } from './trace.ts'
import { grainMean, grainTexture, lumOf, makeGrainCanvas, makeSmoothGrainCanvas } from './grain.ts'
import { Materials, S, SUN, seasonSnapshot, setSeasonUniforms } from './materials.ts'
import { buildFlow, COMB_PERIOD, flowDefines } from './flow.ts'
import { CLUMP_REACH, CLUMP_REACH_FLOW } from './meadow-spec.ts'
import { meadowLookDefines, meadowLookOf } from './meadow-look.ts'
import { gradeColour, MOOD, SEASON, seasonLight, setBounce, setGroundBounce, setMood } from './mood.ts'
import { buildNature } from './nature.ts'
import { buildMeadow, buildMeadowMap, RINGS } from './meadow.ts'
import { DEBUG, DOF, DOF_NEAR, DOF_PAINT, MSAA, Post, buildCamera, typingIn, zoomOf } from './post.ts'
import LOOK_URL from '../../data/painted-world.lookdata?url'
import { groundAt, setHeightfield } from './heightfield.ts'
import { RIVER, atCutBank, bankReachAt, lerpA, riverQuery, setRiver, wetEdgeAt, wetEdges } from './river.ts'
import { D, FocusFollow, TUNED_R, checkView, groundOf, maxGrid } from './spec.ts'
import { axisX, baseH } from './world/author.ts'
import { checkLookData, decodeLook, unpackSpans, ROAD_SEG, ROAD_SLOTS, type LookWorld } from './world/data.ts'
import { windowFile, windowOf, type LookWindow } from './world/windows.ts'
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js'
import { Constants } from '@babylonjs/core/Engines/constants.js'
import { buildTerrain, splitGround } from './terrain.ts'
import { buildBuildings } from './buildings.ts'
import { buildBuildingLight } from './building-light.ts'
import type { Units } from './units.ts'
// the figures' unit data by file (data/figures/<figure>.unitdata): a scenario names its figure, the page finds it here
const FIGURES = import.meta.glob<string>('../../data/figures/*.unitdata', {
  query: '?url',
  import: 'default',
  eager: true,
})
// the map worlds' look data by file (data/<map>-<window>.lookdata, src/look/world/windows.ts): ?map&window picks one
// (a glob takes a literal pattern; the page reads only the files the windows name: windowFile)
const WINDOW_DATA = import.meta.glob<string>('../../data/*-*.lookdata', {
  query: '?url',
  import: 'default',
  eager: true,
})
import { buildWater } from './water.ts'
import { RELIEF_K, reliefField } from './relief.ts'
import { spanTexture } from './span-texture.ts'
// (the grit in R, the buildings' paving in G and B: tools/paving-pack.py)
import ROAD_GRIT_URL from '../../data/road-grit-v2.png?url'
import { BUILDINGS, YARD_ALL, YARD_BASE, onPaving, paveShape, type Building } from './world/buildings.ts'
import { COVER, coarsenCover } from './world/cover.ts'
import { sstep } from './noise.ts'
import { WATER_FILL, decodeWater, sampleRGBA } from './world/water-data.ts'
import { Lab } from './lab.ts'
import { MACRO_ARMS, SHADER_ARMS, buildMacro, isBakedArm, type MacroArm, type RoadTextures } from './macro.ts'
import { CARD_DEFAULTS, type CardOptions } from './canopy.ts'
import { atlasFromPicture, atlasProcedural, loadImage } from './leaves.ts'
import LEAF_URL from '../../data/leaf-clumps-oak-v1.png?url'
import SIMPLE_LEAF_URL from '../../data/leaf-clumps-simple-v1.png?url'
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js'
import {
  SHADOW_LOOK,
  applyContactParams,
  applyStepParams,
  applyFootSharpParams,
  applyNearBandParams,
  applyLookParams,
  shadeDesat,
  shadowModes,
  simpleShadowsDraw,
  stencilFor,
} from './shadow-look.ts'

declare global {
  interface Window {
    __T0?: number
  }
}
const T0 = window.__T0 ?? performance.now() // load-time measurement (window.__buildMs), started by look.html
if (!window.NATURE) {
  document.body.innerHTML =
    '<p style="padding:30px">nature-pack.data.js missing: run <code>node tools/obj-to-js.mjs</code></p>'
  throw new Error('no nature data')
}
// the world's data, built offline (tools/build-look-data.ts, decision 0012): the heightfield, the far ring, the river;
// the demo's, or a map's window by ?map=<map>&window=<name> (docs/plans/active/look-austerlitz-a1.md)
const lookWindow = windowOf(new URLSearchParams(location.search))
const lookUrl = lookWindow ? WINDOW_DATA[`../../${windowFile(lookWindow)}`] : LOOK_URL
if (!lookUrl) throw new Error(`look data: no ${windowFile(lookWindow!)}: run node tools/build-look-data.ts`)
const res = await fetch(lookUrl)
if (!res.ok) throw new Error(`look data: ${res.status} ${res.statusText} for ${lookUrl}`)
const look = decodeLook(await res.arrayBuffer())
checkLookData(D, look)
checkWorld(look.world, lookWindow)
// a map's window: no hand-placed copses, zones or buildings (the demo's), its trees from its data
const onMap = look.world.kind === 'map'
const worldBuildings: readonly Building[] = onMap ? [] : BUILDINGS
// the cover the per-frame shaders read (and the road split, which must class its triangles as they paint): a map
// world's coarsened to the spec's cells (src/look/world/cover.ts, coarsenCover); the macro colour's bakes read the fine
const frameCover = coarsenCover(look.cover, D.spec.macro.cover)
setRiver(look.river)
setHeightfield(look.hf, look.far, D.spec.tile / 2)
// the world's ground range, from the heights themselves (not the header): the camera's checks take it (checkView), and
// the focus keeps to its range (the demo's focus stays on its 8 m plane, SPEC.camera.focusY; a map world's follows its
// ground in play: docs/plans/done/look-austerlitz-a1b.md)
const worldGround = groundOf(D.spec, look.hf, look.far, onMap ? null : D.spec.camera.focusY)
checkView(D.spec, worldGround)
const canvas = document.getElementById('c') as HTMLCanvasElement

/** Throws unless the look data holds the world the page asked for (a stale or misnamed file draws the wrong one). */
function checkWorld(world: LookWorld, win: LookWindow | null): void {
  const want = win ? `${win.map} ${win.name} at ${win.x}, ${win.z}` : 'the demo'
  const got = world.kind === 'map' ? `${world.map} ${world.window} at ${world.x}, ${world.z}` : 'the demo'
  if (want !== got) throw new Error(`look data: it holds ${got}, the page asked for ${want}: rebuild it`)
}
// the stencil: on the scene's target alone while the soldiers' simple shadows draw (?stencil=scene, the default), the
// engine's own (?stencil=all) or none (?stencil=0): stencilFor (src/look/shadow-look.ts)
const stencilAt = stencilFor(new URLSearchParams(location.search))
MSAA.stencil = stencilAt === 'scene'
const engine = new Engine(canvas, false, { preserveDrawingBuffer: false, stencil: stencilAt === 'engine' }, false)
engine.setHardwareScalingLevel(1)
// the scene's own lines (the finishing chain's: under the upscale, its first target's; called only from the frames,
// after the chain is made below)
const sceneH = () => post.sceneLines()
const scene = new Scene(engine)
scene.skipPointerMovePicking = true

// ?soft=off: the shadows before the soft-shadow plan (docs/plans/done/soft-shadows.md); ?penumbra: metres of edge
// radius per metre between a shadow and its caster
const params = new URLSearchParams(location.search)
const softParam = params.get('soft')
const penumbraParam = params.get('penumbra')
// a switch with no value (?rt16, ?nowide): present, or present as 1; any other value throws
const flag = (k: string): boolean => {
  if (!params.has(k)) return false
  const v = params.get(k)
  if (v !== '' && v !== '1') throw new Error(`?${k} takes no value, not ${v}`)
  return true
}
// the light's mood (src/look/mood.ts), before any material is made
setMood(params.get('mood') ?? 'epic') // the default mood (decision 0043); ?mood=temperate for LC3's
// the season the page opens in (?season), for what is baked on load (the generated crowns' shadows and the sky they
// hide) and the season's light the materials are made with
const season0 = params.has('season') ? Number(params.get('season')) : 0
if (!(season0 >= 0 && season0 <= 3)) throw new Error(`?season must be 0 to 3, not ${params.get('season')}`)
seasonLight(MOOD, season0, SEASON) // (the materials' initial values: src/look/materials.ts)
if (params.has('bounce')) {
  const b = params.get('bounce') ?? ''
  setBounce(/^\d+(\.\d+)?$/.test(b) ? Number(b) : NaN)
}
// LC5
if (params.has('gbounce')) {
  const b = params.get('gbounce') ?? ''
  setGroundBounce(/^\d+(\.\d+)?$/.test(b) ? Number(b) : NaN)
}
// the clear colour, graded as the materials are at the frame's top (it shows only there), following the grade's switch
const CLEAR_GRADED = gradeColour(MOOD.hazeCool, MOOD, 1)
scene.clearColor = new Color4(CLEAR_GRADED.r, CLEAR_GRADED.g, CLEAR_GRADED.b, 1)
if (softParam !== null && softParam !== 'off') throw new Error(`?soft must be off, not ${softParam}`)
const soft: SoftOptions = {
  on: softParam !== 'off',
  penumbra: penumbraParam === null ? SOFT_DEFAULTS.penumbra : Number(penumbraParam),
}
if (
  penumbraParam !== null &&
  (penumbraParam.trim() === '' || !Number.isFinite(soft.penumbra) || soft.penumbra < 0 || soft.penumbra > PENUMBRA_MAX)
) {
  throw new Error(`?penumbra must be a number from 0 to ${PENUMBRA_MAX}, not ${penumbraParam}`)
}
if (penumbraParam !== null && !soft.on) throw new Error('?penumbra needs the soft shadows on (no ?soft=off)')
// ?meadow=off: the old sparse grass tufts and the wheat lattice instead of the meadow (docs/plans/done/l5c-meadow.md)
const meadowParam = params.get('meadow')
if (meadowParam !== null && meadowParam !== 'off') throw new Error(`?meadow must be off, not ${meadowParam}`)
// the meadow reads a half-float texture in its vertex shader: WebGL2 only (on WebGL1 the old scatter stays)
const meadowOn = meadowParam !== 'off' && engine.version >= 2
// the meadow's grass (decision 0041): flow, the default, the meadow combed (docs/plans/done/grass-flow.md): its pattern
// and clumps along a flow field, light and dark streaks by the lean against the sun (its direction on the ground,
// FLOW_SUN), on the ground's bake and the clumps' materials alike. ?grass=brush: the brush pattern before it (the
// comparisons). Without the meadow (WebGL1, ?meadow=off) the brush pattern, as flow needs the meadow
const grassParam = params.get('grass')
if (grassParam !== null && grassParam !== 'flow' && grassParam !== 'brush') {
  throw new Error(`?grass must be flow or brush, not ${grassParam}`)
}
if (grassParam === 'flow' && !meadowOn) throw new Error('?grass=flow needs the meadow (WebGL2, no ?meadow=off)')
const grassMode = grassParam ?? (meadowOn ? 'flow' : 'brush')
const sunXZ = new Vector2(SUN.x, SUN.z).normalize()
// ?grassoff=strokes,dense,big,hue (with flow): one part of the arm off at a time, for the cost's ablation
const GRASS_PARTS = ['strokes', 'dense', 'big', 'hue']
const grassOff = params.get('grassoff')?.split(',') ?? []
if (grassOff.some(k => !GRASS_PARTS.includes(k)) || (grassOff.length && grassMode !== 'flow')) {
  throw new Error(`?grassoff takes ${GRASS_PARTS.join(', ')}, with the combed meadow (not ?grass=brush)`)
}
// the camera's distance from the focus over which the combed clumps go from larger and denser to the default's (the
// closest zoom is 15 m, decision 0051; the default view 125)
const CLOSE_ZOOM: [number, number] = [70, 110]
// the strokes' largest footprint, m a pixel (strokeK, macro.glsl: whole under about half of it, gone past it); the near
// bake reads it too (below)
const STROKE_FOOT = 0.15
const grassDefines =
  grassMode === 'flow'
    ? [
        '#define GRASS_FLOW',
        `#define FLOW_SUN vec2(${sunXZ.x.toFixed(4)},${sunXZ.y.toFixed(4)})`,
        `#define COMB_PERIOD ${COMB_PERIOD.toFixed(1)}`,
        `#define STROKE_RINGS vec2(${RINGS[0].band[2].toFixed(1)},${RINGS[0].band[3].toFixed(1)})`,
        `#define CLOSE_ZOOM vec2(${CLOSE_ZOOM[0].toFixed(1)},${CLOSE_ZOOM[1].toFixed(1)})`,
        `#define STROKE_FOOT ${STROKE_FOOT.toFixed(3)}`,
        ...flowDefines(),
        ...grassOff.map(k => `#define GRASS_NO_${k.toUpperCase()}`),
      ]
    : []
// ?relief=0|1|2: the relief's painted tone (src/look/relief.ts): 0 off, 1 the map worlds' default, 2 stronger; off
// on the demo unless asked (its hill reads by its own slopes). Baked into the macro colour; the shader arm's colour and
// the live roads' and yards' paint take it too (RELIEF on every painted material: src/look/shaders/macro.glsl)
const reliefParam = params.get('relief')
if (reliefParam !== null && !['0', '1', '2'].includes(reliefParam)) {
  throw new Error(`?relief must be 0, 1 or 2, not ${reliefParam}`)
}
const reliefK = RELIEF_K[reliefParam === null ? (onMap ? 1 : 0) : Number(reliefParam)]
let relief: { tex: RawTexture; k: number } | null = null
if (reliefK > 0) {
  const f = reliefField(groundAt, D.spec.far, [SUN.x, SUN.y, SUN.z])
  const tex = RawTexture.CreateRGBATexture(f.tex, f.n, f.n, scene, false, false, Texture.BILINEAR_SAMPLINGMODE)
  tex.wrapU = tex.wrapV = Texture.CLAMP_ADDRESSMODE
  relief = { tex, k: reliefK }
}
// ?grassup=0|1|2, ?wheatfill=0|1: the meadow's look (docs/plans/done/grass-upright.md, decision 0085; meadowLookOf in
// src/look/meadow-look.ts)
const meadowLook = meadowLookOf(params, grassMode)
const grain0 = makeGrainCanvas(null)
// ?midtone=0|1|2 or per class (u3,b2,n2,g0): how wide the ramp turns from light to shade (src/look/midtone.ts,
// decision 0084); none is the default, u3,b2,n2,g0; 0 the hard bands from before it
const midtone = parseMidtone(params.get('midtone'))
const mats = new Materials(scene, grainTexture(scene, grain0), grainMean(grain0), [
  ...softDefines(soft),
  ...midtoneDefines(midtone),
  ...(relief ? ['#define RELIEF'] : []),
  ...(meadowOn ? ['#define MEADOW', ...grassDefines, ...meadowLookDefines(meadowLook)] : []),
])
if (relief) {
  const { tex, k } = relief
  mats.bindAll(m => {
    m.setTexture('uRelief', tex)
    m.setFloat('uReliefK', k)
  })
}
const keptGrains = new Set([mats.grain]) // grains the look tools switch back to (window.__look.grain): never disposed
// the water data (docs/plans/done/w3-water-data.md): the terrain's shore band and the water read it
const waterT0 = performance.now()
const waterData = spanTexture(scene, look.water, WATER_FILL, 'waterData')
const waterTexMs = performance.now() - waterT0
const terrain = buildTerrain(scene, mats, look.far, look.bank, waterData)
// the page's options (?watersab, ?detail, ?water, ?bench: below)
// ?watersab=nodive: the band check's sabotage (tools/water-look-check.mjs), the ribbon's
// columns never dive under the banks
const waterSabParam = params.get('watersab')
if (waterSabParam !== null && waterSabParam !== 'nodive') {
  throw new Error(`?watersab must be nodive, not ${waterSabParam}`)
}
const water = buildWater(scene, mats, { water: waterData, bankN: terrain.bankN }, waterSabParam !== 'nodive')
// the roads (docs/plans/done/roads.md): their segments and grid, and the owner's grit photo (its marks only once
// loaded: uRoadOn), on the tile's terrain (live from mid zoom in: below) and the water's
// land side, and in the macro bake
let roadTex: RoadTextures | undefined
if (!mats.webgl1) {
  // (float textures: the roads' shader is WebGL2's)
  // the segments (three RGBA floats each, in a row) and the grid of their indices (ROAD_SLOTS / 4 texels a cell, in a
  // row), read texel by texel (nearest): the shader finds the nearest segment exactly
  const R = look.roads
  const sn = R.segs.length / ROAD_SEG
  const segs = RawTexture.CreateRGBATexture(
    R.segs,
    (sn * ROAD_SEG) / 4,
    1,
    scene,
    false,
    false,
    Texture.NEAREST_SAMPLINGMODE,
    Constants.TEXTURETYPE_FLOAT,
  )
  const grid = RawTexture.CreateRGBATexture(
    R.ids,
    (R.n * ROAD_SLOTS) / 4,
    R.n,
    scene,
    false,
    false,
    Texture.NEAREST_SAMPLINGMODE,
    Constants.TEXTURETYPE_FLOAT,
  )
  for (const t of [segs, grid]) t.wrapU = t.wrapV = Texture.CLAMP_ADDRESSMODE
  segs.name = 'roadSegs'
  grid.name = 'roadGrid'
  mats.bindAll(m => m.setFloat('uRoadOn', 0)) // (before the grit, whose load turns it on: every material, as the dirt)
  const grit = new Texture(
    ROAD_GRIT_URL,
    scene,
    false,
    true,
    Texture.TRILINEAR_SAMPLINGMODE,
    () => mats.bindAll(m => m.setFloat('uRoadOn', 1)),
    (msg?: string) => console.error(`the road grit (${ROAD_GRIT_URL}) did not load: ${msg ?? 'unknown error'}`),
  )
  grit.wrapU = grit.wrapV = Texture.WRAP_ADDRESSMODE
  grit.anisotropicFilteringLevel = 4
  mats.bindAll(m => {
    m.setTexture('uRoadSegs', segs)
    m.setTexture('uRoadGrid', grid)
    m.setFloat('uRoadSegN', sn)
    m.setTexture('uRoadGrit', grit)
  })
  // the buildings' paving (docs/plans/done/buildings.md; shore.glsl, pavePaint): the buildings' shapes, on every
  // material that paints the roads; the cobbles ride in the grit (its G and B), their mean until it has loaded
  const shapes = worldBuildings.map(paveShape)
  if (shapes.length > 16) {
    throw new Error(`buildings: ${shapes.length} paved yards, the shader takes 16 (shore.glsl, pavePaint)`)
  }
  // the cover names each yard's building (its texels' B: src/look/world/cover.ts): look data built before the buildings
  // changed would paint one building's shape under another's yard, silently. Each building's centre texel names it
  {
    const C = look.cover
    worldBuildings.forEach((b, bi) => {
      const i = Math.floor((b.x - C.x0) / C.cell)
      const j = Math.floor((b.z - C.z0) / C.cell)
      const o = (j * C.n + i) * 4
      const m = C.tex[o + 2]
      if (C.tex[o] !== COVER.village || (m !== YARD_BASE + bi && m !== YARD_ALL)) {
        throw new Error(
          `buildings: the look data's cover does not name the ${b.model} at ${b.x}, ${b.z} (its yard reads ${m}, not ${YARD_BASE + bi}): rebuild the look data (node tools/build-look-data.ts)`,
        )
      }
    })
  }
  const pave = { a: shapes.flatMap(s => s.a), b: shapes.flatMap(s => s.b), n: shapes.length }
  mats.bindAll(m => {
    m.setArray4('uPaveA', pave.a)
    m.setArray4('uPaveB', pave.b)
    m.setFloat('uPaveN', pave.n)
  })
  roadTex = { segs, grid, grit, n: sn, pave }
}
// ?trees=one: every tree one model (L5b's judging, docs/plans/active/l5-macro.md); with
// ?trees=one,cards, drawn as leaf cards
// ?trees=cards: the crowns as leaf cards (docs/plans/done/l7a-canopy-cards.md); ?leaves=procedural draws the atlas
// instead of reading the oak picture; ?cardsize, ?cardcover, ?cardsink tune the cards (src/look/canopy.ts); ?volume=off
// puts back L7a's light, card by card (docs/plans/done/l7b-crown-volume.md); ?trees=gen,cards (the default): generated
// trees (prototypes/tree-core.js, docs/plans/done/tree-generator.md) where the pack's stand, and an orchard, a hedgerow
// and a row of poplars
// the generated trees with leaf-card crowns by default (docs/plans/done/gen-trees-default.md, decision 0031);
// ?trees=pack draws the pack's trees
const treesParam = params.get('trees')
const trees = treesParam ?? 'gen,cards'
const treeSet = new Set(trees === 'pack' ? [] : trees.split(','))
if (trees !== 'pack' && [...treeSet].some(k => k !== 'one' && k !== 'cards' && k !== 'gen')) {
  throw new Error(`?trees must be pack, or one, cards and gen in a comma list, not ${treesParam}`)
}
if (treeSet.has('one') && treeSet.has('gen')) throw new Error('?trees takes one or gen, not both')
// ?clumpvol=off (with gen): the generated crowns lit as one volume each, not one per clump
// (the A/B of the clumps' light)
if (params.has('clumpvol') && (params.get('clumpvol') !== 'off' || !treeSet.has('gen'))) {
  throw new Error('?clumpvol takes off, with ?trees=gen')
}
// the generator (a plain script that sets window.TREEGEN), loaded only for the arm that draws its trees
if (treeSet.has('gen')) await import('../../prototypes/tree-core.js')
const cardsOn = treeSet.has('cards')
// ?leaves: the leaf atlas (docs/plans/done/crown-leaves.md): layered (the default), the owner's sheet of simple
// leaves read as the painter's layers; oak, the oak picture the crowns had before; procedural, L7a's drawn oak clumps
const LEAVES = ['layered', 'oak', 'procedural'] as const
const leavesParam = params.get('leaves') ?? 'layered'
for (const k of ['leaves', 'leafpic', 'leafscale', 'cardsize', 'cardcover', 'cardsink', 'volume']) {
  if (params.has(k) && !cardsOn) throw new Error(`?${k} needs the leaf-card crowns (the default, or ?trees=cards)`)
}
if (!(LEAVES as readonly string[]).includes(leavesParam)) {
  throw new Error(`?leaves must be ${LEAVES.join(', ')}, not ${leavesParam}`)
}
// ?leafpic=<url>: a sheet of four leaf clumps on black (the oak sheet's layout, black transparent, three grey values:
// dark, mid, light) read as the layered sheet is (LEAF_PAINT): the owner's sheets swapped in without a build
const leafPic = params.get('leafpic')
if (leafPic !== null && (!leafPic || params.has('leaves'))) {
  throw new Error('?leafpic takes a picture URL, and replaces ?leaves')
}
const paintedLeaves = leavesParam !== 'oak' && leavesParam !== 'procedural'
const cardOpt = (k: string, d: number) => {
  const v = Number(params.get(k) ?? d)
  if (!(v > 0)) throw new Error(`?${k} must be a positive number, not ${params.get(k)}`)
  return v
}
// ?leafscale=<x>: the layered leaves' size, 1 the sheet's clumps at 0.8 a cell (docs/plans/done/crown-leaves.md)
if (params.has('leafscale') && !paintedLeaves) {
  throw new Error('?leafscale needs the layered leaves (not oak or procedural)')
}
const leafScale = cardOpt('leafscale', CARD_DEFAULTS.leafScale)
// (at least 0.25: smaller, a cell takes over 48 clumps and the leaves are a few texels)
if (!(leafScale >= 0.25 && leafScale <= 1)) throw new Error(`?leafscale must be 0.25 to 1, not ${leafScale}`)
const cardOpts: CardOptions = {
  size: cardOpt('cardsize', CARD_DEFAULTS.size),
  cover: cardOpt('cardcover', CARD_DEFAULTS.cover),
  sink: cardOpt('cardsink', CARD_DEFAULTS.sink),
  volume: params.get('volume') !== 'off',
  paint: paintedLeaves,
  leafScale,
}
if (params.has('volume') && params.get('volume') !== 'off') {
  throw new Error(`?volume must be off, not ${params.get('volume')}`)
}
let leafTex: DynamicTexture | null = null
if (cardsOn) {
  const atlas =
    leafPic || leavesParam === 'layered'
      ? atlasFromPicture(await loadImage(leafPic ?? SIMPLE_LEAF_URL), true, leafScale)
      : leavesParam === 'procedural'
        ? atlasProcedural()
        : atlasFromPicture(await loadImage(LEAF_URL))
  leafTex = new DynamicTexture('leaves', atlas, scene, true, Texture.TRILINEAR_SAMPLINGMODE)
  leafTex.hasAlpha = true
  leafTex.wrapU = leafTex.wrapV = Texture.CLAMP_ADDRESSMODE
  leafTex.update(false)
}
// ?wood: a dense wood (docs/plans/done/soft-shadows.md); ?wood=big: a forest (docs/plans/done/forest-bench.md)
const woodParam = params.get('wood')
if (woodParam !== null && woodParam !== '' && woodParam !== 'big') {
  throw new Error(`?wood takes no value or big, not ${woodParam}`)
}
const nature = buildNature(
  scene,
  mats,
  water.reflAdd,
  look.cover,
  leafTex ? { leaf: leafTex, opts: cardOpts } : undefined,
  woodParam === null ? 'off' : woodParam === 'big' ? 'big' : 'small',
  meadowOn,
  treeSet.has('one'),
  treeSet.has('gen') ? { season: season0, clumpVolume: params.get('clumpvol') !== 'off' } : null,
  onMap ? look.trees : null,
  params.has('frozen'), // a frozen clock: the far trees' fades snap (src/look/tree-fade.ts)
)
// the stones in the water, for their foam (src/look/shaders/shore.glsl): the terrain's band and the water paint it
{
  const a = new Array(D.spec.water.stones * 4).fill(0)
  nature.stones.forEach((st, k) => a.splice(k * 4, 4, ...st))
  for (const m of [...terrain.tileMats, water.waterMat, water.groundMat]) m.setArray4('uStones', a)
}
water.finish(scene)
// the buildings (docs/plans/done/buildings.md), before the bakes: their shadows and the sky they
// hide are baked with the trees'
const bldlmParam = params.get('bldlm')
const bldbounceParam = params.get('bldbounce')
if (bldlmParam !== null && bldlmParam !== '0') throw new Error(`?bldlm must be 0, not ${bldlmParam}`)
if (bldbounceParam !== null && bldbounceParam !== '0') throw new Error(`?bldbounce must be 0, not ${bldbounceParam}`)
// ?bldlm=0: the buildings' light by the runtime's taps (the A/B of their bake: docs/plans/done/building-light.md;
// WebGL1's always: the bake's reads are GLSL ES 3's); ?bldbounce=0: without the ground's bounce on their walls
const bldBaked = bldlmParam === null && !mats.webgl1
// (the runtime path without the bounce, as main had it: it computed the bounce and never added it)
const buildings = buildBuildings(
  scene,
  mats,
  nature.canopy,
  { baked: bldBaked, bounce: bldBaked && bldbounceParam === null },
  worldBuildings,
)
const bakes = buildBakes(
  scene,
  mats,
  waterData,
  terrain.tileGround,
  nature.canopy,
  nature.cardCasters,
  soft,
  nature.trunks,
  nature.farCull,
)
// the buildings' static light, baked after the light map (src/look/building-light.ts)
// (each bake timed, by reading it back, on the bench only)
const bldLight =
  bldBaked && buildings.meshes.length
    ? buildBuildingLight(scene, mats, bakes, buildings.meshes, buildings.instances, {
        bounce: bldbounceParam === null,
        timed: params.has('bench'),
      })
    : null
if (bldLight) {
  for (const m of buildings.meshes) {
    const mt = m.material as ShaderMaterial
    mt.setTexture('uBldLight', bldLight.atlas)
    if (bldLight.bounce) mt.setTexture('uBldBounce', bldLight.bounce)
  }
}
// ?far=off: no far tree, nor its shadows (built before the bakes: the far woods' whole cost; the A/B)
if (params.has('far')) {
  if (params.get('far') !== 'off') throw new Error(`?far must be off, not ${params.get('far')}`)
  nature.farCull?.off()
}
// the ground's macro colour (docs/plans/active/l5-macro.md): ?macro=flat|shader|bake|strokes|kuwahara picks the arm
// (bake by default), set once every material is made; the bake runs before the first frame
// the flow's textures (?grass=flow, src/look/flow.ts), on every painted material and the bake
const flowTex = grassMode === 'flow' ? buildFlow(scene) : null
if (flowTex) {
  mats.bindAll(m => {
    m.setTexture('uFlow', flowTex.flow)
    m.setTexture('uComb', flowTex.comb)
  })
}
// the meadow map (src/look/meadow.ts), before the ground's bake: the combed meadow bakes the default pattern where no
// grass grows and the combed one where it does (the combed clumps reach farther: their roots keep farther from the
// zones and the banks; the crops keep the default's rule)
const grassReach = grassMode === 'flow' ? CLUMP_REACH_FLOW : CLUMP_REACH
// (the same rule as the crops' on the default: one pass)
const grassAllowed =
  grassReach === CLUMP_REACH ? nature.growthAllowed : (x: number, z: number) => nature.growthAllowed(x, z, grassReach)
const meadowMap = meadowOn
  ? buildMeadowMap(scene, mats, nature.growth, grassAllowed, nature.crop, nature.growthAllowed)
  : null
// the combed meadow's near bake runs only where its strokes show: out to the strokes' ring, at the zooms where a pixel
// can be under the strokes' largest footprint (STROKE_FOOT; at the focus, the ground the screen's centre shows, under
// twice it, for the frame's foot, nearer than the focus), in the render's own pixels as strokeK measures them (pixA is
// at the SPEC's lines). The marched depth, not the eased one (no lag as the camera zooms in), the last frame's (none
// yet: it bakes)
const macro = buildMacro(
  scene,
  mats,
  frameCover,
  meadowOn,
  roadTex,
  grassDefines,
  flowTex,
  meadowMap?.map ?? null,
  {
    reach: RINGS[0].band[3],
    shows: () => !focusDist || ((pixA * D.spec.detail.lines) / sceneH()) * focusDist < 2 * STROKE_FOOT,
  },
  look.cover,
  relief,
)
// (WebGL1 cannot mipmap the bakes, whose stripes would then alias: there the shader arm is the default)
const macroArm = (params.get('macro') ?? (mats.webgl1 ? 'shader' : 'bake')) as MacroArm
if (!MACRO_ARMS.includes(macroArm)) {
  throw new Error(`?macro must be ${MACRO_ARMS.join(', ')}, not ${params.get('macro')}`)
}
// (a baked arm other than the bake's own bakes as it is set)
const armBake = await macro.setArm(macroArm)
const macroBake = armBake.texels ? armBake : await macro.bake()
// the camera's hold reads the highest ground near the focus from blocks of the heightfield (8 nodes, 14.3 m) and of
// the far ring (2 nodes, 28.6 m: past the heightfield the eye's ground is the far ring's)
const camera = (() => {
  const nearTile = maxGrid(look.hf, 8)
  const nearFar = maxGrid(look.far, 2)
  return buildCamera(
    scene,
    canvas,
    {
      ground: groundAt,
      highest: (x, z, reach) => Math.max(nearTile(x, z, reach), nearFar(x, z, reach)),
      follow: new FocusFollow(worldGround.focus),
    },
    new URLSearchParams(location.search).has('frozen'),
  )
})()
// the roads' live shader only from mid zoom in (docs/plans/done/roads.md, decision 0039): farther out the macro bake
// holds them and the tile's ground takes its material without them (the shader's size alone cost every ground pixel).
// Nearing ROAD_LIVE_R the live roads fade to the baked look (uRoadFar: the wheel tracks to their dusting, the grit
// out), so at the swap only the edge's sharpness changes (the bake's 0.5 m texels). The materials are compiled before
// the first frame, and the swap waits until the one it goes to is ready (a material not ready is not drawn). The shader
// arm has no bake to hold them: live at every zoom
const ROAD_LIVE_R = 170
const ROAD_HOLD = 4
const ROAD_FADE = 50
const splitParam = params.get('split')
let groundShare: [number, number, number] = [1, 0, 0] // (no roads' textures: the one material)
if (splitParam !== null && splitParam !== '0') throw new Error(`?split must be 0, not ${splitParam}`)
if (roadTex) {
  const live = terrain.terrainMat
  const roads = terrain.terrainRoadsMat
  const baked = terrain.terrainBakedMat
  const ground = terrain.tileGround
  // near too, the live shader only on the triangles near a road, and the paving's only near a yard (terrain.ts,
  // splitGround: the same pixels to a step of rounding; the road split about 1.1 ms a frame less at the default and
  // closest zooms; with the paving's split and its gate the buildings cost about 0.35 ms at the village's closest, from
  // 1.25: docs/plans/done/buildings.md); ?split=0 (above): the live shader
  // with the paving on the whole tile, the A/B (its share all paved)
  const sg = splitParam === '0' ? null : splitGround(terrain, frameCover)
  const split = sg?.material ?? live
  groundShare = sg?.share ?? [1, 0, 0]
  // (the materials the ground draws with: all three split, the live and the baked unsplit)
  const parts = split === live ? [...new Set([live, baked])] : [...new Set([live, roads, baked])]
  await Promise.all(parts.map(m => m.forceCompilationAsync(ground)))
  let far = false
  scene.onBeforeRenderObservable.add(() => {
    const r = camera.radius
    const fade = sstep(ROAD_LIVE_R - ROAD_HOLD - ROAD_FADE, ROAD_LIVE_R - ROAD_HOLD, r)
    for (const m of [live, roads, water.waterMat, water.groundMat]) m.setFloat('uRoadFar', fade)
    // (the debug views' water ground)
    if (ground.material !== live && ground.material !== split && ground.material !== baked) return
    far = isBakedArm(macro.arm()) && (far ? r > ROAD_LIVE_R - ROAD_HOLD : r > ROAD_LIVE_R + ROAD_HOLD)
    const want = far ? baked : split
    // (a MultiMaterial is always ready: the split waits on its materials)
    if (ground.material !== want && (want === split ? parts.every(m => m.isReady(ground)) : want.isReady(ground))) {
      ground.material = want
    }
  })
}
// ?dof=0|1: the gameplay depth of field, on by default (decision 0024); the look tools load the page with it off
const dofParam = params.get('dof')
if (dofParam !== null && dofParam !== '0' && dofParam !== '1') throw new Error(`?dof must be 0 or 1, not ${dofParam}`)
// (and off, unless ?dof sets it, on the bench, which compares with runs before decision 0024, and on the debug views,
// which write no distance to alpha)
if (dofParam !== null) S.dof = +dofParam
else if (params.has('bench') || params.has('water') || params.get('river') === 'debug') S.dof = 0
// ?dofnear=0: the near blur off (its cost's A/B: docs/plans/done/dof-v2.md)
if (params.get('dofnear') === '0') DOF_NEAR.px = 0
// the meadow near the camera (docs/plans/done/l5c-meadow.md), after the bakes and the macro colour it reads
const meadow = meadowMap ? buildMeadow(scene, mats, camera, meadowMap, !flag('nowide'), grassReach, meadowLook) : null
meadow?.under([...terrain.tileMats, water.waterMat, water.groundMat]) // the dark ground under its clumps (shore.glsl)
// ?armies=<battalions a side>: the demo's two armies (docs/plans/active/armies-demo.md): battalions of the ruleset's
// infantry (about 400 a battalion, decision 0018) that march up in column, deploy and fire on a scripted loop, drawn
// as figures (src/look/units.ts); ?unitshadow=0: without their cast shadows (decision 0047's A/B). Not on the page by
// default: the goldens and the look checks never see them
// The uniforms are the era's, named by dye and resolved onto the figure's roles (world/dyes.ts, decision 0068). Test
// switches (with ?armies): ?uniforms=all, each side's battalions wearing the scenario's reviewSides in turn;
// ?uniforms=all-greatcoats, the same with every man in his greatcoat; ?dye=<dye>:<rrggbb>[;…] (bare, or '#' as
// %23), those cloth dyes' values swapped for every uniform that names them (dyeOverride). The other arms
// (docs/plans/done/cavalry-artillery-demo.md, the scenario's ARMS_DEMO): ?cavalry=0, ?artillery=0 leave them out
// (with both, main's page before them)
const armiesParam = params.get('armies')
// (under ?sim the other arms are left out: their scripts are stand-ins the sim does not drive, nor place against its
// armies; asked for there, a clear error)
const armSwitch = (name: string) => {
  const on = bit(name)
  if (on && simParam) {
    throw new Error(`?${name}=1 with ?sim: the sim drives the infantry alone; the ${name} is scripted`)
  }
  return on ?? !simParam
}
const unitShadowParam = params.get('unitshadow')
// the figures' shadow map's A/B switches (docs/plans/active/armies-demo.md, batch A): ?ushadowrate=0 redraws it every
// frame (else only when it would change); ?ushadowlod=1 casts from the LOD the view draws (else the far LOD always);
// ?ushadowvs=0: the meadow reads it at every pixel (else once a blade, at its root: the owner's choice, 2026-10-22)
const bit = (k: string) => {
  const v = params.get(k)
  if (v !== null && v !== '0' && v !== '1') throw new Error(`?${k} must be 0 or 1, not ${v}`)
  return v === null ? null : v === '1'
}
const uShadowRate = bit('ushadowrate')
const uShadowLod = bit('ushadowlod')
const uShadowVs = bit('ushadowvs')
const farPal = bit('farpal')
// ?uvat=0: the far LOD and its casters skinned, not posed; ?ucull=0: every caster in the sun's box
const uVat = bit('uvat')
const uCull = bit('ucull')
// ?tinylod=0: no tiny LOD (docs/plans/active/armies-32k.md, step 3); ?tinypx=<px>: its switch, the figure's height
const tinyLod = bit('tinylod')
const tinyPxParam = params.get('tinypx')
if (tinyPxParam !== null && !(/^\d+(\.\d+)?$/.test(tinyPxParam) && +tinyPxParam > 0)) {
  throw new Error(`?tinypx must be a positive number of pixels, not ${tinyPxParam}`)
}
// the shadow fix: ?smhold=fixed, the held sun box (and the trodden mask's) as batch B's;
// ?shadowlod=far, the far LOD casts
const smHold = params.get('smhold')
const shadowLod = params.get('shadowlod')
if (smHold !== null && smHold !== 'fixed') throw new Error(`?smhold must be fixed, not ${smHold}`)
if (shadowLod !== null && shadowLod !== 'far') throw new Error(`?shadowlod must be far, not ${shadowLod}`)
// batch C: ?farscale=0, the far figures at their own size
const farScale = bit('farscale')
// ?lodfade=0: the LODs' hard switch, a battalion wholly at one LOD (decision 0066: else each man at his own, faded)
const lodFade = bit('lodfade')
// ?trample=0: no trodden ground; ?flags=0: no colours
const trample = bit('trample')
const flags = bit('flags')
// the close zoom (docs/plans/active/close-zoom.md): ?nearestpx=<px>, the figure's height on screen from which a man is
// drawn at the figure's nearest LOD (when it has one); 0: never
const nearestPx = params.get('nearestpx')
if (nearestPx !== null && !(/^\d+$/.test(nearestPx) && +nearestPx <= 2000)) {
  throw new Error(`?nearestpx must be a whole number of pixels, 0 to 2000, not ${nearestPx}`)
}
// the simple shadows (decision 0049, docs/plans/active/simple-soldier-shadows.md): ?ushadowfar=map, the map at every
// zoom (the A/B; else simple: a baked shape a man drawn on the ground, beyond close zoom or at every zoom, below);
// ?ushadowswitch=<r0>,<r1>, the cross-fade's band (m from the focus); ?smoothmove=0, the figures' places at the 12 fps
// steps (else every frame; the poses stay stepped);
// ?udecallift=<m>, how high over the ground the simple shadows cover the grass and the men's legs
// decision 0062 (docs/plans/done/soft-shadows-all.md): the simple shadows at every zoom; ?ushadowclose=map, the map
// up close as before (cross-faded to them over ?ushadowswitch); their look up close, ?ushsoft=<0..1> (the soft bake's
// share at the tip), ?ushdark=<0..1> (the full shadow's share at the tip), ?ushlen=<0.3..1.5> (their length), each
// <close>[,<far>] (far: decision 0049's unless given); ?ushfoot=<dark>,<core m>[,<far dark>,<far core m>], the contact
// at the soles (its darkness, a share of the full shadow, and the core it holds over before turning to the tip's);
// ?ushband=<r0>,<r1>, the band (m from the focus) the close look turns into the far one; ?ushgain=<1..3>[,<far>],
// the darkening's strength, foot and tip alike (1, the default since decision 0071: as decision 0062 shipped it;
// decision 0067's 2,1.5: docs/plans/done/shadow-darker.md)
// the contact shadow (decision 0071; off since decision 0074): ?ushcontact=1 (0071's) or <pad m>,<dark>[,<soft>], the
// oval under each man's feet (0: none); ?ushcontactat=root|stride|step, where it sits; ?ushcontactband=<r0>,<r1>, the
// zoom band (m from the focus) it fades out over; ?ushdesat=<0..1>, the ground's shade turned toward its grey (0: as
// before). The earlier pages: ?ushstep=0&ushcontact=1 is decision 0071's (main at 1093fdc3);
// ?ushstep=0&ushdesat=0&ushgain=2,1.5&ushfoot=1.05,0.4 is decision 0067's
// (src/look/shadow-look.ts parses them, a bad value an error at load)
const shadowMode = shadowModes(params)
const shadowLook = { close: { ...SHADOW_LOOK.close }, far: { ...SHADOW_LOOK.far } }
const ushBand = applyLookParams(params, shadowLook.close, shadowLook.far).band
const ushContact = applyContactParams(params)
// the shape baked per animation step up close (decision 0074, docs/plans/done/step-shadows.md): ?ushstep=<steps a
// clip>[,<facings>[,hold|blend]] (absent: 8,8,hold; 0: the shape averaged over each clip at every zoom, as before)
const ushStep = applyStepParams(params)
// ?ushfootk=<boost>[,<reach m>]: the per-step shape's feet darker and crisper, never past the ground's shade (absent:
// 3,0.6; 1: none)
const ushFootK = applyFootSharpParams(params)
// ?ushnearband=<r0>,<r1>: the zoom band (m from the focus) where the per-step shape gives way to the averaged one
// (absent: 60,100; ?ushcontactband is the oval's own, with ?ushcontact=1)
const ushNearBand = applyNearBandParams(params)
const ushDesat = shadeDesat(params)
const uShadowSwitch = params.get('ushadowswitch')
const smoothMove = bit('smoothmove')
const decalLift = params.get('udecallift')
if (decalLift !== null && !(Number.isFinite(+decalLift) && +decalLift >= 0 && +decalLift <= 3)) {
  throw new Error(`?udecallift must be 0 to 3 m, not ${decalLift}`)
}
const shadowBand = uShadowSwitch === null ? null : uShadowSwitch.split(',').map(Number)
if (
  shadowBand &&
  !(shadowBand.length === 2 && shadowBand.every(Number.isFinite) && shadowBand[0] >= 0 && shadowBand[1] > shadowBand[0])
) {
  throw new Error(`?ushadowswitch must be <r0>,<r1> m with r0 < r1, not ${uShadowSwitch}`)
}
// ?sim: the armies played by the sim, not the script (battle threads PR 4b; needs ?armies)
const simParam = params.has('sim')
if (simParam && armiesParam === null) throw new Error('?sim plays the armies: give ?armies=<battalions a side> too')
// (a window's armies: stage A4 of docs/plans/active/look-austerlitz-a1.md's plan)
if (onMap && armiesParam !== null) throw new Error("?armies is the demo world's: a map window has none yet")
if (armiesParam !== null && !(/^\d+$/.test(armiesParam) && +armiesParam >= 1 && +armiesParam <= 40)) {
  throw new Error(
    `?armies must be 1 to 40 battalions a side (the demo map holds 40: docs/plans/active/armies-32k.md), not ${armiesParam}`,
  )
}
if (unitShadowParam !== null && unitShadowParam !== '0' && unitShadowParam !== '1') {
  throw new Error(`?unitshadow must be 0 or 1, not ${unitShadowParam}`)
}
// (the scene's samples before the armies: their simple shadows' material is built for them, src/look/units.ts)
if (params.has('msaa')) {
  const n = Number(params.get('msaa'))
  if (![1, 2, 4].includes(n)) throw new Error(`?msaa must be 1, 2 or 4, not ${params.get('msaa')}`)
  MSAA.samples = n
}
// (the fight's middle: the bench's focus)
let armiesFocus: [number, number] | null = null
// (?lookat looks at the armies' arms: without them a clear error)
if (armiesParam === null && params.get('lookat') !== null) {
  throw new Error(`?lookat=${params.get('lookat')} needs ?armies: it looks at the armies' arms`)
}
if (armiesParam !== null) {
  if (mats.webgl1) {
    throw new Error('?armies needs WebGL2 (the figures read their animation with texelFetch: decision 0046)')
  }
  const [
    { Units: UnitsC },
    { decodeUnits },
    { layout, facingAt, FIELD },
    { dressAll, dyeOverride, wearInTurn },
    { RULESETS },
    { ARMIES_DEMO, ARMS_DEMO },
    { armScript, battalionBoxes, drillScript, lookAtSpot, placeArmUnits },
    { Trodden, ViewRays },
  ] = await Promise.all([
    import('./units.ts'),
    import('./units-data.ts'),
    import('./world/armies.ts'),
    import('./world/dyes.ts'),
    import('../rulesets/index.ts'),
    import('../scenarios/armies-demo.ts'),
    import('./world/arms.ts'),
    import('./trodden.ts'),
  ])
  if (tinyPxParam !== null && +tinyPxParam >= UnitsC.LOD_PX) {
    throw new Error(`?tinypx must be under the far LOD's switch (${UnitsC.LOD_PX} px), not ${tinyPxParam}`)
  }
  // the scenario's era, unit type and figure, resolved by name (decision 0015: the page names none of them)
  const era = RULESETS[ARMIES_DEMO.ruleset]
  if (!era) throw new Error(`armies: no ruleset ${ARMIES_DEMO.ruleset} (src/rulesets/index.ts)`)
  const type = era.ruleset.types[ARMIES_DEMO.unitType]
  if (!type) throw new Error(`armies: the ruleset ${ARMIES_DEMO.ruleset} has no unit type ${ARMIES_DEMO.unitType}`)
  // a figure's unit data by name (data/figures/<figure>.unitdata)
  const figureData = async (figure: string) => {
    const url = FIGURES[`../../data/figures/${figure}.unitdata`]
    if (!url) throw new Error(`armies: no figure ${figure} in data/figures/`)
    const res = await fetch(url)
    if (!res.ok) throw new Error(`unit data: ${res.status} ${res.statusText} for ${url}`)
    return decodeUnits(await res.arrayBuffer())
  }
  const g = type.geometry
  const drill = {
    companies: g.companies,
    files: g.files,
    ranks: g.ranks,
    fileSpacing: g.fileSpacing,
    rankSpacing: g.rankSpacing,
  }
  // the ground a battalion keeps clear of: the river and its banks, the trees (a 10 m grid of them), the buildings'
  // yards, the tile's last 30 m
  const CELL = 10
  const trees = new Map<number, number[]>()
  const key = (i: number, j: number) => i * 4096 + j
  // (the trees alone, their trunk and low crown: half the crown's reach; a battalion walks through the bushes)
  for (const t of nature.canopy) {
    if (!t[4]) continue
    const i = Math.floor(t[0] / CELL)
    const j = Math.floor(t[1] / CELL)
    const k = key(i, j)
    const r = t[2] * 0.5
    const l = trees.get(k)
    if (l) l.push(t[0], t[1], r)
    else trees.set(k, [t[0], t[1], r])
  }
  const nearTree = (x: number, z: number) => {
    const i0 = Math.floor(x / CELL)
    const j0 = Math.floor(z / CELL)
    for (let i = i0 - 1; i <= i0 + 1; i++) {
      for (let j = j0 - 1; j <= j0 + 1; j++) {
        const l = trees.get(key(i, j))
        if (l) for (let k = 0; k < l.length; k += 3) if (Math.hypot(l[k] - x, l[k + 1] - z) < l[k + 2] + 1) return true
      }
    }
    return false
  }
  const blocked = (x: number, z: number) => {
    if (Math.max(Math.abs(x), Math.abs(z)) > D.spec.tile / 2 - 30) return true
    const q = riverQuery(x, z)
    return (q !== null && q.dist < 20) || onPaving(x, z, 3) || nearTree(x, z)
  }
  const uniformsParam = params.get('uniforms')
  if (uniformsParam !== null && uniformsParam !== 'all' && uniformsParam !== 'all-greatcoats') {
    throw new Error(`?uniforms must be all or all-greatcoats, not ${uniformsParam}`)
  }
  const greatcoat = uniformsParam === 'all-greatcoats'
  const dyes = dyeOverride(params.get('dye'), era.dyes)
  const uniforms = dressAll(era.uniforms, dyes, { greatcoat })
  const placed = layout(+armiesParam, drill, blocked, ARMIES_DEMO.sides, FIELD.centre, FIELD.gap)
  // every figure fetched and decoded at once (the infantry's and each arm on the page)
  const armSpecs = ARMS_DEMO.filter(spec => armSwitch(spec.name))
  const [infantry, ...armData] = await Promise.all([ARMIES_DEMO.figure, ...armSpecs.map(a => a.figure)].map(figureData))
  const speed = { march: infantry.ranges.march?.speed ?? 0, run: infantry.ranges.run?.speed ?? 0 }
  if (!(speed.march > 0 && speed.run > 0)) throw new Error('units: the march and run roles have no root speed')
  const tinyPx = tinyLod === false ? 0 : tinyPxParam !== null ? +tinyPxParam : undefined
  // the ground and the grass: the figures' shadow map (with its switches) and the trodden mask fall on them
  const receivers = [...terrain.tileMats, ...(meadow?.meshes.map(m => m.material as ShaderMaterial) ?? [])]
  // the frame's corner rays, cast once for the sun's box and the trodden mask (made before them: read after it)
  const view = new ViewRays(scene, camera)
  // (the infantry's arm owns the figures' shadow map behind its switches, decision 0075)
  const foot = new UnitsC(
    scene,
    camera,
    mats,
    infantry,
    drillScript(drill, speed),
    uniformsParam === null ? placed : wearInTurn(placed, ARMIES_DEMO.reviewSides),
    uniforms,
    () => S.t,
    view,
    { tinyPx, map: receivers },
  )
  // the ground's shade the simple shadows darken it to (src/look/bakes.ts unitShade): made only with them, baked again
  // after the bounce map (the season, the shadows' switch, the grain) and when the occlusion's switch changes
  const shade = simpleShadowsDraw(params) ? bakes.unitShade(ushDesat) : null
  if (shade) {
    let ao = S.ao
    scene.onBeforeRenderObservable.add(() => {
      if (S.ao !== ao) {
        ao = S.ao
        shade.resetRefreshCounter()
      }
    })
  }
  // an arm's renderer given the page's switches
  const configure = (units: Units) => {
    units.lazyShadows = uShadowRate ?? true
    units.casterNear = uShadowLod ?? false
    units.tightCull = uCull ?? true
    units.holdShare = smHold !== 'fixed'
    units.proxyCasters = shadowLod !== 'far'
    if (nearestPx !== null) units.nearestPx = +nearestPx
    units.simpleFar = shadowMode.simpleFar
    units.simpleClose = shadowMode.simpleClose
    units.look = shadowLook
    units.contact = ushContact
    units.stepShadow = ushStep
    units.stepExplicit = params.has('ushstep')
    units.stepBand = ushNearBand
    units.footSharp = ushFootK
    if (ushBand) units.lookBand = ushBand
    if (shadowBand) units.band = [shadowBand[0], shadowBand[1]]
    units.groundMap = meadow !== null
    if (decalLift !== null) units.decalLift = +decalLift
    // (every arm darkens the ground to the one shade; the map's receivers read it by blade on the meadow)
    if (shade) units.shade = shade
    // (read only by the arm that owns the map)
    if (uShadowVs ?? true) units.rootReceivers = meadow?.meshes.map(m => m.material as ShaderMaterial) ?? []
    units.setShadows(unitShadowParam !== '0')
    units.setPosed(uVat ?? true)
    units.setFarScale(farScale ?? true)
    units.setLodFade(lodFade ?? true)
    units.setFlags(flags ?? true)
    units.setFarRule(farPal) // (each uniform's far rule; ?farpal=0|1 forces it off or on for every uniform: the A/B)
    // (on: measured free, docs/plans/active/simple-soldier-shadows.md; the owner's call open)
    units.setSmooth(smoothMove ?? true)
  }
  configure(foot)
  // the other arms (ARMS_DEMO): each side's unit placed after the infantry, clear of it and of one another; no shadow
  // map of its own (its simple shadows); its uniforms resolved for its figure's parts
  const arms: Record<string, Units> = {}
  const taken = battalionBoxes(placed, drill)
  for (const [i, spec] of armSpecs.entries()) {
    const data = armData[i]
    const t = era.ruleset.types[spec.unitType]
    const f = t?.formations[spec.formation]
    if (!t || !f) throw new Error(`armies: the ruleset has no ${spec.unitType} in ${spec.formation} (${spec.name})`)
    const speeds = Object.fromEntries(Object.entries(data.ranges).map(([k, r]) => [k, r.speed]))
    const { script, foot: footprint } = armScript(spec, t.geometry, g => f.place(g), speeds)
    // (from the layout's centre, its fronts half its gap either side: src/look/world/armies.ts FIELD)
    const placedArm = placeArmUnits(spec, footprint, FIELD.centre, FIELD.gap / 2, blocked, taken)
    if (placedArm.length === 0) continue
    // (its sides' dresses alone: another arm's lack this figure's parts, a carriage's paint)
    const dress = Object.fromEntries(spec.sides.map(id => [id, era.uniforms[id]]))
    for (const id of spec.sides) if (!era.uniforms[id]) throw new Error(`armies: no uniform ${id} (${spec.name})`)
    const worn = dressAll(dress, dyes, { greatcoat, parts: data.parts ?? undefined })
    const u = new UnitsC(scene, camera, mats, data, script, placedArm, worn, () => S.t, view, {
      tinyPx,
      flags: false,
      tread: spec.tread,
      shadowDarken: spec.shadowDarken,
    })
    configure(u)
    arms[spec.name] = u
  }
  // the trodden ground (src/look/trodden.ts): every arm's men, drawn after they are placed each frame (made after them)
  const all = [foot, ...Object.values(arms)]
  const trodden = new Trodden(scene, view, receivers, () => S.t)
  for (const u of all) trodden.add(u)
  trodden.holdShare = smHold !== 'fixed'
  trodden.setOn(trample ?? true)
  armiesFocus = facingAt(foot.battalions)
  // ?sim: the sim plays the infantry (src/look/sim-armies.ts, battle threads PR 4b) in place of its script (the other
  // arms are left out under it: armSwitch)
  let sim: SimPlay | null = null
  if (simParam) {
    const { playSim } = await import('./sim-armies.ts')
    sim = await playSim(foot.battalions, drill.companies * drill.files * drill.ranks, armiesFocus, {
      ruleset: ARMIES_DEMO.ruleset,
      unitType: ARMIES_DEMO.unitType,
      ...ARMIES_DEMO.sim,
    })
    foot.source = sim.source
    const s = sim
    // (first: the renderer's frame reads what the tick took)
    scene.onBeforeRenderObservable.add(
      () => {
        const t = trNow()
        s.tick(Math.min(engine.getDeltaTime() / 1000, 0.1))
        if (t) tr(TR.simMs, performance.now() - t)
      },
      undefined,
      true,
    )
  }
  // the tools' hooks: __units the infantry's renderer, as before the arms (tools/guard.mjs masks and scores it alone,
  // against its coats: like for like with main); __armies' show and setMask every arm's, arms the other arms'
  // renderers by name (the review's cameras)
  const show = (on: boolean) => all.forEach(u => u.show(on))
  const setMask = (m: Parameters<Units['setMask']>[0]) => all.forEach(u => u.setMask(m))
  const hooks = { blocked, focus: armiesFocus, coats: foot.coats(), arms, show, setMask, sim: sim?.link }
  Object.assign(window, { __units: foot, __armies: hooks })
  // ?lookat=<arm>[,<radius m>]: the camera starts on that arm's first unit or the fight's middle (lookAtSpot), its
  // target on the ground there: to judge the arms by eye without panning to them
  const firsts = Object.fromEntries(Object.entries(arms).map(([k, a]) => [k, a.battalions[0]]))
  const at = lookAtSpot(params.get('lookat'), firsts, armiesFocus)
  if (at) {
    camera.target.set(at.x, groundAt(at.x, at.z), at.z)
    zoomOf(camera).set(at.radius)
  }
}

if (flag('rt16')) MSAA.byte = false
// half floats: an 8-bit target stores a NaN as 0, which nothing can mark
if (flag('nanmark')) {
  DEBUG.nanmark = true
  MSAA.byte = false
}
// ?upscale=bilinear: the canvas drawn smaller and stretched by the browser at every scale, as before decision 0045
// (the A/B); WebGL1 the same (the chain's last pass reads texels by index: GLSL ES 3)
const upscaleParam = params.get('upscale')
if (upscaleParam !== null && upscaleParam !== 'bilinear') {
  throw new Error(`?upscale must be bilinear, not ${upscaleParam}`)
}
const upscale = !mats.webgl1 && upscaleParam === null
const post = new Post(camera, engine, S, () => mats.grain, groundAt, upscale)

/* ---------- UI ---------- */
const byId = <T extends HTMLElement>(id: string): T => {
  const e = document.getElementById(id)
  if (!e) throw new Error(`look.html has no #${id}`)
  return e as T
}
const input = (id: string) => byId<HTMLInputElement>(id)
input('dofamt').oninput = () => {
  S.dofAmt = +input('dofamt').value
}
// the render scale (decision 0045, after 0036): a fixed one from the panel, or Auto (S.res 0, the default): by zoom,
// from the camera's radius, a level of AUTO (each change resizes the frame's targets: two over the whole range; the
// edges at 80 and 88 % of the zoom range it was tuned on, TUNED_R to rMax: 217 and 234 m; 0.75 at the widest),
// changed only once the radius is AUTO_HOLD m past the level's edge (no flicker at an edge). The closer zoom (decision
// 0051) keeps the edges where they were: 0.9 from the closest zoom to the first.
// The interface is HTML over the canvas: it stays sharp. The check tools pin it to 1 (tools/look-page.mjs)
const { rMax } = D.spec.camera
const at = (f: number) => TUNED_R + f * (rMax - TUNED_R)
// From the closest zoom 0.9 (the owner, 2026-10-20: docs/plans/done/render-scale.md). With the upscale (above) the
// canvas stays at the page's pixels and the finishing chain draws at the scale, resized in place (post.scale: no pass
// made again), its last pass drawing the screen: EASU at 0.9, bilinear at the wide zooms' scales (EASU cost more than
// it saved there), a copy at 1 (the tools' pinned scale: the same pixels); over 1 (the panel's Retina) and without the
// upscale (WebGL1, ?upscale=bilinear, or the upscale given up: post.upscale) the hardware scale, as before, and the
// closest level at 1, as before
const AUTO: [number, number][] = [
  [at(0.8), 0.9],
  [at(0.88), 0.8],
  [Infinity, 0.75],
]
const AUTO_HOLD = 4
// (without the upscale, main's: 1, then 0.9 from 72 %, as decision 0036 had it)
const AUTO_STRETCH: [number, number][] = [
  [at(0.72), 1],
  [at(0.8), 0.9],
  [at(0.88), 0.8],
  [Infinity, 0.75],
]
let scaleNow = 1
let upNow = false
let level = 0
const applyScale = (s: number) => {
  const up = post.upscale
  if (s === scaleNow && up === upNow) return
  scaleNow = s
  upNow = up
  const k = up ? Math.min(s, 1) : 1
  post.scale = k
  engine.setHardwareScalingLevel(k / s)
}
const resSel = byId<HTMLSelectElement>('res')
resSel.onchange = () => {
  S.res = +resSel.value
}
const scaleTick = () => {
  if (+resSel.value !== S.res) resSel.value = String(S.res) // the panel follows a scale set elsewhere (the tools)
  if (S.res) applyScale(S.res)
  else {
    const r = camera.radius
    const auto = post.upscale ? AUTO : AUTO_STRETCH
    if (level >= auto.length) level = auto.length - 1
    while (level < auto.length - 1 && r > auto[level][0] + AUTO_HOLD) level++
    while (level > 0 && r < auto[level - 1][0] - AUTO_HOLD) level--
    applyScale(auto[level][1])
  }
  post.resize() // (the passes' sizes after the canvas's: the hardware scale above, or the window)
}
// the first level before the chain is made (it is made once, at the scale the first frame draws at)
scaleTick()
post.build()
scene.onBeforeRenderObservable.add(scaleTick)
const TOGGLES = [
  'grain',
  'edges',
  'clouds',
  'shadows',
  'ao',
  'mist',
  'shafts',
  'back',
  'grade',
  'bloom',
  'dof',
] as const
// ?bloom=0: open with the bloom off (an A/B, docs/plans/done/frame-readout.md)
// ?far=off (below, after the bakes), ?msaa=1 (before the passes): the widest zoom's A/Bs (docs/plans/done/wide-perf.md)
if (params.has('bloom')) {
  if (params.get('bloom') !== '0') throw new Error(`?bloom must be 0, not ${params.get('bloom')}`)
  S.bloom = 0
}
type Toggle = (typeof TOGGLES)[number]
const isToggle = (k: string | undefined): k is Toggle => (TOGGLES as readonly (string | undefined)[]).includes(k)
// the buttons show the state (?dof and the bench's arms change it)
const syncButtons = () =>
  document.querySelectorAll<HTMLButtonElement>('.tg').forEach(b => {
    const k = b.dataset.k
    if (isToggle(k)) {
      b.classList.toggle('on', !!S[k])
      b.textContent = S[k] ? 'On' : 'Off'
    }
  })
syncButtons()
document.querySelectorAll<HTMLButtonElement>('.tg').forEach(
  b =>
    (b.onclick = () => {
      const k = b.dataset.k
      if (!isToggle(k)) throw new Error(`panel button with an unknown data-k: ${k}`)
      S[k] = S[k] ? 0 : 1
      syncButtons()
      if (k === 'dof') post.build()
    }),
)
input('gamt').oninput = () => {
  S.gamt = +input('gamt').value
}
const SEASONS = ['Summer', 'Early autumn', 'Late autumn', 'Winter']
// the bounce map (LC5) reads the season, the shadows' switch and the grain: baked again once they hold for a frame
// after a change, however they were set (the checks set S.season), but not while the season slider is held (it bakes
// when released). A bake for any other reason (the light map's) records what it was baked for, so none runs twice
{
  const key = () => `${S.season} ${S.shadows} ${mats.grain.uniqueId}`
  let baked = key()
  let last = baked
  let held = false
  input('season').addEventListener('pointerdown', () => {
    held = true
  })
  input('season').addEventListener('change', () => {
    held = false
  })
  // released without a change too
  window.addEventListener('pointerup', () => {
    held = false
  })
  bakes.groundBounce.onAfterRenderObservable.add(() => {
    baked = key()
  })
  scene.onBeforeRenderObservable.add(() => {
    const k = key()
    if (k !== baked && k === last && !held) bakes.groundBounce.resetRefreshCounter()
    last = k
  })
}
input('season').oninput = () => {
  S.season = +input('season').value
  byId('slabel').textContent = SEASONS[Math.min(3, Math.round(S.season))]
}
// under ?trees=gen the generated trees follow the season (twigs, thinning crowns), and on release of the slider their
// shadows are baked again when what casts them changed. A judging aid of this page, as the grain's drop is: in the
// game the season is set per map (docs/art-bible.md §4b) and the static light baked once for it. The sky's occlusion
// stays the one baked for the season the page opened in
if (nature.setSeason && nature.shadowState) {
  const setSeason = nature.setSeason
  const shadowState = nature.shadowState
  let baked = ''
  bakes.shadowRT.onAfterRenderObservable.add(() => {
    baked = shadowState()
  })
  input('season').addEventListener('input', () => setSeason(S.season))
  input('season').addEventListener('change', () => {
    if (shadowState() !== baked) bakes.shadowRT.resetRefreshCounter()
  })
}
// the settings panel hides (its × or H) behind a small Settings button, and comes back from it (or H)
{
  const panel = byId('panel')
  const show = byId('showp')
  const setHidden = (h: boolean) => {
    panel.classList.toggle('hidden', h)
    show.classList.toggle('hidden', !h)
  }
  byId('hidep').onclick = () => setHidden(true)
  show.onclick = () => setHidden(false)
  addEventListener('keydown', e => {
    if (e.code === 'KeyH' && !typingIn(e.target) && !e.metaKey && !e.ctrlKey) {
      setHidden(!panel.classList.contains('hidden'))
    }
  })
}
// zoom: a slider beside the wheel and the pinch (src/look/post.ts rtsControls), from the nearest zoom to the farthest
// on a log scale, following the camera
{
  const zoomEl = input('zoom')
  const lo = Math.log(camera.lowerRadiusLimit ?? 1)
  const hi = Math.log(camera.upperRadiusLimit ?? 1000)
  let dragging = false
  zoomEl.addEventListener('pointerdown', () => {
    dragging = true
  })
  for (const ev of ['pointerup', 'pointercancel', 'blur']) {
    addEventListener(ev, () => {
      dragging = false
    })
  }
  zoomEl.addEventListener('change', () => {
    dragging = false
  })
  // (the wanted zoom: ZoomHold)
  zoomEl.oninput = () => {
    zoomOf(camera).set(Math.exp(lo + (hi - lo) * +zoomEl.value))
  }
  let shown = NaN
  scene.onBeforeRenderObservable.add(() => {
    if (!dragging && camera.radius !== shown) {
      shown = camera.radius
      zoomEl.value = String((Math.log(shown) - lo) / (hi - lo))
    }
  })
}
const dropEl = byId('drop')
addEventListener('dragover', e => {
  e.preventDefault()
  dropEl.style.display = 'flex'
})
addEventListener('dragleave', () => (dropEl.style.display = 'none'))
addEventListener('drop', e => {
  e.preventDefault()
  dropEl.style.display = 'none'
  const f = e.dataTransfer?.files[0]
  if (!f || !/image/.test(f.type)) return
  const img = new Image()
  // with Shift held, a picture of four leaf clumps on black replaces the cards' atlas
  if (e.shiftKey) {
    if (!leafTex) {
      console.warn('dropping a leaf picture needs the leaf-card crowns (the default, or ?trees=cards)')
      return
    }
    const tex = leafTex
    // the crowns cast through the atlas too: the render-once shadow map, and the light map after it, are redone
    const url = URL.createObjectURL(f)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let atlas: HTMLCanvasElement
      try {
        atlas = atlasFromPicture(img, cardOpts.paint, cardOpts.leafScale) // read as the page reads its sheet
      } catch (err) {
        alert(String(err))
        return
      }
      tex.getContext().clearRect(0, 0, atlas.width, atlas.height)
      tex.getContext().drawImage(atlas, 0, 0)
      tex.update(false)
      // the shadows are baked with the cards shown
      nature.showCards?.(true)
      bakes.shadowRT.resetRefreshCounter()
    }
    img.src = url
    return
  }
  img.onload = () => {
    const old = mats.grain
    const cv = makeGrainCanvas(lumOf(img))
    mats.setGrain(grainTexture(scene, cv), grainMean(cv))
    bakes.lightMap.resetRefreshCounter()
    if (!keptGrains.has(old)) old.dispose()
  }
  img.src = URL.createObjectURL(f)
})

/* ---------- loop ---------- */
const fpsEl = byId('fps')
// golden screenshots (tools/golden.mjs): the clock stays at 0
const FROZEN = new URLSearchParams(location.search).has('frozen')
// sun colour follows the season: warm gold in summer and autumn, pale gold in winter (keeps snow white, not yellow)
const SUNCOL = MOOD.sun.clone()
// the mood's light by the season (seasonLight, src/look/mood.ts), recomputed only when the season moves; the clear
// colour (the frame's top past the world) graded at the season's saturation, as the materials
let seasonAt = -1
let clearGraded = CLEAR_GRADED
scene.onBeforeRenderObservable.add(() => {
  if (S.season === seasonAt) return
  seasonAt = S.season
  seasonLight(MOOD, S.season, SEASON)
  clearGraded = gradeColour(MOOD.hazeCool, MOOD, 1, SEASON.sat)
  // (one copy shared by the per-frame materials)
  const snap = seasonSnapshot()
  for (const m of mats.all) setSeasonUniforms(m, snap)
})
scene.onBeforeRenderObservable.add(() => {
  const w = Math.max(0, Math.min(1, S.season - 2))
  Color3.LerpToRef(MOOD.sun, MOOD.winterSun, w, SUNCOL)
  const k = Color3.Lerp(MOOD.hazeCool, clearGraded, S.grade)
  scene.clearColor.set(k.r, k.g, k.b, 1)
})
// the detail layer's pixel angle (src/look/shaders/painter.glsl): the angle one pixel of a SPEC.detail.lines-tall
// frame spans, from the camera's actual vertical field of view (narrower than the SPEC's on frames wider than 16:9)
let pixA = 0
let focusDist = 0
const camFwd = new Vector3()
scene.onBeforeRenderObservable.add(() => {
  const tv =
    camera.fovMode === Camera.FOVMODE_VERTICAL_FIXED
      ? Math.tan(camera.fov / 2)
      : Math.tan(camera.fov / 2) / engine.getAspectRatio(camera)
  pixA = (2 * tv) / D.spec.detail.lines
  if (!FROZEN) S.t += Math.min(engine.getDeltaTime() / 1000, 0.05)
  // the depth of field's focus and the view axis, which every material encodes its lens
  // term against (painter.glsl depthA)
  const focusZ = post.updateFocus(engine.getDeltaTime() / 1000, S.dof > 0 || grassMode === 'flow')
  focusDist = post.focusRaw
  camFwd.copyFrom(camera.target).subtractInPlace(camera.position).normalize()
  for (const m of mats.all) {
    m.setFloat('uFocusZ', focusZ)
    m.setVector3('uCamFwd', camFwd)
    m.setVector3('uCamPos', camera.position)
    m.setVector3('uFocus', camera.target)
    m.setFloat('uTime', S.t)
    m.setFloat('uGrainAmt', S.grain ? S.gamt : 0)
    m.setFloat('uGrade', S.grade)
    m.setFloat('uViewH', sceneH())
    m.setFloat('uShadowsOn', S.shadows)
    m.setFloat('uSeason', S.season)
    m.setColor3('uSunCol', SUNCOL)
    m.setFloat('uEdges', S.edges)
    m.setFloat('uClouds', S.clouds)
    m.setFloat('uPixA', pixA)
    m.setFloat('uAO', S.ao)
    m.setFloat('uMist', S.mist)
    m.setFloat('uShafts', S.shafts)
    m.setFloat('uBack', S.back)
  }
})
// the frame readout (top right; docs/plans/done/frame-readout.md): over the last FRAMES frames (fewer until there are
// as many), the frame interval's median (and as fps) and its slowest 5 % (with vsync on, the display's slots), the
// render's CPU time (the JavaScript, until the GPU's work is queued), and the share of frames that took longer than
// one and a half of the median: frames that missed their slot (the display's rate shows as the median; a page that
// keeps up has none, whatever the rate)
const FRAMES = 120
const iv = new Float32Array(FRAMES)
const cpu = new Float32Array(FRAMES)
let fi = 0
let lastT = 0
let shown = 0
engine.runRenderLoop(() => {
  const t0 = performance.now()
  scene.render()
  mats.failSamplers() // (a material over Metal's texture units: the page stops here, on any GPU)
  const t1 = performance.now()
  if (lastT) {
    iv[fi % FRAMES] = t0 - lastT
    cpu[fi % FRAMES] = t1 - t0
    fi++
  }
  lastT = t0
  if (fi > 0 && t1 - shown > 500) {
    shown = t1
    const n = Math.min(fi, FRAMES)
    const ivs = Array.from(iv.subarray(0, n)).sort((x, y) => x - y)
    const med = ivs[n >> 1]
    const p95 = ivs[Math.min(n - 1, Math.floor(0.95 * n))]
    let missed = 0
    for (const v of ivs) if (v > 1.5 * med) missed++
    fpsEl.textContent = `${(1000 / med).toFixed(0)} fps · frame ${med.toFixed(1)} ms (p95 ${p95.toFixed(1)}) · cpu ${q(cpu.subarray(0, n), 0.5).toFixed(1)} ms · ${Math.round((100 * missed) / n)}% missed`
  }
})
addEventListener('resize', () => engine.resize())
if (new URLSearchParams(location.search).get('river') === 'debug') {
  // centre line: light = riffle, dark blue = pool
  const pts: Vector3[] = []
  const cols: Color4[] = []
  const C = RIVER
  for (let i = 0; i < C.n; i += 2) {
    pts.push(new Vector3(C.px[i], C.zw[i] + 0.4, C.pz[i]))
    const r = C.riffle[i]
    cols.push(new Color4(0.15 + 0.85 * r, 0.25 + 0.75 * r, 0.6 + 0.4 * r, 1))
  }
  CreateLines('riverDebug', { points: pts, colors: cols }, scene)
}

// the page contract of tools/golden.mjs, and the names tools/render-check.js and tools/river-check.js read (they were
// written against the prototype's globals; SMW and MASKN are the prototype's names for TILE_W and MASK_N)
Object.assign(window, {
  // zoom: the wanted radius (ZoomHold: read wanted, set(r))
  __proto: { S, scene, camera, zoom: zoomOf(camera), buildPost: () => post.build(), play: D.spec.play },
  B: { Vector3, Matrix, DynamicTexture, VertexBuffer },
  // H is the drawn ground (the heightfield); baseH and RIVER.axisX are the authoring
  // formulas the river check compares with
  scene,
  engine,
  camera,
  apron: terrain.apron,
  __waterTexMs: waterTexMs,
  RIVER: { ...RIVER, axisX },
  H: groundAt,
  baseH,
  riverQuery,
  lerpA,
  wetEdges,
  wetEdgeAt,
  bankReachAt,
  atCutBank,
  BAND: D.band,
  PLAY: D.spec.play,
  SMW: D.spec.tile,
  TSUB: D.spec.tileSub,
  MASKN: D.spec.sizes.riverMask,
  SM_FADE_M: D.spec.shadowFade,
  SPEC: D.spec,
  GROUND: worldGround,
  tileGround: terrain.tileGround,
  farGround: terrain.farGround,
  farTerrainMat: terrain.farTerrainMat,
  riverMask: terrain.riverMask,
  riverMaskCanvas: terrain.riverMaskCanvas,
  groups: nature.groups,
  FAR: nature.far,
  STONES: nature.stones,
  KEEP_CLEAR: nature.KEEP_CLEAR,
  touchesZone: nature.touchesZone,
  placeable: nature.placeable,
  footprint: nature.footprint,
  lightCam: bakes.lightCam,
  shadowRT: bakes.shadowRT,
  __macro: { bake: macroBake, macro },
  __buildMs: performance.now() - T0,
})
// the look checks' hooks (tools/guard.mjs, tools/detail-check.mjs): test objects, the materials, the meshes by pass,
// and the detail layer's switches
const lab = new Lab(scene, mats)
const passes = {
  terrain: [terrain.tileGround, terrain.farGround, terrain.apron],
  scatter: scene.meshes.filter(
    (m): m is Mesh => m instanceof Mesh && (m.thinInstanceCount > 0 || m.forcedInstanceCount > 0),
  ),
  water: [water.mesh],
  post: () => post.passes,
}
const terrainMats = [...terrain.tileMats, terrain.farTerrainMat, terrain.hillMat]
const waterMats = [water.waterMat, water.groundMat]
// the terrain's variants (src/look/shaders/painter.glsl): the L0 grain, the debug view, the checks' sabotages
const DETAIL_DEFINES = [
  'DETAIL_L0',
  'DETAIL_DEBUG',
  'DETAIL_DEBUG_INC',
  'DETAIL_DEBUG_N',
  'DETAIL_SAB_IMPLICIT',
  'DETAIL_SAB_STEP',
  'BANKN_OFF',
]
// the water's materials take the two that change the shore band (it paints with the terrain's paint() and normals).
// On WebGL1 the L0 grain stays on whatever is asked (the detail layer needs GLSL ES 3.00: src/look/materials.ts)
const setDetail = (on: string[]) => {
  for (const d of on) if (!DETAIL_DEFINES.includes(d)) throw new Error(`unknown detail define ${d}`)
  const set = (d: string) => on.includes(d) || (d === 'DETAIL_L0' && mats.webgl1)
  for (const m of terrainMats) for (const d of DETAIL_DEFINES) m.setDefine(`#define ${d}`, set(d))
  for (const m of waterMats) for (const d of ['DETAIL_L0', 'BANKN_OFF']) m.setDefine(`#define ${d}`, set(d))
}
// the camera's projection, then in clip space x' = k·x + tx·w, y' = k·y + ty·w (k 1, no offset: the camera's own)
const project = (k: number, tx: number, ty: number) => {
  camera.unfreezeProjectionMatrix()
  if (k !== 1 || tx || ty) {
    camera.freezeProjectionMatrix(
      camera.getProjectionMatrix(true).multiply(Matrix.FromValues(k, 0, 0, 0, 0, k, 0, 0, 0, 0, 1, 0, tx, ty, 0, 1)),
    )
  }
}
// the water data's debug views on the tile's terrain and the water (src/look/shaders/waterdata.glsl): 0 off, 1 depth,
// 2 shore distance, 3 flow, 4 and 5 the raw texels, 6 the surface (the water white); sab: the page check's sabotage
// (the texture read upside down)
const WATER_VIEWS = ['off', 'depth', 'sdf', 'flow', 'raw', 'alpha', 'surface']
const dataMats = [...terrain.tileMats, ...waterMats]
const waterView = (v: number, sab = false) => {
  if (!WATER_VIEWS[v]) throw new Error(`unknown water view ${v}`)
  for (const m of dataMats) {
    m.setDefine('#define WATER_DEBUG', v > 0)
    m.setDefine('#define WATER_SAB_FLIP', sab)
    m.setFloat('uWaterView', v)
  }
}
// the water surface's checks (tools/water-look-check.mjs): their sabotages (src/look/shaders/water.frag, terrain.frag),
// and the tile's ground drawn with the water's shader (the seam check)
const WATER_SABS = [
  'WATER_SAB_OWN',
  'WATER_SAB_TERRAIN',
  'WATER_SAB_FLAT',
  'WATER_SAB_STEP',
  'WATER_SAB_BANKS',
  'WATER_SAB_NOFOAM',
  'WATER_SAB_EVENICE',
  'WATER_SAB_NOLEAVES',
  'WATER_SAB_LEAFALL',
]
const waterSab = (on: string[]) => {
  for (const d of on) if (!WATER_SABS.includes(d)) throw new Error(`unknown water sabotage ${d}`)
  for (const m of dataMats) for (const d of WATER_SABS) m.setDefine(`#define ${d}`, on.includes(d))
}
// (the roads' swap then picks the zoom's)
const groundAs = (kind: 'terrain' | 'water') => {
  terrain.tileGround.material = kind === 'water' ? water.groundMat : terrain.terrainMat
}
// the water data at a point, read bilinearly as the GPU reads it (the band check measures
// the drawn surfaces against it)
let waterBytes: Uint8Array | null = null
const waterAt = (x: number, z: number) => {
  waterBytes ??= unpackSpans(look.water, WATER_FILL)
  const g = look.water
  return decodeWater(...sampleRGBA(waterBytes, g.n, g.cell, g.x0, g.z0, x, z))
}
const paintGrain = mats.grain
const paintMean = mats.grainMean
let smooth: { tex: DynamicTexture; mean: [number, number]; maxStep: number } | null = null
const hidden: Mesh[] = []
Object.assign(window, {
  __look: {
    splitShare: () => groundShare, // the tile's triangles paved, by the roads, neither (terrain.ts, splitGround)
    // the buildings' light bake: its atlas and raw bake (the checks), its time once baked (on the bench), its bakes so
    // far, its memory
    bldLight: bldLight
      ? { atlas: bldLight.atlas, raw: bldLight.raw, ms: bldLight.ms, baked: bldLight.baked, bytes: bldLight.bytes }
      : null,
    lab,
    mats,
    passes,
    post,
    setDetail,
    dof: DOF, // the depth of field's constants, read every frame: tuned live from the console
    dofPaint: DOF_PAINT, // the blur's painted look (the same)
    dofNear: DOF_NEAR, // the near blur's (docs/plans/done/dof-v2.md), the same
    // the sky's occlusion's time on load and range, null with ?soft=off (docs/plans/done/soft-shadows.md)
    sky: bakes.sky,
    meadowBakeMs: meadow?.bakeMs ?? null,
    // (the combed meadow's flow textures, on load)
    flowBuildMs: flowTex?.ms ?? null,
    meadow: meadow
      ? {
          reach: meadow.reach,
          growingCells: meadow.growingCells,
          growthAt: meadow.growthAt,
          groundAt: meadow.groundAt,
          cropAt: meadow.cropAt,
          croppingCells: meadow.croppingCells,
        }
      : null,
    hill: (x: number, z: number) => lab.addHill(x, z, terrain.hillMat),
    // the bounce map (LC5): its target, and the time of one bake: the median of n frames with it and of n without,
    // each waited on by reading the map back (ms; gl.finish does not wait under ANGLE's Metal)
    groundBounce: bakes.groundBounce,
    // the trunks' baked shadows (their check)
    trunks: nature.trunks,
    lightMap: bakes.lightMap,
    gbBakeMs: async (n = 11) => {
      const t: Record<'bake' | 'none', number[]> = { bake: [], none: [] }
      const gb = bakes.groundBounce
      for (let i = 0; i < n; i++) {
        for (const k of ['bake', 'none'] as const) {
          await gb.readPixels()
          const t0 = performance.now()
          if (k === 'bake') gb.resetRefreshCounter()
          scene.render()
          await gb.readPixels()
          t[k].push(performance.now() - t0)
        }
      }
      const med = (a: number[]) => a.sort((x, y) => x - y)[a.length >> 1]
      return { bake: med(t.bake), none: med(t.none) }
    },
    // the grain the terrain reads: the paint grain, or the seam check's smooth one (returns its steepest texel step)
    grain: (kind: 'paint' | 'smooth') => {
      const old = mats.grain
      if (kind === 'paint') mats.setGrain(paintGrain, paintMean)
      else {
        if (!smooth) {
          const s = makeSmoothGrainCanvas()
          smooth = { tex: grainTexture(scene, s.canvas), mean: grainMean(s.canvas), maxStep: s.maxStep }
          keptGrains.add(smooth.tex)
        }
        mats.setGrain(smooth.tex, smooth.mean)
      }
      if (old !== mats.grain && !keptGrains.has(old)) old.dispose() // a dropped grain
      return kind === 'smooth' ? smooth!.maxStep : null
    },

    // the terrain alone (and the lab's hill), or everything; the finishing passes on or off (off: the frame is the
    // terrain's own output, as the debug view needs)
    terrainOnly: (on: boolean) => {
      meadow?.underOn(!on) // the ground alone: without the dark under-layer of the meadow it hides
      if (on) {
        for (const m of scene.meshes) {
          if (
            m instanceof Mesh &&
            m.isEnabled() &&
            !terrainMats.includes(m.material as never) &&
            m !== terrain.tileGround
          ) {
            m.setEnabled(false)
            hidden.push(m)
          }
        }
      } else {
        for (const m of hidden) m.setEnabled(true)
        hidden.length = 0
      }
    },
    finishing: (on: boolean) => (on ? post.build() : post.clear()),
    // one quarter of the frame (column i, row j from the top) drawn over the whole frame: four of them make a frame at
    // twice the resolution (the seam check's magnification); null puts the camera's own projection back
    quarter: (i: number | null, j = 0) =>
      i === null ? project(1, 0, 0) : project(2, i === 0 ? 1 : -1, j === 0 ? -1 : 1),
    // the image moved by (dx, dy) pixels (right, down) with nothing else changed: the shimmer check's sub-pixel shift
    shift: (dx: number, dy: number) =>
      project(1, (2 * dx) / engine.getRenderWidth(), (-2 * dy) / engine.getRenderHeight()),
    waterView,
    waterSab,
    groundAs,
    waterAt,
    // the macro colour (docs/plans/active/l5-macro.md): the arm, the checks' variants (rebaked), the bakes' hashes, a
    // rebake, and the last rebake no one awaited (a new grain's), settled
    macro: {
      setArm: (a: MacroArm) => macro.setArm(a),
      setCheck: (on: string[]) => macro.setCheck(on),
      hash: (w: 'tile' | 'far') => macro.hash(w),
      bake: () => macro.bake(),
      settled: () => macro.settled(),
    },
  },
})

// ?season=<0..3>: open in that season (0 summer, 1 early autumn, 2 late autumn, 3 winter; the bench runs in it too)
if (params.has('season')) {
  const v = season0
  input('season').value = String(v)
  input('season').dispatchEvent(new Event('input'))
}
// ?detail=l0: the terrain with the L0 grain (compare by eye; the goldens of main against it match)
if (params.get('detail') === 'l0') setDetail(['DETAIL_L0'])
else if (params.has('detail')) throw new Error(`?detail must be l0, not ${params.get('detail')}`)
// ?water=depth|sdf|flow: the water data's debug views
if (params.has('water')) {
  const v = WATER_VIEWS.indexOf(params.get('water') ?? '')
  if (v < 1 || v > 3) throw new Error(`?water must be depth, sdf or flow, not ${params.get('water')}`)
  waterView(v)
}
// ?macroBench=<side>: the macro bake's full-size run (side² texels at SPEC.macro.texel), its time and memory in
// window.__macroBench
if (params.has('macroBench')) {
  void macro.bakeBench(Number(params.get('macroBench'))).then(
    r => {
      Object.assign(window, { __macroBench: r })
      console.log('macro bench', r)
    },
    (e: unknown) => {
      Object.assign(window, { __macroBench: { error: String(e) } })
      console.error('macro bench failed:', e)
    },
  )
}
// ?bench (docs/plans/active/l2-detail.md): fixed cameras, the result shown with a link to save it, and in
// window.__bench for tools/bench-look.mjs
if (params.has('benchat') && !params.has('bench')) throw new Error('?benchat needs ?bench')
if (params.has('bench')) {
  camera.detachControl()
  const hold = Number(params.get('hold') ?? 3)
  if (!(hold > 0)) throw new Error(`?hold must be a positive number of seconds, not ${params.get('hold')}`)
  // the arms: the detail layer, and the L0 grain it replaces (the cost gate: at most +1 ms GPU for the terrain)
  // ?bench=macro: the macro colour's arms whose shaders differ instead (with the detail layer)
  // ?bench=earth: the bare earth's surface up close off and on (earthOn, docs/plans/done/bare-earth.md)
  // ?bench=dof: the gameplay depth of field off and on (decision 0024)
  // (each material set as it stands, no binder left behind, once the texture's load has set 1: else a late load would
  // turn the off arm on)
  const earthArm = (on: number) => async () => {
    await macro.earthLoaded
    for (const m of mats.all) m.setFloat('uEarthOn', on)
  }
  const dofArm = (on: number) => () => {
    setDetail([])
    if (S.dof !== on) {
      S.dof = on
      post.build()
      syncButtons()
    }
  }
  // ?trees=cards&bench=trees: the crowns' two arms, cards and the pack's (docs/plans/done/l7a-canopy-cards.md),
  // for the frame's cost only (read the frame interval): the shadow map is baked once, with the cards, so the pack arm
  // keeps the cards' shadows
  // ?bench=meadow: the meadow's grass and crops against none (the ground's pattern is in
  // the macro bake: nothing a frame)
  if (params.get('bench') === 'meadow' && !meadow) throw new Error('?bench=meadow needs the meadow on (no ?meadow=off)')
  // ?trees=cards&bench=volume: the crowns lit as volumes against L7a's light (docs/plans/done/l7b-crown-volume.md)
  if ((params.get('bench') === 'trees' || params.get('bench') === 'volume') && !nature.showCards) {
    throw new Error(`?bench=${params.get('bench')} needs the leaf-card crowns`)
  }
  // ?bench=trees compares the pack's crowns as cards against the pack's trees (L7a): under gen the other arm would be
  // the generated meshes, so it asks for ?trees=cards explicitly
  if (params.get('bench') === 'trees' && treeSet.has('gen')) {
    throw new Error('?bench=trees compares the pack as cards and as meshes: add ?trees=cards')
  }
  if (params.get('bench') === 'volume' && params.has('volume')) {
    throw new Error('?bench=volume switches the volume itself: drop ?volume')
  }
  const show = nature.showCards
  const cardMats = [...new Set((nature.cardCasters?.cards ?? []).map(m => m.material as ShaderMaterial))]
  const volume = (on: boolean) => {
    for (const m of cardMats) {
      m.setDefine('#define VOLUME', on)
      m.setDefine('#define SOFT_RAMP', on)
    }
  }
  // ?grass=flow&bench=grass: the combed meadow on and off in one page (GRASS_FLOW on every painted material and the
  // clumps), so its cost is a paired difference (docs/plans/done/dof-v2.md: two page loads differ by up to 0.9 ms)
  // ?grass=flow&bench=grassparts: the same, one part off at a time (the ablation's switches, GRASS_NO_*; a part
  // ?grassoff turns off stays off). The arms switch the materials only: the macro tile keeps its combed bake and the
  // near bake runs in every arm, so 'none' measures the materials' share of the combed meadow, not all of it
  const grassArm =
    (on: boolean, off: string[] = []) =>
    () => {
      for (const m of mats.all) {
        m.setDefine('#define GRASS_FLOW', on)
        for (const k of ['STROKES', 'HUE', 'DENSE', 'BIG', 'LEAN']) {
          m.setDefine(`#define GRASS_NO_${k}`, off.includes(k) || grassOff.includes(k.toLowerCase()))
        }
      }
    }
  const arms =
    params.get('bench') === 'grass' && grassMode === 'flow'
      ? [
          { name: 'flow', apply: grassArm(true) },
          { name: 'none', apply: grassArm(false) },
        ]
      : params.get('bench') === 'grassparts' && grassMode === 'flow'
        ? [
            { name: 'flow', apply: grassArm(true) },
            { name: 'nostrokes', apply: grassArm(true, ['STROKES']) },
            { name: 'nolean', apply: grassArm(true, ['LEAN']) },
            { name: 'noclose', apply: grassArm(true, ['DENSE', 'BIG']) },
            { name: 'nohue', apply: grassArm(true, ['HUE']) },
            { name: 'alloff', apply: grassArm(true, ['STROKES', 'HUE', 'DENSE', 'BIG', 'LEAN']) },
            { name: 'none', apply: grassArm(false) },
          ]
        : params.get('bench') === 'meadow' && meadow
          ? [
              { name: 'meadow', apply: () => meadow.setOn(true) },
              { name: 'none', apply: () => meadow.setOn(false) },
            ]
          : params.get('bench') === 'volume'
            ? [
                { name: 'volume', apply: () => volume(true) },
                { name: 'l7a', apply: () => volume(false) },
              ]
            : params.get('bench') === 'trees' && show
              ? [
                  { name: 'cards', apply: () => show(true) },
                  { name: 'pack', apply: () => show(false) },
                ]
              : params.get('bench') === 'macro'
                ? SHADER_ARMS.map(a => ({
                    name: a,
                    apply: () => {
                      setDetail([])
                      return macro.setArm(a)
                    },
                  }))
                : params.get('bench') === 'earth'
                  ? [
                      { name: 'earth', apply: earthArm(1) },
                      { name: 'noearth', apply: earthArm(0) },
                    ]
                  : params.get('bench') === 'dof'
                    ? [
                        { name: 'nodof', apply: dofArm(0) },
                        { name: 'dof', apply: dofArm(1) },
                      ]
                    : [
                        { name: 'l2', apply: () => setDetail([]) },
                        { name: 'l0', apply: () => setDetail(['DETAIL_L0']) },
                      ]
  // ?benchat=<x>,<z>: the cameras orbit that point instead of the start (the forest bench:
  // docs/plans/done/forest-bench.md) inside the play area: the camera's focus is clamped to it every frame
  // (src/look/post.ts)
  const at = params
    .get('benchat')
    ?.split(',')
    .map(p => (p.trim() === '' ? NaN : Number(p)))
  if (at && (at.length !== 2 || !at.every(v => Number.isFinite(v) && Math.abs(v) <= D.spec.play))) {
    throw new Error(`?benchat must be <x>,<z> in metres within ±${D.spec.play}, not ${params.get('benchat')}`)
  }
  // with ?armies and no ?benchat, between the two sides' battalions facing each other (armies.ts, facing), clamped to
  // the play area: the bench's cameras on the fight
  const mid = armiesFocus
  const clampPlay = (v: number) => Math.max(-D.spec.play, Math.min(D.spec.play, v))
  const focus = at ? { x: at[0], z: at[1] } : mid ? { x: clampPlay(mid[0]), z: clampPlay(mid[1]) } : undefined
  void runBench(scene, camera, passes, arms, hold, focus).then(
    r => {
      Object.assign(window, { __bench: r })
      showBench(r)
    },
    (e: unknown) => {
      Object.assign(window, { __bench: { error: String(e) } })
      console.error('bench failed:', e)
    },
  )
}
