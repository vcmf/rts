#extension GL_OES_standard_derivatives : enable
precision highp float;varying vec3 vW,vN;varying float vRiver;
#include<painter>
#include<waterdata>
#include<shore>
// THE BOUNCE MAP (LC5, docs/plans/active/lc5-ground-bounce.md): rendered top-down over the tile once the light map is
// baked, and again when the season is released. At each texel the light the ground around it sends back (LC4s
// bounceAt: its colour through the season and the earth, white where snow lies, times the sun and the light map),
// gathered over a 7 by 7 Gaussian of GB_STEP m taps (sigma GB_SIGMA m), so a point takes the light of the ground
// round it as well as its own (its own tap weighs most). No snow lie: the fields' furrows fade out past a 1.2 m
// pixel (snowLie), and a texel here is 1.6 m
void main(){
  macroDerivs(vW.xz);
  vec3 s=vec3(0.0);float w=0.0;
  for(int j=-3;j<=3;j++)for(int i=-3;i<=3;i++){
    vec2 o=vec2(float(i),float(j))*GB_STEP;float k=exp(-dot(o,o)/(2.0*GB_SIGMA*GB_SIGMA));
    s+=bounceAt(vW.xz+o,vW.y,0.0,0.0)*k;w+=k;}
  gl_FragColor=vec4(s/w,1.0);
}
