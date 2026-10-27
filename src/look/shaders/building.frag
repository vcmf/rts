#extension GL_OES_standard_derivatives : enable
precision highp float;varying vec3 vW,vN;varying vec2 vUV;varying float vRole,vH;varying vec2 vRoot;
// the buildings (docs/plans/done/buildings.md): each region a palette colour by its role (tools/building-to-js.py:
// 0 wall, 1 roof, 2 timber, 3 opening, 4 accent), per model (src/look/buildings.ts), never the model's own colours
// (AGENTS.md); the model's texture only as its value over its local mean (a box of texels round it: the tool's
// DETAIL_BOX; uDetail's R, 128 = 1), uDetailAmt of it,
// so the stone courses and the slates show under the paint's grain. Painted as the stones and the trunks are: the
// ramp, the cast shadow, the sky's occlusion from the light map, the ground's bounce, the snow on what faces up, the air
uniform vec3 uWall,uRoof,uTimber,uOpening,uAccent,uShutter;uniform float uDetailAmt;uniform sampler2D uDetail;
#ifdef BLD_BAKED
// the static light baked (src/look/building-light.ts): R the sun's cast shadow, G the sky's occlusion, B the mist's
// mask, A the light map's sun (stored from 1/255); the bounce at the instance's root (uBldBounce, a texel an instance)
uniform sampler2D uBldLight,uBldBounce;varying vec2 vLUV;varying float vTileI;
#endif
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
  #ifdef BLD_BAKED
  // (its mip level from the light UVs' footprint in the atlas's texels, no coarser than BLD_MAXLOD: past it a read would
  // reach a neighbouring island's light, building-light.ts)
  vec2 lx=dFdx(vLUV)*BLD_SIZE,ly=dFdy(vLUV)*BLD_SIZE;
  vec4 bk=textureLod(uBldLight,vLUV,clamp(0.5*log2(max(max(dot(lx,lx),dot(ly,ly)),1e-12)),0.0,BLD_MAXLOD));
  vec4 lm=vec4((bk.a*255.0-1.0)/254.0,bk.g,bk.b,1.0);float sh=bk.r*uShadowsOn;
  #ifdef BOUNCE
  pBounce=texelFetch(uBldBounce,ivec2(int(vTileI+0.5),0),0).rgb*(1.0-smoothstep(0.0,8.0,vH));   // (bounceAt's fade)
  #endif
  #else
  vec4 lm=LM(vW);
  // the sun's shadow looked up 15 cm off the surface along its normal (a wall or a roof near the light's grazing angle
  // shadowed itself in specks: the tower, the slates)
  float sh=shadowAt(vW+N*0.15,N);
  #ifdef BOUNCE
  pBounce=bounceAt(vRoot,vW.y-vH,vH,0.0);
  #endif
  #endif
  // (G and B: the openings and shutters a low-poly model paints inside its wall and timber faces, as inlays over the
  // face's role: tools/building-to-js.py, vote; only on those roles, the tool's HOSTS, so a mask's texel at an island's
  // edge or in a coarser mip never reaches a roof; the opening last, over a shutter where both are)
  vec3 dt=texture2D(uDetail,vUV).rgb;
  float d=dt.r*255.0/128.0;
  float host=(vRole<0.5||abs(vRole-2.0)<0.5)?1.0:0.0;
  vec3 alb=mix(mix(roleCol(vRole),uShutter,dt.b*host),uOpening,dt.g*host)*mix(1.0,d,uDetailAmt);
  // (the grain breaks the band edges at a third of the ground's: on a flat wall it broke them into pixel specks)
  vec3 c=paint(alb,N,vW,mix(1.0,lm.g,uAO*0.6),0.4,0.3,sh);
  gl_FragColor=lensOut(airOf(c,vW,lm,vH),vW);}
