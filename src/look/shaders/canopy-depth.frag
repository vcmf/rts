#extension GL_OES_standard_derivatives : enable
precision highp float;varying float vD;varying vec2 vUV;uniform sampler2D uLeaf;uniform float uLeafSize;
void main(){
  vec2 d=vUV*uLeafSize;float lod=max(0.0,0.5*log2(max(dot(dFdx(d),dFdx(d)),dot(dFdy(d),dFdy(d)))));
  if(texture2D(uLeaf,vUV).a*(1.0+lod*0.6)<0.5)discard;   // the same coverage as the cards drawn
  gl_FragColor=vec4(vD,vD,vD,1.0);}
