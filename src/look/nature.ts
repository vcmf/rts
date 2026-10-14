// Nature (prototypes/painted-cinematic.html): per-role painting, soft crown normals, painted silhouettes, and the
// scatter, whose composition follows the north star (docs/art-bible.md §11). Role ids (tools/obj-to-js.mjs):
// 0 foliage 1 dark foliage 2 wood 3 rock 4 birch bark 5 bark mark 6 warm flower 7 white flower 8 wheat 9 berry.
// The pack's colours are never used: each material maps to a role and our palette paints it.
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js'
import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js'
import { Color3 } from '@babylonjs/core/Maths/math.color.js'
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js'
import { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js'
import '@babylonjs/core/Meshes/thinInstanceMesh.js'
// the instancing includes nature.vert and depth.vert use: the CDN build registers every include, the modules only what is imported
import '@babylonjs/core/Shaders/ShadersInclude/instancesDeclaration.js'
import '@babylonjs/core/Shaders/ShadersInclude/instancesVertex.js'
import type { Scene } from '@babylonjs/core/scene.js'
import type { Materials } from './materials.ts'
import { D } from './spec.ts'
import { fbm, hash, mulberry } from './noise.ts'
import { H } from './heightfield.ts'
import { RIVER, atCutBank, bankReachAt, lerpA, riverQuery, wetEdgeAt, wetEdges } from './river.ts'
import { COVER, coverAt, fieldAt, inFormationZone, type CoverGrid } from './world/cover.ts'
import NAT_VS from './shaders/nature.vert?raw'
import NAT_FS from './shaders/nature.frag?raw'
import { cardMaterial, cardMesh, leafLoss, placeCards, type CardOptions } from './canopy.ts'
import { CLUMP_REACH, WHEAT_HEIGHT_MAX } from './meadow-spec.ts'
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture.js'

// a generated tree (prototypes/tree-core.js) adds: per crown vertex its clump, the clumps' ellipsoids (centre,
// [horizontal, vertical] radii), its twigs as their own mesh, and whether it loses its leaves
export interface NatureModel { pos: number[]; idx: number[]; role: number[]; min: number[]; max: number[]; clump?: number[]; clumps?: { c: number[]; r: number[] }[]; twigs?: { pos: number[]; idx: number[]; role: number[] }; deciduous?: boolean }
// the tree generator (prototypes/tree-core.js): a species and a seed to a pack-shaped model, divided by unit
interface TreeGen { natureModel(key: string, seed: number, unit: number): NatureModel }
declare global { interface Window { NATURE?: Record<string, NatureModel>; TREEGEN?: TreeGen } }

export type Item = [x: number, z: number, scale: number, yaw: number, tint: number, dy?: number]

export interface Nature {
  groups: Record<string, Item[]>; far: Item[]
  // crown and blob footprints for the light map's occlusion: x, z, r, strength, a tree's (its contact core); and the
  // sphere the sky's occlusion sees (docs/plans/done/soft-shadows.md): its centre's height above the ground, its
  // radius, its opacity
  canopy: [number, number, number, number, boolean, number, number, number][]
  KEEP_CLEAR(x: number, z: number): boolean
  touchesZone(x: number, z: number, r: number): boolean
  placeable(x: number, z: number, r?: number, kind?: string): boolean
  footprint(model: string, s: number): number
  stones: [number, number, number, number][]   // the stones in the water (W5a): x, z, radius, the flow's direction (rad), for their foam
  showCards?: (on: boolean) => void            // under cards: the crowns as cards, or the pack's (the bench's arms)
  // under gen: the season's twigs (shown from TWIGS_FROM) and the crowns' loss; shadowState names what that makes cast
  // shadows (the twigs on or off, the loss), for the bake to compare with the state it last baked
  setSeason?: (season: number) => void
  shadowState?: () => string
  // under cards: the card meshes, which cast the crowns' shadows, and the pack models they replace, which cast nothing
  // (src/look/bakes.ts; the trunk meshes cast the trunks')
  // lossCards: the card meshes whose crowns thin with the season (their shadow too), at season()
  cardCasters?: { leaf: BaseTexture; cards: Mesh[]; packs: Mesh[]; lossCards: Mesh[]; season: () => number }
  // the meadow's growth (src/look/meadow.ts): by the cover at a 2 m cell's centre, 0..1 and the grass's height factor
  // (pasture shorter); and the placement rule's hard edges at any point (the formation zones, the banks, the water),
  // which the meadow map applies at every texel so that smoothing the cover never carries grass across them
  growth(x: number, z: number): [number, number]
  growthAllowed(x: number, z: number): boolean
  // the crops' growth by the cover (docs/plans/done/l5d-crops.md): 1 where the point and the points EDGE round it
  // are all one sown field (one class, wheat, green crop or stubble, and one field id; ploughed grows nothing), else 0
  crop(x: number, z: number): number
}

// what may grow on each class of the cover (docs/plans/active/l5-macro.md): grass, flowers, plants, bushes, stumps
// and logs on grass (meadow, pasture, a copse's floor); wheat on wheat; stones anywhere but roads, tracks and the
// village; trees and the far hedgerows' bushes too. The roads and the village keep clear of the copses (a rejected
// copse tree would shift the scatter's stream after it: the scatter's counts match main's)
const GRASSY_COVER: readonly number[] = [COVER.meadow, COVER.pasture, COVER.wood], TRODDEN: readonly number[] = [COVER.road, COVER.track, COVER.village]
// The point and eight points EDGE m around it must all pass: the shader paints a class edge pushed up to 1.5 m along
// each axis by the grain (coverWarp, src/look/shaders/macro.glsl), and the bake blends it over ±1 m, so an instance
// nearer an edge could stand on another painted class
const EDGE = 2.5, AROUND = [[0, 0], ...Array.from({ length: 8 }, (_, k) => [Math.cos(k * Math.PI / 4), Math.sin(k * Math.PI / 4)])]
function coverAllows(cover: CoverGrid, model: string, x: number, z: number): boolean {
  const ok = (c: number) => model === 'Wheat' ? c === COVER.wheat : /^(Grass|Flowers|Plant_1|Bush|TreeStump|WoodLog)/.test(model) ? GRASSY_COVER.includes(c) : !TRODDEN.includes(c)
  return AROUND.every(([dx, dz]) => ok(coverAt(cover, x + dx * EDGE, z + dz * EDGE)))
}

// cards: the broadleaf, birch and willow crowns drawn as leaf cards (docs/plans/done/l7a-canopy-cards.md, ?trees=cards);
// meadow: the meadow's grass and wheat replace the tufts and the wheat lattice (docs/plans/done/l5c-meadow.md);
// oneTree: every tree drawn as one broadleaf model, where and as large as it stands (L5b's judging: ?trees=one)
// gen: generated trees where the pack's stand (?trees=gen, docs/plans/active/tree-generator.md): the season the page
// opens in (the sky's occlusion is baked for it), and whether the cards take their clump's volume
export interface GenOptions { season: number; clumpVolume: boolean }
export function buildNature(scene: Scene, mats: Materials, reflAdd: (x: number, z: number, r: number) => void, cover: CoverGrid, cards?: { leaf: BaseTexture; opts: CardOptions }, wood: 'off' | 'small' | 'big' = 'off', meadow = false, oneTree = false, gen: GenOptions | null = null): Nature {
  const NATURE = window.NATURE
  if (!NATURE) throw new Error('the nature pack data is missing: run node tools/obj-to-js.mjs')
  const genModels = gen ? addGenerated(NATURE) : null

  const natMat = (name: string, folA: string, folB: string, { rim = 0.8, grassy = false, kind = grassy ? 2 : 0 }: { rim?: number; grassy?: boolean; kind?: number } = {}): ShaderMaterial => {
    const m = mats.make(name, NAT_VS, NAT_FS, { attributes: ['position', 'normal', 'aRole', 'aCrown', 'aTint'], uniforms: ['uFolA', 'uFolB', 'uRim', 'uKind'], samplers: [], defines: grassy ? ['#define GRASSY'] : [] })
    m.setColor3('uFolA', Color3.FromHexString(folA)); m.setColor3('uFolB', Color3.FromHexString(folB)); m.setFloat('uRim', rim); m.setFloat('uKind', kind); return m
  }
  const treeMat = natMat('trees', '#4a7330', '#97a043', { rim: 0.9 })
  const birchMat = natMat('birch', '#7a9a3c', '#bcae55', { rim: 0.9 })
  const pineMat = natMat('pines', '#2f5a36', '#4f7a3e', { rim: 0.8, kind: 1 })
  const farMat = natMat('far', '#3c6640', '#6b8648', { rim: 0.4 })
  const grassMat = natMat('grass', '#5a7a30', '#a3a346', { rim: 0.5, grassy: true })
  // reeds (W5a): green-brown, straw in autumn (the grass's seasons), on the grass's sway
  const reedMat = natMat('reeds', '#3f4f25', '#7d7a3c', { rim: 0.5, grassy: true })

  const FLIP = true   // OBJ winding is opposite to Babylon's default
  // trunk: only the triangles off the crown (role 2 and up), for the cards arm, whose crowns are cards
  function buildModel(name: string, trunk = false): Mesh {
    const d = NATURE![name], m = new Mesh(trunk ? 'trunks_' + name : name, scene)
    const idx = FLIP ? d.idx.slice().reverse() : d.idx
    const nrm: number[] = []; VertexData.ComputeNormals(d.pos, idx, nrm)
    m.setVerticesData(VertexBuffer.PositionKind, d.pos); m.setIndices(trunk ? idx.filter((_, k) => { const t = k - k % 3; return d.role[idx[t]] >= 2 && d.role[idx[t + 1]] >= 2 && d.role[idx[t + 2]] >= 2 }) : idx)
    m.setVerticesData(VertexBuffer.NormalKind, nrm)
    m.setVerticesData('aRole', new Float32Array(d.role), false, 1)
    let cx = 0, cy = 0, cz = 0, n = 0; for (let i = 0; i < d.role.length; i++) if (d.role[i] <= 1) { cx += d.pos[i * 3]; cy += d.pos[i * 3 + 1]; cz += d.pos[i * 3 + 2]; n++ }
    if (!n) { cx = 0; cy = d.max[1] * 0.6; cz = 0; n = 1 }
    const cr = new Float32Array(d.role.length * 3); for (let i = 0; i < d.role.length; i++) { cr[i * 3] = cx / n; cr[i * 3 + 1] = cy / n; cr[i * 3 + 2] = cz / n }
    m.setVerticesData('aCrown', cr, false, 3)
    return m
  }
  const _m = new Matrix(), _q = new Quaternion(), _s = new Vector3(), _t = new Vector3()
  function place(model: string, material: ShaderMaterial, items: Item[]): { mesh: Mesh; buf: Float32Array; tint: Float32Array } | null {
    if (!items.length) return null
    const m = buildModel(model); m.material = material; m.alwaysSelectAsActiveMesh = true
    const buf = new Float32Array(items.length * 16), tint = new Float32Array(items.length)
    items.forEach(([x, z, s, yaw, t, dy = 0], i) => { _t.set(x, H(x, z) + dy, z); Quaternion.RotationYawPitchRollToRef(yaw, 0, 0, _q); _s.set(s, s, s); Matrix.ComposeToRef(_s, _q, _t, _m); _m.copyToArray(buf, i * 16); tint[i] = t })
    m.thinInstanceSetBuffer('matrix', buf, 16, true); m.thinInstanceSetBuffer('aTint', tint, 1, true)
    return { mesh: m, buf, tint }
  }

  const canopy: Nature['canopy'] = []
  // k: how much crown is left (a generated deciduous tree loses its leaves with the season: its contact and the sky it
  // hides go with them)
  const smTree = (x: number, z: number, crownY: number, cr: number, k = 1) => { canopy.push([x, z, cr * 1.15, 0.42 * k, true, crownY, cr, 0.7 * k]); reflAdd(x, z, cr * 1.1) }
  // (only the cards thin: without them the crowns stay whole, and so does what they hide)
  const crownLeft = (model: string) => NATURE[model]?.deciduous && gen && cards ? 1 - 0.8 * leafLoss(gen.season) : 1, smBlob = (x: number, z: number, r: number) => canopy.push([x, z, r * 1.4, 0.30, false, r * 0.4, r, 0.7])

  /* ---------- scattering: composition follows the north star ---------- */
  const R = mulberry(77), rr = () => R()
  const KEEP_CLEAR = inFormationZone   // formations (src/look/world/cover.ts: the cover keeps them meadow)
  // THE placement rule (docs/art-bible.md §6c): nothing in the water or on the wet bank except stones,
  // nothing in the formation zones. r = the object's footprint/crown radius. Every scatter loop uses it.
  const REACH_OF: Record<string, number> = {}   // largest distance of any vertex from the model pivot in plan: the true footprint under any yaw
  const footprint = (model: string, s: number) => { let r = REACH_OF[model]; if (r === undefined) { const p = NATURE![model].pos; r = 0; for (let i = 0; i < p.length; i += 3) r = Math.max(r, Math.hypot(p[i], p[i + 2])); REACH_OF[model] = r } return r * s }
  // exact: does the disc (x,z,r) overlap any formation zone? (the two boxes and the circle of KEEP_CLEAR)
  const boxD = (x: number, z: number, x0: number, x1: number, z0: number, z1: number) => Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1))
  const touchesZone = (x: number, z: number, r: number) => KEEP_CLEAR(x, z) || boxD(x, z, -25, 15, -44, -2) < r || boxD(x, z, -14, 26, 7, 19) < r || Math.hypot(x - 34, z + 24) < Math.sqrt(160) + r
  // off the banks by r m (W2: a point bar reaches farther): the scatter's rule, and the meadow's growth's
  const offBanks = (q: ReturnType<typeof riverQuery>, r: number) => !q || q.dist >= Math.max(lerpA(RIVER.W, q) / 2 * 1.7, bankReachAt(q)) + r
  function placeable(x: number, z: number, r = 0, kind = ''): boolean {
    if (touchesZone(x, z, r)) return false
    const q = riverQuery(x, z)
    // stones: wholly on dry land, or on riffles; the W5a pass's stones at the foot of a cut bank (docs/art-bible.md §6c)
    if (kind === 'stone') return !q || q.dist >= wetEdgeAt(q) + r || lerpA(RIVER.riffle, q) > 0.6
    if (kind === 'cutstone') return !!q && atCutBank(q) && r <= 1.2   // at a cut bank's foot, reaching at most 1.2 m
    if (kind === 'reed') return !q || q.dist >= wetEdgeAt(q) + r   // reeds: at the water's edge, wholly on land
    return offBanks(q, r)                 // off the banks (W2: a point bar reaches farther)
  }
  // the standing wheat's scale (decision 0026): r in 0..1 to 0.82..1 of the one that reaches WHEAT_HEIGHT_MAX, at
  // every place that sows wheat, so the placement rule tests the size that is drawn; add() caps it once more
  const wheatScaleMax = WHEAT_HEIGHT_MAX / NATURE.Wheat.max[1], wheatScale = (r: number) => wheatScaleMax * (0.82 + 0.18 * r)
  const groups: Record<string, Item[]> = {}
  const add = (model: string, item: Item) => {
    if (model === 'Wheat' && item[2] > wheatScaleMax) { item = [...item] as Item; item[2] = wheatScaleMax }
    ;(groups[model] = groups[model] || []).push(item)
  }
  // add an instance only if its footprint passes the placement rule; the ONLY way scatter adds instances
  // drawn: the model drawn there, when not the one placed (?trees=one)
  // (under gen the model placed decides, as without it, so the scatter's random stream and layout stay the pack
  // arm's; a generated tree, sized to its class's mean, that would reach farther than the rule allows there is drawn
  // smaller, to the placed model's footprint)
  const addPlaced = (model: string, item: Item, kind = '', drawn = model) => {
    const [x, z, s] = item
    if (!placeable(x, z, footprint(model, s), kind) || !coverAllows(cover, model, x, z)) return false
    if (genModels && drawn !== model && !placeable(x, z, footprint(drawn, s), kind)) { item = [...item] as Item; item[2] = s * footprint(model, s) / footprint(drawn, s) }
    add(drawn, item); return true
  }

  // ?trees=one: the model drawn for a tree, placed as its own model (so the scatter is the page's), shadowed and
  // reflected as the model drawn
  const tree = (model: string, x = 0, z = 0) => oneTree ? 'CommonTree_1' : genModels ? genModels.pick(model, x, z) : model
  // a broadleaf or birch tree, and its crown for the occlusion (the crown's centre at 0.62 of the height), drawn as
  // tree(mdl)
  const placeTree = (mdl: string, x: number, z: number, s: number, yaw: number, t: number) => {
    if (!addPlaced(mdl, [x, z, s, yaw, t], '', tree(mdl, x, z))) return false
    const M = NATURE[tree(mdl, x, z)]; smTree(x, z, (M.max[1] * 0.62) * s, (Math.max(M.max[0] - M.min[0], M.max[2] - M.min[2]) * 0.45) * s, crownLeft(tree(mdl, x, z)))
    return true
  }
  const TREE_MODELS = ['CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'CommonTree_4', 'CommonTree_5']
  const clusters = [[-62, -22, 7], [-128, 4, 9], [-74, 58, 6], [42, 56, 8], [82, 32, 6], [-22, 72, 7], [112, -12, 5], [-150, 62, 8], [150, 72, 7], [-42, 122, 10], [62, 112, 8], [18, -80, 6], [-95, -70, 7], [120, -70, 6]]
  for (const [cx, cz, n] of clusters) for (let i = 0; i < n; i++) {
    const x = cx + (rr() - 0.5) * 42, z = cz + (rr() - 0.5) * 32
    const birch = rr() < 0.22, mdl = birch ? 'BirchTree_' + (1 + Math.floor(rr() * 5)) : TREE_MODELS[Math.floor(rr() * 5)], s = 3.4 + rr() * 1.4
    if (!placeTree(mdl, x, z, s, rr() * 6.28, rr())) continue
    if (rr() < 0.5) { const fx = x + (rr() - 0.5) * 6, fz = z + (rr() - 0.5) * 6; addPlaced('Plant_1', [fx, fz, 1.6 + rr(), rr() * 6.28, rr()]) }
  }
  // ?wood: one dense wood, to judge the sky's occlusion (docs/plans/done/soft-shadows.md); ?wood=big: a forest that
  // fills the bench's frame (docs/plans/done/forest-bench.md); each its own random stream, so the rest of the
  // scatter is unchanged
  if (wood !== 'off') {
    const W = mulberry(91), [cx, cz, w, h, n] = wood === 'big' ? [-110, -25, 150, 110, 520] : [-105, -30, 50, 40, 70]
    for (let i = 0; i < n; i++) {
      const x = cx + (W() - 0.5) * w, z = cz + (W() - 0.5) * h, mdl = TREE_MODELS[Math.floor(W() * 5)], s = 3.4 + W() * 1.4
      placeTree(mdl, x, z, s, W() * 6.28, W())
    }
  }
  for (let i = 0, step = 0; i < RIVER.n; i += step) {   // willows follow the river banks
    step = Math.round((7 + rr() * 9) / (RIVER.P.W0 / 4)); const C = RIVER
    if (Math.abs(C.px[i]) > 175 || Math.abs(C.pz[i]) > 175 || rr() < 0.45) continue
    const mdl = 'Willow_' + (1 + Math.floor(rr() * 3)), s = 2.6 + rr() * 0.9, side = rr() < 0.5 ? -1 : 1, off = C.W[i] / 2 * 1.7 + footprint(mdl, s) + 0.3 + rr() * 3; let x = C.px[i] - C.tz[i] * side * off, z = C.pz[i] + C.tx[i] * side * off
    // inside a bend the nearest water is closer than this sample's normal suggests: step outward until the rule accepts
    const yaw = rr() * 6.28, tint = 0.2 + rr() * 0.5; let ok = false
    for (let t = 0; t < 6 && !ok; t++) { const o = off + t * 1.5; x = C.px[i] - C.tz[i] * side * o; z = C.pz[i] + C.tx[i] * side * o; ok = addPlaced(mdl, [x, z, s, yaw, tint], '', tree(mdl, x, z)) }
    if (!ok) continue
    const M = NATURE[tree(mdl, x, z)]; smTree(x, z, M.max[1] * 0.6 * s, (M.max[0] - M.min[0]) * 0.45 * s, crownLeft(tree(mdl, x, z)))
  }
  for (let i = 0; i < 5; i++) { const x = 150 + (rr() - 0.5) * 30, z = -40 + (rr() - 0.5) * 30; const mdl = 'PineTree_' + (1 + Math.floor(rr() * 3)), s = 3.6 + rr(); if (addPlaced(mdl, [x, z, s, rr() * 6.28, rr()], '', tree(mdl, x, z))) { if (oneTree || genModels) { const M = NATURE[tree(mdl, x, z)]; smTree(x, z, M.max[1] * 0.62 * s, Math.max(M.max[0] - M.min[0], M.max[2] - M.min[2]) * 0.45 * s) } else smTree(x, z, 6, 3.5) } }
  // under gen: an orchard, a hedgerow, a row of poplars, a forest, a wood and lone field trees, from their own random
  // stream (the scatter's is unchanged)
  if (genModels) for (const [mdl, x, z, s] of genModels.extras()) if (addPlaced(mdl, [x, z, s, hash(x, z) * 6.28, hash(z, x)])) { const M = NATURE[mdl]; smTree(x, z, M.max[1] * 0.62 * s, Math.max(M.max[0] - M.min[0], M.max[2] - M.min[2]) * 0.45 * s, crownLeft(mdl)) }
  for (let i = 0; i < 90; i++) {   // bushes, a third of them with berries
    const a = rr() * 6.28, r = 14 + rr() * 120, x = Math.cos(a) * r + 8, z = Math.sin(a) * r, s = 1.8 + rr() * 1.4
    if (addPlaced(rr() < 0.33 ? 'BushBerries_' + (1 + Math.floor(rr() * 2)) : 'Bush_' + (1 + Math.floor(rr() * 2)), [x, z, s, rr() * 6.28, rr()])) smBlob(x, z, s * 0.6)
  }
  for (let i = 0; i < 46; i++) {
    const a = rr() * 6.28, r = 10 + rr() * 110, x = Math.cos(a) * r, z = Math.sin(a) * r, s = 1.6 + rr() * 2.4
    if (addPlaced(rr() < 0.7 ? 'Rock_Moss_' + (1 + Math.floor(rr() * 4)) : 'Rock_' + (1 + Math.floor(rr() * 2)), [x, z, s, rr() * 6.28, rr(), -0.15 * s], 'stone')) smBlob(x, z, s * 0.35)
  }
  for (let i = 0; i < 5; i++) { const x = -20 + (rr() - 0.5) * 120, z = 60 + (rr() - 0.5) * 80; addPlaced(i % 2 ? 'TreeStump' : 'WoodLog_Moss', [x, z, 2.2, rr() * 6.28, rr()]) }
  // grass tufts and flowers over the whole near field, densest around the hill
  for (let i = 0; i < 4200; i++) {
    const a = rr() * 6.28, r = 4 + Math.pow(rr(), 0.8) * 175, x = Math.cos(a) * r, z = Math.sin(a) * r * 0.9 + 4
    const flowery = fbm(x * 0.03 + 4, z * 0.03 - 2) > 0.58, k = rr()
    const mdl = flowery && k < 0.5 ? 'Flowers' : k < 0.88 ? 'Grass_Short' : 'Plant_1'
    const item: Item = [x, z, mdl === 'Plant_1' ? 1.3 : mdl === 'Flowers' ? 1.4 : 1.6 + rr() * 0.8, rr() * 6.28, rr()]
    if (!(meadow && mdl === 'Grass_Short')) addPlaced(mdl, item)   // under the meadow (src/look/meadow.ts) its grass replaces these tufts; the stream is unchanged
  }
  // a wheat field on the valley side between the floodplain and the formation zones (docs/art-bible.md §6c: fields above the floodplain)
  const addWheat = (item: Item) => { if (!meadow) addPlaced('Wheat', item) }   // under the meadow its crops replace this lattice (src/look/meadow.ts); the stream is unchanged
  for (let u = 0; u < 30; u += 1.25) for (let v = 0; v < 22; v += 1.3) { const x = -60 + u * 0.95 + v * 0.25 + (rr() - 0.5) * 0.5, z = -34 + v - u * 0.12 + (rr() - 0.5) * 0.5; if (rr() < 0.08) continue; addWheat([x, z, wheatScale(rr()), rr() * 6.28, rr()]) }
  // under the meadow the fields grow from the meadow's slots (src/look/meadow.ts, docs/plans/done/l5d-crops.md):
  // no pack wheat tufts
  // far woods and hedgerows from cheap bush crowns, never in the apron band, whose ground only the apron mesh knows
  const far: Item[] = [], inBand = (x: number, z: number) => { const m = Math.max(Math.abs(x), Math.abs(z)); return m > D.spec.tile / 2 && m < D.band }
  for (let k = -8; k <= 8; k++) for (let t = -560; t <= 560; t += 6) {
    const qx = k * 70 + (hash(k, t) - 0.5) * 2, qy = t, x = 0.8 * qx - 0.6 * qy, z = 0.6 * qx + 0.8 * qy, r = Math.hypot(x, z)
    const fs = 3.6 + hash(k, t * 3) * 2.0; if (r < 190 || r > 640 || hash(k * 7, Math.floor(t / 60)) < 0.35 || !placeable(x, z, footprint('Bush_1', fs))) continue; far.push([x, z, fs, hash(t, k) * 6.28, hash(k, t)])
  }
  for (let w = 0; w < 20; w++) {
    const a = hash(w, 51) * 6.283, r = 230 + hash(w, 52) * 320, cx = Math.cos(a) * r, cz = Math.sin(a) * r
    for (let i = 0; i < 34; i++) { const x = cx + (hash(w, i) - 0.5) * 80, z = cz + (hash(i, w) - 0.5) * 55, fs = 5 + hash(i + w, 9) * 3; if (!placeable(x, z, footprint('Bush_1', fs))) continue; far.push([x, z, fs, hash(i, w * 3) * 6.28, hash(w, i * 2)]) }
  }
  // stones on purpose (W5a, docs/plans/done/w5-banks.md; docs/art-bible.md §6c): in riffles, and at the foot of the
  // sharper cut banks, sized to stand 0.35–0.7 m out of the water there, so the water makes foam around them. Their own
  // seeded stream, so the rest of the scatter keeps its places
  // a stone's radius for its foam: the mean of its plan's half-extents (the pillow hugs it on average)
  const meanRadius = (mdl: string, s: number) => { const M = NATURE![mdl]; return (M.max[0] - M.min[0] + M.max[2] - M.min[2]) / 4 * s }
  const stones: Nature['stones'] = [], RS = mulberry(91), rs = () => RS()
  for (let i = 0, step = 0, C = RIVER; i < C.n && stones.length < D.spec.water.stones; i += step) {
    step = Math.max(1, Math.round((8 + rs() * 14) / (RIVER.P.W0 / 4)))
    if (Math.abs(C.px[i]) > 200 || Math.abs(C.pz[i]) > 200) continue
    const hw = C.W[i] / 2, A = C.A[i], [ep, en] = wetEdges(hw, A)
    let n: number, kind: string
    if (C.riffle[i] > 0.62) { n = (rs() - 0.5) * 0.9 * hw; kind = 'stone' }                          // mid-channel in a riffle
    else if (Math.abs(A) > 0.55) { n = A >= 0 ? ep - 0.25 : -(en - 0.25); kind = 'cutstone' }      // against the cut bank
    else continue
    const x = C.px[i] - C.tz[i] * n, z = C.pz[i] + C.tx[i] * n, mdl = rs() < 0.5 ? 'Rock_' + (1 + Math.floor(rs() * 2)) : 'Rock_Moss_' + (3 + Math.floor(rs() * 2))
    const top = C.zw[i] - H(x, z) + 0.35 + rs() * 0.35, s = Math.max(1, top / (NATURE![mdl].max[1] * 0.95))
    if (s > 3) continue   // too deep there for the pack's rocks to stand out of the water
    if (addPlaced(mdl, [x, z, s, rs() * 6.28, rs(), -0.05 * s], kind)) { stones.push([x, z, meanRadius(mdl, s), Math.atan2(C.tz[i], C.tx[i])]); smBlob(x, z, s * 0.3) }
  }
  // the scatter's own stones that stand in the water (on riffles) have foam too
  for (const [mdl, items] of Object.entries(groups)) if (/^Rock/.test(mdl)) for (const [x, z, s] of items) {
    const q = riverQuery(x, z)
    if (q && q.dist < wetEdgeAt(q) && stones.length < D.spec.water.stones && !stones.some(st => st[0] === x && st[1] === z)) stones.push([x, z, meanRadius(mdl, s), Math.atan2(RIVER.tz[q.i], RIVER.tx[q.i])])
  }
  // reeds at the water's edge on slow inner bends (W5a; docs/art-bible.md §6c): clumps of the pack's grass blade,
  // narrowed and set tall (the Reed model), on the bar's side of bends sharper than |A| 0.4, out of the riffles
  if (!NATURE!.Reed) { const g = NATURE!.Grass; NATURE!.Reed = { ...g, pos: g.pos.map((v, i) => i % 3 === 1 ? v : v * 0.8), min: [g.min[0] * 0.8, g.min[1], g.min[2] * 0.8], max: [g.max[0] * 0.8, g.max[1], g.max[2] * 0.8] } }
  const RR = mulberry(92), rq = () => RR()
  for (let i = 0, step = 0, C = RIVER; i < C.n; i += step) {
    step = Math.max(1, Math.round((5 + rq() * 12) / (RIVER.P.W0 / 4)))
    if (Math.abs(C.px[i]) > 200 || Math.abs(C.pz[i]) > 200 || Math.abs(C.A[i]) < 0.4 || C.riffle[i] > 0.4 || rq() < 0.35) continue
    const hw = C.W[i] / 2, A = C.A[i], side = A >= 0 ? -1 : 1, edge = wetEdges(hw, A)[A >= 0 ? 1 : 0]
    for (let b = 0, nb = 8 + Math.floor(rq() * 7); b < nb; b++) {
      const n = side * (edge + 0.15 + rq() * 0.7), along = (rq() - 0.5) * 1.4, x = C.px[i] - C.tz[i] * n + C.tx[i] * along, z = C.pz[i] + C.tx[i] * n + C.tz[i] * along
      addPlaced('Reed', [x, z, 1.5 + rq() * 0.8, rq() * 6.28, rq()], 'reed')
    }
  }
  // under cards, a carded model is drawn as its trunk triangles (the trunks_ mesh) and its cards, which take the
  // crowns' palette; both cast into the sun's shadow pass (src/look/bakes.ts), the whole pack model is disabled
  const carded = (k: string) => !!cards && /^(CommonTree|BirchTree|Willow|Gen)_/.test(k)
  const treeCards = cards && cardMaterial(mats, 'treeCards', '#4a7330', '#97a043', 0.45, cards.leaf, cards.opts.volume), birchCards = cards && cardMaterial(mats, 'birchCards', '#7a9a3c', '#bcae55', 0.45, cards.leaf, cards.opts.volume)
  // generated conifers are carded too, in the pines' palette and kind (they stay green)
  const pineCards = cards && genModels && cardMaterial(mats, 'pineCards', '#2f5a36', '#4f7a3e', 0.4, cards.leaf, cards.opts.volume)
  if (pineCards) pineCards.setFloat('uKind', 1)
  // generated deciduous crowns thin with the season (src/look/shaders/cards.glsl)
  const lossTreeCards = cards && genModels && cardMaterial(mats, 'treeCardsLoss', '#4a7330', '#97a043', 0.45, cards.leaf, cards.opts.volume, true)
  const lossBirchCards = cards && genModels && cardMaterial(mats, 'birchCardsLoss', '#7a9a3c', '#bcae55', 0.45, cards.leaf, cards.opts.volume, true)
  let season = gen?.season ?? 0
  const twigMeshes: Mesh[] = [], lossCards: Mesh[] = []
  let seed = 1
  const swaps: ((on: boolean) => void)[] = [], cardMeshes: Mesh[] = [], packs: Mesh[] = []
  for (const [k, items] of Object.entries(groups)) {
    const birch = /Birch|^Gen_birch/.test(k), conifer = /Pine|^Gen_(pine|spruce)/.test(k)
    const material = k === 'Reed' ? reedMat : /Grass|Flowers|Plant_1|Wheat/.test(k) ? grassMat : birch ? birchMat : conifer ? pineMat : treeMat
    const placed = place(k, material, items)
    if (placed && cards && carded(k)) {
      const trunks = buildModel(k, true), cm = cardMesh(scene, 'cards_' + k, NATURE[k], genModels?.cardOpts(k, cards.opts) ?? cards.opts, seed++, !!gen?.clumpVolume), pack = placed.mesh
      trunks.material = material; trunks.alwaysSelectAsActiveMesh = true
      trunks.thinInstanceSetBuffer('matrix', placed.buf, 16, true); trunks.thinInstanceSetBuffer('aTint', placed.tint, 1, true)
      const loses = !!NATURE[k].deciduous && !!lossTreeCards
      placeCards(cm, (conifer && pineCards ? pineCards : loses ? (birch ? lossBirchCards : lossTreeCards) : birch ? birchCards : treeCards) as ShaderMaterial, placed.buf, placed.tint)
      if (loses) lossCards.push(cm)
      // the twigs, as their own model beside it (drawn from TWIGS_FROM on: the bare crowns of late autumn and winter)
      const tw = NATURE[k].twigs
      if (tw && tw.idx.length && loses) {   // conifers keep their crowns: no twigs to show
        const tk = k + '~twigs'; NATURE[tk] = { ...tw, min: NATURE[k].min, max: NATURE[k].max }
        const tm = buildModel(tk); tm.material = material; tm.alwaysSelectAsActiveMesh = true
        tm.thinInstanceSetBuffer('matrix', placed.buf, 16, true); tm.thinInstanceSetBuffer('aTint', placed.tint, 1, true)
        twigMeshes.push(tm)
      }
      const show = (on: boolean) => { cm.setEnabled(on); trunks.setEnabled(on); pack.setEnabled(!on) }
      show(true); swaps.push(show); cardMeshes.push(cm); packs.push(pack)
    }
  }
  // the twigs: drawn with the cards (the bench's pack arm shows the whole pack model instead), from TWIGS_FROM on
  let cardsShown = true
  const twigsOn = () => cardsShown && season >= TWIGS_FROM, showTwigs = () => { for (const m of twigMeshes) m.setEnabled(twigsOn()) }
  showTwigs()
  const showCards = cards ? (on: boolean) => { for (const f of swaps) f(on); cardsShown = on; showTwigs() } : undefined
  const seasonal = twigMeshes.length > 0 || lossCards.length > 0
  const setSeason = seasonal ? (s: number) => { season = s; showTwigs() } : undefined
  const shadowState = seasonal ? () => `${twigsOn()} ${leafLoss(season)}` : undefined
  // the band is left out after the every-fourth choice, so every other bush stays the one the prototype drew
  // and none on the roads or the village ground (after the every-fourth choice, so the others stay main's)
  const drawn = ([x, z]: Item) => !inBand(x, z) && !TRODDEN.includes(coverAt(cover, x, z))
  place('Bush_1', farMat, far.filter((b, i) => i % 4 === 0 && drawn(b))); place('Bush_2', farMat, far.filter((b, i) => i % 4 === 2 && drawn(b)))
  // the meadow's growth: where the old tufts could stand (the placement rule: the cover's grassy classes and their
  // edges, off the banks and the water, out of the formation zones); pasture grazed shorter
  const growth = (x: number, z: number): [number, number] => coverAllows(cover, 'Grass_Short', x, z) ? [1, coverAt(cover, x, z) === COVER.pasture ? 0.65 : 1] : [0, 0]
  // the crops' growth: a sown class (ploughed grows nothing) and the same field EDGE round it, so a crop never stands
  // on another painted field, nor runs across two (the shader reads the class and the field's shade at its root)
  const SOWN: readonly number[] = [COVER.wheat, COVER.green, COVER.stubble]
  const crop = (x: number, z: number) => {
    const c = coverAt(cover, x, z), f = fieldAt(cover, x, z)
    return SOWN.includes(c) && AROUND.every(([dx, dz]) => coverAt(cover, x + dx * EDGE, z + dz * EDGE) === c && fieldAt(cover, x + dx * EDGE, z + dz * EDGE) === f) ? 1 : 0
  }
  // a root keeps the widest clump's reach from them (src/look/meadow.ts, CLUMP_REACH: the outer ring's footprint and lean)
  const growthAllowed = (x: number, z: number) => !touchesZone(x, z, CLUMP_REACH) && offBanks(riverQuery(x, z), CLUMP_REACH)
  return { groups, far, canopy, KEEP_CLEAR, touchesZone, placeable, footprint, stones, showCards, setSeason, shadowState, cardCasters: cards ? { leaf: cards.leaf, cards: cardMeshes, packs, lossCards, season: () => season } : undefined, growth, growthAllowed, crop }
}

