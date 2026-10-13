precision highp float;attribute vec3 position;attribute vec3 normal;attribute vec2 aCorner;attribute vec4 aCard;attribute vec3 aCrown;attribute float aRole;attribute vec3 aEllC;attribute vec2 aEllR;
#include<instancesDeclaration>
uniform mat4 viewProjection;uniform mat4 view;uniform vec3 uCamPos;
#ifdef INSTANCES
attribute float aTint;
#endif
#include<cards>
varying vec3 vW,vN,vS;varying float vTint,vOcc,vH,vRole;varying vec2 vRoot,vUV;
varying vec3 vEllC,vEllR,vTU,vTV;   // L7b: the crown ellipsoid in the world, the card texture axes in the world
void main(){
  #include<instancesVertex>
  vec4 c=finalWorld*vec4(position,1.0);
  float sc=length(finalWorld[0].xyz);
  vec3 w=c.xyz+cardOffset(aCard,aCorner,view,sc);                // the card, facing the camera
  vUV=cardUV(aCard,aCorner);
  vEllC=(finalWorld*vec4(aEllC,1.0)).xyz;vEllR=vec3(aEllR.x,aEllR.y,aEllR.x)*sc;
  vec3 R=vec3(view[0][0],view[1][0],view[2][0]),U=vec3(view[0][1],view[1][1],view[2][1]);float a=aCard.y;
  vTU=R*cos(a)+U*sin(a);vTV=-R*sin(a)+U*cos(a);   // where the atlas u and v point, the card turned by its rotation
  vOcc=clamp(0.62+(position.y-aCrown.y)*0.55+length(position.xz-aCrown.xz)*0.25,0.0,1.0);
  vN=normalize(mat3(finalWorld)*normal);vW=w;vH=w.y-finalWorld[3].y;vRoot=finalWorld[3].xz;vRole=aRole;
  vS=c.xyz+vN*(aCard.w+0.3)*aCard.x*sc;                         // the card on the crown surface: one shadow per card
  float t=0.5;
  #ifdef INSTANCES
  t=aTint;
  #endif
  vTint=t;gl_Position=viewProjection*vec4(w,1.0);}
