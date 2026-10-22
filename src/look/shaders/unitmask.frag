precision highp float;uniform sampler2D uShapeTex;varying vec2 vUV0,vUV1;varying float vT;
// the shape's two facings blended; the target blends by MAX: shadows that overlap do not darken twice
void main(){float s=mix(texture2D(uShapeTex,vUV0).r,texture2D(uShapeTex,vUV1).r,vT);gl_FragColor=vec4(s,s,s,s);}
