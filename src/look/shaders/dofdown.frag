precision highp float;varying vec2 vUV;uniform sampler2D textureSampler;uniform vec2 uTexel,uOut;
// the depth of field's scene at half resolution (decision 0024; dof.frag reads it): each pixel the four scene pixels
// under it (the block 2o, 2o + 1 of output pixel o, so an odd size drops the last row or column rather than drifting),
// read at their centres: their colour averaged (a figure narrower than the block is blurred, not dropped) and the
// farthest of their distances (a blend of two depths would be no surface), in alpha as the materials write it
// The depth of field's one guard (docs/plans/done/nan-guard.md): a pixel that is not a finite number (a NaN or an
// infinity some material wrote; the blur would spread it into a dark block) is left out of the average; with all four
// out, the ring two pixels round them is averaged instead. The test (abs below the half float's largest) is one no
// compiler folds away, as it may x == x
bool ok(vec4 s){return all(lessThan(abs(s),vec4(65504.0)));}
void main(){vec2 q=floor(vUV*uOut)*2.0+0.5;vec3 c=vec3(0.0);float a=0.0,n=0.0;
  for(int i=0;i<4;i++){vec4 s=texture2D(textureSampler,(q+vec2(float(i-i/2*2),float(i/2)))*uTexel);if(ok(s)){c+=s.rgb;a=max(a,s.a);n+=1.0;}}
  if(n==0.0)for(int i=0;i<4;i++){vec4 s=texture2D(textureSampler,(q+0.5+vec2(float(i-i/2*2)*2.0-1.0,float(i/2)*2.0-1.0)*2.0)*uTexel);if(ok(s)){c+=s.rgb;a=max(a,s.a);n+=1.0;}}
  gl_FragColor=vec4(c/max(n,1.0),n>0.0?a:1.0);}
