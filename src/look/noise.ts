// Small noise for terrain and scatter (ported from prototypes/painted-cinematic.html). Render-side code: any
// maths is allowed here (docs/plans/active/track-e-look.md, L0c); the sim's determinism rules do not apply.

export function hash(x: number, y: number): number { const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return h - Math.floor(h) }

export function vn(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf)
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

export function fbm(x: number, y: number): number {
  let s = 0, a = 0.5
  for (let i = 0; i < 4; i++) { s += a * vn(x, y); x = x * 2.03 + 11.3; y = y * 2.03 - 7.1; a *= 0.5 }
  return s
}

export function mulberry(a: number): () => number {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0
    let t = Math.imul(a ^ a >>> 15, 1 | a)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

export const sstep = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
