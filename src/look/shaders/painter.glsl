
uniform sampler2D uGrain;
uniform vec3 uSunDir,uSunCol,uShadowCol,uHazeCool,uHazeWarm,uCamPos,uFocus;
// the mood's other colours (src/look/mood.ts)
uniform vec3 uCloudSnow;
uniform vec3 uShadowTurn,uShadowLift,uMidCool,uLitLift,uRimCol,uBackCol,uMistShade,uMistLit,uWaterSky,uGlint,uFarRiver;   // uShadowTurn: divided by its luma
// the grade (gradeOf, at the end of atmos), and how much of the light units take (KEEP_HUE: docs/plans/done/lc1b-coats.md)
uniform vec3 uGreenTint,uSplitLo,uSplitHi,uLift,uTopHaze;uniform float uGreenChroma,uGreenAmt,uGradeSat,uTopAmt,uGrade,uMoodMist,uContrast,uGreenHue;
uniform float uViewH;   // the height of the target the scene is drawn into, for the grade's haze toward the top
uniform float uUnitTint,uUnitMist,uUnitGrade,uUnitBounce;
uniform vec3 uEarthTint;uniform float uEarthChroma,uEarthAmt,uBounce,uGroundBounce;   // the earth (the mood): the world toward earth tones
uniform float uTime,uGrainAmt,uEdges,uClouds,uSeason,uSeasonGround;

// Rec. 709 luma: the grade and the value units keep (the painted bands use the older 0.3, 0.59, 0.11)
const vec3 LUMA=vec3(0.2126,0.7152,0.0722);
vec3 G(vec2 uv){return texture2D(uGrain,uv).rgb;}
vec3 grainW(vec3 wp,vec3 n,float sc){vec2 p=abs(n.y)>0.6?wp.xz:(abs(n.x)>abs(n.z)?wp.zy:wp.xy);return G(p/sc);}
// SEASON (docs/art-bible.md §4b): 0 summer · 1 early autumn · 2 late autumn · 3 winter.
// Snow settles on whatever faces up, broken by the grain, so it reads as painted.
// NOSNOW: surfaces snow never settles on (the guard's army blocks, as units)
float pSnowK=1.0;   // a weight on the snow, for a surface it only partly settles on (the riverbed: src/look/shaders/shore.glsl)
// added to the snow's threshold where the ground holds more or less of it (the fields' furrows and ridges: snowLie in
// src/look/shaders/macro.glsl)
float pSnowLie=0.0;
// snowLies: where snow lies, for any material (the ground's bounce reads it under a unit, LC4). snowAt: on this
// material, none under NOSNOW (a unit carries none)
float snowLies(vec3 N,vec3 wp){
  float s=clamp(uSeason-2.0,0.0,1.0);if(s<=0.0)return 0.0;
  // where the ground moves the threshold (pSnowLie: the fields' furrows) the snow's edge runs across open ground, and
  // there it breaks on the grain's soft blotches (G), not its per-texel noise (R), which speckles under a pixel, over a
  // wider band (snow against bare earth is the frame's strongest contrast; a width from fwidth would step by 2×2
  // pixels, W5b's lesson)
  // (blended in with the lie's size, so the edge changes nowhere abruptly, and with no lie it is exactly the old one)
  vec3 gw=grainW(wp,N,4.0);float m=smoothstep(0.0,0.05,abs(pSnowLie));
  float x=N.y*1.15*s+(mix(gw.r,gw.g,m)-0.5)*0.4+(s-1.0)*0.35+pSnowLie,w=mix(0.085,0.25,m);
  return smoothstep(0.635-w,0.635+w,x)*pSnowK;}
