precision highp float;varying vec3 vW,vU,vV,vC;varying vec2 vQ,vM;
varying float vAge,vErode,vSeed,vGround,vOp,vR,vPl,vFar,vOpC;
// the smoke's own colour and its flash (the era's, PuffDef), a puff's densest (uOpacity), the factor on a card's
// opacity over the men (uCap) and the formations' mask (uClear: its origin x, z, 1 / its side in m, a man's body m)
uniform vec3 uSmokeCol,uFlashCol;uniform float uFlashT,uOpacity,uCap,uSmokeT,uBig;
#ifdef CLEAR
uniform sampler2D uClearTex;uniform vec4 uClear;
#endif
#include<painter>
// THE MUSKET SMOKE (src/look/smoke.ts, decision 0083): a soft card, blended over the scene (no depth written). Its
// shape: a falloff from the middle (vQ, ±1 at the edge; a young jet narrow at the muzzle) broken by the paint grain,
// large billows and smaller ones, in the card's own metres (vM: they keep their size as the puff grows, so the smoke
// spreads through them), churning slowly, the rim torn by the smaller billows and the paper's grain; with age it thins
// (vOp) and its threshold climbs past the billows (vErode), holes before it is gone. Soft at the ground it was born
// over. Its light: the sun's side of the card against its middle, the billows drawing the edge, a warm white and a
// pale cool grey, close in value (smoke is light all over); the clouds' shade, the trees' baked shadow, the air.
// Over the men (CLEAR): the view ray through the pixel followed down to a man's body height and the formations' mask
// read there (src/look/world/smoke.ts, coverAt, coverCap): this card's opacity takes the factor uCap there (a factor
// per card: cards over each other add up). The lens term: the blend keeps what lies behind it (as the soldiers'
// simple shadows: src/look/smoke.ts). The flash: the young jet's muzzle end in the flash's colour for uFlashT s.
// A BODY (uBig 1, the big clouds': docs/plans/active/artillery-smoke.md, round 2): the card painted as a volume,
// no volumetrics: its core dense (a core from the large shape alone, its own opacity vOpC holding through most of the
// life, the rim's vOp thinning, the smaller billows and the grain left to the rim), and its light from a normal of its
// own: a dome over the card's shape (its round edge, the young jet's narrow muzzle end), its lobes the large billows
// (embossed toward the sun: the lobes the edge shows), lit by the sun through a soft mid tone (decision 0084) to a pale
// cool shade on the far side and a cooler underside, the core a little deeper in the shade than the rim, and a
// faint warm rim where the thin edge faces the sun. Painted, not photoreal: three close values. Over the men its core
// is dropped (the mask's cover), so the cap leaves a formation reading through the cards over each other
float maxOf(vec3 c){return max(c.r,max(c.g,c.b));}
/** the body's light (uBig 1): the card's colour lit as a volume. q: the card's shape coordinates (±1), d its length,
 *  bil the large billows (0 to 1) and bilS the same a step toward the sun across the card (the lobes' slope: lit where
 *  they fall toward it, an emboss of their values, not of their texels' derivatives, which step), core the dense
 *  share, sun the sun's way across the card, warm and cool the sun's and the shade's tints */
vec3 bodyLight(vec2 q,float d,float bil,float bilS,float core,vec2 sun,vec3 warm,vec3 cool){
  vec3 E=normalize(cross(vU,vV));E*=sign(dot(E,uCamPos-vC)+1e-6);
  float h=sqrt(max(1.0-d*d,0.0));
  // a dome over the card's shape (its normal (q, h) in the card's frame), its lobes from the billows
  vec3 N=normalize(vU*q.x+vV*q.y+E*(h+0.2));
  float l=dot(N,uSunDir)*1.1+(bil-bilS)*0.6+(bil-0.5)*0.3;
  // three close values: lit warm white, a light mid, a pale cool shade; wide soft edges (0084's mid tone)
  vec3 lit=uSmokeCol*warm,shade=uSmokeCol*cool*0.68,mid=mix(shade,lit,0.6);
  vec3 c=mix(shade,mid,smoothstep(-0.6,0.0,l));
  c=mix(c,lit,smoothstep(-0.1,0.5,l));
  // the underside cooler and deeper (the sky's light from above), the core in
  // the shade a little deeper than the rim (light through the thin edge)
  c*=1.0-0.12*smoothstep(0.05,-0.6,N.y)-0.08*core*(1.0-smoothstep(-0.2,0.3,l));
  // the rim: the thin edge on the sun's side a little brighter, warmer
  c+=warm*uSmokeCol*0.1*(1.0-core)*smoothstep(0.55,0.95,d)*smoothstep(0.2,0.8,dot(q/max(d,1e-3),sun));
  return c;}
