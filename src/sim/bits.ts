// Fixed-size bit sets in 32-bit words: a battalion's bins (the footprint gate) and a company's slots (the
// re-packing gate) outgrow one 32-bit mask once a battalion has hundreds of men (decision 0018).
export type Bits = Uint32Array
export const mkBits = (n: number): Bits => new Uint32Array((n + 31) >>> 5)
export const setBit = (a: Bits, j: number): void => {
  a[j >>> 5] |= 1 << (j & 31)
}
export const hasBit = (a: Bits, j: number): boolean => (a[j >>> 5] & (1 << (j & 31))) !== 0
export const anyBit = (a: Bits): boolean => {
  for (let k = 0; k < a.length; k++) if (a[k]) return true
  return false
}
// whether a has a bit that b has not
export const anyNew = (a: Bits, b: Bits): boolean => {
  for (let k = 0; k < a.length; k++) if (a[k] & ~b[k]) return true
  return false
}
// a less b, into out (out may be a)
export const minus = (a: Bits, b: Bits, out: Bits): Bits => {
  for (let k = 0; k < a.length; k++) out[k] = a[k] & ~b[k]
  return out
}
