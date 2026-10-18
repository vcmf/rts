// the depth of field lens (dof.frag, dofdown.frag, doftile.frag and the composite in uber.frag; docs/plans/active/dof-v2.md).
// The materials write the lens term s = 1 - focus/z in alpha (painter.glsl depthA, 8 bits over -1 to 0.5); a = 1 is a unit,
// sharp. cocS: the far circle of confusion in pixels at full resolution, past a sharp band beyond the focus. cocN: the
// near one, nearer than the focus past its own band, in the bottom uNScreen of the frame only (the formations in the
// middle never take it), uv the pixel (0 at the bottom)
uniform float uBand,uK,uMaxPx,uNBand,uNK,uNMaxPx,uNScreen;
bool isUnit(float a){return a>254.5/255.0;}
float lensS(float a){return isUnit(a)?0.0:a*(255.0/254.0)*1.5-1.0;}
float cocS(float s){return clamp((s-uBand)*uK,0.0,1.0)*uMaxPx;}
float cocN(float s,vec2 uv){return clamp((-s-uNBand)*uNK,0.0,1.0)*uNMaxPx*(1.0-smoothstep(0.0,uNScreen,uv.y));}
float coc(float a,vec2 uv){return cocS(lensS(a));}
