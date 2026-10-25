// The S1b page (docs/plans/done/s1b-sim-page.md): the sim on the main thread at 20 Hz, drawn as a
// staff map with every soldier as a circle; the mouse selects and orders battalions. Every input becomes
// a command through `issue`, and the external log is kept, so a session can be replayed.
import fieldUrl from '../../data/formation-field.simdata?url'
import battleUrl from '../../data/battlefield.simdata?url'
import {
  loadSimData,
  compileRuleset,
  makeWorld,
  typeOf,
  issue,
  advanceTick,
  formationHandle,
  STATUS,
  menOf,
  hashWorld,
  hex,
  SIM_VERSION,
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
  attachScenario,
  fightShares,
  type Command,
  type Stamped,
  type World,
  type HashPoint,
  type Replay,
  type Dropped,
} from '../sim/index.ts'
import { napoleonic } from '../rulesets/napoleonic.ts'
import { MAP_VERSIONS, DEFAULT_MAP } from '../scenarios/maps.ts'
import { PAGE_SCENARIOS, DEFAULT_SCENARIO, PAGE_VIEWS, PAGE_SEED } from '../scenarios/page.ts'
import { buildScene } from '../render/scene.ts'
import { SoldierLayer } from '../render/soldiers.ts'
import { StaffMap, toW, toS, type View } from '../render/map.ts'

// the soldier layer steps once a frame, up to MEN_DT of game time (tested at that step); a longer frame
// takes more steps, at most MEN_STEPS (then the men fall behind the sim and catch up)
const SPEEDS = [0, 1, 2, 4, 8]
const MEN_DT = 0.2
const MEN_STEPS = 4

