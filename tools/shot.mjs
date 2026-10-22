// Headless Chrome driver for prototype verification: load a page, run steps, save screenshots.
// Usage: node tools/shot.mjs <page.html|url> <outDir> [width] [height] ['<steps JSON>']
// Steps: ["wait",ms] · ["eval","js"] (prints the result; a promise is awaited) · ["shot","name"] · ["tap","KeyD",holdMs]
// Exits non-zero on page exceptions/console errors or tool failure, and always cleans up Chrome.
// Software GL (SwiftShader) by default: good for correctness, NOT for timing GPU frame cost. SHOT_ANGLE=metal (or
// another ANGLE backend) uses the machine's GPU instead. SHOT_CHROME_ARGS: more Chrome flags, space-separated.
// SHOT_CDP=<http://host:port>: attach to a running Chrome instead of launching one (Windows Chrome from WSL,
// tools/win-chrome.sh; decision 0047). Each run takes a fresh browser context and disposes it; the browser stays up.
// Its flags were fixed at its launch: SHOT_ANGLE and SHOT_CHROME_ARGS, when set, must be among them (read through
// --enable-automation), or the run fails; unset, the run renders as the browser does. A local file is passed through
// wslpath when running in WSL.
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const [target, outDir, w = '1600', h = '900', script = '[]'] = process.argv.slice(2)
if (!target || !outDir) { console.error('usage: node tools/shot.mjs <page> <outDir> [w] [h] [steps]'); process.exit(2) }
const CDP = process.env.SHOT_CDP?.replace(/\/+$/, '')
const isUrl = /^[a-z]+:\/\//.test(target)
// a Windows browser reads a WSL file through its UNC path (\\wsl.localhost\<distro>\…)
const url = isUrl ? target : CDP && process.env.WSL_DISTRO_NAME
  ? 'file:' + execFileSync('wslpath', ['-w', path.resolve(target)], { encoding: 'utf8' }).trim().replace(/\\/g, '/')
  : pathToFileURL(path.resolve(target)).href
const steps = JSON.parse(script)
const KNOWN = new Set(['wait', 'eval', 'shot', 'tap'])
for (const [op] of steps) if (!KNOWN.has(op)) { console.error(`unknown step "${op}"`); process.exit(2) }
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
if (!CDP && !fs.existsSync(CHROME)) { console.error(`Chrome not found at ${CHROME} (set CHROME=... or SHOT_CDP=...)`); process.exit(2) }

