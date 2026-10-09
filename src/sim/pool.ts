// Typed-array pools with a free list (docs/proposals/sim-design.md §3): variable-length data (waypoints,
// order queues) lives in arrays the hash and saves cover, free list included. A node is an index; −1 is
// the end of a list.
export interface Pool {
  x: Float64Array
  z: Float64Array
  next: Int32Array
  meta: Int32Array   // [free head, nodes in use]
}

export function makePool(capacity: number): Pool {
  const p: Pool = { x: new Float64Array(capacity), z: new Float64Array(capacity), next: new Int32Array(capacity), meta: new Int32Array(2) }
  for (let i = 0; i < capacity; i++) p.next[i] = i + 1 < capacity ? i + 1 : -1   // free list in index order
  p.meta[0] = capacity ? 0 : -1
  return p
}
// a node with (x, z), or −1 when the pool is full
export function allocNode(p: Pool, x: number, z: number): number {
  const n = p.meta[0]
  if (n < 0) return -1
  p.meta[0] = p.next[n]; p.meta[1]++
  p.x[n] = x; p.z[n] = z; p.next[n] = -1
  return n
}
export function freeNode(p: Pool, n: number): void {
  p.x[n] = 0; p.z[n] = 0
  p.next[n] = p.meta[0]; p.meta[0] = n; p.meta[1]--
}
// frees a whole list
export function freeList(p: Pool, head: number): void {
  for (let n = head; n >= 0;) { const nx = p.next[n]; freeNode(p, n); n = nx }
}
