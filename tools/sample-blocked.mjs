// Samples the look page's blocked ground for the armies' layout (the page's __armies.blocked: the river and its banks,
// the trees, the buildings' yards, the tile's edge; src/look/main.ts) every 0.5 m over ±240 m into the test fixture
// test/fixtures/demo-map-blocked.bin.gz that test/armies.test.ts lays the demo map's armies out on: a bit a sample, row
// by row from (−240, −240), gzipped. Rerun it when the map changes.
//
//   node tools/sample-blocked.mjs <look page URL> [out.bin.gz]     the page with ?armies (any count: the blocked ground
//                                                                   is the map's), built and served (npx vite preview)
// Exit 1 when the page gives no grid.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { shoot } from './look-page.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const [url, out = path.join(ROOT, 'test/fixtures/demo-map-blocked.bin.gz')] = process.argv.slice(2)
if (!url || !new URL(url).searchParams.has('armies')) { console.error('usage: node tools/sample-blocked.mjs <look page URL with ?armies=<n>> [out.bin.gz]'); process.exit(2) }
const R = 240, S = 0.5, N = Math.round(2 * R / S) + 1
const steps = [['eval', `(async () => {
  const end = Date.now() + 600000
  while (!window.__armies && Date.now() < end) await new Promise(r => setTimeout(r, 200))
  if (!window.__armies) throw new Error('no __armies: the page has no armies')
  const b = window.__armies.blocked, N = ${N}, bits = new Uint8Array(Math.ceil(N * N / 8))
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (b(${-R} + i * ${S}, ${-R} + j * ${S})) { const k = j * N + i; bits[k >> 3] |= 1 << (k & 7) }
  let s = ''; for (let i = 0; i < bits.length; i++) s += String.fromCharCode(bits[i])
  return 'GRID ' + btoa(s)
})()`]]
let said
try { said = shoot(url, path.join(ROOT, 'scratch'), steps, 640, 360) } catch (e) { console.error('sample-blocked:', e.message); process.exit(1) }
const line = said.split('\n').find(l => l.startsWith('EVAL "GRID '))
if (!line) { console.error(`sample-blocked: no grid in the output:\n${said}`); process.exit(1) }
const bits = Buffer.from(JSON.parse(line.slice(5)).slice(5), 'base64')
if (bits.length !== Math.ceil(N * N / 8)) { console.error(`sample-blocked: ${bits.length} bytes, not ${Math.ceil(N * N / 8)}`); process.exit(1) }
fs.writeFileSync(out, gzipSync(bits, { level: 9 }))
let n = 0; for (const b of bits) for (let k = 0; k < 8; k++) n += (b >> k) & 1
console.log(`sample-blocked: ${N}² samples, ${n} blocked (${(100 * n / (N * N)).toFixed(1)} %), written to ${path.relative(ROOT, out)}`)
