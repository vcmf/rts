// The ČÚZK image service's answers (tools/dem-fetch.mjs, tools/dem-import.ts): its uncompressed one-band float32
// TIFF read without a library, and the pixels without data filled from their neighbours.
/**
 * A minimal reader for the uncompressed, one-band float32 TIFF the service returns, in strips or tiles.
 * `want`: the { width, height } asked for. Returns { width, height, data } with the rows north first, as the TIFF
 * stores them.
 */
export function readTiff(buf, want) {
  // the service answers errors as JSON, even with status 200
  const magic = buf.toString('latin1', 0, 2)
  const isTiff = (magic === 'II' && buf.readUInt16LE(2) === 42) || (magic === 'MM' && buf.readUInt16BE(2) === 42)
  if (!isTiff) {
    throw new Error(`not a TIFF: ${buf.toString('utf8', 0, 300)}`)
  }
  const le = magic === 'II'
  const u16 = o => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o))
  const u32 = o => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o))
  const f32 = o => (le ? buf.readFloatLE(o) : buf.readFloatBE(o))

  // the tags: only the SHORT and LONG ones read below (ASCII, RATIONAL, DOUBLE skipped)
  const ifd = u32(4)
  const tags = {}
  for (let i = 0; i < u16(ifd); i++) {
    const e = ifd + 2 + i * 12
    const tag = u16(e)
    const type = u16(e + 2)
    const count = u32(e + 4)
    if (type !== 3 && type !== 4) {
      continue
    }
    const size = type === 3 ? 2 : 4
    const at = count * size <= 4 ? e + 8 : u32(e + 8)
    tags[tag] = Array.from({ length: count }, (_, k) => (type === 3 ? u16(at + k * 2) : u32(at + k * 4)))
  }

  const width = tags[256][0]
  const height = tags[257][0]
  const oneFloatBand =
    tags[259]?.[0] === 1 && tags[258]?.[0] === 32 && tags[339]?.[0] === 3 && (tags[277]?.[0] ?? 1) === 1
  if (width !== want.width || height !== want.height || !oneFloatBand) {
    throw new Error(
      `unexpected TIFF: ${width}×${height}, compression ${tags[259]}, bits ${tags[258]}, ` +
        `sample format ${tags[339]}, samples ${tags[277]} (want uncompressed float32, one band)`,
    )
  }

  const data = new Float32Array(width * height)
  if (tags[322]) {
    // tiles
    const tw = tags[322][0]
    const th = tags[323][0]
    const across = Math.ceil(width / tw)
    tags[324].forEach((offset, t) => {
      const x0 = (t % across) * tw
      const y0 = Math.floor(t / across) * th
      for (let y = 0; y < th; y++) {
        for (let x = 0; x < tw; x++) {
          if (x0 + x < width && y0 + y < height) {
            data[(y0 + y) * width + x0 + x] = f32(offset + (y * tw + x) * 4)
          }
        }
      }
    })
  } else {
    // strips
    const rowsPerStrip = tags[278] ? tags[278][0] : height
    tags[273].forEach((offset, s) => {
      for (let y = 0; y < rowsPerStrip && s * rowsPerStrip + y < height; y++) {
        for (let x = 0; x < width; x++) {
          data[(s * rowsPerStrip + y) * width + x] = f32(offset + (y * width + x) * 4)
        }
      }
    })
  }
  return { width, height, data }
}

/**
 * Marks the pixels without data (outside the country the service returns none) and fills them from their valid
 * neighbours, pass by pass (a lowest-height fill would cut craters). Returns the count and the valid heights' range.
 */
export function fillHoles(f, width, height) {
  const valid = v => Number.isFinite(v) && v > -100 && v < 3000
  let bad = 0
  let lo = Infinity
  let hi = -Infinity
  for (let q = 0; q < f.length; q++) {
    if (valid(f[q])) {
      lo = Math.min(lo, f[q])
      hi = Math.max(hi, f[q])
    } else {
      f[q] = NaN
      bad++
    }
  }
  if (bad > f.length * 0.05) {
    throw new Error(`${bad} of ${f.length} source pixels without data (outside the Czech Republic?)`)
  }
  for (let pass = 0, left = bad; left > 0 && pass < 64; pass++) {
    const next = f.slice()
    left = 0
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const q = y * width + x
        if (!Number.isNaN(f[q])) {
          continue
        }
        let sum = 0
        let n = 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const inside = x + dx >= 0 && x + dx < width && y + dy >= 0 && y + dy < height
            const v = f[(y + dy) * width + x + dx]
            if (inside && !Number.isNaN(v)) {
              sum += v
              n++
            }
          }
        }
        if (n) {
          next[q] = sum / n
        } else {
          left++
        }
      }
    }
    f.set(next)
  }
  return { bad, lo, hi }
}
