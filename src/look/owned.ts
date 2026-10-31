// A part of the scene that can be built again (G3b-2, docs/plans/active/g3b-the-detail-follows.md): what a builder
// adds to the scene (meshes, materials, textures, cameras, render targets, the scene's per-frame observers) and to
// the painted materials (src/look/materials.ts: their list and bindings) is recorded, so a moved tile disposes
// exactly that and builds its own. Assumes nothing else is added to the scene while the builder runs (it is
// synchronous) and that what it adds is not shared with another part.
import type { Observable } from '@babylonjs/core/Misc/observable.js'
import type { Scene } from '@babylonjs/core/scene.js'
import type { Materials } from './materials.ts'

export interface Owned<T> {
  value: T
  dispose(): void
}

/** The scene's lists a builder may add to, and the observables a builder hooks a frame on */
const lists = (s: Scene) => [s.meshes, s.materials, s.multiMaterials, s.textures, s.cameras, s.transformNodes]
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const observables = (s: Scene): Observable<any>[] => [
  s.onBeforeRenderObservable,
  s.onAfterRenderObservable,
  s.onBeforeCameraRenderObservable,
  s.onAfterCameraRenderObservable,
]

/** Builds a part of the scene, recording what it adds: dispose() takes it all away again */
export function owned<T>(scene: Scene, mats: Materials, build: () => T): Owned<T> {
  const before = lists(scene).map(l => new Set<unknown>(l))
  const obs = observables(scene).map(o => new Set(o.observers))
  const done = mats.mark()
  const value = build()
  const forget = done()
  const added = lists(scene).map((l, k) => l.filter(x => !before[k].has(x)))
  const hooks = observables(scene).map((o, k) => o.observers.filter(x => !obs[k].has(x)))
  return {
    value,
    dispose() {
      hooks.forEach((h, k) => h.forEach(x => observables(scene)[k].remove(x)))
      forget()
      // meshes first (their materials and textures after), each once; a disposed one is skipped
      for (const l of added) {
        for (const x of l as { dispose(): void; isDisposed?: () => boolean }[]) {
          if (!(typeof x.isDisposed === 'function' && x.isDisposed())) x.dispose()
        }
      }
    },
  }
}
