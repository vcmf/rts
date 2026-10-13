#extension GL_OES_standard_derivatives : enable
precision highp float;varying vec3 vW,vN;varying float vRole,vTint,vOcc,vH;varying vec2 vRoot;uniform vec3 uFolA,uFolB;uniform float uRim,uKind;
#include<painter>
#include<shore>

vec3 roleCol(float r,float t){
  vec3 fol=foliage(uFolA,uFolB,t,uKind);
  if(r<0.5)return fol;
  if(r<1.5)return fol*vec3(0.72,0.86,0.92);
  if(r<2.5)return vec3(0.36,0.24,0.17);
  if(r<3.5)return vec3(0.66,0.62,0.55);
  if(r<4.5)return vec3(0.90,0.87,0.80);
  if(r<5.5)return vec3(0.20,0.18,0.17);
  if(r<6.5)return vec3(0.99,0.56,0.14);
  if(r<7.5)return vec3(0.97,0.95,0.88);
  if(r<8.5)return mix(vec3(0.86,0.66,0.28),vec3(0.95,0.80,0.40),t);
  return vec3(0.84,0.16,0.12);
}
void main(){
  vec3 N=normalize(vN);
  vec4 lm=LM(vW);
  #ifdef GRASSY
  float sh=(1.0-lm.r)*uShadowsOn;
  #else
  float sh=shadowAt(vW,N);
  #endif
  #ifndef GRASSY
  if(vRole<1.5&&uEdges>0.5){                                   // painted silhouette: crowns break up like dabs
    vec3 V=normalize(uCamPos-vW);float fres=1.0-abs(dot(N,V));
    float g=grainW(vW,N,2.4).g*0.75+grainW(vW,N,0.9).r*0.25;
    if(fres>0.42&&g<(fres-0.42)*1.9)discard;
  }
  #endif
  // the ground's bounce (docs/plans/active/l5-macro.md): the macro colour under the root tints the albedo on the side
  // away from the sun, most near the ground (grass all over: it shades like its ground), so a copse on its dark floor
  // and a tuft on stubble sit in their ground; the ramp then lights it like the rest
  #ifdef GRASSY
  float bw=0.25;
  #else
  float bw=0.15*(1.0-smoothstep(-0.1,0.4,dot(N,uSunDir)))*(1.0-smoothstep(0.0,6.0,vH));
  #endif
  vec3 alb=mix(roleCol(vRole,vTint),groundSeason(groundBounce(vRoot)),bw);
  #ifdef GRASSY
  float lo=groundOcc(lm);pSky=mix(1.0,lm.g,uAO);               // grass sits in the contact under a tree, as its ground does
  #else
  float lo=lm.g;
  #endif
  vec3 c=paint(alb,N,vW,vOcc*mix(1.0,lo,uAO*0.6),uRim,1.0,sh);
  #ifndef GRASSY
  if(vRole<1.5){                                                // golden backlight: crowns glow when the sun is behind them
    vec3 V=normalize(uCamPos-vW);
    float back=clamp(dot(-normalize(V.xz+1e-4),normalize(uSunDir.xz)),0.0,1.0);back*=back;
    float edge=smoothstep(0.35,0.75,(1.0-abs(dot(N,V)))+(grainW(vW,N,2.4).r-0.5)*0.25);
    c+=uSunCol*vec3(1.0,0.78,0.45)*back*edge*uBack*0.55*(1.0-sh);}
  #endif
  gl_FragColor=vec4(atmos(mist(c,vW,lm,vH),vW),depthA(vW));}