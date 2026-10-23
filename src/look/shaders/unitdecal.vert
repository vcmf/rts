precision highp float;attribute vec3 position;
#include<instancesDeclaration>
// THE SIMPLE SHADOWS (decision 0049; src/look/units.ts): each soldier draws his own shadow in the main pass, a grid lying
// on the ground from his feet along the sun's shadow (uShDir; position: 0 to 1 across it in x, along it in z), on the
// battalion's own instances: his place moves with him every frame (the step's place and the share of the next step's
// move gone: aNext, uStepFrac). His facing (the matrix's turn) picks two of the shape's facings, blended; his clip's
// first step (aVAT.x) his role's row (uRoleStart). uShapeBox: what a cell holds (m from his feet: across, along, then
// their spans); uShapeCell: a cell's texels across and along, 1 / the atlas's size; uShapeTexel: 1 / the shape's texel
// (m), a cell's border (texels). Each vertex sits on the ground (the meadow map's height, GROUND_MAP; else his root's),
// then is drawn toward the camera along its own view ray by uDecalLift / the ray's steepness: no shift on screen, and in
// depth it stands over the grass and the legs of the men in it. Not where his own feet stand (the lift grows from his
// feet over LIFT_RAMP m along the shadow): with the sun behind the camera the ground behind him lies under his shins on
// screen, and a lifted shadow there would darken them. vK: the ground's shade there (the ratio of its painted cast
// shadow to its light, uUnitShade: src/look/shaders/unitshade.frag), once a vertex (it varies over metres)
uniform mat4 viewProjection;uniform vec3 uCamPos;uniform sampler2D uUnitShade;
attribute vec3 aVAT;attribute vec3 aNext;
uniform vec4 uRoleStart,uShapeBox,uShapeCell;uniform vec2 uShDir,uShapeTexel;uniform float uStepFrac,uDecalLift;
uniform mat4 uLMVP;
#ifdef GROUND_MAP
uniform sampler2D uMeadow;
#endif
#ifdef FAR_SCALE
// the far figure drawn larger as it shrinks on screen (units.vert's FAR_SCALE, the same rule: uFarScale.x across and
// along the ground, uFarScale.y up): his shadow with him, its footprint about his feet by x, its cast length (what his
// height throws along the sun, past his feet) by y
uniform vec2 uFarK,uFarScale;
#endif
varying vec2 vUV0,vUV1;varying float vT;varying vec3 vK;
void main(){
  #include<instancesVertex>
  vec3 p=finalWorld[3].xyz+aNext*uStepFrac;
  vec2 l=uShapeBox.xy+position.xz*uShapeBox.zw;
  #ifdef FAR_SCALE
  float fpx=uFarK.x/max(1.0,distance(uCamPos,finalWorld[3].xyz)),fg=clamp((0.9*uFarK.y-fpx)/(0.65*uFarK.y),0.0,1.0);
  l*=vec2(mix(1.0,uFarScale.x,fg),mix(1.0,l.y>0.0?uFarScale.y:uFarScale.x,fg));
  #endif
  vec2 C=vec2(-uShDir.y,uShDir.x),xz=p.xz+C*l.x+uShDir*l.y;
  #ifdef GROUND_MAP
  float gy=textureLod(uMeadow,(xz+TILE_HALF)/TILE_W,0.0).r;
  #else
  float gy=p.y;
  #endif
  vec3 g=vec3(xz.x,gy,xz.y),toCam=normalize(uCamPos-g);
  float lift=uDecalLift*smoothstep(0.0,LIFT_RAMP,l.y);
  gl_Position=viewProjection*vec4(g+toCam*(lift/max(0.2,toCam.y)),1.0);
  vec4 lp=uLMVP*vec4(g,1.0);vK=textureLod(uUnitShade,lp.xy/lp.w*0.5+0.5,0.0).rgb;
  float a=atan(-finalWorld[0].z,finalWorld[0].x),fk=fract(a/6.2831853)*FACINGS,k0=floor(fk),k1=mod(k0+1.0,FACINGS);
  vT=fk-k0;
  float row=abs(aVAT.x-uRoleStart.y)<0.5?1.0:abs(aVAT.x-uRoleStart.z)<0.5?2.0:abs(aVAT.x-uRoleStart.w)<0.5?3.0:0.0;
  vec2 c=position.xz*uShapeBox.zw*uShapeTexel.x+uShapeTexel.y;
  vUV0=(vec2(k0,row)*uShapeCell.xy+c)*uShapeCell.zw;vUV1=(vec2(k1,row)*uShapeCell.xy+c)*uShapeCell.zw;}
