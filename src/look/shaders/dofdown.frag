precision highp float;varying vec2 vUV;uniform sampler2D textureSampler;uniform vec2 uTexel,uOut;
// the depth of field's scene at half resolution (decision 0024; dof.frag reads it): each pixel the four scene pixels
// under it (the block 2o, 2o + 1 of output pixel o, so an odd size drops the last row or column rather than drifting),
// read at their centres: their colour averaged (a figure narrower than the block is blurred, not dropped) and the
// farthest of their distances (a blend of two depths would be no surface), in alpha as the materials write it
void main(){vec2 q=floor(vUV*uOut)*2.0+0.5;vec4 s=texture2D(textureSampler,q*uTexel);vec3 c=s.rgb;float a=s.a;
  for(int i=1;i<4;i++){s=texture2D(textureSampler,(q+vec2(float(i-i/2*2),float(i/2)))*uTexel);c+=s.rgb;a=max(a,s.a);}
  gl_FragColor=vec4(c*0.25,a);}
