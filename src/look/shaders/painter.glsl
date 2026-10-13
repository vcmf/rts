
uniform sampler2D uGrain;
uniform vec3 uSunDir,uSunCol,uShadowCol,uHazeCool,uHazeWarm,uCamPos,uFocus;
uniform float uTime,uGrainAmt,uEdges,uClouds,uSeason;

vec3 G(vec2 uv){return texture2D(uGrain,uv).rgb;}
vec3 grainW(vec3 wp,vec3 n,float sc){vec2 p=abs(n.y)>0.6?wp.xz:(abs(n.x)>abs(n.z)?wp.zy:wp.xy);return G(p/sc);}
// SEASON (docs/art-bible.md §4b): 0 summer · 1 early autumn · 2 late autumn · 3 winter.
// Snow settles on whatever faces up, broken by the grain, so it reads as painted.
// NOSNOW: surfaces snow never settles on (the guard's army blocks, as units)
float pSnowK=1.0;   // a weight on the snow, for a surface it only partly settles on (the riverbed: src/look/shaders/shore.glsl)
// added to the snow's threshold where the ground holds more or less of it (the fields' furrows and ridges: snowLie in
// src/look/shaders/macro.glsl)
float pSnowLie=0.0;
float snowAt(vec3 N,vec3 wp){
  #ifdef NOSNOW
  return 0.0;
  #endif
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
    vec3 au=mix(summer,vec3(0.72,0.62,0.32),0.55),la=mix(summer,vec3(0.55,0.44,0.26),0.7),wi=vec3(0.50,0.45,0.34);
    return uSeason<1.0?mix(summer,au,uSeason):uSeason<2.0?mix(au,la,uSeason-1.0):mix(la,wi,uSeason-2.0);}
  if(kind>0.5)return mix(summer,summer*vec3(0.78,0.88,0.95),clamp(uSeason-2.0,0.0,1.0));   // conifers stay green
  vec3 au=h<0.30?mix(vec3(0.86,0.46,0.12),vec3(0.96,0.62,0.18),t)      // orange
         :h<0.55?mix(vec3(0.92,0.74,0.22),vec3(0.98,0.85,0.40),t)      // yellow
         :h<0.72?mix(vec3(0.70,0.17,0.10),vec3(0.84,0.30,0.14),t)      // red
         :h<0.76?vec3(0.48,0.20,0.34)                                  // purple, rare
         :h<0.95?mix(summer,vec3(0.72,0.62,0.22),0.45)                 // still turning
         :vec3(0.36,0.18,0.24);
  vec3 la=mix(au*vec3(0.80,0.62,0.50),vec3(0.46,0.30,0.18),0.45);       // late autumn: browner, duller
  vec3 wi=vec3(0.34,0.29,0.24);                                         // winter: bare-looking, snow does the rest
  return uSeason<1.0?mix(summer,au,uSeason):uSeason<2.0?mix(au,la,uSeason-1.0):mix(la,wi,uSeason-2.0);
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
vec4 LM(vec3 wp){vec4 p=uLMVP*vec4(wp,1.0);vec2 uv=p.xy/p.w*0.5+0.5;
  if(uv.x<0.002||uv.y<0.002||uv.x>0.998||uv.y>0.998)return vec4(1.0,1.0,0.0,1.0);
  return texture2D(uLM,uv);}
// Valley mist: warm where the air is sunlit, cool where it's shadowed. Light shafts =
// the air column's sun visibility, read from the light map at 3 heights along the view ray.
// Known issue #62: the lit air tints sunlit snow orange.
vec3 mist(vec3 c,vec3 wp,vec4 lm,float hAbove){
  float m=lm.b*uMist*exp(-hAbove*0.12);if(m<0.01)return c;
  float air=mix(1.0,lm.r,uShadowsOn);
  if(uShafts>0.5){vec3 v=normalize(uCamPos-wp);float s=0.0;
    for(int i=0;i<3;i++){float h=(float(i)+0.5)/3.0*7.0;vec3 q=wp+v*(h/max(v.y,0.25));
      s+=LM(q-uSunDir*((q.y-wp.y)/uSunDir.y)).r;}
    air=s/3.0;}
  float n=G(wp.xz/55.0+uTime*vec2(0.004,0.0015)).g;
  // thinner over the cast shadow on the ground, which keeps its shape; less so above the ground (a crown, a block), whose
  // own light is not that of the ground
  float t=clamp(m*(0.35+0.55*n),0.0,0.42)*mix(1.0,mix(0.55,1.0,1.0-(1.0-lm.r)*uShadowsOn),exp(-hAbove*0.5));
  return mix(c,mix(vec3(0.42,0.53,0.68),vec3(1.0,0.86,0.63),air),t);}
