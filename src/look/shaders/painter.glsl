
uniform sampler2D uGrain;
uniform vec3 uSunDir,uSunCol,uShadowCol,uHazeCool,uHazeWarm,uCamPos,uFocus;
uniform float uTime,uGrainAmt,uEdges,uClouds,uSeason;

vec3 G(vec2 uv){return texture2D(uGrain,uv).rgb;}
vec3 grainW(vec3 wp,vec3 n,float sc){vec2 p=abs(n.y)>0.6?wp.xz:(abs(n.x)>abs(n.z)?wp.zy:wp.xy);return G(p/sc);}
// SEASON (docs/art-bible.md §4b): 0 summer · 1 early autumn · 2 late autumn · 3 winter.
// Snow settles on whatever faces up, broken by the grain, so it reads as painted.
float snowAt(vec3 N,vec3 wp){float s=clamp(uSeason-2.0,0.0,1.0);if(s<=0.0)return 0.0;
  return smoothstep(0.55,0.72,N.y*1.15*s+(grainW(wp,N,4.0).r-0.5)*0.4+(s-1.0)*0.35);}
// Per-tree foliage colour. t = per-instance random; kind: 0 deciduous, 1 evergreen, 2 grass.
vec3 foliage(vec3 a,vec3 b,float t,float kind){
  vec3 summer=mix(a,b,t);
  float h=fract(t*7.13);
  summer=mix(summer,vec3(0.36,0.18,0.24),step(0.95,h)*step(kind,0.5));   // a rare copper beech, all year
  if(kind>1.5){                                                            // grass: one field colour per season
    vec3 au=mix(summer,vec3(0.72,0.62,0.32),0.55),la=mix(summer,vec3(0.55,0.44,0.26),0.7),wi=vec3(0.50,0.45,0.34);
    return uSeason<1.0?mix(summer,au,uSeason):uSeason<2.0?mix(au,la,uSeason-1.0):mix(la,wi,uSeason-2.0);}
  if(kind>0.5)return mix(summer,summer*vec3(0.78,0.88,0.95),clamp(uSeason-2.0,0.0,1.0));   // conifers stay green
  vec3 au=h<0.30?mix(vec3(0.86,0.46,0.12),vec3(0.96,0.62,0.18),t)      // orange
         :h<0.55?mix(vec3(0.92,0.74,0.22),vec3(0.98,0.85,0.40),t)      // yellow
         :h<0.72?mix(vec3(0.70,0.17,0.10),vec3(0.84,0.30,0.14),t)      // red
         :h<0.76?vec3(0.48,0.20,0.34)                                  // purple, rare
         :h<0.95?mix(summer,vec3(0.72,0.62,0.22),0.45)                 // still turning
         :vec3(0.36,0.18,0.24);
  vec3 la=mix(au*vec3(0.80,0.62,0.50),vec3(0.46,0.30,0.18),0.45);       // late autumn: browner, duller
  vec3 wi=vec3(0.34,0.29,0.24);                                         // winter: bare-looking, snow does the rest
  return uSeason<1.0?mix(summer,au,uSeason):uSeason<2.0?mix(au,la,uSeason-1.0):mix(la,wi,uSeason-2.0);
}
// REAL sun shadow from the depth pass; PCF taps jittered by the paint grain,
// so shadow edges come out brushy instead of pixel-sharp.
uniform sampler2D uShadowMap;uniform mat4 uLightVP;uniform vec2 uSMTexel,uSMFade;uniform float uShadowsOn;
float shadowAt(vec3 wp,vec3 n){
  vec4 lp=uLightVP*vec4(wp+n*0.6,1.0);vec3 q=lp.xyz/lp.w;vec2 uv=q.xy*0.5+0.5;
  if(uv.x<0.0||uv.y<0.0||uv.x>1.0||uv.y>1.0||q.z>1.0)return 0.0;   // outside the sun's view (incl. beyond its far plane) = lit
  float d=q.z*0.5+0.5-SBIAS;
  vec2 j=(vec2(texture2D(uGrain,wp.xz*0.6).r,texture2D(uGrain,wp.zx*0.6+0.3).r)-0.5)*3.0;
  float s=0.0;
  for(int x=0;x<2;x++)for(int y=0;y<2;y++)s+=step(texture2D(uShadowMap,uv+(vec2(float(x),float(y))*2.0-1.0+j)*uSMTexel).r,d);
  vec2 e=min(uv,1.0-uv);float fade=smoothstep(0.0,uSMFade.x,e.x)*smoothstep(0.0,uSMFade.y,e.y);   // soft edge: far foliage past the box fades to lit
  return s/4.0*uShadowsOn*fade;}
