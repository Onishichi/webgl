precision mediump float;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;

const float angle=80.;
const float PI=3.14159265;
const float fov=radians(angle)*.5;

const vec3 SUN_LIGHT_ATTENUATION_RATE=vec3(.99,.85,.8);
const float SKY_HEIGHT=.2;

const float SEA_HEIGHT=.6;
const float SEA_CHOPPY=4.;
const float SEA_SPEED=5.;
const float SEA_FREQ=.15;

const vec3 SEA_WATER_COLOR=vec3(.3647,.4078,.1804);
const vec3 SKY_BASE_COLOR=vec3(.5176,.8078,1.);

const float FOG_ATTENUATION_RATE=.99;
const float FOG_START=30.;

const vec3 SEA_BASE_COLOR=vec3(.0745,.1843,.2863);

const float SUN_SIZE=1.05;

vec3 hsv(float h,float s,float v){
    vec4 t=vec4(1.,2./3.,1./3.,3.);
    vec3 p=abs(fract(vec3(h)+t.xyz)*6.-vec3(t.w));
    return v*mix(vec3(t.x),clamp(p-vec3(t.x),0.,1.),s);
}

float hash(vec2 p)
{
    float h=dot(p,vec2(127.1,311.7));
    return fract(sin(h)*43758.5453123);
}

float noise(in vec2 p)
{
    vec2 i=floor(p);
    vec2 f=fract(p);
    
    // u = -2.0f^3 + 3.0f^2
    vec2 u=f*f*(3.-2.*f);
    
    // Get each grid vertices.
    // +---+---+
    // | a | b |
    // +---+---+
    // | c | d |
    // +---+---+
    float a=hash(i+vec2(0.,0.));
    float b=hash(i+vec2(1.,0.));
    float c=hash(i+vec2(0.,1.));
    float d=hash(i+vec2(1.,1.));
    
    // Interpolate grid parameters with x and y.
    float result=mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
    
    // Normalized to '-1 - 1'.
    return(2.*result)-1.;
}

// Get sea wave octave.
float sea_octave(vec2 uv,float choppy)
{
    uv+=noise(uv);
    vec2 wv=1.-abs(sin(uv));
    vec2 swv=abs(cos(uv));
    wv=mix(wv,swv,wv);
    return pow(1.-pow(wv.x*wv.y,.65),choppy);
}

float seaDistFunc(vec3 p){
    float freq=SEA_FREQ;
    float amp=SEA_HEIGHT;
    float choppy=SEA_CHOPPY;
    
    vec2 uv=p.xz;
    
    float d,h=0.;
    const mat2 octave_m=mat2(1.6,1.2,-1.2,1.6);
    
    // ITER_FRAGMENT = 5
    for(int i=0;i<3;i++)
    {
        d=sea_octave((uv+u_time*SEA_SPEED)*freq,choppy);
        d+=sea_octave((uv-u_time*SEA_SPEED)*freq,choppy);
        h+=d*amp;
        uv*=octave_m;
        freq*=2.;
        amp*=.2;
        choppy=mix(choppy,1.,.2);
    }
    
    return p.y-h;
}

vec3 elementProduct(vec3 a,vec3 b){
    return vec3(a.x*b.x,a.y*b.y,a.z*b.z);
}

vec3 translate(vec3 p,vec3 t){
    return p-t;
}

vec3 rotate(vec3 p,float angle,vec3 axis){
    vec3 a=normalize(axis);
    float s=sin(angle);
    float c=cos(angle);
    float r=1.-c;
    mat3 m=mat3(
        a.x*a.x*r+c,
        a.y*a.x*r+a.z*s,
        a.z*a.x*r-a.y*s,
        a.x*a.y*r-a.z*s,
        a.y*a.y*r+c,
        a.z*a.y*r+a.x*s,
        a.x*a.z*r+a.y*s,
        a.y*a.z*r-a.x*s,
        a.z*a.z*r+c
    );
    return m*p;
}

float smoothMin(float d1,float d2,float k){
    float h=exp(-k*d1)+exp(-k*d2);
    return-log(h)/k;
}

float distFunc(vec3 p){
    return seaDistFunc(p);
}

vec3 getNormal(vec3 p){
    float d=.0001;
    return normalize(vec3(distFunc(p+vec3(d,0.,0.))-distFunc(p+vec3(-d,0.,0.)),distFunc(p+vec3(0.,d,0.))-distFunc(p+vec3(0.,-d,0.)),distFunc(p+vec3(0.,0.,d))-distFunc(p+vec3(0.,0.,-d))));
}

float getShadow(vec3 ro,vec3 rd){
    float h=0.;
    float c=.001;
    float r=1.;
    float shadowCoef=.5;
    for(float t=0.;t<16.;t++){
        h=distFunc(ro+rd*c);
        if(h<.001){
            return shadowCoef;
        }
        r=min(r,h*5./c);
        c+=h;
    }
    return mix(shadowCoef,1.,r);
}

