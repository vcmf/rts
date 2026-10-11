// The shore band (docs/plans/done/w4-water-surface.md): within WATER_BAND m of the shoreline the tile's terrain and
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
// fwidth on WebGL1 needs GL_OES_standard_derivatives: the including shaders enable it (Babylon drops the line on
// WebGL2).
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
// a pixel's footprint on the ground, m: thin painted marks widen or fade with it (a mark under a pixel shimmers)
float pxGround(vec3 wp){vec2 f=fwidth(wp.xz);return max(f.x,f.y);}
// the ground's colour through the seasons (summer, early and late autumn, winter: uSeason 0..3), for the terrain and
// the shore band alike
vec3 groundSeason(vec3 c){
  vec3 au=mix(c,vec3(0.70,0.60,0.34),0.45),la=mix(c,vec3(0.52,0.42,0.27),0.6),wi=mix(c,vec3(0.46,0.42,0.34),0.7);
  return uSeason<1.0?mix(c,au,uSeason):uSeason<2.0?mix(au,la,uSeason-1.0):mix(la,wi,uSeason-2.0);}
// a hard painted edge, anti-aliased over about two pixels (no shimmer when the view moves): 0 below t, 1 above
float aastep(float t,float v){
  #ifdef WATER_SAB_STEP
  return step(t,v);   // the shimmer check's sabotage: aliased edges
  #else
  float w=max(fwidth(v)*1.2,1e-5);return smoothstep(t-w,t+w,v);
  #endif
}
#if defined(WATERDATA)&&defined(BANKN)
#define SHORE
// THE BANKS (W5, docs/plans/active/w5-banks.md; docs/art-bible.md §6c, research §2.9): painted over a ground colour
// c at a point land m from the water (≥ 0), h m above it, where the authored surface's normal has y = ny. Damp grass
// near the water; bare earth on steep ground near it (cut banks); pale gravel on low, gentle ground near it (point
// bars); last, the wet line at the water, wider on gentle ground (a dark edge to the pale bar). WATER_SAB_BANKS (the banks check's sabotage): none
vec3 bankPaint(vec3 c,vec2 xz,float land,float h,float ny){
  #ifdef WATER_SAB_BANKS
  return c;
  #else
  float gr=G(xz/3.0).g-0.5;
  c=mix(c*vec3(0.80,0.86,0.80),c,smoothstep(1.0,6.0,land+gr*1.5));                                   // damp grass
  float earth=smoothstep(0.82,0.62,ny)*smoothstep(4.0,1.0,land+gr);
  c=mix(c,vec3(0.47,0.36,0.23)*(0.9+0.2*G(xz/2.0).g),earth);                                          // bare earth
  float bar=smoothstep(0.8,0.2,h)*smoothstep(4.5,1.0,land+gr)*smoothstep(0.86,0.95,ny);
  vec3 gv=vec3(0.66,0.65,0.60)*(0.88+0.24*G(xz/1.1).g);gv=mix(gv,vec3(0.50,0.49,0.45),smoothstep(0.58,0.68,G(xz/2.9+0.3).g)*0.5);
  c=mix(c,gv,bar*0.9);                                                                                  // gravel: pale grey, darker pebbles
  float wetW=mix(0.35,0.8,smoothstep(0.75,0.97,ny));
  return mix(c*vec3(0.58,0.64,0.62),c,smoothstep(0.0,wetW,land+gr*0.4));                               // the wet line
  #endif
}
// the shore band's ground: damp earth with the banks painted over it, through the seasons
vec3 landAlbedo(vec2 xz,float land,float h){
  float g=G(xz/2.6).r,g2=G(xz/9.0+0.4).g;
  vec3 c=mix(vec3(0.34,0.29,0.19),vec3(0.43,0.36,0.23),g2)*(0.92+0.16*g);
  return groundSeason(bankPaint(c,xz,land,h,bankNormal(vec3(0.0,1.0,0.0),xz).y));}
