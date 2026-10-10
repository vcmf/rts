precision highp float;attribute vec3 position;attribute vec3 normal;attribute float aRole;attribute vec3 aCrown;
#include<instancesDeclaration>
uniform mat4 viewProjection;uniform vec3 uCamPos;
#ifdef INSTANCES
attribute float aTint;
#endif
varying vec3 vW,vN;varying float vRole,vTint,vOcc,vH;
void main(){
  #include<instancesVertex>
  vec3 pp=position;
  #ifdef GRASSY
  pp*=1.0-smoothstep(120.0,165.0,length(finalWorld[3].xyz-uCamPos));
  #endif
  vec4 w=finalWorld*vec4(pp,1.0);vH=w.y-finalWorld[3].y;
  vec3 n=normal;
  #ifdef GRASSY
  n=normalize(mix(n,vec3(0.0,1.0,0.0),0.7));                 // grass shades like the ground it grows from
  vOcc=clamp(0.45+position.y*0.9,0.0,1.0);
  #else
  if(aRole<1.5){n=normalize(mix(n,normalize(position-aCrown),0.75));   // soft, rounded crowns
    vOcc=clamp(0.62+(position.y-aCrown.y)*0.55+length(position.xz-aCrown.xz)*0.25,0.0,1.0);}
  else vOcc=1.0;
  #endif
  vN=normalize(mat3(finalWorld)*n);vW=w.xyz;vRole=aRole;
  float t=0.5;
  #ifdef INSTANCES
  t=aTint;
  #endif
  vTint=t;gl_Position=viewProjection*w;}