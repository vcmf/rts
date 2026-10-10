precision highp float;varying vec3 vW,vN;uniform vec3 uAlb;
#include<painter>

// a flat army block (docs/plans/active/l2-detail.md, the readability guard): one coat colour through the shared
// painter at unit crispness, lit and shadowed like the ground under it
void main(){vec3 N=normalize(vN);vec4 lm=LM(vW);
  float sh=(1.0-lm.r)*uShadowsOn;
  vec3 c=paint(uAlb,N,vW,1.0,0.12,0.3,sh);
  gl_FragColor=vec4(atmos(mist(c,vW,lm,0.9),vW),depthA(vW));}
