// The map editor's save on the dev server (docs/plans/active/m7-editor.md M7a, decision 0066): `vite.config.ts`
// serves it as POST /__map/save. The page sends the file's name, the text it last read (`base`) and the new text; the
// file is written only if it still holds `base`, so a hand edit made meanwhile is never overwritten silently. Tested in
// test/map-save.test.ts.
import fs from 'node:fs'
import path from 'node:path'

/** What the page sends to save a map. */
export interface SaveRequest {
  file: string // '/maps/<name>.map.json'
  base: string | null // the text the page last read from the file; null for a new map, whose file must not exist yet
  text: string // the text to write
}
/** The save's outcome: written; refused because the file changed on disk (its text now); refused; or failed. */
export type SaveResult =
  { ok: true } | { ok: false; status: 409; current: string } | { ok: false; status: 400 | 500; error: string }

/**
 * Whether a request may save: JSON (so a browser asks before another site's page can send it) and, when the browser
 * names its origin, from the dev server's own host. Any page the browser has open could otherwise write map files.
 */
export function mayWrite(headers: { 'content-type'?: string; origin?: string; host?: string }): boolean {
  if (!/^application\/json(;|$)/.test(headers['content-type'] ?? '')) return false
  if (headers.origin === undefined) return true
  try {
    return new URL(headers.origin).host === headers.host
  } catch {
    return false
  }
}

const MAP_FILE = /^\/maps\/[a-z0-9]+(-[a-z0-9]+)*\.map\.json$/

// the errors of a file system without hard links (exFAT, some network and container mounts)
const NO_LINKS = new Set(['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'EXDEV', 'ENOSYS'])
/**
 * Puts a written file in place as a new file, never over one there (EEXIST): a hard link (whole at once), or where the
 * file system has none an exclusive copy (a copy that fails part way is removed).
 */
export function createFrom(tmp: string, file: string, link = fs.linkSync): void {
  try {
    link(tmp, file)
  } catch (e) {
    if (!NO_LINKS.has((e as NodeJS.ErrnoException).code ?? '')) throw e
    try {
      fs.copyFileSync(tmp, file, fs.constants.COPYFILE_EXCL)
    } catch (e2) {
      if ((e2 as NodeJS.ErrnoException).code !== 'EEXIST') fs.rmSync(file, { force: true })
      throw e2
    }
  }
}

/**
 * Writes a map file under `root` if it still holds the text the page read, through a temporary file and a rename; with
 * no base, creates it if it does not exist.
 */
export function saveMapFile(root: string, req: SaveRequest): SaveResult {
  if (
    typeof req?.file !== 'string' ||
    (typeof req.base !== 'string' && req.base !== null) ||
    typeof req.text !== 'string' ||
    !MAP_FILE.test(req.file)
  ) {
    return { ok: false, status: 400, error: 'a map file is /maps/<name>.map.json, with its base and its text' }
  }
  const file = path.join(root, req.file)
  // a new map: its file is created whole (a temporary file linked into place, which fails if a file is there), never
  // over one already there (another map of that name, made meanwhile)
  if (req.base === null) {
    const tmp = `${file}.${process.pid}.tmp`
    try {
      fs.writeFileSync(tmp, req.text)
      createFrom(tmp, file)
      return { ok: true }
    } catch (e) {
      const err = e as NodeJS.ErrnoException
      if (err.code === 'EEXIST') {
        try {
          return { ok: false, status: 409, current: fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '') }
        } catch (e2) {
          return { ok: false, status: 500, error: `${req.file} is there but cannot be read: ${(e2 as Error).message}` }
        }
      }
      return { ok: false, status: 500, error: `${req.file} was not written: ${err.message}` }
    } finally {
      fs.rmSync(tmp, { force: true })
    }
  }
  let current: string
  try {
    current = fs.readFileSync(file, 'utf8')
  } catch {
    return { ok: false, status: 400, error: `${req.file} does not exist` }
  }
  // a byte order mark is not the map's: the page's read drops it, so the comparison does too (and the save writes none)
  current = current.replace(/^\uFEFF/, '')
  if (current !== req.base) return { ok: false, status: 409, current }
  // through a link to the file it names (a rename would replace the link), keeping the file's permissions
  const target = fs.realpathSync(file)
  const tmp = `${target}.${process.pid}.tmp`
  try {
    const st = fs.statSync(target)
    // a file with other hard links is written in place: a rename would part it from them
    if (st.nlink > 1) fs.writeFileSync(target, req.text)
    else {
      fs.writeFileSync(tmp, req.text, { mode: st.mode & 0o777 })
      fs.renameSync(tmp, target)
    }
  } catch (e) {
    // a full disk, a read-only folder, a file locked by another program: reported, never thrown into the server
    fs.rmSync(tmp, { force: true })
    return { ok: false, status: 500, error: `${req.file} was not written: ${(e as Error).message}` }
  }
  return { ok: true }
}
