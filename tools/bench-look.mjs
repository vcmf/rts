// Runs the look page's bench (src/look/bench.ts, docs/plans/active/l2-detail.md) in headless Chrome and writes its
// JSON. On this machine the numbers are a proxy and pass no gate; the laptop's run (the owner's) is the measurement.
//
//   node tools/bench-look.mjs <look page URL> [out.json] [--hold <s>] [--gpu <angle backend>] [--timeout <min>]
//   A ?bench=<value> in the URL is kept (?bench=macro: the macro colour's arms; ?bench=dof: the depth of field off and on; src/look/main.ts).
//     --hold     seconds measured per camera and arm (default 3; each run also takes at least 20 frames)
//     --gpu      use the machine's GPU through that ANGLE backend (e.g. metal); default $SHOT_ANGLE, else SwiftShader
//                (slow; it has the timer extension, but it times software rendering)
// Chrome runs without vsync or a frame-rate limit, so frame times are the page's own, not the display's.
//     --timeout  minutes the whole run may take (default 60)
// Prints a table per camera and arm; exit 1 when the bench fails or reports an error.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { shoot } from './look-page.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2), opt = name => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : null }
const hold = opt('--hold') ?? '3', gpu = opt('--gpu'), timeout = +(opt('--timeout') ?? 60)
const [url, out = path.join(ROOT, 'scratch/bench.json')] = args
if (!url || !(+hold > 0) || !(timeout > 0)) { console.error('usage: node tools/bench-look.mjs <look page URL> [out.json] [--hold <s>] [--gpu <backend>] [--timeout <min>]'); process.exit(2) }

const u = new URL(url); u.searchParams.set('bench', u.searchParams.get('bench') ?? ''); u.searchParams.set('hold', hold)   // keeps ?bench=macro (the macro arms)
const steps = [['wait', 1000],
  ['eval', `(async () => { const end = Date.now() + ${timeout * 60000}; while (!window.__bench && Date.now() < end) await new Promise(r => setTimeout(r, 100)); if (!window.__bench) throw new Error("no bench result after ${timeout} min (--timeout)"); return "BENCH " + JSON.stringify(window.__bench) })()`]]
let stdout
try { stdout = shoot(u.href, path.join(ROOT, 'scratch'), steps, 1920, 1080, { frozen: false, env: { SHOT_TIMEOUT_S: String(timeout * 60 + 120), SHOT_ANGLE: gpu ?? process.env.SHOT_ANGLE ?? 'swiftshader', SHOT_CHROME_ARGS: '--disable-gpu-vsync --disable-frame-rate-limit' } }) }
catch (e) { console.error('bench-look:', e.message); process.exit(1) }
const line = stdout.split('\n').find(l => l.startsWith('EVAL "BENCH '))
if (!line) { console.error(`bench-look: no result in the output:\n${stdout}`); process.exit(1) }
const res = JSON.parse(JSON.parse(line.slice(5)).slice(6))
if (res.error) { console.error('bench-look: the page reported', res.error); process.exit(1) }
fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(res, null, 1) + '\n')

const f = v => v == null ? '   –  ' : v.toFixed(2).padStart(6)
console.log(`build ${res.build} · ${res.renderer} · ${res.canvas.w}×${res.canvas.h} · GPU timer ${res.gpuTimer ? 'yes' : 'no'} · textures ≈${res.textureMB} MB · refused ${res.queriesRefused}, disjoint ${res.disjoint}`)
console.log('camera            arm      frames  frame p50  p95    max  | GPU p50: frame terrain scatter  water  other   post  fit | draws   tris')
for (const x of res.runs) {
  const g = k => x.gpuMs[k]?.p50
  console.log(`${x.cam.padEnd(18)}${x.arm.padEnd(9)}${String(x.frames).padStart(5)}  ${f(x.frameMs.p50)} ${f(x.frameMs.p95)} ${f(x.frameMs.max)} | ${f(g('frame'))} ${f(g('terrain'))} ${f(g('scatter'))} ${f(g('water'))} ${f(g('other'))} ${f(g('post'))} ${x.passesOverFrame == null ? '  – ' : x.passesOverFrame.toFixed(2)} | ${String(x.drawCalls).padStart(5)} ${String(x.triangles).padStart(7)}`)
}
const unfit = res.runs.filter(x => x.passesOverFrame != null && x.passesOverFrame > 1.3).length
if (unfit) console.log(`fit: in ${unfit} of ${res.runs.length} runs the passes add up to more than 1.3× the frame: this backend's per-pass queries are inflated; compare the GPU frame column`)
console.log(`wrote ${path.relative(ROOT, out)}`)
