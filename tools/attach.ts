// tools/shot.mjs attached to a running Chrome (SHOT_CDP, decision 0060): the flags a run needs that browser to have
// been started with, what to tell the caller when it was not, and, in WSL only, Windows Chrome's way to local files
// (tools/win-chrome.sh). Everything about Windows sits behind inWsl(): a run anywhere else never takes those paths
// and its messages never mention Windows.
import { execFileSync } from 'node:child_process'
import path from 'node:path'
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
 * The flags of a browser started for runs to attach to (tools/win-chrome.sh, and the hint outside WSL): the run's
 * render flags, then those a long-lived browser needs that a launched run does not: --enable-automation, which lets a
 * run read the flags back (Browser.getBrowserCommandLine), and no backgrounding or timer throttling, since a headed
 * window can be covered. One list for both, so the script and the hint never drift; `node tools/attach.ts flags
 * <angle>` prints it for tools/win-chrome.sh, one flag a line.
 * @param angle the ANGLE backend
 * @param extra the run's extra flags
 */
export function attachFlags(angle: string, extra: readonly string[] = []): string[] {
  return [
    ...renderFlags(angle, extra),
    '--enable-automation',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
  ]
}

/** The ANGLE backends tools/win-chrome.sh can start Windows Chrome with (its --angle). */
export const WIN_ANGLES = ['swiftshader', 'd3d11']

/**
 * How to start (or restart) a browser that gives a run what it asks for, for an error message. In WSL:
 * tools/win-chrome.sh on the port of `cdp` (headless by default), or the flags when the backend is not one it starts.
 * Elsewhere: the flags themselves, with the DevTools port of `cdp`.
 * @param cdp the browser's DevTools URL (SHOT_CDP), e.g. http://127.0.0.1:9222
 * @param angle the ANGLE backend the run asks for
 * @param extra the run's extra flags
 */
export function startHint(cdp: string, angle: string, extra: readonly string[], env: Env = process.env): string {
  const port = URL.parse(cdp)?.port || '9222'
  const flags = [`--remote-debugging-port=${port}`, ...attachFlags(angle, extra)].join(' ')
  if (!inWsl(env)) return `start Chrome with its own --user-data-dir and ${flags}`
  if (!WIN_ANGLES.includes(angle)) {
    const known = WIN_ANGLES.join(' or ')
    return `tools/win-chrome.sh has no --angle ${angle} (only ${known}): start Windows Chrome yourself with ${flags}`
  }
  const rest = extra.length ? ` -- ${extra.join(' ')}` : ''
  return `PORT=${port} tools/win-chrome.sh stop, then PORT=${port} tools/win-chrome.sh start --angle ${angle}${rest}`
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

// `node tools/attach.ts flags <angle>`: attachFlags, one a line, for tools/win-chrome.sh
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, angle] = process.argv.slice(2)
  if (cmd !== 'flags' || !angle) {
    console.error('usage: node tools/attach.ts flags <angle>')
    process.exit(2)
  }
  console.log(attachFlags(angle).join('\n'))
}
