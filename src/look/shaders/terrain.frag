precision highp float;varying vec3 vW,vN;varying float vRiver;
#include<painter>
#include<waterdata>

#ifdef FARRING
uniform sampler2D uRiverMask;
#endif
#if defined(BANKN)&&!defined(BANKN_OFF)
uniform sampler2D uBankN;   // the fine bank normals (docs/plans/done/w2-river-banks.md): x, z, weight
#endif
vec3 albedo(vec3 wp,vec3 n){
  float n1=G(wp.xz/150.0).g,n2=G(wp.xz/53.0+0.31).g,n3=G(wp.xz/19.0+0.7).g;
  vec3 c=mix(vec3(0.33,0.45,0.20),vec3(0.55,0.58,0.27),smoothstep(0.35,0.66,n1));      // meadow → yellow-green
  c=mix(c,vec3(0.70,0.64,0.40),smoothstep(0.62,0.76,n2)*0.45);                         // dry gold
  c=mix(c,vec3(0.24,0.40,0.33),smoothstep(0.64,0.80,1.0-n1)*0.6);                      // teal-green hollows
  // dry-brush grass marks: directional streaks, two angles
  vec2 q=mat2(0.82,-0.57,0.57,0.82)*wp.xz;float st=G(q/9.0).b;
  // (directional dry-brush streaks removed: the paint grain carries the grass texture)
  // flower patches: orange and white flecks (complementary accents)
  float fpat=smoothstep(0.60,0.68,G(wp.xz/70.0+vec2(0.71,0.13)).g);
  float fl=step(0.86,G(wp.xz/1.6).r)*fpat;c=mix(c,vec3(0.99,0.56,0.14),fl);
  c=mix(c,vec3(0.96,0.93,0.84),step(0.93,G(wp.xz/1.3+0.5).r)*fpat*0.8);
  // stream banks
  float rb=vRiver+(G(wp.xz/3.0).r-0.5)*0.35;                                   // distance to the bank in half-widths
  c=mix(c*vec3(0.72,0.78,0.70),c,smoothstep(0.1,0.9,rb));                       // damp ground near the water
  c=mix(vec3(0.20,0.36,0.22),c,smoothstep(-0.05,0.4,rb));
  c=mix(vec3(0.42,0.34,0.22),c,smoothstep(-0.35,-0.05,rb));
  // strip fields in the distance
  float r=length(wp.xz);vec2 f=mat2(0.8,-0.6,0.6,0.8)*wp.xz;
  float id=fract(sin(dot(floor(vec2(f.x/70.0,f.y/22.0)),vec2(12.9898,78.233)))*43758.5453);
  vec3 fc=id<0.25?vec3(0.78,0.64,0.30):id<0.5?vec3(0.42,0.56,0.20):id<0.75?vec3(0.58,0.42,0.28):vec3(0.30,0.48,0.24);
  float fm=smoothstep(170.0,250.0,r);
  c=mix(c,fc*(0.96+0.06*G(vec2(f.x/40.0,f.y/3.0)).b),fm*0.85);   // faint furrows on distant fields only
  c=mix(c,vec3(0.55,0.52,0.46),smoothstep(0.80,0.62,n.y)*0.5);
  vec3 au=mix(c,vec3(0.70,0.60,0.34),0.45),la=mix(c,vec3(0.52,0.42,0.27),0.6),wi=mix(c,vec3(0.46,0.42,0.34),0.7);
  c=uSeason<1.0?mix(c,au,uSeason):uSeason<2.0?mix(au,la,uSeason-1.0):mix(la,wi,uSeason-2.0);                          // steep: stony
  return c;
}
void main(){
  #ifdef WATER_DEBUG
  if(uWaterView>0.5){gl_FragColor=vec4(waterView(vW.xz),1.0);return;}   // the water data's debug views
  #endif
  vec3 N=normalize(vN);vec4 lm=LM(vW);float bankTurn=0.0;
  #if defined(BANKN)&&!defined(BANKN_OFF)
  vec4 bk=texture2D(uBankN,(vW.xz+TILE_HALF)/TILE_W);vec2 bxz=bk.xy*2.0-1.0;   // BANKN_OFF: the bank check's sabotage
  vec3 bN=normalize(mix(N,vec3(bxz.x,sqrt(max(0.0,1.0-dot(bxz,bxz))),bxz.y),bk.z));
  bankTurn=step(0.001,1.0-dot(bN,N));N=bN;   // where the bank normals turn the shading normal by over about 2.5°
  #endif
  #ifdef DETAIL_DEBUG_N
  gl_FragColor=vec4(N*0.5+0.5,1.0);return;   // the bank check's view: the shading normal
  #endif
  float sh=(1.0-lm.r)*uShadowsOn,occ=mix(1.0,lm.g,uAO);
  vec3 alb=albedo(vW,N);
  #ifdef FARRING
  float rm=texture2D(uRiverMask,vW.xz/FAR_W+0.5).r;                   // painted river line on the far ring
  alb=mix(alb,alb*vec3(0.72,0.78,0.70),smoothstep(0.0,0.15,rm));
  alb=mix(alb,vec3(0.40,0.55,0.58),smoothstep(0.3,0.6,rm));   // the water mid tone after its sky tint, so the line matches the river at the tile edge
  #endif
  vec3 c=paint(alb,N,vW,occ,0.12,1.0,sh);
  #ifdef DETAIL_DEBUG_INC
  // the checks' incidence view: |cos| in red; the biplanar major plane's weight in green; in blue, where the bank
  // normals turn the shading normal (the river's banks)
  #ifdef DETAIL_ON
  gl_FragColor=vec4(abs(dot(N,normalize(uCamPos-vW))),pW.x,bankTurn,1.0);return;
  #else
  gl_FragColor=vec4(abs(dot(N,normalize(uCamPos-vW))),0.0,bankTurn,1.0);return;
  #endif
  #endif
  #ifdef DETAIL_DEBUG
  // the checks' view (tools/detail-check.mjs): the detail grain in red (0.5 ± half its deviation), the view distance
  // in green and blue (16 bits over 0–1000 m)
  float dd=floor(clamp(length(vW-uCamPos)/1000.0,0.0,1.0)*65535.0);
  gl_FragColor=vec4(clamp(0.5+(pDetail-0.5)*0.5,0.0,1.0),floor(dd/256.0)/255.0,mod(dd,256.0)/255.0,1.0);return;
  #endif
  gl_FragColor=vec4(atmos(mist(c,vW,lm,0.0),vW),depthA(vW));}