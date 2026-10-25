precision highp float;varying float vD;varying vec2 vUV;varying float vDrop;uniform sampler2D uLeaf;uniform float uSeason;
#include<cards>
void main(){
  #ifdef LEAF_LOSS
  if(vDrop<leafLoss(uSeason))discard;   // the crown thinned by the season casts a thinner shadow
  #endif
  // a plain cut, two mips finer than the sun view asks: the shadow keeps the gaps between the leaves (the cards
  // drawn boost coverage with distance instead, for the screen)
  if(texture2D(uLeaf,vUV,-2.0).a<0.5)discard;
  gl_FragColor=vec4(vD,vD,vD,1.0);}
