precision highp float;varying vec3 vW,vN;uniform sampler2D uAOTex;
#include<painter>

void main(){vec3 N=normalize(vN);
  vec4 lp=uLightVP*vec4(vW+N*0.35,1.0);vec3 q=lp.xyz/lp.w;vec2 uv=q.xy*0.5+0.5;float d=q.z*0.5+0.5-SBIAS;
  float s=0.0;for(int i=0;i<12;i++){float a=float(i)*2.39996;float r=sqrt(float(i)+0.5)*0.75;
    s+=step(texture2D(uShadowMap,uv+vec2(cos(a),sin(a))*r*uSMTexel).r,d);}
  float vis=1.0-s/12.0;
  vis=smoothstep(0.35,0.65,vis+(G(vW.xz/3.0).r-0.5)*0.35);                  // painted edge, decided once
  vec4 a=texture2D(uAOTex,(vW.xz+TILE_HALF)/TILE_W);
  gl_FragColor=vec4(vis,a.g,a.b,1.0);}