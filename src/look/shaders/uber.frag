precision highp float;varying vec2 vUV;uniform sampler2D textureSampler,uGrain;uniform vec2 uRes;uniform float uGrainOn,uBloom,uGrade,uRenderScale;
// the mood's vignette (src/look/mood.ts; its grade is in the painted materials: gradeOf, painter.glsl)
uniform vec3 uVignette,uSplitHi;uniform float uGradeSat,uTopAmt;
vec3 shoulder(vec3 c){float m=max(c.r,max(c.g,c.b));if(m<=0.8)return c;float mm=0.8+0.2*(1.0-exp(-(m-0.8)/0.2));return c*(mm/m);}
float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
#ifdef DOF
// the depth of field's composite (decision 0024; dof.frag): textureSampler is the half-resolution blur and uSharp the
// scene; the sharp scene where this pixel's blur is under a pixel (the blur not read), the blur where it passes two.
// uHalfUV maps the screen to the blur (its size is the scene's halved, rounded down). The bloom gathers from the blur
uniform sampler2D uSharp;uniform vec2 uTan,uHalfUV;uniform float uFocus,uBand,uK,uMaxPx;
#include<dofcoc>
vec3 base(){vec4 s=texture2D(uSharp,vUV);float w=smoothstep(0.5,2.0,coc(s.a,vUV));return w>0.0?mix(s.rgb,texture2D(textureSampler,vUV*uHalfUV).rgb,w):s.rgb;}
#define BLOOM_UV(uv) ((uv)*uHalfUV)
#else
vec3 base(){return texture2D(textureSampler,vUV).rgb;}
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