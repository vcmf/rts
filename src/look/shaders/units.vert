precision highp float;attribute vec3 position;attribute vec3 normal;attribute float aRole;attribute vec4 aBones;attribute vec4 aWeights;
#include<instancesDeclaration>
// the figures' skinning from the baked animation (src/look/units.ts, tools/bake-figure.py): one row per 1/12 s step,
// four texels per bone (a skinning matrix, column by column), four influences per vertex. A man's step: his range's
// first row, plus the clock's steps since his role's clip began (uVATStep: the clock's step, from the CPU; his phase
// in steps), round his range's loop
uniform mat4 viewProjection;uniform sampler2D uVAT;uniform float uVATStep;
#ifdef INSTANCES
#ifndef GPU_PLACE
// a man's clip: its first step, its steps in the loop, his phase in steps
attribute vec3 aVAT;
#endif
#endif
#ifdef GPU_PLACE
// each man placed here (docs/plans/active/armies-32k.md, step 1; ?gpuplace=0: by the CPU, src/look/units.ts place):
// his instance's four columns are his static record, written once (world0: his slot in line, x z, and in column, x z;
// world1: his jitter across and ahead, his turn, his fire lag; world2.x: his battalion), and his battalion's record is
// four texels of uBat a column (its place and its heading's sine and cosine; its phase, the phase's start, its local
// time and its heading; each role's clip offset in steps; the cycle start's fraction of a step). The arithmetic is
// manAt's (src/look/world/armies.ts) in float32, render only; his ground is the heightfield's own triangles (uHgt,
// its nodes; uHF: its corner, its cell, its nodes a side: src/look/heightfield.ts sample). uClipS, uClipN: each role's
// clip's first step and steps (halt, march, run, fire); uMove: the march and run speeds, the approach, the fps
uniform sampler2D uBat;uniform highp sampler2D uHgt;uniform vec4 uHF,uClipS,uClipN,uMove;
float hfAt(ivec2 k){return texelFetch(uHgt,k,0).r;}
float groundAt(vec2 p){
  float n=uHF.w;vec2 u=clamp((p-uHF.xy)/uHF.z,0.0,n-1.0),ij=min(floor(u),vec2(n-2.0)),f=u-ij;ivec2 k=ivec2(ij);
  float h00=hfAt(k),h10=hfAt(k+ivec2(1,0)),h01=hfAt(k+ivec2(0,1)),h11=hfAt(k+ivec2(1,1));
  return f.x+f.y<=1.0?h00+(h10-h00)*f.x+(h01-h00)*f.y:h11+(h01-h11)*(1.0-f.x)+(h10-h11)*(1.0-f.y);}
// his place and turn as his instance matrix, and his clip (its first step, its steps, his phase in steps: aVAT's)
mat4 placeMan(vec4 s0,vec4 s1,vec4 s2,out vec3 clip){
  int b=int(s2.x+0.5);
  vec4 B0=texelFetch(uBat,ivec2(b,0),0),B1=texelFetch(uBat,ivec2(b,1),0),B2=texelFetch(uBat,ivec2(b,2),0);
  float fa=texelFetch(uBat,ivec2(b,3),0).x;
  vec2 at=s0.zw;float face=0.0,since=B1.y;int role=0;
  if(B1.x<0.5){at.y+=B1.z*uMove.x-uMove.z;role=1;since=0.0;}
  else if(B1.x>2.5){at=s0.xy;role=3;since=B1.y+s1.w;}
  else if(B1.x>1.5){
    vec2 d=s0.xy-s0.zw;float dist=length(d),run=B1.z-B1.y,arrive=dist/uMove.y;
    if(dist<0.05||run>=arrive){at=s0.xy;since=B1.y+arrive;}
    else{at=s0.zw+d*(run/arrive);face=atan(d.x,d.y);role=2;}
  }
  vec2 l=at+s1.xy,xz=B0.xy+vec2(B0.w*l.x+B0.z*l.y,B0.w*l.y-B0.z*l.x);
  float a=B1.w+face+3.14159265+s1.z,ca=cos(a),sa=sin(a);
  int n=int(uClipN[role]+0.5),k=int(B2[role]+0.5)-int(floor(fa+since*uMove.w))+n*4096;
  clip=vec3(uClipS[role],float(n),float(k%n));
  return mat4(ca,0.0,-sa,0.0,0.0,1.0,0.0,0.0,sa,0.0,ca,0.0,xz.x,groundAt(xz),xz.y,1.0);}
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
  vec3 r=vec3(0.0,1.0,0.0);
  #ifdef INSTANCES
  #ifdef GPU_PLACE
  finalWorld=placeMan(world0,world1,world2,r);
  #else
  r=aVAT;
  #endif
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
