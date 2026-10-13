#extension GL_OES_standard_derivatives : enable
precision highp float;varying vec3 vW;varying float vAcross,vTau,vRiffle,vV;uniform sampler2D uRefl;
#include<painter>
#include<waterdata>
#include<shore>

// The painted water (docs/plans/done/w4-water-surface.md, research §2.8): opaque. Its lower layers (the bed, the
// absorption, the shadows, the shore foam) are the shore band's (src/look/shaders/shore.glsl), the same function the
// terrain paints near the water; the upper layers (rough water, sky tint, reflections, strokes, glitter, riffle foam)
// fade in past the band, where the water is always the surface drawn. vAcross: m from the centre line (+ left of the
// flow); vTau: the time of travel (s); vRiffle: 0 pool .. 1 riffle; vV: the section's speed (m/s).
const float STROKE_V=0.6;            // m/s: the strokes' scale along the flow (about the river's mean speed)
const float STROKE_P=20.0/STROKE_V;  // s: a whole period of every stroke pattern (its rates along are multiples of 0.05)
const float LEAF_P=200.0/STROKE_V;   // s: the leaves' period (layer 10)
float reflAt(vec2 xz){vec2 uv=(xz+TILE_HALF)/TILE_W;if(uv.x<0.0||uv.y<0.0||uv.x>1.0||uv.y>1.0)return 0.0;return texture2D(uRefl,uv).r;}
void main(){
  macroDerivs(vW.xz);   // before any branch (shore.glsl)
  pSnowLie=snowLie(vW.xz,pxMacro());   // the snow's lie, as the terrain's (the shore band's land side: the seam)
  #ifdef WATER_DEBUG
  if(uWaterView>0.5){gl_FragColor=vec4(waterView(vW.xz),1.0);return;}   // the water data's debug views
  #endif
  vec4 lm=LM(vW);float sh=(1.0-lm.r)*uShadowsOn,occ=mix(1.0,groundOcc(lm),uAO);
  vec4 t=waterTexel(vW.xz);float d=max(waterDepth(t),0.0),s=waterSdf(t),sp=length(waterFlow(t)),fws=fwidth(s);   // fws: the branches' margin (shore.glsl)
  vec2 ia=iceAt(vW.xz,sp,d);   // the ice here (shore.glsl), once for every layer
  #ifdef WATER_SAB_OWN
  // the seam check's sabotage: the water painting itself in the band (every layer wherever it is wet, the dry side lit
  // with the water's flat normal instead of the bank normals)
  const float UP0=0.0;
  vec3 c=s<=0.0?paint(landAlbedo(vW.xz,max(-s,0.0),-waterDepth(t)),vec3(0.0,1.0,0.0),vW,occ,0.12,1.0,sh)*(1.0+(G(vW.xz/4.0).r-0.5)*uGrainAmt*0.14):shore(vW,t,occ,sh,fws,ia);
  #else
  const float UP0=WATER_BAND;   // the upper layers: none within the band
  vec3 c=shore(vW,t,occ,sh,fws,ia);
  #endif
  // the upper layers' weight: faded in past the band, and under the winter ice (it covers every layer, shore.glsl)
  float up=smoothstep(UP0,UP0+0.5,s)*(1.0-0.9*ia.x);
  if(s>UP0-1.5*fws){   // past where the layers below have weight, by the derivatives' margin (src/look/shaders/shore.glsl)
    vec3 V=normalize(uCamPos-vW),R=reflect(-V,vec3(0.0,1.0,0.0));
    float across=vAcross,cs=max(cloud(vW)*0.6,sh);
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
    c=mix(c,vec3(0.62,0.74,0.86),(0.12+fr*0.40)*smoothstep(0.2,1.0,d)*(1.0-0.6*rough)*up*(1.0-0.7*frost()));   // less on winter's dark water
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
    c+=uSunCol*mix(vec3(1.0,0.86,0.58),vec3(0.80,0.88,1.0),frost())*dab*(0.2+spec*1.6)*(1.0-cs)*smoothstep(0.15,0.5,d)*up*near*(1.0-0.7*frost());   // fewer and cold in winter (W5b)
    // 9. riffle foam: broken streaks along the current (the grain's dry-brush channel, long along x), bent into
    // chevrons pointing upstream, hard-edged
    float chev=G(vec2(along*0.05+abs(across)*0.02,across*0.03)).b;
    float riff=smoothstep(0.35,0.65,riffle)*aastep(0.66,chev)*aastep(0.45,G(vW.xz/11.0+0.3).g);
    c=mix(c,FOAM*mix(1.0,0.78,cs),riff*0.85*up*near);
    // 10. autumn leaves (W5b): from early autumn until the ice, drifting with the current on slow water (none from a
    // speed of 0.62). Cells in the time of travel's coordinates (4 along by 1.6 m across), the clock wrapped to a period
    // of LEAF_P*STROKE_V = 200 along (50 cells, the hash's period along: the wrap is seamless, the layout repeats only
    // past 200 m of travel); most hold one leaf at a hashed place, angle, size (0.5–0.75 m: painted larger than life,
    // to read from the game's zooms) and colour, drawn in metres (along scaled by the section's speed vV over the
    // strokes'). Each pixel reads the 2×2 cells nearest it: a leaf reaches at most half a cell from its centre, so none
    // is cut at a cell's edge. The edge anti-aliased in metres over 1.2 pixels; the leaves fade as a pixel grows past
    // 0.15–0.3 m (they would be under a pixel); under the ice, none
    float lw=smoothstep(0.6,1.3,uSeason)*(1.0-smoothstep(2.1,2.5,uSeason));
    #ifdef WATER_SAB_NOLEAVES
    lw=0.0;   // the leaves check's sabotage: none
    #endif
    if(lw>0.0){   // uniform
      #ifdef WATER_SAB_LEAFALL
      float still=1.0;   // the leaves check's sabotage: at any speed
      #else
      float still=1.0-smoothstep(0.45,0.62,sp);
      #endif
      float px=pxGround(vW),k=max(vV,0.2)/STROKE_V,aL=(vTau-mod(uTime,LEAF_P))*STROKE_V;
      float lwt=still*(1.0-smoothstep(0.15,0.3,px))*smoothstep(UP0,UP0+0.5,s)*(1.0-ia.x);   // the leaves' weight here
      vec2 cs2=vec2(4.0,1.6),u=vec2(aL,across)/cs2,base=floor(u-0.5);   // the 2×2 cells nearest: from base to base+1
      float leaf=0.0;vec3 lc=vec3(0.0);
      if(lwt>0.0)for(int m=0;m<4;m++){   // skipped where they have no weight (no derivatives inside)
        vec2 cl=base+vec2(float(m-2*(m/2)),float(m/2)),cw=vec2(mod(cl.x,50.0),cl.y);
        vec4 h=fract(sin(vec4(dot(cw,vec2(12.9898,78.233)),dot(cw,vec2(39.346,11.135)),dot(cw,vec2(73.156,52.235)),dot(cw,vec2(26.651,94.673))))*43758.5453);
        if(fract(h.x*7.31+h.y*3.17)>0.9*lw)continue;
        float L=0.5+0.25*h.z,ang=h.w*6.2832;
        vec2 q=(u-cl-0.25-0.5*h.xy)*cs2*vec2(k,1.0);
        q=mat2(cos(ang),sin(ang),-sin(ang),cos(ang))*q;
        vec2 ax=vec2(0.5,0.28)*L,qa=q/ax;float e=length(qa),dist=(e-1.0)/max(length(qa/ax)/max(e,1e-4),1e-4);   // ≈ metres outside the edge
        float lf=1.0-smoothstep(-0.6*px,0.6*px,dist);
        if(lf>leaf){leaf=lf;float pick=fract(h.z*5.71);
          lc=pick<0.35?vec3(0.86,0.46,0.12):pick<0.6?vec3(0.92,0.74,0.22):pick<0.82?vec3(0.70,0.17,0.10):vec3(0.46,0.30,0.18);}
      }
      // late autumn browner (the trees' palette, painter.glsl), all a little darker for being wet
      lc=mix(lc,mix(lc*vec3(0.80,0.62,0.50),vec3(0.46,0.30,0.18),0.45),clamp(uSeason-1.0,0.0,1.0))*0.9;
      c=mix(c,lc*mix(1.0,0.62,cs),leaf*lwt);
    }
  }
  c=withStones(c,vW,s,sh,ia.x);   // the stones' foam, over every layer (shore.glsl)
  gl_FragColor=vec4(atmos(mist(c,vW,lm,0.0),vW),depthA(vW));}
