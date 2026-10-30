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

/** A box blur of an n² field, `r` cells each way, clamped at its edges, `passes` times (three: about a Gaussian). */
export function blur(f: Float32Array, n: number, r: number, passes = 3): Float32Array {
  let a = Float32Array.from(f)
  let b = new Float32Array(n * n)
  const w = 2 * r + 1
  const clamp = (v: number) => Math.min(n - 1, Math.max(0, v))
  for (let p = 0; p < passes; p++) {
    for (const [di, dj] of [
      [1, n],
      [n, 1],
    ]) {
      // a running sum along each line (di: the step along it, dj: from one line to the next)
      for (let l = 0; l < n; l++) {
        const base = l * dj
        let s = 0
        for (let k = -r; k <= r; k++) s += a[base + clamp(k) * di]
        for (let i = 0; i < n; i++) {
          b[base + i * di] = s / w
          s += a[base + clamp(i + r + 1) * di] - a[base + clamp(i - r) * di]
        }
      }
      ;[a, b] = [b, a]
    }
  }
  return a
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
  const hs = blur(h, n, SMOOTH)
  const mean = blur(h, n, LOCAL)
  const tex = new Uint8Array(n * n * 4)
  const at = (i: number, j: number) => hs[Math.min(n - 1, Math.max(0, j)) * n + Math.min(n - 1, Math.max(0, i))]
  const byte = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const gx = ((at(i + 1, j) - at(i - 1, j)) / (2 * cell)) * EXAGGERATE
      const gz = ((at(i, j + 1) - at(i, j - 1)) / (2 * cell)) * EXAGGERATE
      const l = Math.hypot(gx, 1, gz)
      const lit = (-gx * sun[0] + sun[1] - gz * sun[2]) / l - sun[1]
      const crest = (h[j * n + i] - mean[j * n + i]) / CREST_M
      const o = (j * n + i) * 4
      tex[o] = byte(0.5 + 0.5 * lit)
      tex[o + 1] = byte(0.5 + 0.5 * crest)
      tex[o + 3] = 255
    }
  }
  return { n, cell, tex }
}

/** The page's ?relief: 0 off, 1 the map worlds' default, 2 stronger; each one's strength (the shader's uReliefK). */
export const RELIEF_K = [0, 1, 1.8] as const
