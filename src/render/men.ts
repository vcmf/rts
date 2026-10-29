// The soldier layer's men as a structure of arrays (docs/plans/done/battle-threads.md, PR 2): one index per man,
// stable while he is on the field (a man who falls keeps his, flagged, for his cross; nothing is compacted; a man
// who leaves the field frees his for a newcomer), so the arrays can move to shared memory for the battle worker
// (PR 3). Readers take the arrays from `Men` each time they read, never keeping them across an `add`: a full store
// grows into new arrays (`reallocs` counts them), which PR 3 must share again. Float64 throughout, as the `Man` objects
// were, so the steering's arithmetic is unchanged bit for bit.

/** Standing (else fallen, or gone with his battalion off the field). */
export const MAN_ALIVE = 1
/** Holding still at his place while his battalion is halted (the hold point is hx, hz). */
export const MAN_SETTLED = 2
/** Left the field with his battalion: neither standing nor fallen, so not drawn; his index is free. */
export const MAN_LEFT = 4

/** A man's gait (Men.gait): at rest, marching (over MARCH_FROM m/s), running (over RUN_FROM). */
export const GAIT_HALT = 0
export const GAIT_MARCH = 1
export const GAIT_RUN = 2
/** m/s: the speed from which a man marches, and runs (his gait). */
export const MARCH_FROM = 0.3
export const RUN_FROM = 2.2
/** His gait at speed `v` (m/s). */
export const gaitAt = (v: number): number => (v > RUN_FROM ? GAIT_RUN : v > MARCH_FROM ? GAIT_MARCH : GAIT_HALT)

/** Every man the layer has had, at indices 0 to `n` − 1 (those flagged MAN_LEFT free). Read the arrays afresh
 * after an `add`: it may reallocate them. */
export class Men {
  n = 0
  // how many times the arrays were reallocated
  reallocs = 0
  // the indices freed by men who left the field, reused first
  private free: number[] = []
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
  // the way he faces (rad: (sin, cos) ahead) and his gait (GAIT_HALT, GAIT_MARCH, GAIT_RUN), as a renderer draws him:
  // worked out by the layer (SoldierLayer.orient) for a battalion whose revision moved, cosmetic
  yaw: Float32Array
  gait: Uint8Array

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
    this.yaw = new Float32Array(capacity)
    this.gait = new Uint8Array(capacity)
  }

  /** A new man standing at slot `s`, at (x, z), at rest, with his drift's phases; returns his index. */
  add(s: number, x: number, z: number, dx: number, dz: number): number {
    let k = this.free.pop()
    if (k === undefined) {
      if (this.n === this.x.length) this.grow()
      k = this.n++
    }
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
    this.yaw[k] = 0
    this.gait[k] = GAIT_HALT
    return k
  }

  /** Man `k` left the field: flagged, and his index free for a newcomer. */
  leave(k: number): void {
    this.flags[k] = MAN_LEFT
    this.free.push(k)
  }

  /** Doubles every array's capacity. */
  private grow(): void {
    const n = this.x.length * 2
    this.x = grown(this.x, n)
    this.z = grown(this.z, n)
    this.vx = grown(this.vx, n)
    this.vz = grown(this.vz, n)
    this.dx = grown(this.dx, n)
    this.dz = grown(this.dz, n)
    this.hx = grown(this.hx, n)
    this.hz = grown(this.hz, n)
    this.s = grown(this.s, n)
    this.flags = grown(this.flags, n)
    this.yaw = grown(this.yaw, n)
    this.gait = grown(this.gait, n)
    this.reallocs++
  }
}

type Typed = Float64Array | Float32Array | Int32Array | Uint8Array

/** A copy of typed array `a` with room for `n` elements. */
export function grown<T extends Typed>(a: T, n: number): T {
  const b = new (a.constructor as new (n: number) => T)(n)
  b.set(a)
  return b
}
