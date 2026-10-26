#extension GL_OES_standard_derivatives : enable
precision highp float;uniform sampler2D uShapeTex,uUnitShade;uniform vec2 uShapeSize;uniform float uUnitFar,uShSoft,uShGain;uniform vec4 uShFoot;
varying vec2 vUV0,vUV1,vLM;varying float vT,vAlong;
#include<painter>
// The simple shadows (src/look/units.ts): the shape's two facings blended, read through its mips where a pixel spans
// more than its texel (a soft footprint) but never past SHAPE_MIPS (a cell's border holds no further: no bleed between
// facings and roles). The zoom's look (decision 0062) runs along the shadow from his soles (vAlong, m) like a real
// shadow's: over the contact's core (uShFoot.z) the shape itself (R) at the soles' darkness (uShFoot.x), then toward
// the tip (uShFoot.w) the soft bake (G, the same blurred wider) up to uShSoft of it and the darkness down to the tip's
// (uShFoot.y); all ALU, the two reads as before. The darkness is coverage, not colour: every shadow darkens a sample
// it covers by the same amount (the darkest of the look's, dm) and covers a share d / dm of the samples its shape's
// value would, so where shadows overlap, the darkest wins whatever their order (the stencil lets only the first
// through, and they all darken alike: a man's light tip over the next man's dark contact takes nothing from it, and
// nothing pops when the battalions' draw order changes; decalFragment in src/look/shadow-look.ts mirrors this rule
// for its tests). With COVERAGE (the scene's 4 samples) that share is the alpha to coverage; without (?msaa=1|2: two
// samples would turn the gradient into one hard step where the driver does not dither) it scales the pixel's
// darkening, smooth, the first shadow at a pixel winning (the stencil: there overlaps depend on their order), an
// empty texel marking none. The darkening: to the ground's shade there (uUnitShade, the ratio of its
// painted cast shadow to its light, baked at the light map's texels: src/look/shaders/unitshade.frag), by the zoom's
// cross-fade share (uUnitFar), none with the shadows off (uShadowsOn); then made stronger by the look's gain (uShGain,
// one value for every shadow, so the coverage rule above holds at any gain): the darkening's luminance raised to it,
// the channels scaled alike (the ground's shadow hue kept, never below 0, nothing where the ground is already in full
// shadow; at 1 the darkening as it was; shadowShade in shadow-look.ts mirrors it). The blend is dst · src, the alpha (the lens
// codes) kept (units.ts sets it). (The painter is included as every painted material's is, src/look/materials.ts; of
// it only uShadowsOn is read)
void main(){
  vec2 t=vUV0*uShapeSize;float lod=min(SHAPE_MIPS,max(0.0,0.5*log2(max(dot(dFdx(t),dFdx(t)),dot(dFdy(t),dFdy(t))))));
  float g=smoothstep(uShFoot.z,uShFoot.w,vAlong);
  vec2 b=mix(textureLod(uShapeTex,vUV0,lod).rg,textureLod(uShapeTex,vUV1,lod).rg,vT);float s=mix(b.r,b.g,uShSoft*g);
  float dm=max(max(uShFoot.x,uShFoot.y),1e-4),a=min(1.0,s*mix(uShFoot.x,uShFoot.y,g)/dm);
  vec3 k=texture2D(uUnitShade,vLM).rgb;float f=uUnitFar*uShadowsOn*dm;
  #ifdef COVERAGE
  vec3 d=max(mix(vec3(1.0),k,f),0.0);
  #else
  if(s<0.02)discard;
  vec3 d=max(mix(vec3(1.0),k,f*a),0.0);
  #endif
  d*=pow(max(dot(d,vec3(0.2126,0.7152,0.0722)),1.0e-3),uShGain-1.0);
  #ifdef COVERAGE
  gl_FragColor=vec4(d,a);
  #else
  gl_FragColor=vec4(d,0.0);
  #endif
}
