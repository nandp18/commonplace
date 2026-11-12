/**
 * The night sea in WebGL: a camera above rolling waves, a sky with a low moon (or sun)
 * and its glitter path, drawn by one fragment shader and printed as halftone dots (or a
 * 1-bit ordered dither). Used by the filing ceremony and the #/lab playground.
 */

const VERT = `
attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }
`

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime, uCell, uLook, uNight, uPitch, uHeight, uDrift;
uniform vec4 uRipples[8]; // world x, world z, start time, strength
uniform vec3 uSun; // toward the sun or moon

float waves(vec2 p, float t) {
  float h = 0.0;
  h += 0.36 * sin(dot(p, vec2(0.60, 0.80)) * 0.55 - t * 0.9);
  h += 0.22 * sin(dot(p, vec2(-0.70, 0.71)) * 0.95 - t * 1.25);
  h += 0.12 * sin(dot(p, vec2(0.20, -0.98)) * 1.70 - t * 1.7);
  h += 0.06 * sin(dot(p, vec2(0.95, 0.31)) * 3.10 - t * 2.4);
  h += 0.03 * sin(dot(p, vec2(-0.40, -0.92)) * 5.30 - t * 3.1);
  for (int i = 0; i < 8; i++) {
    vec4 r = uRipples[i];
    float a = t - r.z;
    if (r.w <= 0.0 || a <= 0.0) continue;
    float d = distance(p, r.xy) - a * 2.6; // the ring's front races outward
    h += r.w * exp(-a * 0.55) * exp(-d * d * 0.35) * sin(d * 3.2);
  }
  return h;
}

vec3 normalAt(vec2 p, float t) {
  float e = 0.06;
  float hx = waves(p - vec2(e, 0.0), t) - waves(p + vec2(e, 0.0), t);
  float hz = waves(p - vec2(0.0, e), t) - waves(p + vec2(0.0, e), t);
  return normalize(vec3(hx, 2.0 * e, hz));
}

// Brightness of the sky in a direction: dim overhead, bright at the horizon and around the sun.
float sky(vec3 d) {
  float up = max(d.y, 0.0);
  float base = mix(mix(0.74, 0.07, uNight), mix(0.46, 0.0, uNight), pow(up, 0.4));
  float s = max(dot(d, normalize(uSun)), 0.0);
  float disc = smoothstep(mix(0.9994, 0.9986, uNight), mix(0.9997, 0.9990, uNight), s);
  float halo = pow(s, mix(45.0, 30.0, uNight)) * mix(0.22, 0.10, uNight) + pow(s, 260.0) * 0.3;
  return base + halo + disc * 1.5;
}

// The scene's brightness (0..1+) seen through screen point q (device px), and how gold it is.
vec2 scene(vec2 q) {
  vec2 uv = (q - 0.5 * uRes) / uRes.y;
  float cp = cos(uPitch), sp = sin(uPitch);
  vec3 fwd = vec3(0.0, sp, cp), up = vec3(0.0, cp, -sp), right = vec3(1.0, 0.0, 0.0);
  vec3 d = normalize(fwd + uv.x * right * 1.1 + uv.y * up * 1.1);
  if (d.y >= -0.002) return vec2(sky(d), 0.0);
  vec3 eye = vec3(uDrift, uHeight, 0.0);
  float dist = -uHeight / d.y;
  vec3 hit = eye + d * dist;
  vec3 n = normalAt(hit.xz, uTime);
  // Far away the waves blur into the mean surface, so they don't shimmer.
  n = normalize(mix(n, vec3(0.0, 1.0, 0.0), smoothstep(30.0, 140.0, dist)));
  vec3 r = reflect(d, n);
  r.y = abs(r.y);
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(-d, n), 0.0), 5.0);
  float deep = mix(0.30, 0.015, uNight);
  // Faces tilted toward the light catch a little of it: this is what draws the swell.
  float facing = smoothstep(-0.05, 0.35, n.z + 0.3 * n.x);
  float body = deep + mix(0.22, 0.26, uNight) * facing * exp(-dist * 0.025);
  float spec = pow(max(dot(r, normalize(uSun)), 0.0), mix(180.0, 260.0, uNight)) * 3.0;
  float c = mix(body, sky(r), fres) + spec;
  // Haze toward the horizon.
  c = mix(c, sky(normalize(vec3(d.x, 0.002, d.z))), 1.0 - exp(-dist * 0.012));
  return vec2(c, clamp(spec * 1.6, 0.0, 1.0));
}

float bayer4(vec2 p) {
  vec2 i = mod(floor(p), 4.0);
  float m[16];
  m[0]=0.;m[1]=8.;m[2]=2.;m[3]=10.;m[4]=12.;m[5]=4.;m[6]=14.;m[7]=6.;
  m[8]=3.;m[9]=11.;m[10]=1.;m[11]=9.;m[12]=15.;m[13]=7.;m[14]=13.;m[15]=5.;
  int k = int(i.y * 4.0 + i.x);
  for (int j = 0; j < 16; j++) if (j == k) return (m[j] + 0.5) / 16.0;
  return 0.5;
}

