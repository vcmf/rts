// Test objects for the look checks (docs/plans/active/l2-detail.md), added to the page by the tools, never by the
// page itself. The readability guard's army blocks: one coat colour each (docs/art-bible.md §4), battalion size (a
// line of about 100 men in three ranks: 20 m × 3 m, 1.8 m tall, decision 0007), painted at unit crispness. A block
// whose colour is "ground" is painted by the terrain's own material instead: the guard's negative.
import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js'
import { Color3 } from '@babylonjs/core/Maths/math.color.js'
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector.js'
import { Viewport } from '@babylonjs/core/Maths/math.viewport.js'
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js'
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import type { Scene } from '@babylonjs/core/scene.js'
import type { Materials } from './materials.ts'
import { groundAt } from './heightfield.ts'
import BLOCK_VS from './shaders/block.vert?raw'
import BLOCK_FS from './shaders/block.frag?raw'

export const BLOCK = { w: 20, d: 3, h: 1.8 }

export interface BlockSpec { name: string; x: number; z: number; yaw: number; color: string }   // color: '#rrggbb' or 'ground'
// the screen box of a block, in render pixels (y down), for the camera at the time of the call
export interface BlockBox { name: string; x0: number; y0: number; x1: number; y1: number; cx: number; cy: number }

export class Lab {
  private readonly scene: Scene; private readonly mats: Materials; private readonly groundMat: ShaderMaterial
  private blocks: Mesh[] = []
  private readonly blockMats = new Map<string, ShaderMaterial>()
  constructor(scene: Scene, mats: Materials, groundMat: ShaderMaterial) { this.scene = scene; this.mats = mats; this.groundMat = groundMat }

  addBlocks(specs: BlockSpec[]): number {
    for (const s of specs) {
      let m = s.color === 'ground' ? this.groundMat : this.blockMats.get(s.color)
      if (!m) { m = this.mats.make(`block${s.color}`, BLOCK_VS, BLOCK_FS, { uniforms: ['uAlb'], defines: ['#define NOSNOW'] }); m.setColor3('uAlb', Color3.FromHexString(s.color)); this.blockMats.set(s.color, m) }
      const b = CreateBox(s.name, { width: BLOCK.w, height: BLOCK.h, depth: BLOCK.d }, this.scene)
      // on its lowest corner, so it never floats; on a slope the high side sinks into the ground
      const c = Math.cos(s.yaw), n = Math.sin(s.yaw), hw = BLOCK.w / 2, hd = BLOCK.d / 2
      let lo = Infinity
      for (const [u, v] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]]) lo = Math.min(lo, groundAt(s.x + u * c + v * n, s.z - u * n + v * c))
      b.position.set(s.x, lo + BLOCK.h / 2, s.z); b.rotation.y = s.yaw; b.material = m
      if (m === this.groundMat) b.setVerticesData('aRiver', new Float32Array(b.getTotalVertices()).fill(8), false, 1)   // no bank colours (terrain.ts)
      this.blocks.push(b)
    }
    return this.blocks.length
  }

  clearBlocks(): void { for (const b of this.blocks) b.dispose(); this.blocks = [] }

  blockBoxes(): BlockBox[] {
    const e = this.scene.getEngine(), w = e.getRenderWidth(), h = e.getRenderHeight(), vp = new Viewport(0, 0, w, h), T = this.scene.getTransformMatrix()
    return this.blocks.map(b => {
      b.computeWorldMatrix(true)
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
      for (const p of b.getBoundingInfo().boundingBox.vectorsWorld) { const s = Vector3.Project(p, Matrix.IdentityReadOnly, T, vp); x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); y0 = Math.min(y0, s.y); y1 = Math.max(y1, s.y) }
      const c = Vector3.Project(b.position, Matrix.IdentityReadOnly, T, vp)
      return { name: b.name, x0, y0, x1, y1, cx: c.x, cy: c.y }
    })
  }
}
