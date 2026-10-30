// The WorldCover reader's header parse (tools/worldcover.ts, docs/plans/active/k1b-forests.md): the levels of a tiled
// little-endian TIFF, their sizes and tile tables, from its first bytes.
import { describe, it, expect } from 'vitest'
import { parseCog } from '../tools/worldcover.ts'

/** A little-endian TIFF of the given levels, each a directory with its size, tile size and tile tables. */
function tiff(levels: { size: number; tile: number; offsets: number[]; counts: number[] }[]): Buffer {
  const buf = Buffer.alloc(4096)
  buf.write('II', 0, 'latin1')
  buf.writeUInt16LE(42, 2)
  let at = 8
  buf.writeUInt32LE(at, 4)
  let data = 2048
  levels.forEach((level, n) => {
    // the tile tables, out of line when longer than one value
    const table = (values: number[]) => {
      if (values.length === 1) return values[0]
      const start = data
      values.forEach((v, k) => buf.writeUInt32LE(v, start + 4 * k))
      data += 4 * values.length
      return start
    }
    const entries: [number, number, number, number][] = [
      [256, 4, 1, level.size],
      [257, 4, 1, level.size],
      [259, 3, 1, 8],
      [322, 3, 1, level.tile],
      [323, 3, 1, level.tile],
      [324, 4, level.offsets.length, table(level.offsets)],
      [325, 4, level.counts.length, table(level.counts)],
    ]
    buf.writeUInt16LE(entries.length, at)
    entries.forEach(([tag, type, count, value], k) => {
      const e = at + 2 + 12 * k
      buf.writeUInt16LE(tag, e)
      buf.writeUInt16LE(type, e + 2)
      buf.writeUInt32LE(count, e + 4)
      if (type === 3 && count === 1) buf.writeUInt16LE(value, e + 8)
      else buf.writeUInt32LE(value, e + 8)
    })
    const next = n + 1 < levels.length ? at + 2 + 12 * entries.length + 4 : 0
    buf.writeUInt32LE(next, at + 2 + 12 * entries.length)
    at = next
  })
  return buf
}

describe('the WorldCover reader', () => {
  it('reads every level of a cloud-optimised TIFF, full size first, with its tile tables', () => {
    const levels = parseCog(
      tiff([
        { size: 2048, tile: 1024, offsets: [100, 200, 300, 400], counts: [10, 20, 30, 40] },
        { size: 1024, tile: 1024, offsets: [500], counts: [50] },
      ]),
    )
    expect(levels).toEqual([
      {
        width: 2048,
        height: 2048,
        tile: 1024,
        offsets: [100, 200, 300, 400],
        counts: [10, 20, 30, 40],
        compression: 8,
      },
      { width: 1024, height: 1024, tile: 1024, offsets: [500], counts: [50], compression: 8 },
    ])
  })

  it('refuses a file that is not a little-endian TIFF, and a table past the bytes read', () => {
    expect(() => parseCog(Buffer.from('MM\u0000*'))).toThrow(/not a little-endian TIFF/)
    const cut = tiff([{ size: 2048, tile: 1024, offsets: [100, 200, 300, 400], counts: [10, 20, 30, 40] }])
    expect(() => parseCog(cut.subarray(0, 1024))).toThrow(/past the 1024 bytes read/)
  })
})
