// Headless check of the map draft page (docs/plans/active/m1-language.md M1b, acceptance 5): starts Vite's dev
// server, opens app/map.html in headless Chrome (tools/shot.mjs), and edits a map file from here, as an author
// saving it would:
//   1. a real change (a ridge's height): the page must recompile and redraw; the time from the save to the redraw
//      is measured and must stay under a second;
//   2. a broken file (invalid JSON): the page must show the error and keep the last good drawing;
//   3. the original back: the page must recompile clean.
// The map file is always restored, even on failure. Prints every step and exits non-zero on any failure.
// Usage: node tools/map-page-check.mjs [outDir] [map]   (default: a temporary folder, maps/two-ridges.map.json)
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = process.argv[2] ?? fs.mkdtempSync(path.join(os.tmpdir(), 'map-page-'))
const mapFile = path.resolve(ROOT, process.argv[3] ?? 'maps/two-ridges.map.json'), mapName = path.basename(mapFile, '.map.json')
const PORT = 5191, LIMIT_MS = 1000
const original = fs.readFileSync(mapFile, 'utf8')
const sleep = ms => new Promise(r => setTimeout(r, ms))
let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++ }

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
let shot
const cleanup = () => { fs.writeFileSync(mapFile, original); shot?.kill(); vite.kill() }
process.on('exit', cleanup)
try {
  await new Promise((res, rej) => { vite.stdout.on('data', d => { if (/Local:/.test(String(d))) res() }); vite.on('exit', () => rej(new Error('vite exited'))); setTimeout(() => rej(new Error('vite did not start')), 30000) })
  // the page: wait for each compile in turn (MAP.log grows by one per compile), printing what it saw
  const waitLog = (n, tag) => ['eval', `new Promise(r => { const t = setInterval(() => { if (MAP.log.length >= ${n}) { clearInterval(t); r('${tag} ' + JSON.stringify({ log: MAP.log[${n} - 1], issues: MAP.issues.length, compiled: MAP.compiled })) } }, 20) })`]
  const steps = [waitLog(1, 'LOADED'), ['shot', 'draft'], waitLog(2, 'SAVED'), waitLog(3, 'BROKEN'), waitLog(4, 'RESTORED'), ['shot', 'draft-restored']]
  shot = spawn('node', [path.join(ROOT, 'tools/shot.mjs'), `http://localhost:${PORT}/app/map.html?map=${mapName}`, outDir, '1400', '900', JSON.stringify(steps)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, SHOT_TIMEOUT_S: '30' } })
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
  const until = async tag => { for (let t = 0; t < 600 && !seen[tag]; t++) await sleep(50); if (!seen[tag]) throw new Error(`the page never reported ${tag}`) }

  await until('LOADED')
  check(seen.LOADED.issues === 0 && seen.LOADED.compiled !== null, `the page compiled ${mapName} on load (${seen.LOADED.log.ms.toFixed(0)} ms)`)
  // a screenshot blocks the page's thread in headless Chrome: save only once it is taken
  await until('shot:draft'); await sleep(300)
  const edited = original.replace(/"height": 18/, '"height": 19')
  if (edited === original) throw new Error('the edit found nothing to change (expected a "height": 18 in the map)')
  const savedAt = Date.now(); fs.writeFileSync(mapFile, edited)
  await until('SAVED')
  const latency = seen.SAVED.log.drawnAt - savedAt
  check(seen.SAVED.issues === 0 && seen.SAVED.log.reason === 'save', `a save recompiled and redrew the page: ${latency} ms from the save to the redraw (limit ${LIMIT_MS} ms; the compile itself ${seen.SAVED.log.ms.toFixed(0)} ms)`)
  check(latency < LIMIT_MS, `the redraw came within ${LIMIT_MS} ms (the server saw the save after ${seen.SAVED.log.savedAt - savedAt} ms)`)
  await sleep(300)
  fs.writeFileSync(mapFile, original.slice(0, original.length / 2))
  await until('BROKEN')
  check(seen.BROKEN.issues > 0 && seen.BROKEN.compiled === mapName.replace(/\.map$/, '') || seen.BROKEN.compiled !== null, `a broken file shows ${seen.BROKEN.issues} error(s) and keeps the last good drawing (${seen.BROKEN.compiled})`)
  await sleep(300)
  fs.writeFileSync(mapFile, original)
  await until('RESTORED')
  check(seen.RESTORED.issues === 0, 'the restored file compiles clean')
  const code = await done
  check(code === 0, `the page had no exceptions or console errors (shot.mjs exit ${code})`)
} catch (e) {
  console.log('FAIL', e.message); failed++
} finally {
  cleanup()
}
console.log(`${failed ? 'FAILED' : 'passed'}; screenshots in ${outDir}`)
process.exit(failed ? 1 : 0)
