// The soldier layer's men as a structure of arrays (docs/plans/active/battle-threads.md, PR 2): one index per man,
// stable for the layer's life (a man who falls keeps his, flagged; nothing is compacted), so the arrays can move
// to shared memory for the battle worker (PR 3) with every reader unchanged. Float64 throughout, as the `Man`
// objects were, so the steering's arithmetic is unchanged bit for bit.

/** Standing (else fallen, or gone with his battalion off the field). */
export const MAN_ALIVE = 1
/** Holding still at his place while his battalion is halted (the hold point is hx, hz). */
export const MAN_SETTLED = 2
/** Left the field with his battalion: neither standing nor fallen, so not drawn. */
export const MAN_LEFT = 4

/** Every man the layer has had, at stable indices 0 to `n` − 1. Read the arrays afresh after an `add`: it may
 * reallocate them. */
export class Men {
  n = 0
  // where he stands and his velocity
  x: Float64Array
  z: Float64Array
  vx: Float64Array
  vz: Float64Array
  // his drift's phases
  dx: Float64Array
  dz: Float64Array
  // where he settled
  hx: Float64Array
  hz: Float64Array
  // his slot in his battalion's shape, and MAN_ALIVE | MAN_SETTLED | MAN_LEFT
  s: Int32Array
  flags: Uint8Array

  constructor(capacity = 1024) {
    this.x = new Float64Array(capacity)
    this.z = new Float64Array(capacity)
    this.vx = new Float64Array(capacity)
    this.vz = new Float64Array(capacity)
    this.dx = new Float64Array(capacity)
    this.dz = new Float64Array(capacity)
    this.hx = new Float64Array(capacity)
    this.hz = new Float64Array(capacity)
    this.s = new Int32Array(capacity)
    this.flags = new Uint8Array(capacity)
  }

  /** A new man standing at slot `s`, at (x, z), at rest, with his drift's phases; returns his index. */
  add(s: number, x: number, z: number, dx: number, dz: number): number {
    if (this.n === this.x.length) this.grow()
    const k = this.n++
    this.s[k] = s
    this.x[k] = x
    this.z[k] = z
    this.vx[k] = 0
    this.vz[k] = 0
    this.dx[k] = dx
    this.dz[k] = dz
    this.hx[k] = 0
    this.hz[k] = 0
    this.flags[k] = MAN_ALIVE
    return k
  }

  /** Doubles every array's capacity. */
  private grow(): void {
    const n = this.x.length * 2
    const f64 = (a: Float64Array): Float64Array => {
      const b = new Float64Array(n)
      b.set(a)
      return b
    }
    this.x = f64(this.x)
    this.z = f64(this.z)
    this.vx = f64(this.vx)
    this.vz = f64(this.vz)
    this.dx = f64(this.dx)
    this.dz = f64(this.dz)
    this.hx = f64(this.hx)
    this.hz = f64(this.hz)
    const s = new Int32Array(n)
    s.set(this.s)
    this.s = s
    const flags = new Uint8Array(n)
    flags.set(this.flags)
    this.flags = flags
  }
}
