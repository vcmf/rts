// 32-bit FNV-1a over bytes. The state hash is this over the world's serialised bytes (serialize.ts):
// one serializer for saves, hashes and debug dumps, so the hash covers everything a save covers.
export function fnv1a(bytes: Uint8Array, h = 0x811c9dc5): number {
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}
