#extension GL_OES_standard_derivatives : enable
precision highp float;varying vec3 vW,vN;varying float vRole,vTint,vOcc,vH;varying vec2 vRoot;uniform vec3 uFolA,uFolB;uniform float uRim,uKind;
#ifdef FAR_CROWN
varying vec3 vEllC,vEllR;varying float vFade;
#endif
#ifndef FAR_CROWN
#define PAINT_NATURE   // the painter's class for the mid tone (?midtone): the trunks, the stones, not the far crowns
#endif
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
  #ifdef FAR_CROWN
  // the dither's share first (the cards draw the rest, the instance's tint offsetting the pattern so trees do not share
  // it); the bark only past the band, where no trunks mesh draws it
  if(vRole<1.5?dither(gl_FragCoord.xy+vTint*61.0)>=vFade:vFade<1.0)discard;
  #endif
  #ifdef GRASSY
  float sh=(1.0-lm.r)*uShadowsOn;
  #elif defined(FAR_CROWN)
  float sh=vRole<1.5?0.0:shadowAt(vW,N);   // the crown's own: below
  #else
  float sh=shadowAt(vW,N);
  #endif
  float core=1.0,shO=sh;
  #ifdef FAR_CROWN
  // a far tree's crown mesh lit as its cards are (canopy.frag, VOLUME: docs/plans/done/l7b-crown-volume.md): the
  // ellipsoid's normal, the crown's own shade along the sun, a darker core; and cut by the dither where its cards
  // still stand (their fade)
  if(vRole<1.5){
    vec3 q=(vW-vEllC)/vEllR;N=normalize(q/vEllR);
    vec3 qo=(vW-vEllC)/(vEllR*1.3),dq=uSunDir/(vEllR*1.3);float qa=dot(dq,dq),qb=dot(qo,dq),qc=dot(qo,qo)-1.0,disc=qb*qb-qa*qc;
    float sq=sqrt(max(disc,0.0)),t1=(-qb-sq)/qa,t2=(-qb+sq)/qa,tt=disc>0.0?max(0.0,t2-max(t1,0.0)):0.0;
    shO=shadowAt(vW+uSunDir*max(t2,0.0),uSunDir);sh=max((1.0-exp(-tt*0.75/max(vEllR.x,vEllR.y)))*0.7,shO);
    core=mix(0.72,1.0,smoothstep(0.25,0.95,length(q)));
  }
  #endif
  #ifndef GRASSY
  if(vRole<1.5&&uEdges>0.5){                                   // painted silhouette: crowns break up like dabs
    vec3 V=normalize(uCamPos-vW);float fres=1.0-abs(dot(N,V));
    float g=grainW(vW,N,2.4).g*0.75+grainW(vW,N,0.9).r*0.25;
    if(fres>0.42&&g<(fres-0.42)*1.9)discard;
  }
  #endif
  // grass: the macro colour under the root tints the albedo all over (it shades like its ground, docs/plans/active/
  // l5-macro.md), so a tuft on stubble sits in its ground. Trees and stones take the ground's bounce as light (LC4)
  #ifdef GRASSY
  vec3 alb=mix(roleCol(vRole,vTint),groundSeason(groundBounce(vRoot)),0.25);
  #else
  vec3 alb=roleCol(vRole,vTint);pBounce=bounceAt(vRoot,vW.y-vH,vH,0.0);   // the trees, the stones: lit by the ground's bounce in paint() (LC4), not tinted
  #endif
  #ifdef GRASSY
  float lo=groundOcc(lm);pSky=mix(1.0,lm.g,uAO);               // grass sits in the contact under a tree, as its ground does
  #else
  float lo=lm.g;
  #endif
  vec3 c=paint(alb,N,vW,core*vOcc*mix(1.0,lo,uAO*0.6),uRim,1.0,sh);
  #ifndef GRASSY
  if(vRole<1.5){                                                // golden backlight: crowns glow when the sun is behind them
    vec3 V=normalize(uCamPos-vW);
    float back=clamp(dot(-normalize(V.xz+1e-4),normalize(uSunDir.xz)),0.0,1.0);back*=back;
    float edge=smoothstep(0.35,0.75,(1.0-abs(dot(N,V)))+(grainW(vW,N,2.4).r-0.5)*0.25);
    #ifdef FAR_CROWN
    c+=uSunCol*uBackCol*back*edge*uBack*0.3*(1.0-shO);   // as the cards' glow
    #else
    c+=uSunCol*uBackCol*back*edge*uBack*0.55*(1.0-sh);
    #endif
  }
  #endif
  gl_FragColor=lensOut(airOf(c,vW,lm,vH),vW);}