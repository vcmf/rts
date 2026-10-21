precision highp float;varying vec3 vRootW;
#include<painter>
#include<shore>
// the light the ground at a building's root bounces onto its walls (shore.glsl, bounceAt, at the root, no height: the
// runtime fades it with the height above the root, as bounceAt does)
void main(){gl_FragColor=vec4(bounceAt(vRootW.xz,vRootW.y,0.0,0.0),1.0);}
