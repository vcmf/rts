precision highp float;attribute vec3 position;attribute vec3 normal;attribute float aRole;attribute vec4 aBones;attribute vec4 aWeights;
#include<instancesDeclaration>
// the figures' skinning from the baked animation (src/look/units.ts, tools/bake-figure.py): one row per 1/12 s step,
// four texels per bone (a skinning matrix, column by column), four influences per vertex. A man's step: his range's
// first row, plus the clock's steps since his role's clip began (uVATStep: the clock's step, from the CPU; his phase
// in steps), round his range's loop
uniform mat4 viewProjection;uniform sampler2D uVAT;uniform float uVATStep;
#ifdef INSTANCES
// a man's clip: its first step, its steps in the loop, his phase in steps
attribute vec3 aVAT;
#endif
#if defined(SMOOTH)&&defined(INSTANCES)
// the men's places moved every frame (?smoothmove=1, decision 0049): the step's place and the share of the next step's
// move gone (src/look/units.ts); the poses stay stepped
attribute vec3 aNext;uniform float uStepFrac;
#endif
#ifdef VAT_POS
// the far LOD and the shadow pass (batch B, ?uvat): each vertex posed at every step at load (posedVertices,
// src/look/units-data.ts), its place and normal two texels of uVATP: no bone matrices to blend
uniform sampler2D uVATP;attribute float aVid;
#endif
#ifdef DEPTH
varying float vD;
#else
// a side's colours by role (the bake's palette, src/look/world/armies.ts): a palette swap recolours the side
uniform vec3 uPal[PAL_N];
#if defined(FAR)||defined(FAR_SCALE)||defined(LODFADE)
// the far figure's size on screen: uFarK.x, a figure's height in pixels at 1 m; uFarK.y, the LOD switch's
uniform vec2 uFarK;uniform vec3 uCamPos;
#endif
#ifdef LODFADE
// the LOD cross-fade (#188, decision 0066; src/look/lod-fade.ts mirrors manHash, fadeShare, lodCover): each man at his
// own LOD by his own height on screen. uLodBand: the near band's px (x to y) and the tiny's (z to w; 0: none);
// uLodFade: 1 when this draw's instances are in the battalion's order (gl_InstanceID is the man), 0 (a split
// battalion's lists) to draw every man; LOD_SLOT: this material's LOD (0 near, 1 far, 2 tiny). vFade: his cover
// (lodCover: near, far), the dither's thresholds in units.frag; a man with no share here is dropped (off screen)
uniform vec4 uLodBand;uniform float uLodFade;varying vec2 vFade;
float manHash(int i){uint x=uint(i)*0x9e3779b9u;x^=x>>16;x*=0x21f0aaadu;x^=x>>15;x*=0x735a2d97u;x^=x>>15;
  return float(x>>8)/16777216.0;}
float fadeShare(float px,vec2 b,float h){if(b.y<=0.0)return 1.0;
  float t=log(max(px,1e-6)/b.x)/log(b.y/b.x);return clamp((t-h*(1.0-LOD_FADE_W))/LOD_FADE_W,0.0,1.0);}
#endif
#ifdef FAR
// the far LOD's palette (its uniform's far rule: farPalette, src/look/world/armies.ts), crossfaded in as the figure
// shrinks below the LOD switch, so the switch does not pop
uniform vec3 uPalFar[PAL_N];
varying float vFar;
#endif
#ifdef FAR_SCALE
// the far figure drawn larger as it shrinks on screen (batch C, ?farscale): from the LOD switch down to a quarter of
// it, across and along up to uFarScale.x (capped so the files never touch), up to uFarScale.y tall
uniform vec2 uFarScale;
#endif
varying vec3 vW,vN,vCol;varying vec2 vRoot;varying float vRole;
#ifdef TINY
// the tiny LOD (docs/plans/active/armies-32k.md, step 3; tinyMesh, src/look/units-data.ts): a corner's colour is a mix
// of the roles, its weights a role each (up to 12), the mean colour of what its box stands for seen from above
attribute vec4 aRW0,aRW1,aRW2;uniform float uCoatRole;varying float vCoatW;
vec3 palMix(vec3 p[PAL_N]){vec3 c=vec3(0.0);
  for(int i=0;i<PAL_N;i++){float w=i<4?aRW0[i]:i<8?aRW1[i-4]:aRW2[i-8];c+=p[i]*w;}
  return c;}
