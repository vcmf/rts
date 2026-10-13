precision highp float;attribute vec3 position;attribute vec2 aCorner;attribute vec4 aCard;
#include<instancesDeclaration>
uniform mat4 viewProjection;uniform mat4 view;varying float vD;varying vec2 vUV;
#include<cards>
void main(){
  #include<instancesVertex>
  vec4 c=finalWorld*vec4(position,1.0);
  vec4 p=viewProjection*vec4(c.xyz+cardOffset(aCard,aCorner,view,length(finalWorld[0].xyz)),1.0);   // the card, facing the sun
  vUV=cardUV(aCard,aCorner);
  vD=p.z/p.w*0.5+0.5;gl_Position=p;}