// the bed: silt in pools, pale gravel where the current runs, weed in slow deeper water; the damp edge at depth 0
vec3 bedAlbedo(vec2 xz,float depth,float speed){
  float g=G(xz/1.7).r,g2=G(xz/6.0+0.2).g;
  vec3 mud=mix(vec3(0.29,0.26,0.16),vec3(0.36,0.32,0.20),g2);
  vec3 gravel=mix(vec3(0.56,0.50,0.37),vec3(0.70,0.64,0.50),g);
  vec3 b=mix(mud,gravel,smoothstep(0.45,0.85,speed+(g2-0.5)*0.3));
  b=mix(b,vec3(0.21,0.29,0.15),smoothstep(0.60,0.78,G(xz/4.3+0.6).g)*smoothstep(0.4,0.8,depth)*(1.0-speed));
  return mix(landAlbedo(xz,0.0,0.0),b,smoothstep(0.0,0.3,depth));}   // at depth 0, the ground at the water's edge
const vec3 FOAM=vec3(0.93,0.92,0.84);
// THE STONES' FOAM (W5a, research §4.4): the stones in the water (src/look/nature.ts), at most STONES: x, z, radius,
// the flow's direction (rad); a radius of 0 ends the list. Per stone, in the flow's frame: a thin pillow arc upstream,
// and a wake of two broken streaks downstream, 6 radii long, widening, drifting with the current. In the band
// function, so a stone against a cut bank has its foam on both surfaces. WATER_SAB_NOFOAM: none (the check's sabotage)
uniform vec4 uStones[STONES];
float stoneFoam(vec2 xz){
  float f=0.0,tw=mod(uTime,40.0);   // 40 s: a whole number of the breaks' periods
  #ifndef WATER_SAB_NOFOAM
  for(int k=0;k<STONES;k++){
    vec4 st=uStones[k];if(st.z<=0.0)break;
    vec2 d=xz-st.xy;float r=st.z;if(dot(d,d)>64.0*r*r)continue;   // past its wake, where it has no weight
    vec2 fl=vec2(cos(st.w),sin(st.w));float a=dot(d,fl),b=dot(d,vec2(-fl.y,fl.x));
    float pillow=(1.0-aastep(0.06+0.1*r,abs(length(d)-1.2*r)))*smoothstep(0.3*r,-0.5*r,a);
    float L=6.0*r,t=clamp(a/L,0.0,1.0),hf=r*(0.9+0.9*t),w=0.06+0.12*r*(1.0-0.5*t);
    float brk=aastep(0.42,G(vec2((a-tw*0.5)*0.35,b*0.7)+st.xy*0.13).g);
    float wake=(1.0-aastep(w,abs(abs(b)-hf)))*smoothstep(-0.2*r,0.3*r,a)*(1.0-t)*brk;
    f=max(f,max(pillow,wake*0.85));
  }
  #endif
  return f;}
