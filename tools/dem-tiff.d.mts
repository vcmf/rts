// types for tools/dem-tiff.mjs
export function readTiff(
  buf: Buffer,
  want: { width: number; height: number },
): { width: number; height: number; data: Float32Array }
export function fillHoles(f: Float32Array, width: number, height: number): { bad: number; lo: number; hi: number }
