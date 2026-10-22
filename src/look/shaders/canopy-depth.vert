precision highp float;attribute vec3 position;attribute vec2 aCorner;attribute vec4 aCard;
#include<instancesDeclaration>
uniform mat4 viewProjection;uniform mat4 view;
#ifdef LEAF_LOSS
uniform float uSeason;
#endif
varying float vD;varying vec2 vUV;varying float vDrop;
#include<cards>
void main(){
  #include<instancesVertex>
  vec4 c=finalWorld*vec4(position,1.0);
  float tuft=1.0;
  #ifdef LEAF_LOSS
  tuft=tuftScale(uSeason);
  #endif
  vec4 p=viewProjection*vec4(c.xyz+cardOffset(aCard,aCorner,view,length(finalWorld[0].xyz)*tuft),1.0);   // the card, facing the sun
  vUV=cardUV(aCard,aCorner);vDrop=cardDrop(aCard,c.xyz);
  vD=p.z/p.w*0.5+0.5;gl_Position=p;}