// winter ice (the seasons are W5's): how much of the water it covers, 0..1; it covers every layer of the water
float iceAmt(){return clamp(uSeason-2.3,0.0,0.7)/0.7;}
// the ground at the water's edge, lit with the authored surface's normal: t its water texel
vec3 shoreLand(vec3 wp,vec4 t,float occ,float sh){return paint(landAlbedo(wp.xz,max(-waterSdf(t),0.0),-waterDepth(t)),bankNormal(vec3(0.0,1.0,0.0),wp.xz),wp,occ,0.12,1.0,sh);}
// the water's lower layers (research §2.8, layers 1, 2, 7, the shore foam, the ice): d the depth, s the shore distance,
// sp the speed (0..1)
vec3 shoreWater(vec3 wp,float d,float s,float sp,float occ,float sh){
  float dd=max(d,0.0);
  // 1. the bed seen through the water, painted at the surface's point: no refraction offset (an offset by the depth,
  // a bilinear field, makes the point's screen derivatives jump at every texel's edge, and with them the grain's
  // level of detail)
  // no snow settles under the water: it fades out over the first 5 cm of depth (the shore keeps the land's)
  pSnowK=1.0-smoothstep(0.0,0.05,dd);
  vec3 bed=paint(bedAlbedo(wp.xz,dd,sp),bankNormal(vec3(0.0,1.0,0.0),wp.xz),wp,occ,0.12,1.0,sh);
  pSnowK=1.0;
  // 2. absorption, red first; the painted ramp (shallow green-ochre, turquoise, deep teal) in bands broken by the grain
  float dn=dd*(1.0+0.35*(G(wp.xz/5.0).g-0.5)*uGrainAmt);
  vec3 T=exp(-vec3(3.0,1.5,1.1)*dn);
  float b=(1.0-T.g)*3.0+(G(wp.xz/2.0).r-0.5)*0.5;
  vec3 wc=mix(mix(vec3(0.34,0.50,0.38),vec3(0.14,0.37,0.40),smoothstep(0.9,1.1,b)),vec3(0.06,0.22,0.28),smoothstep(2.0,2.2,b));
  vec3 c=bed*T+wc*(1.0-T);
  // 7. tree and cloud shadows cool the water, deep water more (the bed is already shadowed)
  float cs=max(cloud(wp)*0.6,sh);c=mix(c,c*vec3(0.58,0.70,0.88),cs*smoothstep(0.1,0.8,dd));
  // the shore foam: a broken line about 0.2 m in and a fainter one farther out, hard-edged (thresholded grain)
  // Far out (a pixel over about 0.12 m) the line widens to at least 1.5 pixels with its ink spread over the width,
  // its breaks (0.3 m blotches) close up and the faint second line goes: under a pixel they would shimmer
  float gr=G(wp.xz/9.0+0.5).g,gb=G(wp.xz/23.0+0.2).g,j=(G(wp.xz/3.1+0.7).g-0.5)*0.25;
  float px=pxGround(wp),far=smoothstep(0.12,0.35,px),hw=max(0.14,0.75*px);
  float foam=(1.0-aastep(hw,abs(s-0.22-j)))*mix(aastep(0.5,gr)*aastep(0.42,gb),1.0,far)*0.14/hw;
  foam=max(foam,(1.0-aastep(0.05,abs(s-0.60-j*1.5)))*aastep(0.62,gr)*aastep(0.5,gb)*0.6*(1.0-far));
  c=mix(c,FOAM*mix(1.0,0.78,cs),foam*0.85);
  c=mix(c,FOAM*mix(1.0,0.78,cs),stoneFoam(wp.xz)*0.85*(1.0-0.5*far));
  // winter ice (the seasons are W5's): pale and cracked, darker over deep water
  float ice=iceAmt();
  if(ice>0.0){vec3 ic=mix(vec3(0.66,0.76,0.82),vec3(0.84,0.88,0.90),smoothstep(0.5,0.0,dd));
    float crack=smoothstep(0.03,0.0,abs(G(wp.xz/9.0).g-0.5))*0.5;ic*=1.0-crack;ic=mix(ic,ic*vec3(0.62,0.72,0.88),cs);
    c=mix(c,ic,ice*0.9);}
  return c;}
// the band's colour at a drawn point: t its water texel, occ its occlusion, sh its sun shadow, fw the shore distance's
// fwidth. Near the shore both sides are painted and blended over about a pixel: the water's side has its depth there
// (the depth and the shore distance are separate channels; on a cut bank the water at the shore is already tinted), so
// the shoreline is a hard painted edge, anti-aliased
vec3 shore(vec3 wp,vec4 t,float occ,float sh,float fw){
  float s=waterSdf(t),m=1.5*fw+1e-3;vec3 land=vec3(0.0),water=vec3(0.0);
  if(s<m)land=shoreLand(wp,t,occ,sh);
  if(s>-m)water=shoreWater(wp,waterDepth(t),s,length(waterFlow(t)),occ,sh);
  return mix(land,water,aastep(0.0,s))*(1.0+(G(wp.xz/4.0).r-0.5)*uGrainAmt*0.14);}   // the gouache grain, on both sides (continuous at the shore)
#endif
