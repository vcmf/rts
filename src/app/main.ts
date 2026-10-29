// The S1b page (docs/plans/done/s1b-sim-page.md): the sim at 20 Hz, drawn as a staff map with every soldier as a
// circle; the mouse selects and orders battalions. Every input becomes a command, stamped and logged by the battle,
// so a session can be replayed. The battle runs in the battle worker and the page reads its published frames
// (docs/plans/active/battle-threads.md, PR 3); without cross-origin isolation, or at ?thread=main, on this thread.
// The visual bench (docs/plans/active/c0-bench.md): an overlay of what the sim tests, drawn from the world the page
// reads; a tick on, a tick back and a time to go to, asked of the battle wherever it runs (decision 0081).
import fieldUrl from '../../data/formation-field.simdata?url'
import battleUrl from '../../data/battlefield.simdata?url'
import benchUrl from '../../data/bench.simdata?url'
import valleyUrl from '../../data/valley.simdata?url'
import lookUrl from '../../data/painted-world.simdata?url'
import {
  compileRuleset,
  loadSimData,
  play,
  typeOf,
  formationHandle,
  STATUS,
  menOf,
  M_TICK,
  DT,
  TICK_HZ,
  MORALE_STATES,
  FIRE_MODES,
  CHARGE_PHASES,
  M_END,
  M_WINNER,
  END_RESULTS,
  END_DRAW,
  fightShares,
  formedOverlaps,
  placeAll,
  mkPlaced,
  type Command,
  type World,
} from '../sim/index.ts'
import { napoleonic } from '../rulesets/napoleonic.ts'
import { MAP_VERSIONS, DEFAULT_MAP } from '../scenarios/maps.ts'
import { PAGE_SCENARIOS, DEFAULT_SCENARIO, PAGE_VIEWS } from '../scenarios/page.ts'
import { BENCH_CASES, CLAIM_CASES } from '../scenarios/bench.ts'
import { MAN_ALIVE } from '../render/men.ts'
import { StaffMap, toW, toS, type View } from '../render/map.ts'
import { Overlay, LAYERS, type Layer } from '../render/overlay.ts'
import { startLink, type Seen } from './battle-link.ts'
import { pruneSelection, runSpeed, lastDropped, clockText as clock, parseTime } from './page-rules.ts'

const SPEEDS = [0, 0.25, 0.5, 1, 2, 4, 8]

