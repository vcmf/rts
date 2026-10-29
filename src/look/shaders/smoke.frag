precision highp float;varying vec3 vW,vU,vV,vC;varying vec2 vQ,vM;varying float vAge,vErode,vSeed,vGround,vOp,vR,vPl;
// the smoke's own colour and its flash (the era's, PuffDef), a puff's densest (uOpacity), the opacity kept over the men
// (uCap) and the formations' mask (uClear: its origin x, z, 1 / its side in m, a man's mid height m)
uniform vec3 uSmokeCol,uFlashCol;uniform float uFlashT,uOpacity,uCap,uSmokeT;
#ifdef CLEAR
uniform sampler2D uClearTex;uniform vec4 uClear;
#endif
#include<painter>
// THE MUSKET SMOKE (src/look/smoke.ts, decision 0080): a soft card, blended over the scene (no depth written). Its
// shape: a round falloff from the middle (vQ, ±1 at the card's edge) broken by the paint grain twice, large billows and
// a fine brush, in the card's own metres (vM: the brush keeps its size as the puff grows, so the smoke spreads through
// it), churning slowly; with age it thins (vOp) and its threshold climbs past the billows (vErode), so it breaks into
// holes before it is gone. Soft at the ground it was born over (no hard line where the card meets it). Its light: a
// round puff's (the card's middle faces the eye, its rim the sides), a warm white on the sun's side and a pale cool
// grey on the other, close in value (smoke is light all over); the clouds' shade, the trees' baked shadow, the air.
// Over the men (CLEAR): the view ray through the pixel followed down to a man's mid height and the formations' mask read
// there (src/look/world/smoke.ts, coverAt, coverCap): the opacity there capped to uCap, so a formation reads through.
// The lens term: the blend keeps what lies behind it (as the soldiers' simple shadows: src/look/smoke.ts). The flash:
// the young plume's core in the flash's colour for its first uFlashT s
float maxOf(vec3 c){return max(c.r,max(c.g,c.b));}
void main(){
  vec2 s=vec2(vSeed*37.0,vSeed*19.0),drift=vec2(uSmokeT*0.02,0.0);
  // the billows (the grain's blotches, about a puff's size, and smaller ones on them) and the paper's fine grain
  float bil=G((vM.yx+s)*0.15+drift).g,sub=G((vM+s.yx)*0.38-drift).g,fib=G((vM+s)*1.4).r;
  // young, a jet: narrow at the muzzle (its back, vQ.x -1) and widening ahead, densest there; grown, densest low.
  // The rim torn by the smaller billows and the paper's grain (a brushed edge, not a round one)
  vec2 q=vec2(vQ.x,vQ.y/mix(1.0,0.3+0.7*(vQ.x*0.5+0.5),vPl));
  float d=length(q);
  float dens=(1.0-d)*1.3-0.05-vQ.x*(0.25+0.3*vPl)+(bil-0.5)*1.6+(sub-0.5)*(0.7+0.5*smoothstep(0.35,0.9,d))
    +(fib-0.5)*(0.06+0.35*smoothstep(0.5,0.95,d))-vErode*1.5;
  float a=smoothstep(0.0,0.5+0.2*vPl,dens)*smoothstep(1.0,0.8,d);
  a*=uOpacity*vOp*smoothstep(0.0,0.7,vW.y-vGround);
  #ifdef CLEAR
  vec3 dv=vW-uCamPos;
  if(dv.y<-1e-3){vec2 p=uCamPos.xz+dv.xz*((vGround+uClear.w-uCamPos.y)/dv.y);
    float cv=clamp((texture2D(uClearTex,(p-uClear.xy)*uClear.z).r-0.15)/0.5,0.0,1.0);
    a*=1.0-(1.0-uCap)*cv*cv*(3.0-2.0*cv);}
  #endif
  if(a<0.004)discard;
  // the light: the sun's way across the card (its frame's U, V) against the puff's middle, its edge the billows':
  // the side toward the sun lit, the far side in a pale cool shade, the billows' tops catching it (painted bands)
  vec2 sun=normalize(vec2(dot(uSunDir,vU),dot(uSunDir,vV))+1e-4);
  float l=dot(q,sun)*0.9+(bil-0.5)*1.6+(sub-0.5)*0.6+0.2;
  vec3 warm=mix(vec3(1.0),uSunCol/maxOf(uSunCol),0.35);
  vec3 cool=mix(vec3(1.0),uShadowCol/max(dot(uShadowCol,LUMA),1e-3),0.2);
  vec3 c=mix(uSmokeCol*cool*0.84,uSmokeCol*warm,smoothstep(-0.08,0.08,l));
  vec4 lm=LM(vC);float sh=(1.0-lm.r)*uShadowsOn;
  c*=mix(1.0,0.84,sh);
  c=cloudShade(c,cloud(vC),0.0);
  if(vAge<uFlashT)c=mix(c,uFlashCol,smoothstep(-0.55,-0.85,vQ.x)*smoothstep(0.6,0.2,abs(q.y)));
  c=airOf(c,vW,lm,vW.y-vGround);
  if(!all(lessThan(abs(c),vec3(65504.0))))discard;
  gl_FragColor=vec4(c,a);
}
