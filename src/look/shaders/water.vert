precision highp float;attribute vec3 position;attribute vec2 uv;attribute float aTau,aRiffle;uniform mat4 world,viewProjection;
varying vec3 vW;varying vec2 vUv;varying float vTau,vRiffle;
void main(){vec4 w=world*vec4(position,1.0);vW=w.xyz;vUv=uv;vTau=aTau;vRiffle=aRiffle;gl_Position=viewProjection*w;}
