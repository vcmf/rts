// The newest of several reads in flight (docs/plans/active/m7-editor.md M7a): an older read that resolves after a
// newer one is dropped, never applied over it. Tested in test/map-editor.test.ts.

/** Wraps reads so only the last one started is delivered; an overtaken one resolves to null. */
export function newestOnly(): <T>(read: Promise<T>) => Promise<T | null> {
  let last = 0
  return <T>(read: Promise<T>) => {
    const mine = ++last
    return read.then(v => (mine === last ? v : null))
  }
}
