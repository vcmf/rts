// types for tools/png.mjs, so the TypeScript tools can write PNGs
export function read(buf: Uint8Array): { w: number; h: number; data: Uint8Array }
export function write(img: { w: number; h: number; data: Buffer }): Buffer
