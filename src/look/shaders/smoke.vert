precision highp float;attribute vec3 position;
#include<instancesDeclaration>
// THE MUSKET SMOKE (src/look/smoke.ts, decision 0080): a puff an instance, its first two columns its birth place (m)
// and clock (s), its way ahead (x, z), seed and life (s); the rest unused (src/look/world/smoke.ts, volleyPuffs). The
// mesh is a unit icosphere; each vertex is pushed out to the union of four spheres set by the seed (the staff map's
// four merged circles in 3D: a scalloped silhouette the geometry draws, so the scene's samples smooth it), squashed,
// then sized and moved by the puff's age (puffAt, mirrored for the tests): the blast's jet ahead dying over uJet.y,
// the air's rise slowing over uJet.w, the wind's carry, growth from uGrow.x to uGrow.y over uGrow.z. A puff not born
// or past its life, or thinned out by the zoom (keepScale: uKeep, its share kept and the shrink's band), is put
// outside the view. SHADOW: the same puff flattened onto its ground along the sun (the staff map's offset shadow),
// drawn toward the camera along its view ray by uSmokeLift (m) so it stands over the grass
uniform mat4 viewProjection;uniform vec3 uCamPos,uSunDir,uWind;uniform vec4 uJet,uGrow;uniform vec2 uKeep;
uniform float uSmokeT,uSquash,uHeight;
#ifdef SHADOW
uniform float uSmokeLift,uShadowLean;
#endif
varying vec3 vW,vN,vObj;varying float vAge,vErode,vSeed,vGround;
// a lobe (centre, radius) of the puff's shape, in its unit frame: the middle one and three round it, turned by the seed
vec4 lobe(int i,float s){
  if(i==0)return vec4(0.0,0.06,0.0,0.78);
  float k=float(i),a=s*6.2832+k*2.09+fract(s*k*5.3)*0.6,d=0.40+0.12*fract(s*k*7.1);
  return vec4(cos(a)*d,(fract(s*k*13.7)-0.5)*0.30,sin(a)*d,0.54+0.12*fract(s*k*17.3));}
void main(){
  float birth=world0.w,life=world1.w,seed=world1.z,age=uSmokeT-birth;
  float keep=uKeep.x,sc=clamp((keep*(1.0+uKeep.y)-fract(seed*13.73))/(uKeep.y*keep),0.0,1.0)/sqrt(keep);
  if(age<0.0||age>=life||sc<=0.0){gl_Position=vec4(2.0,2.0,2.0,1.0);vW=vN=vObj=vec3(0.0);vAge=vErode=vSeed=vGround=0.0;return;}
  // the union of the lobes along this vertex's way from the centre (each lobe holds the centre: a ray from it meets
  // its far side once), the nearest lobe's outward normal its normal
  vec3 n=normalize(position);float t=0.0;vec3 nl=n;
  for(int i=0;i<4;i++){vec4 L=lobe(i,seed);float b=dot(n,L.xyz),h=b*b-dot(L.xyz,L.xyz)+L.w*L.w;
    float ti=b+sqrt(max(h,0.0));if(ti>t){t=ti;nl=normalize(n*ti-L.xyz);}}
  // (each puff its own: its size 0.7 to 1.3, its blast's reach 0.6 to 1.4 and its rise 0.6 to 1.4 of the era's)
  float r=(uGrow.x+(uGrow.y-uGrow.x)*(1.0-exp(-age/uGrow.z)))*(0.7+0.6*fract(seed*7.31))*sc;
  vec3 fwd=vec3(world1.x,0.0,world1.y);
  float jet=uJet.x*uJet.y*(1.0-exp(-age/uJet.y))*(0.6+0.8*fract(seed*3.71));
  float rise=uJet.z*uJet.w*(1.0-exp(-age/uJet.w))*(0.6+0.8*fract(seed*5.93));
  vec3 c=world0.xyz+fwd*jet+vec3(0.0,rise,0.0)+uWind*age;
  // (kept off the ground it was born over: a puff's bottom never sinks into it)
  c.y=max(c.y,world0.y-uHeight+r*uSquash*0.7);
  vec3 o=n*t;vec3 p=c+vec3(o.x,o.y*uSquash,o.z)*r;
  vN=normalize(vec3(nl.x,nl.y/uSquash,nl.z));vObj=o+vec3(seed*17.0,seed*5.0,seed*11.0);
  vAge=age;vErode=clamp((age/life-uGrow.w)/(1.0-uGrow.w),0.0,1.0);vSeed=seed;vGround=world0.y-uHeight;
  #ifdef SHADOW
  // along the sun down to the ground at its birth, then toward the camera by uSmokeLift over the ray's steepness
  vec3 sd=normalize(vec3(uSunDir.x*uShadowLean,uSunDir.y,uSunDir.z*uShadowLean));p-=sd*((p.y-vGround)/sd.y);
  vec3 v=normalize(uCamPos-p);p+=v*(uSmokeLift/max(v.y,0.2));
  #endif
  vW=p;gl_Position=viewProjection*vec4(p,1.0);}
