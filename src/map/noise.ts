// Value noise for the base ground (docs/plans/done/m3-generators.md): seeded values on a unit lattice, blended with
// a quintic (polynomial, so exact), summed over octaves. In [−1, 1] before scaling. No trigonometry.
// a lattice value in [−1, 1): integer mixing of (seed, i, j), no allocation (this runs millions of times a map)
function lattice(seed: number, i: number, j: number): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(i | 0, 0xc2b2ae35) ^ Math.imul(j | 0, 0x27d4eb2f)
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); h ^= h >>> 16
  return (h >>> 0) / 2147483648 - 1
}
const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10)

export function valueNoise(seed: number, x: number, z: number): number {
  const i = Math.floor(x), j = Math.floor(z), fx = fade(x - i), fz = fade(z - j)
  const a = lattice(seed, i, j), b = lattice(seed, i + 1, j), c = lattice(seed, i, j + 1), d = lattice(seed, i + 1, j + 1)
  return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz
}

// octaves at doubling frequency and halving weight, normalised to [−1, 1]
export function fbm(seed: number, x: number, z: number, octaves = 3): number {
  let s = 0, w = 1, f = 1, total = 0
  for (let o = 0; o < octaves; o++) { s += w * valueNoise(seed + o, x * f, z * f); total += w; w *= 0.5; f *= 2 }
  return s / total
}

// fbm over a whole grid of nodes (x0 + i·cell, z0 + j·cell, (nx + 1) × (nz + 1)), added into `out` times `amp`:
// each octave's lattice values computed once into a table, then the same arithmetic as fbm per node, so the values
// are fbm's to the bit
export function addFbmGrid(out: Float64Array, seed: number, x0: number, z0: number, nx: number, nz: number, cell: number, scale: number, amp: number, octaves = 3): void {
  const W = nx + 1, acc = new Float64Array(out.length)
  let w = 1, f = 1, total = 0
  for (let o = 0; o < octaves; o++) {
    const s = seed + o, X = (i: number) => (x0 + i * cell) / scale * f, Z = (j: number) => (z0 + j * cell) / scale * f
    // the table's bounds from the very expressions the nodes use (monotonic in i, j), so no node reads past it
    const li0 = Math.floor(X(0)), lj0 = Math.floor(Z(0)), li1 = Math.floor(X(nx)) + 1, lj1 = Math.floor(Z(nz)) + 1
    const LW = li1 - li0 + 1, LH = lj1 - lj0 + 1
    if (LW * LH > out.length) {
      // a noise finer than the grid: a table would outgrow the grid itself, so each node computes its own values
      for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) acc[j * W + i] += w * valueNoise(s, X(i), Z(j))
      total += w; w *= 0.5; f *= 2; continue
    }
    const table = new Float64Array(LW * LH)
    for (let j = lj0; j <= lj1; j++) for (let i = li0; i <= li1; i++) table[(j - lj0) * LW + (i - li0)] = lattice(s, i, j)
    for (let j = 0; j <= nz; j++) {
      const z = Z(j), lj = Math.floor(z), fz = fade(z - lj), row = (lj - lj0) * LW
      for (let i = 0; i <= nx; i++) {
        const x = X(i), li = Math.floor(x), fx = fade(x - li), t = row + (li - li0)
        const a = table[t], b = table[t + 1], c = table[t + LW], d = table[t + LW + 1]
        acc[j * W + i] += w * ((a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz)
      }
    }
    total += w; w *= 0.5; f *= 2
  }
  for (let k = 0; k < out.length; k++) out[k] += amp * (acc[k] / total)
}