// Per-tree foliage colour. t = per-instance random; kind: 0 deciduous, 1 evergreen, 2 grass.
vec3 foliage(vec3 a,vec3 b,float t,float kind){
  vec3 summer=mix(a,b,t);
  float h=fract(t*7.13);
  summer=mix(summer,vec3(0.36,0.18,0.24),step(0.95,h)*step(kind,0.5));   // a rare copper beech, all year
  if(kind>1.5){                                                            // grass: one field colour per season
    vec3 au=mix(summer,mix(vec3(0.72,0.62,0.32),vec3(0.66,0.58,0.45),AUTUMN_WARM),0.55),la=mix(summer,vec3(0.55,0.44,0.26),0.7),wi=vec3(0.50,0.45,0.34);
    return uSeason<1.0?mix(summer,au,uSeason):uSeason<2.0?mix(au,la,uSeason-1.0):mix(la,wi,uSeason-2.0);}
  if(kind>0.5)return mix(summer,summer*vec3(0.78,0.88,0.95),clamp(uSeason-2.0,0.0,1.0));   // conifers stay green
  vec3 au=h<0.30?mix(vec3(0.86,0.46,0.12),vec3(0.96,0.62,0.18),t)      // orange
         :h<0.55?mix(vec3(0.92,0.74,0.22),vec3(0.98,0.85,0.40),t)      // yellow
         :h<0.72?mix(vec3(0.70,0.17,0.10),vec3(0.84,0.30,0.14),t)      // red
         :h<0.76?vec3(0.48,0.20,0.34)                                  // purple, rare
         :h<0.95?mix(summer,vec3(0.72,0.62,0.22),0.45)                 // still turning
         :vec3(0.36,0.18,0.24);
  // the mood's warm autumn (AUTUMN_WARM, docs/plans/active/epic-palette.md): one family of warm pastels, as Tiny
  // Glade's, peach, apricot, soft orange and butter, instead of the mixed wood
  #if AUTUMN_ON
  if(uSeason>0.3){   // (uniform: autumn has begun)
  vec3 pa=h<0.35?mix(vec3(0.95,0.58,0.32),vec3(0.98,0.70,0.42),t):h<0.65?mix(vec3(0.97,0.76,0.40),vec3(0.99,0.86,0.55),t)
         :h<0.85?mix(vec3(0.90,0.46,0.28),vec3(0.95,0.58,0.36),t):vec3(0.92,0.66,0.50);
  pa=mix(vec3(dot(pa,vec3(0.3,0.59,0.11))),pa,0.78);   // (softened: the owner, the first pastels too saturated)
  au=mix(au,pa,AUTUMN_WARM);}
  #endif
  vec3 la=mix(au*vec3(0.80,0.62,0.50),vec3(0.46,0.30,0.18),0.45);       // late autumn: browner, duller
  vec3 wi=vec3(0.34,0.29,0.24);                                         // winter: bare-looking, snow does the rest
  return uSeason<1.0?mix(summer,au,uSeason):uSeason<2.0?mix(au,la,uSeason-1.0):mix(la,wi,uSeason-2.0);
}float snowAt(vec3 N,vec3 wp){
  #ifdef NOSNOW
  return 0.0;
  #else
  return snowLies(N,wp);
  #endif
}

// REAL sun shadow from the depth pass; PCF taps jittered by the paint grain,
// so shadow edges come out brushy instead of pixel-sharp.
uniform sampler2D uShadowMap;uniform mat4 uLightVP;uniform vec2 uSMTexel,uSMFade;uniform float uShadowsOn;
float shadowAt(vec3 wp,vec3 n){
  vec4 lp=uLightVP*vec4(wp+n*0.6,1.0);vec3 q=lp.xyz/lp.w;vec2 uv=q.xy*0.5+0.5;
  if(uv.x<0.0||uv.y<0.0||uv.x>1.0||uv.y>1.0||q.z>1.0)return 0.0;   // outside the sun's view (incl. beyond its far plane) = lit
  float d=q.z*0.5+0.5-SBIAS;
  vec2 j=(vec2(texture2D(uGrain,wp.xz*0.6).r,texture2D(uGrain,wp.zx*0.6+0.3).r)-0.5)*3.0;
  float s=0.0;
  for(int x=0;x<2;x++)for(int y=0;y<2;y++)s+=step(texture2D(uShadowMap,uv+(vec2(float(x),float(y))*2.0-1.0+j)*uSMTexel).r,d);
  vec2 e=min(uv,1.0-uv);float fade=smoothstep(0.0,uSMFade.x,e.x)*smoothstep(0.0,uSMFade.y,e.y);   // soft edge: far foliage past the box fades to lit
  return s/4.0*uShadowsOn*fade;}
