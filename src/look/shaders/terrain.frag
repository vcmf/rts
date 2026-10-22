#extension GL_OES_standard_derivatives : enable
precision highp float;varying vec3 vW,vN;varying float vRiver;
#include<painter>
#include<waterdata>
#include<shore>

#ifdef FARRING
uniform sampler2D uRiverMask;
#endif
// the ground's colour: its cover's (groundAt, the macro colour's arm: macro.glsl, shared with the shore band), stony
// where steep, the banks, the seasons. wt: the water data here (WATERDATA)
vec3 albedo(vec3 wp,vec3 n,vec4 wt){
  vec3 m=roadPaint(earthOn(dirtOn(groundAt(wp.xz,pxMacro()),wp.xz,pxMacro()),wp.xz,pxMacro()),wp.xz),c=groundSteep(m,n.y);
  // stream banks: on the tile from the water data (W5, bankPaint in src/look/shaders/shore.glsl); within BANK_EDGE of
  // the tile's edge, and on the apron and the far ring, from aRiver, as before W5 (the bands over the ground, then the
  // stony steep ground over them), which the far ring's painted line continues
  float rb=vRiver+(G(wp.xz/3.0).r-0.5)*0.35;                                   // distance to the bank in half-widths
  vec3 cr=mix(m*vec3(0.72,0.78,0.70),m,smoothstep(0.1,0.9,rb));                // damp ground near the water
  cr=mix(vec3(0.20,0.36,0.22),cr,smoothstep(-0.05,0.4,rb));
  cr=groundSteep(mix(vec3(0.42,0.34,0.22),cr,smoothstep(-0.35,-0.05,rb)),n.y);
  #ifdef SHORE
  // the banks are painted on land within BANK_REACH of the water; past it, and under the water (where the band, or the
  // water itself, is what shows), the ground is left as it is (the branch reaches past both edges by the derivatives'
  // margin, shore.glsl)
  float sd=waterSdf(wt),fsd=1.5*fwidth(sd),land=max(-sd,0.0);vec3 cb=c;
  if(sd<fsd&&-sd<BANK_REACH+fsd)cb=bankPaint(c,wp.xz,land,-waterDepth(wt),bankNormal(vec3(0.0,1.0,0.0),wp.xz).y);
  c=mix(cr,cb,1.0-smoothstep(TILE_HALF-BANK_EDGE,TILE_HALF,max(abs(wp.x),abs(wp.z))));
  #else
  c=cr;
  #endif
  return groundSeason(c);
}
#ifdef TRAMPLE
varying float vTrample;
// trodden ground: the mask broken by the grain's blotches (no edge a decal would have), the ground toward a pale dusty
// earth in summer, a grey-brown slush where the snow is trodden away in winter (its snow held off: pSnowK)
// (read only where the mask is over 0: the grain costs nothing elsewhere)
vec3 trodAlb(vec3 alb,vec3 N,out float t){
  t=0.0;if(vTrample<0.01)return alb;
  vec3 g=grainW(vW,N,3.0);t=smoothstep(0.12,0.8,vTrample+(g.g-0.5)*0.35);
  vec3 dust=mix(vec3(0.60,0.53,0.41),vec3(0.36,0.32,0.28),smoothstep(2.0,3.0,uSeason));
  return mix(alb,dust*mix(0.92,1.06,g.r),t*0.75);}
