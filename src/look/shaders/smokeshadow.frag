#extension GL_OES_standard_derivatives : enable
precision highp float;varying vec3 vW,vN,vObj;varying float vAge,vErode,vSeed,vGround;
uniform vec2 uEdge;uniform float uShadeAmt;
#ifdef CLEAR
uniform sampler2D uClearTex;uniform vec4 uClear;
#endif
#ifdef SHADE_MAP
uniform sampler2D uUnitShade;
#endif
#include<painter>
// THE SMOKE'S OFFSET SHADOW (src/look/smoke.ts): the puff flattened onto the ground along the sun (smoke.vert, SHADOW),
// its shape as the sun sees it (its facing to the sun in place of the eye, the same grain and erosion as the puff), cut
// off the formations (the mask where it lies), darkening the ground toward its painted full shadow (uUnitShade, the
// soldiers' shadows' shade, when it is baked; else a cool constant) by uShadeAmt. The blend is dst · src, the lens term
// kept; the stencil lets one shadow darken a sample once (src/look/smoke.ts)
void main(){
  float g=0.5*(G(vObj.xy*0.35).g+G(vObj.zy*0.35+0.37).g);
  float keep=abs(dot(normalize(vN),uSunDir))-uEdge.x+(g-0.5)*uEdge.y-vErode*(1.05+uEdge.y);
  if(keep<0.0)discard;
  #ifdef CLEAR
  if(texture2D(uClearTex,(vW.xz-uClear.xy)*uClear.z).r>0.35)discard;
  #endif
  #ifdef SHADE_MAP
  vec3 k=texture2D(uUnitShade,lmUV(vW)).rgb;
  #else
  vec3 k=vec3(0.55,0.58,0.68);
  #endif
  gl_FragColor=vec4(mix(vec3(1.0),k,uShadeAmt*uShadowsOn),1.0);}
