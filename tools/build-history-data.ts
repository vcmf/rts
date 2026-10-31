// Builds the History screens' roster (data/history/roster.json) and thumbnails (data/history/<nation>/<id>.jpg)
// from the design libraries: the current portraits in design/generals/ (gallery.html, manifest.json for the life and
// the likeness note) and the current cards in design/units/<nation>/unit-cards.html; the content (nations, arms,
// featured entries) from tools/history-content.ts. docs/systems/front-menu.md.
//   node tools/build-history-data.ts           writes the roster, makes missing or stale thumbnails (macOS `sips`)
//   node tools/build-history-data.ts --check   rebuilds the roster in memory and fails if it differs from the file
// design/ is not in git, so this runs locally, not on CI; the committed roster and thumbnails are what ships. From a
// worktree without design/: HISTORY_DESIGN=<main checkout>/design node tools/build-history-data.ts
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ARM_RULES, ARMS, DEFAULT_ARM, FEATURED, NATIONS } from './history-content.ts'
import { armOfSlug, parseGallery, parseUnitCards, personIdOf, splitTitle } from './history-sources.ts'
import { ROSTER_VERSION, rosterProblems, type Commander, type Regiment, type Roster } from '../src/ui/roster.ts'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
/** The design libraries: this checkout's design/, or HISTORY_DESIGN (a worktree builds from the main checkout's). */
const DESIGN = process.env.HISTORY_DESIGN ?? path.join(ROOT, 'design')
export const HISTORY_DIR = path.join(ROOT, 'data', 'history')
export const ROSTER_FILE = path.join(HISTORY_DIR, 'roster.json')
/** What each thumbnail was made from: the settings and each source's hash (its mtime is the checkout's, not the
 *  painting's). A thumbnail is remade when either differs, and --check compares it. */
export const THUMBS_FILE = path.join(HISTORY_DIR, 'thumbs.json')
/** The thumbnails' longest side, px: sharp on the full plate at 1080 p (it shows them about 700 px tall). */
export const THUMB_PX = 720
/** JPEG quality: the paintings' texture keeps 72 indistinguishable from 82 at this size, a fifth smaller. */
export const THUMB_QUALITY = 72

/** A source painting (path under design/) and the thumbnail it becomes (path under data/history/). */
interface ImageJob {
  source: string
  image: string
}

interface ManifestEntry {
  output_file?: string | null
  src?: string
  description?: string
  source_note?: string
}

const readDesign = (rel: string) => fs.readFileSync(path.join(DESIGN, rel), 'utf8')

/** The commanders, with the portraits they need. */
function readCommanders(jobs: ImageJob[]): Commander[] {
  const manifest: ManifestEntry[] = JSON.parse(readDesign('generals/manifest.json'))
  return parseGallery(readDesign('generals/gallery.html')).map(p => {
    const nation = p.src.split('/')[0]
    const id = `${nation}/${personIdOf(p.src)}`
    const entry = manifest.find(m => m.output_file === p.src || m.src === p.src)
    jobs.push({ source: `generals/${p.src}`, image: `${id}.jpg` })
    const life = entry?.description ?? ''
    return { id, nation, name: p.name, role: p.role, life, likeness: entry?.source_note ?? '', image: `${id}.jpg` }
  })
}

/** The regiments of every nation, with the cards they need. */
function readRegiments(jobs: ImageJob[]): Regiment[] {
  return NATIONS.flatMap(({ id: nation }) =>
    parseUnitCards(readDesign(`units/${nation}/unit-cards.html`)).map(card => {
      const id = `${nation}/${card.slug}`
      jobs.push({ source: `units/${nation}/${card.src}`, image: `${id}.jpg` })
      const { name, detail } = splitTitle(card.title)
      const arm = armOfSlug(card.slug, ARM_RULES, DEFAULT_ARM)
      return { id, nation, no: card.slug.slice(0, 2), name, detail, arm, image: `${id}.jpg` }
    }),
  )
}

