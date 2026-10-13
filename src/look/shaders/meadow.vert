precision highp float;attribute vec3 position;attribute vec3 normal;attribute float aV;attribute vec2 aSlot;
uniform mat4 viewProjection;uniform float uSeason;
// the ring (src/look/meadow.ts): its snapped origin and its centre (the focus), its cell, the clumps scale, its band of distance from the centre
// (in from x to y, out from z to w), the meadow map (R the ground height, G the growth, B the height factor)
uniform vec2 uOrigin,uCentre;uniform float uCentreY;uniform float uCell,uScale;uniform vec4 uBand;uniform sampler2D uMeadow;
varying vec3 vW,vN;varying float vV,vShade,vH;varying vec2 vRoot;
#include<meadow>
// the meadow map at a point: bilinear by hand over its texels (a float texture need not filter)
vec4 meadowAt(vec2 xz){vec2 g=(xz+TILE_HALF)/TILE_W*MEADOW_N-0.5,i=floor(g),f=g-i;
  vec4 a=texture2D(uMeadow,(i+vec2(0.5,0.5))/MEADOW_N),b=texture2D(uMeadow,(i+vec2(1.5,0.5))/MEADOW_N),
       c=texture2D(uMeadow,(i+vec2(0.5,1.5))/MEADOW_N),d=texture2D(uMeadow,(i+vec2(1.5,1.5))/MEADOW_N);
  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}
void main(){
  vec2 cell=uOrigin+aSlot*uCell;                                 // this slot in the world: what it draws hangs on the cell
  vec2 k=floor(cell/uCell+0.5);float h0=mHash(k+uCell*31.7),h1=mHash(k*1.31+5.3),h2=mHash(k*0.71-9.1),h3=mHash(k+71.9);
  vec2 root=cell+vec2(h0,h1)*uCell;
  float d=length(root-uCentre);
  float band=(uBand.y>0.0?smoothstep(uBand.x,uBand.y,d):1.0)*(1.0-smoothstep(uBand.z,uBand.w,d));   // the inner ring has no fade in
  // the cheap tests first, before any read of the meadow map: outside the band, or outside the view (the root at
  // the focus height, with a margin for the ground rising or falling 20 m from it)
  vec4 cp=viewProjection*vec4(root.x,uCentreY,root.y,1.0);
  if(band<=0.0||abs(cp.x)>cp.w*1.3+4.0||abs(cp.y)>cp.w*1.3+20.0||cp.w<0.0){gl_Position=vec4(2.0,2.0,2.0,1.0);return;}
  vec4 m=meadowAt(root);float c=clumpAt(root);
  // the growth here, thinner between the clumps, and a clump shrinks away instead of vanishing (no pop)
  float keep=m.g*band*mix(0.45,1.0,c),grow=smoothstep(h2-0.12,h2+0.12,keep);
  float s=uScale*grow*m.b*mix(0.75,1.25,h3)*mix(0.65,1.2,c)*mix(1.0,0.45,smoothstep(2.5,3.0,uSeason));   // winter: under the snow
  if(s<0.02){gl_Position=vec4(2.0,2.0,2.0,1.0);return;}
  float a=h0*6.2832,ca=cos(a),sa=sin(a);
  vec3 p=position*s;p.xz=vec2(ca*p.x-sa*p.z,sa*p.x+ca*p.z);
  p.xz+=(vec2(h1,h3)-0.5)*0.25*p.y;                              // a little lean
  vec3 w=vec3(root.x,m.r-0.04,root.y)+p;
  vec3 n=normal;n.xz=vec2(ca*n.x-sa*n.z,sa*n.x+ca*n.z);
  vN=n;vW=w;vV=aV;vShade=c;vH=p.y;vRoot=root;
  gl_Position=viewProjection*vec4(w,1.0);}