// BAKED LIGHT MAP (world XZ): R sun visibility, G occlusion, B valley-mist mask, A the contact under trees (outside the
// map: 1, no contact). groundOcc: the occlusion of the ground and what grows flat on it, contact included
uniform sampler2D uLM;uniform mat4 uLMVP;uniform float uAO,uMist,uShafts,uBack;
float groundOcc(vec4 lm){return lm.g*lm.a;}
// a screen-door threshold in 0..1 (interleaved gradient noise): two draws cut by it at f and 1 - f share every pixel
float dither(vec2 fc){return fract(52.9829189*fract(dot(fc,vec2(0.06711056,0.00583715))));}
vec2 lmUV(vec3 wp){vec4 p=uLMVP*vec4(wp,1.0);return p.xy/p.w*0.5+0.5;}   // the tile's top-down maps' coordinates (the light map, the bounce map)
vec4 LM(vec3 wp){vec2 uv=lmUV(wp);
  if(uv.x<0.002||uv.y<0.002||uv.x>0.998||uv.y>0.998)return vec4(1.0,1.0,0.0,1.0);
  return texture2D(uLM,uv);}
// Valley mist: warm where the air is sunlit, cool where it's shadowed. Light shafts =
// the air column's sun visibility, read from the light map at 3 heights along the view ray.
// Known issue #62: the lit air tints sunlit snow orange.
vec3 mist(vec3 c,vec3 wp,vec4 lm,float hAbove){
  float m=lm.b*uMist*uMoodMist*exp(-hAbove*0.12);if(m<0.01)return c;
  float air=mix(1.0,lm.r,uShadowsOn);
  if(uShafts>0.5){vec3 v=normalize(uCamPos-wp);float s=0.0;
    for(int i=0;i<3;i++){float h=(float(i)+0.5)/3.0*7.0;vec3 q=wp+v*(h/max(v.y,0.25));
      s+=LM(q-uSunDir*((q.y-wp.y)/uSunDir.y)).r;}
    air=s/3.0;}
  float n=G(wp.xz/55.0+uTime*vec2(0.004,0.0015)).g;
  // thinner over the cast shadow on the ground, which keeps its shape; less so above the ground (a crown, a block), whose
  // own light is not that of the ground
  float t=clamp(m*(0.35+0.55*n),0.0,0.42)*mix(1.0,mix(0.55,1.0,1.0-(1.0-lm.r)*uShadowsOn),exp(-hAbove*0.5));
  #ifdef KEEP_HUE
  t=min(t,uUnitMist);   // units: the air in front of them thinner (the mood), at their own value (airOf)
  #endif
  return mix(c,mix(uMistShade,uMistLit,air),t);}
// view distance in alpha → depth of field without re-rendering the scene
// the depth of field lens term in alpha (docs/plans/done/dof-v2.md): s = 1 - focus/z, z the depth along the view axis
// (uFocusZ: the focus, uCamFwd: the axis), over -1 (half the focus distance) to 0.5 (twice it), in the codes 1 to 254 of
// the alpha's 8 bits; every surface writes it, the units too (they blur by their depth as the scene does: the owner,
// decision 0040). The code 0 is a pixel that is not a number (an 8-bit target stores one as 0), 255 the clear (no
// surface: the farthest). The scene target stays 8 bits with the depth of field on (dofcoc.glsl reads the codes)
uniform float uFocusZ;uniform vec3 uCamFwd;
float depthA(vec3 wp){float s=1.0-uFocusZ/max(dot(wp-uCamPos,uCamFwd),0.01);
  return (1.0+floor((clamp(s,-1.0,0.5)+1.0)/1.5*253.0+0.5))/255.0;}
