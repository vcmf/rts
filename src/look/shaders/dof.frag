precision highp float;varying vec2 vUV;uniform sampler2D textureSampler;uniform vec2 uTexel;uniform float uFocus,uBand,uK,uMaxPx,uStep;
// the miniature field's depth of field (decision 0020; docs/plans/active/gameplay-dof.md): one pass after Dennis
// Gustafsson's single-pass bokeh (a golden-angle spiral, each tap counted where its own blur reaches this pixel).
// The circle of confusion is the thin lens's |1 - focus/d| past a sharp band, d the view distance the materials write
// to alpha (km); a farther tap's blur is clamped to twice this pixel's, so a sharp crown never bleeds over the ground
// behind it. At most 64 taps: the spiral's step grows with the largest blur
float coc(float a){float d=max(a*1000.0,0.01);return clamp((abs(1.0-uFocus/d)-uBand)*uK,0.0,1.0)*uMaxPx;}
void main(){
  vec4 c0=texture2D(textureSampler,vUV);float cs=coc(c0.a);vec3 col=c0.rgb;float tot=1.0,r=uStep,ang=0.0;
  for(int i=0;i<64;i++){
    if(r>uMaxPx)break;
    vec4 s=texture2D(textureSampler,vUV+vec2(cos(ang),sin(ang))*uTexel*r);
    float ss=coc(s.a);if(s.a>c0.a)ss=min(ss,cs*2.0);
    col+=mix(col/tot,s.rgb,smoothstep(r-0.5,r+0.5,ss));tot+=1.0;ang+=2.39996323;r+=uStep/r;}
  gl_FragColor=vec4(col/tot,c0.a);}
