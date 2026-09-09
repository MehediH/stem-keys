import type { AudioVisual } from './audio';
import type { VisualIdentity } from './visual-identity';
export type LoadingVisual = { progress: number | null; phase: number };

const vertex = `attribute vec2 position; void main(){gl_Position=vec4(position,0.,1.);}`;
const fragment = `
precision highp float;
uniform vec2 resolution;
uniform sampler2D audio;
uniform float power;
uniform float time;
uniform float variant;
uniform vec4 identity;
uniform vec3 character;
uniform vec3 loading;
uniform float loadingTime;
float spectrum(float x){return texture2D(audio,vec2(clamp(x,0.,1.),.5)).r;}
float wave(float x){return texture2D(audio,vec2(clamp(x,0.,1.),.5)).g*2.-1.;}
mat2 rotate(float a){return mat2(cos(a),-sin(a),sin(a),cos(a));}
void main(){
  float spacing=mix(5.,10.,identity.z);
  vec2 pixel=gl_FragCoord.xy;
  vec2 cell=floor(pixel/spacing);
  float stagger=mod(cell.y,2.)*.5;
  vec2 grid=vec2(floor(pixel.x/spacing-stagger)+stagger,cell.y);
  vec2 center=(grid+.5)*spacing;
  vec2 q=center/resolution;
  vec2 p=(q-.5)*2.;
  // Fill the whole panel with a cropped, high-contrast print, not a faded thumbnail.
  p.x*=resolution.x/resolution.y;
  p=rotate((identity.x-.5)*6.28318)*p;
  p*=vec2(mix(.73,1.20,identity.w),mix(1.08,.76,identity.w))*.84;
  float phase=identity.y*6.28318;
  float complexity=2.+floor(identity.y*5.);
  float detail=7.+identity.z*18.+character.x*12.;
  float width=mix(.19,.34,identity.w);
  float motion=time*(.7+character.y*.8);
  float f=spectrum(q.x), w=wave(q.x);
  float low=spectrum(.22), mid=spectrum(.57);
  p*=1.-power*.12;
  float field=0.;
  if(variant<.5){
    vec2 v=rotate(-.55)*p;
    float bend=sin(v.x*complexity+motion*.32+phase)*(.12+identity.z*.25+mid*.30)+w*.30;
    float tube=(v.y-bend)/(width+power*.12);
    float surface=sqrt(max(0.,1.-tube*tube));
    float mask=1.-smoothstep(.96,1.02,abs(tube));
    float folds=.62+.38*cos(v.x*(detail*.35)+surface*(2.+character.x*5.)+motion*.25+phase);
    field=mask*(.14+surface*.69)*folds;
    float second=(v.y+.38+width+sin(v.x*complexity+motion*.32+phase)*.22)/.13;
    field=max(field,(1.-smoothstep(.9,1.,abs(second)))*(.2+.45*sqrt(max(0.,1.-second*second))));
  }else if(variant<1.5){
    vec2 v=rotate(.3)*p; v.y*=1.+character.z*.25;
    float radius=length(v), angle=atan(v.y,v.x);
    float rim=.55+cos(angle*complexity+phase)*identity.y*.10+low*.12+w*.08;
    float ring=(radius-rim)/(width+power*.08);
    float mask=1.-smoothstep(.96,1.02,abs(ring));
    float tube=sqrt(max(0.,1.-ring*ring));
    float ridges=.73+.27*cos(angle*floor(detail)+ring*(3.+identity.w*6.)+motion*.8+phase+f*2.);
    float light=.4+.6*max(0.,dot(normalize(vec3(v,tube)),normalize(vec3(-.6,.8,1.))));
    field=mask*(.2+.8*tube)*ridges*light;
  }else if(variant<2.5){
    vec2 v=p+vec2(.05,-.06);
    v.x+=sin(v.y*complexity+phase)*character.z*.16;
    float radius=.76+identity.w*.14+low*.12;
    float sphere=sqrt(max(0.,radius*radius-dot(v,v)))/radius;
    float mask=1.-smoothstep(radius-.01,radius+.01,length(v));
    float light=max(0.,dot(normalize(vec3(v,sphere)),normalize(vec3(-.6,.5,1.))));
    float contour=.65+.35*sin(v.x*detail+sphere*(5.+identity.y*14.)+v.y*complexity+motion*.25+phase+w*.6);
    field=mask*(.13+light*.85)*contour;
  }else{
    vec2 v=rotate(motion*.07+.5)*p;
    float a=atan(v.y,v.x);
    float edge=.70+(.09+identity.w*.16)*cos(a*complexity+motion*.1+phase)+f*.12+w*.08;
    float depth=sqrt(max(0.,1.-pow(length(v)/edge,2.)));
    float mask=1.-smoothstep(edge-.015,edge+.015,length(v));
    float folded=.5+.5*cos(depth*detail-a*complexity+motion*.25+phase+w*.6);
    field=mask*(.24+.72*folded)*(.35+.65*depth);
  }
  if(loading.x>.5){
    // Each panel becomes one part of a moving print while the song is prepared.
    float t=loadingTime;
    vec2 v=rotate(t*.12+variant*1.57)*p;
    float r=length(v), a=atan(v.y,v.x);
    float swirl=a+r*3.-t*.65+variant;
    float flow=sin(v.x*4.+sin(v.y*3.-t*.6)*1.3+t*.5);
    float bands;
    if(loading.z<.5){
      bands=sin(r*12.-t*1.6+sin(swirl*3.)*1.8);
    }else if(loading.z<1.5){
      bands=sin(swirl*4.+sin(r*7.-t)*1.5);
    }else{
      bands=sin(v.y*13.+flow*2.8+t*.7+variant*1.4);
    }
    float sculpture=smoothstep(-.5,.85,bands);
    float envelope=1.-smoothstep(.7,1.65,r);
    float light=.45+.55*(.5+.5*cos(a-t*.3+variant));
    float reveal=loading.y<0.? .6 : 1.-smoothstep(loading.y*2.7-.8,loading.y*2.7-.45,q.y);
    field=(.055+sculpture*.82)*envelope*light*(.42+.58*reveal);
  }
  field=clamp(field+field*power*.17,0.,1.);
  float radius=spacing*.60*sqrt(field);
  vec2 delta=pixel-center;
  float distanceToDot=variant>2.5?(abs(delta.x)+abs(delta.y))*.78:length(delta);
  float ink=1.-smoothstep(radius-.6,radius+.6,distanceToDot);
  float grain=fract(sin(dot(grid,vec2(12.9898,78.233)))*43758.5453);
  gl_FragColor=vec4(vec3(.975,.98,1.),ink*(.86+grain*.14));
}`;

