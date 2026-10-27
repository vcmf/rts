#extension GL_OES_standard_derivatives : enable
precision highp float;uniform sampler2D uShapeTex,uUnitShade;uniform vec2 uShapeSize;uniform float uUnitFar,uShSoft,uShGain;uniform vec4 uShFoot;
varying vec2 vUV0,vUV1,vLM;varying float vT,vAlong;
#ifdef SH_CAP
// the contact shadow and the cap (docs/decisions/0071-soldier-contact-shadow.md): uShContact (its pad, m: the vertex's; its
// darkness, a share of the cap's darkening; its fade past the oval; the cap's exponent, baked into the shade); vCt: the
// fragment in the contact's oval (1 at its edge, unitdecal.vert)
// (SH_CONTACT: the oval; without it, past the contact's zoom band, the cap alone)
uniform vec4 uShContact;
#ifdef SH_CONTACT
varying vec2 vCt,vCell;
#endif
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
  float g=smoothstep(uShFoot.z,uShFoot.w,vAlong);
  vec2 b=mix(textureLod(uShapeTex,vUV0,lod).rg,textureLod(uShapeTex,vUV1,lod).rg,vT);float s=mix(b.r,b.g,uShSoft*g);
  #ifdef SH_CONTACT
  // (no shape past his cell: the strip reaches past it for the oval, vCell from unitdecal.vert)
  s*=step(0.0,vCell.x)*step(vCell.x,1.0)*step(0.0,vCell.y)*step(vCell.y,1.0);
  #endif
  float dm=max(max(uShFoot.x,uShFoot.y),1e-4),a=min(1.0,s*mix(uShFoot.x,uShFoot.y,g)/dm);
  #ifdef SH_CAP
  // the capped look (cappedCover in src/look/shadow-look.ts mirrors it): every covered sample takes the cap's
  // darkening (the ground's shade, its luminance raised to the cap's exponent, its hue kept: the same for every shadow at a
  // pixel, so the darkest share still wins), on the share that gives the pixel the sun's shadow's darkening as the
  // uncapped look and the gain would, or the contact's, whichever is more, at most all: never darker than the cap
  #ifdef SH_CONTACT
  float ct=uShContact.y*(1.0-smoothstep(1.0,1.0+uShContact.z,length(vCt)));
  #else
  float ct=0.0;
  #endif
  #ifndef COVERAGE
  if(s<0.02&&ct<0.02)discard;
  #endif
  // (the cap's factor L(k)^(cap - 1) baked in the shade's alpha, unitshade.frag: no power raised for it here)
  // (the luminance is linear in the mix toward the shade, so one dot serves both: the gained darkness's lg and the
  // cap's room, 1 - its luminance; the gained darkness's per-channel clamp at 0 left out: it takes a shade channel
  // under 1 - 1 / dm, 0.05 at the default looks, far darker than any painted cast shadow's ratio)
  vec4 K=texture2D(uUnitShade,vLM);float fz=uUnitFar*uShadowsOn,lk=dot(K.rgb,vec3(0.2126,0.7152,0.0722));
  float lg=pow(max(1.0-(1.0-lk)*fz*dm,1.0e-3),uShGain),room=fz*(1.0-lk*K.a);
  vec3 d=mix(vec3(1.0),K.rgb*K.a,fz);
  a=room<1.0e-3?0.0:min(1.0,max(a*(1.0-lg)/room,ct));
  #else
  #ifndef COVERAGE
  if(s<0.02)discard;
  #endif
  vec3 k=texture2D(uUnitShade,vLM).rgb;float f=uUnitFar*uShadowsOn*dm;
  vec3 d=max(mix(vec3(1.0),k,f),0.0);
  d*=pow(max(dot(d,vec3(0.2126,0.7152,0.0722)),1.0e-3),uShGain-1.0);
  #endif
  #ifdef COVERAGE
  gl_FragColor=vec4(d,a);
  #else
  gl_FragColor=vec4(mix(vec3(1.0),d,a),0.0);
  #endif
}
