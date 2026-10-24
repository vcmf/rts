// Minimal PNG read and write for the check tools (no dependencies): 8-bit RGB or RGBA, not interlaced,
// which is what Chrome's screenshots are. read() returns RGBA.
import zlib from 'node:zlib'

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

export function read(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error('not a PNG')
  let w = 0
  let h = 0
  let type = 0
  let idat = []
  for (let o = 8; o < buf.length;) {
    const len = buf.readUInt32BE(o)
    const t = buf.toString('ascii', o + 4, o + 8)
    const d = buf.subarray(o + 8, o + 8 + len)
    if (t === 'IHDR') {
      w = d.readUInt32BE(0)
      h = d.readUInt32BE(4)
      type = d[9]
      if (d[8] !== 8 || (type !== 2 && type !== 6) || d[12] !== 0) {
        throw new Error(`unsupported PNG (depth ${d[8]}, type ${type}, interlace ${d[12]})`)
      }
    } else if (t === 'IDAT') idat.push(d)
    else if (t === 'IEND') break
    o += 12 + len
  }
  const bpp = type === 6 ? 4 : 3
  const stride = w * bpp
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const px = Buffer.alloc(stride * h)
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]
    const src = y * (stride + 1) + 1
    const row = y * stride
    const up = row - stride
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[row + x - bpp] : 0
      const b = y ? px[up + x] : 0
      const c = x >= bpp && y ? px[up + x - bpp] : 0
      let p = raw[src + x]
      if (f === 1) p += a
      else if (f === 2) p += b
      else if (f === 3) p += (a + b) >> 1
      else if (f === 4) {
        const q = a + b - c
        const pa = Math.abs(q - a)
        const pb = Math.abs(q - b)
        const pc = Math.abs(q - c)
        p += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      } else if (f !== 0) throw new Error(`bad PNG filter ${f}`)
      px[row + x] = p & 255
    }
  }
  if (bpp === 4) return { w, h, data: px }
  const rgba = Buffer.alloc(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = px[i * 3]
    rgba[i * 4 + 1] = px[i * 3 + 1]
    rgba[i * 4 + 2] = px[i * 3 + 2]
    rgba[i * 4 + 3] = 255
  }
  return { w, h, data: rgba }
}

const CRC = new Int32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})
const crc = b => {
  let c = -1
  for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}
const chunk = (t, d) => {
  const l = Buffer.alloc(4)
  const c = Buffer.alloc(4)
  const td = Buffer.concat([Buffer.from(t, 'ascii'), d])
  l.writeUInt32BE(d.length)
  c.writeUInt32BE(crc(td))
  return Buffer.concat([l, td, c])
}

export function write({ w, h, data }) {
  // data: RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) data.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
