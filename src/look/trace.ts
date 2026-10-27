// The bench's per-frame trace (?benchtrace=1, src/look/bench.ts; docs/plans/active/armies-demo.md): counters of what
// happened in a frame, filled by the code that does it (src/look/units.ts) and by the bench's own hooks, read and
// cleared by the bench once a frame. Off, each counter is one branch on a boolean; on, it adds performance.now()
// deltas into a preallocated array by index: no allocation and no lookup by name a frame. Timings come from untraced
// runs: the trace explains them
export const TRACE_FIELDS = [
  'sm', // the figures' shadow map drawn
  'smCasters', // its casters (battalions)
  'smTris', // and their triangles
  'sunRefit', // the sun's box fitted anew (or its casters changed)
  'trample', // the trodden ground's mask drawn
  'trampleMs', // its CPU time
  'placed', // battalions whose men were written (place())
  'placeMs', // place()'s CPU time
  'unitsMs', // the figures' whole frame() (place, the LODs, the sun, the mask)
  'tiUploads', // thin-instance buffer uploads (bufferSubData)
  'tiKB', // their size
  'tiMs', // their CPU time
  'flag', // the flags' buffer updated
  'rt', // render targets drawn (any: the shadow maps, the bakes, the bounce and macro maps)
  'rtMs', // their CPU time (the GPU's is the frame's)
  'compiles', // shader programs compiled
  'activeMeshes', // Babylon's active meshes
  'draws', // and draw calls
  'cpuMs', // the frame's JavaScript: from its start to its end (the GPU's time is the interval's rest)
  'simMs', // the page's sim tick (?sim: src/look/sim-armies.ts; the battle's frame, the frame taken, the orders)
  'longTasks', // long tasks (over 50 ms: the bench's PerformanceObserver), charged to the next recorded frame
  'longMs', // and their time
] as const
export type TraceField = (typeof TRACE_FIELDS)[number]
/** each field's index (TRACE.c[TR.sm]: a number, no lookup by name a call) */
export const TR = Object.freeze(Object.fromEntries(TRACE_FIELDS.map((f, i) => [f, i])) as Record<TraceField, number>)
export const TRACE = { on: false, c: new Float64Array(TRACE_FIELDS.length), rtMask: 0 }
/** add v to a counter of the frame (nothing when the trace is off); i: TR's index */
export function tr(i: number, v = 1): void {
  if (TRACE.on) TRACE.c[i] += v
}
/** the clock for a timed counter: 0 when the trace is off (no call to performance.now()) */
export const trNow = (): number => (TRACE.on ? performance.now() : 0)
