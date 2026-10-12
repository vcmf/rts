precision highp float;attribute vec3 position;
#include<instancesDeclaration>
uniform mat4 viewProjection;varying float vD;
#ifdef TRUNK_ONLY
attribute float aRole;varying float vRole;
#endif
void main(){
  #include<instancesVertex>
  vec4 p=viewProjection*finalWorld*vec4(position,1.0);vD=p.z/p.w*0.5+0.5;gl_Position=p;
  #ifdef TRUNK_ONLY
  vRole=aRole;
  #endif
}