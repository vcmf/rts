precision highp float;attribute vec3 position;
#include<instancesDeclaration>
// THE MUSKET SMOKE (src/look/smoke.ts, decision 0081): a puff an instance, its first three columns its birth place (m)
// and clock (s), its way ahead (x, z), seed and life (s), its own factors on the era's size, reach, rise and density
// (src/look/world/smoke.ts, volleyPuffs, puffVary). The mesh is one quad (corners ±1): a card, its y along the front,
// its x the shot's way while young (a jet near the level, its back at the muzzle) turning to the eye's up as it grows
// (a low streak hung at the muskets); sized and moved by the puff's age (puffAt, mirrored for the tests): the blast's
// jet ahead dying over uJet.y, then the slow roll (uRoll), the air's rise slowing over uJet.w, the wind's carry (each
// puff's a little its own), growth from uGrow.x to uGrow.y over uGrow.z. Young, the card is long along the shot
// (uPlume: its stretch at birth, its relaxing time), narrow at the muzzle (smoke.frag); grown, wider along the front
// than tall (uPlume.z, more with age), into its neighbours. A puff not born or past its life, of no density, or
// thinned out by the zoom (keepScale: uKeep, its share kept and the shrink's band), is put outside the view
uniform mat4 viewProjection;uniform vec3 uCamPos,uWind;uniform vec4 uJet,uGrow;uniform vec2 uKeep;uniform vec3 uPlume;
uniform float uSmokeT,uHeight,uRoll,uThin;
varying vec3 vW,vU,vV,vC;varying vec2 vQ,vM;varying float vAge,vErode,vSeed,vGround,vOp,vR,vPl;
void main(){
  float birth=world0.w,life=world1.w,seed=world1.z,age=uSmokeT-birth;
  float keep=uKeep.x,sc=clamp((keep*(1.0+uKeep.y)-fract(seed*13.73))/(uKeep.y*keep),0.0,1.0)/sqrt(keep);
  if(age<0.0||age>=life||sc<=0.0||world2.w<=0.0){
    gl_Position=vec4(2.0,2.0,2.0,1.0);vW=vU=vV=vC=vec3(0.0);vQ=vM=vec2(0.0);
    vAge=vErode=vSeed=vGround=vOp=vR=vPl=0.0;return;}
  float r=(uGrow.x+(uGrow.y-uGrow.x)*(1.0-exp(-age/uGrow.z)))*world2.x*sc;
  vec3 fwd=vec3(world1.x,0.0,world1.y),side=vec3(-fwd.z,0.0,fwd.x);
  float reach=(uJet.x*uJet.y*(1.0-exp(-age/uJet.y))+uRoll*age)*world2.y;
  float rise=uJet.z*uJet.w*(1.0-exp(-age/uJet.w))*world2.z;
  // (the wind's carry, 0.7 to 1.3 of the era's for each puff)
  vec3 m=world0.xyz+fwd*reach+vec3(0.0,rise,0.0)+uWind*age*(0.7+0.6*fract(seed*2.93));
  // the frame. Young, a jet: across it the shot's way, near the level (Uj), its back at the muzzle. Grown (g), a streak
  // hung at the muskets: across it the eye's up (B: square to the front and the view ray), along the front wide and
  // low (wider than tall, flatter with age), so it reads at the men's chests from the front and just past their
  // heads from behind, and a streak along the line from above
  float pl=exp(-age/uPlume.y),st=(uPlume.x-1.0)*pl,g=1.0-pl;
  vec3 Uj=normalize(fwd+vec3(0.0,0.08,0.0)),V=side;
  vec3 B=cross(normalize(uCamPos-m),side);B*=sign(B.y+1e-4);
  vec3 U=normalize(mix(Uj,normalize(B),g));
  float fl=mix(0.85,0.6,1.0-exp(-age/4.0));
  float rx=r*mix(1.0+st,fl,g),ry=r*mix(1.0,uPlume.z*(1.0+0.3*(1.0-exp(-age/5.0))),g);
  // (the jet's back at the muzzle; the streak at the muskets and a little above, as it rises)
  vec3 c=m+Uj*(r*(1.0+st)*0.55*pl)+vec3(0.0,0.2*g,0.0);
  vGround=world0.y-uHeight;
  vec3 p=c+U*(position.x*rx)+V*(position.y*ry);
  vU=U;vV=V;vC=c;vQ=position.xy;vM=position.xy*vec2(rx,ry);vR=r;
  vAge=age;vSeed=seed;vPl=pl;
  vErode=clamp((age/life-uGrow.w)/(1.0-uGrow.w),0.0,1.0);
  vOp=(1.0-uThin*min(1.0,age/life))*world2.w;
  vW=p;gl_Position=viewProjection*vec4(p,1.0);}
