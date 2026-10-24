// tools/shot.mjs attached to a running Chrome (tools/attach.ts, decision 0060): what it tells the caller to start, and
// the URL it opens; Windows only in WSL.
import { describe, expect, it } from 'vitest'
import { attachedUrl, inWsl, renderFlags, startHint } from '../tools/attach.ts'

const MAC = {}
const WSL = { WSL_DISTRO_NAME: 'Ubuntu' }
const WINDOWS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) HeadlessChrome/141.0.0.0'

describe('inWsl', () => {
  it('is WSL only where WSL_DISTRO_NAME is set', () => {
    expect(inWsl(MAC)).toBe(false)
    expect(inWsl(WSL)).toBe(true)
  })
})

describe('renderFlags', () => {
  it('adds the unsafe flag for SwiftShader only', () => {
    expect(renderFlags('swiftshader', [])).toEqual([
      '--headless=new',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
    ])
    expect(renderFlags('metal', ['--x'])).toEqual([
      '--headless=new',
      '--use-angle=metal',
      '--ignore-gpu-blocklist',
      '--x',
    ])
  })
})

describe('startHint', () => {
  it('outside WSL names the flags and the port, never Windows', () => {
    const hint = startHint('http://127.0.0.1:9333', 'swiftshader', ['--disable-gpu-vsync'], MAC)
    expect(hint).toContain('--remote-debugging-port=9333')
    expect(hint).toContain('--headless=new')
    expect(hint).toContain('--use-angle=swiftshader --enable-unsafe-swiftshader')
    expect(hint).toContain('--disable-gpu-vsync')
    expect(hint).not.toMatch(/win|windows/i)
  })
  it('in WSL points at tools/win-chrome.sh with the backend and the extra flags', () => {
    const hint = startHint('http://127.0.0.1:9222', 'd3d11', ['--disable-gpu-vsync'], WSL)
    expect(hint).toBe('tools/win-chrome.sh stop, then start --angle d3d11 -- --disable-gpu-vsync')
  })
  it('survives a SHOT_CDP that is not a URL', () => {
    expect(startHint('nonsense', 'swiftshader', [], MAC)).toContain('--remote-debugging-port=9222')
  })
})

describe('attachedUrl', () => {
  const toWindows = (file: string) => `\\\\wsl.localhost\\Ubuntu${file.replaceAll('/', '\\')}`
  it('leaves every URL as it is outside WSL', () => {
    const url = 'file:///home/me/rts/look.html?frozen'
    expect(attachedUrl(url, WINDOWS_UA, MAC, toWindows)).toBe(url)
  })
  it('leaves an http URL as it is in WSL', () => {
    const url = 'http://127.0.0.1:4173/look/?frozen'
    expect(attachedUrl(url, WINDOWS_UA, WSL, toWindows)).toBe(url)
  })
  it('opens a WSL file through its UNC path in Windows Chrome, the query and hash kept', () => {
    const url = 'file:///home/me/rts/look.html?frozen&dof=0#x'
    expect(attachedUrl(url, WINDOWS_UA, WSL, toWindows)).toBe(
      'file://wsl.localhost/Ubuntu/home/me/rts/look.html?frozen&dof=0#x',
    )
  })
})
