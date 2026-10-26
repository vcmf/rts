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
//      a point hovered and then zoomed away from is not the one Delete removes;
//   6. a new map (M7b) made in the panel and drawn by clicks: a base, a meadow (an area), a stream (a line), a ford on
//      it and a bridge (references by clicking their targets), a road, a hedge (a barrier) and a hill (a circle);
//      saved, the new file must validate with no problem and read back unchanged, and one more feature saved must
//      change one line. The new file is removed at the end;
//   7. the fields form (M7c), on the map first opened: a note and another feature's attribute set through the form's
//      inputs, the saved diff their lines alone, undone and saved back to the original bytes; text typed and not
//      applied kept, applied before a press on the map, left typed by the undo button; JSON refused kept with why.
//   8. generators (M7d), on the map first opened: a generator removed and chosen again for a clump's feature and a
//      parameter set through the form, the expansion redrawn, the saved diff that line alone; a village asked for more
//      houses than fit shows the expansion's problem under its generator; Pin refused while a field holds text it
//      could not apply, and with text typed applies it alone; the village pinned and saved (its line
//      rewritten, its houses appended, nothing else), the page compiling the same houses; all undone and saved back to
//      the original bytes;
//   9. a scan (M7e): a test image added to the map's sources, shown over the map, three control points added by clicks
//      (each block of the image then on its place), saved (only the sources changed), undone back to the original
//      bytes.
// The map file is always restored, even on failure. Prints every step and exits non-zero on any failure.
// Usage: node tools/map-page-check.mjs [outDir] [map]   (default: a temporary folder, maps/two-ridges.map.json)
import { spawn } from 'node:child_process'
import { write as writePng } from './png.mjs'
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
// the new map the check draws (step 6), removed at the end
const NEW = `check-new-${process.pid}`
const newFile = path.join(ROOT, 'maps', `${NEW}.map.json`)
// the test scan (step 9): 200 × 100 px, white, with a red, a blue and a green block; removed at the end
const SCAN = `check-${process.pid}`
const scanFile = path.join(ROOT, 'maps', 'scans', `${SCAN}.png`)
{
  const w = 200
  const h = 100
  const data = Buffer.alloc(w * h * 4, 255)
  const block = (u0, v0, rgb) => {
    for (let v = v0; v < v0 + 20; v++) {
      for (let u = u0; u < u0 + 20; u++) data.set([...rgb, 255], (v * w + u) * 4)
    }
  }
  block(40, 40, [220, 0, 0])
  block(140, 40, [0, 0, 220])
  block(90, 70, [0, 160, 0])
  fs.mkdirSync(path.dirname(scanFile), { recursive: true })
  fs.writeFileSync(scanFile, writePng({ w, h, data }))
}
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
  fs.rmSync(newFile, { force: true })
  fs.rmSync(scanFile, { force: true })
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
    // the fields form (M7c): a note on one feature, a ridge's width, through the form; save; undo both, save
    [
      'eval',
      `(async () => {
        const named = JSON.parse(MAP.text).features.filter(f => f.on || f.crosses || f.carries).map(f => [f.on, f.crosses, f.carries]).flat()
        const target = JSON.parse(MAP.text).features.find(f => named.includes(f.id) && f.line)
        const other = JSON.parse(MAP.text).features.find(f => f.kind === 'relief.ridge')
        const q = key => document.querySelector('#form [data-key="' + key + '"]')
        const field = (key, value) => {
          const input = q(key)
          if (!input) throw new Error('no field ' + key)
          input.value = value
          input.dispatchEvent(new Event('input'))
          input.dispatchEvent(new Event('change'))
        }
        const escape = key => q(key).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        MAP.select(target.id)
        // a note keeps its line breaks; an id is not edited in the page
        field('note', 'used in 1805\\nsee the survey')
        const noteKept = JSON.parse(MAP.text).features.find(f => f.id === target.id).note === 'used in 1805\\nsee the survey'
        const idFixed = q('id').readOnly
        // a kind changed: the form is built again, and the focus stays in it (on the page, Backspace would delete)
        q('kind').focus()
        field('kind', 'relief.ridge')
        const focusInForm = document.getElementById('form').contains(document.activeElement)
        document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }))
        const notDeleted = JSON.parse(MAP.text).features.some(f => f.id === target.id)
        MAP.undo()
        MAP.select(other.id)
        // JSON refused: the text stays as typed, with why, and Escape drops it
        field('seasons', '{"winter": ')
        const refused = q('seasons').value === '{"winter": ' && /not applied: .*no JSON/.test(q('seasons').closest('.row').textContent)
        escape('seasons')
        const dropped = q('seasons').value === ''
        // a change applied as the focus moves on (Tab, a click): the next field is the same element after the edit
        const next = q('height')
        field('width', String((other.width ?? 100) + 7))
        const kept = next.isConnected && q('height') === next
        const noteBox = q('note').tagName === 'TEXTAREA'
        const jsonRead = document.querySelector('#form textarea.json').readOnly
        // text typed and not applied, then a press on the map: applied before the press acts
        q('height').value = '33'
        q('height').dispatchEvent(new Event('input'))
        const c = document.getElementById('map'), b = c.getBoundingClientRect()
        const ptr = { clientX: b.left + 5, clientY: b.top + b.height - 5, bubbles: true, pointerId: 1, isPrimary: true }
        c.dispatchEvent(new PointerEvent('pointerdown', ptr))
        c.dispatchEvent(new PointerEvent('pointerup', ptr))
        const flushed = JSON.parse(MAP.text).features.find(f => f.id === other.id).height === 33
        MAP.select(other.id)
        MAP.undo()
        // a field typed in and not applied is left as typed when the form is refreshed from elsewhere (an edit undone)
        q('note').value = 'half typed'
        q('note').dispatchEvent(new Event('input'))
        field('height', '44')
        MAP.undo()
        const typedKept = q('note').value === 'half typed'
        escape('note')
        // Cmd Z in a box outside the form (the add box's id) is that box's own text undo, not the map's
        const textBefore = MAP.text
        const addId = document.getElementById('addId')
        addId.focus()
        addId.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, cancelable: true }))
        const ownUndo = MAP.text === textBefore
        addId.blur()
        const ok = await MAP.save()
        const disk = await (await fetch('/maps/${mapName}.map.json', { cache: 'no-store' })).text()
        const issues = MAP.issues.length
        // Cmd S with text a field refused: no save (what the field shows is not in the copy)
        field('seasons', '{"winter": ')
        q('seasons').focus()
        q('seasons').dispatchEvent(new KeyboardEvent('keydown', { key: 's', metaKey: true, bubbles: true, cancelable: true }))
        const notSaved = /could not apply.*not saved/.test(document.getElementById('editState').textContent)
        escape('seasons')
        // the undo button with text typed in a field: the press keeps the focus in the field (no change applies the
        // text), the edit before it is undone, the text stays typed
        q('height').focus()
        q('height').value = '55'
        q('height').dispatchEvent(new Event('input'))
        const undo = document.getElementById('undo')
        const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
        undo.dispatchEvent(press)
        undo.click()
        const undoKeeps =
          press.defaultPrevented &&
          q('height').value === '55' &&
          JSON.parse(MAP.text).features.find(f => f.id === other.id).width === other.width
        escape('height')
        MAP.undo()
        const back = await MAP.save()
        const after = await (await fetch('/maps/${mapName}.map.json', { cache: 'no-store' })).text()
        return 'FIELDS ' + JSON.stringify({ ok, back, disk, after, issues, target: target.id, other: other.id, noteKept, idFixed, refused, dropped, kept, noteBox, jsonRead, flushed, typedKept, ownUndo, undoKeeps, notSaved, focusInForm, notDeleted })
      })()`,
    ],
    // generators (M7d): a clump's generator chosen again and a parameter set; a village's problem; the village pinned
    [
      'eval',
      `(async () => {
        const sleep = ms => new Promise(r => setTimeout(r, ms))
        const until = async cond => { for (let t = 0; t < 600 && !cond(); t++) await sleep(25); if (!cond()) throw new Error('timed out') }
        // the compile of the copy as it is now: logged once it is drawn (an overtaken one never is)
        const compiled = async edit => { const n = MAP.log.length; edit(); await until(() => MAP.log.length > n) }
        const q = key => document.querySelector('#form [data-key="' + key + '"]')
        const field = (key, value) => {
          const input = q(key)
          if (!input) throw new Error('no field ' + key)
          input.value = value
          input.dispatchEvent(new Event('input'))
          input.dispatchEvent(new Event('change'))
        }
        const features = () => JSON.parse(MAP.text).features
        const clumped = features().find(f => f.gen && f.gen.clump)
        const village = features().find(f => f.gen && f.gen['street-village'])
        if (!clumped || !village) throw new Error('the map has no clump or no village')
        MAP.select(clumped.id)
        const before = JSON.stringify(MAP.expanded(clumped.id).area)
        await compiled(() => field('gen', ''))
        const removed = features().find(f => f.id === clumped.id).gen === undefined && !q('gen:coherence')
        await compiled(() => field('gen', 'clump'))
        const chosen = JSON.stringify(features().find(f => f.id === clumped.id).gen) === '{"clump":{}}' && !!q('gen:coherence')
        await compiled(() => field('gen:coherence', String(clumped.gen.clump.coherence ?? 0.5) === '0.9' ? '0.2' : '0.9'))
        const redrawn = MAP.issues.length === 0 && JSON.stringify(MAP.expanded(clumped.id).area) !== before
        const paramOk = q('gen:coherence').closest('.row').querySelector('.hint').textContent.includes('0 to 1')
        const ok = await MAP.save()
        const disk = await (await fetch('/maps/${mapName}.map.json', { cache: 'no-store' })).text()
        MAP.undo(); MAP.undo(); MAP.undo()
        // the expansion's own problem, under the generator
        MAP.select(village.id)
        await compiled(() => field('gen:min', '400'))
        const genRow = q('gen').closest('.row').querySelector('.bads').textContent
        const shortShown = /placed \\d+ of \\d+ houses/.test(genRow)
        await compiled(() => MAP.undo())
        return 'GENS ' + JSON.stringify({ ok, disk, clumped: clumped.id, village: village.id, removed, chosen, redrawn, paramOk, shortShown, genRow, issues: MAP.issues.length })
      })()`,
    ],
    // pinning (M7d): refused with text a field refused; the village pinned, saved, undone
    [
      'eval',
      `(async () => {
        const sleep = ms => new Promise(r => setTimeout(r, ms))
        const until = async cond => { for (let t = 0; t < 600 && !cond(); t++) await sleep(25); if (!cond()) throw new Error('timed out') }
        // the compile of the copy as it is now: logged once it is drawn (an overtaken one never is)
        const compiled = async edit => { const n = MAP.log.length; edit(); await until(() => MAP.log.length > n) }
        const q = key => document.querySelector('#form [data-key="' + key + '"]')
        const field = (key, value) => {
          const input = q(key)
          if (!input) throw new Error('no field ' + key)
          input.value = value
          input.dispatchEvent(new Event('input'))
          input.dispatchEvent(new Event('change'))
        }
        const features = () => JSON.parse(MAP.text).features
        const village = features().find(f => f.gen && f.gen['street-village'])
        MAP.select(village.id)
        // text a field refused: no pin (the rows it takes away would lose the text), and why
        field('seasons', '{"winter": ')
        const textBefore = MAP.text
        document.getElementById('pin').click()
        const notPinned = MAP.text === textBefore && /could not apply.*not pinned/.test(document.getElementById('editState').textContent) && q('seasons').value === '{"winter": '
        q('seasons').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        // pinned: one edit, saved; the page compiles the same houses
        // text typed in a parameter and not applied, then Pin: the text is applied (its own edit), nothing pinned yet
        q('gen:min').value = '1'
        q('gen:min').dispatchEvent(new Event('input'))
        await compiled(() => document.getElementById('pin').click())
        const typedFirst = features().find(f => f.id === village.id).gen?.['street-village']?.min === 1 && /Pin again/.test(document.getElementById('editState').textContent)
        await compiled(() => MAP.undo())
        // every house the village makes, in order
        const housesOf = () => { const out = []; for (let k = 1, h; (h = MAP.expanded(village.id + '-' + k)); k++) out.push(h.area); return JSON.stringify(out) }
        const houses = housesOf()
        await compiled(() => document.getElementById('pin').click())
        const pinnedOk = features().find(f => f.id === village.id).gen === undefined && MAP.selected === village.id
        const sameHouses = MAP.issues.length === 0 && houses !== '[]' && housesOf() === houses
        const pinOk = await MAP.save()
        const pinDisk = await (await fetch('/maps/${mapName}.map.json', { cache: 'no-store' })).text()
        MAP.undo()
        const back = await MAP.save()
        const after = await (await fetch('/maps/${mapName}.map.json', { cache: 'no-store' })).text()
        return 'PIN ' + JSON.stringify({ village: village.id, pinnedOk, notPinned, typedFirst, sameHouses, pinOk, pinDisk, back, after })
      })()`,
    ],
    // a scan to trace from (M7e): added in the map's sources, shown, three control points by clicks, saved, undone
    [
      'eval',
      `(async () => {
        const sleep = ms => new Promise(r => setTimeout(r, ms))
        const until = async cond => { for (let t = 0; t < 600 && !cond(); t++) await sleep(25); if (!cond()) throw new Error('timed out') }
        const compiled = async edit => { const n = MAP.log.length; edit(); await until(() => MAP.log.length > n) }
        const q = key => document.querySelector('#form [data-key="' + key + '"]')
        const field = (key, value) => {
          const input = q(key)
          if (!input) throw new Error('no field ' + key)
          input.value = value
          input.dispatchEvent(new Event('input'))
          input.dispatchEvent(new Event('change'))
        }
        const c = document.getElementById('map'), b = c.getBoundingClientRect()
        const at = (x, z) => { const s = MAP.project(x, z); return { clientX: b.left + s[0], clientY: b.top + s[1], bubbles: true, pointerId: 1, isPrimary: true } }
        const click = (x, z) => { for (const t of ['pointerdown', 'pointerup']) c.dispatchEvent(new PointerEvent(t, at(x, z))) }
        // the overlay's colour at a map point
        const colour = (x, z) => { const s = MAP.project(x, z); const d = devicePixelRatio; return [...c.getContext('2d').getImageData(Math.round(s[0] * d), Math.round(s[1] * d), 1, 1).data] }
        const red = px => px[0] > 150 && px[1] < 90 && px[2] < 90
        MAP.fit() // the whole map in view: an earlier step zoomed in
        MAP.select(null)
        const sources = JSON.parse(MAP.text).sources ?? []
        await compiled(() => field('sources', JSON.stringify([...sources, { id: 'check', kind: 'scan', file: 'scans/${SCAN}.png' }])))
        document.getElementById('scanbox').open = true
        const pick = document.getElementById('scanPick')
        pick.value = 'check'
        pick.dispatchEvent(new Event('change'))
        const opacity = document.getElementById('scanOpacity')
        opacity.value = '1'
        opacity.dispatchEvent(new Event('input'))
        await until(() => document.getElementById('scanState').textContent.startsWith('200 × 100'))
        await sleep(100)
        MAP.draw()
        // the red block's centre, as the scan lies over the map with no point yet
        const before = MAP.scanAt(50, 50)
        const shown = red(colour(...before))
        // three points: each block's centre clicked on the scan, then its place on the map
        const target = [[50, 50, -300, 200], [150, 50, 300, 220], [100, 80, 0, -100]]
        for (const [u, v, x, z] of target) {
          document.getElementById('scanAdd').click()
          click(...MAP.scanAt(u, v))
          await sleep(700) // apart, so the next click is no double click
          click(x, z)
          await sleep(700)
        }
        const points = JSON.parse(MAP.text).sources.find(s => s.id === 'check').points ?? []
        const placed = target.every(([u, v, x, z]) => { const p = MAP.scanAt(u, v); return Math.hypot(p[0] - x, p[1] - z) < 1 })
        MAP.draw()
        // inside the red block, clear of its control point's marker (drawn on the point itself)
        const moved = red(colour(...MAP.scanAt(57, 57))) && !red(colour(...before))
        const state = document.getElementById('scanState').textContent
        const listed = document.querySelectorAll('#scanPoints li').length
        const ms = MAP.traceMs
        const ok = await MAP.save()
        const disk = await (await fetch('/maps/${mapName}.map.json', { cache: 'no-store' })).text()
        for (let k = 0; k < 4; k++) MAP.undo()
        const back = await MAP.save()
        const after = await (await fetch('/maps/${mapName}.map.json', { cache: 'no-store' })).text()
        return 'SCAN ' + JSON.stringify({ shown, points: points.length, placed, moved, state, listed, ms, ok, disk, back, after })
      })()`,
    ],
    // a new map drawn from scratch (M7b): the panel's form, then each feature by clicks on the map
    [
      'eval',
      `(async () => {
        const sleep = ms => new Promise(r => setTimeout(r, ms))
        const until = async cond => { for (let t = 0; t < 400 && !cond(); t++) await sleep(25); if (!cond()) throw new Error('timed out') }
        const set = (id, v) => { document.getElementById(id).value = v }
        document.getElementById('newbox').open = true
        set('newId', '${NEW}'); set('newName', 'Check'); set('newSize', '1200'); set('newPlay', '1000'); set('newSeed', '7')
        document.getElementById('newMake').click()
        await until(() => MAP.compiled === '${NEW}')
        const c = document.getElementById('map'), b = c.getBoundingClientRect()
        const at = (x, z) => { const s = MAP.project(x, z); return { clientX: b.left + s[0], clientY: b.top + s[1], bubbles: true, pointerId: 1, isPrimary: true } }
        const click = (x, z) => { for (const t of ['pointerdown', 'pointerup']) c.dispatchEvent(new PointerEvent(t, at(x, z))) }
        const key = k => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))
        const prompts = []
        const draw = (kind, shape, id, pts, end) => {
          if (!MAP.add(kind, shape, id)) throw new Error('not started: ' + id)
          for (const p of pts) { prompts.push(MAP.prompt); click(...p) }
          if (end) key('Enter')
          if (MAP.drawing) throw new Error(id + ' still drawing: ' + MAP.prompt)
        }
        draw('relief.base', 'none', 'terrain', [])
        draw('ground.meadow', 'area', 'meadow', [[-500, -500], [500, -500], [500, 500], [-500, 500]], true)
        draw('water.stream', 'line', 'brook', [[-550, 20], [0, -10], [550, 30]], true)
        draw('water.ford', 'none', 'ford', [[-300, 6.4], [-250, 4]])
        draw('way.road.lane', 'line', 'road', [[60, -550], [70, 550]], true)
        draw('built.bridge', 'none', 'bridge', [[63.2, -200], [300, 11.8]], true)
        draw('barrier.hedge', 'line', 'hedge', [[-200, -300], [-100, -300], [-100, -200]], true)
        draw('relief.hill', 'circle', 'hill', [[300, -300], [380, -300]])
        // the panel's draw button, then Escape where the focus then is: the map takes the drawing's keys
        set('addKind', 'way.path'); document.getElementById('addKind').dispatchEvent(new Event('change'))
        document.getElementById('addGo').click()
        const started = MAP.drawing
        document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
        const escaped = started && !MAP.drawing
        const n = MAP.log.length
        await until(() => MAP.log.length > n && MAP.idle)
        await sleep(300)
        const ok = await MAP.save()
        const disk = await (await fetch('/maps/${NEW}.map.json', { cache: 'no-store' })).text()
        return 'NEWMAP ' + JSON.stringify({ ok, disk, text: MAP.text, dirty: MAP.dirty, noFile: MAP.noFile,
          issues: MAP.issues, prompts, escaped, features: JSON.parse(MAP.text).features })
      })()`,
    ],
    ['shot', 'new-map'],
    [
      'eval',
      `(async () => {
        const c = document.getElementById('map'), b = c.getBoundingClientRect()
        const s = MAP.project(-300, 300)
        MAP.add('relief.hill', 'point', 'knoll')
        for (const t of ['pointerdown', 'pointerup']) c.dispatchEvent(new PointerEvent(t,
          { clientX: b.left + s[0], clientY: b.top + s[1], bubbles: true, pointerId: 1, isPrimary: true }))
        const ok = await MAP.save()
        const disk = await (await fetch('/maps/${NEW}.map.json', { cache: 'no-store' })).text()
        // from here the page notes the file going (Node deletes it once it reads this step), so the next step cannot
        // miss it
        window.__gone = false
        const watch = setInterval(() => { if (MAP.noFile) { window.__gone = true; clearInterval(watch) } }, 10)
        return 'NEWEDIT ' + JSON.stringify({ ok, disk })
      })()`,
    ],
    // the new file deleted and written again with the same bytes from here (a safe write, a checkout): the page sees
    // it go and come back, and ends with no conflict and the file there
    [
      'eval',
      `(async () => {
        const sleep = ms => new Promise(r => setTimeout(r, ms))
        for (let t = 0; t < 400 && !(window.__gone && !MAP.noFile); t++) await sleep(25)
        await sleep(300)
        return 'RECREATED ' + JSON.stringify({ gone: window.__gone, noFile: MAP.noFile, conflict: MAP.conflict, dirty: MAP.dirty })
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
    // a step may wait on several compiles (about 0.75 s each, several times that under other sessions' load)
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, SHOT_TIMEOUT_S: '90' } },
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
  await until('FIELDS')
  const fl = seen.FIELDS
  const changed = fl.disk.split('\n').filter((l, k) => l !== was[k])
  const changedIds = changed.map(l => /"id": ?"([^"]+)"/.exec(l)?.[1]).sort()
  check(
    fl.ok &&
      fl.issues === 0 &&
      fl.disk.split('\n').length === was.length &&
      JSON.stringify(changedIds) === JSON.stringify([fl.target, fl.other].sort()),
    `through the form, ${fl.target}'s note and ${fl.other}'s width set: the lines of ${changedIds.join(', ')} changed`,
  )
  check(fl.back && fl.after === original, 'both undone and saved, the file is byte for byte the original')
  check(fl.noteKept && fl.noteBox, 'a note is edited in a text box, its line breaks kept')
  check(fl.idFixed, "a feature's id is read-only in the form (its text can be copied)")
  check(
    fl.focusInForm && fl.notDeleted,
    'the form built again keeps the focus in it, and Backspace there deletes nothing',
  )
  check(fl.refused && fl.dropped, 'JSON a field refuses stays typed with why; Escape drops it')
  check(fl.kept, 'the field the focus moved to is still the same after the edit the move applied')
  check(fl.jsonRead, "the feature's JSON is to read only")
  check(fl.ownUndo, "Cmd Z in a box outside the form is the box's own, never the map's undo")
  check(fl.flushed, 'text typed in a field and not applied is applied before a press on the map acts')
  check(fl.typedKept, 'a field typed in and not applied is left as typed when the form is refreshed')
  check(fl.undoKeeps, 'the undo button keeps the focus in a field holding text, undoes the edit before, the text stays')
  check(fl.notSaved, 'Cmd S with text a field refused does not save, and says why')
  await until('GENS')
  const gn = seen.GENS
  const lineDiff = (a, b) => {
    const A = a.split('\n').map(l => l.replace(/,$/, ''))
    const B = b.split('\n').map(l => l.replace(/,$/, ''))
    return { gone: A.filter(l => !B.includes(l)), added: B.filter(l => !A.includes(l)) }
  }
  const idOf = l => {
    try {
      return JSON.parse(l.trim()).id
    } catch {
      return null
    }
  }
  const cd = lineDiff(original, gn.disk)
  check(
    gn.ok &&
      gn.removed &&
      gn.chosen &&
      cd.gone.map(idOf).join() === gn.clumped &&
      cd.added.map(idOf).join() === gn.clumped,
    `${gn.clumped}'s generator removed, chosen again and a parameter set through the form: its line alone changed`,
  )
  check(gn.redrawn, `the expansion redrawn on the change (${gn.clumped}'s outline moved, no problem)`)
  check(gn.paramOk, "a parameter's row shows its range")
  check(
    gn.shortShown,
    `a village asked for more houses than fit: the expansion's problem under its generator (${gn.genRow})`,
  )
  await until('PIN')
  const pn = seen.PIN
  const pd = lineDiff(original, pn.pinDisk)
  const houseLines = pd.added.filter(l => String(idOf(l)).startsWith(pn.village + '-'))
  check(
    pn.pinOk &&
      pn.pinnedOk &&
      pd.gone.map(idOf).join() === pn.village &&
      pd.added.length === houseLines.length + 1 &&
      houseLines.length > 0,
    `${pn.village} pinned and saved: its line rewritten, ${houseLines.length} houses appended, nothing else`,
  )
  check(pn.sameHouses, 'the page compiles the pinned houses where it generated them')
  check(pn.notPinned, 'Pin with text a field refused does not pin, keeps the text, and says why')
  check(pn.typedFirst, 'Pin with text typed and not applied applies it as its own edit and pins nothing yet')
  check(pn.back && pn.after === original, 'all undone and saved, the file is byte for byte the original')
  await until('SCAN')
  const sc = seen.SCAN
  check(sc.shown, 'a scan added to the map shows over it, before any control point')
  check(
    sc.points === 3 && sc.placed && sc.listed === 3 && /three points/.test(sc.state),
    `three control points added by clicks, each pixel now on its place (${sc.state})`,
  )
  check(sc.moved, 'the scan is drawn where its points put it')
  const sd = lineDiff(original, sc.disk)
  const without = t => JSON.stringify({ ...JSON.parse(t), sources: undefined })
  check(
    sc.ok && sd.gone.length === 0 && without(sc.disk) === without(original),
    `saved: only the sources changed (${sd.added.length} lines added, none of the file's changed)`,
  )
  check(sc.back && sc.after === original, 'undone and saved, the file is byte for byte the original')
  console.log(`  the scan's draw: ${sc.ms.toFixed(1)} ms`)
  await until('NEWMAP')
  const nm = seen.NEWMAP
  const ids = nm.features.map(f => f.id).join(',')
  check(
    ids === 'terrain,meadow,brook,ford,road,bridge,hedge,hill',
    `a new map drawn by clicks: ${ids} (prompts: ${[...new Set(nm.prompts)].join(' | ')})`,
  )
  check(nm.escaped, "after the panel's draw button, Escape drops the drawing (the map has the focus)")
  const ford = nm.features.find(f => f.id === 'ford')
  const bridge = nm.features.find(f => f.id === 'bridge')
  check(
    ford?.on === 'brook' && Array.isArray(ford.near) && bridge?.carries === 'road' && bridge.crosses === 'brook',
    `references set by clicking their targets: ford ${JSON.stringify(ford)}, bridge ${JSON.stringify(bridge)}`,
  )
  const { validate } = await import('../src/map/validate.ts')
  const kinds = JSON.parse(fs.readFileSync(path.join(ROOT, 'maps', 'kinds.json'), 'utf8'))
  // the file as the page fetched it after its first save (the next step saves again)
  const onDisk = nm.disk
  const problems = onDisk ? validate(JSON.parse(onDisk), kinds) : ['no file']
  check(
    nm.ok && !nm.dirty && !nm.noFile && nm.issues.length === 0 && problems.length === 0,
    `the first save created maps/${NEW}.map.json, which validates (${JSON.stringify(problems).slice(0, 300)})`,
  )
  check(nm.text === onDisk, 'the page reads the new file back unchanged')
  await until('NEWEDIT')
  const lines = t => t.split('\n').map(l => l.replace(/,$/, ''))
  const added = lines(seen.NEWEDIT.disk).filter(l => !lines(onDisk).includes(l))
  check(
    seen.NEWEDIT.ok &&
      added.length === 1 &&
      added[0].includes('"id":"knoll"') &&
      lines(seen.NEWEDIT.disk).length === lines(onDisk).length + 1,
    `one more feature saved adds one line (${added.length} new)`,
  )
  check(fs.readFileSync(newFile, 'utf8') === seen.NEWEDIT.disk, 'the file on disk is what the page saved')
  fs.rmSync(newFile)
  await sleep(400)
  fs.writeFileSync(newFile, seen.NEWEDIT.disk)
  await until('RECREATED')
  check(
    seen.RECREATED.gone && !seen.RECREATED.noFile && !seen.RECREATED.conflict && !seen.RECREATED.dirty,
    `the file deleted and written again with its bytes settles: ${JSON.stringify(seen.RECREATED)}`,
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
