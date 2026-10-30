import { describe, expect, it } from 'vitest'
import { Matrix } from '@babylonjs/core/Maths/math.vector.js'
import { HIDDEN, HIDDEN_BELOW, POSE_GLSL, behind, isHidden } from '../src/look/pose.ts'

/** The world matrix POSE_GLSL builds for pose (x, y, z, turn), its mat4 constructor run as JavaScript (column-major,
 *  as Babylon's Matrix.m), so the test reads the shader's own text. (Babylon's matrices are float32: compared to 5 or
 *  6 places.) */
function glslWorld(x: number, y: number, z: number, turn: number): number[] {
  const args = /return mat4\(([^;]*)\);/.exec(POSE_GLSL)![1].replace('p.xyz', 'x,y,z')
  const k = isHidden(y) ? 0 : 1
  return new Function('c', 's', 'k', 'x', 'y', 'z', `return [${args}]`)(Math.cos(turn), Math.sin(turn), k, x, y, z)
}

describe("a soldier's pose (pose.ts)", () => {
  const turns = [0, 0.3, Math.PI / 2, 2.5, Math.PI, -1.2, 5.9]
  it("builds the 64 B matrix it replaced: Babylon's turn about y, then his place", () => {
    for (const a of turns) {
      const want = Matrix.RotationY(a).multiply(Matrix.Translation(12.5, 3.25, -40)).m
      const got = glslWorld(12.5, 3.25, -40, a)
      got.forEach((v, i) => expect(v).toBeCloseTo(want[i], 5))
    }
  })
  it('puts the way behind a man along the matrix third column (+z in his frame)', () => {
    for (const a of turns) {
      const m = Matrix.RotationY(a).m
      const [bx, bz] = behind(a, [0, 0])
      expect(bx).toBeCloseTo(m[8], 6)
      expect(bz).toBeCloseTo(m[10], 6)
    }
  })
  it('draws a man not drawn at no size, far off the map, and every man on the ground at full size', () => {
    expect(isHidden(-HIDDEN)).toBe(true)
    expect(isHidden(-200)).toBe(false)
    expect(POSE_GLSL).toContain(`p.y<${HIDDEN_BELOW.toFixed(1)}?0.0:1.0`)
    const hid = glslWorld(HIDDEN, -HIDDEN, HIDDEN, 1)
    expect(hid.slice(0, 12).every(v => v === 0 || Object.is(v, -0))).toBe(true)
    expect(hid.slice(12)).toEqual([HIDDEN, -HIDDEN, HIDDEN, 1])
  })
})
