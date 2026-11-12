import { useEffect, useRef, useState } from 'react'
import { GlassButton, Segmented } from './components'

/**
 * A lab for a WebGL ocean. A real 3D sea (a camera above rolling waves, a sky with a low
 * sun or moon and its glitter path) is drawn by one fragment shader, then printed as
 * halftone dots, like the rest of the app, or as a 1-bit ordered dither.
 *
 * Drag up and down to tilt the camera. Tap the water to drop a ripple into it.
 */

type Look = 'dots' | 'dither'
type Light = 'day' | 'night'

const VERT = `
attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }
`

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime, uCell, uLook, uNight, uPitch, uHeight, uDrift;
uniform vec4 uRipples[8]; // world x, world z, start time, strength

const vec3 SUN = vec3(0.0, 0.11, 0.99);

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
  float s = max(dot(d, normalize(SUN)), 0.0);
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
  float spec = pow(max(dot(r, normalize(SUN)), 0.0), mix(180.0, 260.0, uNight)) * 3.0;
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

export function SeaLab() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [look, setLook] = useState<Look>('dots')
  const [light, setLight] = useState<Light>('night')
  const settings = useRef({ look, light })
  settings.current = { look, light }

  useEffect(() => {
    const cv = canvas.current!
    const gl = cv.getContext('webgl', { antialias: false, premultipliedAlpha: false })
    if (!gl) return
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
      pitch: u('uPitch'), height: u('uHeight'), drift: u('uDrift'), ripples: u('uRipples'),
    }

    const dpr = Math.min(2, devicePixelRatio || 1)
    const size = () => {
      cv.width = Math.round(cv.clientWidth * dpr)
      cv.height = Math.round(cv.clientHeight * dpr)
      gl.viewport(0, 0, cv.width, cv.height)
    }
    size()
    addEventListener('resize', size)

    const HEIGHT = 2.2
    const cam = { pitch: -0.1, target: -0.1 }
    const ripples = new Float32Array(32)
    let next = 0
    const t0 = performance.now()
    const clock = () => (performance.now() - t0) / 1000
    const drift = (t: number) => t * 0.6
    let night = settings.current.light === 'night' ? 1 : 0

    // Where a screen point meets the (mean) sea, to drop a ripple there.
    const toWorld = (clientX: number, clientY: number) => {
      const r = cv.getBoundingClientRect()
      const x = (clientX - r.left) * dpr, y = (r.bottom - clientY) * dpr
      const ux = (x - cv.width / 2) / cv.height, uy = (y - cv.height / 2) / cv.height
      const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch)
      const d = [ux * 1.1, sp + uy * 1.1 * cp, cp - uy * 1.1 * sp]
      if (d[1] >= -0.01) return null
      const k = -HEIGHT / d[1]
      return { x: drift(clock()) + d[0] * k, z: d[2] * k }
    }

    let press: { x: number; y: number; pitch: number } | null = null
    const down = (e: PointerEvent) => {
      press = { x: e.clientX, y: e.clientY, pitch: cam.target }
      cv.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      if (!press) return
      cam.target = Math.max(-0.75, Math.min(-0.03, press.pitch - (e.clientY - press.y) * 0.003))
    }
    const up = (e: PointerEvent) => {
      if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 8) {
        const w = toWorld(e.clientX, e.clientY)
        if (w) {
          ripples.set([w.x, w.z, clock(), 0.45], next * 4)
          next = (next + 1) % 8
        }
      }
      press = null
    }
    cv.addEventListener('pointerdown', down)
    cv.addEventListener('pointermove', move)
    cv.addEventListener('pointerup', up)
    cv.addEventListener('pointercancel', () => (press = null))

    let raf = 0
    const frame = () => {
      raf = requestAnimationFrame(frame)
      const t = clock()
      const s = settings.current
      night += ((s.light === 'night' ? 1 : 0) - night) * 0.06
      cam.pitch += (cam.target - cam.pitch) * 0.12
      gl.uniform2f(U.res, cv.width, cv.height)
      gl.uniform1f(U.time, t)
      gl.uniform1f(U.cell, 9 * dpr)
      gl.uniform1f(U.look, s.look === 'dots' ? 0 : 1)
      gl.uniform1f(U.night, night)
      gl.uniform1f(U.pitch, cam.pitch)
      gl.uniform1f(U.height, HEIGHT)
      gl.uniform1f(U.drift, drift(t))
      gl.uniform4fv(U.ripples, ripples)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      removeEventListener('resize', size)
      cv.removeEventListener('pointerdown', down)
      cv.removeEventListener('pointermove', move)
      cv.removeEventListener('pointerup', up)
      // Not loseContext(): StrictMode remounts on the same canvas and would get a dead context.
    }
  }, [])

  return (
    <div className={`sealab ${light}`}>
      <canvas ref={canvas} className="sealab-canvas" />
      <div className="sealab-top">
        <GlassButton icon="back" href="#/" ariaLabel="Back" />
      </div>
      <div className="sealab-controls">
        <Segmented value={look} options={[{ value: 'dots', label: 'Dots' }, { value: 'dither', label: 'Dither' }]} onChange={setLook} />
        <Segmented value={light} options={[{ value: 'day', label: 'Day' }, { value: 'night', label: 'Night' }]} onChange={setLight} />
      </div>
    </div>
  )
}
