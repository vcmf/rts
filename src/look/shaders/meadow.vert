precision highp float;attribute vec3 position;attribute vec3 normal;attribute float aV;attribute vec2 aSlot;
uniform mat4 viewProjection;uniform float uSeason,uAutumnWarm;   // uAutumnWarm: the mood's (src/look/mood.ts)
// the ring (src/look/meadow.ts): its snapped origin and its centre (the focus), its cell, the clumps spread and height (one height on every ring), its band of distance from the centre
// (in from x to y, out from z to w), the meadow map (R the ground height, G the growth, B the height factor, A the
// crops growth), the cover grid (nearest: its class, src/look/shaders/macro.glsl)
uniform vec2 uOrigin,uCentre;uniform float uCentreY;uniform float uCell,uSpread,uHeight;uniform vec4 uBand;uniform sampler2D uMeadow,uCover;
varying vec3 vW,vN,vCrop;varying float vV,vShade,vH,vIsCrop;varying vec2 vRoot;
#ifdef GRASS_FLOW
uniform vec3 uCamPos,uFocus;   // (the zoom: how far the camera stands from the focus)
varying vec3 vFlow;   // the combed meadow: the clump hue (a hash), the growth at its root, how far it is from winter (1 to 0)
#endif
#include<meadow>
#ifdef UNIT_SHADOWS_VS
// the figures' cast shadow (decision 0047) read once a blade, at its root on the ground, for the whole blade: the
// fragment's own read (painter.glsl, unitShadowAt) is six fetches a pixel over many layers of blades. The same 2x2
// taps and border fade, without the grain's jitter (the blade is the unit: its edge is the blade's)
uniform sampler2D uUnitSM;uniform mat4 uUnitVP;uniform vec2 uUnitTexel;uniform float uUnitBias;uniform float uShadowsOn;
varying float vUSh;
float unitShadowRoot(vec3 wp){
  vec4 lp=uUnitVP*vec4(wp,1.0);vec3 q=lp.xyz/lp.w;vec2 uv=q.xy*0.5+0.5;
  if(uv.x<0.0||uv.y<0.0||uv.x>1.0||uv.y>1.0||q.z>1.0)return 0.0;
  float d=q.z*0.5+0.5-uUnitBias,s=0.0;
  for(int x=0;x<2;x++)for(int y=0;y<2;y++)s+=step(texture2D(uUnitSM,uv+(vec2(float(x),float(y))-0.5)*uUnitTexel).r,d);
  vec2 e=min(uv,1.0-uv);float fade=smoothstep(0.0,8.0*uUnitTexel.x,e.x)*smoothstep(0.0,8.0*uUnitTexel.y,e.y);
  return s/4.0*uShadowsOn*fade;}
#endif
// the meadow map at a point: one bilinear read (half floats filter), its growing area shrunk a texel on the CPU so
// the blend never crosses a rule (src/look/meadow.ts)
vec4 meadowAt(vec2 xz){return texture2D(uMeadow,(xz+TILE_HALF)/TILE_W);}
vec2 coverCell(vec2 xz){vec4 t=texture2D(uCover,xz/FAR_W+0.5);return floor(t.rg*255.0+0.5);}   // its class and field id
// the stubble tip colour, a pale straw, browning by late autumn: its red no higher than the standing wheat (no
// clipping in the sun), its contrast with the coats measured by the guard (tools/guard.mjs --view crops)
vec3 stubbleTip(float s){return mix(vec3(0.72,0.67,0.49),vec3(0.58,0.49,0.34),smoothstep(0.5,1.8,s));}

