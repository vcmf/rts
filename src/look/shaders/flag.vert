precision highp float;attribute vec3 position;attribute float aPart;
#include<instancesDeclaration>
// a battalion's colour on its staff (src/look/units.ts, flags): the cloth's grid from the staff out (x, 0 to FLAG_W m)
// and up, its wave stepped at the figures' 12 fps; the whole flag grown about the staff's foot so the cloth is never
// under uFlagK.y pixels tall (uFlagK.x: pixels a metre at 1 m), up to 5 times
uniform mat4 viewProjection;uniform float uFlagT;uniform vec3 uCamPos;uniform vec2 uFlagK;
attribute vec3 aC0,aC1,aC2;attribute float aPh;
#ifdef SMOOTH
// the bearer's place moved every frame (?smoothmove=1, src/look/units.ts)
attribute vec3 aNext;uniform float uStepFrac;
#endif
varying vec3 vW,vN,vC0,vC1,vC2;varying vec2 vRoot;varying float vU,vPart;
void main(){
  #include<instancesVertex>
  #ifdef SMOOTH
  finalWorld[3].xyz+=aNext*uStepFrac;
  #endif
  vec3 p=position,n=vec3(0.0,0.0,1.0);float u=clamp(p.x/FLAG_W,0.0,1.0);
  if(aPart<0.5){
    float t=floor(uFlagT*12.0)/12.0+aPh,ph=u*5.0-t*7.0,a=0.14*u;
    p.z+=sin(ph)*a;p.y-=0.10*u*u;
    n=normalize(vec3(-(cos(ph)*5.0/FLAG_W*a+sin(ph)*0.14/FLAG_W),0.0,1.0));
  }
  vec3 base=finalWorld[3].xyz;
  float k=clamp(uFlagK.y*distance(uCamPos,base)/(uFlagK.x*FLAG_H),1.0,5.0);
  vec4 w=finalWorld*vec4(p*k,1.0);
  vW=w.xyz;vN=normalize(mat3(finalWorld)*n);vRoot=base.xz;vU=u;vPart=aPart;vC0=aC0;vC1=aC1;vC2=aC2;
  gl_Position=viewProjection*w;}
