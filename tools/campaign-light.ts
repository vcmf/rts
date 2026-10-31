// The campaign map's light, baked on every core (docs/plans/active/europe.md, EU1): a pool of workers kept for a whole
// bake (tools/campaign-tiles.ts), each baking a band of a block's rows (src/render/campaign/bake.ts bakeLightRows); a
// block's shape and the coarse shape of the whole map shared with them, not copied. This module is also the workers'
// own script. Tested in test/campaign-light.test.ts.
import os from 'node:os'
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'
import { bakeLightRows, type Grid, type SunParams } from '../src/render/campaign/bake.ts'

/** A shape shared with the light's workers, on its grid. */
export interface SharedShape {
  shape: SharedArrayBuffer
  g: Grid
}

/** What a light worker is given: a band of a block's rows and its columns, its shape, the far shape past it. */
interface Job {
  shape: SharedArrayBuffer
  light: SharedArrayBuffer
  grid: Grid
  sun: SunParams
  j0: number
  j1: number
  i0: number
  i1: number
  far: SharedShape
}

// the workers' own data: what makes this script a light worker
const WORKER = 'campaign-light'

/** A shape copied into shared memory, for the workers. */
export function shared(shape: Float32Array, g: Grid): SharedShape {
  const buffer = new SharedArrayBuffer(shape.byteLength)
  new Float32Array(buffer).set(shape)
  return { shape: buffer, g }
}

/** The light's workers, `count` of them (one a core by default), kept until close(). */
export class LightPool {
  private readonly workers: Worker[]
  private broken: Error | null = null

  constructor(count = Math.max(1, os.cpus().length)) {
    this.workers = Array.from({ length: count }, () => new Worker(new URL(import.meta.url), { workerData: WORKER }))
    for (const worker of this.workers) {
      // a worker gone (killed, out of memory) fails the next bake, not leaves it waiting
      worker.on('exit', code => (this.broken ??= new Error(`a light worker stopped (exit ${code})`)))
      worker.on('error', e => (this.broken ??= e))
    }
  }

  /**
   * The light of a block's rows j0..j1 and columns i0..i1 (its nodes in the block's grid), its shape on its grid and
   * the far shape past it, under `sun`: the sun and sky bytes a node of the block (the rest left 0). Rejects when a
   * worker fails or is gone.
   */
  async bake(
    shape: Float32Array,
    grid: Grid,
    far: SharedShape,
    sun: SunParams,
    rows: [number, number],
    cols: [number, number],
  ): Promise<Uint8Array> {
    const block = shared(shape, grid)
    const light = new SharedArrayBuffer(grid.nx * grid.nz * 2)
    const band = Math.ceil((rows[1] - rows[0]) / this.workers.length)
    await Promise.all(
      this.workers.map((worker, w) => {
        const j0 = rows[0] + w * band
        const j1 = Math.min(rows[1], j0 + band)
        if (j0 >= j1) return Promise.resolve()
        const job: Job = { shape: block.shape, light, grid, sun, j0, j1, i0: cols[0], i1: cols[1], far }
        return new Promise<void>((resolve, reject) => {
          if (this.broken) return reject(this.broken)
          const failed = (e: unknown) => reject(e instanceof Error ? e : new Error(`a light worker stopped (${e})`))
          worker.once('message', () => {
            worker.off('error', failed)
            worker.off('exit', failed)
            resolve()
          })
          worker.once('error', failed)
          worker.once('exit', failed)
          worker.postMessage(job)
        })
      }),
    )
    return new Uint8Array(light)
  }

  /** Stops the workers. */
  async close() {
    await Promise.all(this.workers.map(worker => worker.terminate()))
  }

  /** Stops one worker, as if it had died (for the tests). */
  async kill(k: number) {
    await this.workers[k].terminate()
  }
}

if (!isMainThread && workerData === WORKER) {
  // a light worker: bakes the bands it is sent until it is stopped
  parentPort!.on('message', (job: Job) => {
    const far = { shape: new Float32Array(job.far.shape), g: job.far.g }
    const out = new Uint8Array(job.light)
    bakeLightRows(new Float32Array(job.shape), job.grid, job.sun, out, job.j0, job.j1, far, job.i0, job.i1)
    parentPort!.postMessage('done')
  })
}
