precision highp float;attribute vec3 position;attribute vec4 aRoot;
#include<instancesDeclaration>
// the buildings' bounce (src/look/building-light.ts): a quad per instance on its texel of an N × 1 target (aRoot: its
// root's x, y, z and its texel), the root to the fragment
uniform float uN;varying vec3 vRootW;
void main(){
  #include<instancesVertex>
  vRootW=aRoot.xyz;
  gl_Position=vec4(((aRoot.w+0.5)/uN)*2.0-1.0+position.x/uN,position.y,0.0,1.0);}
