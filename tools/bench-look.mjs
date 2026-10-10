// Runs the look page's bench (src/look/bench.ts, docs/plans/active/l2-detail.md) in headless Chrome and writes its
// JSON. On this machine the numbers are a proxy and pass no gate; the laptop's run (the owner's) is the measurement.
//
//   node tools/bench-look.mjs <look page URL> [out.json] [--hold <s>] [--gpu <angle backend>]
//     --hold   seconds measured per camera and arm (default 3)
//     --gpu    use the machine's GPU through that ANGLE backend (e.g. metal); default SwiftShader (no GPU timer)
// Prints a table per camera and arm; exit 1 when the bench fails or reports an error.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2), opt = name => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : null }
const hold = opt('--hold') ?? '3', gpu = opt('--gpu')
const [url, out = path.join(ROOT, 'scratch/bench.json')] = args
if (!url || !(+hold > 0)) { console.error('usage: node tools/bench-look.mjs <look page URL> [out.json] [--hold <s>] [--gpu <backend>]'); process.exit(2) }

const u = new URL(url); u.searchParams.set('bench', ''); u.searchParams.set('hold', hold)
const steps = [['wait', 1000],
  ['eval', '(async () => { for (let i = 0; i < 18000 && !window.__bench; i++) await new Promise(r => setTimeout(r, 100)); if (!window.__bench) throw new Error("no bench result after 30 min"); return "BENCH " + JSON.stringify(window.__bench) })()']]
const r = spawnSync('node', [path.join(ROOT, 'tools/shot.mjs'), u.href, path.join(ROOT, 'scratch'), '1920', '1080', JSON.stringify(steps)],
  { encoding: 'utf8', env: { SHOT_TIMEOUT_S: '1900', SHOT_LOAD_S: '300', ...(gpu ? { SHOT_ANGLE: gpu } : {}), ...process.env } })
const line = r.stdout.split('\n').find(l => l.startsWith('EVAL "BENCH '))
if (r.status !== 0 || !line) { console.error(`bench-look: the run failed (shot.mjs exit ${r.status}), full output:\n${r.stdout}${r.stderr}`); process.exit(1) }
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
if (unfit) console.log(`fit: in ${unfit} of ${res.runs.length} runs the passes add up to more than 1.3× the frame: this backend's per-pass queries are inflated; trust the frame column`)
console.log(`wrote ${path.relative(ROOT, out)}`)
