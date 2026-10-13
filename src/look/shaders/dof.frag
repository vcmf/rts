precision highp float;varying vec2 vUV;uniform sampler2D textureSampler;uniform vec2 uTexel,uTan;uniform float uFocus,uBand,uK,uMaxPx;
// the miniature field's depth of field (decision 0020; docs/plans/active/gameplay-dof.md): one pass after Dennis
// Gustafsson's single-pass bokeh (each tap counted where its own blur reaches this pixel), its 64 taps on a Vogel
// spiral out to the largest blur, so blurs of any size are sampled. The circle of confusion is the thin lens's
// |1 - focus/z| past a sharp band, z the depth along the view axis: the materials write the distance from the camera
// to alpha (km), and this pixel's ray (uTan: the half-angles' tangents) turns it into depth. A farther tap's blur is
// clamped to twice this pixel's, so a sharp crown never bleeds over the ground behind it
float coc(float a,vec2 uv){float z=max(a*1000.0/length(vec3((uv*2.0-1.0)*uTan,1.0)),0.01);return clamp((abs(1.0-uFocus/z)-uBand)*uK,0.0,1.0)*uMaxPx;}
void main(){
  vec4 c0=texture2D(textureSampler,vUV);float cs=coc(c0.a,vUV);vec3 col=c0.rgb;float tot=1.0,ang=0.0;
  for(int i=0;i<64;i++){
    float r=uMaxPx*sqrt((float(i)+0.5)/64.0);vec2 uv=vUV+vec2(cos(ang),sin(ang))*uTexel*r;
    vec4 s=texture2D(textureSampler,uv);
    float ss=coc(s.a,uv);if(s.a>c0.a)ss=min(ss,cs*2.0);
    col+=mix(col/tot,s.rgb,smoothstep(r-0.5,r+0.5,ss));tot+=1.0;ang+=2.39996323;}
  gl_FragColor=vec4(col/tot,c0.a);}
