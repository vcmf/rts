#extension GL_OES_standard_derivatives : enable
precision highp float;varying vec3 vW,vN,vCol;varying vec2 vRoot;varying float vRole;
// the guard's masks (tools/guard.mjs --figures, Units.setMask): off below 0, else flat uMask, or (2) white where the
// coat shows (uCoatRole), black elsewhere
uniform float uMask,uCoatRole;
#include<painter>
#include<shore>

// the figures painted as the army blocks the readability guard measures (block.frag): a side's colour by role through
// the shared painter at unit crispness, the baked sun shadow of trees and hills and the ground's bounce under the man
// (his root's ground), the units' light (KEEP_HUE: the mood's units tint, mist and grade, decisions 0027, 0035), the
// air over him, and his lens term (a unit blurs by its depth as everything does, decision 0040)
void main(){
  if(uMask>-0.5){float v=uMask>1.5?step(abs(vRole-uCoatRole),0.5):uMask;gl_FragColor=lensOut(vec3(v),vW);return;}
  vec3 N=normalize(vN);vec4 lm=LM(vW);
  float sh=(1.0-lm.r)*uShadowsOn;
  pBounce=bounceAt(vRoot,vW.y,0.0,1.0);
  vec3 c=paint(vCol,N,vW,1.0,0.12,0.3,sh);
  gl_FragColor=lensOut(airOf(c,vW,lm,0.9),vW);}
