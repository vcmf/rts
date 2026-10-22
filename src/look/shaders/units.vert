precision highp float;attribute vec3 position;attribute vec3 normal;attribute float aRole;attribute vec4 aBones;attribute vec4 aWeights;
#include<instancesDeclaration>
// the figures' skinning from the baked animation (src/look/units.ts, tools/bake-figure.py): one row per 1/12 s step,
// four texels per bone (a skinning matrix, column by column), four influences per vertex. A man's step: his range's
// first row, plus the clock's steps since his role's clip began, round his range's loop
uniform mat4 viewProjection;uniform sampler2D uVAT;uniform float uVATTime;
#ifdef INSTANCES
attribute vec4 aVAT;   // first step, steps in the loop, phase in steps, steps a second
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
#endif
mat4 boneAt(float b,int f){int x=int(b)*4;
  return mat4(texelFetch(uVAT,ivec2(x,f),0),texelFetch(uVAT,ivec2(x+1,f),0),texelFetch(uVAT,ivec2(x+2,f),0),texelFetch(uVAT,ivec2(x+3,f),0));}
void main(){
  #include<instancesVertex>
  vec4 r=vec4(0.0,1.0,0.0,12.0);
  #ifdef INSTANCES
  r=aVAT;
  #endif
  int f=int(r.x+mod(floor(uVATTime*r.w+r.z),r.y));
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
  #ifdef DEPTH
  vD=p.z/p.w*0.5+0.5;
  #else
  vN=normalize(mat3(finalWorld)*ln);vW=w.xyz;vRoot=finalWorld[3].xz;
  vCol=uPal[int(aRole+0.5)];vRole=aRole;
  #ifdef FAR
  float px=uFarK.x/max(1.0,distance(uCamPos,finalWorld[3].xyz));
  vFar=1.0-smoothstep(uFarK.y*0.35,uFarK.y*0.9,px);
  vCol=mix(vCol,uPalFar[int(aRole+0.5)],vFar);
  #endif
  #endif
  gl_Position=p;}
