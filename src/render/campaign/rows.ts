// The row-difference coding of the campaign map's Uint16 planes (the tiles' shape, src/render/campaign/tiles.ts; the
// fields' numbers, src/render/campaign/fields.ts; decision 0094): each value stored as its difference from the value
// `stride` before it in its row (modulo 2^16; a row's first `stride` values as they are). Smooth fields give small
// numbers, which deflate well.

/** The values as row differences: rows of `row` values, each compared with the one `stride` before it. */
export function rowDeltas(values: ArrayLike<number>, row: number, stride: number): Uint16Array {
  const out = new Uint16Array(values.length)
  for (let k = 0; k < values.length; k++) {
    const before = k % row >= stride ? values[k - stride] : 0
    out[k] = (values[k] - before) & 0xffff
  }
  return out
}

/** The values back from their row differences (rowDeltas undone, in place). */
export function rowSums(deltas: Uint16Array, row: number, stride: number): Uint16Array {
  for (let k = 0; k < deltas.length; k++) {
    if (k % row >= stride) deltas[k] = (deltas[k] + deltas[k - stride]) & 0xffff
  }
  return deltas
}