// BAKED LIGHT MAP (world XZ): R sun visibility, G occlusion, B valley-mist mask.
uniform sampler2D uLM;uniform mat4 uLMVP;uniform float uAO,uMist,uShafts,uBack;
vec4 LM(vec3 wp){vec4 p=uLMVP*vec4(wp,1.0);vec2 uv=p.xy/p.w*0.5+0.5;
  if(uv.x<0.002||uv.y<0.002||uv.x>0.998||uv.y>0.998)return vec4(1.0,1.0,0.0,0.0);
  return texture2D(uLM,uv);}
// Valley mist: warm where the air is sunlit, cool where it's shadowed. Light shafts =
// the air column's sun visibility, read from the light map at 3 heights along the view ray.
vec3 mist(vec3 c,vec3 wp,vec4 lm,float hAbove){
  float m=lm.b*uMist*exp(-hAbove*0.12);if(m<0.01)return c;
  float air=lm.r;
  if(uShafts>0.5){vec3 v=normalize(uCamPos-wp);float s=0.0;
    for(int i=0;i<3;i++){float h=(float(i)+0.5)/3.0*7.0;vec3 q=wp+v*(h/max(v.y,0.25));
      s+=LM(q-uSunDir*((q.y-wp.y)/uSunDir.y)).r;}
    air=s/3.0;}
  float n=G(wp.xz/55.0+uTime*vec2(0.004,0.0015)).g;
  float t=clamp(m*(0.35+0.55*n),0.0,0.42);
  return mix(c,mix(vec3(0.58,0.67,0.78),vec3(1.0,0.86,0.63),air),t);}
// view distance in alpha → depth of field without re-rendering the scene
float depthA(vec3 wp){return clamp(length(wp-uCamPos)/1000.0,0.0,1.0);}
// Big painted cloud shadows drifting over the land: the top-down camera's only "sky".
float cloud(vec3 wp){
  vec2 p=wp.xz+uTime*vec2(2.2,0.8);
  float c=0.62*G(p/330.0).g+0.38*G(p/131.0+vec2(0.37,0.11)).g;
  return smoothstep(0.60,0.635,c+(G(wp.xz/5.0).r-0.5)*0.06)*uClouds;
}
// Cool, more saturated shadow version of a colour (hue shift, never plain darkening).
vec3 shadowOf(vec3 a){float l=dot(a,vec3(0.3,0.59,0.11));return clamp(mix(vec3(l),a,1.15),0.0,1.0)*uShadowCol*0.80+vec3(0.02,0.04,0.07);}
// THE paint function. jitter: how loose the brushwork is (1 = landscape, 0.3 = crisp units).
// sh: extra shadow from the painted shadow map (0..1).
vec3 paint(vec3 alb,vec3 N,vec3 wp,float occ,float rimAmt,float jitter,float sh){
  float snow=snowAt(N,wp);alb=mix(alb,vec3(0.80,0.81,0.84),snow);                           // snow: lit warm white, shadowed cool blue by the ramp
  vec3 g=grainW(wp,N,5.5),g2=grainW(wp,N,21.0);
  float gr=(g.r-0.5)*uGrainAmt;
  float ndl=dot(N,uSunDir);
  float l=ndl+gr*0.55*jitter+(g2.g-0.5)*0.3*jitter;
  l-=cloud(wp)*0.40+sh*1.25+(1.0-occ)*0.55;
  float t=smoothstep(-0.10,-0.02,l)*0.55+smoothstep(0.30,0.38,l)*0.45;   // shadow | mid | light, grain-broken edges
  vec3 shc=shadowOf(alb);
  vec3 mid=alb*mix(vec3(0.86,0.92,0.98),uSunCol,0.30);
  vec3 lt=alb*uSunCol*mix(1.16,1.02,snow)+vec3(0.03,0.025,0.0)*(1.0-snow);
  vec3 c=t<0.55?mix(shc,mid,t/0.55):mix(mid,lt,(t-0.55)/0.45);
  c*=1.0+gr*0.38;                                                           // gouache grain in the value
  vec3 V=normalize(uCamPos-wp);
  float fres=1.0-max(dot(N,V),0.0);
  float rim=smoothstep(0.58,0.64,fres+(g.r-0.5)*0.2)*smoothstep(-0.35,0.2,ndl);
  c+=uSunCol*vec3(1.0,0.86,0.6)*rim*rimAmt*0.55*(1.0-cloud(wp)*0.7)*(1.0-sh);       // graphic warm rim
  return c;
}
// Top-down atmosphere: colour cools (and warms toward the sun side) away from the focus.
vec3 atmos(vec3 c,vec3 wp){
  vec2 dv=wp.xz-uFocus.xz;float d=length(dv);
  float f=smoothstep(110.0,420.0,d)*0.72;
  float warm=max(dot(normalize(dv+1e-4),normalize(uSunDir.xz)),0.0);
  return mix(c,mix(uHazeCool,uHazeWarm,warm*0.65),f);
}