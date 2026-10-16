precision highp float;attribute vec3 position;attribute vec3 normal;attribute vec2 aCorner;attribute vec4 aCard;attribute vec3 aCrown;attribute float aRole;attribute vec3 aEllC;attribute vec2 aEllR;
#include<instancesDeclaration>
uniform mat4 viewProjection;uniform mat4 view;uniform vec3 uCamPos;
#ifdef LEAF_LOSS
uniform float uSeason;
#endif

#ifdef INSTANCES
attribute float aTint;
#ifdef FAR_FADE
attribute float aFade;   // a far tree's fade to its crown mesh (src/look/nature.ts, farCuller)
#endif
#endif
#include<cards>
varying vec3 vW,vN,vS;varying float vTint,vOcc,vH,vRole;varying vec2 vRoot,vUV;
varying vec3 vEllC,vEllR,vTU,vTV;   // L7b: the crown ellipsoid in the world, the card texture axes in the world
varying float vDrop;                 // LEAF_LOSS: the card's draw (cards.glsl)
varying float vFade;                 // FAR_FADE: 0 all cards, 1 all crown mesh
void main(){
  #include<instancesVertex>
  vec4 c=finalWorld*vec4(position,1.0);
  float sc=length(finalWorld[0].xyz);
  #ifdef LEAF_LOSS
  float tuft=tuftScale(uSeason);
  #else
  float tuft=1.0;
  #endif
  vec3 w=c.xyz+cardOffset(aCard,aCorner,view,sc*tuft);                // the card, facing the camera
  vUV=cardUV(aCard,aCorner);vDrop=cardDrop(aCard,c.xyz);
  vEllC=(finalWorld*vec4(aEllC,1.0)).xyz;vEllR=vec3(aEllR.x,aEllR.y,aEllR.x)*sc;
  cardAxes(aCard,view,vTU,vTV);
  vOcc=clamp(0.62+(position.y-aCrown.y)*0.55+length(position.xz-aCrown.xz)*0.25,0.0,1.0);
  vN=normalize(mat3(finalWorld)*normal);vW=w;vH=w.y-finalWorld[3].y;vRoot=finalWorld[3].xz;vRole=aRole;
  vS=c.xyz+vN*(aCard.w+0.3)*aCard.x*sc;                         // the card on the crown surface: one shadow per card
  float t=0.5;
  #ifdef INSTANCES
  t=aTint;
  #endif
  vTint=t;vFade=0.0;
  #if defined(INSTANCES)&&defined(FAR_FADE)
  vFade=aFade;
  #endif
  gl_Position=viewProjection*vec4(w,1.0);}
