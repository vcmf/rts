precision highp float;varying vec2 vUV;uniform sampler2D textureSampler,uGrain;uniform vec2 uRes;uniform float uGrade,uGrainOn,uBloom;
// the mood's grade (src/look/mood.ts)
uniform vec3 uGreenTint,uSplitLo,uSplitHi,uLift,uTopHaze,uVignette;uniform float uGreenChroma,uGreenAmt,uGradeSat,uTopAmt;
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
  if(uBloom>0.0){vec3 b=vec3(0.0);                                  // fused cheap bloom: highlights gathered on two rings
    for(int i=0;i<12;i++){float a=float(i)*0.5236+(i<6?0.0:0.26);float r=(i<6?6.0:16.0)*uRes.y/1080.0;
      vec3 s=texture2D(textureSampler,BLOOM_UV(vUV+vec2(cos(a),sin(a))*r/uRes)).rgb;b+=max(s-vec3(0.70),0.0)*(i<6?1.0:0.6);}
    c+=b*0.11*uBloom;}
  if(uGrade>0.0){float l=dot(c,vec3(0.2126,0.7152,0.0722));
    float green=clamp((c.g-max(c.r,c.b))*3.0,0.0,1.0);
    vec3 g=mix(c,vec3(l)*uGreenTint+(c-vec3(l))*uGreenChroma,green*uGreenAmt);
    g=mix(vec3(dot(g,vec3(0.2126,0.7152,0.0722))),g,uGradeSat);      // muted, warmer greens
    g*=mix(uSplitLo,uSplitHi,smoothstep(0.08,0.75,l));  // split tone: teal shadows, amber highlights
    g+=uLift*(1.0-l);                                           // warm lift in the darks
    g=mix(g,uTopHaze*(0.85+l*0.35),smoothstep(0.60,1.0,vUV.y)*uTopAmt); // cooler, hazier toward the top (depth by painting)
    c=mix(c,g,uGrade);}
  c=shoulder(c);
  vec2 q=(vUV-0.5)*vec2(uRes.x/uRes.y,1.0);c=mix(c,c*uVignette,smoothstep(0.45,1.05,length(q))*0.55);
  c*=1.0+(texture2D(uGrain,gl_FragCoord.xy/512.0).r-0.5)*0.06*uGrainOn;     // static paper
  c+=(h(gl_FragCoord.xy)+h(gl_FragCoord.yx+17.3)-1.0)/255.0;                 // dither against banding in mist & vignette
  gl_FragColor=vec4(c,1.0);}