float fogRate(float depth){
    float d=max(depth-FOG_START,0.);
    return pow(FOG_ATTENUATION_RATE,d);
}

float fresnel(vec3 normal,vec3 ray){
    return pow(clamp(1.+dot(normal,ray),0.,1.),5.);
}

float diffuse(vec3 lightDir,vec3 normal){
    return clamp(dot(lightDir,normal),.1,1.);
}

float specular(vec3 halfLE,vec3 normal,float k){
    return pow(clamp(dot(halfLE,normal),0.,1.),k);
}

vec3 sunTexture(vec3 dPos,vec3 sunDir,vec3 sunLightColor){
    vec3 normal=normalize(dPos);
    vec3 sunDirNormal=normalize(sunDir);
    return pow(clamp((SUN_SIZE-length(normal-sunDirNormal)),0.,1.),20.)*sunLightColor;
}

vec3 skyTexture(vec3 dPos,vec3 lightColor){
    vec3 normal=normalize(dPos);
    vec3 vertical=vec3(0.,1.,0.);
    vec3 topColor=SKY_BASE_COLOR*length(lightColor)/sqrt(3.);
    float rate=dot(normal,vertical)*2.;
    vec3 texture=vec3(mix(lightColor,topColor,rate));
    return texture;
}

vec3 seaTextureFunc(vec3 dPos,vec3 cPos,vec3 lightDir,vec3 lightColor){
    vec3 normal=getNormal(dPos);
    float dist=length(dPos-cPos);
    vec3 ray=normalize(dPos-cPos);
    vec3 halfLE=normalize(lightDir-ray);
    float spec=specular(halfLE,normal,500.);
    
    vec3 ref=reflect(ray,normal);
    vec3 reflected=skyTexture(ref,lightColor);
    vec3 refracted=elementProduct(SEA_BASE_COLOR,lightColor)+(1.-diffuse(normal,lightDir))*elementProduct(SEA_WATER_COLOR,lightColor);
    float fresnel=fresnel(normal,ray);
    
    vec3 color=mix(refracted,reflected,fresnel);
    
    color+=spec*lightColor;
    float depth=length(dPos-cPos);
    return mix(skyTexture(dPos,lightColor),color,fogRate(depth));
}

vec3 textureFunc(vec3 dPos,vec3 cPos,vec3 lightDir,vec3 lightColor){
    return seaTextureFunc(dPos,cPos,lightDir,lightColor);
}

// 太陽から照らされる光の方向
vec3 getSunDir(float angle){
    return normalize(vec3(sin(radians(angle)),cos(radians(angle)),0.));
}

// 太陽の直接光
vec3 getSunLight(float angle){
    float rad=mod(radians(angle),2.*PI);
    float t=tan(rad);
    float d=sqrt(1.+t*t);
    float x=pow(SUN_LIGHT_ATTENUATION_RATE.x,d*SKY_HEIGHT);
    float y=pow(SUN_LIGHT_ATTENUATION_RATE.y,d*SKY_HEIGHT);
    float z=pow(SUN_LIGHT_ATTENUATION_RATE.z,d*SKY_HEIGHT);
    return(rad<.5*PI||rad>1.5*PI)?vec3(x,y,z):vec3(0.);
}

void main(void){
    float minResolution=min(u_resolution.x,u_resolution.y);
    vec2 m=(u_mouse*2.-u_resolution)/minResolution;
    vec2 p=(gl_FragCoord.xy*2.-u_resolution)/minResolution;
    
    // light
    float lightAngle=u_time*5.;
    vec3 sunLightDir=getSunDir(lightAngle);
    vec3 sunLight=getSunLight(lightAngle);
    
    // camera
    vec3 cPos=vec3(0.,10.,0.);// カメラの位置
    vec3 cDir=vec3(1.,0.,0.);// カメラの向き(視線)
    vec3 cUp=vec3(0.,1.,0.);;// カメラの上方向
    vec3 cSide=cross(cDir,cUp);// 外積を使って横方向を算出
    float targetDepth=1.;// フォーカスする深度
    
    // ray
    vec3 ray=normalize(p.x*normalize(cSide)*sin(fov)+p.y*normalize(cUp)*sin(fov)+normalize(cDir)*cos(fov));
    
    // marching loop
    float dist=0.;// レイとオブジェクト間の最短距離
    float tmp=0.;// レイに継ぎ足す長さ
    vec3 dPos=cPos;// レイの先端位置
    for(int i=0;i<128;i++){
        dist=distFunc(dPos);
        tmp+=dist;
        dPos=cPos+ray*tmp;
    }
    
    vec3 color;
    // hit check
    if(abs(dist)<1.){
        color=textureFunc(dPos,cPos,sunLightDir,sunLight);
    }else{
        
        color=skyTexture(ray,sunLight)+sunTexture(ray,sunLightDir,sunLight);
    }
    gl_FragColor=vec4(color,1.);
}
