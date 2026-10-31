// Runs the look page's bench (src/look/bench.ts, docs/plans/active/l2-detail.md) in headless Chrome and writes its
// JSON. On this machine the numbers are a proxy and pass no gate; the laptop's run (the owner's) is the measurement.
//
//   node tools/bench-look.mjs <look page URL> [out.json] [--hold <s>] [--gpu <angle backend>] [--timeout <min>]
//   A ?bench=<value> in the URL is kept (?bench=macro: the macro colour's arms; ?bench=dof: the depth of field off
//   and on; src/look/main.ts). The grass detail is the page's: Balanced by default (what players get), recorded in the
//   JSON as grassDetail; add ?grassdetail=full to compare with runs before it (bench version 10), which measured Full.
//   With ?benchtrace=1 in the URL each measured frame is recorded and the trace's enrichment table printed (below).
//     --hold     seconds measured per camera and arm (default 3; each run also takes at least 20 frames)
//     --gpu      use the machine's GPU through that ANGLE backend (e.g. metal); default $SHOT_ANGLE, else SwiftShader
//                (slow; it has the timer extension, but it times software rendering)
// Chrome runs without vsync or a frame-rate limit, so frame times are the page's own, not the display's.
//     --timeout  minutes the whole run may take (default 60)
//   node tools/bench-look.mjs --print <bench.json>   prints a saved result's tables (no run)
// Prints a table per camera and arm; exit 1 when the bench fails or reports an error.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { shoot } from './look-page.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const opt = name => {
  const i = args.indexOf(name)
  return i >= 0 ? args.splice(i, 2)[1] : null
}
const hold = opt('--hold') ?? '3'
const gpu = opt('--gpu')
const timeout = +(opt('--timeout') ?? 60)
const saved = opt('--print')
const [url, out = path.join(ROOT, 'scratch/bench.json')] = args
if (!saved && (!url || !(+hold > 0) || !(timeout > 0))) {
  console.error(
    'usage: node tools/bench-look.mjs <look page URL> [out.json] [--hold <s>] [--gpu <backend>] [--timeout <min>] | --print <bench.json>',
  )
  process.exit(2)
}
const res = saved ? JSON.parse(fs.readFileSync(saved, 'utf8')) : run()

function run() {
  const u = new URL(url)
  // keeps ?bench=macro (the macro arms)
  u.searchParams.set('bench', u.searchParams.get('bench') ?? '')
  u.searchParams.set('hold', hold)
  const steps = [
    ['wait', 1000],
    [
      'eval',
      `(async () => { const end = Date.now() + ${timeout * 60000}; while (!window.__bench && Date.now() < end) await new Promise(r => setTimeout(r, 100)); if (!window.__bench) throw new Error("no bench result after ${timeout} min (--timeout)"); return "BENCH " + JSON.stringify(window.__bench) })()`,
    ],
  ]
  let stdout
  try {
    stdout = shoot(u.href, path.join(ROOT, 'scratch'), steps, 1920, 1080, {
      frozen: false,
      env: {
        SHOT_TIMEOUT_S: String(timeout * 60 + 120),
        SHOT_ANGLE: gpu ?? process.env.SHOT_ANGLE ?? 'swiftshader',
        SHOT_CHROME_ARGS: '--disable-gpu-vsync --disable-frame-rate-limit',
      },
    })
  } catch (e) {
    console.error('bench-look:', e.message)
    process.exit(1)
  }
  const line = stdout.split('\n').find(l => l.startsWith('EVAL "BENCH '))
  if (!line) {
    console.error(`bench-look: no result in the output:\n${stdout}`)
    process.exit(1)
  }
  const res = JSON.parse(JSON.parse(line.slice(5)).slice(6))
  if (res.error) {
    console.error('bench-look: the page reported', res.error)
    process.exit(1)
  }
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, JSON.stringify(res, null, 1) + '\n')
  return res
}

