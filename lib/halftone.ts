import type { AudioVisual } from './audio';
const vertex = `attribute vec2 position; void main(){gl_Position=vec4(position,0.,1.);}`;
const fragment = `
precision highp float;
uniform vec2 resolution;
uniform sampler2D audio;
uniform float power;
uniform float time;
uniform float variant;
float spectrum(float x){return texture2D(audio,vec2(clamp(x,0.,1.),.5)).r;}
float wave(float x){return texture2D(audio,vec2(clamp(x,0.,1.),.5)).g*2.-1.;}
void main(){
  vec2 uv=gl_FragCoord.xy/resolution;
  // Sample at dot centers: each dot has one radius, avoiding a noisy pixel mask.
  float spacing=variant==2.?8.0:6.0;
  vec2 pixel=gl_FragCoord.xy;
  vec2 cell=floor(pixel/spacing);
  float stagger=mod(cell.y,2.)*.5;
  vec2 grid=vec2(floor(pixel.x/spacing-stagger)+stagger,cell.y);
  vec2 center=(grid+.5)*spacing;
  vec2 q=center/resolution;
  vec2 p=(q-.5)*2.;
  p.y*=.90;
  float f=spectrum(q.x);
  float w=wave(q.x);
  float r=length(p);
  float field=0.;
  float motion=time*power;
  if(variant<.5){
    float curve=sin(p.x*3.3+motion*.3)*(.12+f*.27)+w*.38;
    field=exp(-pow((p.y-curve)*2.5,2.))*exp(-p.x*p.x*.7);
    field*=.40+f*.80+power*.5;
  }else if(variant<1.5){
    float rings=.5+.5*cos(r*(20.+power*12.)-motion*3.);
    field=exp(-r*r*2.1)*(.18+rings*(.57+power*.8));
    field+=spectrum(clamp(r,0.,1.))*.35*exp(-r*r);
  }else if(variant<2.5){
    vec2 shift=vec2(sin(motion*.2),cos(motion*.2))*.05*power;
    float low=spectrum(.22);
    field=exp(-dot(p-shift,p-shift)*(2.6-low*1.2));
    field*=.30+.38*cos(p.x*3.-p.y*2.5+w*.5)+low*.45+power*.7;
  }else{
    float diagonal=sin(p.x*5.+p.y*3.5+motion*.22+w*.7);
    float cross=cos(p.y*5.-p.x*1.5-motion*.17);
    field=(.30+.20*diagonal+.15*cross+f*.45)*exp(-r*r*.9);
  }
  field=clamp(field,0.,1.);
  float radius=spacing*.47*sqrt(field);
  float d=length(pixel-center);
  float ink=1.-smoothstep(radius-.65,radius+.65,d);
  // A tiny irregularity keeps the dot screen closer to ink than a digital grid.
  float grain=fract(sin(dot(grid,vec2(12.9898,78.233)))*43758.5453);
  float edge=smoothstep(0.,.13,q.x)*smoothstep(1.,.87,q.x)*smoothstep(0.,.13,q.y)*smoothstep(1.,.87,q.y);
  gl_FragColor=vec4(vec3(.965,.975,1.),ink*(.77+grain*.19)*edge);
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
    ['resolution', 'audio', 'power', 'time', 'variant'].map((name) => [
      name,
      gl.getUniformLocation(program!, name),
    ]),
  );
  gl.uniform1i(uniforms.audio, 0);
  gl.uniform1f(uniforms.variant, variant);
  return {
    draw(data: AudioVisual | null, time: number) {
      const ratio = Math.min(devicePixelRatio || 1, 1.5);
      const width = Math.round(canvas.clientWidth * ratio),
        height = Math.round(canvas.clientHeight * ratio);
      if (!width || !height || gl.isContextLost()) return;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
      gl.uniform2f(uniforms.resolution, width, height);
      gl.uniform1f(uniforms.power, data?.power ?? 0);
      gl.uniform1f(uniforms.time, time);
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
