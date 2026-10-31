// How tools/campaign-tiles.ts replaces its last output without ever leaving none (docs/systems/campaign-map.md): each
// build writes into a directory of its own, never into the live one, and flushes its files; the file that names the
// live build (the manifest, the prototype's meta file) is written last, to a temporary file renamed over the old one
// (a file's rename is all or nothing); only then are older builds removed. A run that fails or is killed at any moment
// leaves the last file naming a build that is still whole.
//   <out>/<file>                   names the live build: `"build": "b-…"` in it
//   <out>/b-<time>-<pid>/          a build's files
import fs from 'node:fs'
import path from 'node:path'

/** A build directory's name: the time it started (milliseconds, base 36) and the process that made it. */
export const BUILD_NAME = /^b-([0-9a-z]+)-\d+$/

const NAMED = /"build":\s*"(b-[0-9a-z]+-\d+)"/

/** Makes a new, empty build directory under `out` and returns its name. */
export function startBuild(out: string, now = Date.now(), pid = process.pid): string {
  const name = `b-${now.toString(36)}-${pid}`
  // not recursive for the build itself: a directory of that name already there is an error, not reused
  fs.mkdirSync(out, { recursive: true })
  fs.mkdirSync(path.join(out, name))
  return name
}

/** The build named by `text` (a manifest or meta file), if it names one. */
export function namedBuild(text: string): string | undefined {
  return NAMED.exec(text)?.[1]
}

/** The build `out/file` names, if the file is there. */
export function liveBuild(out: string, file: string): string | undefined {
  const at = path.join(out, file)
  return fs.existsSync(at) ? namedBuild(fs.readFileSync(at, 'utf8')) : undefined
}

/** Writes `data` to `file` and flushes it to the disk before returning. */
export async function writeFlushed(file: string, data: string | Uint8Array) {
  const handle = await fs.promises.open(file, 'w')
  try {
    await handle.writeFile(data)
    await handle.sync()
  } finally {
    await handle.close()
  }
}

/** Writes `text` to `file` whole or not at all: to a temporary file, flushed, renamed over it, the rename flushed. */
export function writeWhole(file: string, text: string) {
  const temporary = `${file}.tmp`
  const fd = fs.openSync(temporary, 'w')
  try {
    fs.writeSync(fd, text)
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
  fs.renameSync(temporary, file)
  const dir = fs.openSync(path.dirname(file), 'r')
  try {
    fs.fsyncSync(dir)
  } finally {
    fs.closeSync(dir)
  }
}

/** Makes `build` the live one: `out/file`, whose `text` must name it, written whole over the last. */
export function commitBuild(out: string, build: string, file: string, text: string) {
  const named = namedBuild(text)
  if (named !== build) throw new Error(`commitBuild: a ${file} of build ${named} for ${build}`)
  if (!fs.statSync(path.join(out, build)).isDirectory()) throw new Error(`commitBuild: no build ${build} in ${out}`)
  writeWhole(path.join(out, file), text)
}

/** When a build started, from its name. */
function startOf(name: string): number {
  return parseInt(BUILD_NAME.exec(name)![1], 36)
}

/**
 * Removes the builds under `out` that started before the one `out/file` names, but for those in `keep` (the one it
 * replaced, which a page may still be reading): what failed runs left and the builds replaced. A build started after
 * the live one (a run still going) is left, and without a live file nothing is removed. Returns the names removed.
 */
export function pruneBuilds(out: string, file: string, keep: (string | undefined)[] = []): string[] {
  const live = liveBuild(out, file)
  if (live === undefined) return []
  const removed: string[] = []
  for (const name of fs.readdirSync(out)) {
    if (!BUILD_NAME.test(name) || name === live || keep.includes(name) || startOf(name) >= startOf(live)) continue
    fs.rmSync(path.join(out, name), { recursive: true, force: true })
    removed.push(name)
  }
  return removed
}
