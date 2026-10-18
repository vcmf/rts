precision highp float;varying vec2 vUV;uniform sampler2D textureSampler;uniform vec2 uTexel,uOut;
// the depth of field's scene at half resolution (docs/plans/active/dof-v2.md; dof.frag reads it): each
// pixel the four scene pixels under it (the block 2o, 2o + 1 of output pixel o, so an odd size drops the last row or
// column rather than drifting), read at their centres: their colour averaged (a figure narrower than the block is
// blurred, not dropped) and one of their lens terms: the nearest where it lies past the near band (a near silhouette
// survives the half resolution), else the farthest (a blend of two depths would be no surface). A unit is left out of
// both: a block of units alone stays a unit
// The depth of field's one guard (docs/plans/done/nan-guard.md): a pixel that is not a finite number (on the 8-bit
// target, which stores one as 0: its alpha the code 0, isBad) is left out of the average; with all four out, the ring two pixels round them is averaged instead. The test (abs below the half
// float's largest) is one no compiler folds away, as it may x == x
#include<dofcoc>
bool ok(vec4 s){return all(lessThan(abs(s),vec4(65504.0)))&&!isBad(s.a);}
void main(){vec2 q=floor(vUV*uOut)*2.0+0.5;vec3 c=vec3(0.0);float far=-1.0,near=2.0,n=0.0;
  for(int i=0;i<4;i++){vec4 s=texture2D(textureSampler,(q+vec2(float(i-i/2*2),float(i/2)))*uTexel);if(ok(s)){c+=s.rgb;if(!isUnit(s.a)){far=max(far,s.a);near=min(near,s.a);}n+=1.0;}}
  if(n==0.0)for(int i=0;i<4;i++){vec4 s=texture2D(textureSampler,(q+0.5+vec2(float(i-i/2*2)*2.0-1.0,float(i/2)*2.0-1.0)*2.0)*uTexel);if(ok(s)){c+=s.rgb;if(!isUnit(s.a)){far=max(far,s.a);near=min(near,s.a);}n+=1.0;}}
  float a=far<0.0?170.0/255.0:-lensS(near)>uNBand?near:far;   // (all units: a unit)
  gl_FragColor=vec4(c/max(n,1.0),a);}
