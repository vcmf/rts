// The leaf cards (src/look/canopy.ts), shared by the cards drawn and their shadow: a card corner offset in view
// space around the card centre (sc: the instance scale), and the card cell of the leaf atlas, inset so that the
// filter never reads the neighbouring clump
vec3 cardOffset(vec4 card,vec2 corner,mat4 view,float sc){
  vec3 R=vec3(view[0][0],view[1][0],view[2][0]),U=vec3(view[0][1],view[1][1],view[2][1]);
  float a=card.y;vec2 k=vec2(cos(a)*corner.x-sin(a)*corner.y,sin(a)*corner.x+cos(a)*corner.y);
  return (R*k.x+U*k.y)*card.x*sc;}
vec2 cardUV(vec4 card,vec2 corner){return (corner*0.47+0.5+vec2(floor(card.z/2.0),mod(card.z,2.0)))*0.5;}
