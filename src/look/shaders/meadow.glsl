// The meadow (docs/plans/done/l5c-meadow.md): a hash of a world cell (no sine: stable over the whole map) and
// the clump field, cells of a few metres that share the height, lean and shade of their clumps, so the meadow is a
// patchwork. Shared by the grass (meadow.vert) and the ground under it (terrain.frag), so the two agree.
float mHash(vec2 p){vec3 q=fract(vec3(p.xyx)*vec3(0.1031,0.1030,0.0973));q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float mValue(vec2 g){vec2 i=floor(g),f=fract(g);f=f*f*(3.0-2.0*f);
  return mix(mix(mHash(i),mHash(i+vec2(1.0,0.0)),f.x),mix(mHash(i+vec2(0.0,1.0)),mHash(i+vec2(1.0,1.0)),f.x),f.y);}
// 0..1: lush clumps near 1, thin grass and a bare spot now and then near 0
float clumpAt(vec2 xz){return clamp(mValue(xz/3.2)*0.65+mValue(xz/1.1+17.0)*0.35,0.0,1.0);}
// the grass's flow (?grass=flow, docs/plans/active/grass-flow.md): xy the way it leans on the ground (a unit vector),
// z how far it lies over (0 upright, 1 combed flat). Slow and swirling (two octaves, domain-warped), patches tens of
// metres across (a patch combed one way over 30-60 m, as the references), shared by the ground's pattern (macro.glsl) and the clumps (meadow.vert)
vec3 flowAt(vec2 xz){
  vec2 q=xz/70.0+(vec2(mValue(xz/120.0),mValue(xz/120.0+19.0))-0.5)*0.9;
  float a=(mValue(q)*0.8+mValue(q*2.1+5.0)*0.2)*7.5;
  return vec3(cos(a),sin(a),smoothstep(0.2,0.8,mValue(xz/19.0+31.0)));}
