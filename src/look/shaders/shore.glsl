// The shore band (docs/plans/active/w4-water-surface.md): within WATER_BAND m of the shoreline the tile's terrain and
// the water paint the same colour, from inputs both have at a world point (the water data, the bank normals, the
// light map, the paint grain), so the shore is painted from the data whichever surface the depth test keeps. Where
// the two surfaces meet on screen they intersect, so they share the point there and the colours match.
// BANKN: the fine bank normals (docs/plans/done/w2-river-banks.md); BANKN_OFF, the bank check's sabotage, leaves
// the given normal. SHORE: the band itself (needs the water data, WATERDATA, and the bank normals).
// Derivatives (paint()'s, the grain's mip levels, aastep's) are undefined in a branch some pixels of a 2×2 quad skip,
// so every branch here and in its callers reaches past where what it computes has weight by 1.5 times the deciding
// value's screen derivative (fw: fwidth of the shore distance, taken outside any branch): a quad with one pixel that
// needs the branch takes it whole (the shore distance changes across a quad by at most its fwidth).
// Hard edges threshold the grain's soft blotches (G), never its per-texel noise (R): that speckles under a pixel.
#ifdef BANKN
#ifndef BANKN_OFF
uniform sampler2D uBankN;   // x, z of the authored surface's normal, the weight
#endif
vec3 bankNormal(vec3 N,vec2 xz){
  #ifdef BANKN_OFF
  return N;
  #else
  vec4 bk=texture2D(uBankN,(xz+TILE_HALF)/TILE_W);vec2 b=bk.xy*2.0-1.0;
  return normalize(mix(N,vec3(b.x,sqrt(max(0.0,1.0-dot(b,b))),b.y),bk.z));
  #endif
}
#endif
// a hard painted edge, anti-aliased over about a pixel (no shimmer when the view moves): 0 below t, 1 above
float aastep(float t,float v){
  #ifdef WATER_SAB_STEP
  return step(t,v);   // the shimmer check's sabotage: aliased edges
  #else
  float w=max(fwidth(v)*0.7,1e-5);return smoothstep(t-w,t+w,v);
  #endif
}
#if defined(WATERDATA)&&defined(BANKN)
#define SHORE
// damp earth at the water's edge
vec3 landAlbedo(vec2 xz){
  float g=G(xz/2.6).r,g2=G(xz/9.0+0.4).g;
  return mix(vec3(0.34,0.29,0.19),vec3(0.43,0.36,0.23),g2)*(0.92+0.16*g);}
// the bed: silt in pools, pale gravel where the current runs, weed in slow deeper water; the damp edge at depth 0
vec3 bedAlbedo(vec2 xz,float depth,float speed){
  float g=G(xz/1.7).r,g2=G(xz/6.0+0.2).g;
  vec3 mud=mix(vec3(0.29,0.26,0.16),vec3(0.36,0.32,0.20),g2);
  vec3 gravel=mix(vec3(0.56,0.50,0.37),vec3(0.70,0.64,0.50),g);
  vec3 b=mix(mud,gravel,smoothstep(0.45,0.85,speed+(g2-0.5)*0.3));
  b=mix(b,vec3(0.21,0.29,0.15),smoothstep(0.60,0.78,G(xz/4.3+0.6).g)*smoothstep(0.4,0.8,depth)*(1.0-speed));
  return mix(landAlbedo(xz),b,smoothstep(0.0,0.3,depth));}
const vec3 FOAM=vec3(0.93,0.92,0.84);
// the ground at the water's edge, lit with the authored surface's normal
vec3 shoreLand(vec3 wp,float occ,float sh){return paint(landAlbedo(wp.xz),bankNormal(vec3(0.0,1.0,0.0),wp.xz),wp,occ,0.12,1.0,sh);}
// the water's lower layers (research §2.8, layers 1, 2, 7, the shore foam, the ice): d the depth, s the shore distance,
// sp the speed (0..1)
vec3 shoreWater(vec3 wp,float d,float s,float sp,float occ,float sh){
  float dd=max(d,0.0);
  // 1. the bed seen through the water: read along the view ray, at 3/4 of the depth (the painted refraction)
  vec3 V=normalize(uCamPos-wp);vec2 off=-V.xz/max(V.y,0.35)*dd*0.75;
  vec3 bp=vec3(wp.x+off.x,wp.y-dd,wp.z+off.y);
  vec3 bed=paint(bedAlbedo(bp.xz,dd,sp),bankNormal(vec3(0.0,1.0,0.0),bp.xz),bp,occ,0.12,1.0,sh);
  // 2. absorption, red first; the painted ramp (shallow green-ochre, turquoise, deep teal) in bands broken by the grain
  float dn=dd*(1.0+0.35*(G(wp.xz/5.0).g-0.5)*uGrainAmt);
  vec3 T=exp(-vec3(3.0,1.5,1.1)*dn);
  float b=(1.0-T.g)*3.0+(G(wp.xz/2.0).r-0.5)*0.5;
  vec3 wc=mix(mix(vec3(0.34,0.50,0.38),vec3(0.14,0.37,0.40),smoothstep(0.9,1.1,b)),vec3(0.06,0.22,0.28),smoothstep(2.0,2.2,b));
  vec3 c=bed*T+wc*(1.0-T);
  // 7. tree and cloud shadows cool the water, deep water more (the bed is already shadowed)
  float cs=max(cloud(wp)*0.6,sh);c=mix(c,c*vec3(0.58,0.70,0.88),cs*smoothstep(0.1,0.8,dd));
  // the shore foam: a broken line about 0.2 m in and a fainter one farther out, hard-edged (thresholded grain)
  float gr=G(wp.xz/9.0+0.5).g,gb=G(wp.xz/23.0+0.2).g,j=(G(wp.xz/3.1+0.7).g-0.5)*0.25;
  float foam=(1.0-aastep(0.14,abs(s-0.22-j)))*aastep(0.5,gr)*aastep(0.42,gb);
  foam=max(foam,(1.0-aastep(0.05,abs(s-0.60-j*1.5)))*aastep(0.62,gr)*aastep(0.5,gb)*0.6);
  c=mix(c,FOAM*mix(1.0,0.78,cs),foam*0.85);
  // winter ice (the seasons are W5's): pale and cracked, darker over deep water
  float ice=clamp(uSeason-2.3,0.0,0.7)/0.7;
  if(ice>0.0){vec3 ic=mix(vec3(0.66,0.76,0.82),vec3(0.84,0.88,0.90),smoothstep(0.5,0.0,dd));
    float crack=smoothstep(0.03,0.0,abs(G(wp.xz/9.0).g-0.5))*0.5;ic*=1.0-crack;ic=mix(ic,ic*vec3(0.62,0.72,0.88),cs);
    c=mix(c,ic,ice*0.9);}
  return c;}
// the band's colour at a drawn point: t its water texel, occ its occlusion, sh its sun shadow, fw the shore distance's
// fwidth. Near the shore both sides are painted (the choice between them is a select, not a branch)
vec3 shore(vec3 wp,vec4 t,float occ,float sh,float fw){
  float s=waterSdf(t),m=1.5*fw+1e-3;vec3 land=vec3(0.0),water=vec3(0.0);
  if(s<m)land=shoreLand(wp,occ,sh);
  if(s>-m)water=shoreWater(wp,waterDepth(t),s,length(waterFlow(t)),occ,sh);
  return (s<=0.0?land:water)*(1.0+(G(wp.xz/4.0).r-0.5)*uGrainAmt*0.14);}   // the gouache grain, on both sides (continuous at the shore)
#endif
