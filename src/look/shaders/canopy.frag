#extension GL_OES_standard_derivatives : enable
precision highp float;varying vec3 vW,vN,vS;varying float vTint,vOcc,vH,vRole;varying vec2 vRoot,vUV;varying vec3 vEllC,vEllR,vTU,vTV;varying float vDrop,vFade;uniform vec3 uFolA,uFolB;uniform float uRim,uKind,uLeafSize;uniform sampler2D uLeaf;
#include<cards>
#include<painter>
#include<shore>

// the layered leaves are lighter in shade, as Tiny Glade's: the crown's own shade, its core and its inner leaves
// less dark (the layers' dark base already gives the depth); otherwise L7b's values
#ifdef LEAF_PAINT
#define SELF_SHADE 0.5
#define CORE_DARK 0.85
#define INNER_TINT vec3(0.86,0.93,0.96)
#else
#define SELF_SHADE 0.7
#define CORE_DARK 0.72
#define INNER_TINT vec3(0.72,0.86,0.92)
#endif
void main(){
  #ifdef FAR_FADE
  if(dither(gl_FragCoord.xy+vTint*61.0)<vFade)discard;   // the cards give way to the crown mesh, pixel by pixel (its pixels are the others)
  #endif
  #ifdef LEAF_LOSS
  if(vDrop<leafLoss(uSeason))discard;
  #endif
  vec4 tx=texture2D(uLeaf,vUV);
  // the coverage grows with the mip level, so far crowns keep their mass instead of thinning out
  vec2 d=vUV*uLeafSize;float lod=max(0.0,0.5*log2(max(dot(dFdx(d),dFdx(d)),dot(dFdy(d),dFdy(d)))));
  if(tx.a*(1.0+lod*0.6)<0.5)discard;
  // the value over the coverage: the black around each clump, filtered in at its edge and in the mips, would darken it
  float val=mix(clamp(tx.r/max(tx.a,1e-3),0.0,1.0),0.6,smoothstep(1.5,4.0,lod));                 // far crowns: less value noise between leaves
  #ifdef LEAF_PAINT
  // the painter's layers (docs/plans/active/crown-leaves.md): up close a leaf's layer (the atlas value: dark, mid,
  // light, highlight) picks its flat tone after the crown's light (below); farther, by the mip level, the old mass
  float near=1.0-smoothstep(1.5,4.0,lod),jitter=mix(1.0,0.4,near);   // the brush's grain looser on a mass than on a drawn leaf
  #else
  float jitter=1.0;
  #endif
  float valGain=mix(0.80,1.12,val);
  vec4 lm=LM(vW);
  #ifdef VOLUME
  // the crown as a volume (docs/plans/done/l7b-crown-volume.md). q: the point in the unit sphere of the ellipsoid
  vec3 q=(vW-vEllC)/vEllR;
  vec3 N=normalize(q/vEllR);                                    // A. the ellipsoid normal at this pixel
  #ifndef LEAF_PAINT
  vec2 tilt=(tx.gb/max(tx.a,1e-3)-0.5)*2.0*(1.0-smoothstep(1.5,4.0,lod));
  N=normalize(N+(vTU*tilt.x+vTV*tilt.y)*0.55);                  // E. each leaf turns it a little (canvas down is the atlas v)
  #endif
  // B. metres of crown between here and the sun, through the ellipsoid grown by the cards reach (the leaves stand
  // out of the box of the crown triangles by about a card)
  vec3 qo=(vW-vEllC)/(vEllR*1.3),dq=uSunDir/(vEllR*1.3);float qa=dot(dq,dq),qb=dot(qo,dq),qc=dot(qo,qo)-1.0,disc=qb*qb-qa*qc;
  float sq=sqrt(max(disc,0.0)),t1=(-qb-sq)/qa,t2=(-qb+sq)/qa;
  float t=disc>0.0?max(0.0,t2-max(t1,0.0)):0.0;                 // the chord ahead, not the air before it
  float self=1.0-exp(-t*0.75/max(vEllR.x,vEllR.y));
  float shO=shadowAt(vW+uSunDir*max(t2,0.0),uSunDir),sh=max(self*SELF_SHADE,shO);   // other trees: where that ray leaves the crown (shadowAt adds its 0.6 m)
  float core=mix(CORE_DARK,1.0,smoothstep(0.25,0.95,length(q)));    // D. deep inside, darker
  #else
  vec3 N=normalize(vN);
  float sh=shadowAt(vS,N);                                      // at its point on the crown surface: deeper in, the other cards would shade it
  float core=1.0,shO=sh;
  #endif
  #ifdef VOLUME
  pBounce=bounceAt(vRoot,vW.y-vH,vH,0.0);   // the ground's bounce, as light in paint() (LC4): on the crown's volume normal only
  float bw=0.0;
  #else
  float bw=0.15*(1.0-smoothstep(-0.1,0.4,dot(N,uSunDir)))*(1.0-smoothstep(0.0,6.0,vH));   // L7a cards: the old ground tint
  #endif
  #ifdef LEAF_PAINT
  // the crown's light decides how many of the upper layers show: the shade side its dark and mid leaves, the lit side
  // up to the highlights; each layer one flat tone (the layer snapped, its edge antialiased), dark cool to pale warm
  float lit=clamp((dot(N,uSunDir)+0.45)/1.45,0.0,1.0)*(1.0-sh);
  float li=clamp((clamp(tx.r/max(tx.a,1e-3),0.0,1.0)-0.12)/0.293,0.0,3.0),lf=floor(li),lw=max(fwidth(li),1e-3);
  li=min(lf+smoothstep(0.5-lw,0.5+lw,li-lf),1.0+lit*2.3);
  vec3 tone=li<1.0?mix(LAYER_0,LAYER_1,li):li<2.0?mix(LAYER_1,LAYER_2,li-1.0):mix(LAYER_2,LAYER_3,li-2.0);
  vec3 gain=mix(vec3(valGain),tone,near);
  #else
  vec3 gain=vec3(valGain);
  #endif
  vec3 alb=mix(foliage(uFolA,uFolB,vTint,uKind),groundSeason(groundBounce(vRoot)),bw)*gain   // the painted value of the leaves
    *mix(vec3(1.0),INNER_TINT,step(0.5,vRole));                                                          // the inner leaves (role 1), as the pack crowns paint them
  vec3 c=paint(alb,N,vW,core*vOcc*mix(0.85,1.0,val)*mix(1.0,lm.g,uAO*0.6),uRim,jitter,sh);
  vec3 V=normalize(uCamPos-vW);                                 // golden backlight, as on the default crowns
  float back=clamp(dot(-normalize(V.xz+1e-4),normalize(uSunDir.xz)),0.0,1.0);back*=back;
  vec3 Nc=normalize(vN);                                        // the glow keeps the card normals of L7a (its amount, its spread)
  float edge=smoothstep(0.35,0.75,(1.0-abs(dot(Nc,V)))+(grainW(vW,Nc,2.4).r-0.5)*0.25);
  c+=uSunCol*uBackCol*back*edge*uBack*0.3*(1.0-shO);   // the sun through the leaves: only other trees block it    // half the default: the cards turn far more of the crown edge-on
  gl_FragColor=lensOut(airOf(c,vW,lm,vH),vW);}
