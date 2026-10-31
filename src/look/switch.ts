// The look page's on/off switches (src/look/main.ts): one reading for all. No imports: the tests read it in Node.

/** A switch ?<k>=0|1: true, false, or null when absent; any other value a clear error */
export function bit(q: URLSearchParams, k: string): boolean | null {
  const v = q.get(k)
  if (v !== null && v !== '0' && v !== '1') throw new Error(`?${k} must be 0 or 1, not ${v}`)
  return v === null ? null : v === '1'
}
