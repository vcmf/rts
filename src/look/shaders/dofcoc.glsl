// the depth of field's lens (dof.frag, and the composite in uber.frag): a the distance the materials write to alpha
// (km), uv the pixel. viewZ: the depth along the view axis (uTan: the half-angles' tangents). cocZ: the circle of
// confusion in pixels at full resolution, the thin lens's 1 - focus/z past a sharp band beyond the focus, and
// 1 - z/focus past a wider one nearer (the formations nearest the player keep their edges: the readability guard)
float viewZ(float a,vec2 uv){return max(a*1000.0/length(vec3((uv*2.0-1.0)*uTan,1.0)),0.01);}
float cocZ(float z){return clamp((z<uFocus?1.0-z/uFocus-uNear:1.0-uFocus/z-uBand)*uK,0.0,1.0)*uMaxPx;}
float coc(float a,vec2 uv){return cocZ(viewZ(a,uv));}
