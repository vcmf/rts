// A scan drawn on the GPU (docs/plans/done/m7-editor.md M7e, decision 0069): its image as a texture over a mesh of
// frame points (./scan.ts scanMesh), through the view's own matrix, so the tilted view's perspective is exact and the
// near limit is clipped by the GPU. Per frame only the matrix and a piece's shift change. The page composites what it
// draws into each piece's area (./trace.ts).
import type { ScanMesh } from './scan.ts'

const VERT = `#version 300 es
in vec2 pos;
in vec2 uv;
uniform mat4 view;
uniform vec2 shift;
out vec2 vUv;
void main() {
  vUv = uv;
  // the ground point (x, 0, z): the frame point less the piece's shift; depth 0, so only what lies behind the camera
  // is clipped (w below 0), never the far ground
  vec4 p = view * vec4(pos.x - shift.x, 0.0, pos.y - shift.y, 1.0);
  gl_Position = vec4(p.xy, 0.0, p.w);
}`
const FRAG = `#version 300 es
precision highp float; // a texture coordinate to a pixel of a 4096 px scan: mediump (fp16) is 2 px off
in vec2 vUv;
uniform sampler2D image;
out vec4 colour;
void main() { colour = texture(image, vUv); }`

/** The GPU's part of the overlay: one canvas, its program, the scan's texture and mesh. */
export class ScanGl {
  readonly canvas = document.createElement('canvas')
  private gl: WebGL2RenderingContext
  private program: WebGLProgram
  private texture: WebGLTexture
  private count = 0
  private vao: WebGLVertexArrayObject
  private buffers: { pos: WebGLBuffer; uv: WebGLBuffer; index: WebGLBuffer }
  private image: ImageBitmap | null = null
  private mesh: ScanMesh | null = null
  /** The largest texture side the GPU takes: a larger scan is shrunk to it when read. */
  readonly maxSide: number

  /** Throws when the browser has no WebGL2 (the caller says so in the panel). */
  constructor() {
    const gl = this.canvas.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true })
    if (!gl) throw new Error('the scan needs WebGL2, which this browser does not give')
    this.gl = gl
    const shader = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader')
      return s
    }
    const p = gl.createProgram()
    gl.attachShader(p, shader(gl.VERTEX_SHADER, VERT))
    gl.attachShader(p, shader(gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(p)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'program')
    this.program = p
    this.texture = gl.createTexture()
    this.maxSide = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number
    // one vertex array and its buffers, refilled for each placement (never a new set: they would pile up on the GPU)
    this.vao = gl.createVertexArray()
    this.buffers = { pos: gl.createBuffer(), uv: gl.createBuffer(), index: gl.createBuffer() }
    gl.bindVertexArray(this.vao)
    for (const name of ['pos', 'uv'] as const) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[name])
      const at = gl.getAttribLocation(p, name)
      gl.enableVertexAttribArray(at)
      gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0)
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.buffers.index)
    gl.bindVertexArray(null)
  }

  /** The scan's image, as a texture (uploaded once a bitmap). */
  setImage(img: ImageBitmap): void {
    if (img === this.image) return
    this.image = img
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  }

  /** The mesh of frame points (uploaded once a placement). */
  setMesh(mesh: ScanMesh): void {
    if (mesh === this.mesh) return
    this.mesh = mesh
    const gl = this.gl
    gl.bindVertexArray(this.vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.pos)
    gl.bufferData(gl.ARRAY_BUFFER, mesh.pos, gl.STATIC_DRAW)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.uv)
    gl.bufferData(gl.ARRAY_BUFFER, mesh.uv, gl.STATIC_DRAW)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.index, gl.STATIC_DRAW)
    gl.bindVertexArray(null)
    this.count = mesh.index.length
  }

  /** Draws the scan through the view's matrix, moved by a piece's shift, onto a canvas of w × h device pixels. */
  render(w: number, h: number, view: Float32Array, shift: { x: number; z: number }): void {
    const gl = this.gl
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
    }
    gl.viewport(0, 0, w, h)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    if (!this.count || !this.image) return
    gl.useProgram(this.program)
    gl.bindVertexArray(this.vao)
    gl.uniformMatrix4fv(gl.getUniformLocation(this.program, 'view'), false, view)
    gl.uniform2f(gl.getUniformLocation(this.program, 'shift'), shift.x, shift.z)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.uniform1i(gl.getUniformLocation(this.program, 'image'), 0)
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_INT, 0)
  }
}
