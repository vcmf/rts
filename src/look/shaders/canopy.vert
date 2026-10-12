precision highp float;attribute vec3 position;attribute vec3 normal;attribute vec2 aCorner;attribute vec4 aCard;attribute vec3 aCrown;
#include<instancesDeclaration>
uniform mat4 viewProjection;uniform mat4 view;uniform vec3 uCamPos;
#ifdef INSTANCES
attribute float aTint;
#endif
varying vec3 vW,vN,vS;varying float vTint,vOcc,vH;varying vec2 vRoot,vUV;
void main(){
  #include<instancesVertex>
  vec4 c=finalWorld*vec4(position,1.0);
  float sc=length(finalWorld[0].xyz);
  vec3 R=vec3(view[0][0],view[1][0],view[2][0]),U=vec3(view[0][1],view[1][1],view[2][1]);
  float a=aCard.y;vec2 k=vec2(cos(a)*aCorner.x-sin(a)*aCorner.y,sin(a)*aCorner.x+cos(a)*aCorner.y);
  vec3 w=c.xyz+(R*k.x+U*k.y)*aCard.x*sc;                       // the card, facing the camera
  vUV=(aCorner*0.5+0.5+vec2(floor(aCard.z/2.0),mod(aCard.z,2.0)))*0.5;
  vOcc=clamp(0.62+(position.y-aCrown.y)*0.55+length(position.xz-aCrown.xz)*0.25,0.0,1.0);
  vN=normalize(mat3(finalWorld)*normal);
  vS=c.xyz+vN*(aCard.w+0.3)*aCard.x*sc;                      // the card on the crown surface: one shadow per card
vW=w;vH=w.y-finalWorld[3].y;vRoot=finalWorld[3].xz;
  float t=0.5;
  #ifdef INSTANCES
  t=aTint;
  #endif
  vTint=t;gl_Position=viewProjection*vec4(w,1.0);}
