// The relief's painted tone (docs/plans/active/look-austerlitz-a1.md): a map world's long, gentle slopes (Austerlitz
// at 2×: a few degrees) take the sun's light too evenly to read as hills, where the lit map view's shaded relief reads
// them at once. So the ground's macro colour takes a soft hillshade and a crest-and-valley tone, baked once with it
// (src/look/macro.ts, RELIEF; static light, AGENTS.md), from the heights over the far ring: slopes turned to the sun
// lighter and away darker, as if `EXAGGERATE` times steeper; crests a little lighter, valleys a little darker and
// cooler (the shader's reliefTone). Pure: tested in test/look-relief.test.ts.

export const RELIEF_CELL = 4 // the field's cells, m (the far bake's texel)
// the hillshade's slopes, times the ground's: a 4° slope shades as a 16° one
const EXAGGERATE = 4
// the heights smoothed over about this many cells before the slopes (a furrow's or a bank's metre is no hill)
const SMOOTH = 2
// crests and valleys: the ground against its mean over about this many cells (about 60 m), full tone at ±CREST_M m
const LOCAL = 15
const CREST_M = 4

/** A box blur of an nx × nz field (nz: nx unless given), `r` cells each way, clamped at its edges, `passes` times
 *  (three: about a Gaussian). */
export function blur(f: Float32Array, nx: number, r: number, passes = 3, nz = nx): Float32Array {
  let a = Float32Array.from(f)
  let b = new Float32Array(nx * nz)
  const w = 2 * r + 1
  for (let p = 0; p < passes; p++) {
    // along x (lines of nz rows), then along z (lines of nx columns)
    for (const [di, dj, len, lines] of [
      [1, nx, nx, nz],
      [nx, 1, nz, nx],
    ]) {
      const clamp = (v: number) => Math.min(len - 1, Math.max(0, v))
      // a running sum along each line (di: the step along it, dj: from one line to the next)
      for (let l = 0; l < lines; l++) {
        const base = l * dj
        let s = 0
        for (let k = -r; k <= r; k++) s += a[base + clamp(k) * di]
        for (let i = 0; i < len; i++) {
          b[base + i * di] = s / w
          s += a[base + clamp(i + r + 1) * di] - a[base + clamp(i - r) * di]
        }
      }
      ;[a, b] = [b, a]
    }
  }
  return a
}

/** The tone of an nx × nz field of heights `h` (`cell` m), as RGBA bytes (reliefField) */
function toneOf(h: Float32Array, nx: number, nz: number, cell: number, sun: readonly [number, number, number]) {
  const hs = blur(h, nx, SMOOTH, 3, nz)
  const mean = blur(h, nx, LOCAL, 3, nz)
  const tex = new Uint8Array(nx * nz * 4)
  const at = (i: number, j: number) => hs[Math.min(nz - 1, Math.max(0, j)) * nx + Math.min(nx - 1, Math.max(0, i))]
  const byte = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255)
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const gx = ((at(i + 1, j) - at(i - 1, j)) / (2 * cell)) * EXAGGERATE
      const gz = ((at(i, j + 1) - at(i, j - 1)) / (2 * cell)) * EXAGGERATE
      const l = Math.hypot(gx, 1, gz)
      const lit = (-gx * sun[0] + sun[1] - gz * sun[2]) / l - sun[1]
      const crest = (h[j * nx + i] - mean[j * nx + i]) / CREST_M
      const o = (j * nx + i) * 4
      tex[o] = byte(0.5 + 0.5 * lit)
      tex[o + 1] = byte(0.5 + 0.5 * crest)
      tex[o + 3] = 255
    }
  }
  return tex
}

/**
 * The relief's tone over a square of side `side` m from (x0, z0) (by default centred on the origin) at about
 * RELIEF_CELL m cells (a whole number of them over the side), as RGBA bytes: R the hillshade (0.5 flat; brighter
 * turned to the light, `sun` the direction toward it, unit, y up), G the crest (0.5 the mean ground; brighter on a
 * crest, darker in a valley). `heightAt`: the ground (m) at a world point.
 */
export function reliefField(
  heightAt: (x: number, z: number) => number,
  side: number,
  sun: readonly [number, number, number],
  x0 = -side / 2,
  z0 = x0,
): { n: number; cell: number; tex: Uint8Array } {
  const n = Math.round(side / RELIEF_CELL)
  const cell = side / n
  const h = new Float32Array(n * n)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) h[j * n + i] = heightAt(x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell)
  }
  return { n, cell, tex: toneOf(h, n, n, cell, sun) }
}

// how far a cell's tone reads the heights round it, cells: the widest blur's passes, and the slope's step
const REACH = 3 * Math.max(LOCAL, SMOOTH + 1) + 1

/**
 * A field's tone (reliefField's: `n` cells of `cell` m from x0, z0) made again where heights changed inside a
 * rectangle of the world (a moved tile's squares, G3c), written into its bytes `tex` in place: the tone kept over
 * the rectangle and REACH cells past it (as far as a change reaches), the heights read REACH cells past that (clipped
 * to the field, whose edges the blurs clamp at as the whole field's do). The same tone as the whole field's but for
 * the blurs' running sums' rounding (a byte now and then)
 */
export function reliefPatch(
  heightAt: (x: number, z: number) => number,
  field: { n: number; cell: number; x0: number; z0: number },
  rect: { x0: number; z0: number; x1: number; z1: number },
  sun: readonly [number, number, number],
  tex: Uint8Array,
): void {
  const { n, cell } = field
  const cl = (v: number) => Math.max(0, Math.min(n, v))
  // the cells kept (the rectangle's and REACH past them), then the window's (REACH past those)
  const i0 = cl(Math.floor((rect.x0 - field.x0) / cell) - REACH)
  const i1 = cl(Math.ceil((rect.x1 - field.x0) / cell) + REACH)
  const j0 = cl(Math.floor((rect.z0 - field.z0) / cell) - REACH)
  const j1 = cl(Math.ceil((rect.z1 - field.z0) / cell) + REACH)
  if (i1 <= i0 || j1 <= j0) return
  const [wi0, wi1, wj0, wj1] = [cl(i0 - REACH), cl(i1 + REACH), cl(j0 - REACH), cl(j1 + REACH)]
  const nx = wi1 - wi0
  const nz = wj1 - wj0
  const h = new Float32Array(nx * nz)
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      h[j * nx + i] = heightAt(field.x0 + (wi0 + i + 0.5) * cell, field.z0 + (wj0 + j + 0.5) * cell)
    }
  }
  const t = toneOf(h, nx, nz, cell, sun)
  for (let j = j0; j < j1; j++) {
    const from = ((j - wj0) * nx + (i0 - wi0)) * 4
    tex.set(t.subarray(from, from + (i1 - i0) * 4), (j * n + i0) * 4)
  }
}

/** The page's ?relief: 0 off, 1 the map worlds' default, 2 stronger; each one's strength (the shader's uReliefK). */
export const RELIEF_K = [0, 1, 1.8] as const
