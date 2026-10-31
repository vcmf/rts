precision highp float;varying vec3 vW,vN;uniform sampler2D uAOTex;uniform float uPenumbra;uniform vec2 uSMGround;
#include<painter>
#include<waterdata>

void main(){vec3 N=normalize(vN);
  vec4 lp=uLightVP*vec4(vW+N*0.35,1.0);vec3 q=lp.xyz/lp.w;vec2 uv=q.xy*0.5+0.5;float d=q.z*0.5+0.5-SBIAS;
  #ifdef SOFT
  // the penumbra grows with the distance to the caster (docs/plans/done/soft-shadows.md). Radii are metres on the
  // ground (a shadow texel spans uSMGround metres of it, about square). The casters found within reach (the widest penumbra, of a
  // caster FAR_MAX metres along the light) give their mean distance, which sets the filter radius: at least the old
  // filter (2.54 texels), at most the reach. The tap pattern turns per texel, so thin casters do not ghost.
  float rot=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(0.06711056,0.00583715))))*6.2832;   // interleaved gradient noise on the texel index
  vec2 tex=uSMTexel/uSMGround;   // shadow uv per ground metre
  float reach=max(1.0,FAR_MAX*uPenumbra),w0=2.54*uSMGround.x,bs=0.0,bn=0.0;
  for(int i=0;i<16;i++){float a=float(i)*2.39996+rot;float r=sqrt((float(i)+0.5)/16.0)*reach;
    float z=texture2D(uShadowMap,uv+vec2(cos(a),sin(a))*r*tex).r;if(z<d){bs+=z;bn+=1.0;}}
  float far=bn>0.0?(d-bs/bn)*DEPTH_M:0.0,w=clamp(far*uPenumbra,w0,max(w0,reach));
  float s=0.0;for(int i=0;i<32;i++){float a=float(i)*2.39996+rot;float r=sqrt((float(i)+0.5)/32.0)*w;
    s+=step(texture2D(uShadowMap,uv+vec2(cos(a),sin(a))*r*tex).r,d);}
  float vis=1.0-s/32.0,soft=clamp((w-w0)/1.0,0.0,1.0),e=mix(0.15,0.40,soft);
  // painted edge, wider and looser far from its caster. The grain acts in the penumbra only, so full sun and full
  // shadow stay clean however loose the edge
  vis=smoothstep(0.5-e,0.5+e,vis+(G(vW.xz/3.0).r-0.5)*mix(0.35,0.55,soft)*min(1.0,vis*(1.0-vis)*8.0));
  #else
  float s=0.0;for(int i=0;i<12;i++){float a=float(i)*2.39996;float r=sqrt(float(i)+0.5)*0.75;
    s+=step(texture2D(uShadowMap,uv+vec2(cos(a),sin(a))*r*uSMTexel).r,d);}
  float vis=1.0-s/12.0;
  vis=smoothstep(0.35,0.65,vis+(G(vW.xz/3.0).r-0.5)*0.35);                  // painted edge, decided once
  #endif
  vec4 a=texture2D(uAOTex,tileUV(vW.xz));
  #ifdef WATERDATA
  a.b*=waterMist(waterSdf(waterTexel(vW.xz)));   // the mist thinner over the water (waterdata.glsl)
  #endif
  gl_FragColor=vec4(vis,a.g,a.b,a.r);}   // A: the contact under trees (src/look/bakes.ts)