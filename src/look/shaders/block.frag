#extension GL_OES_standard_derivatives : enable
precision highp float;varying vec3 vW,vN;varying vec2 vRoot;uniform vec3 uAlb;uniform float uMask;
#include<painter>
#include<shore>

// a flat army block (docs/plans/active/l2-detail.md, the readability guard): one coat colour through the shared
// painter at unit crispness, lit and shadowed like the ground under it. uMask ≥ 0: flat grey, the guard's pixel mask
void main(){if(uMask>=0.0){gl_FragColor=vec4(vec3(uMask),UNIT_A);return;}   // (UNIT_A: a unit, never blurred, painter.glsl depthA)
  vec3 N=normalize(vN);vec4 lm=LM(vW);
  float sh=(1.0-lm.r)*uShadowsOn;
  // the ground's bounce under the block (LC4): its centre's ground, one colour a block as a tree's. The bounce lights
  // its shadow side, which faces the ground in its own shadow (neither the light map nor the shadow map holds a unit):
  // that ground is lit by the sky alone
  pBounce=bounceAt(vRoot,vW.y,0.0,1.0);
  vec3 c=paint(uAlb,N,vW,1.0,0.12,0.3,sh);
  gl_FragColor=vec4(airOf(c,vW,lm,0.9),UNIT_A);}   // (UNIT_A: a unit, never blurred)
