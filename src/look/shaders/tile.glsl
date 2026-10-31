// THE TILE'S PLACE (G3b, docs/plans/active/g3b-the-detail-follows.md): its centre in the world (src/look/tile.ts); its
// maps (the meadow, the bank normals, the water data, the macro bake, the flow, the occlusion, the reflections) read
// at tileUV, its edges' fades by tileEdge (the larger axis's distance from its centre)
uniform vec2 uTileO;
vec2 tileUV(vec2 xz){return (xz-uTileO+TILE_HALF)/TILE_W;}
float tileEdge(vec2 xz){vec2 d=abs(xz-uTileO);return max(d.x,d.y);}
