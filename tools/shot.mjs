// Headless Chrome driver for prototype verification: load a page, run steps, save screenshots.
// Usage: node tools/shot.mjs <page.html|url> <outDir> [width] [height] ['<steps JSON>']
// Steps: ["wait",ms] · ["eval","js"] (prints the result; a promise is awaited) · ["repl","js"] (the same in REPL mode:
//   a top-level await allowed, the last statement's value printed)
//   · ["shot","name"] · ["tap","KeyD",holdMs]
// Exits non-zero on page exceptions/console errors or tool failure, and always cleans up Chrome.
// Software GL (SwiftShader) by default: good for correctness, NOT for timing GPU frame cost. SHOT_ANGLE=metal (or
// another ANGLE backend) uses the machine's GPU instead. SHOT_CHROME_ARGS: more Chrome flags, space-separated.
// SHOT_CDP=<http://host:port>: attach to a running Chrome instead of launching one (Windows Chrome from WSL,
// tools/win-chrome.sh; decision 0060). Each run takes a fresh browser context and disposes it; the browser stays up.
// Its flags were fixed at its launch, so the run checks what it would have set: the GL backend by the renderer a WebGL2
// context reports (SHOT_ANGLE, SwiftShader when unset, as launched), SHOT_CHROME_ARGS on its command line (read through
// --enable-automation); a mismatch fails the run. A Windows browser attached from WSL gets local files through wslpath
// (tools/attach.ts). Set SHOT_CDP per run, not exported: an exported SHOT_CDP makes every tool built on this one (the
// goldens, the guard, the look bench, the page checks) attach to that browser, and several agents sharing one browser
// skew each other's timings.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { attachedUrl, renderFlags, startHint } from './attach.ts'
import { loadState } from './page-load.ts'

const [target, outDir, w = '1600', h = '900', script = '[]'] = process.argv.slice(2)
if (!target || !outDir) {
  console.error('usage: node tools/shot.mjs <page> <outDir> [w] [h] [steps]')
  process.exit(2)
}
const CDP = process.env.SHOT_CDP?.replace(/\/+$/, '')
const pageUrl = /^[a-z]+:\/\//.test(target) ? target : pathToFileURL(path.resolve(target)).href
const ANGLE = process.env.SHOT_ANGLE || 'swiftshader'
// how each backend names itself in the WebGL renderer string (ANGLE (<vendor>, <device> <backend>…))
const RENDERER = {
  swiftshader: /SwiftShader/i,
  d3d11: /Direct3D11/,
  d3d9: /Direct3D9/,
  metal: /Metal/,
  gl: /OpenGL/,
  vulkan: /Vulkan/,
}
// software renderers that also name a backend (SwiftShader says Vulkan, WARP Direct3D11): never a GPU
const SOFTWARE = /SwiftShader|Basic Render Driver|llvmpipe/i
const EXTRA = (process.env.SHOT_CHROME_ARGS || '').split(' ').filter(Boolean)
// how to (re)start an attached browser with everything this run asks for (headless, as a launched run always is)
const RESTART = CDP ? startHint(CDP, ANGLE, EXTRA) : ''
const steps = JSON.parse(script)
const KNOWN = new Set(['wait', 'eval', 'repl', 'shot', 'tap'])
for (const [op] of steps) {
  if (!KNOWN.has(op)) {
    console.error(`unknown step "${op}"`)
    process.exit(2)
  }
}
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
if (!CDP && !fs.existsSync(CHROME)) {
  console.error(`Chrome not found at ${CHROME} (set CHROME=... or SHOT_CDP=...)`)
  process.exit(2)
}

