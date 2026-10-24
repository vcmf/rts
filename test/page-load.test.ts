// When tools/shot.mjs counts a page as loaded (tools/page-load.ts), and the tool itself on two small pages: one that
// navigates itself before its load event must load (exit 0), a missing one must fail at once with the error named.
// The runs need the Mac's Chrome (or CHROME=…): they skip where there is none, as on CI.
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { navigationLoaded, type LoadEvent } from '../tools/page-load.ts'

const commit = (loaderId: string): LoadEvent => ({ kind: 'commit', loaderId })
const load: LoadEvent = { kind: 'load' }

describe('navigationLoaded', () => {
  it('counts the load after the navigation commits', () => {
    expect(navigationLoaded([commit('A'), load], 'A')).toBe(true)
  })
  it('waits while the navigation has committed but not loaded', () => {
    expect(navigationLoaded([commit('A')], 'A')).toBe(false)
  })
  it('never counts a load before the commit (a fresh page’s own about:blank)', () => {
    expect(navigationLoaded([commit('blank'), load, commit('A')], 'A')).toBe(false)
  })
  it('counts the load of a document the page navigated to before its own load', () => {
    expect(navigationLoaded([commit('A'), commit('B'), load], 'A')).toBe(true)
  })
  it('waits while the navigation has not committed', () => {
    expect(navigationLoaded([commit('blank'), load], 'A')).toBe(false)
  })
})

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const SHOT = path.join(import.meta.dirname, '../tools/shot.mjs')

/** Runs tools/shot.mjs on `url` with one eval step; its exit code and its whole output. */
function shot(url: string, out: string): Promise<{ code: number; output: string }> {
  const steps = JSON.stringify([['eval', 'location.pathname']])
  // launched, never attached: a SHOT_CDP in the caller's environment would test another browser
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'SHOT_CDP')),
    SHOT_LOAD_S: '10',
  }
  return new Promise(resolve => {
    execFile(process.execPath, [SHOT, url, out, '200', '150', steps], { env }, (err, stdout, stderr) => {
      resolve({ code: err ? Number(err.code ?? 1) : 0, output: stdout + stderr })
    })
  })
}

/** A static server for two pages: /redirect.html replaces itself with /target.html while it parses. */
async function serve(): Promise<{ base: string; close: () => void }> {
  const pages: Record<string, string> = {
    '/redirect.html': '<!doctype html><script>location.replace("/target.html")</script><p>not here</p>',
    '/target.html': '<!doctype html><title>target</title><p>here</p>',
  }
  const server = http.createServer((req, res) => {
    const body = pages[req.url ?? '']
    res.writeHead(body ? 200 : 404, { 'content-type': 'text/html' })
    res.end(body ?? 'missing')
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  const { port } = server.address() as AddressInfo
  return { base: `http://127.0.0.1:${port}`, close: () => server.close() }
}

describe.skipIf(!fs.existsSync(CHROME))('tools/shot.mjs', () => {
  it('loads a page that navigates itself before its load event, and exits 0', async () => {
    const { base, close } = await serve()
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'shot-test-'))
    try {
      const r = await shot(`${base}/redirect.html`, out)
      expect(r.output).toContain('EVAL "/target.html"')
      expect(r.code, r.output).toBe(0)
    } finally {
      close()
      fs.rmSync(out, { recursive: true, force: true })
    }
  })
  it('fails at once on a page that is not there, naming the error', async () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'shot-test-'))
    try {
      const missing = path.join(out, 'no-such-page.html')
      const r = await shot(missing, out)
      expect(r.code, r.output).toBe(1)
      expect(r.output).toContain('net::ERR_FILE_NOT_FOUND')
    } finally {
      fs.rmSync(out, { recursive: true, force: true })
    }
  })
})
