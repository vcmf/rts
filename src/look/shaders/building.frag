precision highp float;varying vec3 vW,vN;varying vec2 vUV;varying float vRole,vH;varying vec2 vRoot;
// the buildings (docs/plans/active/buildings.md): each region a palette colour by its role (tools/building-to-js.py:
// 0 wall, 1 roof, 2 timber, 3 opening, 4 accent), per model (src/look/buildings.ts), never the model's own colours
// (AGENTS.md); the model's texture only as its value over its local mean (a box of texels round it: the tool's
// DETAIL_BOX; uDetail, 128 = 1), uDetailAmt of it,
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
  // the sun's shadow looked up 15 cm off the surface along its normal (a wall or a roof near the light's grazing angle
  // shadowed itself in specks: the tower, the slates)
  float sh=shadowAt(vW+N*0.15,N);
  // (a face the export made, the windmill's sails, has no texel of its own: its UV below 0, its detail 1. The read
  // made anyway, at a clamped UV, so its derivatives hold in every quad)
  float d=texture2D(uDetail,max(vUV,0.0)).r*255.0/128.0;
  if(vUV.x<0.0)d=1.0;
  vec3 alb=roleCol(vRole)*mix(1.0,d,uDetailAmt);
  pBounce=bounceAt(vRoot,vW.y-vH,vH,0.0);
  // (the grain breaks the band edges at a third of the ground's: on a flat wall it broke them into pixel specks)
  vec3 c=paint(alb,N,vW,mix(1.0,lm.g,uAO*0.6),0.4,0.3,sh);
  gl_FragColor=lensOut(airOf(c,vW,lm,vH),vW);}
