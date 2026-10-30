// A soldier's pose (battle threads PR 4; src/look/units.ts): where he stands (x, y, z) and his turn about y (rad), 16 B
// an instance in place of a 64 B matrix; the shaders build his world matrix from it (POSE_GLSL). No Babylon: the tests
// read it in Node.

/** m: where a man not drawn is put (x and z this far out, y as far under: off the map and out of every view). */
export const HIDDEN = 1e5
/** m: a pose this far under the ground or lower is a man not drawn (at no size in the shaders). */
export const HIDDEN_BELOW = -HIDDEN / 2

/** Whether a pose's height `y` is a man not drawn. */
export const isHidden = (y: number): boolean => y < HIDDEN_BELOW

/** A man's world matrix from his pose (world0: x, y, z, his turn), for units.vert and unitdecal.vert
 *  (#include<unitPose>, registered by units.ts): turned about y as Babylon's Matrix.RotationY, set at his place, at no
 *  size when not drawn (isHidden). The pose is the whole of it: the men's meshes stay at the identity. */
export const POSE_GLSL = `mat4 poseWorld(vec4 p){float c=cos(p.w),s=sin(p.w),k=p.y<${HIDDEN_BELOW.toFixed(1)}?0.0:1.0;
  return mat4(c*k,0.0,-s*k,0.0,0.0,k,0.0,0.0,s*k,0.0,c*k,0.0,p.xyz,1.0);}`

/** The way behind a man turned `turn` (x, z into `out`: +z in the figure's frame, the matrix's third column). */
export function behind(turn: number, out: number[]): number[] {
  out[0] = Math.sin(turn)
  out[1] = Math.cos(turn)
  return out
}
