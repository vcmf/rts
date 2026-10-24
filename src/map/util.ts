// Small numeric helpers the map engine shares (exact: + − × / and rounding).
import type { AttrValue } from './schema.ts'

// smoothstep on [0, 1], clamped
export const smooth = (s: number): number => {
  const t = s < 0 ? 0 : s > 1 ? 1 : s
  return t * t * (3 - 2 * t)
}
// to 1 cm, the language's precision for coordinates (docs/proposals/map-engine.md §3.1)
export const cm = (v: number): number => Math.round(v * 100) / 100
// a number attribute, or a default when it is absent or not a number
export const num = (v: AttrValue | undefined, dflt = 0): number => (typeof v === 'number' ? v : dflt)
// a field that holds one value or a list of them, as a list
export const listOf = <T>(v: unknown): T[] => (v === undefined ? [] : ((Array.isArray(v) ? v : [v]) as T[]))
// a line an area keeps off (decision 0030): `clear: [{ id, offset? }]`
export interface Clear {
  id: string
  offset?: number
}
