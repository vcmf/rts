// The WorldCover reader's header parse (tools/worldcover.ts, docs/plans/active/k1b-forests.md): the levels of a tiled
// little-endian TIFF, their sizes and tile tables, from its first bytes.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { chooseLevel, fileName, parseCog, pixelOf, range, type CogLevel, type Fetch } from '../tools/worldcover.ts'

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
      [258, 3, 1, 8],
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

  it('refuses a file that is not a little-endian TIFF', () => {
    expect(() => parseCog(Buffer.from('MM\u0000*'))).toThrow(/not a little-endian TIFF/)
  })

  it('refuses a directory chain that loops back on itself', () => {
    const looped = tiff([{ size: 1024, tile: 1024, offsets: [500], counts: [50] }])
    // the first directory's next-directory pointer back to itself
    const entries = looped.readUInt16LE(8)
    looped.writeUInt32LE(8, 8 + 2 + 12 * entries)
    expect(() => parseCog(looped)).toThrow(/loops back/)
  })

  it('refuses a level it cannot decode: a predictor', () => {
    const predicted = tiff([{ size: 1024, tile: 1024, offsets: [500], counts: [50] }])
    // the BitsPerSample entry (the third) turned into a Predictor of 2
    const e = 8 + 2 + 12 * 2
    predicted.writeUInt16LE(317, e)
    predicted.writeUInt16LE(2, e + 8)
    expect(() => parseCog(predicted)).toThrow(/predictor 2/)
  })

  it('refuses a table past the bytes read', () => {
    const cut = tiff([{ size: 2048, tile: 1024, offsets: [100, 200, 300, 400], counts: [10, 20, 30, 40] }])
    expect(() => parseCog(cut.subarray(0, 1024))).toThrow(/past the 1024 bytes read/)
  })

  it('names the 3° files by their south-west corner', () => {
    expect(fileName(45, 9)).toBe('ESA_WorldCover_10m_2021_v200_N45E009_Map.tif')
    expect(fileName(-3, -60)).toBe('ESA_WorldCover_10m_2021_v200_S03W060_Map.tif')
  })

  it('reads the smallest level at least as wide as asked, the full size if none is', () => {
    const level = (width: number): CogLevel => ({
      width,
      height: width,
      tile: 1024,
      offsets: [],
      counts: [],
      compression: 8,
    })
    const levels = [36000, 18000, 9000, 4500, 2250].map(level)
    expect(chooseLevel(levels, 4500).width).toBe(4500)
    expect(chooseLevel(levels, 5000).width).toBe(9000)
    expect(chooseLevel(levels, 50000).width).toBe(36000)
  })

  it('maps a place to its pixel, the north row first', () => {
    // a sheet of 300 pixels for 3°: 0.01° a pixel
    expect(pixelOf(45, 9, 300, 47.995, 9.005)).toBe(0)
    expect(pixelOf(45, 9, 300, 45.005, 11.995)).toBe(299 * 300 + 299)
    // column 150, row 149
    expect(pixelOf(45, 9, 300, 46.505, 10.505)).toBe(149 * 300 + 150)
  })
})

describe('the WorldCover ranges', () => {
  /** A fetch that answers with this status, these bytes and this Content-Range, and counts its calls. */
  const answer = (status: number, bytes: number, contentRange?: string) => {
    const calls = { n: 0 }
    const get: Fetch = async () => {
      calls.n++
      const headers = contentRange ? { 'content-range': contentRange } : undefined
      return new Response(status === 404 ? null : new Uint8Array(bytes), { status, headers })
    }
    return { get, calls }
  }
  const scratch = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'worldcover-')), 'r.bin')

  it('keeps a partial answer of the length asked, and reads it back from the cache', async () => {
    const file = scratch()
    const { get, calls } = answer(206, 100, 'bytes 0-99/5000')
    expect((await range('u', file, 0, 100, get))!.length).toBe(100)
    expect((await range('u', file, 0, 100, get))!.length).toBe(100)
    expect(calls.n).toBe(1)
  })

  it('refuses a whole file answered to a range, and caches nothing', async () => {
    const file = scratch()
    const { get } = answer(200, 5000)
    await expect(range('u', file, 0, 100, get)).rejects.toThrow(/not a partial answer/)
    expect(fs.existsSync(file)).toBe(false)
  })

  it('refuses a cut answer, and caches nothing', async () => {
    const file = scratch()
    const { get } = answer(206, 60, 'bytes 0-99/5000')
    await expect(range('u', file, 0, 100, get)).rejects.toThrow(/60 bytes for a range of 100/)
    expect(fs.existsSync(file)).toBe(false)
  })

  it('fetches again a cached range of another length', async () => {
    const file = scratch()
    fs.writeFileSync(file, Buffer.alloc(5000))
    const { get, calls } = answer(206, 100, 'bytes 0-99/5000')
    expect((await range('u', file, 0, 100, get))!.length).toBe(100)
    expect(calls.n).toBe(1)
  })

  it('accepts the rest of a file shorter than the range', async () => {
    const { get } = answer(206, 40, 'bytes 0-39/40')
    expect((await range('u', scratch(), 0, 100, get))!.length).toBe(40)
  })

  it('answers no file for a 404 (open sea)', async () => {
    const { get } = answer(404, 0)
    expect(await range('u', scratch(), 0, 100, get)).toBeNull()
  })
})