const f = v => (v == null ? '   –  ' : v.toFixed(2).padStart(6))
console.log(
  `build ${res.build} · ${res.renderer} · ${res.canvas.w}×${res.canvas.h} · GPU timer ${res.gpuTimer ? 'yes' : 'no'} · textures ≈${res.textureMB} MB · refused ${res.queriesRefused}, disjoint ${res.disjoint}`,
)
console.log(
  'camera            arm      frames  frame p50  p95    max  | GPU p50: frame terrain scatter  water  other   post  fit | draws   tris',
)
for (const x of res.runs) {
  const g = k => x.gpuMs[k]?.p50
  console.log(
    `${x.cam.padEnd(18)}${x.arm.padEnd(9)}${String(x.frames).padStart(5)}  ${f(x.frameMs.p50)} ${f(x.frameMs.p95)} ${f(x.frameMs.max)} | ${f(g('frame'))} ${f(g('terrain'))} ${f(g('scatter'))} ${f(g('water'))} ${f(g('other'))} ${f(g('post'))} ${x.passesOverFrame == null ? '  – ' : x.passesOverFrame.toFixed(2)} | ${String(x.drawCalls).padStart(5)} ${String(x.triangles).padStart(7)}`,
  )
}
const unfit = res.runs.filter(x => x.passesOverFrame != null && x.passesOverFrame > 1.3).length
if (unfit) {
  console.log(
    `fit: in ${unfit} of ${res.runs.length} runs the passes add up to more than 1.3× the frame: this backend's per-pass queries are inflated; compare the GPU frame column`,
  )
}
// ?benchtrace=1: the enrichment table (src/look/bench.ts, traceSummary): per zoom and arm, for each event the share of
// the slow frames (over their run's 90th percentile) with it against the share of all frames with it; an enrichment
// well over 1 with a high slow share marks an event that comes with the slow frames
if (res.traceSummary) {
  console.log(
    `trace: ${res.runs.reduce((a, r) => a + (r.trace?.ms.length ?? 0), 0)} frames recorded${res.runs.some(r => r.trace?.lost) ? ' (some runs over the cap: frames lost)' : ''}; render targets: ${res.traceRT.join(', ') || 'none'}`,
  )
  console.log('zoom     arm      event                  all %  slow %  enrich   ms with  without')
  const rows = [...res.traceSummary].sort(
    (a, b) => a.zoom.localeCompare(b.zoom) || a.arm.localeCompare(b.arm) || b.enrichment - a.enrichment,
  )
  for (const r of rows) {
    console.log(
      `${r.zoom.padEnd(9)}${r.arm.padEnd(9)}${r.event.padEnd(22)}${(100 * r.shareAll).toFixed(1).padStart(6)} ${(100 * r.shareSlow).toFixed(1).padStart(7)} ${r.enrichment.toFixed(2).padStart(7)} ${r.msWith.toFixed(2).padStart(8)} ${r.msWithout == null ? '      –' : r.msWithout.toFixed(2).padStart(8)}`,
    )
  }
}
// each run's main-thread work outside rendering (?benchtrace=1: the page's sim tick, the placing, the uploads: battle
// threads PR 6's measure), a frame's mean and p95, and its long tasks (version 9; null: the browser reports none)
const traced = res.runs.filter(r => r.trace?.fields?.simMs)
if (traced.length || res.runs.some(r => r.longTasks !== undefined)) {
  console.log('camera            arm      off-render mean   p95 | long tasks (ms)')
  for (const r of res.runs) {
    const F = r.trace?.fields
    let off = ''
    if (F?.simMs) {
      const a = F.simMs.map((v, i) => v + F.placeMs[i] + F.tiMs[i]).sort((x, y) => x - y)
      const mean = a.reduce((x, y) => x + y, 0) / a.length
      off = `${f(mean)} ${f(a[Math.min(a.length - 1, Math.floor(0.95 * a.length))])}`
    } else off = '     –      –'
    const lt = r.longTasks == null ? '–' : `${r.longTasks.n} (${r.longTasks.ms.toFixed(0)})`
    console.log(`${r.cam.padEnd(18)}${r.arm.padEnd(9)}     ${off} | ${lt}`)
  }
}
if (!saved) console.log(`wrote ${path.relative(ROOT, out)}`)
