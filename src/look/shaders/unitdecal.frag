#extension GL_OES_standard_derivatives : enable
precision highp float;uniform sampler2D uShapeTex;uniform vec2 uShapeSize;uniform float uUnitFar;
varying vec2 vUV0,vUV1;varying float vT;varying vec3 vK;
#include<painter>
// The simple shadows (src/look/units.ts): the shape's two facings blended, read through its mips where a pixel spans
// more than its texel (a soft footprint) but never past SHAPE_MIPS (a cell's border holds no further: no bleed between
// facings and roles). Its value is the pixel's coverage (alpha to coverage: the samples it covers), and each covered
// sample is darkened once, whatever overlaps it (the stencil: the first shadow there marks it), to the ground's shade
// there (vK) by the zoom's cross-fade share (uUnitFar): a formation's shadows overlap and darken as one. The blend is
// dst · src, the alpha (the lens codes) kept (units.ts sets it). (The painter is included as every painted material's
// is, src/look/materials.ts; nothing of it is used)
void main(){
  vec2 t=vUV0*uShapeSize;float lod=min(SHAPE_MIPS,max(0.0,0.5*log2(max(dot(dFdx(t),dFdx(t)),dot(dFdy(t),dFdy(t))))));
  float s=mix(textureLod(uShapeTex,vUV0,lod).r,textureLod(uShapeTex,vUV1,lod).r,vT);
  gl_FragColor=vec4(mix(vec3(1.0),vK,uUnitFar),s);}