void main(){
  // young, a jet: narrow at the muzzle (its back, vQ.x -1) and widening ahead, densest there; grown, densest low.
  // The rim torn by the smaller billows and the paper's grain (a brushed edge, not a round one). Past the card's
  // round edge nothing is drawn (smoothstep(1, 0.8, d) below): left before any texture is read (the corners' fill)
  vec2 q=vec2(vQ.x,vQ.y/mix(1.0,0.3+0.7*(vQ.x*0.5+0.5),vPl));
  float d=length(q);
  if(d>=1.0)discard;
  vec2 s=vec2(vSeed*37.0,vSeed*19.0),drift=vec2(uSmokeT*0.02,0.0);
  // the billows (the grain's blotches, about a puff's size, and smaller ones on them) and the paper's fine grain
  // (a big card far out, vFar: its grain in its own frame, a blotch or two across it whatever its size, each card's
  // scale its own, so cards over each other share no holes and an old grown one is no even mottle; its billows
  // gentler, its thinning a fade more than holes)
  vec2 gm=mix(vM,vQ*(3.0+2.5*fract(vSeed*7.31)),vFar);
  float bil=G((gm.yx+s)*0.15+drift).g,sub=G((gm+s.yx)*0.38-drift).g,fib=G((gm+s)*1.4).r;
  float low=(1.0-d)*1.3-0.05-vQ.x*(0.25+0.3*vPl)+(bil-0.5)*mix(1.6,1.0,vFar)-vErode*mix(1.5,0.4,vFar);
  float dens=low+(sub-0.5)*(0.7+0.5*smoothstep(0.35,0.9,d))*mix(1.0,0.6,vFar)
    +(fib-0.5)*(0.06+0.35*smoothstep(0.5,0.95,d));
  // how much of a formation this pixel lies over (CLEAR: the mask read where the view ray meets a man's body)
  float cv=0.0;
  #ifdef CLEAR
  vec3 dv=vW-uCamPos;
  if(dv.y<-1e-3){vec2 p=uCamPos.xz+dv.xz*((vGround+uClear.w-uCamPos.y)/dv.y);
    cv=clamp((texture2D(uClearTex,(p-uClear.xy)*uClear.z).r-0.15)/0.5,0.0,1.0);
    cv=cv*cv*(3.0-2.0*cv);}
  #endif
  // (a body: a core from the large shape alone, the smaller billows and the grain left to the rim, dense through and
  // its opacity holding through most of the life, none over the men; the rim as before)
  float core=smoothstep(0.25,0.55,low)*(1.0-smoothstep(0.0,0.6,vErode))*(1.0-cv)*uBig;
  float a=max(smoothstep(0.0,0.5+0.2*vPl,dens)*vOp,core*max(vOp,vOpC))*smoothstep(1.0,0.8,d);
  a*=uOpacity*smoothstep(0.0,0.7,vW.y-vGround)*(1.0-vFar*0.85*vErode)*(1.0-(1.0-uCap)*cv);
  if(a<0.004)discard;
  // the light: the sun's way across the card (its frame's U, V) against the puff's middle, its edge the billows':
  // the side toward the sun lit, the far side in a pale cool shade, the billows' tops catching it (painted bands)
  vec2 sun=normalize(vec2(dot(uSunDir,vU),dot(uSunDir,vV))+1e-4);
  float l=dot(q,sun)*0.9+(bil-0.5)*1.6+(sub-0.5)*0.6+0.2;
  // (a body's lobes: the billows a step toward the sun, about a metre up close, a tenth of the card far out)
  float bilS=uBig>0.5?G(((gm+sun*mix(2.0,0.5,vFar)).yx+s)*0.15+drift).g:bil;
  vec3 warm=mix(vec3(1.0),uSunCol/maxOf(uSunCol),0.35);
  vec3 cool=mix(vec3(1.0),uShadowCol/max(dot(uShadowCol,LUMA),1e-3),0.2);
  vec3 c=mix(uSmokeCol*cool*0.84,uSmokeCol*warm,smoothstep(-0.08,0.08,l));
  // (a body's light where the cloud is thick: its thin veils, an old cloud's, lit as before, light, not a grey film)
  if(uBig>0.5)c=mix(c,bodyLight(q,d,bil,bilS,core,sun,warm,cool),smoothstep(-0.1,0.4,low)*(1.0-0.7*vErode));
  vec4 lm=LM(vC);float sh=(1.0-lm.r)*uShadowsOn;
  c*=mix(1.0,0.84,sh);
  c=cloudShade(c,cloud(vC),0.0);
  if(vAge<uFlashT)c=mix(c,uFlashCol,smoothstep(-0.55,-0.85,vQ.x)*smoothstep(0.6,0.2,abs(q.y)));
  c=airOf(c,vW,lm,vW.y-vGround);
  if(!all(lessThan(abs(c),vec3(65504.0))))discard;
  gl_FragColor=vec4(c,a);
}
