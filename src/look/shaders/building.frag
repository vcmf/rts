precision highp float;varying vec3 vW,vN;varying vec2 vUV;varying float vRole,vH;varying vec2 vRoot;
// the buildings (docs/plans/active/buildings.md): each region a palette colour by its role (tools/building-to-js.py:
// 0 wall, 1 roof, 2 timber, 3 opening, 4 accent), per model (src/look/buildings.ts), never the model's own colours
// (AGENTS.md); the model's texture only as its value about each role's mean (uDetail, 128 = 1), uDetailAmt of it,
// so the stone courses and the slates show under the paint's grain. Painted as the stones and the trunks are: the
// ramp, the cast shadow, the sky's occlusion from the light map, the ground's bounce, the snow on what faces up, the air
uniform vec3 uWall,uRoof,uTimber,uOpening,uAccent;uniform float uDetailAmt;uniform sampler2D uDetail;
#include<painter>
#include<shore>
vec3 roleCol(float r){
  if(r<0.5)return uWall;
  if(r<1.5)return uRoof;
  if(r<2.5)return uTimber;
  if(r<3.5)return uOpening;
  return uAccent;
}
void main(){
  vec3 N=normalize(vN);
  vec4 lm=LM(vW);
  float sh=shadowAt(vW,N);
  float d=texture2D(uDetail,vUV).r*255.0/128.0;
  vec3 alb=roleCol(vRole)*mix(1.0,d,uDetailAmt);
  pBounce=bounceAt(vRoot,vW.y-vH,vH,0.0);
  vec3 c=paint(alb,N,vW,mix(1.0,lm.g,uAO*0.6),0.4,1.0,sh);
  gl_FragColor=lensOut(airOf(c,vW,lm,vH),vW);}
