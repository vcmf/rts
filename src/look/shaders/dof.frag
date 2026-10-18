precision highp float;varying vec2 vUV;uniform sampler2D textureSampler;uniform vec2 uTexel,uHalf;uniform float uN,uNN;
// the depth of field's blur at half resolution (docs/plans/active/dof-v2.md). textureSampler: the scene at half
// resolution (dofdown.frag), each read at a pixel's centre (uHalf its texel; uTexel the full resolution's, the unit of
// the blur).
// FAR, after Dennis Gustafsson's single-pass bokeh: uN taps on a Vogel spiral out to the largest blur, each counted where
// its own blur reaches this pixel (over a full-resolution pixel either side: the taps are a half-resolution texel apart),
// a tap that lands back on this pixel or off the screen skipped. A farther tap's blur is clamped to twice this pixel's,
// so a sharp crown never bleeds over the ground behind it. A pixel with no far blur skips the taps.
// NEAR, after Jimenez 2014: in the bottom band of the frame, where a near blur can reach (its own band and the largest
// near blur above it), uNN taps (by the largest near blur, as the far taps) out to the largest near blur, each counted where its own near
// blur reaches this pixel, weighed by its blur's area (a thin near edge does not swamp the colour), their coverage the
// share that reaches: the near layer, premultiplied, over the far result. Over a unit its coverage is held to a half
// (a formation shows through a blurred crown: AGENTS.md, readable first). The composite (uber.frag) takes the
// coverage in alpha, so the near blur spreads over pixels that are sharp themselves
#include<dofcoc>
void main(){
  vec4 c0=texture2D(textureSampler,vUV);float s0=lensS(c0.a),cs=cocS(s0),tot=1.0,ang=0.0;vec3 col=c0.rgb;
  if(cs>=0.5)for(int i=0;i<64;i++){if(float(i)>=uN)break;
    float r=uMaxPx*sqrt((float(i)+0.5)/uN);vec2 uv=(floor((vUV+vec2(cos(ang),sin(ang))*uTexel*r)/uHalf)+0.5)*uHalf;
    r=length((uv-vUV)/uTexel);ang+=2.39996323;if(r<0.5||any(lessThan(uv,vec2(0.0)))||any(greaterThan(uv,vec2(1.0))))continue;   // on this pixel, or off the screen
    vec4 s=texture2D(textureSampler,uv);
    float sz=lensS(s.a),ss=cocS(sz);if(sz>s0)ss=min(ss,cs*2.0);
    col+=mix(col/tot,s.rgb,smoothstep(r-1.0,r+1.0,ss));tot+=1.0;}
  col/=tot;
  float tn=vUV.y<uNScreen+uNMaxPx*uTexel.y?uNMaxPx:0.0,na=0.0;
  if(tn>=0.5){vec3 nc=vec3(0.0);float nw=0.0,reach=0.0;ang=0.0;
    float c0n=cocN(s0,vUV);if(c0n>=0.5){float w=1.0/max(c0n*c0n,1.0);nc+=c0.rgb*w;nw+=w;reach+=1.0;}
    for(int i=0;i<24;i++){if(float(i)>=uNN)break;
      float r=tn*sqrt((float(i)+0.5)/uNN);vec2 uv=(floor((vUV+vec2(cos(ang),sin(ang))*uTexel*r)/uHalf)+0.5)*uHalf;
      r=length((uv-vUV)/uTexel);ang+=2.39996323;if(any(lessThan(uv,vec2(0.0)))||any(greaterThan(uv,vec2(1.0))))continue;
      vec4 s=texture2D(textureSampler,uv);float cn=cocN(lensS(s.a),uv),k=smoothstep(r-1.0,r+1.0,cn);
      if(k>0.0){float w=k/max(cn*cn,1.0);nc+=s.rgb*w;nw+=w;reach+=k;}}
    na=smoothstep(0.0,0.6,reach/(uNN+1.0));
    if(isUnit(c0.a))na=min(na,0.5);
    // (where this pixel has no far blur, the near layer alone: the composite lays it over the sharp scene by its
    // coverage, so the sharp pixels round a blurred crown take none of the half-resolution colour)
    if(nw>0.0)col=cs>=0.5?mix(col,nc/nw,na):nc/nw;}
  gl_FragColor=vec4(col,na);}
