// tools/shot.mjs attached to a running Chrome (SHOT_CDP, decision 0060): the flags a run needs that browser to have
// been started with, what to tell the caller when it was not, and, in WSL only, Windows Chrome's way to local files
// (tools/win-chrome.sh). Everything about Windows sits behind inWsl(): a run anywhere else never takes those paths
// and its messages never mention Windows.
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

type Env = Record<string, string | undefined>

/** Whether this process runs in WSL (WSL sets WSL_DISTRO_NAME in every shell). */
export function inWsl(env: Env = process.env): boolean {
  return Boolean(env.WSL_DISTRO_NAME)
}

/**
 * The Chrome flags a run renders with, as tools/shot.mjs launches its own browser: headless, the ANGLE backend
 * (SwiftShader also needs its unsafe flag), the GPU blocklist off, then the caller's own (SHOT_CHROME_ARGS).
 * @param angle the ANGLE backend (SHOT_ANGLE): swiftshader, metal, d3d11…
 * @param extra the caller's extra flags
 */
export function renderFlags(angle: string, extra: readonly string[]): string[] {
  const unsafe = angle === 'swiftshader' ? ['--enable-unsafe-swiftshader'] : []
  return ['--headless=new', `--use-angle=${angle}`, ...unsafe, '--ignore-gpu-blocklist', ...extra]
}

/**
 * How to start (or restart) a browser that gives a run what it asks for, for an error message. In WSL:
 * tools/win-chrome.sh (headless by default). Elsewhere: the flags themselves, with the DevTools port of `cdp` and
 * --enable-automation, which lets a run read the flags back (Browser.getBrowserCommandLine).
 * @param cdp the browser's DevTools URL (SHOT_CDP), e.g. http://127.0.0.1:9222
 * @param angle the ANGLE backend the run asks for
 * @param extra the run's extra flags
 */
export function startHint(cdp: string, angle: string, extra: readonly string[], env: Env = process.env): string {
  if (inWsl(env)) {
    const rest = extra.length ? ` -- ${extra.join(' ')}` : ''
    return `tools/win-chrome.sh stop, then start --angle ${angle}${rest}`
  }
  const port = URL.parse(cdp)?.port || '9222'
  const flags = [`--remote-debugging-port=${port}`, '--enable-automation', ...renderFlags(angle, extra)]
  return `start Chrome with its own --user-data-dir and ${flags.join(' ')}`
}

/**
 * The URL an attached browser opens for `url`. A Windows Chrome attached from WSL reads a WSL file through its UNC
 * path (file://wsl.localhost/<distro>/…), the query and hash kept (?frozen, ?dof: tools/look-page.mjs); every other
 * URL, and every URL outside WSL, is unchanged.
 * @param url the page's URL
 * @param userAgent the browser's (from /json/version): Windows NT for Windows Chrome
 * @param toWindows a WSL path to its Windows path (wslpath -w by default)
 */
export function attachedUrl(
  url: string,
  userAgent: string,
  env: Env = process.env,
  toWindows: (file: string) => string = wslpathW,
): string {
  if (!url.startsWith('file:') || !inWsl(env) || !/Windows NT/.test(userAgent)) return url
  const u = new URL(url)
  const win = pathToFileURL(toWindows(fileURLToPath(u)), { windows: true })
  win.search = u.search
  win.hash = u.hash
  return win.href
}

/** A WSL path's Windows path, through wslpath. */
function wslpathW(file: string): string {
  return execFileSync('wslpath', ['-w', file], { encoding: 'utf8' }).trim()
}
