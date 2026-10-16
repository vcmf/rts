precision highp float;varying vec2 vUV;
// a trunk's shadow, multiplied into the light map's sun (R) once it is baked: crisp at the root, its edge softening
// along it as the crowns' penumbra grows with the distance to the caster, fading out where the crown's shadow starts.
// The other channels are kept (times 1)
void main(){float e=mix(0.25,0.85,vUV.y),a=1.0-smoothstep(1.0-e,1.0,abs(vUV.x));
  a*=1.0-smoothstep(0.8,1.0,vUV.y);
  gl_FragColor=vec4(1.0-TRUNK_DARK*a,1.0,1.0,1.0);}