// a surface's output: its colour and lens code, the code 0 where the colour is not a finite number (the 8-bit target
// would store it black, which the depth of field could not tell from paint: docs/plans/done/nan-guard.md). The test
// (abs below the half float's largest) is one no compiler folds away, as it may x == x
vec4 lensOut(vec3 c,vec3 wp){return vec4(c,all(lessThan(abs(c),vec3(65504.0)))?depthA(wp):0.0);}
// Big painted cloud shadows drifting over the land: the top-down camera's only "sky".
float cloud(vec3 wp){
  vec2 p=wp.xz+uTime*vec2(2.2,0.8);
  float c=0.62*G(p/330.0).g+0.38*G(p/131.0+vec2(0.37,0.11)).g;
  return smoothstep(0.59,0.72,c+(G(wp.xz/5.0).r-0.5)*0.06)*uClouds;   // deepening from the edge to the middle (docs/plans/done/ground-light.md)
}
// a painted colour under a cloud (cl, cloud()), on every material: darkened and cooled, not dropped into a darker band,
// which the grain broke into dark islands, so the ground, a crown, a roof and a coat under one cloud take one shade
// (the owner, 2026-10-14: a coat reads by its colour and its shadow at its feet, docs/plans/done/units-cloud-shade.md).
// On snow bluer and darker (luma 0.75 against 0.83): a white coat reads on snow under a cloud by that contrast (the
// guard)
const vec3 CLOUD_SHADE=vec3(0.78,0.83,0.92);   // a cloud shade (on snow the mood colour uCloudSnow)
vec3 cloudShade(vec3 c,float cl,float snow){return mix(c,c*mix(CLOUD_SHADE,uCloudSnow,snow),cl);}
// the shadow band (docs/plans/done/shadow-look.md): more saturated than the base and turned toward a cool blue
// violet at the same value (a darker band costs dark coats their separation, tools/guard.mjs). KEEP_HUE: the
// army coats keep the band of main, so a coat in shadow loses none of its colour
// (the shadow band's colour and turn follow the season, blended once a frame on the CPU: src/look/main.ts, seasonLight)
vec3 shadowOf(vec3 a){const vec3 Y=vec3(0.3,0.59,0.11);float l=dot(a,Y);
  vec3 s=clamp(mix(vec3(l),a,1.15),0.0,1.0)*uShadowCol*0.80;float v=dot(s,Y);   // the band of main, whose value is kept
  #ifndef KEEP_HUE
  vec3 t=clamp(mix(vec3(l),a,1.3),0.0,1.0)*uShadowCol;
  s=mix(t/max(dot(t,Y),1e-4),uShadowTurn,0.25)*v;
  #endif
  return s+uShadowLift;}
// THE TERRAIN'S DETAIL LAYER (docs/plans/active/l2-detail.md, L2b): the paint grain at a constant size on screen.
// DETAIL: the terrain's materials; DETAIL_L0 puts back the L0 grain (the bench's and the checks' baseline).
// Biplanar projection (the two planes most facing the normal; the third has no weight, and on gentle ground nor has
// the second, so it is not read). Two power-of-two octaves of the texture, cross-faded by the pixel's footprint on
// the ground, so one texture tile spans DETAIL_PX pixels of a 1080-line frame at every zoom. Each octave reads two
// variants (Quilez's index variation, the index fixed in the world) against tiling; the blend's lost contrast is
// given back (variance renormalised). Every read is a textureGrad from the world position's derivatives, taken
// once: no change of plane, octave or variant reaches the mip selection.
#if defined(DETAIL)&&!defined(DETAIL_L0)
#define DETAIL_ON
#endif
uniform vec2 uGrainMean;    // the means of the grain's R and G channels: the renormalisations' centres
uniform float uPixA;        // the angle of one pixel of a 1080-line frame, from the camera's vertical field of view
float pSky=1.0;            // the ground sky occlusion (the light map G) for paint(), set by the ground materials only
float pDetail;              // the detail grain of the last paint(), for DETAIL_DEBUG
#ifdef DETAIL_ON
vec3 dPx,dPy;int pMa,pMe;vec2 pW;float pFade;
vec2 pUA,pUB,pXA,pXB,pYA,pYB;   // the two planes' coordinates and their screen derivatives, picked once
// a plane's coordinates, by the axis it faces (as Quilez's: x → yz, y → zx, z → xy)
vec2 onPlane(vec3 v,int ax){return ax==0?v.yz:ax==1?v.zx:v.xy;}
// the two planes and their weights, from the normal (zero weight at and below 1/sqrt(3), so a plane change is
// smooth). Near the cube's diagonals (a 55° slope facing between two axes) every weight goes to zero and which two
// planes are read flips: there the grain fades to its mean (pFade), so the result stays continuous
void detailPlanes(vec3 wp,vec3 n){n=abs(n);
  pMa=(n.x>=n.y&&n.x>=n.z)?0:(n.y>=n.z)?1:2;                 // ties go to the first axis, so the two always differ
  int o1=pMa==0?1:0,o2=pMa==2?1:2;pMe=n[o1]>=n[o2]?o1:o2;
  vec2 w=clamp((vec2(n[pMa],n[pMe])-0.5773)/(1.0-0.5773),0.0,1.0);float sw=w.x+w.y;
  pW=sw>0.0?w/sw:vec2(1.0,0.0);pFade=clamp(sw/0.25,0.0,1.0);
  pUA=onPlane(wp,pMa);pXA=onPlane(dPx,pMa);pYA=onPlane(dPy,pMa);
  pUB=onPlane(wp,pMe);pXB=onPlane(dPx,pMe);pYB=onPlane(dPy,pMe);}
