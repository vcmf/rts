// A material's define switched only once the program with it is compiled (the grass detail's GRASS_THIN on the
// meadow's near ring, src/look/meadow.ts): a material whose new program is not ready draws nothing, so a switch made
// at once blinks its meshes for the frames the compile takes. Babylon-free (a material's define list and a readiness
// check), so the tests read it.
//
// Why not swap whole materials once the new one is ready, as the roads' swap in src/look/main.ts does: the near ring's
// material is held by others, which set its defines and uniforms as they go: the figures' shadows (units.ts,
// rootReceivers and the map's receivers: UNIT_SHADOWS_VS, their textures) and the trodden mask (trodden.ts: TRAMPLE,
// uTrample). A second material would miss what they set after it was made. Toggling the define on the one material
// keeps it theirs. It relies on Babylon caching each define set's program (the engine's effect cache), and on a
// material that reads options.defines and is not frozen, as the meadow's ShaderMaterial does.

/** The part of a material the switch reads and writes (ShaderMaterial's) */
export interface DefineHost {
  options: { defines: string[] }
  setDefine(define: string, value: boolean): unknown
}

/** Starts (or finishes) the compile of mat's program with define (on or off) without switching to it: true once it is
 * compiled. The defines are always put back. ready: the readiness of the mesh drawn with mat, as its render checks it
 * (Mesh.isReady), after every other define of this frame is set; asked with the new defines, it starts their compile */
export function warmDefine(mat: DefineHost, define: string, on: boolean, ready: () => boolean): boolean {
  const before = mat.options.defines.slice()
  mat.setDefine(define, on)
  const ok = ready()
  mat.options.defines.splice(0, mat.options.defines.length, ...before)
  return ok
}

/** Switches define (on or off) on mat only when the program with it is compiled (warmDefine); else leaves the defines
 * as they were (the old program keeps drawing) and returns false, the new program's compile started, to be asked
 * again later */
export function switchDefineWhenReady(mat: DefineHost, define: string, on: boolean, ready: () => boolean): boolean {
  if (!warmDefine(mat, define, on, ready)) return false
  mat.setDefine(define, on)
  return true
}