async function main(): Promise<void> {
  const asked = new URLSearchParams(location.search).get('scenario') ?? ''
  const scenario = PAGE_SCENARIOS[Object.hasOwn(PAGE_SCENARIOS, asked) ? asked : DEFAULT_SCENARIO]
  // the scenario's map, at the version it was placed for
  const mapName = scenario.map ?? DEFAULT_MAP
  const urls: Record<string, string> = { 'formation-field': fieldUrl, battlefield: battleUrl }
  if (!urls[mapName] || MAP_VERSIONS[mapName] === undefined) {
    throw new Error(`scenario ${scenario.name}: no map ${mapName} (src/scenarios/maps.ts and the page's data imports)`)
  }
  const data = loadSimData(new Uint8Array(await (await fetch(urls[mapName])).arrayBuffer()), MAP_VERSIONS[mapName])
  const cr = compileRuleset(napoleonic)
  const w: World = makeWorld(data, cr, PAGE_SEED, false)
  attachScenario(w, scenario)
  scenario.setup(w)
  // the side you command (S1e-2): a scenario that names one lets you select only its formations; none, both
  const mine = (i: number): boolean => scenario.player === undefined || w.f.side[i] === scenario.player
  const log: Stamped[] = []
  const hashes: HashPoint[] = []
  const dropped: Dropped[] = []
  const scene = buildScene(w)
  const layer = new SoldierLayer(w, scene)
  const map = new StaffMap(w, scene)
  const t0 = performance.now()
  map.buildBase((a, b) => {
    const c = document.createElement('canvas')
    c.width = a
    c.height = b
    return c
  })
  const buildMs = performance.now() - t0

  const mapC = document.getElementById('map') as HTMLCanvasElement
  const unitC = document.getElementById('units') as HTMLCanvasElement
  const mg = mapC.getContext('2d')!
  const ug = unitC.getContext('2d')!
  const DPR = Math.min(2, window.devicePixelRatio || 1)
  const [vx, vz, vk] = PAGE_VIEWS[scenario.name] ?? [-50, 0, 4]
  const view: View = { cx: vx, cz: vz, k: vk, W: 0, H: 0 }
  let mapDirty = true
  let speed = 1
  let acc = 0
  let showSlots = false
  let paused = false
  let simMs = 0
  let drawMs = 0
  let fps = 0
  const selected = new Set<number>()
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

  // commands from the player: stamped, logged, applied at the next tick
  const external = (c: Command) => issue(w, c, log)
  // a panel order also disarms a pending charge (C)
  const forSelection = (make: (h: number) => Command) => {
    charging = false
    for (const i of selected) external(make(formationHandle(w, i)))
  }
  // hash points without section hashes: those would cost a second serialization each time
  const tick = () => {
    const r = advanceTick(w)
    layer.sync(0, r.departed)
    dropped.push(...r.dropped)
    if (r.hash !== null) hashes.push({ tick: r.tick, hash: r.hash, sections: [] })
    for (const i of [...selected]) if (!w.f.alive[i]) selected.delete(i)
  }

  // the frame: ticks owed at the game speed, then the men (in game time), then the drawing
  const advance = (dt: number) => {
    const g = dt * speed
    acc += g
    const a = performance.now()
    let n = 0
    while (acc >= DT && n < 20) {
      tick()
      acc -= DT
      n++
    }
    if (n === 20) acc = 0
    const steps = Math.min(MEN_STEPS, Math.ceil(g / MEN_DT - 1e-9))
    for (let s = 0; s < steps; s++) layer.step(Math.min(MEN_DT, g / steps), acc / DT)
    simMs = simMs * 0.9 + (performance.now() - a) * 0.1
  }
  const draw = () => {
    if (mapDirty) {
      map.drawMap(mg, view)
      drawScale()
      mapDirty = false
    }
    const a = performance.now()
    map.drawUnits(ug, view, layer, selected, showSlots)
    drawMs = drawMs * 0.9 + (performance.now() - a) * 0.1
  }
  let last: number | null = null
  let frames = 0
  let fpsT = performance.now()
  const frame = (now: number) => {
    const dt = last === null ? 0 : Math.max(0, Math.min(0.1, (now - last) / 1000))
    last = now
    if (!paused) advance(dt)
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
    b.textContent = s ? `${s}×` : 'pause'
    b.dataset.speed = String(s)
    b.onclick = () => setSpeed(s)
    speedsEl.append(b)
  }
  const setSpeed = (s: number) => {
    speed = s
    document
      .querySelectorAll<HTMLElement>('[data-speed]')
      .forEach(e => e.classList.toggle('on', +e.dataset.speed! === s))
  }
  setSpeed(1)
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
      if (el.dataset.view === 'replay') saveSession()
    }
  })
  // the session (the replay, its hashes and the moments marked) as a downloaded file, for tools/battle-report.ts
  let note = ''
  let noteT = 0
  const saveSession = () => {
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(session())], { type: 'application/json' }))
    a.download = `${scenario.name}-${stamp}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000) // revoked at once, some browsers cancel the download
    note = 'session saved as a file'
    noteT = performance.now()
  }
  // M marks a moment of the playtest (docs/plans/active/s1e3-playtest.md): the prompt holds the page (and the
  // battle) while you say what happened; Cancel marks nothing. The report prints where everyone stood then
  const marks: { tick: number; note: string }[] = []
  const mark = (text?: string) => {
    const said = text ?? prompt('What happened here? (optional)')
    if (said === null) return
    marks.push({ tick: w.meta[M_TICK], note: said.trim() })
    note = `moment ${marks.length} marked`
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
    for (const u of layer.units.values()) {
      for (const m of u.men) {
        if (m.alive) {
          const d = (m.x - x) ** 2 + (m.z - z) ** 2
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
      for (const u of layer.units.values()) {
        if (mine(u.i) && u.men.some(m => m.alive && m.x > x0 && m.x < x1 && m.z > z0 && m.z < z1)) selected.add(u.i)
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
        else selected.add(hit)
      } else {
        selected.clear()
        selected.add(hit)
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
  addEventListener('blur', () => {
    space = false
  })
  addEventListener('keydown', e => {
    // space pans; a focused panel button must not take it as a click (it would repeat the order)
    if (e.code === 'Space') {
      space = true
      e.preventDefault()
      if (document.activeElement instanceof HTMLButtonElement) document.activeElement.blur()
    } else if (e.key === 'p' || e.key === 'P') {
      paused = !paused
    } else if (e.key === 'Escape') {
      selected.clear()
      charging = false
    } else if (e.key === 'c' || e.key === 'C') armCharge()
    else if ('1248'.includes(e.key)) setSpeed(+e.key)
    else if ((e.key === 'm' || e.key === 'M') && !e.metaKey && !e.ctrlKey && !e.altKey) mark() // not Cmd+M (minimise)
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
    // yours: the plan's refusals are not shown
    let d: Dropped | undefined
    for (let k = dropped.length - 1; k >= 0 && !d; k--) if (dropped[k].seq >= 0) d = dropped[k]
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
    statsEl.textContent =
      head.join('\n') +
      '\n' +
      (lines.length ? lines.join('\n') : 'nothing selected') +
      `\n\nt ${(w.meta[M_TICK] * DT).toFixed(1)} s · ${speed ? speed + '×' : 'paused'}${paused ? ' (P)' : ''}\nsim + men ${simMs.toFixed(2)} ms · draw ${drawMs.toFixed(2)} ms\nfps ${fps.toFixed(0)} · map built in ${buildMs.toFixed(0)} ms`
  }
  // the session as a replay (src/sim/replay.ts) with the hashes it must reproduce, as far as it has run:
  // commands issued while paused wait for their tick and are left out
  const replay = (): { replay: Replay; hashes: HashPoint[] } => ({
    replay: {
      simVersion: SIM_VERSION,
      dataVersion: data.version,
      ruleset: cr.hash,
      scenario: scenario.name,
      seed: PAGE_SEED,
      ticks: w.meta[M_TICK],
      log: log.filter(s => s.tick <= w.meta[M_TICK]),
    },
    hashes,
  })
  const session = () => ({ ...replay(), marks: [...marks] })

  // headless hooks (tools/app-check.mjs): orders and time without real time passing
  Object.assign(window, {
    APP: {
      w,
      layer,
      map,
      selected,
      log,
      hashes,
      dropped,
      select: (ids: number[]) => {
        selected.clear()
        for (const i of ids) if (mine(i)) selected.add(i)
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
      advance: (sec: number) => {
        paused = true
        const sp = speed
        speed = 1
        for (let n = Math.round(sec * 30); n > 0; n--) advance(1 / 30)
        speed = sp
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
        for (let n = 0; n < 20; n++) map.drawUnits(ug, view, layer, selected, false)
        return (performance.now() - a) / 20
      },
      mapMs: () => {
        const a = performance.now()
        map.drawMap(mg, view)
        return performance.now() - a
      },
      hash: () => hex(hashWorld(w)),
      replay,
      session,
      mark,
      stats: () => ({ simMs, drawMs, fps }),
      toS: (x: number, z: number) => toS(view, x, z),
      buildMs,
    },
  })
  requestAnimationFrame(frame)
}
main().catch(e => {
  console.error(e)
  document.getElementById('stats')!.textContent = String(e)
})