#endif
#endif
mat4 boneAt(float b,int f){int x=int(b)*4;
  return mat4(texelFetch(uVAT,ivec2(x,f),0),texelFetch(uVAT,ivec2(x+1,f),0),texelFetch(uVAT,ivec2(x+2,f),0),texelFetch(uVAT,ivec2(x+3,f),0));}
void main(){
  #include<instancesVertex>
  #if defined(SMOOTH)&&defined(INSTANCES)
  finalWorld[3].xyz+=aNext*uStepFrac;
  #endif
  vec3 r=vec3(0.0,1.0,0.0);
  #ifdef INSTANCES
  r=aVAT;
  #endif
  int f=int(r.x+mod(uVATStep+r.z,r.y));
  #ifdef VAT_POS
  int vi=int(aVid+0.5)*2;vec3 lp=texelFetch(uVATP,ivec2(vi,f),0).xyz,ln=texelFetch(uVATP,ivec2(vi+1,f),0).xyz;
  #else
  mat4 sk=boneAt(aBones.x,f)*aWeights.x+boneAt(aBones.y,f)*aWeights.y+boneAt(aBones.z,f)*aWeights.z+boneAt(aBones.w,f)*aWeights.w;
  vec3 lp=(sk*vec4(position,1.0)).xyz,ln=mat3(sk)*normal;
  #endif
  #ifdef FAR_SCALE
  float fpx=uFarK.x/max(1.0,distance(uCamPos,finalWorld[3].xyz)),fk=clamp((0.9*uFarK.y-fpx)/(0.65*uFarK.y),0.0,1.0);
  lp*=vec3(mix(1.0,uFarScale.x,fk),mix(1.0,uFarScale.y,fk),mix(1.0,uFarScale.x,fk));
  #endif
  vec4 w=finalWorld*vec4(lp,1.0);
  vec4 p=viewProjection*w;
  #if defined(LODFADE)&&!defined(DEPTH)
  vFade=vec2(LOD_SLOT==0?1.0:0.0,LOD_SLOT==2?0.0:1.0);
  if(uLodFade>0.5){
    float mh=manHash(gl_InstanceID),mpx=uFarK.x/max(1.0,distance(uCamPos,finalWorld[3].xyz));
    float fn=fadeShare(mpx,uLodBand.xy,mh);vFade=vec2(fn,max(fn,fadeShare(mpx,uLodBand.zw,mh)));
    bool none=LOD_SLOT==0?fn<=0.0:LOD_SLOT==1?fn>=1.0||vFade.y<=0.0:vFade.y>=1.0;
    if(none)p=vec4(0.0,0.0,2.0,1.0);}
  #endif
  #ifdef DEPTH
  vD=p.z/p.w*0.5+0.5;
  #else
  vN=normalize(mat3(finalWorld)*ln);vW=w.xyz;vRoot=finalWorld[3].xz;
  vCol=uPal[int(aRole+0.5)];vRole=aRole;
  #ifdef TINY
  vCol=palMix(uPal);
  int ci=int(uCoatRole+0.5);vCoatW=uCoatRole<-0.5?0.0:ci<4?aRW0[ci]:ci<8?aRW1[ci-4]:aRW2[ci-8];
  #endif
  #ifdef FAR
  float px=uFarK.x/max(1.0,distance(uCamPos,finalWorld[3].xyz));
  vFar=1.0-smoothstep(uFarK.y*0.35,uFarK.y*0.9,px);
  vec3 cf=uPalFar[int(aRole+0.5)];
  #ifdef TINY
  cf=palMix(uPalFar);
  #endif
  vCol=mix(vCol,cf,vFar);
  #endif
  #endif
  gl_Position=p;}
