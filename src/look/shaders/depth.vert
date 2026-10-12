precision highp float;attribute vec3 position;
#include<instancesDeclaration>
uniform mat4 viewProjection;varying float vD;
void main(){
  #include<instancesVertex>
  vec4 p=viewProjection*finalWorld*vec4(position,1.0);vD=p.z/p.w*0.5+0.5;gl_Position=p;}