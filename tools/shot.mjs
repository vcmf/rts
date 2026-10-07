// Headless Chrome driver for prototype verification: load a page, run steps, save screenshots.
// Usage: node tools/shot.mjs <page.html|url> <outDir> <width> <height> '<steps JSON>'
// Steps: ["wait",ms] · ["eval","js"] (prints the result) · ["shot","name"] · ["tap","Key",ms]
// Software GL (SwiftShader): good for correctness, NOT for timing GPU frame cost.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const [target, outDir, w = '1600', h = '900', script = '[]'] = process.argv.slice(2)
if (!target || !outDir) { console.error('usage: node tools/shot.mjs <page> <outDir> [w] [h] [steps]'); process.exit(2) }
const url = /^[a-z]+:\/\//.test(target) ? target : pathToFileURL(path.resolve(target)).href
fs.mkdirSync(outDir, { recursive: true })
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const port = 9300 + Math.floor(Math.random() * 500)
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'shot-'))
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist', `--window-size=${w},${h}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' })
const sleep = ms => new Promise(r => setTimeout(r, ms))
let list
for (let i = 0; i < 40 && !list; i++) { await sleep(500); try { list = await (await fetch(`http://127.0.0.1:${port}/json`)).json() } catch {} }
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl)
await new Promise(r => (ws.onopen = r))
let id = 0
const pend = {}
ws.onmessage = e => {
  const m = JSON.parse(e.data)
  if (m.id && pend[m.id]) { pend[m.id](m.result || m.error); delete pend[m.id] }
  if (m.method === 'Runtime.exceptionThrown') console.log('EXC', JSON.stringify(m.params.exceptionDetails).slice(0, 600))
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') console.log('ERR', JSON.stringify(m.params.args.map(a => a.value)).slice(0, 400))
}
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })) })
await send('Runtime.enable'); await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url })
await sleep(1500)
for (const [op, a, b] of JSON.parse(script)) {
  if (op === 'wait') await sleep(a)
  else if (op === 'eval') { const r = await send('Runtime.evaluate', { expression: a, returnByValue: true }); console.log('EVAL', JSON.stringify(r.result && r.result.value)) }
  else if (op === 'shot') { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(outDir, a + '.png'), Buffer.from(r.data, 'base64')); console.log('shot', a) }
}
ws.close(); chrome.kill(); fs.rmSync(profile, { recursive: true, force: true }); process.exit(0)
