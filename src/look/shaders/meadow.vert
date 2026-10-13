precision highp float;attribute vec3 position;attribute vec3 normal;attribute float aV;attribute vec2 aSlot;
uniform mat4 viewProjection;uniform float uSeason;
// the ring (src/look/meadow.ts): its snapped origin and its centre (the focus), its cell, the clumps spread and height (one height on every ring), its band of distance from the centre
// (in from x to y, out from z to w), the meadow map (R the ground height, G the growth, B the height factor, A the
// crops growth), the cover grid (nearest: its class, src/look/shaders/macro.glsl)
uniform vec2 uOrigin,uCentre;uniform float uCentreY;uniform float uCell,uSpread,uHeight;uniform vec4 uBand;uniform sampler2D uMeadow,uCover;
varying vec3 vW,vN,vCrop;varying float vV,vShade,vH,vIsCrop;varying vec2 vRoot;
#include<meadow>
// the meadow map at a point: one bilinear read (half floats filter), its growing area shrunk a texel on the CPU so
// the blend never crosses a rule (src/look/meadow.ts)
vec4 meadowAt(vec2 xz){return texture2D(uMeadow,(xz+TILE_HALF)/TILE_W);}
vec2 coverCell(vec2 xz){vec4 t=texture2D(uCover,xz/FAR_W+0.5);return floor(t.rg*255.0+0.5);}   // its class and field id
// a crop by its class and the season (docs/plans/done/l5d-crops.md, uSeason 0 summer, 1 autumn, 2 late autumn, 3
// winter): its height (m) in x, its colour at the tip in yzw. Wheat stands in summer (never over WHEAT_HEIGHT_MAX,
// decision 0026), is cut to stubble (0.22 m) in autumn and ploughed under after, stubble short until the plough, the green
// crop low all year, lower under the snow and toward its colour. The colour (the owner): lime to gold, orange and
// brown with the season
vec4 cropLook(float k,float j){
  float s=uSeason;
  if(k>5.5&&k<6.5){
    float h=mix(WHEAT_HEIGHT_MAX*mix(0.84,1.0,j),0.22,smoothstep(0.55,0.95,s))*(1.0-smoothstep(1.55,1.95,s));
    vec3 c=s<1.0?mix(vec3(0.72,0.60,0.27),vec3(0.70,0.49,0.24),s):mix(vec3(0.70,0.49,0.24),vec3(0.47,0.36,0.23),min(s-1.0,1.0));
    return vec4(h,c);}
  if(k>6.5&&k<7.5){
    float h=0.45*mix(0.85,1.0,j)*mix(1.0,0.5,smoothstep(2.5,3.0,s));
    vec3 c=mix(vec3(0.46,0.58,0.21),vec3(0.42,0.43,0.22),smoothstep(0.5,2.5,s));
    return vec4(h,mix(c,vec3(0.46,0.42,0.34),0.5*smoothstep(2.0,3.0,s)));}   // toward the winter ground (groundSeason)
  if(k<7.5||k>8.5)return vec4(0.0);   // not a sown class: nothing (Nature.crop grows none there)
  float h=0.22*mix(0.8,1.0,j)*(1.0-smoothstep(1.55,1.95,s));
  return vec4(h,mix(vec3(0.68,0.60,0.40),vec3(0.50,0.40,0.28),smoothstep(0.5,1.8,s)));}
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
  float keep=crop?m.a*band*mix(0.8,1.0,c):m.g*band*mix(0.45,1.0,c),grow=smoothstep(h2-0.12,h2+0.12,keep);
  // nothing where nothing grows (the smoothstep above is over 0 at a growth of 0 for a low hash, and the height factor
  // is not zeroed by the rules: the zones and the banks)
  if(keep<=0.0){gl_Position=vec4(2.0,2.0,2.0,1.0);return;}
  // the height the same on every ring and never over HEIGHT_MAX (a formation is never hidden), the footprint by the
  // ring (its cell), both shrinking away with the growth, winter: under the snow. A crop: its own height by class and
  // season, narrower than grass
  float j=mix(0.8,1.2,h3),hgt,fp;
  vec4 cr=vec4(0.0);
  // its footprint narrower than grass, and under the grass height in the grass proportions (short stubble stays
  // upright, not a flat splat), each
  // field a shade apart, as the ground paints it (cellColour in macro.glsl)
  if(crop){vec2 cc=coverCell(root);cr=cropLook(cc.x,h3);cr.yzw*=cc.y>0.5?0.94+0.12*fract(cc.y*0.6180339):1.0;
    hgt=min(cr.x*grow*mix(0.9,1.05,c),WHEAT_HEIGHT_MAX);fp=uSpread*uHeight*grow*j*min(0.7,cr.x/uHeight);}
  else{hgt=min(uHeight*grow*m.b*j*mix(0.75,1.15,c)*mix(1.0,0.45,smoothstep(2.5,3.0,uSeason)),HEIGHT_MAX);fp=uSpread*uHeight*grow*j;}
  if(hgt<0.02){gl_Position=vec4(2.0,2.0,2.0,1.0);return;}
  float a=h4*6.2832,ca=cos(a),sa=sin(a);
  vec3 p=vec3(position.x*fp,position.y*hgt,position.z*fp);p.xz=vec2(ca*p.x-sa*p.z,sa*p.x+ca*p.z);
  p.xz+=(vec2(h5,h6)-0.5)*0.25*p.y;                              // a little lean
  vec3 w=vec3(root.x,m.r-MEADOW_SINK,root.y)+p;   // sunk a little: the map's 1 m bilinear height is within that of the drawn ground where grass grows (tools/look-check.js)
  vec3 n=normal;n.xz=vec2(ca*n.x-sa*n.z,sa*n.x+ca*n.z);
  vN=n;vW=w;vV=aV;vShade=c;   // the clump field (the ground colour under it, groundArm, already holds the brush pattern)
  vH=p.y;vRoot=root;vIsCrop=crop?1.0:0.0;vCrop=cr.yzw;
  gl_Position=viewProjection*vec4(w,1.0);}
