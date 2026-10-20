precision highp float;attribute vec3 position;attribute vec3 normal;attribute vec2 uv;attribute float aRole;
#include<instancesDeclaration>
uniform mat4 viewProjection;
// a building (src/look/buildings.ts): its world position and normal, its texture's UV (the value detail), its role (the
// palette's region: building.frag), its height above its base and its base's ground position (the ground's bounce)
varying vec3 vW,vN;varying vec2 vUV;varying float vRole,vH;varying vec2 vRoot;
#ifdef BLD_BAKED
// its static light baked (src/look/building-light.ts): its texel in the atlas (its light UVs in its instance's tile),
// its instance's texel of the bounce (the tile's column and row: tileOf)
attribute vec2 aUV2;attribute vec4 aTile;varying vec2 vLUV;varying float vTileI;
#endif
void main(){
  #include<instancesVertex>
  vec4 w=finalWorld*vec4(position,1.0);vH=w.y-finalWorld[3].y;vRoot=finalWorld[3].xz;
  vN=normalize(mat3(finalWorld)*normal);vW=w.xyz;vUV=uv;vRole=aRole;
  #ifdef BLD_BAKED
  vLUV=aTile.xy+aUV2*aTile.zw;vTileI=floor(aTile.x*BLD_COLS)+floor(aTile.y*BLD_ROWS)*BLD_COLS;
  #endif
  gl_Position=viewProjection*w;}
