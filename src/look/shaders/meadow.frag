#extension GL_OES_standard_derivatives : enable
precision highp float;varying vec3 vW,vN,vCrop;varying float vV,vShade,vH,vIsCrop;varying vec2 vRoot;uniform float uCell;
#include<painter>
#include<shore>

void main(){
  vec3 N=normalize(mix(normalize(vN),vec3(0.0,1.0,0.0),0.75));  // grass shades like the ground it grows from
  vec4 lm=LM(vW);float sh=(1.0-lm.r)*uShadowsOn;
  vec3 alb;
  if(vIsCrop>0.5){
    // a crop: lime at the foot to its season colour at the tip (meadow.vert), each clump a shade apart, no read of the
    // ground under it
    alb=mix(vec3(0.38,0.48,0.18),vCrop,smoothstep(0.0,0.35,vV))*mix(0.9,1.12,vV)*mix(0.92,1.08,vShade);
    // in winter toward the snowed ground under it, as the grass is (the ground read only then)
    #ifdef MACRO_BAKE
    if(uSeason>2.0){pMdx=vec2(uCell,0.0);pMdy=vec2(0.0,uCell);alb=mix(alb,groundSeason(groundAt(vRoot,uCell))*mix(0.95,1.3,vV),0.7*smoothstep(2.0,3.0,uSeason));}
    #endif
  }else{
    // grass: the ground colour under the root, darker at the root and lighter, a little warmer, at the tip (the pack
    // Grass.png is that gradient), each clump a shade apart. The painted ground under the root: the macro bake (one
    // read), or, on the other arms (whose ground costs a whole macro colour a pixel, too much for many blades deep),
    // the flat class colour
    #ifdef MACRO_BAKE
    pMdx=vec2(uCell,0.0);pMdy=vec2(0.0,uCell);   // the bake read at the ring cell footprint, as the ground under it is filtered
    vec3 g=groundSeason(groundAt(vRoot,uCell));
    #else
    vec3 g=groundSeason(groundBounce(vRoot));
    #endif
    alb=g*mix(0.95,1.55,vV)*mix(0.92,1.10,vShade);
    alb=mix(alb,alb*vec3(1.04,1.08,0.80),vV*0.5);
  }
  float lo=groundOcc(lm),occ=mix(0.8,1.0,vV)*mix(1.0,lo,uAO*0.6);
  // paint(), lean: the ramp, the cool shadow band (deeper where the sky is hidden), the clouds, no grain, rim nor
  // snow (a blade is a few pixels: they would not show, and the blades are many layers deep)
  float l=dot(N,uSunDir)-cloud(vW)*0.40-sh*1.25-(1.0-occ)*0.55;
  float t=smoothstep(-0.10,-0.02,l)*0.55+smoothstep(0.30,0.38,l)*0.45;
  vec3 shc=shadowOf(alb);
  #ifdef SKY_IN_SHADOW
  shc*=mix(0.62,1.0,smoothstep(0.35,0.8,mix(1.0,lm.g,uAO)));
  #endif
  vec3 mid=alb*mix(vec3(0.86,0.92,0.98),uSunCol,0.30),lt=alb*uSunCol*1.16+vec3(0.03,0.025,0.0);
  vec3 c=t<0.55?mix(shc,mid,t/0.55):mix(mid,lt,(t-0.55)/0.45);
  gl_FragColor=vec4(atmos(mist(c,vW,lm,vH),vW),depthA(vW));}