#ifdef DETAIL_SAB_IMPLICIT
#define TEXG(uv,gx,gy) texture(uGrain,uv)                 // sabotage: implicit derivatives (mip lines at hand-overs)
#else
#define TEXG(uv,gx,gy) textureGrad(uGrain,uv,gx,gy)
#endif
// one read on the two planes at world size S, shifted by off (in tiles)
vec4 detailRead(float S,vec2 off){
  vec4 a=TEXG(pUA/S+off,pXA/S,pYA/S);
  if(pW.y<=0.0)return a;
  return a*pW.x+TEXG(pUB/S+off,pXB/S,pYB/S)*pW.y;}
// one octave: two variants by the index (the hand-over between them depends on the index alone, so where one
// variant has no weight it is not read); returns the value and its weights' sum of squares
vec2 detailOctave(float S,float idx){
  float i=floor(idx),s=smoothstep(0.2,0.8,idx-i),a=0.0,b=0.0;
  if(s<1.0)a=detailRead(S,sin(vec2(3.0,7.0)*i)).r;
  if(s>0.0)b=detailRead(S,sin(vec2(3.0,7.0)*(i+1.0))).r;
  return vec2(mix(a,b,s),(1.0-s)*(1.0-s)+s*s);}
float detailGrain(vec3 wp,vec3 N){
  vec3 v=uCamPos-wp;float dist=length(v),ci=max(abs(dot(N,v/dist)),DETAIL_MINCOS);
  float T=dist*uPixA/sqrt(ci)*DETAIL_PX;                  // the world size of a tile spanning DETAIL_PX pixels
  float L=log2(T),La=floor(L),Sa=exp2(La),o=L-La;
  float idx=textureGrad(uGrain,wp.xz/DETAIL_INDEX,dPx.xz/DETAIL_INDEX,dPy.xz/DETAIL_INDEX).g*8.0;
  vec2 A=detailOctave(Sa,idx),B=detailOctave(Sa*2.0,idx);
  float q=((1.0-o)*(1.0-o)*A.y+o*o*B.y)*dot(pW,pW);              // sum of the squared weights of every read
  return uGrainMean.x+(mix(A.x,B.x,o)-uGrainMean.x)/sqrt(q)*DETAIL_AMP*pFade;}
