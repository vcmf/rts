// The bench (docs/plans/active/l2-detail.md, L2a; the track plan's "Measuring on the min-spec laptop"): the look page
// with ?bench runs fixed cameras, records frame times, GPU time per pass, draw calls, triangles and texture memory,
// and offers the result as JSON. The owner runs it on the laptop; tools/bench-look.mjs runs it headless here.
//   ?bench            the default run; ?hold=<s> seconds measured per camera and arm (default 3)
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
import { GpuTimer } from './gputimer.ts'
import { START } from './post.ts'
import { D } from './spec.ts'

declare const __BUILD__: string

export interface Arm { name: string; apply: () => unknown }   // apply may return a promise (a rebake): it is awaited
export interface BenchPasses { terrain: Mesh[]; scatter: Mesh[]; water: Mesh[]; post: () => PostProcess[] }
interface Cam { name: string; alpha: number; beta: number; radius: number }
export interface RunStats {
  cam: string; arm: string; size: [number, number]; frames: number   // size: the frame drawn (the render scale: Auto lowers it at the widest zoom)
  frameMs: Stat; gpuMs: Record<string, Stat | null>; passesOverFrame: number | null; drawCalls: number; triangles: number; segments: Record<string, number>
}
interface Stat { p50: number; p95: number; max: number; n: number }

// a quantile (the bench's and the page's frame readout, src/look/main.ts)
export const q = (a: ArrayLike<number>, p: number): number => { const s = Array.from(a).sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN }
const MIN_FRAMES = 20
const stat = (a: number[]): Stat => ({ p50: +q(a, 0.5).toFixed(3), p95: +q(a, 0.95).toFixed(3), max: +Math.max(...a).toFixed(3), n: a.length })

// the closest, default and widest zoom (the widest at the steepest pitch, which shows the most world), each at the
// yaw limits and the default yaw (decision 0010)
function cameras(): Cam[] {
  const c = D.spec.camera, out: Cam[] = []
  for (const [z, beta, radius] of [['close', START.beta, c.rMin], ['default', START.beta, START.radius], ['wide', c.betaMax, c.rMax]] as const)
    for (const [y, da] of [['yaw-45', -c.yawRange], ['yaw0', 0], ['yaw+45', c.yawRange]] as const) out.push({ name: `${z}.${y}`, alpha: c.yaw0 + da, beta, radius })
  return out
}

// estimated GPU texture memory: every texture the engine holds, size × bytes per texel × mips × samples; render
// target depth buffers are not in the cache, so this is a floor
function textureMB(engine: AbstractEngine): number {
  const ch = (f: number) => f === Constants.TEXTUREFORMAT_R ? 1 : f === Constants.TEXTUREFORMAT_RG ? 2 : f === Constants.TEXTUREFORMAT_RGB ? 3 : 4
  const by = (t: number) => t === Constants.TEXTURETYPE_FLOAT ? 4 : t === Constants.TEXTURETYPE_HALF_FLOAT ? 2 : 1
  let b = 0
  for (const t of engine.getLoadedTexturesCache()) b += t.width * t.height * Math.max(1, t.depth) * (t.isCube ? 6 : 1) * ch(t.format) * by(t.type) * (t.generateMipMaps ? 4 / 3 : 1) * Math.max(1, t.samples)
  return +(b / 2 ** 20).toFixed(1)
}

function rendererName(engine: AbstractEngine): string {
  const gl = (engine as unknown as { _gl?: WebGL2RenderingContext })._gl
  if (!gl) return 'unknown'
  const ext = gl.getExtension('WEBGL_debug_renderer_info')
  return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))
}

