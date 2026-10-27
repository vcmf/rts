#extension GL_OES_standard_derivatives : enable
precision highp float;varying vec3 vW,vN,vObj;varying float vAge,vErode,vSeed,vGround;
// the smoke's own colour and its flash (the era's, PuffDef), the edge (uEdge: the rim's cut, the grain's weight in it),
// the clearance mask (uClear: its origin x, z, 1 / its side in m, a man's mid height m)
uniform vec3 uSmokeCol,uFlashCol;uniform float uFlashT;uniform vec2 uEdge;
#ifdef CLEAR
uniform sampler2D uClearTex;uniform vec4 uClear;
#endif
#include<painter>
#include<shore>
// THE MUSKET SMOKE (src/look/smoke.ts, decision 0080): an opaque cut-out, no blending. The shape: kept where its facing
// to the eye (1 at its middle, 0 at its rim) outweighs the rim's cut (uEdge.x), broken by the paint grain's blotches in
// the puff's own frame (uEdge.y: a brush edge; it does not swim as the puff moves) and eroded away with age (vErode:
// the rim first, then holes where the grain is low, never an opacity). The clearance rule (CLEAR): the view ray through
// the pixel followed down to a man's mid height over the puff's ground and the formations' mask read there
// (src/look/world/smoke.ts, coverAt): what the smoke would cover erodes it as age does, so a puff over a formation
// gives way from its rim inward, rounded and brushed, and is gone where it would hide a man. The light: three flat
// tones from the mood's sun (TONE3: warm lit, a mid, a cool shadow, close in value: smoke is light all over), their
// edges wobbled by the grain, the ground's warm bounce under it, or one flat tone (the staff map's); the trees' baked
// shadow and the clouds' shade on it, a warm rim against the low sun, then the air and the lens term (it blurs by its
// depth, decision 0040). The flash: the young puff in the flash's colour for its first uFlashT s. COVERAGE
// (?smokea2c=1): the edge as alpha to coverage, the alpha then the coverage (the blend keeps the lens term of what
// lies behind, src/look/smoke.ts)
float maxOf(vec3 c){return max(c.r,max(c.g,c.b));}
void main(){
  vec3 N=normalize(vN),V=normalize(uCamPos-vW);
  float g=0.5*(G(vObj.xy*0.35).g+G(vObj.zy*0.35+0.37).g);
  float keep=abs(dot(N,V))-uEdge.x+(g-0.5)*uEdge.y-vErode*(1.05+uEdge.y);
  #ifdef CLEAR
  vec3 d=vW-uCamPos;
  if(d.y<-1e-3){vec2 p=uCamPos.xz+d.xz*((vGround+uClear.w-uCamPos.y)/d.y);
    keep-=smoothstep(0.15,0.65,texture2D(uClearTex,(p-uClear.xy)*uClear.z).r)*(1.4+uEdge.y);}
  #endif
  #ifdef COVERAGE
  float cover=clamp(keep/max(fwidth(keep),1e-4)+0.5,0.0,1.0);if(cover<=0.0)discard;
  #else
  if(keep<0.0)discard;
  #endif
  vec4 lm=LM(vW);float sh=(1.0-lm.r)*uShadowsOn,ndl=dot(N,uSunDir);
  vec3 warm=mix(vec3(1.0),uSunCol/maxOf(uSunCol),0.45);
  #ifdef TONE3
  float l=ndl+(g-0.5)*0.3,t=smoothstep(-0.30,-0.20,l)*0.5+smoothstep(0.22,0.32,l)*0.5;
  vec3 cool=mix(vec3(1.0),uShadowCol/max(dot(uShadowCol,LUMA),1e-3),0.35);
  vec3 c=t<0.5?mix(uSmokeCol*cool*0.76,uSmokeCol*0.90,t*2.0):mix(uSmokeCol*0.90,uSmokeCol*warm,t*2.0-1.0);
  pBounce=bounceAt(vW.xz,vGround,0.0,1.0);
  c+=uSmokeCol*pBounce*uBounce*(0.5-0.5*N.y)*(1.0-t)*0.5;
  #else
  vec3 c=uSmokeCol*mix(vec3(1.0),warm,0.5);
  #endif
  c*=mix(1.0,0.80,sh);
  c=cloudShade(c,cloud(vW),0.0);
  float rim=smoothstep(0.62,0.72,1.0-abs(dot(N,V))+(g-0.5)*0.2)*smoothstep(-0.35,0.2,ndl);
  c+=uSunCol*uRimCol*rim*0.10*(1.0-sh);
  if(vAge<uFlashT)c=uFlashCol;
  #ifdef COVERAGE
  gl_FragColor=vec4(airOf(c,vW,lm,vW.y-vGround),cover);
  #else
  gl_FragColor=lensOut(airOf(c,vW,lm,vW.y-vGround),vW);
  #endif
}
