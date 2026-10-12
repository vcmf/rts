// Seeds for the generators (docs/proposals/map-engine.md §3.4): hash(map.seed, id, purpose), in 32-bit integer maths,
// so a feature's randomness depends on its own id and purpose only (adding, removing or reordering features never
// reseeds another), and the same on every JS engine.

// FNV-1a over each part: a number as its 32-bit integer, a text as its UTF-16 code units
export function hash32(...parts: (number | string)[]): number {
  let h = 0x811c9dc5
  const mix = (b: number) => { h ^= b & 0xff; h = Math.imul(h, 0x01000193) }
  for (const p of parts) {
    if (typeof p === 'number') { const v = p | 0; mix(v); mix(v >>> 8); mix(v >>> 16); mix(v >>> 24) }
    else for (let i = 0; i < p.length; i++) { const u = p.charCodeAt(i); mix(u); mix(u >>> 8) }
    mix(0x1f)   // a separator, so ("ab", "c") and ("a", "bc") differ
  }
  return h >>> 0
}

// mulberry32: numbers in [0, 1) from a 32-bit seed
export function random(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const seedOf = (mapSeed: number, id: string, purpose: string): number => hash32(mapSeed, id, purpose)
