// A part of the scene that can be built again (G3b-2, docs/plans/done/g3b-the-detail-follows.md): what a builder
// adds to the scene (meshes, materials, textures, cameras, render targets, the scene's per-frame observers) and to
// the painted materials (src/look/materials.ts: their list and bindings) is recorded, so a moved tile disposes
// exactly that and builds its own. Assumes nothing else is added to the scene while the builder runs (it is
// synchronous) and that what it adds is not shared with another part. A builder that throws leaves nothing behind.
import type { Observable } from '@babylonjs/core/Misc/observable.js'
import type { Scene } from '@babylonjs/core/scene.js'
import type { Materials } from './materials.ts'

export interface Owned<T> {
  value: T
  dispose(): void
  // its bindings run again on every painted material (a part built beside it taken away: src/look/main.ts, move)
  rebind(): void
  // whether it added this (a mesh, a material, a texture: a part built beside it leaves it out)
  has(x: unknown): boolean
}

/** The scene's lists a builder may add to, and the observables a builder hooks a frame on */
const lists = (s: Scene): unknown[][] => [
  s.meshes,
  s.materials,
  s.multiMaterials,
  s.textures,
  s.cameras,
  s.transformNodes,
]
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const observables = (s: Scene): Observable<any>[] => [
  s.onBeforeRenderObservable,
  s.onAfterRenderObservable,
  s.onBeforeCameraRenderObservable,
  s.onAfterCameraRenderObservable,
]

/** What the scene holds now, and a function giving what was added since (the snapshot dropped once read, so an owner
 *  keeps no hold on the parts that stood when it was built) */
function since(scene: Scene): () => { added: unknown[][]; hooks: unknown[][] } {
  let before: Set<unknown>[] | null = lists(scene).map(l => new Set(l))
  let obs: Set<unknown>[] | null = observables(scene).map(o => new Set<unknown>(o.observers))
  return () => {
    const b = before!
    const o = obs!
    before = obs = null
    return {
      added: lists(scene).map((l, k) => l.filter(x => !b[k].has(x))),
      hooks: observables(scene).map((ob, k) => ob.observers.filter(x => !o[k].has(x))),
    }
  }
}

/** Takes away what a build added: its observers, its materials' entries and bindings, its scene objects */
function takeAway(scene: Scene, added: unknown[][], hooks: unknown[][], forget: () => void): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  hooks.forEach((h, k) => h.forEach(x => observables(scene)[k].remove(x as any)))
  forget()
  // meshes first (their materials and textures after), each once; a disposed one is skipped
  for (const l of added) {
    for (const x of l as { dispose(): void; isDisposed?: () => boolean }[]) {
      if (!(typeof x.isDisposed === 'function' && x.isDisposed())) x.dispose()
    }
  }
}

/** Builds a part of the scene, recording what it adds: dispose() takes it all away again; a build that throws is taken
 *  away at once and its error rethrown */
export function owned<T>(scene: Scene, mats: Materials, build: () => T): Owned<T> {
  const diff = since(scene)
  const done = mats.mark()
  let value: T
  try {
    value = build()
  } catch (err) {
    const { added, hooks } = diff()
    takeAway(scene, added, hooks, done().forget)
    throw err
  }
  const { added, hooks } = diff()
  const { forget, bind } = done()
  const mine = new Set(added.flat())
  return { value, dispose: () => takeAway(scene, added, hooks, forget), rebind: bind, has: x => mine.has(x) }
}