export function createHalftone(canvas: HTMLCanvasElement, variant: number) {
  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: false,
    premultipliedAlpha: false,
    depth: false,
    powerPreference: 'low-power',
  });
  if (!gl) return null;
  const shaders: WebGLShader[] = [];
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!;
    shaders.push(shader);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
      throw new Error(
        gl.getShaderInfoLog(shader) || 'Shader compilation failed',
      );
    return shader;
  };
  let program: WebGLProgram | null = null;
  try {
    program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error('Shader link failed');
  } catch {
    shaders.forEach((s) => gl.deleteShader(s));
    if (program) gl.deleteProgram(program);
    return null;
  }
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );
  gl.useProgram(program);
  const attribute = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(attribute);
  gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const empty = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    empty[i * 4 + 1] = 128;
    empty[i * 4 + 3] = 255;
  }
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    256,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    empty,
  );
  const uniforms = Object.fromEntries(
    [
      'resolution',
      'audio',
      'power',
      'time',
      'variant',
      'identity',
      'character',
      'loading',
      'loadingTime',
    ].map((name) => [name, gl.getUniformLocation(program!, name)]),
  );
  gl.uniform1i(uniforms.audio, 0);

  let phase = 0,
    lastTime = 0;
  return {
    draw(
      data: AudioVisual | null,
      time: number,
      identity?: VisualIdentity,
      loading?: LoadingVisual,
      loadingTime = 0,
    ) {
      const ratio = Math.min(devicePixelRatio || 1, loading ? 1 : 1.5);
      const width = Math.round(canvas.clientWidth * ratio),
        height = Math.round(canvas.clientHeight * ratio);
      if (!width || !height || gl.isContextLost()) return;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
      gl.uniform2f(uniforms.resolution, width, height);
      gl.uniform1f(uniforms.variant, identity?.form ?? variant);
      gl.uniform4fv(uniforms.identity, identity?.seed ?? [0.5, 0.3, 0.35, 0.5]);
      gl.uniform3fv(uniforms.character, identity?.character ?? [0, 0, 0]);
      gl.uniform1f(uniforms.power, data?.power ?? 0);
      gl.uniform3f(
        uniforms.loading,
        loading ? 1 : 0,
        loading?.progress == null ? -1 : loading.progress / 100,
        loading?.phase ?? 0,
      );
      gl.uniform1f(uniforms.loadingTime, loadingTime);
      if (time === 0) phase = 0;
      phase +=
        Math.max(0, Math.min(0.1, time - lastTime)) * (data?.power ?? 0) * 3.2;
      lastTime = time;
      gl.uniform1f(uniforms.time, phase);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        256,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        data?.texture ?? empty,
      );
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    },
    dispose() {
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      shaders.forEach((s) => gl.deleteShader(s));
    },
  };
}
