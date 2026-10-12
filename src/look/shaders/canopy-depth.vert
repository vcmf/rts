precision highp float;attribute vec3 position;attribute vec2 aCorner;attribute vec4 aCard;
#include<instancesDeclaration>
uniform mat4 viewProjection;uniform mat4 view;varying float vD;varying vec2 vUV;
void main(){
  #include<instancesVertex>
  vec4 c=finalWorld*vec4(position,1.0);
  float sc=length(finalWorld[0].xyz);
  vec3 R=vec3(view[0][0],view[1][0],view[2][0]),U=vec3(view[0][1],view[1][1],view[2][1]);
  float a=aCard.y;vec2 k=vec2(cos(a)*aCorner.x-sin(a)*aCorner.y,sin(a)*aCorner.x+cos(a)*aCorner.y);
  vec4 p=viewProjection*vec4(c.xyz+(R*k.x+U*k.y)*aCard.x*sc,1.0);   // the card, facing the sun
  vUV=(aCorner*0.5+0.5+vec2(floor(aCard.z/2.0),mod(aCard.z,2.0)))*0.5;
  vD=p.z/p.w*0.5+0.5;gl_Position=p;}
