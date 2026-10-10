precision highp float;attribute vec3 position;attribute vec3 normal;uniform mat4 world,viewProjection;
varying vec3 vW,vN;void main(){vec4 w=world*vec4(position,1.0);vW=w.xyz;vN=normalize(mat3(world)*normal);gl_Position=viewProjection*w;}