// view distance in alpha → depth of field without re-rendering the scene
float depthA(vec3 wp){return clamp(length(wp-uCamPos)/1000.0,0.0,1.0);}
// Big painted cloud shadows drifting over the land: the top-down camera's only "sky".
float cloud(vec3 wp){
  vec2 p=wp.xz+uTime*vec2(2.2,0.8);
  float c=0.62*G(p/330.0).g+0.38*G(p/131.0+vec2(0.37,0.11)).g;
  return smoothstep(0.60,0.635,c+(G(wp.xz/5.0).r-0.5)*0.06)*uClouds;
}
// the shadow band (docs/plans/done/shadow-look.md): more saturated than the base and turned toward a cool blue
// violet at the same value (a darker band costs dark coats their separation, tools/guard.mjs). KEEP_HUE: the
// army coats keep the band of main, so a coat in shadow loses none of its colour
vec3 shadowOf(vec3 a){const vec3 Y=vec3(0.3,0.59,0.11);float l=dot(a,Y);
  vec3 s=clamp(mix(vec3(l),a,1.15),0.0,1.0)*uShadowCol*0.80;float v=dot(s,Y);   // the band of main, whose value is kept
  #ifndef KEEP_HUE
  vec3 t=clamp(mix(vec3(l),a,1.3),0.0,1.0)*uShadowCol;const vec3 B=vec3(0.34,0.45,0.80);
  s=mix(t/max(dot(t,Y),1e-4),B/dot(B,Y),0.25)*v;
  #endif
  return s+vec3(0.02,0.04,0.07);}
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
// THE paint function. jitter: how loose the brushwork is (1 = landscape, 0.3 = crisp units).
// sh: extra shadow from the painted shadow map (0..1).
vec3 paint(vec3 alb,vec3 N,vec3 wp,float occ,float rimAmt,float jitter,float sh){
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
  float l=ndlR+gr*0.55*jitter+(blot-0.5)*0.3*jitter;
  l-=cloud(wp)*0.40+sh*1.25+(1.0-occ)*0.55;
  #ifdef DETAIL_ON
  // the band edges keep their width but never get narrower than the light's change across two pixels (no aliasing)
  #ifdef DETAIL_SAB_STEP
  float t=step(-0.06,l)*0.55+step(0.34,l)*0.45;                          // sabotage: hard band edges
  #else
  float bw=max(0.08,2.0*fwidth(l));
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
  vec3 mid=alb*mix(vec3(0.86,0.92,0.98),uSunCol,0.30);
  #ifdef SOFT_RAMP
  mid=clamp(mix(vec3(dot(mid,vec3(0.3,0.59,0.11))),mid,1.3),0.0,1.0);   // the crowns turning side keeps its colour (L7b)
  #endif
  vec3 lt=alb*uSunCol*mix(1.16,1.02,snow)+vec3(0.03,0.025,0.0)*(1.0-snow);
  vec3 c=t<0.55?mix(shc,mid,t/0.55):mix(mid,lt,(t-0.55)/0.45);
  c*=1.0+gr*0.38;                                                           // gouache grain in the value
  vec3 V=normalize(uCamPos-wp);
  float fres=1.0-max(dot(N,V),0.0);
  float rim=smoothstep(0.58,0.64,fres+(gd-0.5)*0.2)*smoothstep(-0.35,0.2,ndl);
  c+=uSunCol*vec3(1.0,0.86,0.6)*rim*rimAmt*0.55*(1.0-cloud(wp)*0.7)*(1.0-sh);       // graphic warm rim
  return c;
}
// Top-down atmosphere: colour cools (and warms toward the sun side) away from the focus.
vec3 atmos(vec3 c,vec3 wp){
  vec2 dv=wp.xz-uFocus.xz;float d=length(dv);
  float f=smoothstep(110.0,420.0,d)*0.72;
  float warm=max(dot(normalize(dv+1e-4),normalize(uSunDir.xz)),0.0);
  return mix(c,mix(uHazeCool,uHazeWarm,warm*0.65),f);
}