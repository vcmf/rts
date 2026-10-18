// the depth of field lens (dof.frag, dofdown.frag, and the composite in uber.frag; docs/plans/active/dof-v2.md). The
// materials write the lens term s = 1 - focus/z in alpha (painter.glsl depthA, 8 bits over -1 to 0.5); a = 1 is a unit,
// sharp. cocS: the circle of confusion in pixels at full resolution, past a sharp band beyond the focus, none nearer
float lensS(float a){return a>254.5/255.0?0.0:a*(255.0/254.0)*1.5-1.0;}
float cocS(float s){return clamp((s-uBand)*uK,0.0,1.0)*uMaxPx;}
float coc(float a,vec2 uv){return cocS(lensS(a));}
