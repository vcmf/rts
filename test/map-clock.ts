// A clock for the editor's tests (docs/plans/active/m7-editor.md M7b): the editor pairs two clicks within a moment
// as a double click, so every click here comes a second after the last, and `again` clicks a moment after it.
import { beforeEach, afterEach, vi } from 'vitest'
import type { Editor } from '../src/app/map/editor.ts'

let gap = 1000
let clock = 0
/** Installs the clock for the tests of the file that calls it. */
export function clickClock(): void {
  beforeEach(() => {
    vi.spyOn(performance, 'now').mockImplementation(() => (clock += gap))
  })
  afterEach(() => vi.restoreAllMocks())
}
/** A click a moment after the last: the second click of a double click there. */
export function again(ed: Editor, sx: number, sy: number): void {
  gap = 100
  try {
    ed.click(sx, sy)
  } finally {
    gap = 1000
  }
}
/** A double click: a click and its second. */
export function dbl(ed: Editor, sx: number, sy: number): void {
  ed.click(sx, sy)
  again(ed, sx, sy)
}