// a crop by its class and the season (docs/plans/done/l5d-crops.md, uSeason 0 summer, 1 autumn, 2 late autumn, 3
// winter): its height (m) in x, its colour at the tip in yzw. Wheat stands in summer (never over WHEAT_HEIGHT_MAX,
// decision 0026), is cut to stubble (STUBBLE_HEIGHT) in autumn and ploughed under after, stubble stands until the
// plough, the green crop low all year, lower under the snow and toward its colour. The colour (the owner): lime to
// gold, turning orange as it is cut (autumn: from 0.55 to 0.95), the stubble pale straw over the darker soil,
// browning to the plough
vec4 cropLook(float k,float j){
  float s=uSeason;
  if(k>5.5&&k<6.5){
    // (the mood's warm autumn: the wheat stands tall through autumn, gold to a deep orange, until the plough)
    float cut=smoothstep(0.55,0.95,s)*(1.0-uAutumnWarm),h=mix(WHEAT_HEIGHT_MAX*mix(0.84,1.0,j),STUBBLE_HEIGHT*mix(0.8,1.0,j),cut)*cropSeasonK(k,s);
    vec3 c=mix(mix(vec3(0.72,0.60,0.27),mix(vec3(0.70,0.49,0.24),vec3(0.82,0.60,0.32),uAutumnWarm),min(s,1.0)),stubbleTip(s),cut);   // standing gold to orange, then cut to the stubble
    return vec4(h,c);}
  if(k>6.5&&k<7.5){
    float h=GREEN_HEIGHT*mix(0.85,1.0,j)*cropSeasonK(k,s);
    vec3 c=mix(vec3(0.46,0.58,0.21),vec3(0.42,0.43,0.22),smoothstep(0.5,2.5,s));
    return vec4(h,mix(c,vec3(0.46,0.42,0.34),0.5*smoothstep(2.0,3.0,s)));}   // toward the winter ground (groundSeason)
  if(k<7.5||k>8.5)return vec4(0.0);   // not a sown class: nothing (Nature.crop grows none there)
  return vec4(STUBBLE_HEIGHT*mix(0.8,1.0,j)*cropSeasonK(k,s),stubbleTip(s));}
