#extension GL_OES_standard_derivatives : enable
precision highp float;varying vec3 vW,vN,vC0,vC1,vC2;varying vec2 vRoot;varying float vU,vPart;
#include<painter>
#include<shore>

// the colour painted as the figures are (units.frag): its bands from the staff out, the staff's wood, the painter at
// unit crispness, the baked shadow and the ground's bounce, the units' light, the air, and its lens term (decision
// 0040: it blurs by its depth as everything does). Both faces drawn: the far face's normal turned to it
void main(){
  vec3 N=normalize(vN);if(!gl_FrontFacing)N=-N;
  vec3 col=vPart>0.5?vec3(0.30,0.21,0.13):(vU<0.3333?vC0:(vU<0.6667?vC1:vC2));
  vec4 lm=LM(vW);float sh=(1.0-lm.r)*uShadowsOn;
  pBounce=bounceAt(vRoot,vW.y,0.0,1.0);
  vec3 c=paint(col,N,vW,1.0,0.12,0.3,sh);
  gl_FragColor=lensOut(airOf(c,vW,lm,0.9),vW);}
