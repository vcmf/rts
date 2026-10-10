// Headless Chrome driver for prototype verification: load a page, run steps, save screenshots.
// Usage: node tools/shot.mjs <page.html|url> <outDir> [width] [height] ['<steps JSON>']
// Steps: ["wait",ms] · ["eval","js"] (prints the result; a promise is awaited) · ["shot","name"] · ["tap","KeyD",holdMs]
// Exits non-zero on page exceptions/console errors or tool failure, and always cleans up Chrome.
// Software GL (SwiftShader) by default: good for correctness, NOT for timing GPU frame cost. SHOT_ANGLE=metal (or
// another ANGLE backend) uses the machine's GPU instead. SHOT_CHROME_ARGS: more Chrome flags, space-separated.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const [target, outDir, w = '1600', h = '900', script = '[]'] = process.argv.slice(2)
if (!target || !outDir) { console.error('usage: node tools/shot.mjs <page> <outDir> [w] [h] [steps]'); process.exit(2) }
const url = /^[a-z]+:\/\//.test(target) ? target : pathToFileURL(path.resolve(target)).href
const steps = JSON.parse(script)
const KNOWN = new Set(['wait', 'eval', 'shot', 'tap'])
for (const [op] of steps) if (!KNOWN.has(op)) { console.error(`unknown step "${op}"`); process.exit(2) }
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
if (!fs.existsSync(CHROME)) { console.error(`Chrome not found at ${CHROME} (set CHROME=...)`); process.exit(2) }

const sleep = ms => new Promise(r => setTimeout(r, ms))
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'shot-'))
let chrome, ws, pageErrors = 0
// close the socket, stop Chrome, wait for it to exit (it flushes the profile on the way out), then remove the profile
async function cleanup() {
  try { ws?.close() } catch {}
  if (chrome && chrome.exitCode === null && chrome.signalCode === null) {   // already dead from a signal: 'exit' has fired
    const exited = new Promise(r => chrome.once('exit', r))
    chrome.kill()
    await Promise.race([exited, sleep(5000)])
  }
  try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) } catch (e) { console.warn('shot.mjs: could not remove profile', e.message) }
}
process.on('SIGINT', async () => { await cleanup(); process.exit(130) })

try {
  fs.mkdirSync(outDir, { recursive: true })
  // --remote-debugging-port=0 lets Chrome pick a free port and write it to DevToolsActivePort
  // SHOT_ANGLE: the GL backend, swiftshader (software, deterministic: the default) or the machine's own (e.g. metal)
  const angle = process.env.SHOT_ANGLE || 'swiftshader'
  chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--use-angle=${angle}`, ...(angle === 'swiftshader' ? ['--enable-unsafe-swiftshader'] : []),
    '--ignore-gpu-blocklist', ...(process.env.SHOT_CHROME_ARGS || '').split(' ').filter(Boolean), `--window-size=${w},${h}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' })
  const portFile = path.join(profile, 'DevToolsActivePort')
  let port
  for (let i = 0; i < 60 && !port; i++) { await sleep(250); if (fs.existsSync(portFile)) port = fs.readFileSync(portFile, 'utf8').split('\n')[0] }
  if (!port) throw new Error('Chrome did not open a DevTools port')
  let page
  for (let i = 0; i < 40 && !page; i++) {
    try { page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page') } catch {}
    if (!page) await sleep(250)
  }
  if (!page) throw new Error('no page target')
  ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('DevTools socket failed')) })
  let id = 0, loaded = false
  const pend = {}
  // a dropped socket (Chrome crash) fails every pending call instead of hanging forever
  ws.onclose = () => { for (const k in pend) { pend[k]({ error: { message: 'DevTools socket closed (Chrome exited?)' } }); delete pend[k] } }
  ws.onmessage = e => {
    const m = JSON.parse(e.data)
    if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id] }
    if (m.method === 'Page.loadEventFired') loaded = true
    if (m.method === 'Runtime.exceptionThrown') { pageErrors++; console.log('EXC', JSON.stringify(m.params.exceptionDetails).slice(0, 600)) }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') { pageErrors++; console.log('ERR', JSON.stringify(m.params.args.map(a => a.value)).slice(0, 400)) }
  }
  const TIMEOUT = +(process.env.SHOT_TIMEOUT_S || 60) * 1000   // per DevTools call; long evals (formation-measure.js) raise it
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id
    const t = setTimeout(() => { delete pend[i]; rej(new Error(`${method}: no reply in ${TIMEOUT / 1000}s`)) }, TIMEOUT)
    pend[i] = m => { clearTimeout(t); m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result) }
    ws.send(JSON.stringify({ id: i, method, params }))
  })
  await send('Runtime.enable'); await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url })
  const LOAD = +(process.env.SHOT_LOAD_S || 60)                // seconds; a busy machine or a slow page raises it
  for (let i = 0; i < LOAD * 4 && !loaded; i++) await sleep(250)   // the page's own script (scene build) runs before the load event
  if (!loaded) throw new Error(`page did not finish loading in ${LOAD}s`)
  for (const [op, a, b] of steps) {
    if (op === 'wait') await sleep(a)
    else if (op === 'eval') {
      const r = await send('Runtime.evaluate', { expression: a, returnByValue: true, awaitPromise: true })   // a promise is awaited
      if (r.exceptionDetails) { pageErrors++; console.log('EVAL-EXC', r.exceptionDetails.exception?.description?.slice(0, 300)) }
      else console.log('EVAL', JSON.stringify(r.result.value))
    } else if (op === 'shot') {
      const r = await send('Page.captureScreenshot', { format: 'png' })
      if (!r?.data) throw new Error(`screenshot "${a}" returned no data`)
      fs.writeFileSync(path.join(outDir, a + '.png'), Buffer.from(r.data, 'base64')); console.log('shot', a)
    } else if (op === 'tap') {
      const key = a.startsWith('Key') ? a.slice(3).toLowerCase() : a
      await send('Input.dispatchKeyEvent', { type: 'keyDown', code: a, key })
      await sleep(b || 80)
      await send('Input.dispatchKeyEvent', { type: 'keyUp', code: a, key })
    }
  }
} catch (e) {
  console.error('shot.mjs:', e.message); await cleanup(); process.exit(1)
}
await cleanup()
process.exit(pageErrors ? 1 : 0)
