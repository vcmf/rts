precision highp float;varying vec2 vUV;uniform sampler2D textureSampler;uniform vec2 uSrc,uTiles;uniform float uDilate;
// the near blur's tiles (docs/plans/active/dof-v2.md, after Jimenez 2014): uDilate 0, each tile the largest near circle
// of confusion of the half-resolution pixels under it (textureSampler: dofdown.frag, uSrc its size, uTiles the tiles');
// uDilate 1, each tile the largest of the 3 x 3 round it (textureSampler: the tiles). A sharp pixel beside a near crown
// so knows how far to gather it: the blur spreads over the sharp ground, not stopping at the crown's edge
#include<dofcoc>
void main(){vec2 t=floor(vUV*uTiles);float m=0.0;
  if(uDilate>0.5){for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++)m=max(m,texture2D(textureSampler,(t+vec2(float(i),float(j))+0.5)/uTiles).r);}
  else{vec2 b=t*uSrc/uTiles;float k=uSrc.x/uTiles.x;
    for(int j=0;j<8;j++)for(int i=0;i<8;i++){if(float(i)>=k||float(j)>=k)continue;vec2 uv=(b+vec2(float(i),float(j))+0.5)/uSrc;m=max(m,cocN(lensS(texture2D(textureSampler,uv).a),uv));}}
  gl_FragColor=vec4(m,0.0,0.0,1.0);}
