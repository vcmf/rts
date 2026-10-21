precision highp float;attribute vec3 position;attribute vec3 normal;attribute float aRole;attribute vec4 aBones;attribute vec4 aWeights;
#include<instancesDeclaration>
// the figures' skinning from the baked animation (src/look/units.ts, tools/bake-figure.py): one row per 1/12 s step,
// four texels per bone (a skinning matrix, column by column), four influences per vertex. A man's step: his range's
// first row, plus the clock's steps since his role's clip began, round his range's loop
uniform mat4 viewProjection;uniform sampler2D uVAT;uniform float uVATTime;
#ifdef INSTANCES
attribute vec4 aVAT;   // first step, steps in the loop, phase in steps, steps a second
#endif
#ifdef DEPTH
varying float vD;
#else
// a side's colours by role (the bake's palette, src/look/world/armies.ts): a palette swap recolours the side
uniform vec3 uPal[PAL_N];
#ifdef FAR
// the far LOD's palette (?farpal=1: farPalette, src/look/world/armies.ts), crossfaded in as the figure shrinks below
// the LOD switch, so the switch does not pop: uFarK.x, a figure's height in pixels at 1 m; uFarK.y, the switch's
uniform vec3 uPalFar[PAL_N];uniform vec2 uFarK;uniform vec3 uCamPos;
varying float vFar;
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
  mat4 sk=boneAt(aBones.x,f)*aWeights.x+boneAt(aBones.y,f)*aWeights.y+boneAt(aBones.z,f)*aWeights.z+boneAt(aBones.w,f)*aWeights.w;
  vec4 w=finalWorld*(sk*vec4(position,1.0));
  vec4 p=viewProjection*w;
  #ifdef DEPTH
  vD=p.z/p.w*0.5+0.5;
  #else
  vN=normalize(mat3(finalWorld)*(mat3(sk)*normal));vW=w.xyz;vRoot=finalWorld[3].xz;
  vCol=uPal[int(aRole+0.5)];vRole=aRole;
  #ifdef FAR
  float px=uFarK.x/max(1.0,distance(uCamPos,finalWorld[3].xyz));
  vFar=1.0-smoothstep(uFarK.y*0.35,uFarK.y*0.9,px);
  vCol=mix(vCol,uPalFar[int(aRole+0.5)],vFar);
  #endif
  #endif
  gl_Position=p;}
