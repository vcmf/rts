precision highp float;attribute vec3 position;attribute vec2 aUV;
uniform mat4 viewProjection;varying vec2 vUV;
// a trunk's shadow on the ground (src/look/bakes.ts): a quad from the root away from the sun, u across it (-1..1), v
// along it (0 at the root, 1 at the crown's base, whose shadow takes over)
void main(){vUV=aUV;gl_Position=viewProjection*vec4(position,1.0);}
