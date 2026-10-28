precision highp float;attribute vec3 position;
#include<instancesDeclaration>
// THE MUSKET SMOKE (src/look/smoke.ts, decision 0080): a puff an instance, its first two columns its birth place (m)
// and clock (s), its way ahead (x, z), seed and life (s); the rest unused (src/look/world/smoke.ts, volleyPuffs). The
// mesh is one quad (corners ±1): a card facing the camera, sized and moved by the puff's age (puffAt, mirrored for the
// tests): the blast's jet ahead dying over uJet.y and the bank's slow roll (uRoll), the air's rise slowing over
// uJet.w, the wind's carry, growth from uGrow.x to uGrow.y over uGrow.z. Young, the card is a plume: stretched along
// the shot as the eye sees it (uPlume: the stretch at birth, its relaxing time), its back at the muzzle. A puff not
// born or past its life, or thinned out by the zoom (keepScale: uKeep, its share kept and the shrink's band), is put
// outside the view
uniform mat4 viewProjection;uniform vec3 uCamPos,uWind;uniform vec4 uJet,uGrow;uniform vec2 uKeep;uniform vec3 uPlume;
uniform float uSmokeT,uHeight,uRoll,uThin;
varying vec3 vW,vU,vV,vC;varying vec2 vQ,vM;varying float vAge,vErode,vSeed,vGround,vOp,vR,vPl;
void main(){
  float birth=world0.w,life=world1.w,seed=world1.z,age=uSmokeT-birth;
  float keep=uKeep.x,sc=clamp((keep*(1.0+uKeep.y)-fract(seed*13.73))/(uKeep.y*keep),0.0,1.0)/sqrt(keep);
  if(age<0.0||age>=life||sc<=0.0){
    gl_Position=vec4(2.0,2.0,2.0,1.0);vW=vU=vV=vC=vec3(0.0);vQ=vM=vec2(0.0);vAge=vErode=vSeed=vGround=vOp=vR=vPl=0.0;return;}
  // (each puff its own: its size 0.8 to 1.2, its blast's reach 0.7 to 1.3 and its rise 0.6 to 1.4 of the era's)
  float r=(uGrow.x+(uGrow.y-uGrow.x)*(1.0-exp(-age/uGrow.z)))*(0.8+0.4*fract(seed*7.31))*sc;
  vec3 fwd=vec3(world1.x,0.0,world1.y);
  float jet=uJet.x*uJet.y*(1.0-exp(-age/uJet.y))*(0.7+0.6*fract(seed*3.71))+uRoll*age;
  float rise=uJet.z*uJet.w*(1.0-exp(-age/uJet.w))*(0.6+0.8*fract(seed*5.93));
  vec3 c=world0.xyz+fwd*jet+vec3(0.0,rise,0.0)+uWind*age;
  // the card's frame: across it the shot's way as the eye sees it (the camera's right where the shot runs at the eye)
  vec3 toCam=normalize(uCamPos-c);
  vec3 u=fwd-toCam*dot(fwd,toCam);float lu=length(u);
  vec3 right=normalize(cross(vec3(0.0,1.0,0.0),toCam));
  vec3 U=normalize(mix(right*sign(dot(right,fwd)+1e-4),u/max(lu,1e-4),smoothstep(0.1,0.4,lu)));
  vec3 V=cross(toCam,U);
  // the plume: stretched along the shot by its foreshortened length, its back held at the muzzle
  // and wide along the front (uPlume.z, its width over its depth): a rank's plumes one sheet, its puffs one bank
  float pl=exp(-age/uPlume.y),st=(uPlume.x-1.0)*pl*lu;
  float rx=r*(1.0+st),ry=r*uPlume.z;
  c+=U*(r*st);
  // (kept off the ground it was born over: the card's lower part, where its shape is still dense, above it)
  vGround=world0.y-uHeight;
  c.y=max(c.y,vGround+0.3*(ry*abs(V.y)+rx*abs(U.y)));
  vec3 p=c+U*(position.x*rx)+V*(position.y*ry);
  vU=U;vV=V;vC=c;vQ=position.xy;vM=position.xy*vec2(rx,ry);vR=r;
  vAge=age;vSeed=seed;vPl=pl;
  vErode=clamp((age/life-uGrow.w)/(1.0-uGrow.w),0.0,1.0);
  vOp=1.0-uThin*min(1.0,age/life);
  vW=p;gl_Position=viewProjection*vec4(p,1.0);}
