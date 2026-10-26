// Headless check of the map draft page (docs/plans/done/m1-language.md M1b, acceptance 5): starts Vite's dev
// server, opens app/map.html in headless Chrome (tools/shot.mjs), and edits a map file from here, as an author
// saving it would:
//   1. a real change (the first height in the file): the page must recompile and redraw; the time from the save to
//      the redraw is measured and must stay under a second;
//   2. a broken file (invalid JSON): the page must show the error and keep the last good drawing;
//   3. the original back: the page must recompile clean;
//   4. each debug overlay (passability, depth, slope, sight from the map's centre) computed and painting cells, and
//      the lit view still able to draw once the overlay is off again;
//   5. the editor (M7a): the map's first line (not a barrier) selected, its middle point dragged through pointer
//      events, compiled from the page's copy, saved through the dev server (the file's diff: that feature's line
//      alone), undone and saved again (the file byte for byte the original); with the largest area selected, a click
//      on a line inside it selects the line; Cmd S with a list of the panel focused is the page's save, not the
//      browser's; a second pointer pressed during a press on the selection leaves the editor idle once both are up;
//      a point hovered and then zoomed away from is not the one Delete removes.
// The map file is always restored, even on failure. Prints every step and exits non-zero on any failure.
// Usage: node tools/map-page-check.mjs [outDir] [map]   (default: a temporary folder, maps/two-ridges.map.json)
import { spawn } from 'node:child_process'
import net from 'node:net'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = process.argv[2] ?? fs.mkdtempSync(path.join(os.tmpdir(), 'map-page-'))
const mapFile = path.resolve(ROOT, process.argv[3] ?? 'maps/two-ridges.map.json')
const mapName = path.basename(mapFile, '.map.json')
const mapId = JSON.parse(fs.readFileSync(mapFile, 'utf8')).id
const LIMIT_MS = 1000
// a free port, so the check never collides with another server (another worktree's, another session's)
const PORT = await new Promise((res, rej) => {
  const srv = net.createServer()
  srv.on('error', rej)
  srv.listen(0, '127.0.0.1', () => {
    const { port } = srv.address()
    srv.close(() => res(port))
  })
})
const original = fs.readFileSync(mapFile, 'utf8')
const sleep = ms => new Promise(r => setTimeout(r, ms))
let failed = 0
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`)
  if (!ok) failed++
}

// Vite in its own process group, so stopping it stops npx's child too; shot.mjs closes its Chrome on SIGINT
const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
})
let shot
let cleaned = false
const cleanup = () => {
  if (cleaned) return
  cleaned = true
  fs.writeFileSync(mapFile, original)
  shot?.kill('SIGINT')
  try {
    process.kill(-vite.pid, 'SIGTERM')
  } catch {
    /* already gone */
  }
}
process.on('exit', cleanup)
process.on('SIGINT', () => {
  cleanup()
  process.exit(130)
})
process.on('SIGTERM', () => {
  cleanup()
  process.exit(143)
})
try {
  await new Promise((res, rej) => {
    vite.stdout.on('data', d => {
      if (/Local:/.test(String(d))) res()
    })
    vite.on('exit', () => rej(new Error('vite exited')))
    setTimeout(() => rej(new Error('vite did not start')), 30000)
  })
  // the page: wait for the state each step expects, not for a count of compiles (one write may raise two change
  // events, and an overtaken compile is never logged), then report the latest compile
  const waitFor = (cond, tag) => [
    'eval',
    `new Promise(r => { const t = setInterval(() => { const L = MAP.log, last = L[L.length - 1]; if (${cond}) { clearInterval(t); r('${tag} ' + JSON.stringify({ log: last, issues: MAP.issues.length, compiled: MAP.compiled })) } }, 20) })`,
  ]
  // the overlays checked, by their setting's value, and the tag each reports under
  const OVERLAYS = [
    ['pass:line', 'OVpass'],
    ['depth', 'OVdepth'],
    ['slope', 'OVslope'],
    ['sight', 'OVsight'],
  ]
  const steps = [
    waitFor('last && last.reason === "load"', 'LOADED'),
    ['shot', 'draft'],
    waitFor('last && last.reason === "save" && MAP.issues.length === 0', 'SAVED'),
    waitFor('MAP.issues.length > 0', 'BROKEN'),
    waitFor('last && last.reason === "save" && MAP.issues.length === 0', 'RESTORED'),
    ['shot', 'draft-restored'],
    // the debug overlays (M6c): each one chosen, computed by the worker, and painting some cells
    ...OVERLAYS.map(([value, tag]) => [
      'eval',
      `new Promise(r => { const n = MAP.overlays; MAP.overlay('${value}', [0, 0]); const t = setInterval(() => { if (MAP.overlays > n) { clearInterval(t); r('${tag} ' + JSON.stringify({ cells: MAP.overlayCells, of: MAP.cells, ms: MAP.overlayMs })) } }, 20) })`,
    ]),
    ['shot', 'overlay-sight'],
    // and off again: the lit view must still be able to draw
    [
      'eval',
      `new Promise(r => { const n = MAP.overlays; MAP.overlay(''); const t = setInterval(() => { if (MAP.overlays > n) { clearInterval(t); setTimeout(() => r('OVnone ' + JSON.stringify({ cells: MAP.overlayCells, ready: MAP.litReady })), 300) } }, 20) })`,
    ],
    // the editor: drag the middle point of the map's first line, save, undo, save
    [
      'eval',
      `new Promise(r => {
        const f = JSON.parse(MAP.text).features.find(f => f.line && !String(f.kind).startsWith('barrier.'))
        const p = f.line[Math.floor(f.line.length / 2)]
        MAP.select(f.id)
        MAP.look(p[0], p[1], 2)
        const c = document.getElementById('map'), b = c.getBoundingClientRect()
        const [sx, sy] = MAP.project(p[0], p[1])
        const ev = (type, x) => c.dispatchEvent(new PointerEvent(type,
          { clientX: b.left + x, clientY: b.top + sy, bubbles: true, pointerId: 1, isPrimary: true }))
        const n = MAP.log.length
        ev('pointerdown', sx); ev('pointermove', sx + 20); ev('pointermove', sx + 40); ev('pointerup', sx + 40)
        const t = setInterval(() => {
          const last = MAP.log[MAP.log.length - 1]
          if (MAP.log.length > n && last.reason === 'edit') {
            clearInterval(t)
            r('EDITED ' + JSON.stringify({ id: f.id, selected: MAP.selected, dirty: MAP.dirty, issues: MAP.issues.length, ms: last.ms }))
          }
        }, 20)
      })`,
    ],
    ['shot', 'edited'],
    [
      'eval',
      `MAP.save().then(async ok => 'SAVEDIT ' + JSON.stringify({ ok, dirty: MAP.dirty,
        disk: await (await fetch('/maps/${mapName}.map.json', { cache: 'no-store' })).text() }))`,
    ],
    [
      'eval',
      `(async () => { MAP.undo(); const ok = await MAP.save(); return 'UNDONE ' + JSON.stringify({ ok, dirty: MAP.dirty,
        disk: await (await fetch('/maps/${mapName}.map.json', { cache: 'no-store' })).text() }) })()`,
    ],
    [
      'eval',
      `(() => {
        const fs = JSON.parse(MAP.text).features
        const area = fs.filter(f => f.area).sort((a, b) => JSON.stringify(b.area).length - JSON.stringify(a.area).length)[0]
        const line = fs.find(f => f.line && f.id !== area.id)
        const p = line.line[Math.floor(line.line.length / 2)]
        MAP.select(area.id)
        MAP.look(p[0], p[1], 2)
        const c = document.getElementById('map'), b = c.getBoundingClientRect()
        const [sx, sy] = MAP.project(p[0], p[1])
        for (const type of ['pointerdown', 'pointerup']) c.dispatchEvent(new PointerEvent(type,
          { clientX: b.left + sx, clientY: b.top + sy, bubbles: true, pointerId: 1, isPrimary: true }))
        return 'RESELECT ' + JSON.stringify({ area: area.id, line: line.id, selected: MAP.selected })
      })()`,
    ],
    [
      'eval',
      `(() => {
        const sel = document.getElementById('overlay')
        sel.focus()
        const ev = new KeyboardEvent('keydown', { key: 's', metaKey: true, bubbles: true, cancelable: true })
        sel.dispatchEvent(ev)
        return 'KEYS ' + JSON.stringify({ taken: ev.defaultPrevented })
      })()`,
    ],
    [
      'eval',
      `(() => {
        const f = JSON.parse(MAP.text).features.find(f => f.line && !String(f.kind).startsWith('barrier.'))
        const p = f.line[0]
        MAP.select(f.id)
        MAP.look(p[0], p[1], 2)
        const c = document.getElementById('map'), b = c.getBoundingClientRect()
        const [sx, sy] = MAP.project(p[0], p[1])
        const ev = (type, id, x) => c.dispatchEvent(new PointerEvent(type,
          { clientX: b.left + x, clientY: b.top + sy, bubbles: true, pointerId: id, isPrimary: id === 1 }))
        ev('pointerdown', 1, sx)
        ev('pointerdown', 2, sx + 200)
        ev('pointerup', 2, sx + 200)
        ev('pointerup', 1, sx)
        return 'TWO ' + JSON.stringify({ idle: MAP.idle, dirty: MAP.dirty })
      })()`,
    ],
    [
      'eval',
      `(() => {
        const f = JSON.parse(MAP.text).features.find(f => f.line && f.line.length > 2 && !String(f.kind).startsWith('barrier.'))
        const p = f.line[1]
        MAP.select(f.id)
        MAP.look(p[0], p[1], 2)
        const c = document.getElementById('map'), b = c.getBoundingClientRect()
        const [sx, sy] = MAP.project(p[0], p[1])
        const at = { clientX: b.left + sx + 30, clientY: b.top + sy, bubbles: true }
        // the pointer on the point, then zooming in about a place 30 px off it carries the point out of reach
        c.dispatchEvent(new PointerEvent('pointermove', { ...at, clientX: b.left + sx, pointerId: 1 }))
        c.dispatchEvent(new WheelEvent('wheel', { ...at, deltaY: -1500, cancelable: true }))
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }))
        const after = JSON.parse(MAP.text).features.find(g => g.id === f.id)
        // the stale point must not go: the feature keeps every point, or (the pointer now off it) goes whole
        const kept = !after || after.line.length === f.line.length
        if (MAP.dirty) MAP.undo()
        return 'ZOOM ' + JSON.stringify({ kept, dirty: MAP.dirty })
      })()`,
    ],
  ]
  shot = spawn(
    'node',
    [
      path.join(ROOT, 'tools/shot.mjs'),
      `http://localhost:${PORT}/app/map.html?map=${mapName}`,
      outDir,
      '1400',
      '900',
      JSON.stringify(steps),
    ],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, SHOT_TIMEOUT_S: '30' } },
  )
  const seen = {}
  const done = new Promise(res => shot.on('exit', code => res(code)))
  shot.stdout.on('data', d => {
    for (const line of String(d).split('\n').filter(Boolean)) {
      console.log('  page:', line.slice(0, 220))
      const m = /^EVAL "(\w+) (.*)"$/.exec(line)
      if (m) seen[m[1]] = JSON.parse(JSON.parse(`"${m[2]}"`))
      if (line.startsWith('shot ')) seen[`shot:${line.slice(5)}`] = true
    }
  })
  const until = async tag => {
    for (let t = 0; t < 600 && !seen[tag]; t++) await sleep(50)
    if (!seen[tag]) throw new Error(`the page never reported ${tag}`)
  }

  await until('LOADED')
  check(
    seen.LOADED.issues === 0 && seen.LOADED.compiled !== null,
    `the page compiled ${mapName} on load (${seen.LOADED.log.ms.toFixed(0)} ms)`,
  )
  // a screenshot blocks the page's thread in headless Chrome: save only once it is taken
  await until('shot:draft')
  await sleep(300)
  // a real edit: the first height in the file, one metre higher
  const edited = original.replace(/"height": ?(-?\d+(\.\d+)?)/, (_, v) => `"height": ${Number(v) + 1}`)
  if (edited === original) throw new Error('the edit found nothing to change (expected a "height" in the map)')
  const savedAt = Date.now()
  fs.writeFileSync(mapFile, edited)
  await until('SAVED')
  const latency = seen.SAVED.log.drawnAt - savedAt
  check(
    seen.SAVED.issues === 0 && seen.SAVED.log.reason === 'save',
    `a save recompiled and redrew the page: ${latency} ms from the save to the redraw (limit ${LIMIT_MS} ms; the compile itself ${seen.SAVED.log.ms.toFixed(0)} ms)`,
  )
  check(
    latency < LIMIT_MS,
    `the redraw came within ${LIMIT_MS} ms (the server saw the save after ${seen.SAVED.log.savedAt - savedAt} ms)`,
  )
  await sleep(300)
  fs.writeFileSync(mapFile, original.slice(0, original.length / 2))
  await until('BROKEN')
  check(
    seen.BROKEN.issues > 0 && seen.BROKEN.compiled === mapId,
    `a broken file shows ${seen.BROKEN.issues} error(s) and keeps the last good drawing (${seen.BROKEN.compiled})`,
  )
  await sleep(300)
  fs.writeFileSync(mapFile, original)
  await until('RESTORED')
  check(seen.RESTORED.issues === 0, 'the restored file compiles clean')
  for (const [value, tag] of OVERLAYS) {
    await until(tag)
    check(
      seen[tag].cells > 0 && (tag !== 'OVsight' || seen[tag].cells < seen[tag].of),
      `the ${value} overlay paints ${seen[tag].cells} cells (${seen[tag].ms.toFixed(0)} ms in the worker)`,
    )
  }
  await until('OVnone')
  check(seen.OVnone.cells === 0 && seen.OVnone.ready, 'with the overlay off again, the lit view still draws')
  await until('EDITED')
  check(
    seen.EDITED.selected === seen.EDITED.id && seen.EDITED.dirty && seen.EDITED.issues === 0,
    `a drag moved a point of ${seen.EDITED.id}, compiled from the page's copy in ${seen.EDITED.ms.toFixed(0)} ms`,
  )
  await until('SAVEDIT')
  const was = original.split('\n')
  const diff = seen.SAVEDIT.disk.split('\n').flatMap((l, k) => (l === was[k] ? [] : [l]))
  check(
    seen.SAVEDIT.ok &&
      !seen.SAVEDIT.dirty &&
      seen.SAVEDIT.disk.split('\n').length === was.length &&
      diff.length === 1 &&
      diff[0].includes(`"id":"${seen.EDITED.id}"`),
    `the save wrote the file with one line changed, ${seen.EDITED.id}'s (${diff.length} changed)`,
  )
  await until('UNDONE')
  check(
    seen.UNDONE.ok && !seen.UNDONE.dirty && seen.UNDONE.disk === original,
    'undone and saved, the file is byte for byte the original',
  )
  await until('KEYS')
  check(seen.KEYS.taken, "Cmd S with the overlay list focused is the page's save, not the browser's")
  await until('TWO')
  check(seen.TWO.idle && !seen.TWO.dirty, 'a second pointer during a press leaves the editor idle once both are up')
  await until('ZOOM')
  check(seen.ZOOM.kept, 'a point hovered before a zoom is not removed by Delete once it is far from the pointer')
  await until('RESELECT')
  check(
    seen.RESELECT.selected === seen.RESELECT.line,
    `with ${seen.RESELECT.area} selected, a click on ${seen.RESELECT.line} inside it selects ${seen.RESELECT.selected}`,
  )
  const code = await done
  check(code === 0, `the page had no exceptions or console errors (shot.mjs exit ${code})`)
} catch (e) {
  console.log('FAIL', e.message)
  failed++
} finally {
  cleanup()
}
console.log(`${failed ? 'FAILED' : 'passed'}; screenshots in ${outDir}`)
process.exit(failed ? 1 : 0)
