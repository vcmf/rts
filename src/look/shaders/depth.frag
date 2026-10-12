precision highp float;varying float vD;
#ifdef TRUNK_ONLY
varying float vRole;
#endif
void main(){
  #ifdef TRUNK_ONLY
  if(vRole<1.5)discard;
  #endif
  gl_FragColor=vec4(vD,vD,vD,1.0);}