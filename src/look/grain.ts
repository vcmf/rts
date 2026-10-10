// The paint grain texture (tileable, 512²), ported from prototypes/painted-cinematic.html:
//   R fine gouache and paper grain with specks (value jitter, band-edge breakup)
//   G large soft blotches (colour patches, cloud shapes)
//   B dry-brush streaks (directional marks on the ground)
// A dropped PNG replaces R (docs/art-bible.md §7).
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js'
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js'
import type { Scene } from '@babylonjs/core/scene.js'
import { mulberry } from './noise.ts'
import { D } from './spec.ts'

export const GRAIN_N = D.spec.sizes.grain

function pnoise(N: number, cx: number, cy: number, seed: number): Float32Array {
  const r = mulberry(seed), L = new Float32Array(cx * cy); for (let i = 0; i < L.length; i++) L[i] = r()
  const out = new Float32Array(N * N)
  for (let y = 0; y < N; y++) {
    const fy = y / N * cy, iy = Math.floor(fy), ty = fy - iy, sy = ty * ty * (3 - 2 * ty), y0 = iy % cy, y1 = (iy + 1) % cy
    for (let x = 0; x < N; x++) {
      const fx = x / N * cx, ix = Math.floor(fx), tx = fx - ix, sx = tx * tx * (3 - 2 * tx), x0 = ix % cx, x1 = (ix + 1) % cx
      const a = L[y0 * cx + x0], b = L[y0 * cx + x1], c = L[y1 * cx + x0], d = L[y1 * cx + x1]
      out[y * N + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
    }
  }
  return out
}

const cl = (v: number) => v < 0 ? 0 : v > 1 ? 1 : v

export function makeGrainCanvas(userLum: Float32Array | null): HTMLCanvasElement {
  const N = GRAIN_N, c = document.createElement('canvas'); c.width = c.height = N
  const g = c.getContext('2d')!, img = g.createImageData(N, N), d = img.data
  const fA = pnoise(N, 256, 256, 1), fB = pnoise(N, 128, 128, 2), b1 = pnoise(N, 4, 4, 3), b2 = pnoise(N, 8, 8, 4), b3 = pnoise(N, 16, 16, 5), b4 = pnoise(N, 32, 32, 6), s1 = pnoise(N, 6, 128, 7), s2 = pnoise(N, 12, 256, 8)
  const r = mulberry(9), fine = new Float32Array(N * N)
  for (let i = 0; i < N * N; i++) fine[i] = 0.4 * r() + 0.35 * fA[i] + 0.25 * fB[i]
  for (let k = 0; k < 2600; k++) {   // paint specks
    const cx = Math.floor(r() * N), cy = Math.floor(r() * N), rad = 1 + r() * 1.8, val = (r() < 0.5 ? -1 : 1) * (0.18 + r() * 0.2)
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { if (dx * dx + dy * dy > rad * rad) continue; const i = ((cy + dy + N) % N) * N + ((cx + dx + N) % N); fine[i] += val }
  }
  for (let i = 0; i < N * N; i++) {
    const f = userLum ? userLum[i] : cl((fine[i] - 0.5) * 1.8 + 0.5)
    const bl = cl((0.5 * b1[i] + 0.25 * b2[i] + 0.15 * b3[i] + 0.1 * b4[i] - 0.5) * 1.7 + 0.5)
    const st = cl((0.6 * s1[i] + 0.4 * s2[i] - 0.5) * 2.4 + 0.5)
    d[i * 4] = f * 255; d[i * 4 + 1] = bl * 255; d[i * 4 + 2] = st * 255; d[i * 4 + 3] = 255
  }
  g.putImageData(img, 0, 0); return c
}

// the seam check's grain (tools/detail-check.mjs): R holds only broad, smooth features (a few cells per tile), so a
// render of it is smooth everywhere but at silhouettes and seams; G and B as the paint grain's. Also returns R's
// steepest change between neighbouring texels
export function makeSmoothGrainCanvas(): { canvas: HTMLCanvasElement; maxStep: number } {
  const N = GRAIN_N, canvas = makeGrainCanvas(null), g = canvas.getContext('2d')!, img = g.getImageData(0, 0, N, N), d = img.data
  const a = pnoise(N, 4, 4, 11), b = pnoise(N, 8, 8, 12), r = new Float32Array(N * N)
  for (let i = 0; i < N * N; i++) r[i] = cl((0.65 * a[i] + 0.35 * b[i] - 0.5) * 2.2 + 0.5)
  for (let i = 0; i < N * N; i++) d[i * 4] = Math.round(r[i] * 255)
  // on the stored bytes: the texture holds those, not the floats
  let maxStep = 0
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const v = d[(y * N + x) * 4]
    maxStep = Math.max(maxStep, Math.abs(v - d[(y * N + (x + 1) % N) * 4]), Math.abs(v - d[(((y + 1) % N) * N + x) * 4]))
  }
  maxStep /= 255
  g.putImageData(img, 0, 0); return { canvas, maxStep }
}

// the means of the grain's R (fine grain) and G (blotches) channels, 0..1
export function grainMean(canvas: HTMLCanvasElement): [number, number] {
  const d = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
  let r = 0, g = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1] }
  return [r / (d.length / 4) / 255, g / (d.length / 4) / 255]
}

export function grainTexture(scene: Scene, canvas: HTMLCanvasElement): DynamicTexture {
  const t = new DynamicTexture('grain', canvas, scene, true, Texture.TRILINEAR_SAMPLINGMODE)
  t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE; t.anisotropicFilteringLevel = 4; t.update(false); return t
}

// a dropped image as grain luminance: only its variation matters, so it is normalised to 0..1
export function lumOf(img: HTMLImageElement): Float32Array {
  const N = GRAIN_N, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d')!; g.drawImage(img, 0, 0, N, N)
  const d = g.getImageData(0, 0, N, N).data, lum = new Float32Array(N * N); let mn = 1, mx = 0
  for (let i = 0; i < lum.length; i++) { const a = d[i * 4 + 3] / 255, v = (0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2]) / 255 * a + (1 - a) * 0.5; lum[i] = v; mn = Math.min(mn, v); mx = Math.max(mx, v) }
  for (let i = 0; i < lum.length; i++) lum[i] = (lum[i] - mn) / Math.max(1e-3, mx - mn)
  return lum
}
