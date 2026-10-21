precision highp float;varying vec3 vW,vN;
#include<painter>
#include<shore>
// the static light at a texel of a building (src/look/building-light.ts), what building.frag read per pixel: R the sun's
// cast shadow off the surface (shadowAtRaw, 0 lit to 1 shadowed: the panel's switch the runtime's), G the light map's sky occlusion, B its
// mist mask, A its sun stored at 1/255 and up (an unwritten texel, 0, then told apart: the dilation)
void main(){
  vec3 N=normalize(vN);vec4 lm=LM(vW);
  gl_FragColor=vec4(shadowAtRaw(vW+N*0.15,N),lm.g,lm.b,(1.0+lm.r*254.0)/255.0);}
