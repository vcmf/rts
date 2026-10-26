precision highp float;attribute vec3 position;
#include<instancesDeclaration>
// THE SIMPLE SHADOWS (decision 0049; src/look/units.ts): each soldier draws his own shadow in the main pass, a grid lying
// on the ground from his feet along the sun's shadow (uShDir; position: 0 to 1 across it in x, along it in z), on the
// battalion's own instances: his place moves with him every frame (the step's place and the share of the next step's
// move gone: aNext, uStepFrac). His facing (his pose's turn) picks two of the shape's facings, blended; his clip's
// first step (aVAT.x) his role's row (uRoleStart). uShapeAt: the atlas's anchor, where a cell's first texel lies (m
// from his feet, across and along: the strip moves within it, the shape's texels stay where they are); uShapeCell: a cell's texels across and along, 1 / the atlas's size; uShapeTexel: 1 / the shape's texel
// (m), a cell's border (texels). Each vertex sits on the ground (uMeadow's R: the meadow map's height, or without one
// the heightfield's, src/look/units.ts),
// then is drawn toward the camera along its own view ray by uDecalLift / the ray's steepness: no shift on screen, and in
// depth it stands over the grass and the legs of the men in it. Not where his own feet stand (the lift grows from his
// feet over LIFT_RAMP m along the shadow): with the sun behind the camera the ground behind him lies under his shins on
// screen, and a lifted shadow there would darken them. vLM: where it lies in the tile's top-down maps (the ground's
// shade, read by the fragment). The strip (uStrip: across and along start, their spans, m from his feet) and its four
// rows' places along it (uRows, 0 to 1; position.z picks the row) are the CPU's (decalStrip, src/look/shadow-look.ts):
// far off decision 0049's strip, up close the full box with rows at his soles and at the lift ramp's end, blended by
// the look's far share; past the soles it is drawn uShLen as long (the zoom's look, decision 0062: the shape's own texels stretched or shortened, his feet where they were).
// vAlong: m along it from his soles at the shape's own size times uShLen (the far figures' growth leaves the
// fragment's gradient where it lies on the shape)
uniform mat4 viewProjection;uniform vec3 uCamPos;
attribute vec3 aVAT;attribute vec3 aNext;
// his pose (units.vert's): x, y, z, his turn about y, as world0; his matrix from it (unitPose)
#include<unitPose>
uniform vec4 uRoleStart,uShapeCell,uStrip,uRows;uniform vec2 uShDir,uShapeTexel,uShapeAt;uniform float uStepFrac,uDecalLift,uShLen;
uniform mat4 uLMVP;
uniform sampler2D uMeadow;
#ifdef FAR_SCALE
// the far figure drawn larger as it shrinks on screen (units.vert's FAR_SCALE, the same rule: uFarScale.x across and
// along the ground, uFarScale.y up): his shadow with him, its footprint about his feet by x, its cast length (what his
// height throws along the sun, past his feet) by y
uniform vec2 uFarK,uFarScale;
#ifndef FAR_FROM
#define FAR_FROM 0.9
#endif
#endif
varying vec2 vUV0,vUV1,vLM;varying float vT,vAlong;
void main(){
  mat4 finalWorld=poseWorld(world0);
  vec3 p=finalWorld[3].xyz+aNext*uStepFrac;
  float j=position.z*DECAL_ALONG;
  vec2 q=vec2(position.x,j<0.5?uRows.x:j<1.5?uRows.y:j<2.5?uRows.z:uRows.w);
  vec2 l=uStrip.xy+q*uStrip.zw,l0=l;
  vAlong=l.y*(l.y>0.0?uShLen:1.0);
  #ifdef FAR_SCALE
  float fpx=uFarK.x/max(1.0,distance(uCamPos,finalWorld[3].xyz)),fg=clamp((FAR_FROM*uFarK.y-fpx)/((FAR_FROM-0.25)*uFarK.y),0.0,1.0);
  l*=vec2(mix(1.0,uFarScale.x,fg),mix(1.0,l.y>0.0?uFarScale.y:uFarScale.x,fg));
  #endif
  l.y*=l.y>0.0?uShLen:1.0;
  vec2 C=vec2(-uShDir.y,uShDir.x),xz=p.xz+C*l.x+uShDir*l.y;
  float gy=textureLod(uMeadow,(xz+TILE_HALF)/TILE_W,0.0).r;
  vec3 g=vec3(xz.x,gy,xz.y),toCam=normalize(uCamPos-g);
  float lift=uDecalLift*smoothstep(0.0,LIFT_RAMP,l.y);
  gl_Position=viewProjection*vec4(g+toCam*(lift/max(0.2,toCam.y)),1.0);
  vec4 lp=uLMVP*vec4(g,1.0);vLM=lp.xy/lp.w*0.5+0.5;
  float a=world0.w,fk=fract(a/6.2831853)*FACINGS,k0=floor(fk),k1=mod(k0+1.0,FACINGS);
  vT=fk-k0;
  float row=abs(aVAT.x-uRoleStart.y)<0.5?1.0:abs(aVAT.x-uRoleStart.z)<0.5?2.0:abs(aVAT.x-uRoleStart.w)<0.5?3.0:0.0;
  vec2 c=(l0-uShapeAt)*uShapeTexel.x+uShapeTexel.y;
  vUV0=(vec2(k0,row)*uShapeCell.xy+c)*uShapeCell.zw;vUV1=(vec2(k1,row)*uShapeCell.xy+c)*uShapeCell.zw;}