#endif
// the earth (the mood, docs/plans/done/lc3-temperate.md): a colour of the world turned toward its value times the
// earth tint, with uEarthChroma of its own chroma, by uEarthAmt, before the light. Not units (KEEP_HUE): their coats
// are painted, not grown
vec3 earthMix(vec3 a){if(uEarthAmt<=0.0)return a;float l=dot(a,LUMA);return mix(a,max(vec3(l)*uEarthTint+(a-vec3(l))*uEarthChroma,0.0),uEarthAmt);}
vec3 earthOf(vec3 a){
  #ifdef KEEP_HUE
  return a;
  #else
  return earthMix(a);
  #endif
}
// THE GROUND'S BOUNCE (LC4, docs/plans/done/lc4-bounce.md): the colour of the ground under the point, set by the
// material before paint() (the painter reads no ground: shore.glsl's bounceAt), lighting what faces down or sideways in
// the shadow and mid bands, by the mood's uBounce. Units take its full hue: a local cast the eye does not balance away
vec3 pBounce=vec3(0.0);
// THE GROUND'S BOUNCE ON THE GROUND (LC5, docs/plans/done/lc5-ground-bounce.md): the bounce map here (the light the
// ground around sends back, src/look/bakes.ts), set by the ground before paint(), filling its cast shadows (sh) by
// the mood's uGroundBounce: a shadow on a sunlit field takes the field's colour, a wood floor stays dark
vec3 pGround=vec3(0.0);
#ifdef GROUND_BOUNCE
uniform sampler2D uGB;   // the bounce map (src/look/bakes.ts), over the tile as the light map
#define GB_EDGE (32.0/TILE_W)   // the bounce map's fade at the tile's edge: 32 m, as a share of the tile's side
// the bounce map at wp, fading out over the tile's last GB_EDGE of its side: the apron and the far ring
// have none, so a shadow across the tile's edge does not step there
vec3 groundBounceAt(vec3 wp){vec2 uv=lmUV(wp);float e=min(min(uv.x,uv.y),min(1.0-uv.x,1.0-uv.y));
  return texture2D(uGB,clamp(uv,0.0,1.0)).rgb*smoothstep(0.0,GB_EDGE,e);}
