precision highp float;varying vec2 vUV;uniform sampler2D textureSampler;uniform vec2 uTexel,uHalf,uTan;uniform float uFocus,uBand,uNear,uK,uMaxPx,uN;
// the miniature field's depth of field (decision 0020; docs/plans/active/gameplay-dof.md), its blur, at half
// resolution: one pass after Dennis Gustafsson's single-pass bokeh (each tap counted where its own blur reaches this
// pixel, over a full-resolution pixel either side: the taps are a half-resolution texel apart), uN taps on a Vogel
// spiral out to the largest blur (a tap that lands back on this pixel skipped), so blurs of any size are sampled. It reads the scene at
// half resolution (textureSampler: dofdown.frag), each read at a pixel's centre and weighed at that centre's distance
// (uHalf its texel; uTexel the full resolution's, the unit of the blur); the finishing pass (uber.frag, DOF) puts the
// sharp scene back where the blur is under a pixel. Depths are along the view axis. A farther tap's blur is clamped
// to twice this pixel's, so a sharp crown never bleeds over the ground behind it. Alpha out: the largest blur that a
// tap nearer than the focus, and clearly nearer than this pixel (not the same ground a little further down the
// screen), spreads over it: only such a tap can blur a sharp pixel. For the composite
#include<dofcoc>
void main(){
  vec4 c0=texture2D(textureSampler,vUV);float z0=viewZ(c0.a,vUV),cs=cocZ(z0),tot=1.0,ang=0.0,spill=0.0;vec3 col=c0.rgb;
  for(int i=0;i<64;i++){if(float(i)>=uN)break;
    float r=uMaxPx*sqrt((float(i)+0.5)/uN);vec2 uv=(floor((vUV+vec2(cos(ang),sin(ang))*uTexel*r)/uHalf)+0.5)*uHalf;
    r=length((uv-vUV)/uTexel);ang+=2.39996323;if(r<0.5)continue;   // snapped back onto this pixel
    vec4 s=texture2D(textureSampler,uv);
    float z=viewZ(s.a,uv),ss=cocZ(z);if(z>z0)ss=min(ss,cs*2.0);
    float w=smoothstep(r-1.0,r+1.0,ss);if(z<uFocus&&z<z0*0.97)spill=max(spill,w*ss);
    col+=mix(col/tot,s.rgb,w);tot+=1.0;}
  gl_FragColor=vec4(col/tot,spill);}
