precision highp float;attribute vec3 position;
#include<instancesDeclaration>
// THE SIMPLE SHADOWS (decision 0049; src/look/units.ts): a quad a man, lying on the ground from his feet along the
// sun's shadow (uShDir), drawn into the top-down mask over uMaskBox (its world corner and 1 / its size). His place moves
// every frame: the step's place and the share of the next step gone (aNext, uStepFrac). His facing (the matrix's turn)
// picks two of the shape's facings, blended; his clip's first step (aVAT.x) its role's row (uRoleStart: the roles'
// first steps, in the shape's row order). position: the quad's corner (0 or 1, across and along); uShapeBox: what a cell
// holds (m from his feet: across, along, then their spans); uShapeCell: a cell's texels across and along, 1 / the
// atlas's size; uShapeTexel: 1 / the shape's texel (m), a cell's empty border (texels)
attribute vec3 aVAT;attribute vec3 aNext;
uniform vec4 uMaskBox,uRoleStart,uShapeBox,uShapeCell;uniform vec2 uShDir,uShapeTexel;uniform float uStepFrac;
varying vec2 vUV0,vUV1;varying float vT;
void main(){
  #include<instancesVertex>
  vec3 p=finalWorld[3].xyz+aNext*uStepFrac;
  vec2 l=uShapeBox.xy+position.xz*uShapeBox.zw,C=vec2(-uShDir.y,uShDir.x),w=p.xz+C*l.x+uShDir*l.y;
  gl_Position=vec4((w-uMaskBox.xy)*uMaskBox.z*2.0-1.0,0.0,1.0);
  float a=atan(-finalWorld[0].z,finalWorld[0].x),fk=fract(a/6.2831853)*FACINGS,k0=floor(fk),k1=mod(k0+1.0,FACINGS);
  vT=fk-k0;
  float row=abs(aVAT.x-uRoleStart.y)<0.5?1.0:abs(aVAT.x-uRoleStart.z)<0.5?2.0:abs(aVAT.x-uRoleStart.w)<0.5?3.0:0.0;
  vec2 c=position.xz*uShapeBox.zw*uShapeTexel.x+uShapeTexel.y;
  vUV0=(vec2(k0,row)*uShapeCell.xy+c)*uShapeCell.zw;vUV1=(vec2(k1,row)*uShapeCell.xy+c)*uShapeCell.zw;}