const sleep = ms => new Promise(r => setTimeout(r, ms))
const profile = CDP ? null : fs.mkdtempSync(path.join(os.tmpdir(), 'shot-'))
let chrome
let ws
let pageErrors = 0
let bws
let context // attached: the browser's socket and this run's context
// a shader Babylon cannot compile and has no fallback for never makes its material ready: the page waits forever (the
// bench waited its whole hour on Metal). Babylon logs 'Unable to compile effect:', the details, 'Error: …', then
// 'Trying next fallback.' when it has one (that effect may still recover): a run stops when no fallback follows the
// error within FALLBACK_MS. FATAL_EXC: a page exception that ends a run at once (the materials' texture-unit guard,
// src/look/materials.ts)
const FALLBACK_MS = 1500
const FATAL_EXC = ['fragment textures']
// per DevTools call; long evals (formation-measure.js) raise it
const TIMEOUT = +(process.env.SHOT_TIMEOUT_S || 60) * 1000
let bsend // attached: calls on the browser's socket

/**
 * A DevTools client on a socket: returns send(method, params), which resolves to the call's result and rejects on an
 * error reply, on no reply within timeoutMs, or when the socket closes (a Chrome crash fails every pending call
 * instead of hanging). Every message that is not a reply goes to onEvent.
 * @param socket the page's or the browser's WebSocket
 * @param timeoutMs the time a call waits for its reply, in milliseconds
 * @param onEvent receives each event message (parsed)
 */
function cdpClient(socket, timeoutMs, onEvent = () => {}) {
  let id = 0
  const pend = new Map()
  socket.addEventListener('message', e => {
    const m = JSON.parse(e.data)
    const reply = m.id && pend.get(m.id)
    if (!reply) return onEvent(m)
    pend.delete(m.id)
    reply(m)
  })
  socket.addEventListener('close', () => {
    for (const reply of pend.values()) reply({ error: { message: 'DevTools socket closed (Chrome exited?)' } })
    pend.clear()
  })
  return (method, params = {}) =>
    new Promise((res, rej) => {
      const i = ++id
      const t = setTimeout(() => {
        pend.delete(i)
        rej(new Error(`${method}: no reply in ${timeoutMs / 1000}s`))
      }, timeoutMs)
      pend.set(i, m => {
        clearTimeout(t)
        if (m.error) rej(new Error(`${method}: ${m.error.message}`))
        else res(m.result)
      })
      socket.send(JSON.stringify({ id: i, method, params }))
    })
}
let cleaning
/** Cleans up once: a fatal page error and the main path's failure can both ask (doCleanup). */
const cleanup = () => (cleaning ??= doCleanup())
/**
 * Closes the socket, stops Chrome, waits for it to exit (it flushes the profile on the way out), then removes the
 * profile. Attached: disposes this run's context (its pages close with it) and leaves the browser running.
 */
async function doCleanup() {
  try {
    ws?.close()
  } catch {}
  if (bws) {
    if (context) {
      try {
        await bsend('Target.disposeBrowserContext', { browserContextId: context })
      } catch (e) {
        console.warn('shot.mjs: could not dispose the context', e.message)
      }
    }
    try {
      bws.close()
    } catch {}
    return
  }
  if (chrome && chrome.exitCode === null && chrome.signalCode === null) {
    // already dead from a signal: 'exit' has fired
    const exited = new Promise(r => chrome.once('exit', r))
    chrome.kill()
    await Promise.race([exited, sleep(5000)])
  }
  if (profile) {
    try {
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    } catch (e) {
      console.warn('shot.mjs: could not remove profile', e.message)
    }
  }
}
process.on('SIGINT', async () => {
  await cleanup()
  process.exit(130)
})

