// Entity handles (docs/proposals/sim-design.md §3): kind:3 | index:9 | gen:19 in one non-negative
// integer. The kind tag makes a target unambiguous across tables; the generation makes a handle to a
// freed and reused slot stale.
export type Handle = number

export const KIND_FORMATION = 1
export const MAX_INDEX = 1 << 9   // 512 slots per kind
const GEN_MASK = (1 << 19) - 1

export const makeHandle = (kind: number, index: number, gen: number): Handle => (kind << 28) | (index << 19) | (gen & GEN_MASK)
export const handleKind = (h: Handle): number => (h >>> 28) & 7
export const handleIndex = (h: Handle): number => (h >>> 19) & (MAX_INDEX - 1)
export const handleGen = (h: Handle): number => h & GEN_MASK
export const NO_HANDLE = -1