/** The roster from the design libraries, and the thumbnails it names. Throws on an unsound roster. */
export function buildRoster(): { roster: Roster; jobs: ImageJob[] } {
  const jobs: ImageJob[] = []
  const roster: Roster = {
    version: ROSTER_VERSION,
    nations: NATIONS,
    arms: ARMS,
    featured: FEATURED,
    commanders: readCommanders(jobs),
    regiments: readRegiments(jobs),
  }
  const problems = rosterProblems(roster)
  if (problems.length) throw new Error(`the roster is unsound:\n  ${problems.join('\n  ')}`)
  return { roster, jobs }
}

/** The roster as the file holds it. */
export function rosterText(roster: Roster): string {
  return JSON.stringify(roster, null, 1) + '\n'
}

/** The thumbnails' record: the settings they are made at, and each image's source hash (sha256). */
export interface ThumbRecord {
  px: number
  quality: number
  sources: Record<string, string>
}

/** The record the thumbnails of `jobs` should have, from the sources as they are now. */
function thumbRecord(jobs: ImageJob[]): ThumbRecord {
  const sources: Record<string, string> = {}
  for (const job of jobs) {
    sources[job.image] = createHash('sha256')
      .update(fs.readFileSync(path.join(DESIGN, job.source)))
      .digest('hex')
  }
  return { px: THUMB_PX, quality: THUMB_QUALITY, sources }
}

const recordText = (record: ThumbRecord) => JSON.stringify(record, null, 1) + '\n'

/** The record on disk, or null when there is none. */
function readRecord(): ThumbRecord | null {
  return fs.existsSync(THUMBS_FILE) ? JSON.parse(fs.readFileSync(THUMBS_FILE, 'utf8')) : null
}

/** True when the thumbnail `image` must be (re)made: missing, made at other settings, or from another source. */
function isStale(image: string, want: ThumbRecord, had: ThumbRecord | null): boolean {
  if (!fs.existsSync(path.join(HISTORY_DIR, image)) || !had) return true
  return had.px !== want.px || had.quality !== want.quality || had.sources[image] !== want.sources[image]
}

/** Makes the thumbnail of `job` (macOS `sips`). */
function makeThumb(job: ImageJob): void {
  const source = path.join(DESIGN, job.source)
  const out = path.join(HISTORY_DIR, job.image)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  const args = [
    '-Z',
    String(THUMB_PX),
    '-s',
    'format',
    'jpeg',
    '-s',
    'formatOptions',
    String(THUMB_QUALITY),
    source,
    '--out',
    out,
  ]
  execFileSync('sips', args, { stdio: 'ignore' })
}

/** True when the file at `file` holds `text` exactly. */
const holds = (file: string, text: string) => fs.existsSync(file) && fs.readFileSync(file, 'utf8') === text

function main(): void {
  const { roster, jobs } = buildRoster()
  const text = rosterText(roster)
  const record = thumbRecord(jobs)
  if (process.argv.includes('--check')) {
    const rosterOk = holds(ROSTER_FILE, text)
    const thumbsOk = holds(THUMBS_FILE, recordText(record))
    console.log(rosterOk ? 'roster.json: up to date' : 'roster.json: differs from the design libraries (rebuild it)')
    console.log(thumbsOk ? 'thumbs.json: up to date' : 'thumbs.json: a thumbnail is stale or missing (rebuild it)')
    process.exit(rosterOk && thumbsOk ? 0 : 1)
  }
  fs.mkdirSync(HISTORY_DIR, { recursive: true })
  fs.writeFileSync(ROSTER_FILE, text)
  const had = readRecord()
  const stale = jobs.filter(job => isStale(job.image, record, had))
  for (const job of stale) makeThumb(job)
  fs.writeFileSync(THUMBS_FILE, recordText(record))
  const made = stale.length
  console.log(`${roster.commanders.length} commanders, ${roster.regiments.length} regiments; ${made} thumbnails made`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
