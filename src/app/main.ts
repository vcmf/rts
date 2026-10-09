// The S1b page (docs/plans/active/s1b-sim-page.md): the sim on the main thread at 20 Hz, drawn as a
// staff map with every soldier as a circle; the mouse selects and orders battalions. Every input becomes
// a command through `issue`, and the external log is kept, so a session can be replayed.
import dataUrl from '../../data/formation-field.simdata?url'
import { loadSimData, compileRuleset, makeWorld, issue, advanceTick, formationHandle, STATUS, menOf, hashWorld, hex, sectionHashes, SIM_VERSION, M_TICK,
  type Command, type Stamped, type World, type HashPoint, type Replay, type Dropped } from '../sim/index.ts'
import { napoleonic } from '../rulesets/napoleonic.ts'
import { S1B_SCENARIOS, FIELD_DATA_VERSION } from '../scenarios/s1b-field.ts'
import { buildScene } from '../render/scene.ts'
import { SoldierLayer } from '../render/soldiers.ts'
import { StaffMap, toW, toS, type View } from '../render/map.ts'

const SEED = 20261009, TICK = 0.05, SPEEDS = [0, 1, 2, 4, 8]

async function main(): Promise<void> {
  const data = loadSimData(new Uint8Array(await (await fetch(dataUrl)).arrayBuffer()), FIELD_DATA_VERSION)
  const cr = compileRuleset(napoleonic)
  const w: World = makeWorld(data, cr, SEED, false)
  const scenario = S1B_SCENARIOS[new URLSearchParams(location.search).get('scenario') ?? ''] ?? S1B_SCENARIOS['s1b-field']
  scenario.setup(w)
  const log: Stamped[] = [], hashes: HashPoint[] = [], dropped: Dropped[] = []
  const scene = buildScene(w), layer = new SoldierLayer(w, scene), map = new StaffMap(w, scene)
  const t0 = performance.now()
  map.buildBase((a, b) => { const c = document.createElement('canvas'); c.width = a; c.height = b; return c })
  const buildMs = performance.now() - t0

  const mapC = document.getElementById('map') as HTMLCanvasElement, unitC = document.getElementById('units') as HTMLCanvasElement
  const mg = mapC.getContext('2d')!, ug = unitC.getContext('2d')!, DPR = Math.min(2, window.devicePixelRatio || 1)
  const view: View = { cx: -50, cz: 0, k: 4, W: 0, H: 0 }
  let mapDirty = true, speed = 1, acc = 0, showSlots = false, paused = false, simMs = 0, drawMs = 0, fps = 0
  const selected = new Set<number>()
  const resize = () => { view.W = innerWidth; view.H = innerHeight
    for (const c of [mapC, unitC]) { c.width = view.W * DPR; c.height = view.H * DPR; c.getContext('2d')!.setTransform(DPR, 0, 0, DPR, 0, 0) }
    mapDirty = true }
  addEventListener('resize', resize); resize()

  // commands from the player: stamped, logged, applied at the next tick
  const external = (c: Command) => issue(w, c, log)
  const forSelection = (make: (h: number) => Command) => { for (const i of selected) external(make(formationHandle(w, i))) }
  const tick = () => { const r = advanceTick(w); dropped.push(...r.dropped); if (r.hash !== null) hashes.push({ tick: r.tick, hash: r.hash, sections: sectionHashes(w) }); for (const i of [...selected]) if (!w.f.alive[i]) selected.delete(i) }

  // the frame: ticks owed at the game speed, then the men (in game time), then the drawing
  const advance = (dt: number) => {
    const g = dt * speed; acc += g
    const a = performance.now(); let n = 0
    while (acc >= TICK && n < 20) { tick(); acc -= TICK; n++ }
    if (n === 20) acc = 0
    for (let left = g; left > 1e-9; left -= 0.05) layer.step(Math.min(0.05, left), acc / TICK)
    simMs = simMs * 0.9 + (performance.now() - a) * 0.1
  }
  const draw = () => {
    if (mapDirty) { map.drawMap(mg, view); drawScale(); mapDirty = false }
    const a = performance.now(); map.drawUnits(ug, view, layer, selected, showSlots); drawMs = drawMs * 0.9 + (performance.now() - a) * 0.1
  }
  let last: number | null = null, frames = 0, fpsT = performance.now()
  const frame = (now: number) => {
    const dt = last === null ? 0 : Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now
    if (!paused) advance(dt)
    draw(); frames++; if (now - fpsT > 500) { fps = frames * 1000 / (now - fpsT); frames = 0; fpsT = now }
    readout(); requestAnimationFrame(frame)
  }

  // panel: shapes and order presets come from the ruleset
  const shapesEl = document.getElementById('shapes')!, stylesEl = document.getElementById('styles')!, speedsEl = document.getElementById('speeds')!
  for (const s of Object.keys(cr.rs.formations)) { const b = document.createElement('button'); b.textContent = s; b.onclick = () => forSelection(id => ({ type: 'form', id, shape: s })); shapesEl.append(b) }
  for (const s of Object.keys(cr.rs.orders)) { const b = document.createElement('button'); b.textContent = s; b.dataset.style = s; b.onclick = () => forSelection(id => ({ type: 'style', id, preset: s })); stylesEl.append(b) }
  for (const s of SPEEDS) { const b = document.createElement('button'); b.textContent = s ? `${s}×` : 'pause'; b.dataset.speed = String(s); b.onclick = () => setSpeed(s); speedsEl.append(b) }
  const setSpeed = (s: number) => { speed = s; document.querySelectorAll<HTMLElement>('[data-speed]').forEach(e => e.classList.toggle('on', +e.dataset.speed! === s)) }
  setSpeed(1)
  const orders: Record<string, (id: number) => Command> = {
    face: id => ({ type: 'face', id }), retire: id => ({ type: 'retire', id, metres: 30 }), halt: id => ({ type: 'halt', id }),
    wheelL: id => ({ type: 'wheel', id, angle: -Math.PI / 4 }), wheelR: id => ({ type: 'wheel', id, angle: Math.PI / 4 }),   // headings are compass bearings: + turns right
  }
  document.querySelectorAll<HTMLElement>('[data-cmd]').forEach(el => { el.onclick = () => forSelection(orders[el.dataset.cmd!]) })
  document.querySelectorAll<HTMLElement>('[data-view]').forEach(el => { el.onclick = () => {
    if (el.dataset.view === 'slots') { showSlots = !showSlots; el.classList.toggle('on', showSlots) }
    if (el.dataset.view === 'replay') navigator.clipboard?.writeText(JSON.stringify(replay())) } })

  // the mouse: click a battalion to select (shift adds), drag a box, click the ground to march; right-drag
  // (or a drag with space held) pans
  const boxEl = document.getElementById('box')!
  const pick = (sx: number, sy: number): number => {
    const [x, z] = toW(view, sx, sy), r2 = Math.max(1.5, 6 / view.k) ** 2
    let best = -1, bd = Infinity
    for (const u of layer.units.values()) for (const m of u.men) if (m.alive) { const d = (m.x - x) ** 2 + (m.z - z) ** 2; if (d < r2 && d < bd) { bd = d; best = u.i } }
    return best
  }
  const march = (x: number, z: number, append: boolean) => {
    if (!selected.size) return
    let cx = 0, cz = 0; for (const i of selected) { cx += w.f.x[i]; cz += w.f.z[i] } cx /= selected.size; cz /= selected.size
    for (const i of selected) external({ type: 'move', id: formationHandle(w, i), points: [[x + w.f.x[i] - cx, z + w.f.z[i] - cz]], append })   // keep their relative places
  }
  let drag: { x: number; y: number; cx: number; cz: number; button: number; moved: boolean; shift: boolean } | null = null, space = false
  unitC.addEventListener('contextmenu', e => e.preventDefault())
  unitC.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, cx: view.cx, cz: view.cz, button: space && e.button === 0 ? 1 : e.button, moved: false, shift: e.shiftKey }; unitC.setPointerCapture(e.pointerId) })
  unitC.addEventListener('pointermove', e => { if (!drag) return
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.hypot(dx, dy) > 4) drag.moved = true
    if (!drag.moved) return
    if (drag.button === 2 || drag.button === 1) { view.cx = drag.cx - dx / view.k; view.cz = drag.cz + dy / view.k; mapDirty = true; return }
    Object.assign(boxEl.style, { display: 'block', left: Math.min(drag.x, e.clientX) + 'px', top: Math.min(drag.y, e.clientY) + 'px', width: Math.abs(dx) + 'px', height: Math.abs(dy) + 'px' }) })
  unitC.addEventListener('pointerup', e => {
    const d = drag; drag = null; boxEl.style.display = 'none'; if (!d || d.button !== 0) return
    if (d.moved) {   // box select
      const [x0, z1] = toW(view, Math.min(d.x, e.clientX), Math.min(d.y, e.clientY)), [x1, z0] = toW(view, Math.max(d.x, e.clientX), Math.max(d.y, e.clientY))
      if (!d.shift) selected.clear()
      for (const u of layer.units.values()) if (u.men.some(m => m.alive && m.x > x0 && m.x < x1 && m.z > z0 && m.z < z1)) selected.add(u.i)
      return
    }
    const hit = pick(e.clientX, e.clientY)
    if (hit >= 0) { if (d.shift) { if (selected.has(hit)) selected.delete(hit); else selected.add(hit) } else { selected.clear(); selected.add(hit) } return }
    const [x, z] = toW(view, e.clientX, e.clientY); march(x, z, d.shift)
  })
  unitC.addEventListener('wheel', e => { e.preventDefault(); const [x, z] = toW(view, e.clientX, e.clientY)
    view.k = Math.min(40, Math.max(0.8, view.k * Math.exp(-e.deltaY * 0.0015))); const [x2, z2] = toW(view, e.clientX, e.clientY); view.cx += x - x2; view.cz += z - z2; mapDirty = true }, { passive: false })
  addEventListener('keyup', e => { if (e.code === 'Space') space = false })
  addEventListener('blur', () => { space = false })
  addEventListener('keydown', e => {
    if (e.code === 'Space') { space = true; e.preventDefault() }
    else if (e.key === 'p' || e.key === 'P') { paused = !paused }
    else if (e.key === 'Escape') selected.clear()
    else if ('1248'.includes(e.key)) setSpeed(+e.key)
  })

  function drawScale(): void {
    const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200], len = steps.find(s => s * view.k >= 50) ?? 200, px = len * view.k, svg = document.getElementById('scalebar')!
    svg.setAttribute('width', String(Math.ceil(px + 12)))
    svg.innerHTML = `<rect x="1" y="12" width="${px / 2}" height="4" fill="#211f1c"/><rect x="${1 + px / 2}" y="12" width="${px / 2}" height="4" fill="none" stroke="#211f1c" stroke-width="1"/>` +
      `<text x="1" y="8" font-size="9" font-family="monospace" fill="#5f5a52">0</text><text x="${px}" y="8" font-size="9" font-family="monospace" fill="#5f5a52" text-anchor="end">${len} m</text>`
  }
  const statsEl = document.getElementById('stats')!
  function readout(): void {
    const lines: string[] = []
    if (selected.size > 6) lines.push(`${selected.size} battalions selected`)
    else for (const i of selected) { const s = w.cr.shapes[w.f.shape[i]].name + (w.f.trans[i] ? ' → ' + w.cr.shapes[w.f.tShape[i]].name : '')
      lines.push(`#${i} ${s} · ${menOf(w, i)} men · ${w.cr.presets[w.f.style[i]]}${STATUS[w.f.status[i]] ? ' · ' + STATUS[w.f.status[i]] : ''}`) }
    const d = dropped.at(-1)
    if (d && w.meta[M_TICK] - d.tick < 60) lines.push(`order not carried out: ${d.reason}`)   // shown for 3 s
    statsEl.textContent = (lines.length ? lines.join('\n') : 'nothing selected') +
      `\n\nt ${(w.meta[M_TICK] * TICK).toFixed(1)} s · ${speed ? speed + '×' : 'paused'}${paused ? ' (P)' : ''}\nsim + men ${simMs.toFixed(2)} ms · draw ${drawMs.toFixed(2)} ms\nfps ${fps.toFixed(0)} · map built in ${buildMs.toFixed(0)} ms`
  }
  // the session as a replay (src/sim/replay.ts) with the hashes it must reproduce
  const replay = (): { replay: Replay; hashes: HashPoint[] } => ({ replay: { simVersion: SIM_VERSION, dataVersion: data.version, ruleset: cr.hash, scenario: scenario.name, seed: SEED, ticks: w.meta[M_TICK], log }, hashes })

  // headless hooks (tools/app-check.mjs): orders and time without real time passing
  Object.assign(window, { APP: {
    w, layer, map, selected, log, hashes, dropped,
    select: (ids: number[]) => { selected.clear(); for (const i of ids) selected.add(i) },
    march, order: (name: string) => forSelection(orders[name]), form: (shape: string) => forSelection(id => ({ type: 'form', id, shape })),
    advance: (sec: number) => { paused = true; const sp = speed; speed = 1; for (let n = Math.round(sec * 30); n > 0; n--) advance(1 / 30); speed = sp; draw() },
    view: (cx: number, cz: number, k: number) => { view.cx = cx; view.cz = cz; view.k = k; mapDirty = true; draw() },
    drawMs: () => { const a = performance.now(); for (let n = 0; n < 20; n++) map.drawUnits(ug, view, layer, selected, false); return (performance.now() - a) / 20 },
    mapMs: () => { const a = performance.now(); map.drawMap(mg, view); return performance.now() - a },
    hash: () => hex(hashWorld(w)), replay, stats: () => ({ simMs, drawMs, fps }), toS: (x: number, z: number) => toS(view, x, z), buildMs,
  } })
  requestAnimationFrame(frame)
}
main().catch(e => { console.error(e); document.getElementById('stats')!.textContent = String(e) })
