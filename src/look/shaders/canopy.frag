#extension GL_OES_standard_derivatives : enable
precision highp float;varying vec3 vW,vN,vS;varying float vTint,vOcc,vH,vRole;varying vec2 vRoot,vUV;uniform vec3 uFolA,uFolB;uniform float uRim,uKind,uLeafSize;uniform sampler2D uLeaf;
#include<painter>
#include<shore>

void main(){
  vec4 tx=texture2D(uLeaf,vUV);
  // the coverage grows with the mip level, so far crowns keep their mass instead of thinning out
  vec2 d=vUV*uLeafSize;float lod=max(0.0,0.5*log2(max(dot(dFdx(d),dFdx(d)),dot(dFdy(d),dFdy(d)))));
  if(tx.a*(1.0+lod*0.6)<0.5)discard;
  // the value over the coverage: the black around each clump, filtered in at its edge and in the mips, would darken it
  float val=mix(clamp(tx.r/max(tx.a,1e-3),0.0,1.0),0.6,smoothstep(1.5,4.0,lod));                 // far crowns: less value noise between leaves
  vec3 N=normalize(vN);
  vec4 lm=LM(vW);
  float sh=shadowAt(vS,N);                                      // at its point on the crown surface: deeper in, the other cards would shade it
  float bw=0.15*(1.0-smoothstep(-0.1,0.4,dot(N,uSunDir)))*(1.0-smoothstep(0.0,6.0,vH));
  vec3 alb=mix(foliage(uFolA,uFolB,vTint,uKind),groundSeason(groundBounce(vRoot)),bw)*mix(0.80,1.12,val)   // the painted value of the leaves
    *mix(vec3(1.0),vec3(0.72,0.86,0.92),step(0.5,vRole));                                                          // the inner leaves (role 1), as the pack crowns paint them
  vec3 c=paint(alb,N,vW,vOcc*mix(0.85,1.0,val)*mix(1.0,lm.g,uAO*0.6),uRim,1.0,sh);
  vec3 V=normalize(uCamPos-vW);                                 // golden backlight, as on the default crowns
  float back=clamp(dot(-normalize(V.xz+1e-4),normalize(uSunDir.xz)),0.0,1.0);back*=back;
  float edge=smoothstep(0.35,0.75,(1.0-abs(dot(N,V)))+(grainW(vW,N,2.4).r-0.5)*0.25);
  c+=uSunCol*vec3(1.0,0.78,0.45)*back*edge*uBack*0.3*(1.0-sh);    // half the default: the cards turn far more of the crown edge-on
  gl_FragColor=vec4(atmos(mist(c,vW,lm,vH),vW),depthA(vW));}
