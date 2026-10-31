// The light's workers (tools/campaign-light.ts, docs/plans/active/europe.md EU1): a block's light baked by the pool
// is the light baked in one thread, and a worker gone fails the next bake rather than leaving it waiting.
import { afterEach, describe, it, expect } from 'vitest'
import { bakeLightRows, type Grid } from '../src/render/campaign/bake.ts'
import { LightPool, shared } from '../tools/campaign-light.ts'

const grid: Grid = { nx: 40, nz: 30, cell: 250, x0: 0, z0: 0 }
const shape = Float32Array.from({ length: 40 * 30 }, (_, k) => 400 * Math.sin((k % 40) / 5) + 300 * Math.cos(k / 200))
const far = shared(new Float32Array(9 * 9), { nx: 9, nz: 9, cell: 2000, x0: -4000, z0: -4000 })
const sun = { el: 20, az: 55, size: 2.5 }

let pool: LightPool | null = null
afterEach(async () => {
  await pool?.close()
  pool = null
})

describe('the light pool', () => {
  it('bakes a block light as one thread does, on the rows and columns asked', async () => {
    pool = new LightPool(3)
    const light = await pool.bake(shape, grid, far, sun, [5, 25], [4, 36])
    const one = new Uint8Array(40 * 30 * 2)
    bakeLightRows(shape, grid, sun, one, 5, 25, { shape: new Float32Array(far.shape), g: far.g }, 4, 36)
    expect(light).toEqual(one)
    // outside the rows and columns, nothing
    expect(light[(2 * 40 + 10) * 2]).toBe(0)
  })

  it('fails the next bake when a worker is gone', async () => {
    pool = new LightPool(2)
    await pool.kill(1)
    await expect(pool.bake(shape, grid, far, sun, [0, 30], [0, 40])).rejects.toThrow(/stopped/)
  })
})
