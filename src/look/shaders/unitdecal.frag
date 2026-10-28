#extension GL_OES_standard_derivatives : enable
precision highp float;uniform sampler2D uShapeTex,uUnitShade;uniform vec2 uShapeSize;uniform float uUnitFar,uShSoft,uShGain;uniform vec4 uShFoot;
varying vec2 vUV0,vUV1,vLM;varying float vT,vAlong;
#ifdef SH_STEPS
uniform vec2 uShFootK;
#endif
#ifdef SH_STEP_BLEND
// the two step bins either side of the man's step, their facings each (unitdecal.vert), the second's share vS
varying vec2 vUV2,vUV3;varying float vS;
#endif
#ifdef SH_HEIGHTS
// a figure on more than its root (SH_SPREAD, unitdecal.vert): uShapeH, at half the shape's size, the same UVs, holds
// the height of the lowest part casting each texel, a share of uShHeight m along the shadow; the look's gradient and
// the feet's boost run on it, from each contact (a hoof, a wheel, a gunner's foot), not from the root. Times uShLen,
// as a soldier's vAlong is: the gradient's core and tip (uShFoot) are the look's at its length, so a spread figure's
// shadow takes the same gradient over its shape as his (gradientAlong in src/look/shadow-look.ts)
uniform sampler2D uShapeH;uniform float uShHeight,uShLen;
#endif
#ifdef SH_CONTACT
// the contact shadow (docs/decisions/0071-soldier-contact-shadow.md): uShContact (its pad, m: the vertex's; its
// darkness, a share of the ground's full shade, by its zoom weight; its fade past the oval); vCt: the fragment in the
// contact's oval (1 at its edge), vCell in his shape's cell (0 to 1 inside), unitdecal.vert
uniform vec4 uShContact;varying vec2 vCt,vCell;
#endif
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
// cross-fade share (uUnitFar), none with the shadows off (uShadowsOn); then the full darkness made stronger by the
// look's gain (uShGain, one value for every shadow, so the coverage rule above holds at any gain): its luminance
// raised to the gain, the channels scaled alike (the ground's shadow hue kept where no channel was clamped at 0,
// nothing where the ground is already in full shadow; at 1 the darkening as it was). Only that full darkness is
// raised: a shadow's lighter parts take it on fewer samples (COVERAGE) or by the share a (without), the same result
// either way (shadowShade and decalPixel in shadow-look.ts mirror it). The blend is dst · src, the alpha (the lens
// codes) kept (units.ts sets it). (The painter is included as every painted material's is, src/look/materials.ts; of
// it only uShadowsOn is read)
void main(){
  vec2 t=vUV0*uShapeSize;float lod=min(SHAPE_MIPS,max(0.0,0.5*log2(max(dot(dFdx(t),dFdx(t)),dot(dFdy(t),dFdy(t))))));
  vec2 b=mix(textureLod(uShapeTex,vUV0,lod).rg,textureLod(uShapeTex,vUV1,lod).rg,vT);
  #ifdef SH_STEP_BLEND
  b=mix(b,mix(textureLod(uShapeTex,vUV2,lod).rg,textureLod(uShapeTex,vUV3,lod).rg,vT),vS);
  #endif
  #ifdef SH_HEIGHTS
  // (its half-size atlas a mip coarser)
  float hl=max(lod-1.0,0.0),hh=mix(textureLod(uShapeH,vUV0,hl).r,textureLod(uShapeH,vUV1,hl).r,vT);
  #ifdef SH_STEP_BLEND
  hh=mix(hh,mix(textureLod(uShapeH,vUV2,hl).r,textureLod(uShapeH,vUV3,hl).r,vT),vS);
  #endif
  float al=hh*uShHeight*uShLen;
  #else
  float al=vAlong;
  #endif
  float g=smoothstep(uShFoot.z,uShFoot.w,al);
  float s=mix(b.r,b.g,uShSoft*g);
  #ifdef SH_CONTACT
  // (no shape past his cell: the strip reaches past it for the oval, vCell from unitdecal.vert)
  s*=step(0.0,vCell.x)*step(vCell.x,1.0)*step(0.0,vCell.y)*step(vCell.y,1.0);
  #endif
  float dm=max(max(uShFoot.x,uShFoot.y),1e-4),v=s*mix(uShFoot.x,uShFoot.y,g);
  #ifdef SH_STEPS
  // the per-step shape's feet darker and crisper (?ushfootk, footSharpen in src/look/shadow-look.ts): its share of the
  // samples boosted at the soles (uShFootK.x), back to 1 by uShFootK.y m; capped at 1 below, so never past the look's
  // darkest (decision 0071: no darker than the ground's painted cast shadow). The shape's alone, before the contact's
  // oval joins it (?ushcontact=1 keeps decision 0071's oval exactly)
  v*=mix(uShFootK.x,1.0,smoothstep(0.0,max(uShFootK.y,1.0e-3),al));
  #endif
  #ifdef SH_CONTACT
  // the contact (contactFragment in src/look/shadow-look.ts mirrors it): one more darkness in the same rule, its share
  // the oval's, solid over it and faded out to 1 + soft of its size; the look's darkest now the darker of the two (one
  // value a frame, so every shadow still darkens a sample alike and the darkest share wins)
  float ct=uShContact.y*(1.0-smoothstep(1.0,1.0+max(uShContact.z,1.0e-4),length(vCt)));
  dm=max(dm,uShContact.y);v=max(v,ct);
  #endif
  float a=min(1.0,v/dm);
  #ifndef COVERAGE
  #ifdef SH_CONTACT
  // (as decision 0062's off the oval: its faint rim does not take the stencil from a darker core)
  if(s<0.02&&ct<0.02)discard;
  #else
  if(s<0.02)discard;
  #endif
  #endif
  vec3 k=texture2D(uUnitShade,vLM).rgb;float f=uUnitFar*uShadowsOn*dm;
  vec3 d=max(mix(vec3(1.0),k,f),0.0);
  d*=pow(max(dot(d,vec3(0.2126,0.7152,0.0722)),1.0e-3),uShGain-1.0);
  #ifdef COVERAGE
  gl_FragColor=vec4(d,a);
  #else
  gl_FragColor=vec4(mix(vec3(1.0),d,a),0.0);
  #endif
}