void main() {
  vec3 paper = vec3(0.957, 0.945, 0.910), ink = vec3(0.118, 0.137, 0.114);
  vec3 night = vec3(0.035, 0.047, 0.067), cream = vec3(0.96, 0.89, 0.75), gold = vec3(0.91, 0.76, 0.48);
  vec3 bg = mix(paper, night, uNight);
  vec2 f = gl_FragCoord.xy;
  vec3 col;
  if (uLook < 0.5) {
    // Halftone: a staggered lattice, one dot per cell sized by the scene's brightness there.
    float c = uCell, rowH = c * 0.866;
    float row = floor(f.y / rowH);
    float off = mod(row, 2.0) * 0.5 * c;
    vec2 center = vec2((floor((f.x - off) / c) + 0.5) * c + off, (row + 0.5) * rowH);
    vec2 s = scene(center);
    float L = clamp(s.x, 0.0, 1.0);
    // By day, ink dots print the shadows; by night, pale dots print the light.
    float amount = max(0.0, (mix(1.0 - L, L, uNight) - 0.03) / 0.97);
    float rad = 0.45 * c * sqrt(amount);
    float a = smoothstep(rad + 0.8, rad - 0.8, distance(f, center));
    vec3 dot = mix(ink, mix(cream, gold, s.y), uNight);
    col = mix(bg, dot, a);
  } else {
    // 1-bit ordered dither on chunky pixels.
    float k = max(2.0, floor(uCell / 3.0));
    vec2 cell = floor(f / k);
    vec2 s = scene((cell + 0.5) * k);
    float L = clamp(s.x, 0.0, 1.0);
    float on = step(bayer4(cell), mix(1.0 - L, L, uNight));
    vec3 dot = mix(ink, mix(cream, gold, s.y), uNight);
    col = mix(bg, dot, on);
  }
  gl_FragColor = vec4(col, 1.0);
}
`

export interface SeaFrame {
  time: number // seconds
  pitch: number // camera tilt in radians; negative looks down
  night?: number // 0 = day, 1 = night
  look?: 'dots' | 'dither'
  drift?: number // how far the camera has drifted along the shore
  sun?: [number, number, number] // direction of the sun or moon; default: low, straight ahead
}

/** Camera height above the water, and the field of view the shader uses. */
const HEIGHT = 2.2
const FOV = 1.1

/** The tilt that puts the horizon at `y` CSS px from the top of a viewport `h` tall. */
export const pitchForHorizon = (y: number, h: number) => Math.atan((FOV * (y - h / 2)) / h)

export function createSea(canvas: HTMLCanvasElement, cellCss = 9) {
  const gl = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: false })
  if (!gl) return null
  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s))
    return s
  }
  const prog = gl.createProgram()!
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT))
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG))
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) console.error(gl.getProgramInfoLog(prog))
  gl.useProgram(prog)
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const loc = gl.getAttribLocation(prog, 'p')
  gl.enableVertexAttribArray(loc)
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
  const u = (name: string) => gl.getUniformLocation(prog, name)
  const U = {
    res: u('uRes'), time: u('uTime'), cell: u('uCell'), look: u('uLook'), night: u('uNight'),
    pitch: u('uPitch'), height: u('uHeight'), drift: u('uDrift'), ripples: u('uRipples'), sun: u('uSun'),
  }
  const dpr = Math.min(2, devicePixelRatio || 1)
  const ripples = new Float32Array(32)
  let next = 0
  let last: SeaFrame = { time: 0, pitch: 0 }

  const resize = () => {
    canvas.width = Math.round(canvas.clientWidth * dpr)
    canvas.height = Math.round(canvas.clientHeight * dpr)
    gl.viewport(0, 0, canvas.width, canvas.height)
  }
  resize()

  return {
    resize,
    render(f: SeaFrame) {
      last = f
      gl.uniform2f(U.res, canvas.width, canvas.height)
      gl.uniform1f(U.time, f.time)
      gl.uniform1f(U.cell, cellCss * dpr)
      gl.uniform1f(U.look, f.look === 'dither' ? 1 : 0)
      gl.uniform1f(U.night, f.night ?? 1)
      gl.uniform1f(U.pitch, f.pitch)
      gl.uniform1f(U.height, HEIGHT)
      gl.uniform1f(U.drift, f.drift ?? 0)
      gl.uniform4fv(U.ripples, ripples)
      gl.uniform3fv(U.sun, f.sun ?? [0, 0.11, 0.99])
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    },
    /** Send a ripple out from where a screen point (CSS px in the viewport) meets the sea. */
    ripple(clientX: number, clientY: number, strength = 0.45, delay = 0) {
      const r = canvas.getBoundingClientRect()
      const x = (clientX - r.left) * dpr, y = (r.bottom - clientY) * dpr
      const ux = (x - canvas.width / 2) / canvas.height, uy = (y - canvas.height / 2) / canvas.height
      const cp = Math.cos(last.pitch), sp = Math.sin(last.pitch)
      const d = [ux * FOV, sp + uy * FOV * cp, cp - uy * FOV * sp]
      if (d[1] >= -0.01) return false // that's sky
      const k = -HEIGHT / d[1]
      ripples.set([(last.drift ?? 0) + d[0] * k, d[2] * k, last.time + delay, strength], next * 4)
      next = (next + 1) % 8
      return true
    },
  }
}

export type Sea = NonNullable<ReturnType<typeof createSea>>
