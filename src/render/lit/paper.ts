// The lit map view's paper (docs/plans/active/m6-lit-view.md): a tileable texture drawn once on a canvas, as the
// prototype draws it (prototypes/staff-map.html paperCanvas): mottling, fibres and speckles, grey around the middle
// (the shader colours it).
import { hash, mulberry } from '../../look/noise.ts'

/** Smooth value noise at (x, y), periodic over P cells, from the hash shifted by s. */
function periodic(x: number, y: number, P: number, s = 0): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const hh = (a: number, b: number) => hash((((a % P) + P) % P) + s, (((b % P) + P) % P) - s)
  const a = hh(xi, yi)
  const b = hh(xi + 1, yi)
  const c = hh(xi, yi + 1)
  const d = hh(xi + 1, yi + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

/** Tileable paper, 1024 px: periodic mottling, fibres and speckles, grey around the middle. */
export function paperCanvas(): HTMLCanvasElement {
  const N = 1024
  const c = document.createElement('canvas')
  c.width = c.height = N
  const g = c.getContext('2d', { willReadFrequently: true })!
  const im = g.createImageData(N, N)
  const P = 16
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const v =
        0.55 * periodic((x / N) * P, (y / N) * P, P) +
        ((0.3 * periodic((x / N) * P * 2 + 0.5, (y / N) * P * 2, P)) % 1) +
        0.15 * hash(x, y)
      const i = (y * N + x) * 4
      im.data[i] = im.data[i + 1] = im.data[i + 2] = 96 + v * 64
      im.data[i + 3] = 255
    }
  }
  g.putImageData(im, 0, 0)
  const R = mulberry(9)
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
        g.quadraticCurveTo(
          x + ox + Math.cos(a + 0.6) * l * 0.5,
          y + oy + Math.sin(a + 0.6) * l * 0.5,
          x + ox + Math.cos(a) * l,
          y + oy + Math.sin(a) * l,
        )
        g.stroke()
      }
    }
  }
  for (let k = 0; k < 2400; k++) {
    g.fillStyle = `rgba(30,30,30,${0.06 + R() * 0.16})`
    g.beginPath()
    g.arc(R() * N, R() * N, 0.4 + R() * 0.9, 0, 6.28)
    g.fill()
  }
  return c
}