try {
  fs.mkdirSync(outDir, { recursive: true })
  let pageWs
  let url = pageUrl
  if (CDP) {
    let version
    try {
      version = await (await fetch(`${CDP}/json/version`)).json()
    } catch {
      throw new Error(`no browser at ${CDP} (SHOT_CDP; ${RESTART})`)
    }
    // what /json/version and the environment tell, before any socket opens
    if (!/HeadlessChrome/.test(version['User-Agent'] ?? '')) {
      throw new Error(
        `the browser at ${CDP} is not headless: a visible window can be throttled or covered (${RESTART})`,
      )
    }
    if (!RENDERER[ANGLE]) {
      throw new Error(
        `cannot check the backend "${ANGLE}" on an attached browser (known: ${Object.keys(RENDERER).join(', ')})`,
      )
    }
    bws = new WebSocket(version.webSocketDebuggerUrl)
    await new Promise((res, rej) => {
      bws.onopen = res
      bws.onerror = () => rej(new Error('DevTools browser socket failed'))
    })
    bsend = cdpClient(bws, TIMEOUT)
    // what the caller asks of the browser's launch must be there: a missing vsync flag would change what is measured
    // without a word (the backend is checked on the page, below)
    if (EXTRA.length) {
      let argv
      try {
        argv = (await bsend('Browser.getBrowserCommandLine')).arguments
      } catch (e) {
        throw new Error(`cannot read the browser's flags to check ${EXTRA.join(' ')} (${e.message})`)
      }
      const missing = EXTRA.filter(f => !argv.includes(f))
      if (missing.length) {
        throw new Error(`the browser at ${CDP} was not started with ${missing.join(' ')} (${RESTART})`)
      }
    }
    url = attachedUrl(url, version['User-Agent'] ?? '')
    context = (await bsend('Target.createBrowserContext', { disposeOnDetach: true })).browserContextId
    // the size a launched run's --window-size gives its window
    const target = { url: 'about:blank', browserContextId: context, width: +w, height: +h }
    const { targetId } = await bsend('Target.createTarget', target)
    pageWs = version.webSocketDebuggerUrl.replace(/\/devtools\/browser\/.*/, `/devtools/page/${targetId}`)
  } else {
    // --remote-debugging-port=0 lets Chrome pick a free port and write it to DevToolsActivePort
    // SHOT_ANGLE: the GL backend, swiftshader (software, deterministic: the default) or the machine's own (e.g. metal)
    chrome = spawn(
      CHROME,
      [
        '--remote-debugging-port=0',
        ...renderFlags(ANGLE, EXTRA),
        `--window-size=${w},${h}`,
        `--user-data-dir=${profile}`,
        'about:blank',
      ],
      { stdio: 'ignore' },
    )
    const portFile = path.join(profile, 'DevToolsActivePort')
    let port
    for (let i = 0; i < 60 && !port; i++) {
      await sleep(250)
      if (fs.existsSync(portFile)) port = fs.readFileSync(portFile, 'utf8').split('\n')[0]
    }
    if (!port) throw new Error('Chrome did not open a DevTools port')
    let page
    for (let i = 0; i < 40 && !page; i++) {
      try {
        page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page')
      } catch {}
      if (!page) await sleep(250)
    }
    if (!page) throw new Error('no page target')
    pageWs = page.webSocketDebuggerUrl
  }
  ws = new WebSocket(pageWs)
  await new Promise((res, rej) => {
    ws.onopen = res
    ws.onerror = () => rej(new Error('DevTools socket failed'))
  })
  // the top frame's commits and loads, in order: the load that counts follows the commit of the document
  // Page.navigate opens, or of one it navigates to itself (tools/page-load.ts)
  const loadEvents = []
  let compiling = false
  let fallbackWait
  let dead = false
  const fatal = text => {
    if (dead) return
    dead = true
    console.error('shot.mjs: the page logged a fatal error, stopping:', text.slice(0, 300))
    cleanup().then(() => process.exit(1))
  }
  /** The page's events: the top frame's commits and loads, its exceptions and console errors. */
  const onPageEvent = m => {
    if (m.method === 'Page.frameNavigated' && !m.params.frame.parentId) {
      const { loaderId, unreachableUrl } = m.params.frame
      loadEvents.push({ kind: 'commit', loaderId, unreachableUrl })
    }
    if (m.method === 'Page.loadEventFired') loadEvents.push({ kind: 'load' })
    if (m.method === 'Runtime.exceptionThrown') {
      pageErrors++
      const text = JSON.stringify(m.params.exceptionDetails)
      console.log('EXC', text.slice(0, 600))
      if (FATAL_EXC.some(f => text.includes(f))) {
        fatal(text)
        return
      }
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      pageErrors++
      const text = JSON.stringify(m.params.args.map(a => a.value))
      console.log('ERR', text.slice(0, 400))
      // (a compile error: armed; its final 'Error:' line starts the wait for a fallback; a fallback disarms it)
      if (text.includes('Unable to compile effect')) compiling = true
      else if (text.includes('Trying next fallback')) {
        compiling = false
        clearTimeout(fallbackWait)
      } else if (compiling && text.includes('Error: ')) {
        compiling = false
        const t = text
        fallbackWait = setTimeout(() => fatal(t), FALLBACK_MS)
      }
    }
  }
  const send = cdpClient(ws, TIMEOUT, onPageEvent)
  await send('Runtime.enable')
  await send('Page.enable')
  if (CDP) {
    // the backend the attached browser really renders with, a fallback to software included
    const r = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => { const g = document.createElement('canvas').getContext('webgl2'); if (!g) return 'no WebGL2'
      const e = g.getExtension('WEBGL_debug_renderer_info'); return g.getParameter(e ? e.UNMASKED_RENDERER_WEBGL : g.RENDERER) })()`,
    })
    const renderer = r.result?.value ?? 'unknown'
    if (!RENDERER[ANGLE].test(renderer) || (ANGLE !== 'swiftshader' && SOFTWARE.test(renderer))) {
      throw new Error(`the browser at ${CDP} renders with ${renderer}, not ${ANGLE} (SHOT_ANGLE; ${RESTART})`)
    }
  }
  await send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: 1, mobile: false })
  const nav = await send('Page.navigate', { url })
  if (nav.errorText) throw new Error(`could not open ${url}: ${nav.errorText}`)
  const LOAD = +(process.env.SHOT_LOAD_S || 60) // seconds; a busy machine or a slow page raises it
  const loaded = () => loadState(loadEvents, nav.loaderId).loaded
  // the page's own script (scene build) runs before the load event
  for (let i = 0; i < LOAD * 4 && !loaded(); i++) await sleep(250)
  const state = loadState(loadEvents, nav.loaderId)
  if (!state.loaded) throw new Error(`page did not finish loading in ${LOAD}s`)
  // the page sent itself somewhere Chrome could not open: its error page loaded
  if (state.unreachableUrl) throw new Error(`the page navigated to ${state.unreachableUrl}, which could not be opened`)
  for (const [op, a, b] of steps) {
    if (op === 'wait') await sleep(a)
    else if (op === 'eval' || op === 'repl') {
      // a promise is awaited. `repl`: in REPL mode, which allows a top-level await (the sim page's hooks that ask its
      // battle worker return promises) and gives the last statement's value, but does not await a promise that value is
      const r = await send('Runtime.evaluate', {
        expression: a,
        returnByValue: true,
        awaitPromise: true,
        ...(op === 'repl' ? { replMode: true } : {}),
      })
      if (r.exceptionDetails) {
        pageErrors++
        console.log('EVAL-EXC', r.exceptionDetails.exception?.description?.slice(0, 300))
      } else console.log('EVAL', JSON.stringify(r.result.value))
    } else if (op === 'shot') {
      const r = await send('Page.captureScreenshot', { format: 'png' })
      if (!r?.data) throw new Error(`screenshot "${a}" returned no data`)
      fs.writeFileSync(path.join(outDir, a + '.png'), Buffer.from(r.data, 'base64'))
      console.log('shot', a)
    } else if (op === 'tap') {
      const key = a.startsWith('Key') ? a.slice(3).toLowerCase() : a
      await send('Input.dispatchKeyEvent', { type: 'keyDown', code: a, key })
      await sleep(b || 80)
      await send('Input.dispatchKeyEvent', { type: 'keyUp', code: a, key })
    }
  }
} catch (e) {
  console.error('shot.mjs:', e.message)
  await cleanup()
  process.exit(1)
}
await cleanup()
process.exit(pageErrors ? 1 : 0)
