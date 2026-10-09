// Every construct the sim bans (decision 0006, 0005), one per marked line. test/lint.test.ts lints this
// file as if it were in src/sim/ and expects exactly the marked lines to fail.
export function banned(x: number): number[] {
  const out: number[] = []
  out.push(Math.sin(x)) // BANNED
  out.push(Math.cos(x)) // BANNED
  out.push(Math.tan(x)) // BANNED
  out.push(Math.atan2(x, 1)) // BANNED
  out.push(Math.asin(x)) // BANNED
  out.push(Math.exp(x)) // BANNED
  out.push(Math.log(x)) // BANNED
  out.push(Math.pow(x, 2)) // BANNED
  out.push(Math.hypot(x, 1)) // BANNED
  out.push(Math.cbrt(x)) // BANNED
  out.push(Math.random()) // BANNED
  out.push(Math.fround(x)) // BANNED
  out.push(x ** 2) // BANNED
  let y = x; y **= 2; out.push(y) // BANNED
  out.push(Date.now()) // BANNED
  out.push(new Date().getTime()) // BANNED
  out.push(performance.now()) // BANNED
  const f = new Float32Array(1); out.push(f[0]) // BANNED
  const m = new Map<number, number>(); out.push(m.size) // BANNED
  const s = new Set<number>(); out.push(s.size) // BANNED
  const { sin } = Math; out.push(sin(x)) // BANNED
  out.push(globalThis.Math.sin(x)) // BANNED
  const M = Math; out.push(M.abs(x)) // BANNED
  out.push(Reflect.get(Math, 'exp')(x)) // BANNED
  const k = 'sin'; out.push((Math[k] as (v: number) => number)(x)) // BANNED
  out.push(crypto.getRandomValues(new Uint8Array(1))[0]) // BANNED
  out.push(Number(process.hrtime.bigint())) // BANNED
  const h = new Float16Array(1); out.push(h[0]) // BANNED
  new DataView(new ArrayBuffer(8)).setFloat32(0, x) // BANNED
  out.push(new WeakRef({}) ? 1 : 0) // BANNED
  return out
}
export const later = () => import('node:fs') // BANNED
// imports from outside src/sim/: a relative path out, a bare package, a Node builtin
export { buildSimData } from '../../tools/build-sim-data.ts' // BANNED
import fs from 'fs' // BANNED
import { join } from 'node:path' // BANNED
export const touch = () => [fs, join]
// allowed: exact operations
export const ok = (x: number): number => Math.sqrt(x * x + 1) / 2 + Math.floor(x) + Math.abs(x) + Math.min(x, 1)
