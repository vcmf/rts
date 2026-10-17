// The meadow (docs/plans/done/l5c-meadow.md): a hash of a world cell (no sine: stable over the whole map) and
// the clump field, cells of a few metres that share the height, lean and shade of their clumps, so the meadow is a
// patchwork. Shared by the grass (meadow.vert) and the ground under it (terrain.frag), so the two agree.
float mHash(vec2 p){vec3 q=fract(vec3(p.xyx)*vec3(0.1031,0.1030,0.0973));q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float mValue(vec2 g){vec2 i=floor(g),f=fract(g);f=f*f*(3.0-2.0*f);
  return mix(mix(mHash(i),mHash(i+vec2(1.0,0.0)),f.x),mix(mHash(i+vec2(0.0,1.0)),mHash(i+vec2(1.0,1.0)),f.x),f.y);}
// 0..1: lush clumps near 1, thin grass and a bare spot now and then near 0
// the seasons' height factors (uSeason 0 summer to 3 winter), shared by the clumps (meadow.vert) and the dark ground
// under them (shore.glsl's meadowUnder), so the two follow each other: the grass lower under the snow; a crop by its
// class k (cover.ts: 6 wheat, 7 the green crop, 8 stubble): wheat and stubble ploughed under in late autumn, the green
// crop lower under the snow
float grassSeasonK(float s){return mix(1.0,0.45,smoothstep(2.5,3.0,s));}
float cropSeasonK(float k,float s){return k>6.5&&k<7.5?mix(1.0,0.5,smoothstep(2.5,3.0,s)):1.0-smoothstep(1.55,1.95,s);}
float clumpAt(vec2 xz){return clamp(mValue(xz/3.2)*0.65+mValue(xz/1.1+17.0)*0.35,0.0,1.0);}
#ifdef GRASS_FLOW
// the grass's flow (?grass=flow, docs/plans/active/grass-flow.md): xy the way it leans on the ground (a unit vector),
// z how far it lies over (0 upright, 1 combed flat). Slow and swirling (two octaves, domain-warped). Its numbers are
// FLOW in src/look/flow.ts, given as defines (the same field the textures hold, so the two cannot drift apart)
vec3 flowAt(vec2 xz){
  vec2 q=xz/FLOW_SCALE+(vec2(mValue(xz/FLOW_WARP),mValue(xz/FLOW_WARP+19.0))-0.5)*FLOW_WARP_AMT;
  float a=(mValue(q)*(1.0-FLOW_OCT2)+mValue(q*FLOW_OCT2_K+5.0)*FLOW_OCT2)*FLOW_TURNS;
  return vec3(cos(a),sin(a),smoothstep(FLOW_LIE_LO,FLOW_LIE_HI,mValue(xz/FLOW_LIE_SCALE+31.0)));}
// the flow as the textures hold it (src/look/flow.ts: made once from the field above, 2 m texels over the tile), one
// fetch; the field itself beyond the tile (the far ring's bake)
uniform sampler2D uFlow;
vec3 flowTex(vec2 xz){
  if(max(abs(xz.x),abs(xz.y))>TILE_HALF-2.0)return flowAt(xz);
  vec4 t=texture2D(uFlow,(xz+TILE_HALF)/TILE_W);vec2 d=t.rg*2.0-1.0;
  return vec3(d/max(length(d),1e-4),t.b);}
#endif
