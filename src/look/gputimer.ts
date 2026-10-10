// GPU time per pass (docs/plans/active/l2-detail.md, the bench): our own TIME_ELAPSED queries from
// EXT_disjoint_timer_query_webgl2, so the passes can be told apart. Queries cannot nest: one is open at a time, a
// begin while one is open is refused (and counted), and whole-frame time is measured on frames that time no pass.
// Results arrive a few frames later; a frame counts only when every query it opened resolved without a disjoint
// event (the GPU's clock was interrupted: the numbers would be wrong).

interface TimerExt { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }
interface Open { frame: number; label: string; q: WebGLQuery }

export class GpuTimer {
  readonly available: boolean
  private readonly gl: WebGL2RenderingContext
  private readonly ext: TimerExt | null
  private open: Open | null = null
  private pending: Open[] = []
  private frames = new Map<number, { left: number; bad: boolean; sums: Map<string, number> }>()
  // per label, one value per complete frame (ms)
  readonly results = new Map<string, number[]>()
  refused = 0; disjoint = 0
  private frame = 0

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExt | null
    this.available = !!this.ext
  }

  // frame boundaries: call newFrame before the frame's first begin
  newFrame(): void { this.frame++ }

  begin(label: string): void {
    if (!this.ext) return
    if (this.open) { this.refused++; return }
    const q = this.gl.createQuery(); if (!q) return
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q)
    this.open = { frame: this.frame, label, q }
    const f = this.frames.get(this.frame) ?? { left: 0, bad: false, sums: new Map() }
    f.left++; this.frames.set(this.frame, f)
  }

  end(label: string): void {
    if (!this.ext || !this.open || this.open.label !== label) return
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT)
    this.pending.push(this.open); this.open = null
  }

  // collect what has resolved; call once a frame, outside any query
  poll(): void {
    if (!this.ext) return
    const gl = this.gl, dis = !!gl.getParameter(this.ext.GPU_DISJOINT_EXT)
    // a disjoint event spoils every query in flight, resolved or not (reading the flag clears it)
    if (dis) { this.disjoint++; for (const f of this.frames.values()) f.bad = true }
    const still: Open[] = []
    for (const p of this.pending) {
      if (!gl.getQueryParameter(p.q, gl.QUERY_RESULT_AVAILABLE)) { still.push(p); continue }
      const ns = gl.getQueryParameter(p.q, gl.QUERY_RESULT) as number; gl.deleteQuery(p.q)
      const f = this.frames.get(p.frame); if (!f) continue
      f.sums.set(p.label, (f.sums.get(p.label) ?? 0) + ns / 1e6); f.left--
      if (f.left === 0) {
        this.frames.delete(p.frame)
        if (!f.bad) for (const [k, v] of f.sums) { const a = this.results.get(k) ?? []; a.push(v); this.results.set(k, a) }
      }
    }
    this.pending = still
  }

  reset(): void { this.results.clear(); this.refused = 0; this.disjoint = 0 }
}
