// How tools/campaign-tiles.ts replaces its last output without ever leaving none (docs/systems/campaign-map.md): each
// build writes into a directory of its own beside the manifest, never into the live one; the manifest, which names
// its build, is written last, to a temporary file renamed over the old one (a file's rename is all or nothing); only
// then are the other builds removed. A run that fails or is killed at any moment leaves the last manifest naming a
// build that is still whole.
//   <out>/manifest.json            the live one
//   <out>/b-<time>-<pid>/l<level>/ a build's tiles
import fs from 'node:fs'
import path from 'node:path'

/** A build directory's name: the time it started (base 36) and the process that made it. */
export const BUILD_NAME = /^b-[0-9a-z]+-\d+$/

const MANIFEST = 'manifest.json'

/** Makes a new, empty build directory under `out` and returns its name. */
export function startBuild(out: string, now = Date.now(), pid = process.pid): string {
  const name = `b-${now.toString(36)}-${pid}`
  // not recursive for the build itself: a directory of that name already there is an error, not reused
  fs.mkdirSync(out, { recursive: true })
  fs.mkdirSync(path.join(out, name))
  return name
}

/** The build the live manifest names, if there is a manifest. */
export function liveBuild(out: string): string | undefined {
  const file = path.join(out, MANIFEST)
  if (!fs.existsSync(file)) return undefined
  const build: unknown = JSON.parse(fs.readFileSync(file, 'utf8')).build
  return typeof build === 'string' ? build : undefined
}

/** Writes `text` to `file` whole or not at all: to a temporary file, flushed, then renamed over it. */
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
}

/** Makes `build` the live one: its manifest written whole over the last. */
export function commitBuild(out: string, build: string, manifest: { build: string }) {
  if (manifest.build !== build) throw new Error(`commitBuild: a manifest of build ${manifest.build} for ${build}`)
  if (!fs.statSync(path.join(out, build)).isDirectory()) throw new Error(`commitBuild: no build ${build} in ${out}`)
  writeWhole(path.join(out, MANIFEST), JSON.stringify(manifest, null, 2) + '\n')
}

/**
 * Removes every build under `out` but the one the live manifest names (and, without a manifest, none): what failed
 * runs left and the builds replaced. Returns the names removed.
 */
export function pruneBuilds(out: string): string[] {
  const live = liveBuild(out)
  if (live === undefined) return []
  const removed: string[] = []
  for (const name of fs.readdirSync(out)) {
    if (name === live || !BUILD_NAME.test(name)) continue
    fs.rmSync(path.join(out, name), { recursive: true, force: true })
    removed.push(name)
  }
  return removed
}
