// The simulation's one random stream (docs/proposals/sim-design.md §2): xoshiro128** on 32-bit
// integers (Math.imul and shifts only), its state in the world so saves and the hash cover it, advanced
// in tick order. The renderer has its own RNG.
export type RngState = Uint32Array // 4 words

const rotl = (x: number, k: number): number => (x << k) | (x >>> (32 - k))

// fills the state from a seed with splitmix32, so nearby seeds give unrelated streams
export function seedRng(state: RngState, seed: number): void {
  let s = seed >>> 0
  for (let i = 0; i < 4; i++) {
    s = (s + 0x9e3779b9) >>> 0
    let z = s
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b)
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35)
    state[i] = (z ^ (z >>> 16)) >>> 0
  }
  if ((state[0] | state[1] | state[2] | state[3]) === 0) state[0] = 1 // the all-zero state is a fixed point
}

// the next 32-bit output, unsigned
export function nextU32(s: RngState): number {
  const result = Math.imul(rotl(Math.imul(s[1], 5), 7), 9) >>> 0
  const t = s[1] << 9
  s[2] ^= s[0]
  s[3] ^= s[1]
  s[1] ^= s[2]
  s[0] ^= s[3]
  s[2] ^= t
  s[3] = rotl(s[3], 11)
  return result
}
// uniform in [0, 1): 32 bits over 2^32, exact
export const nextUnit = (s: RngState): number => nextU32(s) / 4294967296
// uniform integer in [0, n)
export const nextInt = (s: RngState, n: number): number => Math.floor(nextUnit(s) * n)

// an integer count around an expected value λ ≥ 0 (casualties): a normal approximation from the sum of
// 12 uniforms (Irwin–Hall), so no log or cos; small λ uses a Bernoulli draw on the fraction
export function sampleCount(s: RngState, lambda: number): number {
  if (lambda <= 0) return 0
  if (lambda < 1) return nextUnit(s) < lambda ? 1 : 0
  let u = 0
  for (let i = 0; i < 12; i++) u += nextUnit(s)
  const k = Math.round(lambda + Math.sqrt(lambda) * (u - 6))
  return k < 0 ? 0 : k
}

// Keyed draws (docs/plans/active/s1c-fire-morale.md): a short stream seeded from a hash of a key (the world
// seed, the tick, an entity handle, a company, a purpose tag), so a result depends on who draws and when,
// never on slot order or on how many draws came before. The world stream is not touched.
const mix = (h: number, v: number): number => {
  h = Math.imul(h ^ (v >>> 0), 0x9e3779b1) >>> 0
  h ^= h >>> 15
  h = Math.imul(h, 0x85ebca6b) >>> 0
  h ^= h >>> 13
  return h >>> 0
}
export function keyedStream(out: RngState, seed: number, a: number, b: number, c: number, purpose: number): RngState {
  seedRng(out, mix(mix(mix(mix(mix(0x811c9dc5, seed), a), b), c), purpose))
  return out
}
