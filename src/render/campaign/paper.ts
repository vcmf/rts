// The campaign map's paper and clouds (docs/systems/campaign-map.md): two tileable noise canvases the print shader
// reads (src/render/campaign/shaders/print.frag), the prototype's (prototypes/campaign-map.html). Drawn at load: a
// texture of noise, not a bake of the map.

/** A repeatable pseudo-random number in [0, 1) for a pair of numbers. */
function hash(x: number, y: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return h - Math.floor(h)
}

/** A seeded generator of numbers in [0, 1). */
function mulberry(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Periodic value noise on a `period` × `period` lattice, its lattice values from `at`. */
function valueNoise(x: number, y: number, period: number, at: (a: number, b: number) => number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const u = (x - xi) * (x - xi) * (3 - 2 * (x - xi))
  const v = (y - yi) * (y - yi) * (3 - 2 * (y - yi))
  const wrap = (n: number) => ((n % period) + period) % period
  const a = at(wrap(xi), wrap(yi))
  const b = at(wrap(xi + 1), wrap(yi))
  const c = at(wrap(xi), wrap(yi + 1))
  const d = at(wrap(xi + 1), wrap(yi + 1))
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

/** A tileable paper grain, 1024 px a side: mottling, fibres and specks around mid grey (the shader colours it). */
export function paperCanvas(): HTMLCanvasElement {
  const N = 1024
  const P = 16
  const c = document.createElement('canvas')
  c.width = c.height = N
  const g = c.getContext('2d')!
  const im = g.createImageData(N, N)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = (x / N) * P
      const w = (y / N) * P
      const v =
        0.55 * valueNoise(u, w, P, hash) + 0.3 * (valueNoise(u * 2 + 0.5, w * 2, P, hash) % 1) + 0.15 * hash(x, y)
      const i = (y * N + x) * 4
      im.data[i] = im.data[i + 1] = im.data[i + 2] = 96 + v * 64
      im.data[i + 3] = 255
    }
  }
  g.putImageData(im, 0, 0)
  const R = mulberry(9)
  // fibres, drawn in the nine copies of the tile so they wrap across its edges
  for (let k = 0; k < 2600; k++) {
    const x = R() * N
    const y = R() * N
    const a = R() * 6.28
    const l = 6 + R() * 26
    const dark = R() < 0.5
    g.strokeStyle = dark ? `rgba(40,40,40,${0.08 + R() * 0.1})` : `rgba(255,255,255,${0.1 + R() * 0.12})`
    g.lineWidth = 0.5 + R() * 0.6
    for (const ox of [-N, 0, N]) {
      for (const oy of [-N, 0, N]) {
        g.beginPath()
        g.moveTo(x + ox, y + oy)
        const cx = x + ox + Math.cos(a + 0.6) * l * 0.5
        const cy = y + oy + Math.sin(a + 0.6) * l * 0.5
        g.quadraticCurveTo(cx, cy, x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l)
        g.stroke()
      }
    }
  }
  // specks
  for (let k = 0; k < 2400; k++) {
    g.fillStyle = `rgba(30,30,30,${0.06 + R() * 0.16})`
    g.beginPath()
    g.arc(R() * N, R() * N, 0.4 + R() * 0.9, 0, 6.28)
    g.fill()
  }
  return c
}

/** A tileable soft noise for the cloud shadows, 256 px a side: three octaves of periodic value noise, grey. */
export function cloudCanvas(): HTMLCanvasElement {
  const N = 256
  const c = document.createElement('canvas')
  c.width = c.height = N
  const g = c.getContext('2d')!
  const im = g.createImageData(N, N)
  // the lattice values shifted from the paper's, so the clouds do not follow its mottling
  const at = (a: number, b: number) => hash(a + 3.1, b - 7.7)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const octave = (p: number) => valueNoise((x / N) * p, (y / N) * p, p, at)
      const v = 0.55 * octave(4) + 0.3 * octave(8) + 0.15 * octave(16)
      const i = (y * N + x) * 4
      im.data[i] = im.data[i + 1] = im.data[i + 2] = v * 255
      im.data[i + 3] = 255
    }
  }
  g.putImageData(im, 0, 0)
  return c
}