#endif
// the fill a cast shadow takes (sh, in the band t, its occlusion occ; a third of it on snow, whose shadows stay blue)
vec3 groundFill(vec3 alb,float sh,float t,float occ,float snow){
  #ifdef GROUND_BOUNCE
  return alb*pGround*uGroundBounce*sh*(1.0-smoothstep(0.55,1.0,t))*occ*mix(1.0,0.35,snow);
  #else
  return vec3(0.0);
  #endif
}
// THE paint function. jitter: how loose the brushwork is (1 = landscape, 0.3 = crisp units).
// sh: extra shadow from the painted shadow map (0..1).
vec3 paint(vec3 alb,vec3 N,vec3 wp,float occ,float rimAmt,float jitter,float sh){
  alb=earthOf(alb);
  float snow=snowAt(N,wp);alb=mix(alb,vec3(0.80,0.81,0.84),snow);                           // snow: lit warm white, shadowed cool blue by the ramp
  #ifdef DETAIL_ON
  dPx=dFdx(wp);dPy=dFdy(wp);detailPlanes(wp,N);
  float gd=detailGrain(wp,N),blot=uGrainMean.y+(detailRead(21.0,vec2(0.0)).g-uGrainMean.y)/sqrt(dot(pW,pW))*pFade;   // the 21 m blotches stay fixed in the world (renormalised like the grain)
  #else
  float gd=grainW(wp,N,5.5).r,blot=grainW(wp,N,21.0).g;
  #endif
  pDetail=gd;
  float gr=(gd-0.5)*uGrainAmt;
  float ndl=dot(N,uSunDir),ndlR=ndl;
  #ifdef SOFT_RAMP
  ndlR=(ndl+0.45)/1.45;   // the crowns as volumes (L7b): light wraps round a mass of leaves (the ramp only, not the rim)
  #endif
  #ifdef DETAIL_ON
  // the ground: the band follows the light (the sun, the cast shadow, the occlusion), the grain only wobbling its edge,
  // and the grain blotches go to the value below: near a band edge they made islands of the darker band
  float l=ndlR+gr*0.2*jitter-sh*1.25-(1.0-occ)*0.55;
  #else
  float l=ndlR+gr*0.55*jitter+(blot-0.5)*0.3*jitter-sh*1.25-(1.0-occ)*0.55;
  #endif
  float cl=cloud(wp);   // a shade below (cloudShade, for units their white-balanced share), not a drop of the light
  #ifdef DETAIL_ON
  // the band edges keep their width but never get narrower than the light's change across two pixels (no aliasing)
  #ifdef DETAIL_SAB_STEP
  float t=step(-0.06,l)*0.55+step(0.34,l)*0.45;                          // sabotage: hard band edges
  #else
  float bw=max(0.12,2.0*fwidth(l));
  float t=smoothstep(-0.06-bw*0.5,-0.06+bw*0.5,l)*0.55+smoothstep(0.34-bw*0.5,0.34+bw*0.5,l)*0.45;
  #endif
  #else
  #ifdef SOFT_RAMP
  float t=smoothstep(-0.40,0.0,l)*0.55+smoothstep(0.06,0.40,l)*0.45;   // the crowns as volumes (L7b): the same three colours, blended
  #else
  float t=smoothstep(-0.10,-0.02,l)*0.55+smoothstep(0.30,0.38,l)*0.45;   // shadow | mid | light, grain-broken edges
  #endif
  #endif
  vec3 shc=shadowOf(alb);
  #ifdef SKY_IN_SHADOW
  shc*=mix(0.62,1.0,smoothstep(0.35,0.8,pSky));   // deep sky occlusion (a wood floor) deepens the shadow itself (docs/plans/done/soft-shadows.md)
  #endif
  // units see the light white-balanced (the eye): its value, and of its hue only uUnitTint (the mood)
  vec3 sunC=uSunCol,liftC=uLitLift;
  #ifdef KEEP_HUE
  // a near-white coat (light and of little chroma: not a yellow facing) takes a fifth of the share: the eye balances on
  // the brightest neutral (a white in full sun turned cream, docs/plans/done/ground-light.md). The lit band lift is a warm cast, not light: the same share of it
  float wb=uUnitTint*mix(1.0,0.2,smoothstep(0.55,0.80,dot(alb,LUMA))*(1.0-smoothstep(0.10,0.25,max(alb.r,max(alb.g,alb.b))-min(alb.r,min(alb.g,alb.b)))));
  sunC=mix(vec3(dot(uSunCol,vec3(0.3,0.59,0.11))),uSunCol,wb);liftC*=wb;
  #endif
  vec3 mid=alb*mix(uMidCool,sunC,0.30);
  #ifdef SOFT_RAMP
  mid=clamp(mix(vec3(dot(mid,vec3(0.3,0.59,0.11))),mid,1.3),0.0,1.0);   // the crowns turning side keeps its colour (L7b)
  #endif
  vec3 lt=alb*sunC*mix(1.16,1.02,snow)+liftC*(1.0-snow);
  vec3 c=t<0.55?mix(shc,mid,t/0.55):mix(mid,lt,(t-0.55)/0.45);
  #ifdef BOUNCE
  vec3 bc=pBounce;   // its full hue on units too: the eye balances on the main light (the sun), not on a bounce off coloured ground
  #ifdef KEEP_HUE
  bc*=uUnitBounce;   // units: a share of it, so a coat keeps its value against its ground (the guard)
  #endif
  c+=alb*bc*uBounce*(0.5-0.5*N.y)*(1.0-smoothstep(0.55,1.0,t))*occ;   // from below, the sun's band left to the sun
  #endif
  c+=groundFill(alb,sh,t,occ,snow);   // in cast shadow only: a slope turned from the sun keeps its modelling
  c*=1.0+gr*0.38;                                                           // gouache grain in the value
  #ifdef DETAIL_ON
  c*=1.0+(blot-uGrainMean.y)*0.12*jitter;                                   // the blotches in the value (renormalised round their mean)
  #endif
  #ifdef KEEP_HUE
  // units: the cloud shade white-balanced as the sun is (its value, wb of its hue, decision 0027), so a white under a
  // cloud does not turn blue
  vec3 csh=mix(CLOUD_SHADE,uCloudSnow,snow);csh=mix(vec3(dot(csh,vec3(0.3,0.59,0.11))),csh,wb);c=mix(c,c*csh,cl);
  #else
  c=cloudShade(c,cl,snow);
  #endif
  vec3 V=normalize(uCamPos-wp);
  float fres=1.0-max(dot(N,V),0.0);
  float rim=smoothstep(0.58,0.64,fres+(gd-0.5)*0.2)*smoothstep(-0.35,0.2,ndl);
  c+=sunC*uRimCol*rim*rimAmt*0.55*(1.0-cl*0.7)*(1.0-sh);       // graphic warm rim
  return c;
}
// The grade (the mood's, src/look/mood.ts), the last step of every painted material (atmos), so units can take less
// of it (uUnitGrade): muted warmer greens, the saturation, a split tone, a lift in the darks, a haze toward the top
// of the frame. It was the finishing pass's, which cannot tell a coat from the meadow (docs/plans/done/lc1b-coats.md)
vec3 gradeOf(vec3 c){
  // units take uUnitGrade of it all, the haze toward the top too: a depth cue, but pillar 1 (the armies readable)
  // ranks first, and it takes a third of a coat's saturation at the frame's top
  float amt=uGrade;
  #ifdef KEEP_HUE
  amt*=uUnitGrade;
  #endif
  if(amt<=0.0)return c;
  const vec3 L=LUMA;float l=dot(c,L);
  float green=clamp((c.g-max(c.r,c.b))*3.0,0.0,1.0);
  vec3 g=mix(c,vec3(l)*uGreenTint+(c-vec3(l))*uGreenChroma,green*uGreenAmt);
  // the greens turned toward teal in summer (the mood's greenHue, Tiny Glade's blue-greens: docs/plans/active/
  // epic-palette.md): their colour about the grey axis, the value kept
  #if MOOD_GRADE   // (the mood's teal turn and contrast: compiled in only where the mood has them, src/look/materials.ts)
  if(uGreenHue>0.0){float an=uGreenHue*clamp((c.g-c.b)*4.0,0.0,1.0)*smoothstep(0.0,0.06,c.g-c.r);   // (uGreenHue: the season's, none in autumn: clear greens only, a straw turning would go lime)
    float w=an/uGreenHue;vec3 k=vec3(0.57735),d=g-vec3(dot(g,L));d=d*cos(an)+cross(k,d)*sin(an)+k*dot(k,d)*(1.0-cos(an));
    g=(d*mix(1.0,uGreenChroma,w)+vec3(dot(g,L)))*mix(1.0,0.9,w);}   // (muted by the mood's greenChroma and a little deeper as they turn)
  #endif
  g=mix(vec3(dot(g,L)),g,uGradeSat);   // (the season's: src/look/main.ts, seasonLight)
  g*=mix(uSplitLo,uSplitHi,smoothstep(0.08,0.75,l));
  g+=uLift*(1.0-l);
  #if MOOD_CONTRAST
  g*=clamp(0.42+(l-0.42)*(1.0+uContrast),0.0,1.5)/max(l,1e-3);   // the values spread about a mid grey, the colour kept (the mood's contrast)
  #endif
  g=mix(g,uTopHaze*(0.85+l*0.35),smoothstep(0.60,1.0,gl_FragCoord.y/uViewH)*uTopAmt);   // 0 at the frame's bottom
  return mix(c,g,amt);}