const sleep = ms => new Promise(r => setTimeout(r, ms))
const profile = CDP ? null : fs.mkdtempSync(path.join(os.tmpdir(), 'shot-'))
let chrome, ws, pageErrors = 0
let bws, context   // attached: the browser's socket and this run's context
// a shader Babylon cannot compile and has no fallback for never makes its material ready: the page waits forever (the
// bench waited its whole hour on Metal). Babylon logs 'Unable to compile effect:', the details, 'Error: …', then
// 'Trying next fallback.' when it has one (that effect may still recover): a run stops when no fallback follows the
// error within FALLBACK_MS. FATAL_EXC: a page exception that ends a run at once (the materials' texture-unit guard,
// src/look/materials.ts)
const FALLBACK_MS = 1500, FATAL_EXC = ['fragment textures']
// one call on the browser's socket (attached), with its own timeout
let bid = 0
const bsend = (method, params = {}) => new Promise((res, rej) => {
  const i = ++bid, t = setTimeout(() => rej(new Error(`${method}: no reply`)), 10000)
  const on = e => { const m = JSON.parse(e.data); if (m.id !== i) return; clearTimeout(t); bws.removeEventListener('message', on); m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result) }
  bws.addEventListener('message', on); bws.send(JSON.stringify({ id: i, method, params }))
})
// close the socket, stop Chrome, wait for it to exit (it flushes the profile on the way out), then remove the profile;
// attached: dispose this run's context (its pages close with it) and leave the browser running
async function cleanup() {
  try { ws?.close() } catch {}
  if (bws) {
    if (context) { try { await bsend('Target.disposeBrowserContext', { browserContextId: context }) } catch (e) { console.warn('shot.mjs: could not dispose the context', e.message) } }
    try { bws.close() } catch {}
    return
  }
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
  const extra = (process.env.SHOT_CHROME_ARGS || '').split(' ').filter(Boolean)
  let pageWs
  if (CDP) {
    let version
    try { version = await (await fetch(`${CDP}/json/version`)).json() } catch { throw new Error(`no browser at ${CDP} (SHOT_CDP; tools/win-chrome.sh start?)`) }
    bws = new WebSocket(version.webSocketDebuggerUrl)
    await new Promise((res, rej) => { bws.onopen = res; bws.onerror = () => rej(new Error('DevTools browser socket failed')) })
    // what the caller asks of the browser's launch must be there: a missing GPU backend or vsync flag would change
    // what is measured without a word
    const want = [...(process.env.SHOT_ANGLE ? [`--use-angle=${process.env.SHOT_ANGLE}`] : []), ...extra]
    if (want.length) {
      let argv
      try { argv = (await bsend('Browser.getBrowserCommandLine')).arguments } catch (e) { throw new Error(`cannot read the browser's flags to check ${want.join(' ')} (${e.message})`) }
      const missing = want.filter(f => !argv.includes(f))
      if (missing.length) throw new Error(`the browser at ${CDP} was not started with ${missing.join(' ')} (tools/win-chrome.sh start -- ${want.join(' ')})`)
    }
    context = (await bsend('Target.createBrowserContext', { disposeOnDetach: true })).browserContextId
    const { targetId } = await bsend('Target.createTarget', { url: 'about:blank', browserContextId: context })
    pageWs = version.webSocketDebuggerUrl.replace(/\/devtools\/browser\/.*/, `/devtools/page/${targetId}`)
  } else {
    // --remote-debugging-port=0 lets Chrome pick a free port and write it to DevToolsActivePort
    // SHOT_ANGLE: the GL backend, swiftshader (software, deterministic: the default) or the machine's own (e.g. metal)
    const angle = process.env.SHOT_ANGLE || 'swiftshader'
    chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--use-angle=${angle}`, ...(angle === 'swiftshader' ? ['--enable-unsafe-swiftshader'] : []),
      '--ignore-gpu-blocklist', ...extra, `--window-size=${w},${h}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' })
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
    pageWs = page.webSocketDebuggerUrl
  }
  ws = new WebSocket(pageWs)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('DevTools socket failed')) })
  let id = 0, loaded = false
  const pend = {}
  // a dropped socket (Chrome crash) fails every pending call instead of hanging forever
  ws.onclose = () => { for (const k in pend) { pend[k]({ error: { message: 'DevTools socket closed (Chrome exited?)' } }); delete pend[k] } }
  let compiling = false, fallbackWait
  let dead = false
  const fatal = text => { if (dead) return; dead = true; console.error('shot.mjs: the page logged a fatal error, stopping:', text.slice(0, 300)); cleanup().then(() => process.exit(1)) }
  ws.onmessage = e => {
    const m = JSON.parse(e.data)
    if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id] }
    if (m.method === 'Page.loadEventFired') loaded = true
    if (m.method === 'Runtime.exceptionThrown') {
      pageErrors++; const text = JSON.stringify(m.params.exceptionDetails); console.log('EXC', text.slice(0, 600))
      if (FATAL_EXC.some(f => text.includes(f))) { fatal(text); return }
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      pageErrors++; const text = JSON.stringify(m.params.args.map(a => a.value)); console.log('ERR', text.slice(0, 400))
      // (a compile error: armed; its final 'Error:' line starts the wait for a fallback; a fallback disarms it)
      if (text.includes('Unable to compile effect')) compiling = true
      else if (text.includes('Trying next fallback')) { compiling = false; clearTimeout(fallbackWait) }
      else if (compiling && text.includes('Error: ')) { compiling = false; const t = text; fallbackWait = setTimeout(() => fatal(t), FALLBACK_MS) }
    }
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
