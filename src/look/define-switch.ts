// A material's define switched only once the program with it is compiled (the grass detail's GRASS_THIN on the
// meadow's near ring, src/look/meadow.ts): a material whose new program is not ready draws nothing, so a switch made
// at once blinks its meshes for the frames the compile takes. Babylon-free (a material's define list and a readiness
// check), so the tests read it.

/** The part of a material the switch reads and writes (ShaderMaterial's) */
export interface DefineHost {
  options: { defines: string[] }
  setDefine(define: string, value: boolean): unknown
}

/** Asks for define (on or off) on mat and keeps it only when ready() says the program with it is compiled; else puts
 * the defines back as they were (the old program keeps drawing) and returns false, ready() having started the new
 * program's compile, to be asked again later. ready: the readiness of the mesh drawn with mat, as its render checks
 * it (Mesh.isReady), after every other define of this frame is set */
export function switchDefineWhenReady(mat: DefineHost, define: string, on: boolean, ready: () => boolean): boolean {
  const before = mat.options.defines.slice()
  mat.setDefine(define, on)
  if (ready()) return true
  mat.options.defines.splice(0, mat.options.defines.length, ...before)
  return false
}

/** Starts (or finishes) the compile of mat's program with define (on or off) without switching to it: true once it is
 * compiled. The defines are always put back */
export function warmDefine(mat: DefineHost, define: string, on: boolean, ready: () => boolean): boolean {
  const before = mat.options.defines.slice()
  mat.setDefine(define, on)
  const ok = ready()
  mat.options.defines.splice(0, mat.options.defines.length, ...before)
  return ok
}
