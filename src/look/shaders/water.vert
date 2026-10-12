precision highp float;attribute vec3 position;attribute float aAcross,aTau,aRiffle,aV;uniform mat4 world,viewProjection;
varying vec3 vW;varying float vAcross,vTau,vRiffle,vV;
void main(){vec4 w=world*vec4(position,1.0);vW=w.xyz;vAcross=aAcross;vTau=aTau;vRiffle=aRiffle;vV=aV;gl_Position=viewProjection*w;}