async function main(): Promise<void> {
  const asked = new URLSearchParams(location.search).get('scenario') ?? ''
  const key = Object.hasOwn(PAGE_SCENARIOS, asked) ? asked : DEFAULT_SCENARIO
  const scenario = PAGE_SCENARIOS[key]
  // the scenario's map, at the version it was placed for
  const mapName = scenario.map ?? DEFAULT_MAP
  const urls: Record<string, string> = {
    'formation-field': fieldUrl,
    battlefield: battleUrl,
    bench: benchUrl,
    valley: valleyUrl,
    'painted-world': lookUrl,
  }
  if (!urls[mapName] || MAP_VERSIONS[mapName] === undefined) {
    throw new Error(`scenario ${scenario.name}: no map ${mapName} (src/scenarios/maps.ts and the page's data imports)`)
  }
  const bytes = new Uint8Array(await (await fetch(urls[mapName])).arrayBuffer())
  const data = loadSimData(bytes, MAP_VERSIONS[mapName])
  const cr = compileRuleset(napoleonic)
  // the battle worker shares memory with the page only when the page is cross-origin isolated (COOP and COEP); a
  // worker that fails to start (its script blocked, no module workers) leaves the battle on the page, said so
  let thread: 'worker' | 'main' =
    new URLSearchParams(location.search).get('thread') === 'main' || !crossOriginIsolated ? 'main' : 'worker'
  const link = await startLink({
    bytes,
    data,
    cr,
    scenario,
    key,
    workers:
      thread === 'worker'
        ? () => [
            new Worker(new URL('./sim-worker.ts', import.meta.url), { type: 'module' }),
            new Worker(new URL('./men-worker.ts', import.meta.url), { type: 'module' }),
          ]
        : null,
  })
  thread = link.mode
  // what this frame reads: the newest frame published (held until the next), or the battle on this thread
  let seen: Seen = link.see()
  let w: World = seen.w
  // the side you command (S1e-2): a scenario that names one lets you select only its formations; none, both
  const mine = (i: number): boolean => scenario.player === undefined || w.f.side[i] === scenario.player
  const map = new StaffMap(w, link.scene)
  // the bench's overlay, on the world read (a published frame's: its claim grid built on the page)
  let over = new Overlay(w, link.mode === 'worker')
  const t0 = performance.now()
  map.buildBase((a, b) => {
    const c = document.createElement('canvas')
    c.width = a
    c.height = b
    return c
  })
  const buildMs = performance.now() - t0

  // a bench case names itself under the panel's title
  const bench = [...BENCH_CASES, ...CLAIM_CASES].find(c => c.scenario === scenario)
  if (bench) document.getElementById('sub')!.textContent = bench.title
  const lookAt = bench ? `look at ${bench.keys.map(clock).join(' · ')} (G)` : ''

  const mapC = document.getElementById('map') as HTMLCanvasElement
  const unitC = document.getElementById('units') as HTMLCanvasElement
  const mg = mapC.getContext('2d')!
  const ug = unitC.getContext('2d')!
  const DPR = Math.min(2, window.devicePixelRatio || 1)
  const [vx, vz, vk] = PAGE_VIEWS[scenario.name] ?? [-50, 0, 4]
  const view: View = { cx: vx, cz: vz, k: vk, W: 0, H: 0 }
  let mapDirty = true
  let speed = 1
  let showSlots = false
  // the bench's overlay (docs/plans/active/c0-bench.md): D shows it, the panel picks its layers
  let overlay = false
  const layersOn = new Set<Layer>(LAYERS)
  let paused = false
  let simMs = 0
  let drawMs = 0
  let fps = 0
  // APP.record's frames, while it records
  let rec: { intervalMs: number[]; battleMs: number[]; drawMs: number[] } | null = null
  const selected = new Set<number>()
  // the generation each selected formation had when chosen (pruneSelection)
  const selGen = new Map<number, number>()
  const choose = (i: number) => {
    selected.add(i)
    selGen.set(i, w.f.gen[i])
  }
  const resize = () => {
    view.W = innerWidth
    view.H = innerHeight
    for (const c of [mapC, unitC]) {
      c.width = view.W * DPR
      c.height = view.H * DPR
      c.getContext('2d')!.setTransform(DPR, 0, 0, DPR, 0, 0)
    }
    mapDirty = true
  }
  addEventListener('resize', resize)
  resize()

  // commands from the player: stamped, logged, applied at the next tick (by the battle, wherever it runs)
  const external = (c: Command) => link.command(c)
  // a panel order also disarms a pending charge (C)
  const forSelection = (make: (h: number) => Command) => {
    charging = false
    for (const i of selected) external(make(formationHandle(w, i)))
  }
  // the frame: the battle's frame (on this thread: the ticks owed and the men due), then what to read this frame;
  // its cost is the page's battle time (sim, men and hash here; reading the held slot with the worker)
  const advance = (dt: number) => {
    const a = performance.now()
    link.frame(dt)
    look()
    const ms = performance.now() - a
    simMs = simMs * 0.9 + ms * 0.1
    rec?.battleMs.push(ms)
  }
  // the newest frame, and the selection pruned of formations gone; a divergence the battle found since (a tick
  // played again gave another world: it paused there) pauses the page and says so
  let warnings = 0
  const look = () => {
    seen = link.see()
    w = seen.w
    map.w = w
    pruneSelection(selected, selGen, w.f)
    if (link.warnings !== warnings) {
      warnings = link.warnings
      paused = true
      runAt()
      note = link.warning
      noteT = performance.now()
      console.warn(link.warning)
    }
  }
  // the speed the battle runs at: the panel's, or 0 while paused (P, or the headless checks' advance)
  const runAt = () => link.setSpeed(runSpeed(speed, paused, document.hidden))
  // a hidden page holds the battle, as it did when the battle ran in the page's animation frames (which stop then)
  document.addEventListener('visibilitychange', runAt)
  const draw = () => {
    if (mapDirty) {
      map.drawMap(mg, view)
      drawScale()
      mapDirty = false
    }
    const a = performance.now()
    map.drawUnits(ug, view, seen.layer, selected, showSlots)
    if (overlay) over.draw(ug, view, w, layersOn)
    const ms = performance.now() - a
    drawMs = drawMs * 0.9 + ms * 0.1
    rec?.drawMs.push(ms)
  }
  let last: number | null = null
  let frames = 0
  let fpsT = performance.now()
  const frame = (now: number) => {
    const dt = last === null ? 0 : Math.max(0, Math.min(0.1, (now - last) / 1000))
    if (last !== null) rec?.intervalMs.push(now - last)
    last = now
    advance(paused ? 0 : dt)
    draw()
    frames++
    if (now - fpsT > 500) {
      fps = (frames * 1000) / (now - fpsT)
      frames = 0
      fpsT = now
    }
    readout()
    requestAnimationFrame(frame)
  }

  // panel: shapes (every type's: a shape the selected type lacks is refused) and order presets come from the ruleset
  const shapesEl = document.getElementById('shapes')!
  const stylesEl = document.getElementById('styles')!
  const speedsEl = document.getElementById('speeds')!
  for (const s of new Set(cr.types.flatMap(t => t.shapes.map(l => l.name)))) {
    const b = document.createElement('button')
    b.textContent = s
    b.onclick = () => forSelection(id => ({ type: 'form', id, shape: s }))
    shapesEl.append(b)
  }
  for (const s of Object.keys(cr.rs.orders)) {
    const b = document.createElement('button')
    b.textContent = s
    b.dataset.style = s
    b.onclick = () => forSelection(id => ({ type: 'style', id, preset: s }))
    stylesEl.append(b)
  }
  for (const s of SPEEDS) {
    const b = document.createElement('button')
    b.textContent = s ? `${s === 0.25 ? '¼' : s === 0.5 ? '½' : s}×` : 'pause'
    b.dataset.speed = String(s)
    b.onclick = () => setSpeed(s)
    speedsEl.append(b)
  }
  const setSpeed = (s: number) => {
    speed = s
    runAt()
    document
      .querySelectorAll<HTMLElement>('[data-speed]')
      .forEach(e => e.classList.toggle('on', +e.dataset.speed! === s))
  }
  setSpeed(1)
  const layersEl = document.getElementById('layers')!
  for (const l of LAYERS) {
    const b = document.createElement('button')
    b.textContent = l
    b.classList.add('on')
    b.onclick = () => {
      if (layersOn.has(l)) layersOn.delete(l)
      else layersOn.add(l)
      b.classList.toggle('on', layersOn.has(l))
    }
    layersEl.append(b)
  }
  // time for the bench: a tick on, a tick back, a time to go to, asked of the battle (it plays them as the first pass
  // did, and pauses); the page pauses with it, and takes one request at a time (another while one is out is refused).
  // The frame there is read, and drawn by the next animation frame: drawn here, every step of a scripted run waited on
  // the browser's rendering of it. A failure leaves the battle where it was; the hooks reject with it
  let timing = false
  const timed = async (ask: () => Promise<void>): Promise<void> => {
    if (timing) throw new Error('the bench is still going to a time')
    timing = true
    paused = true
    runAt()
    try {
      await ask()
    } finally {
      timing = false
      look()
    }
  }
  const stepTick = () => timed(() => link.stepTick())
  const goTo = (target: number) =>
    timed(async () => {
      const g = await link.goTo(target)
      if (g.error) throw new Error(g.error)
      // a new world: the overlay's places and contacts found again, on it
      look()
      over = new Overlay(seen.w, link.mode === 'worker')
      if (g.capped) {
        note = `went on five minutes, to ${clock(g.tick / TICK_HZ)}: G again to go on`
        noteT = performance.now()
      }
    })
  // the keys and buttons: a failure said on screen
  const shown = (p: Promise<void>) =>
    void p.catch((e: unknown) => {
      note = e instanceof Error ? e.message : String(e)
      noteT = performance.now()
      console.error(e)
    })
  const askGoTo = () => {
    const said = prompt('Go to a time (m:ss, or seconds)')
    releaseHeld()
    const sec = said ? parseTime(said) : null
    if (sec === null) {
      if (said?.trim()) {
        note = `not a time: ${said.trim()} (m:ss, or seconds)`
        noteT = performance.now()
      }
      return
    }
    shown(goTo(sec * TICK_HZ))
  }
  document.querySelectorAll<HTMLElement>('[data-time]').forEach(el => {
    el.onclick = () =>
      el.dataset.time === 'step'
        ? shown(stepTick())
        : el.dataset.time === 'back'
          ? shown(goTo(w.meta[M_TICK] - 1))
          : askGoTo()
  })
  const orders: Record<string, (id: number) => Command> = {
    face: id => ({ type: 'face', id }),
    retire: id => ({ type: 'retire', id, metres: 30 }),
    halt: id => ({ type: 'halt', id }),
    fireAtWill: id => ({ type: 'fire', id, mode: 'at will' }),
    holdFire: id => ({ type: 'fire', id, mode: 'hold' }),
    // headings are compass bearings: + turns right
    wheelL: id => ({ type: 'wheel', id, angle: -Math.PI / 4 }),
    wheelR: id => ({ type: 'wheel', id, angle: Math.PI / 4 }),
  }
  document.querySelectorAll<HTMLElement>('[data-cmd]').forEach(el => {
    el.onclick = () => forSelection(orders[el.dataset.cmd!])
  })
  document.querySelectorAll<HTMLElement>('[data-view]').forEach(el => {
    el.onclick = () => {
      if (el.dataset.view === 'slots') {
        showSlots = !showSlots
        el.classList.toggle('on', showSlots)
      }
      if (el.dataset.view === 'replay') {
        saveSession().catch((e: unknown) => {
          note = `session not saved: ${e instanceof Error ? e.message : String(e)}`
          noteT = performance.now()
        })
      }
    }
  })
  // the session (the replay, its hashes and the moments marked) as a downloaded file, for tools/battle-report.ts
  let note = ''
  let noteT = 0
  const saveSession = async () => {
    const s = await session()
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(s)], { type: 'application/json' }))
    a.download = `${scenario.name}-${stamp}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000) // revoked at once, some browsers cancel the download
    note = 'session saved as a file'
    noteT = performance.now()
  }
  // M marks a moment of the playtest (docs/plans/active/s1e3-playtest.md): the prompt holds the page (and the
  // battle) while you say what happened; Cancel marks nothing, and says so on screen (a browser that suppresses
  // dialogs returns at once as if cancelled, so M is never silent). The report prints where everyone stood then
  const mark = (text?: string) => {
    let said = text ?? null
    if (text === undefined) {
      // the prompt blocks this thread, not the worker's: the battle is held while it is open (at the time it owed then:
      // the frame shown, or a tick past it), marked there, and runs again after
      link.setSpeed(0)
      said = prompt('What happened here? (optional)')
      if (said !== null) link.mark(said.trim(), w.meta[M_TICK])
      runAt()
      // the prompt swallowed the keyup and pointerup of anything held (space, a drag): let go of them
      releaseHeld()
    } else if (said !== null) link.mark(said.trim(), w.meta[M_TICK])
    if (said === null) {
      note = 'mark cancelled: nothing marked'
      noteT = performance.now()
      return
    }
    note = 'moment marked'
    noteT = performance.now()
  }

  // the mouse: click a battalion to select (shift adds), drag a box, click the ground to march; right-drag
  // (or a drag with space held) pans
  const boxEl = document.getElementById('box')!
  const pick = (sx: number, sy: number): number => {
    const [x, z] = toW(view, sx, sy)
    const r2 = Math.max(1.5, 6 / view.k) ** 2
    let best = -1
    let bd = Infinity
    const M = seen.layer.men
    for (const u of seen.layer.units.values()) {
      for (let j = 0; j < u.n; j++) {
        const m = u.ids[j]
        if (M.flags[m] & MAN_ALIVE) {
          const d = (M.x[m] - x) ** 2 + (M.z[m] - z) ** 2
          if (d < r2 && d < bd) {
            bd = d
            best = u.i
          }
        }
      }
    }
    return best
  }
  // the selection charges battalion j (those of a type that cannot charge are refused, and said so)
  let charging = false
  const charge = (j: number) => {
    for (const i of selected) external({ type: 'charge', id: formationHandle(w, i), target: formationHandle(w, j) })
  }
  const armCharge = () => {
    if (!selected.size) return
    charging = true
    note = 'click the enemy to charge'
    noteT = performance.now()
  }
  document.getElementById('charge')!.onclick = armCharge
  const march = (x: number, z: number, append: boolean) => {
    if (!selected.size) return
    let cx = 0
    let cz = 0
    for (const i of selected) {
      cx += w.f.x[i]
      cz += w.f.z[i]
    }
    cx /= selected.size
    cz /= selected.size
    // keep their relative places
    for (const i of selected) {
      external({ type: 'move', id: formationHandle(w, i), points: [[x + w.f.x[i] - cx, z + w.f.z[i] - cz]], append })
    }
  }
  let drag: { x: number; y: number; cx: number; cz: number; button: number; moved: boolean; shift: boolean } | null =
    null
  let space = false
  unitC.addEventListener('contextmenu', e => e.preventDefault())
  unitC.addEventListener('pointerdown', e => {
    drag = {
      x: e.clientX,
      y: e.clientY,
      cx: view.cx,
      cz: view.cz,
      button: space && e.button === 0 ? 1 : e.button,
      moved: false,
      shift: e.shiftKey,
    }
    unitC.setPointerCapture(e.pointerId)
  })
  unitC.addEventListener('pointermove', e => {
    if (!drag) return
    const dx = e.clientX - drag.x
    const dy = e.clientY - drag.y
    if (Math.hypot(dx, dy) > 4) drag.moved = true
    if (!drag.moved) return
    if (drag.button === 2 || drag.button === 1) {
      view.cx = drag.cx - dx / view.k
      view.cz = drag.cz + dy / view.k
      mapDirty = true
      return
    }
    Object.assign(boxEl.style, {
      display: 'block',
      left: Math.min(drag.x, e.clientX) + 'px',
      top: Math.min(drag.y, e.clientY) + 'px',
      width: Math.abs(dx) + 'px',
      height: Math.abs(dy) + 'px',
    })
  })
  // a gesture the browser cancels (touch, lost capture) ends with no order
  const cancel = () => {
    drag = null
    boxEl.style.display = 'none'
  }
  unitC.addEventListener('pointercancel', cancel)
  unitC.addEventListener('lostpointercapture', e => {
    if (e.buttons === 0 && drag) cancel()
  })
  unitC.addEventListener('pointerup', e => {
    const d = drag
    drag = null
    boxEl.style.display = 'none'
    if (!d || d.button !== 0) return
    if (d.moved) {
      // box select (it also disarms a charge)
      charging = false
      const [x0, z1] = toW(view, Math.min(d.x, e.clientX), Math.min(d.y, e.clientY))
      const [x1, z0] = toW(view, Math.max(d.x, e.clientX), Math.max(d.y, e.clientY))
      if (!d.shift) selected.clear()
      const M = seen.layer.men
      for (const u of seen.layer.units.values()) {
        if (!mine(u.i)) continue
        for (let j = 0; j < u.n; j++) {
          const m = u.ids[j]
          if (M.flags[m] & MAN_ALIVE && M.x[m] > x0 && M.x[m] < x1 && M.z[m] > z0 && M.z[m] < z1) {
            choose(u.i)
            break
          }
        }
      }
      return
    }
    const hit = pick(e.clientX, e.clientY)
    // C, then a click on the enemy
    if (charging) {
      charging = false
      if (hit >= 0) charge(hit)
      return
    }
    if (hit >= 0 && !mine(hit)) return // an enemy: nothing (C then a click charges it)
    if (hit >= 0) {
      if (d.shift) {
        if (selected.has(hit)) selected.delete(hit)
        else choose(hit)
      } else {
        selected.clear()
        choose(hit)
      }
      return
    }
    const [x, z] = toW(view, e.clientX, e.clientY)
    march(x, z, d.shift)
  })
  // the wheel zooms about the cursor; line (Firefox) and page deltas are scaled to pixels
  unitC.addEventListener(
    'wheel',
    e => {
      e.preventDefault()
      const [x, z] = toW(view, e.clientX, e.clientY)
      view.k = Math.min(
        40,
        Math.max(
          0.4,
          view.k * Math.exp(-e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? view.H : 1) * 0.0015),
        ),
      )
      const [x2, z2] = toW(view, e.clientX, e.clientY)
      view.cx += x - x2
      view.cz += z - z2
      mapDirty = true
    },
    { passive: false },
  )
  addEventListener('keyup', e => {
    if (e.code === 'Space') space = false
  })
  // held input lets go when the page loses the keyboard and mouse (a blur, the mark's prompt): space, and a drag
  // with no order
  function releaseHeld(): void {
    space = false
    cancel()
  }
  addEventListener('blur', releaseHeld)
  addEventListener('keydown', e => {
    // space pans; a focused panel button must not take it as a click (it would repeat the order)
    if (e.code === 'Space') {
      space = true
      e.preventDefault()
      if (document.activeElement instanceof HTMLButtonElement) document.activeElement.blur()
    } else if (e.metaKey || e.ctrlKey || e.altKey) {
      // the page's keys, not with Cmd, Ctrl or Alt held (copy, print, switching tabs, minimising)
    } else if (e.key === 'p' || e.key === 'P') {
      paused = !paused
      runAt()
    } else if (e.key === 'Escape') {
      selected.clear()
      charging = false
    } else if (e.key === 'c' || e.key === 'C') armCharge()
    else if ('1248'.includes(e.key)) setSpeed(+e.key)
    else if (e.key === 'd' || e.key === 'D') overlay = !overlay
    else if (e.key === '.') shown(stepTick())
    // going back once a press, not on a held key's repeats
    else if (e.key === ',' && !e.repeat) shown(goTo(w.meta[M_TICK] - 1))
    else if ((e.key === 'g' || e.key === 'G') && !e.repeat) askGoTo()
    else if ((e.key === 'm' || e.key === 'M') && !e.repeat) mark()
  })

  function drawScale(): void {
    const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200]
    const len = steps.find(s => s * view.k >= 50) ?? 200
    const px = len * view.k
    const svg = document.getElementById('scalebar')!
    svg.setAttribute('width', String(Math.ceil(px + 12)))
    svg.innerHTML =
      `<rect x="1" y="12" width="${px / 2}" height="4" fill="#211f1c"/><rect x="${1 + px / 2}" y="12" width="${px / 2}" height="4" fill="none" stroke="#211f1c" stroke-width="1"/>` +
      `<text x="1" y="8" font-size="9" font-family="monospace" fill="#5f5a52">0</text><text x="${px}" y="8" font-size="9" font-family="monospace" fill="#5f5a52" text-anchor="end">${len} m</text>`
  }
  const statsEl = document.getElementById('stats')!
  function readout(): void {
    const lines: string[] = []
    if (selected.size > 6) lines.push(`${selected.size} battalions selected`)
    else {
      for (const i of selected) {
        const U = typeOf(w, i)
        const s = U.shapes[w.f.shape[i]].name + (w.f.trans[i] ? ' → ' + U.shapes[w.f.tShape[i]].name : '')
        lines.push(
          `#${i} ${U.name} · ${s} · ${menOf(w, i)} men · ${w.cr.presets[w.f.style[i]]}${STATUS[w.f.status[i]] ? ' · ' + STATUS[w.f.status[i]] : ''}`,
        )
        const fight = w.f.foe[i]
          ? ' · in melee'
          : w.f.chPhase[i]
            ? ' · ' + CHARGE_PHASES[w.f.chPhase[i]]
            : w.f.blownUntil[i] > w.meta[M_TICK]
              ? ' · blown'
              : ''
        lines.push(
          `   ${MORALE_STATES[w.f.mstate[i]]} · morale ${w.f.morale[i].toFixed(2)} · lost ${w.f.startMen[i] - menOf(w, i)} · ${FIRE_MODES[w.f.fireMode[i]]}${fight}`,
        )
      }
    }
    // yours (the plan's refusals are not shown), the last the world has reached
    const d = lastDropped(link.dropped, w.meta[M_TICK])
    if (note && performance.now() - noteT < 3000) lines.push(note)
    // the battle (S1e-2): each side's men in the fight, as a share of those it spawned, and the result once decided
    const shares = fightShares(w)
    const head: string[] = []
    if (w.meta[M_END]) {
      const r = w.meta[M_WINNER]
      const you =
        scenario.player === undefined
          ? END_RESULTS[r]
          : r === END_DRAW
            ? 'a draw'
            : r - 1 === scenario.player
              ? 'you win'
              : 'you lose'
      head.push(`BATTLE OVER at ${((w.meta[M_END] * DT) / 60).toFixed(1)} min: ${you}`)
    }
    head.push(
      `in the fight: ${[0, 1].map(s => `${s === scenario.player ? 'yours' : 'side ' + s} ${Math.round(100 * shares[s])}%`).join(' · ')}`,
    )
    if (d && w.meta[M_TICK] - d.tick < 3 * TICK_HZ) lines.push(`order not carried out: ${d.reason}`) // shown for 3 s
    if (link.failed) head.unshift(`THE BATTLE STOPPED: ${link.failed}`)
    statsEl.textContent =
      head.join('\n') +
      '\n' +
      (lines.length ? lines.join('\n') : 'nothing selected') +
      (lookAt ? '\n' + lookAt : '') +
      `\n\nt ${(w.meta[M_TICK] * DT).toFixed(1)} s · tick ${w.meta[M_TICK]} · ${speed ? speed + '×' : 'paused'}${paused ? ' (P)' : ''}\n${costs()}\ndraw ${drawMs.toFixed(2)} ms · fps ${fps.toFixed(0)} · map built in ${buildMs.toFixed(0)} ms`
  }
  // the session as a replay (src/sim/replay.ts) with the hashes it must reproduce and the moments marked, as far as
  // the world has reached: commands issued while paused wait for their tick and are left out
  const session = () => link.session()
  const replay = async () => {
    const { replay: r, hashes } = await session()
    return { replay: r, hashes }
  }
  // the battle's cost on this page, and the worker's own when it runs there (ms, smoothed)
  function costs(): string {
    if (link.mode === 'main') return `sim + men ${simMs.toFixed(2)} ms`
    const c = link.costs()
    return `reading ${simMs.toFixed(2)} ms\nworker: ticks ${c.tickMs.toFixed(2)} · men ${c.stepMs.toFixed(2)} · out ${c.pubMs.toFixed(2)} ms`
  }

  // headless hooks (tools/app-check.mjs, tools/bench-sim.ts): orders and time without real time passing; those the
  // worker answers return promises
  const APP = {
    get w() {
      return w
    },
    get layer() {
      return seen.layer
    },
    thread,
    map,
    selected,
    get log() {
      return link.log
    },
    get hashes() {
      return link.hashes
    },
    get dropped() {
      return link.dropped
    },
    // the bench: a time to go to and a tick on (promises: resolved with the frame there), the overlay, the overlaps
    // of formed bodies at the world read
    goTo,
    stepTick,
    overlay: (on: boolean, layers?: Layer[]) => {
      overlay = on
      if (layers) {
        layersOn.clear()
        for (const l of layers) layersOn.add(l)
      }
      draw()
    },
    overlaps: () => formedOverlaps(w, placeAll(w, mkPlaced(w))).length,
    select: (ids: number[]) => {
      selected.clear()
      for (const i of ids) if (mine(i)) choose(i)
    },
    mine,
    result: () => ({ tick: w.meta[M_END], winner: END_RESULTS[w.meta[M_WINNER]] }),
    march,
    charge,
    order: (name: string) => forSelection(orders[name]),
    form: (shape: string) => forSelection(id => ({ type: 'form', id, shape })),
    run: () => {
      paused = false
      setSpeed(1)
    },
    speed: (s: number) => {
      paused = false
      setSpeed(s)
    },
    // the speed is kept: the battle is held (paused) until the page runs it again
    advance: async (sec: number) => {
      paused = true
      runAt()
      await link.advance(sec)
      look()
      draw()
    },
    view: (cx: number, cz: number, k: number) => {
      view.cx = cx
      view.cz = cz
      view.k = k
      mapDirty = true
      draw()
    },
    drawMs: () => {
      const a = performance.now()
      for (let n = 0; n < 20; n++) map.drawUnits(ug, view, seen.layer, selected, false)
      return (performance.now() - a) / 20
    },
    mapMs: () => {
      const a = performance.now()
      map.drawMap(mg, view)
      return performance.now() - a
    },
    hash: () => link.hash(),
    replay,
    // the browser's replay harness: the session played again on this thread, against the hash points the battle
    // took (in the worker, normally); null when every one is reproduced, else the first mismatch
    replayHere: async () => {
      const { replay: r, hashes } = await replay()
      return play(r, data, cr, scenario, hashes)
    },
    session,
    mark,
    stats: () => ({ simMs, drawMs, fps }),
    // `sec` seconds of the page's frames as they run: each frame's interval, the page's battle time (stepping the
    // battle here, or reading the held slot) and drawing, the long tasks, and the worker's every advance
    record: async (sec: number) => {
      const longs: number[] = []
      const obs = new PerformanceObserver(l => {
        for (const e of l.getEntries()) longs.push(e.duration)
      })
      obs.observe({ type: 'longtask' })
      rec = { intervalMs: [], battleMs: [], drawMs: [] }
      await link.record(true)
      await new Promise(r => setTimeout(r, sec * 1000))
      const worker = await link.record(false)
      const page = rec
      rec = null
      obs.disconnect()
      return { thread, page, longTasks: longs, worker }
    },
    toS: (x: number, z: number) => toS(view, x, z),
    buildMs,
  }
  Object.assign(window, { APP })
  requestAnimationFrame(frame)
}
main().catch(e => {
  console.error(e)
  document.getElementById('stats')!.textContent = String(e)
})
