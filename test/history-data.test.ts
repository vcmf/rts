// The committed History roster (data/history/roster.json, written by tools/build-history-data.ts): sound, every
// image it names on disk and no image it does not, in step with its content (tools/history-content.ts), and its
// thumbnails' record (data/history/thumbs.json) in step with the tool's settings.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { ARM_RULES, ARMS, DEFAULT_ARM, FEATURED, NATIONS } from '../tools/history-content.ts'
import { armOfSlug } from '../tools/history-sources.ts'
import {
  HISTORY_DIR,
  ROSTER_FILE,
  THUMBS_FILE,
  THUMB_PX,
  THUMB_QUALITY,
  type ThumbRecord,
} from '../tools/build-history-data.ts'
import { KINDS, rosterProblems, type Entry, type Roster } from '../src/ui/roster.ts'

const roster: Roster = JSON.parse(fs.readFileSync(ROSTER_FILE, 'utf8'))
const entries: Entry[] = [...roster.commanders, ...roster.regiments]

/** Every .jpg under data/history/, as a path relative to it. */
function imagesOnDisk(): string[] {
  const files = fs.readdirSync(HISTORY_DIR, { recursive: true, encoding: 'utf8' })
  return files.filter(f => f.endsWith('.jpg')).map(f => f.split(path.sep).join('/'))
}

describe('data/history/roster.json', () => {
  it('is sound', () => {
    expect(rosterProblems(roster)).toEqual([])
  })

  it('has its image on disk for every entry, and no image it does not name', () => {
    const named = entries.map(e => e.image).sort()
    expect(imagesOnDisk().sort()).toEqual(named)
  })

  it('carries the content it was built from', () => {
    expect(roster.nations).toEqual(NATIONS)
    expect(roster.arms).toEqual(ARMS)
    expect(roster.featured).toEqual(FEATURED)
  })

  it('has commanders and regiments for every army', () => {
    for (const nation of roster.nations) {
      for (const kind of KINDS) {
        const count = roster[kind].filter(e => e.nation === nation.id).length
        expect(count, `${kind} of ${nation.id}`).toBeGreaterThan(0)
      }
    }
  })

  it("gives each regiment the arm today's rules give its slug (rebuild after changing the rules)", () => {
    const stale = roster.regiments.filter(r => armOfSlug(r.id.split('/')[1], ARM_RULES, DEFAULT_ARM) !== r.arm)
    expect(stale.map(r => r.id)).toEqual([])
  })
})

describe('data/history/thumbs.json', () => {
  const record: ThumbRecord = JSON.parse(fs.readFileSync(THUMBS_FILE, 'utf8'))

  it('records a source for every thumbnail the roster names, and no other', () => {
    expect(Object.keys(record.sources).sort()).toEqual(entries.map(e => e.image).sort())
  })

  it("was made at the tool's settings (rebuild after changing them)", () => {
    expect([record.px, record.quality]).toEqual([THUMB_PX, THUMB_QUALITY])
  })
})
