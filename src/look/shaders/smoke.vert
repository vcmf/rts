precision highp float;attribute vec3 position;
#include<instancesDeclaration>
// THE MUSKET SMOKE (src/look/smoke.ts, decision 0080): a puff an instance, its first three columns its birth place (m)
// and clock (s), its way ahead (x, z), seed and life (s), its own factors on the era's size, reach, rise and density
// (src/look/world/smoke.ts, volleyPuffs, puffVary). The mesh is one quad (corners ±1): a card across the front (its x
// the shot's way, its y along the front), tilted up from the level by its age and seed so it meets a top-down camera
// with its face and its back stays at the muzzles; sized and moved by the puff's age (puffAt, mirrored for the tests):
// the blast's jet ahead dying over uJet.y, then the slow roll (uRoll), the air's rise slowing over uJet.w, the wind's
// carry (each puff's a little its own), growth from uGrow.x to uGrow.y over uGrow.z. Young, the card is a jet: long
// along the shot (uPlume: its stretch at birth, its relaxing time), narrow at the muzzle (smoke.frag); grown, wider
// along the front than deep (uPlume.z), into its neighbours. A puff not born or past its life, or thinned out by the
// zoom (keepScale: uKeep, its share kept and the shrink's band), is put outside the view
uniform mat4 viewProjection;uniform vec3 uCamPos,uWind;uniform vec4 uJet,uGrow;uniform vec2 uKeep;uniform vec3 uPlume;
uniform float uSmokeT,uHeight,uRoll,uThin;
varying vec3 vW,vU,vV,vC;varying vec2 vQ,vM;varying float vAge,vErode,vSeed,vGround,vOp,vR,vPl;
void main(){
  float birth=world0.w,life=world1.w,seed=world1.z,age=uSmokeT-birth;
  float keep=uKeep.x,sc=clamp((keep*(1.0+uKeep.y)-fract(seed*13.73))/(uKeep.y*keep),0.0,1.0)/sqrt(keep);
  if(age<0.0||age>=life||sc<=0.0||world2.w<=0.0){
    gl_Position=vec4(2.0,2.0,2.0,1.0);vW=vU=vV=vC=vec3(0.0);vQ=vM=vec2(0.0);vAge=vErode=vSeed=vGround=vOp=vR=vPl=0.0;return;}
  float r=(uGrow.x+(uGrow.y-uGrow.x)*(1.0-exp(-age/uGrow.z)))*world2.x*sc;
  vec3 fwd=vec3(world1.x,0.0,world1.y),side=vec3(-fwd.z,0.0,fwd.x);
  float reach=(uJet.x*uJet.y*(1.0-exp(-age/uJet.y))+uRoll*age)*world2.y;
  float rise=uJet.z*uJet.w*(1.0-exp(-age/uJet.w))*world2.z;
  // (the wind's carry, 0.7 to 1.3 of the era's for each puff)
  vec3 m=world0.xyz+fwd*reach+vec3(0.0,rise,0.0)+uWind*age*(0.7+0.6*fract(seed*2.93));
  // the frame: across, the shot's way tilted a little up (a jet near the level, a grown puff a little more: a top-down
  // eye sees it whole, and it stays low, where it hangs: an upright card stands metres high and reads metres ahead)
  float tilt=mix(0.08,0.15+0.2*fract(seed*4.17),1.0-exp(-age/2.0));
  vec3 U=normalize(fwd+vec3(0.0,tilt,0.0)),V=side;
  float pl=exp(-age/uPlume.y),st=(uPlume.x-1.0)*pl;
  float rx=r*(1.0+st),ry=r*mix(1.0,uPlume.z,1.0-pl);
  // its back at the muzzles (behind them grown: the smoke rolls back over the front rank's muskets)
  vec3 c=m+U*(rx*mix(0.55,0.2,1.0-pl));
  vGround=world0.y-uHeight;
  vec3 p=c+U*(position.x*rx)+V*(position.y*ry);
  vU=U;vV=V;vC=c;vQ=position.xy;vM=position.xy*vec2(rx,ry);vR=r;
  vAge=age;vSeed=seed;vPl=pl;
  vErode=clamp((age/life-uGrow.w)/(1.0-uGrow.w),0.0,1.0);
  vOp=(1.0-uThin*min(1.0,age/life))*world2.w;
  vW=p;gl_Position=viewProjection*vec4(p,1.0);}
