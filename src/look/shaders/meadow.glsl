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
