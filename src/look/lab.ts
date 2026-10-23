// Test objects for the look checks (docs/plans/active/l2-detail.md), added to the page by the tools, never by the
// page itself. The readability guard's army blocks: one coat colour each (docs/art-bible.md §4), battalion size (a
// line of about 100 men in three ranks: 20 m × 3 m, 1.8 m tall, decision 0007), painted at unit crispness. The
// detail check's test hill: a turned profile with faces at 15° to 90° in 15° steps and a flat top, all around, so the
// ground's projection meets every slope and facing.
import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js'
import { Color3 } from '@babylonjs/core/Maths/math.color.js'
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector.js'
import { Viewport } from '@babylonjs/core/Maths/math.viewport.js'
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js'
import { CreateLathe } from '@babylonjs/core/Meshes/Builders/latheBuilder.js'
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import type { Scene } from '@babylonjs/core/scene.js'
import type { Materials } from './materials.ts'
import { groundAt } from './heightfield.ts'
import BLOCK_VS from './shaders/block.vert?raw'
import BLOCK_FS from './shaders/block.frag?raw'

export const BLOCK = { w: 20, d: 3, h: 1.8 }
export const HILL = { seg: 4, top: 6, sink: 2, round: 3 } // m: each face's length along the profile, the flat top's radius, the foot's depth below the lowest ground under it, the length a corner turns over

// color: '#rrggbb'
export interface BlockSpec {
  name: string
  x: number
  z: number
  yaw: number
  color: string
}
// the screen box of a block, in render pixels (y down), for the camera at the time of the call
export interface BlockBox {
  name: string
  x0: number
  y0: number
  x1: number
  y1: number
  cx: number
  cy: number
}

export class Lab {
  private readonly scene: Scene
  private readonly mats: Materials
  private blocks: Mesh[] = []
  private hills: Mesh[] = []
  private mask = -1
  private readonly blockMats = new Map<string, ShaderMaterial>()
  constructor(scene: Scene, mats: Materials) {
    this.scene = scene
    this.mats = mats
  }

  addBlocks(specs: BlockSpec[]): number {
    for (const s of specs) {
      let m = this.blockMats.get(s.color)
      if (!m) {
        m = this.mats.make(`block${s.color}`, BLOCK_VS, BLOCK_FS, {
          uniforms: ['uAlb', 'uMask'],
          defines: ['#define NOSNOW', '#define KEEP_HUE', '#define BOUNCE'],
        })
        m.setColor3('uAlb', Color3.FromHexString(s.color))
        m.setFloat('uMask', this.mask)
        this.blockMats.set(s.color, m)
      }
      const b = CreateBox(s.name, { width: BLOCK.w, height: BLOCK.h, depth: BLOCK.d }, this.scene)
      // on its lowest corner, so it never floats; on a slope the high side sinks into the ground
      const c = Math.cos(s.yaw)
      const n = Math.sin(s.yaw)
      const hw = BLOCK.w / 2
      const hd = BLOCK.d / 2
      let lo = Infinity
      for (const [u, v] of [
        [-hw, -hd],
        [hw, -hd],
        [-hw, hd],
        [hw, hd],
      ]) {
        lo = Math.min(lo, groundAt(s.x + u * c + v * n, s.z - u * n + v * c))
      }
      b.position.set(s.x, lo + BLOCK.h / 2, s.z)
      b.rotation.y = s.yaw
      b.material = m
      this.blocks.push(b)
    }
    return this.blocks.length
  }

  // every coat block drawn flat white (1), flat black (0) or painted (-1): two renders, white and black, find a block's
  // pixels exactly, behind whatever hides it
  setMask(v: number): void {
    this.mask = v
    for (const m of this.blockMats.values()) m.setFloat('uMask', v)
  }

  // a test hill at (x, z), drawn with mat (a terrain material: it reads aRiver, set to 8, no bank). Returns its
  // top's height above the ground at (x, z), m
  addHill(x: number, z: number, mat: ShaderMaterial): number {
    // walk the profile from the top's centre outward and down, the slope turning from face to face over HILL.round
    // metres (a crease would turn the normal within a pixel: terrain normals are smooth)
    const faces = [[0, HILL.top], ...[90, 75, 60, 45, 30, 15].map(d => [d, HILL.seg])]
    const ds = 0.25
    const pts = [new Vector3(0, 0, 0)]
    let r = 0
    let h = 0
    faces.forEach(([deg, len], k) => {
      for (let s = ds; s <= len + 1e-9; s += ds) {
        const prev = faces[k - 1]?.[0]
        const next = faces[k + 1]?.[0]
        const half = HILL.round / 2
        let d = deg
        if (prev != null && s < half) d = prev + (deg - prev) * (0.5 + s / HILL.round)
        if (next != null && s > len - half) d = deg + ((next - deg) * (s - (len - half))) / HILL.round
        const a = (d * Math.PI) / 180
        r += ds * Math.cos(a)
        h -= ds * Math.sin(a)
        pts.push(new Vector3(r, h, 0))
      }
    })
    pts.reverse() // from the foot up: the faces point outward
    const hill = CreateLathe('hill', { shape: pts, tessellation: 144 }, this.scene)
    // the foot HILL.sink below the lowest ground under it, so no side floats on a slope
    let lo = groundAt(x, z)
    for (let k = 0; k < 32; k++) {
      const a = (k / 32) * 2 * Math.PI
      lo = Math.min(lo, groundAt(x + r * Math.cos(a), z + r * Math.sin(a)))
    }
    hill.position.set(x, lo - HILL.sink - h, z)
    hill.setVerticesData('aRiver', new Float32Array(hill.getTotalVertices()).fill(8), false, 1)
    hill.material = mat
    this.hills.push(hill)
    return hill.position.y - groundAt(x, z)
  }

  clearHills(): void {
    for (const h of this.hills) h.dispose()
    this.hills = []
  }

  clearBlocks(): void {
    for (const b of this.blocks) b.dispose()
    this.blocks = []
  }

  blockBoxes(): BlockBox[] {
    const e = this.scene.getEngine()
    const w = e.getRenderWidth()
    const h = e.getRenderHeight()
    const vp = new Viewport(0, 0, w, h)
    const T = this.scene.getTransformMatrix()
    return this.blocks.map(b => {
      b.computeWorldMatrix(true)
      let x0 = Infinity
      let y0 = Infinity
      let x1 = -Infinity
      let y1 = -Infinity
      for (const p of b.getBoundingInfo().boundingBox.vectorsWorld) {
        const s = Vector3.Project(p, Matrix.IdentityReadOnly, T, vp)
        x0 = Math.min(x0, s.x)
        x1 = Math.max(x1, s.x)
        y0 = Math.min(y0, s.y)
        y1 = Math.max(y1, s.y)
      }
      const c = Vector3.Project(b.position, Matrix.IdentityReadOnly, T, vp)
      return { name: b.name, x0, y0, x1, y1, cx: c.x, cy: c.y }
    })
  }
}