// Top-down atmosphere: colour cools (and warms toward the sun side) away from the focus; then the grade.
vec3 atmos(vec3 c,vec3 wp){
  vec2 dv=wp.xz-uFocus.xz;float d=length(dv);
  float f=smoothstep(110.0,420.0,d)*0.72;
  float warm=max(dot(normalize(dv+1e-4),normalize(uSunDir.xz)),0.0);
  return gradeOf(mix(c,mix(uHazeCool,uHazeWarm,warm*0.65),f));
}
// the air over a painted colour, the last step of every material: the valley mist, the distance haze and the grade.
// Units (KEEP_HUE) keep their value (Rec. 709 luma) under all of it, in one step: the air turns a coat toward its
// colour, not its contrast with the ground (decision 0027, docs/plans/done/lc1c-unit-share.md: a white in a bright mist
// turned toward the ground behind it). Then clamped at 1 by channel: the shoulder of the finishing pass scales a
// colour by its largest channel, so a warm white over 1 would show darker than the neutral white the clamp leaves
// (the guard: a white on winter stubble)
vec3 airOf(vec3 c,vec3 wp,vec4 lm,float hAbove){vec3 a=atmos(mist(c,wp,lm,hAbove),wp);
  #ifdef KEEP_HUE
  a=min(a*(dot(c,LUMA)/max(dot(a,LUMA),1e-4)),vec3(1.0));
  #endif
  return a;}