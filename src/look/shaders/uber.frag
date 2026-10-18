precision highp float;varying vec2 vUV;uniform sampler2D textureSampler,uGrain;uniform vec2 uRes;uniform float uGrainOn,uBloom,uGrade,uRenderScale;
// the mood's vignette (src/look/mood.ts; its grade is in the painted materials: gradeOf, painter.glsl)
uniform vec3 uVignette,uSplitHi;uniform float uGradeSat,uTopAmt;
// ?nanmark: a repaired pixel shows magenta, so the material that writes it can be found (docs/plans/done/nan-guard.md)
#ifdef NANMARK
#define MARK(c) vec3(1.0,0.0,1.0)
#else
#define MARK(c) (c)
#endif
vec3 shoulder(vec3 c){float m=max(c.r,max(c.g,c.b));if(m<=0.8)return c;float mm=0.8+0.2*(1.0-exp(-(m-0.8)/0.2));return c*(mm/m);}
float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
#ifdef DOF
// the depth of field's composite (decision 0024; dof.frag): textureSampler is the half-resolution blur and uSharp the
// scene; the sharp scene where this pixel's blur is under a pixel (the blur not read), the blur where it passes two.
// uHalfUV maps the screen to the blur (its size is the scene's halved, rounded down). The bloom gathers from the blur
uniform sampler2D uSharp;uniform vec2 uHalfUV,uHalfTexel,uDofPaint;
#include<dofcoc>
// (a sharp pixel that is not a finite number, or on the 8-bit target the alpha code 0 that stores one, takes the blur,
// which dofdown cleaned: docs/plans/done/nan-guard.md)
vec3 base(){vec4 s=texture2D(uSharp,vUV);if(!okPx(s))return MARK(texture2D(textureSampler,vUV*uHalfUV).rgb);
  // the far blur by this pixel's own circle, the near layer by the coverage it spread here (the blur's alpha: dof.frag)
  vec2 hu=vUV*uHalfUV;vec4 b=texture2D(textureSampler,hu);float cf=coc(s.a,vUV),fw=smoothstep(0.5,2.0,cf),w=max(fw,b.a);
  if(isUnit(s.a))w=min(w,0.5);   // (a unit's own pixel: a blurred crown over it at half coverage at most, decision 0040)
  if(w<=0.0)return s.rgb;
  // the postfilter: four bilinear taps half a texel off on the diagonals, a 3 x 3 tent over the half-resolution blur
  // (its spiral noise and flicker smoothed, without temporal anti-aliasing)
  vec2 o=0.5*uHalfTexel;b=0.25*(texture2D(textureSampler,hu+o)+texture2D(textureSampler,hu-o)+texture2D(textureSampler,hu+vec2(o.x,-o.y))+texture2D(textureSampler,hu+vec2(-o.x,o.y)));
  // the painted look: the far blur toward the haze by its size (lighter and greyer, as distance in a painting), the
  // near layer darker and cooler by its coverage (a foreground framing the scene)
  float l=dot(b.rgb,vec3(0.2126,0.7152,0.0722));
  b.rgb=mix(b.rgb,mix(vec3(l),b.rgb,0.55)*0.9+0.1,uDofPaint.x*fw*clamp(cf/max(uMaxPx,1.0),0.0,1.0));
  b.rgb*=mix(vec3(1.0),vec3(0.80,0.85,0.94),uDofPaint.y*b.a);
  return mix(s.rgb,b.rgb,w);}
#define BLOOM_UV(uv) ((uv)*uHalfUV)
#else
// (a pixel that is not a finite number takes its neighbours' mean: docs/plans/done/nan-guard.md; the default 8-bit
// target cannot hold one, the half floats of ?rt16 and ?nanmark can)
bool ok3(vec3 s){return all(lessThan(abs(s),vec3(65504.0)));}
vec3 base(){vec3 s=texture2D(textureSampler,vUV).rgb;if(ok3(s))return s;
  vec3 m=vec3(0.0);float n=0.0;
  for(int i=0;i<8;i++){float a=float(i)*0.7854;vec3 t=texture2D(textureSampler,vUV+vec2(cos(a),sin(a))*2.0/uRes).rgb;if(ok3(t)){m+=t;n+=1.0;}}
  return MARK(n>0.0?m/n:vec3(0.0));}
#define BLOOM_UV(uv) (uv)
#endif
void main(){vec3 c=base();
  // fused cheap bloom: highlights gathered on two rings. The scene comes graded (gradeOf, painter.glsl), so the
  // grade's highlight tint (uSplitHi) is taken off each tap before the per-channel threshold and put back on the
  // bloom, with the grade's saturation and its haze toward the top, which covered the bloom when the grade was here:
  // it gathers as from the ungraded scene. A per-channel threshold on the graded scene amplifies the tint (winter's
  // snow turned amber); a threshold on value changed the ground's bloom more (docs/plans/done/lc1b-coats.md). A
  // unit blooms a little cool and weak: graded at units.grade only, then put back at its value and clamped at 1
  // (airOf), it is divided by more of the tint than it has
  if(uBloom>0.0){vec3 b=vec3(0.0);vec3 hi=mix(vec3(1.0),uSplitHi,uGrade);
    for(int i=0;i<12;i++){float a=float(i)*0.5236+(i<6?0.0:0.26);float r=(i<6?6.0:16.0)*uRes.y/1080.0;
      vec3 s=texture2D(textureSampler,BLOOM_UV(vUV+vec2(cos(a),sin(a))*r/uRes)).rgb;b+=max(s-0.70*hi,0.0)*(i<6?1.0:0.6);}   // = max(s/hi-0.70,0)*hi
    b/=hi;b=mix(vec3(dot(b,vec3(0.2126,0.7152,0.0722))),b,mix(1.0,uGradeSat,uGrade));
    c+=b*hi*0.11*uBloom*(1.0-smoothstep(0.60,1.0,vUV.y)*uTopAmt*uGrade);}
  c=shoulder(c);
  vec2 q=(vUV-0.5)*vec2(uRes.x/uRes.y,1.0);c=mix(c,c*uVignette,smoothstep(0.45,1.05,length(q))*0.55);
  c*=1.0+(texture2D(uGrain,gl_FragCoord.xy/(512.0*uRenderScale)).r-0.5)*0.06*uGrainOn;     // static paper, fixed on the screen whatever the render scale
  c+=(h(gl_FragCoord.xy)+h(gl_FragCoord.yx+17.3)-1.0)/255.0;                 // dither against banding in mist & vignette
  gl_FragColor=vec4(c,1.0);}