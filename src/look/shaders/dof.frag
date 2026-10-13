precision highp float;varying vec2 vUV;uniform sampler2D textureSampler;uniform vec2 uTexel,uHalf,uTan;uniform float uFocus,uBand,uK,uMaxPx,uN;
// the miniature field's depth of field (decision 0020; docs/plans/active/gameplay-dof.md), its blur, at half
// resolution: one pass after Dennis Gustafsson's single-pass bokeh (each tap counted where its own blur reaches this
// pixel, over a full-resolution pixel either side: the taps are a half-resolution texel apart), uN taps on a Vogel
// spiral out to the largest blur (a tap that lands back on this pixel or off the screen skipped: the clamped edge
// row would be counted again and again), so blurs of any size are sampled. It
// reads the scene at half resolution (textureSampler: dofdown.frag), each read at a pixel's centre and weighed at
// that centre's distance (uHalf its texel; uTexel the full resolution's, the unit of the blur); the finishing pass
// (uber.frag, DOF) puts the sharp scene back where this pixel's blur is under a pixel. Depths are along the view
// axis. A farther tap's blur is clamped to twice this pixel's, so a sharp crown never bleeds over the ground behind it.
// A sharp pixel skips the taps, exactly up to rounding (an odd frame size): only farther things blur (dofcoc.glsl), so a nearer tap is sharper than it,
// and a farther one is clamped to twice its blur, under a pixel; the composite draws the sharp scene there anyway
#include<dofcoc>
void main(){
  vec4 c0=texture2D(textureSampler,vUV);float z0=viewZ(c0.a,vUV),cs=cocZ(z0),tot=1.0,ang=0.0;vec3 col=c0.rgb;
  if(cs<0.5){gl_FragColor=vec4(col,1.0);return;}
  for(int i=0;i<64;i++){if(float(i)>=uN)break;
    float r=uMaxPx*sqrt((float(i)+0.5)/uN);vec2 uv=(floor((vUV+vec2(cos(ang),sin(ang))*uTexel*r)/uHalf)+0.5)*uHalf;
    r=length((uv-vUV)/uTexel);ang+=2.39996323;if(r<0.5||any(lessThan(uv,vec2(0.0)))||any(greaterThan(uv,vec2(1.0))))continue;   // on this pixel, or off the screen
    vec4 s=texture2D(textureSampler,uv);
    float z=viewZ(s.a,uv),ss=cocZ(z);if(z>z0)ss=min(ss,cs*2.0);
    col+=mix(col/tot,s.rgb,smoothstep(r-1.0,r+1.0,ss));tot+=1.0;}
  gl_FragColor=vec4(col/tot,1.0);}
