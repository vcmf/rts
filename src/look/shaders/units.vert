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
#if defined(FAR)||defined(FAR_SCALE)
// the far figure's size on screen: uFarK.x, a figure's height in pixels at 1 m; uFarK.y, the LOD switch's
uniform vec2 uFarK;uniform vec3 uCamPos;
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
// each man his own (the owner's direction, 2026-10-23: the far LOD's per-man variety): hashes of his jitter (aJit, his
// own, static) scale, by uTinyRand (x: each role's value and a warm or cool cast; y: his and each corner's mix of the
// roles, renormalised, so the facings, belts, pack and skin show unevenly; z: his height, width and lean; w: each box's
// brightness). Multiply-adds and sines only: no vertex, no texture read
#ifdef INSTANCES
attribute vec4 aJit;
#endif
#ifndef VAT_POS
attribute float aVid;
#endif
uniform vec4 uTinyRand;
vec4 h4(vec4 q){return fract(sin(q)*43758.5453)*2.0-1.0;}
vec4 tHm,tHc,tHb;float tW[PAL_N];void tinyPick();
void tinySeeds(){
  vec4 s=vec4(0.0);
  #ifdef INSTANCES
  s=aJit*vec4(33.3,33.3,14.3,1.0);
  #endif
  tHm=h4(vec4(dot(s,vec4(12.99,78.23,37.72,11.13)),dot(s,vec4(39.35,11.17,83.15,27.93)),dot(s,vec4(73.15,52.23,17.31,91.37)),dot(s,vec4(27.17,61.79,45.13,13.37))));
  float bx=floor((aVid+0.5)/8.0);
  tHc=h4(tHm*vec4(17.1,31.7,47.3,59.9)+aVid*vec4(0.731,1.37,2.11,0.537));
  tHb=h4(tHm.yzwx*vec4(23.3,41.9,13.7,67.1)+bx*vec4(2.17,3.11,1.71,4.43));
  float sum=0.0;
  for(int i=0;i<PAL_N;i++){
    float w=i<4?aRW0[i]:i<8?aRW1[i-4]:aRW2[i-8];
    float r=0.6*tHm[i-4*(i/4)]+0.6*tHc[(i+1)-4*((i+1)/4)]*(i-2*(i/2)==0?1.0:-1.0);
    tW[i]=w*max(0.0,1.0+uTinyRand.y*r);sum+=tW[i];}
  for(int i=0;i<PAL_N;i++)tW[i]/=max(sum,1e-4);
  tinyPick();}
// with the variety on, each corner of each man takes one role drawn from his weights (tPick): pure colours at their
// shares, the far LOD's speckle, where the mean of the weights would be one blended colour for every man
int tPick;
void tinyPick(){
  float u=0.5+0.5*tHc.w,acc=0.0;tPick=0;
  for(int i=0;i<PAL_N;i++){acc+=tW[i];if(u>acc)tPick=i+1;}
  tPick=min(tPick,PAL_N-1);}
vec3 palMix(vec3 p[PAL_N]){vec3 c=vec3(0.0);
  if(uTinyRand.y>0.0){c=p[tPick]*(1.0+0.5*uTinyRand.x*tHc[(tPick+2)-4*((tPick+2)/4)]+uTinyRand.x*tHm.w);}
  else{for(int i=0;i<PAL_N;i++)c+=p[i]*tW[i];}
  float t=0.5*uTinyRand.x*tHm.z;
  return c*vec3(1.0+t,1.0,1.0-t)*(1.0+uTinyRand.w*tHb.x);}
#endif
#endif
mat4 boneAt(float b,int f){int x=int(b)*4;
  return mat4(texelFetch(uVAT,ivec2(x,f),0),texelFetch(uVAT,ivec2(x+1,f),0),texelFetch(uVAT,ivec2(x+2,f),0),texelFetch(uVAT,ivec2(x+3,f),0));}
void main(){
  #include<instancesVertex>
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
  #ifdef TINY
  tinySeeds();
  lp*=vec3(1.0+0.6*uTinyRand.z*tHm.x,1.0+uTinyRand.z*tHm.y,1.0+0.6*uTinyRand.z*tHm.x);
  lp.xz+=1.2*uTinyRand.z*tHm.zw*lp.y;
  #endif
  #ifdef FAR_SCALE
  float fpx=uFarK.x/max(1.0,distance(uCamPos,finalWorld[3].xyz)),fk=clamp((0.9*uFarK.y-fpx)/(0.65*uFarK.y),0.0,1.0);
  lp*=vec3(mix(1.0,uFarScale.x,fk),mix(1.0,uFarScale.y,fk),mix(1.0,uFarScale.x,fk));
  #endif
  vec4 w=finalWorld*vec4(lp,1.0);
  vec4 p=viewProjection*w;
  #ifdef DEPTH
  vD=p.z/p.w*0.5+0.5;
  #else
  vN=normalize(mat3(finalWorld)*ln);vW=w.xyz;vRoot=finalWorld[3].xz;
  vCol=uPal[int(aRole+0.5)];vRole=aRole;
  #ifdef TINY
  vCol=palMix(uPal);
  vCoatW=uTinyRand.y>0.0?(tPick==int(uCoatRole+0.5)?1.0:0.0):tW[int(uCoatRole+0.5)];
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
