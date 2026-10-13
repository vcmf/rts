precision highp float;attribute vec3 position;attribute vec3 normal;attribute float aV;attribute vec2 aSlot;
uniform mat4 viewProjection;uniform float uSeason;
// the ring (src/look/meadow.ts): its snapped origin and its centre (the focus), its cell, the clumps spread and height (one height on every ring), its band of distance from the centre
// (in from x to y, out from z to w), the meadow map (R the ground height, G the growth, B the height factor)
uniform vec2 uOrigin,uCentre;uniform float uCentreY;uniform float uCell,uSpread,uHeight;uniform vec4 uBand;uniform sampler2D uMeadow;
varying vec3 vW,vN;varying float vV,vShade,vH;varying vec2 vRoot;
#include<meadow>
// the meadow map at a point: one bilinear read (half floats filter), its growing area shrunk a texel on the CPU so
// the blend never crosses a rule (src/look/meadow.ts)
vec4 meadowAt(vec2 xz){return texture2D(uMeadow,(xz+TILE_HALF)/TILE_W);}
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
  // the growth here, thinner between the clumps, and a clump shrinks away instead of vanishing (no pop)
  float keep=m.g*band*mix(0.45,1.0,c),grow=smoothstep(h2-0.12,h2+0.12,keep);
  // the height the same on every ring and never over HEIGHT_MAX (a formation is never hidden), the footprint by the
  // ring (its cell), both shrinking away with the growth; winter: under the snow
  float j=mix(0.8,1.2,h3),hgt=min(uHeight*grow*m.b*j*mix(0.75,1.15,c)*mix(1.0,0.45,smoothstep(2.5,3.0,uSeason)),HEIGHT_MAX),fp=uSpread*uHeight*grow*j;
  if(hgt<0.02){gl_Position=vec4(2.0,2.0,2.0,1.0);return;}
  float a=h4*6.2832,ca=cos(a),sa=sin(a);
  vec3 p=vec3(position.x*fp,position.y*hgt,position.z*fp);p.xz=vec2(ca*p.x-sa*p.z,sa*p.x+ca*p.z);
  p.xz+=(vec2(h5,h6)-0.5)*0.25*p.y;                              // a little lean
  vec3 w=vec3(root.x,m.r-0.04,root.y)+p;
  vec3 n=normal;n.xz=vec2(ca*n.x-sa*n.z,sa*n.x+ca*n.z);
  vN=n;vW=w;vV=aV;vShade=c;   // the clump field (the ground colour under it, groundArm, already holds the brush pattern)
  vH=p.y;vRoot=root;
  gl_Position=viewProjection*vec4(w,1.0);}
