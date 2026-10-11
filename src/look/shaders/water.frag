#extension GL_OES_standard_derivatives : enable
precision highp float;varying vec3 vW;varying vec2 vUv;varying float vTau,vRiffle;uniform sampler2D uRefl;
#include<painter>
#include<waterdata>
#include<shore>

// The painted water (docs/plans/active/w4-water-surface.md, research §2.8): opaque. Its lower layers (the bed, the
// absorption, the shadows, the shore foam) are the shore band's (src/look/shaders/shore.glsl), the same function the
// terrain paints near the water; the upper layers (rough water, sky tint, reflections, strokes, glitter, riffle foam)
// fade in past the band, where the water is always the surface drawn. vUv: across (m, + left of the flow), along (m);
// vTau: the time of travel (s); vRiffle: 0 pool .. 1 riffle.
const float STROKE_V=0.6;            // m/s: the strokes' scale along the flow (about the river's mean speed)
const float STROKE_P=20.0/STROKE_V;  // s: a whole period of every stroke pattern (its rates along are multiples of 0.05)
float reflAt(vec2 xz){vec2 uv=(xz+TILE_HALF)/TILE_W;if(uv.x<0.0||uv.y<0.0||uv.x>1.0||uv.y>1.0)return 0.0;return texture2D(uRefl,uv).r;}
void main(){
  #ifdef WATER_DEBUG
  if(uWaterView>0.5){gl_FragColor=vec4(waterView(vW.xz),1.0);return;}   // the water data's debug views
  #endif
  vec4 lm=LM(vW);float sh=(1.0-lm.r)*uShadowsOn,occ=mix(1.0,lm.g,uAO);
  vec4 t=waterTexel(vW.xz);float d=max(waterDepth(t),0.0),s=waterSdf(t),sp=length(waterFlow(t)),fws=fwidth(s);   // fws: the branches' margin (shore.glsl)
  #ifdef WATER_SAB_OWN
  // the seam check's sabotage: the water painting itself in the band (every layer wherever it is wet, the dry side lit
  // with the water's flat normal instead of the bank normals)
  const float UP0=0.0;
  vec3 c=s<=0.0?paint(landAlbedo(vW.xz),vec3(0.0,1.0,0.0),vW,occ,0.12,1.0,sh)*(1.0+(G(vW.xz/4.0).r-0.5)*uGrainAmt*0.14):shore(vW,t,occ,sh,fws);
  #else
  const float UP0=WATER_BAND;   // the upper layers: none within the band
  vec3 c=shore(vW,t,occ,sh,fws);
  #endif
  // the upper layers' weight: faded in past the band, and under the winter ice (it covers every layer, shore.glsl)
  float up=smoothstep(UP0,UP0+0.5,s)*(1.0-0.9*iceAmt());
  if(s>UP0-1.5*fws){   // past where the layers below have weight, by the derivatives' margin (src/look/shaders/shore.glsl)
    vec3 V=normalize(uCamPos-vW),R=reflect(-V,vec3(0.0,1.0,0.0));
    float across=vUv.x,cs=max(cloud(vW)*0.6,sh);
    // the marks under 0.3 m (strokes, glitter, riffle foam) fade as a pixel's footprint grows past them (shore.glsl)
    float near=1.0-smoothstep(0.25,0.5,pxGround(vW));
    #ifdef WATER_SAB_FLAT
    float riffle=0.0;   // the pool and riffle check's sabotage: the riffle ignored
    #else
    float riffle=vRiffle;
    #endif
    // 3. calm and rough: riffles, and fast shallow water, break the surface
    float rough=max(smoothstep(0.3,0.65,riffle),smoothstep(0.6,0.9,sp)*smoothstep(1.2,0.5,d));
    // the strokes' coordinate along the flow: the time of travel against the clock, wrapped to a whole period
    // (research §4.3: features stretch where the water is fast and never shear)
    float along=(vTau-mod(uTime,STROKE_P))*STROKE_V;
    // 4. the painted sky tint at grazing view (no sky is drawn), less on rough water
    float fr=pow(1.0-max(V.y,0.0),2.5);
    c=mix(c,vec3(0.62,0.74,0.86),(0.12+fr*0.40)*smoothstep(0.2,1.0,d)*(1.0-0.6*rough)*up);
    // 5. tree reflections: the mirrored view ray traced up to crown height in the baked canopy mask, broken on riffles
    float wob=(G(vec2(across*0.6,along*0.25)).r-0.5)*(0.9+1.6*rough);
    vec2 o=R.xz/max(R.y,0.2);
    float rf=max(reflAt(vW.xz+o*4.0+vec2(wob,0.0)),reflAt(vW.xz+o*7.5+vec2(wob*1.5,0.0)));
    c=mix(c,vec3(0.08,0.17,0.13),smoothstep(0.25,0.6,rf)*0.62*smoothstep(0.15,0.5,d)*(1.0-0.7*rough)*up);
    // 6. strokes along the current: light marks (more on riffles), a few dark ones in pools, none where it is slow
    float st=G(vec2(along*0.05,across*0.12)).b,st2=G(vec2(along*0.10+0.37,across*0.35+0.2)).g;
    float slow=smoothstep(0.08,0.25,sp),marks=smoothstep(0.62,0.80,st*0.6+st2*0.4)*smoothstep(0.15,0.6,d)*slow;
    c=mix(c,c*1.12+vec3(0.03,0.05,0.05),marks*(0.35+0.4*rough)*up*near);
    c=mix(c,c*0.82,smoothstep(0.70,0.85,st2)*0.25*(1.0-rough)*smoothstep(0.3,0.8,d)*slow*up*near);
    // 8. glitter: painted sun dabs, mostly on riffles
    float spec=pow(max(dot(R,uSunDir),0.0),5.0);
    float dab=aastep(mix(0.80,0.73,rough),G(vec2(along*0.10,across*0.25)).g)*aastep(0.5,G(vW.xz/9.0+mod(uTime,200.0/3.0)*0.015).g);
    c+=uSunCol*vec3(1.0,0.86,0.58)*dab*(0.2+spec*1.6)*(1.0-cs)*smoothstep(0.15,0.5,d)*up*near;
    // 9. riffle foam: broken streaks along the current (the grain's dry-brush channel, long along x), bent into
    // chevrons pointing upstream, hard-edged
    float chev=G(vec2(along*0.05+abs(across)*0.02,across*0.03)).b;
    float riff=smoothstep(0.35,0.65,riffle)*aastep(0.66,chev)*aastep(0.45,G(vW.xz/11.0+0.3).g);
    c=mix(c,FOAM*mix(1.0,0.78,cs),riff*0.85*up*near);
  }
  gl_FragColor=vec4(atmos(mist(c,vW,lm,0.0),vW),depthA(vW));}
