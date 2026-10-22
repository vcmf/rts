precision highp float;attribute vec3 position;attribute vec3 normal;attribute float aRiver;uniform mat4 world,viewProjection;
varying vec3 vW,vN;varying float vRiver;
#ifdef TRAMPLE
// the ground trodden under the formations (batch C, src/look/units.ts trample): a world box's mask, read at the vertex
// (a vertex-stage fetch: the fragment stage's samplers are full), uTrampleBox: its corner and 1 / its size
uniform sampler2D uTrample;uniform vec4 uTrampleBox;varying float vTrample;
#endif
void main(){vec4 w=world*vec4(position,1.0);vW=w.xyz;vN=normalize(mat3(world)*normal);vRiver=aRiver;
  #ifdef TRAMPLE
  // (outside the box: none, not its clamped edge smeared outward)
  vec2 tu=(w.xz-uTrampleBox.xy)*uTrampleBox.z;
  vTrample=tu.x>=0.0&&tu.y>=0.0&&tu.x<=1.0&&tu.y<=1.0?texture2D(uTrample,tu).r:0.0;
  #endif
  gl_Position=viewProjection*w;}