// ?trees=gen (docs/plans/active/tree-generator.md): VARIANTS seeded models per species from prototypes/tree-core.js,
// added to the pack as Gen_<species>_<n>. Each pack class's trees are drawn as its species (a share each, picked by the
// place, so the scatter's random stream is unchanged), every model sized so its reach in plan is its class's mean: the
// page's composition and its placement rule stay as they are.
const GEN_VARIANTS = 4
const TWIGS_FROM = 1.4   // the season the twigs show from: just before the crowns start to thin (LEAF_LOSS.from)
const GEN_FOR: Record<string, [species: string, share: number][]> = {
  // (no copper beech: the palette's tint already turns about 5% of crowns copper, docs/art-bible.md §4b)
  CommonTree: [['oak', 0.5], ['lime', 0.25], ['beech', 0.25]],
  BirchTree: [['birch', 1]],
  Willow: [['willow', 0.65], ['alder', 0.35]],
  PineTree: [['pine', 0.4], ['spruce', 0.6]],
}
function addGenerated(NATURE: Record<string, NatureModel>) {
  const G = window.TREEGEN
  if (!G) throw new Error('?trees=gen needs prototypes/tree-core.js')
  // the model divided by unit (the generator's output is linear in it: one growth, not two)
  const scaled = (m: NatureModel, unit: number): NatureModel => ({ ...m, pos: m.pos.map(v => v / unit), min: m.min.map(v => v / unit), max: m.max.map(v => v / unit),
    clumps: m.clumps?.map(q => ({ c: q.c.map(v => v / unit), r: q.r.map(v => v / unit) })), twigs: m.twigs && { ...m.twigs, pos: m.twigs.pos.map(v => v / unit) } })
  const reach = (m: NatureModel) => { let r = 0; for (let i = 0; i < m.pos.length; i += 3) r = Math.max(r, Math.hypot(m.pos[i], m.pos[i + 2])); return r }
  for (const [cls, species] of Object.entries(GEN_FOR)) {
    const packs = Object.keys(NATURE).filter(k => k.startsWith(cls + '_')), want = packs.reduce((a, k) => a + reach(NATURE[k]), 0) / packs.length
    for (const [sp] of species) for (let v = 0; v < GEN_VARIANTS; v++) { const m = G.natureModel(sp, v + 1, 1); NATURE[`Gen_${sp}_${v + 1}`] = scaled(m, reach(m) / want) }
  }
  // the extras stand at scale 1, in metres
  for (const sp of ['apple', 'poplar', 'hawthorn']) for (let v = 0; v < GEN_VARIANTS; v++) NATURE[`Gen_${sp}_${v + 1}`] = G.natureModel(sp, v + 1, 1)
  const variant = (sp: string, x: number, z: number) => `Gen_${sp}_${1 + Math.floor(hash(z * 0.37, x * 0.37) * GEN_VARIANTS)}`
  return {
    pick(model: string, x: number, z: number): string {
      const species = GEN_FOR[model.replace(/_\d+$/, '')]
      if (!species) return model
      let u = hash(x * 0.61, z * 0.61), sp = species[species.length - 1][0]
      for (const [s, share] of species) { if (u < share) { sp = s; break } u -= share }
      return variant(sp, x, z)
    },
    // an orchard on the valley side, a hedgerow along a field, a row of poplars along the road's line, a forest in
    // the open south-west, a smaller wood in the north-east and lone trees in the fields; [model, x, z, scale]: the
    // extras stand in metres, the classes' species at the pack's scale (3.4 to 4.8, as the scatter places them)
    extras(): [string, number, number, number][] {
      const R = mulberry(93), out: [string, number, number, number][] = [], packS = () => 3.4 + R() * 1.4
      for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) { const x = 55 + c * 8 + (R() - 0.5), z = -82 - r * 8 + (R() - 0.5); out.push([variant('apple', x, z), x, z, 1]) }
      for (let i = 0; i < 18; i++) { const x = -150 + i * 3.4 + (R() - 0.5), z = 28 + i * 0.9 + (R() - 0.5) * 0.8; out.push([variant('hawthorn', x, z), x, z, 1]) }
      for (let i = 0; i < 9; i++) { const x = -40 + i * 11, z = 98 + i * 1.5; out.push([variant('poplar', x, z), x, z, 1]) }
      // a wood: darts in a lumpy outline (radius rx, rz, its edge wandering by a third), at least `gap` m apart;
      // birches and hawthorns on the edge, a patch of spruce on one side
      const wood = (cx: number, cz: number, rx: number, rz: number, n: number, gap: number, spruceSide: number) => {
        const pts: [number, number][] = []
        for (let t = 0; t < n * 30 && pts.length < n; t++) {
          const a = R() * Math.PI * 2, u = Math.sqrt(R()), edge = 1 + 0.33 * (hash(Math.cos(a) * 3, Math.sin(a) * 3) - 0.5) * 2
          if (u > edge) continue
          const x = cx + Math.cos(a) * rx * u, z = cz + Math.sin(a) * rz * u
          if (pts.some(([px, pz]) => Math.hypot(px - x, pz - z) < gap)) continue
          pts.push([x, z])
          const rim = u / edge, side = Math.cos(a - spruceSide)
          const sp = rim > 0.85 ? (R() < 0.5 ? 'hawthorn' : 'birch') : side > 0.6 && rim > 0.3 ? 'spruce' : R() < 0.5 ? 'oak' : R() < 0.6 ? 'beech' : R() < 0.6 ? 'lime' : 'birch'
          out.push([variant(sp, x, z), x, z, sp === 'hawthorn' ? 1 : packS()])
        }
      }
      wood(-170, -160, 55, 42, 95, 7.5, 0.6)
      wood(150, 160, 34, 26, 40, 7.5, 3.6)
      // lone field trees: oaks and limes, the odd pear-shaped apple
      for (let i = 0; i < 26; i++) { const x = (R() - 0.5) * 420, z = (R() - 0.5) * 420, sp = R() < 0.55 ? 'oak' : R() < 0.7 ? 'lime' : 'apple'; out.push([variant(sp, x, z), x, z, sp === 'apple' ? 1 : packS()]) }
      return out
    },
    // a column's cards: sized to its width, not its height (src/look/canopy.ts sizes cards by the crown's radius)
    cardOpts(model: string, o: CardOptions): CardOptions {
      const m = NATURE[model]; if (!m || !model.startsWith('Gen_')) return o
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
      for (let v = 0; v < m.role.length; v++) if (m.role[v] <= 1) for (let j = 0; j < 3; j++) { lo[j] = Math.min(lo[j], m.pos[v * 3 + j]); hi[j] = Math.max(hi[j], m.pos[v * 3 + j]) }
      const rh = (hi[0] - lo[0] + hi[2] - lo[2]) / 4, rv = (hi[1] - lo[1]) / 2
      return rv > rh ? { ...o, size: o.size * rh / rv } : o
    },
  }
}
