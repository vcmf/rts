precision highp float;attribute vec3 position;attribute vec3 normal;attribute vec2 aUV2;attribute vec3 aTile;
#include<instancesDeclaration>
// the buildings' light bake (src/look/building-light.ts): each instance drawn in its tile of the atlas (aTile: the tile's
// offset, its instance; BLD_TILE its size), at its light UVs (aUV2), carrying its world position and normal to the bake
// (as faces, and as points and lines: a point a texel)
varying vec3 vW,vN;
void main(){
  #include<instancesVertex>
  vec4 w=finalWorld*vec4(position,1.0);vW=w.xyz;vN=normalize(mat3(finalWorld)*normal);
  gl_Position=vec4((aTile.xy+aUV2*BLD_TILE)*2.0-1.0,0.0,1.0);gl_PointSize=1.0;}
