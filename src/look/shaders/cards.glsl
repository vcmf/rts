// The leaf cards (src/look/canopy.ts), shared by the cards drawn and their shadow: a card corner offset in view
// space around the card centre (sc: the instance scale), and the card cell of the leaf atlas, inset so that the
// filter never reads the neighbouring clump
// cardAxes: where the card corner x and y (the atlas u and v) point in the world, the card turned by its rotation
void cardAxes(vec4 card,mat4 view,out vec3 tu,out vec3 tv){
  vec3 R=vec3(view[0][0],view[1][0],view[2][0]),U=vec3(view[0][1],view[1][1],view[2][1]);float a=card.y;
  tu=R*cos(a)+U*sin(a);tv=-R*sin(a)+U*cos(a);}
vec3 cardOffset(vec4 card,vec2 corner,mat4 view,float sc){
  vec3 tu,tv;cardAxes(card,view,tu,tv);
  return (tu*corner.x+tv*corner.y)*card.x*sc;}
vec2 cardUV(vec4 card,vec2 corner){return (corner*0.47+0.5+vec2(floor(card.z/2.0),mod(card.z,2.0)))*0.5;}
// LEAF_LOSS (docs/plans/active/tree-generator.md): the share of a deciduous crown's cards gone by the season (late
// autumn to winter), a few tufts left clinging; and each card's own draw against it, from its rotation (uniform
// random) and its place, so the cards drop one by one, not by screen pixels
float leafLoss(float season){return smoothstep(LOSS_FROM,LOSS_TO,season)*LOSS_MOST;}   // LEAF_LOSS in src/look/canopy.ts
float tuftScale(float season){return mix(1.0,0.5,leafLoss(season)/LOSS_MOST);}   // the cards left, smaller as the crown thins
float cardDrop(vec4 card,vec3 centre){return fract(card.y*0.1591549+0.37*fract(dot(centre,vec3(0.071,0.113,0.097))));}