void main(){
  vec2 cell=uOrigin+aSlot*uCell;                                 // this slot in the world: what it draws hangs on the cell
  vec2 k=floor(cell/uCell+0.5);float h0=mHash(k+uCell*31.7),h1=mHash(k*1.31+5.3),h2=mHash(k*0.71-9.1),h3=mHash(k+71.9),h4=mHash(k*1.71+13.3),h5=mHash(k*0.53-27.7),h6=mHash(k*2.13+3.9);   // one hash a trait
  vec2 root=cell+vec2(h0,h1)*uCell;
  float d=length(root-uCentre);
  float band=(uBand.y>0.0?smoothstep(uBand.x,uBand.y,d):1.0)*(1.0-smoothstep(uBand.z,uBand.w,d));   // the inner ring has no fade in
  // the cheap tests first, before any read of the meadow map: outside the band, or outside the view: the root at
  // 20 m under and over the focus height (the ground on the tile spans less), culled only when both lie past the
  // same edge of the frame, with a margin of a clump
  vec4 q0=viewProjection*vec4(root.x,uCentreY-20.0,root.y,1.0),q1=viewProjection*vec4(root.x,uCentreY+20.0,root.y,1.0);
  float mx=1.15;
  bool culled=(q0.x>q0.w*mx&&q1.x>q1.w*mx)||(q0.x<-q0.w*mx&&q1.x<-q1.w*mx)||(q0.y>q0.w*mx&&q1.y>q1.w*mx)||(q0.y<-q0.w*mx&&q1.y<-q1.w*mx)||(q0.w<0.0&&q1.w<0.0);
  if(band<=0.0||culled){gl_Position=vec4(2.0,2.0,2.0,1.0);return;}
  vec4 m=meadowAt(root);float c=clumpAt(root);
  // grass or a crop, never both on one patch: a crop where it grows more than the grass
  bool crop=m.a>m.g;
  // the growth here, thinner between the clumps (a crop evenly sown, less so), and a clump shrinks away instead of
  // vanishing (no pop)
  #ifdef GRASS_FLOW
  float big=1.0-smoothstep(2.0,2.8,uSeason);   // the combed meadow, as the default under the snow of winter
  // larger and denser up close only (the owner judged them there): whole to CLOSE_ZOOM.x m of the camera from the focus,
  // the default by CLOSE_ZOOM.y, on the inner rings (the outer ring clumps are a few pixels: there it was fill, not look)
  float nearK=big*step(uCell,1.5)*(1.0-smoothstep(CLOSE_ZOOM.x,CLOSE_ZOOM.y,length(uCamPos-uFocus)));
  #endif
  float keep=crop?m.a*band*mix(0.8,1.0,c):m.g*band*mix(0.45,1.0,c);
  #if defined(GRASS_FLOW)&&!defined(GRASS_NO_DENSE)
  // denser (the owner, 2026-10-17): fewer clumps thinned between the patches, on the inner rings only (the outer ring's
  // clumps are a few pixels: denser there was fill, not look), as the default under the snow of winter
  if(!crop)keep=m.g*band*mix(mix(0.45,0.8,nearK),1.0,c);
  #endif
  float grow=smoothstep(h2-0.12,h2+0.12,keep);
  // nothing where nothing grows (the smoothstep above is over 0 at a growth of 0 for a low hash, and the height factor
  // is not zeroed by the rules: the zones and the banks)
  if(keep<=0.0){gl_Position=vec4(2.0,2.0,2.0,1.0);return;}
  // the height the same on every ring and never over HEIGHT_MAX (a formation is never hidden), the footprint by the
  // ring (its cell), both shrinking away with the growth, winter: under the snow. A crop: its own height by class and
  // season, narrower than grass
  float j=mix(0.8,1.2,h3),hgt,fp;
  vec4 cr=vec4(0.0);
  // its footprint narrower than grass, and under the grass height in the grass proportions (a crop lower than grass
  // stays upright, not a flat splat), each
  // field a shade apart, as the ground paints it (cellColour in macro.glsl)
  if(crop){vec2 cc=coverCell(root);cr=cropLook(cc.x,h3);cr.yzw*=cc.y>0.5?0.94+0.12*fract(cc.y*0.6180339):1.0;
    hgt=min(cr.x*grow*mix(0.9,1.05,c),WHEAT_HEIGHT_MAX);fp=uSpread*uHeight*grow*j*min(0.7,cr.x/uHeight);}
  else{hgt=min(uHeight*grow*m.b*j*mix(0.75,1.15,c)*grassSeasonK(uSeason),HEIGHT_MAX);fp=uSpread*uHeight*grow*j;
    #if defined(GRASS_FLOW)&&!defined(GRASS_NO_BIG)
    hgt=min(hgt*mix(1.0,GRASS_TALL,nearK),HEIGHT_MAX);fp*=mix(1.0,GRASS_WIDE,nearK);   // larger blades (the owner): wider clumps, a little taller, never over HEIGHT_MAX
    #endif
  }
  if(hgt<0.02){gl_Position=vec4(2.0,2.0,2.0,1.0);return;}
  float a=h4*6.2832,ca=cos(a),sa=sin(a);
  vec3 p=vec3(position.x*fp,position.y*hgt,position.z*fp);p.xz=vec2(ca*p.x-sa*p.z,sa*p.x+ca*p.z);
  // a crop's stalks stand straight (docs/plans/done/crop-depth.md): a blade's spread drawn in toward its root's
  // axis as it rises (the grass clump fans out), and barely any lean
  if(crop)p.xz*=CROP_WIDE/(1.0+CROP_FAN*aV);   // the grass clump's spread grows about 1 + CROP_FAN aV up its blades (measured): undone, the stalks parallel, CROP_WIDE times the root's spread
  #ifdef GRASS_FLOW
  // combed (docs/plans/done/grass-flow.md): the clump leans with the flow, bending more toward its tips (the
  // offset grows with the height squared), as far as the flow lies it over, the hash a small jitter; not crops
  #ifdef GRASS_NO_LEAN
  vec3 fl=vec3(1.0,0.0,0.0);   // (the ablation: no flow read a vertex)
  #else
  vec3 fl=flowTex(root);
  #endif
  if(!crop)p.xz+=mix((vec2(h5,h6)-0.5)*0.25,fl.xy*mix(LEAN_MIN,LEAN_MAX,fl.z)*p.y/max(hgt,0.05)+(vec2(h5,h6)-0.5)*LEAN_JITTER,big)*p.y;   // (as the default under the snow)
  else p.xz+=(vec2(h5,h6)-0.5)*0.06*p.y;
  #else
  p.xz+=(vec2(h5,h6)-0.5)*(crop?0.06:0.25)*p.y;                  // a little lean
  #endif
  vec3 w=vec3(root.x,m.r-MEADOW_SINK,root.y)+p;   // sunk a little: the map's 1 m bilinear height is within that of the drawn ground where grass grows (tools/look-check.js)
  vec3 n=normal;n.xz=vec2(ca*n.x-sa*n.z,sa*n.x+ca*n.z);
  #ifdef GRASS_FLOW
  vFlow=vec3(mHash(k*1.93+41.7),m.g,big);   // (one per clump: no speckle)
  #endif
  vN=n;vW=w;vV=aV;vShade=c;   // the clump field (the ground colour under it, groundArm, already holds the brush pattern)
  vH=p.y;vRoot=root;vIsCrop=crop?1.0:0.0;vCrop=cr.yzw;
  #ifdef UNIT_SHADOWS_VS
  vUSh=unitShadowRoot(vec3(root.x,m.r,root.y));
  #endif
  gl_Position=viewProjection*vec4(w,1.0);}
