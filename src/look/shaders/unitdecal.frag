#extension GL_OES_standard_derivatives : enable
precision highp float;uniform sampler2D uShapeTex,uUnitShade;uniform vec2 uShapeSize;uniform float uUnitFar;
varying vec2 vUV0,vUV1,vLM;varying float vT;
#include<painter>
// The simple shadows (src/look/units.ts): the shape's two facings blended, read through its mips where a pixel spans
// more than its texel (a soft footprint) but never past SHAPE_MIPS (a cell's border holds no further: no bleed between
// facings and roles). With COVERAGE (the scene's 4 samples) its value is the pixel's coverage (alpha to coverage: the
// samples it covers), each covered sample darkened once whatever overlaps it (the stencil: the first shadow there marks
// it); without, its value scales the darkening and the first shadow at a pixel wins (an empty texel marks none). The
// darkening: to the ground's shade there (uUnitShade, the ratio of its painted cast shadow to its light, baked at the
// light map's texels: src/look/shaders/unitshade.frag), by the zoom's cross-fade share (uUnitFar), none with the
// shadows off (uShadowsOn). The blend is dst · src, the alpha (the lens codes) kept (units.ts sets it). (The painter is
// included as every painted material's is, src/look/materials.ts; of it only uShadowsOn is read)
void main(){
  vec2 t=vUV0*uShapeSize;float lod=min(SHAPE_MIPS,max(0.0,0.5*log2(max(dot(dFdx(t),dFdx(t)),dot(dFdy(t),dFdy(t))))));
  float s=mix(textureLod(uShapeTex,vUV0,lod).r,textureLod(uShapeTex,vUV1,lod).r,vT);
  vec3 k=texture2D(uUnitShade,vLM).rgb;float f=uUnitFar*uShadowsOn;
  #ifdef COVERAGE
  gl_FragColor=vec4(mix(vec3(1.0),k,f),s);
  #else
  if(s<0.02)discard;
  gl_FragColor=vec4(mix(vec3(1.0),k,f*s),0.0);
  #endif
}
