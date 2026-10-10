precision highp float;attribute vec3 position;attribute vec2 uv;attribute float aDepth;uniform mat4 world,viewProjection;
varying vec3 vW;varying vec2 vUv;varying float vDepth;
void main(){vec4 w=world*vec4(position,1.0);vW=w.xyz;vUv=uv;vDepth=aDepth;gl_Position=viewProjection*w;}