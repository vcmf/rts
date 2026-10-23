#extension GL_OES_standard_derivatives : enable
precision highp float;uniform sampler2D uShapeTex;uniform float uUnitFar;
varying vec2 vUV0,vUV1;varying float vT;varying vec3 vW;varying vec4 vZ;
#include<painter>
#include<shore>

// The simple shadows, drawn twice (src/look/units.ts): the shape's two facings blended (read through its mips where a
// pixel spans more than its texel: a soft footprint), and where shadows overlap the darkest wins, not their product:
// the first pass (DECAL_DEPTH) writes depth alone, drawn nearer by its darkness (vZ: up to uDecalBias m), so the darkest
// shadow at a pixel is the nearest; the second draws only that one (its depth matched, LEQUAL, a few steps of the
// 24-bit depth to spare) and darkens what is there toward the ground's painted shadow: the ground's own colour here
// (its macro colour) painted in the sun and in shadow, through the air, their ratio. The colour pass blends by
// dst·(1 − src) with no alpha (the lens codes in the alpha untouched). uUnitFar: their share in the zoom's cross-fade
void main(){
  float s=mix(texture2D(uShapeTex,vUV0).r,texture2D(uShapeTex,vUV1).r,vT);
  if(s<0.004)discard;
  float z=mix(vZ.x/vZ.y,vZ.z/vZ.w,s)*0.5+0.5;
  #ifdef DECAL_DEPTH
  gl_FragDepth=z;gl_FragColor=vec4(0.0);
  #else
  gl_FragDepth=z-2.0e-7;
  macroDerivs(vW.xz);
  vec4 lm=LM(vW);float sh0=(1.0-lm.r)*uShadowsOn,occ=mix(1.0,groundOcc(lm),uAO);pSky=mix(1.0,lm.g,uAO);
  vec3 N=vec3(0.0,1.0,0.0),alb=groundAt(vW.xz,pxMacro());
  vec3 lit=airOf(paint(alb,N,vW,occ,0.12,1.0,sh0),vW,lm,0.0),dark=airOf(paint(alb,N,vW,occ,0.12,1.0,1.0),vW,lm,0.0);
  vec3 k=clamp(dark/max(lit,vec3(1.0e-3)),0.0,1.0);
  gl_FragColor=vec4((1.0-k)*s*uUnitFar*uShadowsOn,0.0);
  #endif
}
