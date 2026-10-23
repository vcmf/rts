// The bench (docs/plans/active/l2-detail.md, L2a; the track plan's "Measuring on the min-spec laptop"): the look page
// with ?bench runs fixed cameras, records frame times, GPU time per pass, draw calls, triangles and texture memory,
// and offers the result as JSON. The owner runs it on the laptop; tools/bench-look.mjs runs it headless here.
//   ?bench            the default run; ?hold=<s> seconds measured per camera and arm (default 3); ?benchpan=1 each
//                     camera panning as it is measured; ?benchtrace=1 a record of each frame (below: timings come
//                     from untraced runs, the trace explains them)
// GPU time per pass is only as good as the browser's timer queries: passesOverFrame (the passes' medians over the
// frame's) far above 1 means the backend inflates them (ANGLE on Metal does), and only the frame time stands.
// Arms are variants of the page measured in the same session, interleaved A B B A per camera so that heat and clock
// changes fall on both equally.
import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js'
import { Constants } from '@babylonjs/core/Engines/constants.js'
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine.js'
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation.js'
import { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import type { PostProcess } from '@babylonjs/core/PostProcesses/postProcess.js'
import type { Scene } from '@babylonjs/core/scene.js'
import { EffectRenderer, type EffectWrapper } from '@babylonjs/core/Materials/effectRenderer.js'
import { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture.js'
import { GpuTimer } from './gputimer.ts'
import { TR, TRACE, TRACE_FIELDS } from './trace.ts'
import { START, zoomOf } from './post.ts'
import { D, TUNED_R } from './spec.ts'

declare const __BUILD__: string

// apply may return a promise (a rebake): it is awaited
export interface Arm {
  name: string
  apply: () => unknown
}
export interface BenchPasses {
  terrain: Mesh[]
  scatter: Mesh[]
  water: Mesh[]
  post: () => PostProcess[]
}
interface Cam {
  name: string
  alpha: number
  beta: number
  radius: number
}
export interface RunStats {
  cam: string
  arm: string
  // size: the frame drawn (the render scale: Auto lowers it at the widest zoom)
  size: [number, number]
  frames: number
  frameMs: Stat
  gpuMs: Record<string, Stat | null>
  passesOverFrame: number | null
  drawCalls: number
  triangles: number
  segments: Record<string, number>
  trace?: RunTrace
}
/** a run's frames (?benchtrace=1): each frame's interval (ms), each trace field's value, the render targets drawn
 *  (a bit each, traceRT's order); lost: frames past TRACE_MAX, not kept */
interface RunTrace {
  ms: number[]
  fields: Record<string, number[]>
  rt: number[]
  lost: number
}
function traceOf(ms: Float64Array, c: Float64Array, rt: Int32Array, n: number, lost: number): RunTrace {
  const r2 = (v: number) => Math.round(v * 100) / 100
  const fields: Record<string, number[]> = {}
  TRACE_FIELDS.forEach((f, i) => {
    fields[f] = Array.from({ length: n }, (_, k) => r2(c[k * NF + i]))
  })
  return { ms: Array.from(ms.subarray(0, n), r2), fields, rt: Array.from(rt.subarray(0, n)), lost }
}
/** the enrichment table: by zoom (the cameras' close, default, wide) and arm, the frames over their own run's 90th
 *  percentile ("slow"); for each event (a trace field over 0, a render target drawn), the share of slow frames with
 *  it against the share of all frames with it, their ratio (over 1: the event comes with the slow frames), and the
 *  mean interval of the frames with it and without */
function traceSummary(runs: RunStats[], rtNames: string[]): object[] {
  const out: object[] = []
  const groups = new Map<string, RunStats[]>()
  for (const r of runs) {
    if (!r.trace) continue
    const k = `${r.cam.split('.')[0]}|${r.arm}`
    groups.set(k, [...(groups.get(k) ?? []), r])
  }
  const events: [string, (t: RunTrace, k: number) => boolean][] = [
    ...TRACE_FIELDS.filter(
      f =>
        f !== 'activeMeshes' &&
        f !== 'draws' &&
        !f.endsWith('Ms') &&
        f !== 'tiKB' &&
        f !== 'smTris' &&
        f !== 'smCasters',
    ).map(f => [f, (t: RunTrace, k: number) => t.fields[f][k] > 0] as [string, (t: RunTrace, k: number) => boolean]),
    ...rtNames.map(
      (n, b) =>
        [`rt:${n}`, (t: RunTrace, k: number) => (t.rt[k] & (1 << b)) !== 0] as [
          string,
          (t: RunTrace, k: number) => boolean,
        ],
    ),
  ]
  for (const [g, rs] of groups) {
    let all = 0
    let slow = 0
    const cnt = new Map<string, { all: number; slow: number; msWith: number; msWithout: number }>()
    for (const [e] of events) cnt.set(e, { all: 0, slow: 0, msWith: 0, msWithout: 0 })
    for (const r of rs) {
      const t = r.trace!
      const p90 = q(t.ms, 0.9)
      for (let k = 0; k < t.ms.length; k++) {
        const isSlow = t.ms[k] > p90
        all++
        if (isSlow) slow++
        for (const [e, has] of events) {
          const c = cnt.get(e)!
          if (has(t, k)) {
            c.all++
            c.msWith += t.ms[k]
            if (isSlow) c.slow++
          } else c.msWithout += t.ms[k]
        }
      }
    }
    const [zoom, arm] = g.split('|')
    for (const [e, c] of cnt) {
      if (!c.all) continue
      const sa = c.all / all
      const ss = slow ? c.slow / slow : 0
      out.push({
        zoom,
        arm,
        event: e,
        frames: all,
        slowFrames: slow,
        shareAll: +sa.toFixed(3),
        shareSlow: +ss.toFixed(3),
        enrichment: +(ss / sa).toFixed(2),
        msWith: +(c.msWith / c.all).toFixed(2),
        msWithout: all > c.all ? +(c.msWithout / (all - c.all)).toFixed(2) : null,
      })
    }
  }
  return out
}
interface Stat {
  p50: number
  p95: number
  max: number
  n: number
}

// a quantile (the bench's and the page's frame readout, src/look/main.ts)
export const q = (a: ArrayLike<number>, p: number): number => {
  const s = Array.from(a).sort((x, y) => x - y)
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN
}
const MIN_FRAMES = 20
const stat = (a: number[]): Stat => ({
  p50: +q(a, 0.5).toFixed(3),
  p95: +q(a, 0.95).toFixed(3),
  max: +Math.max(...a).toFixed(3),
  n: a.length,
})

// the close, default and widest zoom (the widest at the steepest pitch, which shows the most world), each at the
// yaw limits and the default yaw (decision 0010); close at TUNED_R (45 m), the closest zoom the bench's history
// measured (the closer zoom, decision 0051: ?benchclosest=1 adds the closest, rMin)
const closestParam = new URLSearchParams(location.search).get('benchclosest')
if (closestParam !== null && closestParam !== '0' && closestParam !== '1') {
  throw new Error(`?benchclosest must be 0 or 1, not ${closestParam}`)
}
function cameras(): Cam[] {
  const c = D.spec.camera
  const out: Cam[] = []
  const zooms: [string, number, number][] = [
    ['close', START.beta, TUNED_R],
    ['default', START.beta, START.radius],
    ['wide', c.betaMax, c.rMax],
  ]
  if (closestParam === '1') zooms.unshift(['closest', START.beta, c.rMin])
  for (const [z, beta, radius] of zooms) {
    for (const [y, da] of [
      ['yaw-45', -c.yawRange],
      ['yaw0', 0],
      ['yaw+45', c.yawRange],
    ] as const) {
      out.push({ name: `${z}.${y}`, alpha: c.yaw0 + da, beta, radius })
    }
  }
  return out
}

// estimated GPU texture memory: every texture the engine holds, size × bytes per texel × mips × samples; render
// target depth buffers are not in the cache, so this is a floor
function textureMB(engine: AbstractEngine): number {
  const ch = (f: number) =>
    f === Constants.TEXTUREFORMAT_R
      ? 1
      : f === Constants.TEXTUREFORMAT_RG
        ? 2
        : f === Constants.TEXTUREFORMAT_RGB
          ? 3
          : 4
  const by = (t: number) => (t === Constants.TEXTURETYPE_FLOAT ? 4 : t === Constants.TEXTURETYPE_HALF_FLOAT ? 2 : 1)
  let b = 0
  for (const t of engine.getLoadedTexturesCache()) {
    b +=
      t.width *
      t.height *
      Math.max(1, t.depth) *
      (t.isCube ? 6 : 1) *
      ch(t.format) *
      by(t.type) *
      (t.generateMipMaps ? 4 / 3 : 1) *
      Math.max(1, t.samples)
  }
  return +(b / 2 ** 20).toFixed(1)
}

function rendererName(engine: AbstractEngine): string {
  const gl = (engine as unknown as { _gl?: WebGL2RenderingContext })._gl
  if (!gl) return 'unknown'
  const ext = gl.getExtension('WEBGL_debug_renderer_info')
  return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))
}