// focus: the point the cameras orbit (the camera's start by default; the forest bench's ?benchat)
export async function runBench(scene: Scene, camera: ArcRotateCamera, passes: BenchPasses, arms: Arm[], holdS: number, focus: { x: number; z: number } = { x: START.x, z: START.z }): Promise<object> {
  const engine = scene.getEngine(), gl = (engine as unknown as { _gl: WebGL2RenderingContext })._gl
  const timer = new GpuTimer(gl), inst = new SceneInstrumentation(scene)
  let timing = false, passFrame = false, frameNo = 0, lastT = 0, passFrames = 0
  const frameMs: number[] = [], draws: number[] = [], tris: number[] = [], timed = new Map<string, number>()
  // a pass is timed as segments of consecutive draws (one query per run of draws of the same pass, not one per mesh:
  // per-mesh queries summed to 11–30× the frame on ANGLE Metal, measured in L2a), in the camera's own pass only,
  // never in a bake.
  // Every mesh is hooked, so a draw outside the named passes ends the segment before it ('other'). A segment stays
  // open until the next draw of another pass: GPU work between draws (a clear, a target switch) is charged to it
  let open: string | null = null
  const undo: (() => void)[] = []   // every observer the bench adds, removed when it ends
  const seg = (label: string | null) => {
    if (open === label) return
    if (open) timer.end(open)
    open = label
    if (label) { timer.begin(label); timed.set(label, (timed.get(label) ?? 0) + 1) }
  }
  const named = new Map<Mesh, string>()
  for (const m of passes.terrain) named.set(m, 'terrain')
  for (const m of passes.scatter) named.set(m, 'scatter')
  for (const m of passes.water) named.set(m, 'water')
  const hook = (m: Mesh) => { const o = m.onBeforeRenderObservable.add(() => { if (timing && passFrame && engine.currentRenderPassId === camera.renderPassId) seg(named.get(m) ?? 'other') }); undo.push(() => m.onBeforeRenderObservable.remove(o)) }
  for (const m of scene.meshes) if (m instanceof Mesh) hook(m)
  const added = scene.onNewMeshAddedObservable.add(m => { if (m instanceof Mesh) hook(m) }); undo.push(() => scene.onNewMeshAddedObservable.remove(added))
  // the finishing passes are rebuilt by Post.build (an arm may toggle depth of field): hooked again whenever they change
  const hookedPosts = new Set<PostProcess>()
  const hookPosts = () => {
    for (const p of passes.post()) {
      if (hookedPosts.has(p)) continue
      hookedPosts.add(p)
      const a = p.onApplyObservable.add(() => { if (timing && passFrame) seg('post') }), b = p.onAfterRenderObservable.add(() => { if (timing && passFrame) seg(null) })
      undo.push(() => { p.onApplyObservable.remove(a); p.onAfterRenderObservable.remove(b) })
    }
  }
  hookPosts()
  // alternate frames: the passes on one, the whole frame on the next (queries cannot nest). Frame times come from the
  // whole-frame frames only: the pass frames carry more queries, which cost time on some backends
  const begin = engine.onBeginFrameObservable.add(() => {
    const t = performance.now(); if (timing && lastT && !passFrame) frameMs.push(t - lastT); lastT = t   // passFrame: the frame that just ended
    timer.poll(); timer.newFrame(); frameNo++; hookPosts()
    passFrame = timer.available && frameNo % 2 === 0   // without a timer every frame is a whole frame
    if (timing && !passFrame) timer.begin('frame')
    if (timing && passFrame) passFrames++
  })
  const end = engine.onEndFrameObservable.add(() => {
    seg(null)
    if (timing && !passFrame) timer.end('frame')
    if (timing) { draws.push(inst.drawCallsCounter.current); tris.push(scene.getActiveIndices() / 3) }
  })
  undo.push(() => { engine.onBeginFrameObservable.remove(begin); engine.onEndFrameObservable.remove(end) })
  // a hidden tab stops rendering: a run across it would hold a frame of several seconds, so that run is measured again
  let hidden = false
  const onVis = () => { if (document.hidden) hidden = true }
  document.addEventListener('visibilitychange', onVis); undo.push(() => document.removeEventListener('visibilitychange', onVis))
  const frames = (n: number) => new Promise<void>(r => { let k = 0; const o = engine.onEndFrameObservable.add(() => { if (++k >= n) { engine.onEndFrameObservable.remove(o); r() } }) })
  const seconds = (s: number) => new Promise<void>(r => setTimeout(r, s * 1000))

  const canvas0 = [engine.getRenderWidth(true), engine.getRenderHeight(true)]   // the page's frame before any camera (a wide one draws smaller at Auto)
  const runs: RunStats[] = [], cams = cameras()
  try {
    await seconds(2)   // shaders compiled, first frames out of the way
    for (const cam of cams) {
      camera.alpha = cam.alpha; camera.beta = cam.beta; camera.radius = cam.radius; camera.target.set(focus.x, D.spec.camera.focusY, focus.z)
      for (const arm of [...arms, ...[...arms].reverse()]) {
        await arm.apply(); await scene.whenReadyAsync()
        for (let tries = 0; ; tries++) {
          await frames(10)
          timer.reset(); frameMs.length = draws.length = tris.length = 0; timed.clear(); lastT = 0; passFrames = 0; hidden = document.hidden
          // the hold, and at least MIN_FRAMES frames (a software renderer takes seconds a frame)
          const t0 = performance.now(); timing = true
          while (performance.now() - t0 < holdS * 1000 || frameMs.length < MIN_FRAMES) await frames(1)
          timing = false
          if (!hidden) break
          if (tries >= 3) throw new Error('the page was hidden in 4 tries of one run (another tab or a minimised window): keep the tab in front')
        }
        await frames(6)   // late query results
        const gpuMs: Record<string, Stat | null> = {}
        for (const k of ['frame', 'terrain', 'scatter', 'water', 'other', 'post']) { const a = timer.results.get(k); gpuMs[k] = timer.available && a?.length ? stat(a) : null }
        const nPass = Math.max(1, passFrames), segments: Record<string, number> = {}
        for (const [k, v] of timed) segments[k] = +(v / nPass).toFixed(1)
        // the passes' medians should fit in the frame's: when they do not, the backend's queries are not trustworthy
        const sum = ['terrain', 'scatter', 'water', 'other', 'post'].reduce((a, k) => a + (gpuMs[k]?.p50 ?? 0), 0)
        const passesFit = gpuMs.frame ? +(sum / gpuMs.frame.p50).toFixed(2) : null
        runs.push({ cam: cam.name, arm: arm.name, size: [engine.getRenderWidth(true), engine.getRenderHeight(true)], frames: frameMs.length, frameMs: stat(frameMs), gpuMs, passesOverFrame: passesFit, drawCalls: Math.round(q(draws, 0.5)), triangles: Math.round(q(tris, 0.5)), segments })
      }
    }
  } finally { timing = false; seg(null); for (const u of undo) u(); inst.dispose() }
  const r = engine.getRenderingCanvas()
  return {
    tool: 'look-bench', version: 4,   // 4: each run's frame size (the render scale: Auto lowers it at the widest zoom); 3: the cameras' focus recorded (?benchat); a version-2 file orbits the start
    build: __BUILD__, date: new Date().toISOString(), userAgent: navigator.userAgent, renderer: rendererName(engine),
    canvas: { w: canvas0[0], h: canvas0[1], cssW: r?.clientWidth, cssH: r?.clientHeight, dpr: devicePixelRatio },
    gpuTimer: timer.available, holdS, focus, arms: arms.map(a => a.name), textureMB: textureMB(engine), queriesRefused: timer.refused, disjoint: timer.disjoint,
    note: timer.available ? 'GPU times from EXT_disjoint_timer_query_webgl2' : 'no GPU timer on this browser: GPU fields are null', runs,
  }
}

// the result on the page, with a link to save it
export function showBench(result: object): void {
  const json = JSON.stringify(result, null, 1), el = document.createElement('div')
  el.style.cssText = 'position:fixed;inset:24px;overflow:auto;background:rgba(12,13,15,.92);color:#eceae4;font:11px ui-monospace,Menlo,monospace;padding:16px;border-radius:10px;z-index:9'
  const a = document.createElement('a'), r = result as { build: string; date: string }
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.download = `l2-${r.date.slice(0, 10)}-${r.build}.json`
  a.textContent = `Save ${a.download}`; a.style.cssText = 'color:#d9a35b;font-size:13px'
  const pre = document.createElement('pre'); pre.textContent = json
  el.append(a, pre); document.body.append(el)
}
