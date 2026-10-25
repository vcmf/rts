#extension GL_OES_standard_derivatives : enable
precision highp float;varying vec3 vW,vN;varying float vRiver;
#include<painter>
#include<shore>
// THE SIMPLE SHADOWS' SHADE (decision 0049; src/look/bakes.ts, src/look/units.ts): rendered top-down over the tile with
// the light map's camera, after the bounce map, and again whenever that is. At each texel the ratio of the ground
// painted in a full cast shadow to it painted as it is (the baked shadows of the trees and hills, the occlusion, the
// bounce, the season), so a soldier's shadow drawn on it (unitdecal.frag) darkens it as the figures' map darkens the
// ground it falls on. The ground's colour its macro colour through the season (the terrain's albedo without its fine
// layers: the ratio barely depends on them)
void main(){
  macroDerivs(vW.xz);
  vec3 N=normalize(vN);vec4 lm=LM(vW);
  float sh=(1.0-lm.r)*uShadowsOn,occ=mix(1.0,groundOcc(lm),uAO);pSky=mix(1.0,lm.g,uAO);
  pSnowLie=snowLie(vW.xz,pxMacro());
  #ifdef GROUND_BOUNCE
  pGround=groundBounceAt(vW);
  #endif
  vec3 alb=groundSeason(groundAt(vW.xz,pxMacro()));
  vec3 lit=paint(alb,N,vW,occ,0.12,0.0,sh),dark=paint(alb,N,vW,occ,0.12,0.0,1.0);
  gl_FragColor=vec4(clamp(dark/max(lit,vec3(1.0e-3)),0.0,1.0),1.0);
}