#endif
void main(){
  macroDerivs(vW.xz);   // before any branch (shore.glsl)
  #ifdef WATER_DEBUG
  if(uWaterView>0.5){gl_FragColor=vec4(waterView(vW.xz),1.0);return;}   // the water data's debug views
  #endif
  #ifdef MACRO_DEBUG
  gl_FragColor=vec4(classAt(vW.xz)*20.0/255.0,0.0,0.0,1.0);return;   // the class check's view (macro.glsl): the class ×20 in red
  #endif
  vec3 N=normalize(vN);vec4 lm=LM(vW);float bankTurn=0.0;
  #ifdef BANKN
  vec3 bN=bankNormal(N,vW.xz);   // the fine bank normals (src/look/shaders/shore.glsl)
  bankTurn=step(0.001,1.0-dot(bN,N));N=bN;   // where the bank normals turn the shading normal by over about 2.5°
  #endif
  #ifdef DETAIL_DEBUG_N
  gl_FragColor=vec4(N*0.5+0.5,1.0);return;   // the bank check's view: the shading normal
  #endif
  float sh=(1.0-lm.r)*uShadowsOn,occ=mix(1.0,groundOcc(lm),uAO);pSky=mix(1.0,lm.g,uAO);
  #if defined(UNIT_SHADOWS)||defined(UNIT_SHADOW_MASK)
  sh=max(sh,unitShadowMix(vW));
  #endif
  #ifdef WATERDATA
  vec4 wt=waterTexel(vW.xz);   // the water data here: the banks (albedo) and the shore band (below)
  #else
  vec4 wt=vec4(0.0);
  #endif
  vec3 alb=albedo(vW,N,wt);
  #ifdef FARRING
  float rm=texture2D(uRiverMask,vW.xz/FAR_W+0.5).r;                   // painted river line on the far ring
  alb=mix(alb,alb*vec3(0.72,0.78,0.70),smoothstep(0.0,0.15,rm));
  alb=mix(alb,uFarRiver,smoothstep(0.3,0.6,rm));   // the water mid tone after its sky tint, so the line matches the river at the tile edge
  #endif
  #if defined(MEADOW)&&defined(MEADOW_UNDER)   // (guarded: the hill compiles no shore section, where meadowUnder lives)
  alb=meadowUnder(alb,vW.xz);   // the dark ground under the near grass and crops (shore.glsl, the tile only)
  #endif
  pSnowLie=snowLie(vW.xz,pxMacro());   // the fields' furrows hold the snow (macro.glsl)
  #ifdef TRAMPLE
  float trod;alb=trodAlb(alb,N,trod);pSnowK*=1.0-0.85*trod;
  #endif
  #ifdef GROUND_BOUNCE
  pGround=groundBounceAt(vW);   // the bounce map (LC5)
  #endif
  vec3 c=paint(alb,N,vW,occ,0.12,1.0,sh);
  #ifdef DETAIL_DEBUG_INC
  // the checks' incidence view: |cos| in red; the biplanar major plane's weight in green; in blue, where the bank
  // normals turn the shading normal (the river's banks)
  #ifdef DETAIL_ON
  gl_FragColor=vec4(abs(dot(N,normalize(uCamPos-vW))),pW.x,bankTurn,1.0);return;
  #else
  gl_FragColor=vec4(abs(dot(N,normalize(uCamPos-vW))),0.0,bankTurn,1.0);return;
  #endif
  #endif
  #ifdef DETAIL_DEBUG
  // the checks' view (tools/detail-check.mjs): the detail grain in red (0.5 ± half its deviation), the view distance
  // in green and blue (16 bits over 0–1000 m)
  float dd=floor(clamp(length(vW-uCamPos)/1000.0,0.0,1.0)*65535.0);
  gl_FragColor=vec4(clamp(0.5+(pDetail-0.5)*0.5,0.0,1.0),floor(dd/256.0)/255.0,mod(dd,256.0)/255.0,1.0);return;
  #endif
  #if defined(SHORE)&&!defined(WATER_SAB_TERRAIN)
  // the shore band (src/look/shaders/shore.glsl), and the next 0.4 m inland blending to the ground's own colour. Past
  // the band in the water the ground keeps its own colour: the water always covers it there (the band check, tools/
  // water-look-check.mjs), so the band is not painted under the water. WATER_SAB_TERRAIN: the seam check's sabotage,
  // the terrain without the band
  float ws=waterSdf(wt),fws=fwidth(ws);   // fws: the branches' margin (shore.glsl)
  if(ws>-WATER_BAND-0.4-1.5*fws&&ws<WATER_BAND+1.5*fws){vec2 ia=iceAt(vW.xz,length(waterFlow(wt)),max(waterDepth(wt),0.0));   // the ice, once (shore.glsl)
    c=mix(c,withStones(shore(vW,wt,occ,sh,fws,ia),vW,ws,sh,ia.x),smoothstep(-WATER_BAND-0.4,-WATER_BAND,ws)*step(ws,WATER_BAND));}
  #endif
  gl_FragColor=lensOut(airOf(c,vW,lm,0.0),vW);}