// focus: the point the cameras orbit (the camera's start by default; the forest bench's ?benchat)
// ?passes=0: whole frames only, no pass timers (their queries split the Metal render pass; the frames between were
// measured the same with them and without, 2026-10-20: docs/plans/done/headroom.md)
const passesParam = new URLSearchParams(location.search).get('passes')
if (passesParam !== null && passesParam !== '0') throw new Error(`?passes must be 0, not ${passesParam}`)
const WHOLE_ONLY = passesParam === '0'
// ?benchpan=1: each camera pans while it is measured, its focus sliding along the view's right and back, PAN_A m
// either side at PAN_V m/s (a player scrolling: the figures' shadow map is drawn again as the view moves,
// docs/plans/active/armies-demo.md batch B), from the warm-up frames through the hold
const panParam = new URLSearchParams(location.search).get('benchpan')
if (panParam !== null && panParam !== '0' && panParam !== '1') {
  throw new Error(`?benchpan must be 0 or 1, not ${panParam}`)
}
const PAN = panParam === '1'
const PAN_A = 20
const PAN_V = 8
// ?benchtrace=1: a record of every measured frame (its interval and the trace's counters, src/look/trace.ts: what was
// drawn, written, uploaded, compiled in it) in each run, and a summary over the runs: for the frames over their run's
// 90th percentile, the share with each event against its share of all frames (traceSummary). Off: nothing installed.
// Take the timings from untraced runs: the trace explains them (what the slow frames did, cpuMs a frame's JavaScript),
// it is not where they are measured
const traceParam = new URLSearchParams(location.search).get('benchtrace')
if (traceParam !== null && traceParam !== '0' && traceParam !== '1') {
  throw new Error(`?benchtrace must be 0 or 1, not ${traceParam}`)
}
const TRACING = traceParam === '1'
// frames recorded a run at most (the rest counted, not kept)
const TRACE_MAX = 4096
const NF = TRACE_FIELDS.length
export async function runBench(
  scene: Scene,
  camera: ArcRotateCamera,
  passes: BenchPasses,
  arms: Arm[],
  holdS: number,
  focus: { x: number; z: number } = { x: START.x, z: START.z },
): Promise<object> {
  const engine = scene.getEngine()
  const gl = (engine as unknown as { _gl: WebGL2RenderingContext })._gl
  const timer = new GpuTimer(gl)
  const inst = new SceneInstrumentation(scene)
  let timing = false
  let passFrame = false
  let frameNo = 0
  let lastT = 0
  let passFrames = 0
  const frameMs: number[] = []
  const draws: number[] = []
  const tris: number[] = []
  const timed = new Map<string, number>()
  // a pass is timed as segments of consecutive draws (one query per run of draws of the same pass, not one per mesh:
  // per-mesh queries summed to 11–30× the frame on ANGLE Metal, measured in L2a), in the camera's own pass only,
  // never in a bake.
  // Every mesh is hooked, so a draw outside the named passes ends the segment before it ('other'). A segment stays
  // open until the next draw of another pass: GPU work between draws (a clear, a target switch) is charged to it
  let open: string | null = null
  const undo: (() => void)[] = [] // every observer the bench adds, removed when it ends
  // the trace: hooks on what Babylon does in a frame (the render targets by name, the effect-renderer bakes, the shader
  // compiles), the records preallocated a run. Cheap by construction: no prototype of a class the render loop calls
  // per mesh is patched (the thin-instance uploads are counted where src/look/units.ts makes them), each render target
  // and effect keeps its bit on itself once named (no lookup a draw), the counters are indexed by number (trace.ts)
  const rtNames: string[] = []
  const recMs = new Float64Array(TRACE_MAX)
  const recC = new Float64Array(TRACE_MAX * NF)
  const recRt = new Int32Array(TRACE_MAX)
  let recN = 0
  let recLost = 0
  let cpu0 = 0
  type Marked = { __trBit?: number }
  const bitOf = (o: Marked, name: string): number => {
    if (o.__trBit === undefined) {
      o.__trBit = rtNames.length < 31 ? rtNames.length : -1
      if (o.__trBit >= 0) rtNames.push(name)
    }
    return o.__trBit
  }
  if (TRACING) {
    TRACE.on = true
    undo.push(() => {
      TRACE.on = false
    })
    const proto = RenderTargetTexture.prototype
    const render = proto.render
    proto.render = function (this: RenderTargetTexture & Marked, a?: boolean, b?: boolean) {
      const t = performance.now()
      const bit = this.__trBit ?? bitOf(this, this.name)
      if (bit >= 0) TRACE.rtMask |= 1 << bit
      render.call(this, a, b)
      TRACE.c[TR.rt]++
      TRACE.c[TR.rtMs] += performance.now() - t
    }
    undo.push(() => {
      proto.render = render
    })
    // the bakes drawn by an effect renderer, not a render target (the macro colour's near bake, combNear; the
    // buildings' light): marked 'fx:<the effect's name>' at each draw (the bit its last applyEffectWrapper set; the
    // draw's time)
    const ep = EffectRenderer.prototype
    const apply = ep.applyEffectWrapper
    const draw = ep.draw
    let fxBit = -1
    ep.applyEffectWrapper = function (this: EffectRenderer, w: EffectWrapper & Marked, d?: boolean, st?: boolean) {
      fxBit = w.__trBit ?? bitOf(w, `fx:${w.name}`)
      apply.call(this, w, d, st)
    }
    ep.draw = function (this: EffectRenderer) {
      const t = performance.now()
      if (fxBit >= 0) TRACE.rtMask |= 1 << fxBit
      draw.call(this)
      TRACE.c[TR.rt]++
      TRACE.c[TR.rtMs] += performance.now() - t
    }
    undo.push(() => {
      ep.applyEffectWrapper = apply
      ep.draw = draw
    })
    const eng = engine as unknown as { _createShaderProgram: (...a: unknown[]) => unknown }
    const compile = eng._createShaderProgram
    eng._createShaderProgram = function (this: unknown, a: unknown, b: unknown, c: unknown, d: unknown, e: unknown) {
      TRACE.c[TR.compiles]++
      return compile.call(this, a, b, c, d, e)
    }
    undo.push(() => {
      eng._createShaderProgram = compile
    })
  }
  const seg = (label: string | null) => {
    if (open === label) return
    if (open) timer.end(open)
    open = label
    if (label) {
      timer.begin(label)
      timed.set(label, (timed.get(label) ?? 0) + 1)
    }
  }
  const named = new Map<Mesh, string>()
  for (const m of passes.terrain) named.set(m, 'terrain')
  for (const m of passes.scatter) named.set(m, 'scatter')
  for (const m of passes.water) named.set(m, 'water')
  const hook = (m: Mesh) => {
    const o = m.onBeforeRenderObservable.add(() => {
      if (timing && passFrame && engine.currentRenderPassId === camera.renderPassId) seg(named.get(m) ?? 'other')
    })
    undo.push(() => m.onBeforeRenderObservable.remove(o))
  }
  for (const m of scene.meshes) if (m instanceof Mesh) hook(m)
  const added = scene.onNewMeshAddedObservable.add(m => {
    if (m instanceof Mesh) hook(m)
  })
  undo.push(() => scene.onNewMeshAddedObservable.remove(added))
  // the finishing passes are rebuilt by Post.build (an arm may toggle depth of field): hooked again whenever they
  // change
  const hookedPosts = new Set<PostProcess>()
  const hookPosts = () => {
    for (const p of passes.post()) {
      if (hookedPosts.has(p)) continue
      hookedPosts.add(p)
      const a = p.onApplyObservable.add(() => {
        if (timing && passFrame) seg('post')
      })
      const b = p.onAfterRenderObservable.add(() => {
        if (timing && passFrame) seg(null)
      })
      undo.push(() => {
        p.onApplyObservable.remove(a)
        p.onAfterRenderObservable.remove(b)
      })
    }
  }
  hookPosts()
  // alternate frames: the passes on one, the whole frame on the next (queries cannot nest). Frame times come from the
  // whole-frame frames only: the pass frames carry more queries, which cost time on some backends
  const begin = engine.onBeginFrameObservable.add(() => {
    // passFrame: the frame that just ended
    const t = performance.now()
    if (timing && lastT && !passFrame) frameMs.push(t - lastT)
    // (the trace: the counters of the frame that just ended, recorded with its interval, then cleared)
    if (TRACING) {
      if (timing && lastT && !passFrame) {
        if (recN < TRACE_MAX) {
          recMs[recN] = t - lastT
          recC.set(TRACE.c, recN * NF)
          recRt[recN] = TRACE.rtMask
          recN++
        } else recLost++
      }
      TRACE.c.fill(0)
      TRACE.rtMask = 0
      cpu0 = performance.now()
    }
    lastT = t
    timer.poll()
    timer.newFrame()
    frameNo++
    hookPosts()
    passFrame = timer.available && frameNo % 2 === 0 && !WHOLE_ONLY // without a timer every frame is a whole frame
    if (timing && !passFrame) timer.begin('frame')
    if (timing && passFrame) passFrames++
  })
  const end = engine.onEndFrameObservable.add(() => {
    seg(null)
    if (timing && !passFrame) timer.end('frame')
    if (timing) {
      draws.push(inst.drawCallsCounter.current)
      tris.push(scene.getActiveIndices() / 3)
    }
    if (TRACING) {
      TRACE.c[TR.activeMeshes] = scene.getActiveMeshes().length
      TRACE.c[TR.draws] = inst.drawCallsCounter.current
      TRACE.c[TR.cpuMs] = performance.now() - cpu0
    }
  })
  undo.push(() => {
    engine.onBeginFrameObservable.remove(begin)
    engine.onEndFrameObservable.remove(end)
  })
  // a hidden tab stops rendering: a run across it would hold a frame of several seconds, so that run is measured again
  let hidden = false
  const onVis = () => {
    if (document.hidden) hidden = true
  }
  document.addEventListener('visibilitychange', onVis)
  undo.push(() => document.removeEventListener('visibilitychange', onVis))
  const frames = (n: number) =>
    new Promise<void>(r => {
      let k = 0
      const o = engine.onEndFrameObservable.add(() => {
        if (++k >= n) {
          engine.onEndFrameObservable.remove(o)
          r()
        }
      })
    })
  const seconds = (s: number) => new Promise<void>(r => setTimeout(r, s * 1000))

  // the scene's frame: the finishing chain's first target (under the upscale smaller than the canvas), or the canvas
  const sceneSize = (): [number, number] => {
    const p = passes.post()[0]
    return p ? [p.width, p.height] : [engine.getRenderWidth(true), engine.getRenderHeight(true)]
  }
  // the page's frame before any camera (a wide one draws smaller at Auto)
  const canvas0 = [engine.getRenderWidth(true), engine.getRenderHeight(true)]
  const runs: RunStats[] = []
  const cams = cameras()
  try {
    await seconds(2) // shaders compiled, first frames out of the way
    for (const cam of cams) {
      camera.alpha = cam.alpha
      camera.beta = cam.beta
      camera.radius = cam.radius
      zoomOf(camera).set(cam.radius)
      camera.target.set(focus.x, D.spec.camera.focusY, focus.z)
      // (panning: a triangle wave along the view's right, the arc camera's alpha + π/2 on the ground)
      const ra = cam.alpha + Math.PI / 2
      const rx = Math.cos(ra)
      const rz = Math.sin(ra)
      const pt0 = performance.now()
      const pan = PAN
        ? scene.onBeforeRenderObservable.add(() => {
            const u = ((((performance.now() - pt0) / 1000) * PAN_V) / (4 * PAN_A)) % 1
            const o = PAN_A * (u < 0.25 ? 4 * u : u < 0.75 ? 2 - 4 * u : 4 * u - 4)
            camera.target.set(focus.x + rx * o, D.spec.camera.focusY, focus.z + rz * o)
          })
        : null
      if (pan) undo.push(() => scene.onBeforeRenderObservable.remove(pan))
      for (const arm of [...arms, ...[...arms].reverse()]) {
        await arm.apply()
        await scene.whenReadyAsync()
        for (let tries = 0; ; tries++) {
          await frames(10)
          // (the closest zooms are held out over high ground, decision 0051: a camera there would measure another
          // radius)
          if (Math.abs(camera.radius - cam.radius) > 1e-6) {
            throw new Error(
              `bench camera ${cam.name}: the zoom is held out to ${camera.radius.toFixed(2)} m over high ground, not ${cam.radius} m (decision 0051): choose another ?benchat`,
            )
          }
          timer.reset()
          frameMs.length = draws.length = tris.length = 0
          recN = recLost = 0
          timed.clear()
          lastT = 0
          passFrames = 0
          hidden = document.hidden
          // the hold, and at least MIN_FRAMES frames (a software renderer takes seconds a frame)
          const t0 = performance.now()
          timing = true
          while (performance.now() - t0 < holdS * 1000 || frameMs.length < MIN_FRAMES) await frames(1)
          timing = false
          if (!hidden) break
          if (tries >= 3) {
            throw new Error(
              'the page was hidden in 4 tries of one run (another tab or a minimised window): keep the tab in front',
            )
          }
        }
        await frames(6) // late query results
        const gpuMs: Record<string, Stat | null> = {}
        for (const k of ['frame', 'terrain', 'scatter', 'water', 'other', 'post']) {
          const a = timer.results.get(k)
          gpuMs[k] = timer.available && a?.length ? stat(a) : null
        }
        const nPass = Math.max(1, passFrames)
        const segments: Record<string, number> = {}
        for (const [k, v] of timed) segments[k] = +(v / nPass).toFixed(1)
        // the passes' medians should fit in the frame's: when they do not, the backend's queries are not trustworthy
        const sum = ['terrain', 'scatter', 'water', 'other', 'post'].reduce((a, k) => a + (gpuMs[k]?.p50 ?? 0), 0)
        const passesFit = gpuMs.frame && !WHOLE_ONLY ? +(sum / gpuMs.frame.p50).toFixed(2) : null
        const trace = TRACING ? traceOf(recMs, recC, recRt, recN, recLost) : undefined
        runs.push({
          trace,
          cam: cam.name + (PAN ? '+pan' : ''),
          arm: arm.name,
          size: sceneSize(),
          frames: frameMs.length,
          frameMs: stat(frameMs),
          gpuMs,
          passesOverFrame: passesFit,
          drawCalls: Math.round(q(draws, 0.5)),
          triangles: Math.round(q(tris, 0.5)),
          segments,
        })
      }
      if (pan) scene.onBeforeRenderObservable.remove(pan)
    }
  } finally {
    timing = false
    seg(null)
    for (const u of undo) u()
    inst.dispose()
  }
  const r = engine.getRenderingCanvas()
  return {
    tool: 'look-bench',
    // 8: trace (?benchtrace=1: each run's frames, traceSummary); 7: pan (?benchpan=1: each camera pans as it is
    // measured); 6: each run's size is the scene's (the finishing chain's first target: smaller than the canvas under
    // the upscale, decision 0045); 5: wholeOnly (?passes=0: no pass timers); 4: each run's frame size (the render
    // scale: Auto lowers it at the widest zoom); 3: the cameras' focus recorded (?benchat); a version-2 file orbits the
    // start
    version: 8,
    build: __BUILD__,
    date: new Date().toISOString(),
    userAgent: navigator.userAgent,
    renderer: rendererName(engine),
    canvas: { w: canvas0[0], h: canvas0[1], cssW: r?.clientWidth, cssH: r?.clientHeight, dpr: devicePixelRatio },
    ...(TRACING ? { traceFields: TRACE_FIELDS, traceRT: rtNames, traceSummary: traceSummary(runs, rtNames) } : {}),
    gpuTimer: timer.available,
    wholeOnly: WHOLE_ONLY,
    holdS,
    focus,
    pan: PAN ? { metres: PAN_A, mPerS: PAN_V } : null,
    arms: arms.map(a => a.name),
    textureMB: textureMB(engine),
    queriesRefused: timer.refused,
    disjoint: timer.disjoint,
    note: WHOLE_ONLY
      ? 'whole frames only (?passes=0): the pass fields are null by design'
      : timer.available
        ? 'GPU times from EXT_disjoint_timer_query_webgl2'
        : 'no GPU timer on this browser: GPU fields are null',
    runs,
  }
}

// the result on the page, with a link to save it
export function showBench(result: object): void {
  const json = JSON.stringify(result, null, 1)
  const el = document.createElement('div')
  el.style.cssText =
    'position:fixed;inset:24px;overflow:auto;background:rgba(12,13,15,.92);color:#eceae4;font:11px ui-monospace,Menlo,monospace;padding:16px;border-radius:10px;z-index:9'
  const a = document.createElement('a')
  const r = result as { build: string; date: string }
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  a.download = `l2-${r.date.slice(0, 10)}-${r.build}.json`
  a.textContent = `Save ${a.download}`
  a.style.cssText = 'color:#d9a35b;font-size:13px'
  const pre = document.createElement('pre')
  pre.textContent = json
  el.append(a, pre)
  document.body.append(el)
}
