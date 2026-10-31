// A rebuilt part of the tile (G3b-2, docs/plans/active/g3b-the-detail-follows.md): src/look/owned.ts takes away what a
// builder added to the scene, and Materials.mark (src/look/materials.ts) what it added to the painted materials, each
// part exactly its own whichever is disposed first (the bug before: the lists cut back to a length, so disposing the
// first-built part took a later part's bindings with it and left holes).
import { describe, expect, it } from 'vitest'
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js'
import { Scene } from '@babylonjs/core/scene.js'
import { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js'
import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js'
import { Materials } from '../src/look/materials.ts'
import { owned } from '../src/look/owned.ts'

const world = () => {
  const scene = new Scene(new NullEngine())
  const mats = new Materials(scene, new Texture(null, scene), [0.5, 0.5])
  return { scene, mats }
}
// a part: its meshes, a texture, a per-frame observer and a binding, named
const part = (scene: Scene, mats: Materials, name: string) => () => {
  const meshes = [new Mesh(name + 'a', scene), new Mesh(name + 'b', scene)]
  const tex = new Texture(null, scene)
  scene.onBeforeRenderObservable.add(() => undefined)
  mats.bindAll(m => m.setFloat(name, 1))
  return { meshes, tex }
}
// the bindings a material made now takes (by the floats they set)
const bound = (mats: Materials) => {
  const set: string[] = []
  const fake = { setFloat: (k: string) => set.push(k) } as unknown as ShaderMaterial
  for (const b of (mats as unknown as { binders: ((m: ShaderMaterial) => void)[] }).binders) b(fake)
  return set
}

describe('a part of the scene built again (owned, Materials.mark)', () => {
  it('takes away what its builder added, and nothing else', async () => {
    const { scene, mats } = world()
    const keep = new Mesh('keep', scene)
    const [m0, t0, o0] = [scene.meshes.length, scene.textures.length, scene.onBeforeRenderObservable.observers.length]
    const p = owned(scene, mats, part(scene, mats, 'p'))
    expect(scene.meshes.length).toBe(m0 + 2)
    expect(bound(mats)).toContain('p')
    p.dispose()
    // (Babylon takes an observer away on a later tick)
    await new Promise(r => setTimeout(r, 0))
    expect([scene.meshes.length, scene.textures.length, scene.onBeforeRenderObservable.observers.length]).toEqual([
      m0,
      t0,
      o0,
    ])
    expect(p.value.meshes.every(m => m.isDisposed())).toBe(true)
    expect(keep.isDisposed()).toBe(false)
    expect(bound(mats)).not.toContain('p')
  })

  it('keeps each part its own whichever is disposed first, and the later bindings whole', () => {
    const { scene, mats } = world()
    // built a, b, c; a disposed and built again (a2), then b: c and a2 stay bound, in order, no holes
    const a = owned(scene, mats, part(scene, mats, 'a'))
    const b = owned(scene, mats, part(scene, mats, 'b'))
    owned(scene, mats, part(scene, mats, 'c'))
    a.dispose()
    owned(scene, mats, part(scene, mats, 'a2'))
    b.dispose()
    expect(bound(mats)).toEqual(['c', 'a2'])
    expect(scene.meshes.map(m => m.name).sort()).toEqual(['a2a', 'a2b', 'ca', 'cb'])
  })

  it('takes away at once what a build that throws had added, and rethrows', async () => {
    const { scene, mats } = world()
    const [m0, o0] = [scene.meshes.length, scene.onBeforeRenderObservable.observers.length]
    expect(() =>
      owned(scene, mats, () => {
        part(scene, mats, 'x')()
        throw new Error('the build failed')
      }),
    ).toThrow(/the build failed/)
    await new Promise(r => setTimeout(r, 0))
    expect([scene.meshes.length, scene.onBeforeRenderObservable.observers.length]).toEqual([m0, o0])
    expect(bound(mats)).not.toContain('x')
  })
})
