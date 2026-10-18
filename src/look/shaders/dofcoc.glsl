// the depth of field lens (dof.frag, dofdown.frag and the composite in uber.frag; docs/plans/done/dof-v2.md). The
// materials write the lens term s = 1 - focus/z in alpha (painter.glsl depthA: the codes 1 to 254 over -1 to 0.5); 0
// is a pixel that is not a number (isBad); 255 the clear, the farthest. cocS: the far circle of confusion in pixels at
// full resolution, past a sharp band beyond the focus. cocN: the
// near one, nearer than the focus past its own band, in the bottom uNScreen of the frame only (the formations in the
// middle never take it), uv the pixel (0 at the bottom)
uniform float uBand,uK,uMaxPx,uNBand,uNK,uNMaxPx,uNScreen;
bool isBad(float a){return a<0.5/255.0;}
// a pixel the depth of field can use: finite (the half floats of ?rt16) and not the code 0 (the 8-bit target's not a
// number: painter.glsl lensOut). The test is one no compiler folds away, as it may x == x
bool okPx(vec4 s){return all(lessThan(abs(s),vec4(65504.0)))&&!isBad(s.a);}
float lensS(float a){return clamp((a*255.0-1.0)/253.0,0.0,1.0)*1.5-1.0;}
float cocS(float s){return clamp((s-uBand)*uK,0.0,1.0)*uMaxPx;}
float cocN(float s,vec2 uv){return clamp((-s-uNBand)*uNK,0.0,1.0)*uNMaxPx*(1.0-smoothstep(0.0,uNScreen,uv.y));}
float coc(float a,vec2 uv){return cocS(lensS(a));}
