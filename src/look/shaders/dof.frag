precision highp float;varying vec2 vUV;uniform sampler2D textureSampler;uniform vec2 uTexel,uDir;uniform float uFocus,uRange,uMaxPx;
float coc(float d){return clamp(abs(d-uFocus)/uRange,0.0,1.0);}
void main(){vec4 c0=texture2D(textureSampler,vUV);float r=coc(c0.a)*uMaxPx;vec3 acc=c0.rgb;float w=1.0;
  for(int i=1;i<=4;i++){float o=float(i)/4.0*r;for(int s=-1;s<=1;s+=2){vec4 t=texture2D(textureSampler,vUV+uDir*uTexel*o*float(s));float wt=coc(t.a);acc+=t.rgb*wt;w+=wt;}}
  gl_FragColor=vec4(acc/w,c0.a);}