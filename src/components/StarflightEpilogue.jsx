import { useRef, useMemo, useState, useCallback, Suspense } from 'react'
import { Canvas, useFrame, useThree, useLoader } from '@react-three/fiber'
import * as THREE from 'three'

const spriteTexture = (() => {
  const c = document.createElement('canvas')
  c.width = 64; c.height = 64
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.3, 'rgba(255,255,255,0.6)')
  g.addColorStop(0.7, 'rgba(255,255,255,0.1)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
})()

const FLIGHT_DURATION = 18
const TOTAL_PHOTOS = 81
const MEMORY_INDICES = Array.from({ length: 24 }, (_, i) => 1 + Math.floor(i * (TOTAL_PHOTOS - 1) / 23))

/* ─── GLSL: Star ─── */

const starVS = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
`
const starFS = `
uniform float uTime, uIntensity;
varying vec2 vUv;
void main() {
  vec2 uv = vUv - 0.5; float dist = length(uv);
  float mask = smoothstep(0.5, 0.35, dist);
  float core = exp(-dist*22.0)*2.0, ig = exp(-dist*8.0)*0.9;
  float pulse = 1.0 + sin(uTime*2.5)*0.12 + sin(uTime*4.3)*0.06;
  float halo = exp(-dist*3.0)*0.4*pulse;
  float a = atan(uv.y,uv.x);
  float r4 = pow(abs(cos(a*2.0)),50.0)*exp(-dist*3.5)*0.8;
  float r6 = pow(abs(cos(a*3.0+0.5)),70.0)*exp(-dist*4.5)*0.35;
  float rr = pow(abs(cos(a*4.0+uTime*0.25)),90.0)*exp(-dist*4.0)*0.2;
  float rn1 = exp(-pow((dist-0.12*pulse)*14.0,2.0))*0.2;
  float rn2 = exp(-pow((dist-0.2*pulse)*11.0,2.0))*0.1;
  float b = (core+ig+halo+r4+r6+rr+rn1+rn2)*uIntensity*mask;
  vec3 c = mix(vec3(1,.6,.25), vec3(1,.88,.55), smoothstep(0.,.3,b));
  c = mix(c, vec3(1,.98,.95), smoothstep(.5,1.5,b));
  c += vec3(sin(dist*25.-uTime*2.)*.02, sin(dist*25.-uTime*2.+2.094)*.02, sin(dist*25.-uTime*2.+4.189)*.02)*exp(-dist*6.)*uIntensity;
  gl_FragColor = vec4(c*b, b*mask);
}
`

/* ─── GLSL: Lens ring ─── */

const lensVS = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
`
const lensFS = `
uniform float uTime, uIntensity;
varying vec2 vUv;
void main() {
  vec2 uv = vUv-0.5; float dist = length(uv);
  float r1 = exp(-pow((dist-0.35)*10.,2.))*0.7;
  float r2 = exp(-pow((dist-0.42)*12.,2.))*0.3;
  float r3 = exp(-pow((dist-0.25)*14.,2.))*0.4;
  float a = atan(uv.y,uv.x);
  float s1 = 0.7+0.3*sin(a*6.+uTime*3.), s2 = 0.8+0.2*sin(a*8.-uTime*2.);
  float b = (r1*s1+r2*s2+r3)*uIntensity;
  float m = smoothstep(0.5,0.4,dist);
  vec3 c = mix(vec3(1,.7,.3),vec3(1,.95,.8),b);
  gl_FragColor = vec4(c*b, b*m*0.6);
}
`

/* ─── GLSL: Light shafts ─── */

const shaftVS = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
`
const shaftFS = `
uniform float uTime, uIntensity;
varying vec2 vUv;
void main() {
  vec2 uv = vUv-0.5; float a = atan(uv.y,uv.x), d = length(uv);
  float s = 0.0;
  for(float i=0.;i<8.;i++){
    float ta = i*0.7854+uTime*0.15;
    s += exp(-abs(mod(a-ta+3.14159,6.28318)-3.14159)*20.)*exp(-d*2.)*0.15;
  }
  float b = s*uIntensity*smoothstep(0.5,0.3,d);
  vec3 c = mix(vec3(1,.8,.4),vec3(1,.95,.85),d*2.);
  gl_FragColor = vec4(c*b, b*0.5);
}
`

/* ─── GLSL: Photo frame ─── */

const frameVS = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
`
const frameFS = `
uniform float uTime, uOpacity, uSeed;
varying vec2 vUv;
void main() {
  vec2 uv = vUv, fc = abs(uv-0.5)*2.0;
  float edge = max(fc.x,fc.y);
  float border = smoothstep(0.72,0.92,edge)*smoothstep(1.,0.95,edge);
  float glow = border*(0.5+0.5*sin(uTime*2.5+uSeed+uv.x*6.28));
  float ta = atan(uv.y-0.5,uv.x-0.5);
  float tg = smoothstep(0.7,0.9,edge)*smoothstep(1.,0.93,edge)*smoothstep(0.,0.3,sin(ta*2.+uTime*3.+uSeed))*0.4;
  float cn = smoothstep(0.82,1.,fc.x)*smoothstep(0.82,1.,fc.y)*(0.7+0.4*sin(uTime*2.+uSeed));
  float oh = smoothstep(1.,0.55,edge)*0.12;
  vec3 c = mix(vec3(1,.85,.5),vec3(1,.65,.35),sin(uTime*1.2+uSeed)*.5+.5);
  gl_FragColor = vec4(c, (glow+tg+cn*0.5+oh)*uOpacity);
}
`

/* ─── GLSL: Nebula ─── */

const nebulaVS = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
`
const nebulaFS = `
uniform float uTime, uOpacity; uniform vec3 uColor;
varying vec2 vUv;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p*=2.1;a*=.5;}return v;}
void main(){
  vec2 uv=vUv-0.5;float d=length(uv);
  float n=fbm(uv*3.5+uTime*.12),n2=fbm(uv*5.-uTime*.08+50.);
  float s=exp(-d*2.5)*(n*.7+n2*.3);
  gl_FragColor=vec4(uColor*s*2.5,s*uOpacity*smoothstep(.5,0.,d));
}
`

/* ─── GLSL: Aurora ribbon ─── */

const auroraVS = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
`
const auroraFS = `
uniform float uTime, uOpacity;
uniform vec3 uColor1, uColor2;
varying vec2 vUv;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
void main(){
  vec2 uv = vUv;
  float wave = sin(uv.x*8.0+uTime*1.5)*0.15 + sin(uv.x*12.0-uTime*2.0)*0.08;
  float band = smoothstep(0.1,0.0,abs(uv.y-0.5+wave));
  float n = noise(uv*vec2(6.0,2.0)+uTime*0.5);
  band *= (0.6+n*0.4);
  float fade = smoothstep(0.0,0.15,uv.x)*smoothstep(1.0,0.85,uv.x);
  vec3 c = mix(uColor1,uColor2,uv.x+sin(uTime*0.8)*0.3);
  float shimmer = 0.8+0.2*sin(uTime*4.0+uv.x*20.0);
  gl_FragColor = vec4(c*shimmer, band*fade*uOpacity);
}
`

/* ─── GLSL: Anamorphic lens flare ─── */

const flareVS = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
`
const flareFS = `
uniform float uTime, uIntensity;
varying vec2 vUv;
void main(){
  vec2 uv = vUv - 0.5;

  float hStreak = exp(-abs(uv.y)*25.0)*exp(-abs(uv.x)*1.5)*0.6;
  float vStreak = exp(-abs(uv.x)*30.0)*exp(-abs(uv.y)*3.0)*0.2;
  float glow = exp(-length(uv)*4.0)*0.3;

  float ghost1 = exp(-length(uv-vec2(0.15,0.0))*15.0)*0.15;
  float ghost2 = exp(-length(uv+vec2(0.2,0.05))*12.0)*0.1;
  float ghost3 = exp(-length(uv-vec2(-0.1,0.03))*18.0)*0.08;

  float b = (hStreak+vStreak+glow+ghost1+ghost2+ghost3)*uIntensity;
  vec3 c = mix(vec3(1.0,0.85,0.5), vec3(1.0,0.95,0.9), b);
  float pulse = 0.9+0.1*sin(uTime*3.0);
  gl_FragColor = vec4(c*b*pulse, b*0.7);
}
`

/* ─── GLSL: Materialization ring (expanding shockwave) ─── */

const ringVS = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
`
const ringFS = `
uniform float uProgress;
varying vec2 vUv;
void main(){
  vec2 uv = vUv - 0.5;
  float d = length(uv);
  float ringPos = uProgress * 0.45;
  float ring = exp(-pow((d-ringPos)*20.0,2.0));
  float fade = 1.0 - uProgress;
  float b = ring * fade * 1.5;
  vec3 c = mix(vec3(1.0,0.9,0.6), vec3(1.0,1.0,1.0), ring);
  gl_FragColor = vec4(c*b, b*smoothstep(0.5,0.4,d));
}
`

/* ═══════════════════════════════════════════════ */
/* ─── Components ─── */
/* ═══════════════════════════════════════════════ */

/* ─── Warp Stars ─── */

function WarmWarpStars({ progress }) {
  const ref = useRef()
  const count = 3000

  const data = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const cols = new Float32Array(count * 3)
    const seeds = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 140
      pos[i * 3 + 1] = (Math.random() - 0.5) * 140
      pos[i * 3 + 2] = Math.random() * -340
      cols[i * 3] = 0.8 + Math.random() * 0.2
      cols[i * 3 + 1] = 0.75 + Math.random() * 0.2
      cols[i * 3 + 2] = 0.85 + Math.random() * 0.15
      seeds[i] = Math.random()
    }
    return { positions: pos, colors: cols, seeds }
  }, [])

  useFrame(() => {
    if (!ref.current) return
    const p = progress.current
    const speed = p < 0.12 ? (p / 0.12) * 3.5 : p < 0.55 ? 3.5 : 3.5 * Math.max(0.05, 1 - (p - 0.55) / 0.45)
    const arr = ref.current.geometry.attributes.position.array
    const colArr = ref.current.geometry.attributes.color.array
    for (let i = 0; i < count; i++) {
      arr[i * 3 + 2] += speed * (0.5 + data.seeds[i] * 1.8)
      if (arr[i * 3 + 2] > 15) {
        arr[i * 3] = (Math.random() - 0.5) * 140
        arr[i * 3 + 1] = (Math.random() - 0.5) * 140
        arr[i * 3 + 2] = -340 + Math.random() * -60
      }
      const warm = Math.min(1, p * 2.0)
      colArr[i * 3] = 0.7 + warm * 0.3
      colArr[i * 3 + 1] = 0.65 + warm * 0.25
      colArr[i * 3 + 2] = 1.0 - warm * 0.55
    }
    ref.current.geometry.attributes.position.needsUpdate = true
    ref.current.geometry.attributes.color.needsUpdate = true
    ref.current.material.size = 0.04 + speed * 0.1
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={data.positions} itemSize={3} />
        <bufferAttribute attach="attributes-color" count={count} array={data.colors} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial map={spriteTexture} size={0.06} transparent opacity={0.9} vertexColors sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} />
    </points>
  )
}

/* ─── Speed Tunnel ─── */

function SpeedTunnel({ progress }) {
  const ref = useRef()
  const count = 500
  const data = useMemo(() => {
    const pos = new Float32Array(count * 3), cols = new Float32Array(count * 3), seeds = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 40
      pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = Math.sin(a) * r; pos[i * 3 + 2] = Math.random() * -250
      cols[i * 3] = 0.7 + Math.random() * 0.3; cols[i * 3 + 1] = 0.7 + Math.random() * 0.2; cols[i * 3 + 2] = 0.9 + Math.random() * 0.1
      seeds[i] = Math.random()
    }
    return { positions: pos, colors: cols, seeds }
  }, [])

  useFrame(() => {
    if (!ref.current) return
    const p = progress.current
    const speed = p < 0.08 ? 0 : p < 0.55 ? ((p - 0.08) / 0.47) * 5.0 : 5.0 * Math.max(0, 1 - (p - 0.55) / 0.35)
    const arr = ref.current.geometry.attributes.position.array
    for (let i = 0; i < count; i++) {
      arr[i * 3 + 2] += speed * (1 + data.seeds[i] * 2.5)
      if (arr[i * 3 + 2] > 10) {
        const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 40
        arr[i * 3] = Math.cos(a) * r; arr[i * 3 + 1] = Math.sin(a) * r; arr[i * 3 + 2] = -250 + Math.random() * -60
      }
    }
    ref.current.geometry.attributes.position.needsUpdate = true
    ref.current.material.opacity = Math.min(0.35, speed * 0.1)
    ref.current.material.size = 0.02 + speed * 0.18
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={data.positions} itemSize={3} />
        <bufferAttribute attach="attributes-color" count={count} array={data.colors} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial map={spriteTexture} size={0.03} transparent opacity={0} vertexColors sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} />
    </points>
  )
}

/* ─── Camera Trail (golden sparkle wake) ─── */

function CameraTrail() {
  const ref = useRef()
  const count = 150
  const history = useRef([])

  const data = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const cols = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      cols[i * 3] = 1.0; cols[i * 3 + 1] = 0.85 - (i / count) * 0.3; cols[i * 3 + 2] = 0.5 - (i / count) * 0.3
    }
    return { positions: pos, colors: cols }
  }, [])

  useFrame((state) => {
    if (!ref.current) return
    const cam = state.camera.position
    history.current.unshift([
      cam.x + (Math.random() - 0.5) * 1.5,
      cam.y + (Math.random() - 0.5) * 1.5,
      cam.z + 3
    ])
    if (history.current.length > count) history.current.length = count

    const arr = ref.current.geometry.attributes.position.array
    for (let i = 0; i < count; i++) {
      if (i < history.current.length) {
        arr[i * 3] = history.current[i][0]
        arr[i * 3 + 1] = history.current[i][1]
        arr[i * 3 + 2] = history.current[i][2]
      }
    }
    ref.current.geometry.attributes.position.needsUpdate = true
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={data.positions} itemSize={3} />
        <bufferAttribute attach="attributes-color" count={count} array={data.colors} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial map={spriteTexture} size={0.15} transparent opacity={0.35} vertexColors sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} />
    </points>
  )
}

/* ─── Aurora Light Ribbons ─── */

function AuroraRibbons() {
  const ribbons = useMemo(() => [
    { pos: [15, 8, -80], rot: [0.3, 0, 0.2], scale: [60, 6, 1], c1: new THREE.Color('#4466aa'), c2: new THREE.Color('#88aaff') },
    { pos: [-18, -6, -140], rot: [-0.2, 0, -0.3], scale: [55, 5, 1], c1: new THREE.Color('#884488'), c2: new THREE.Color('#cc88cc') },
    { pos: [12, -10, -200], rot: [0.1, 0, 0.15], scale: [50, 5, 1], c1: new THREE.Color('#558855'), c2: new THREE.Color('#88cc88') },
    { pos: [-14, 12, -260], rot: [-0.15, 0, -0.1], scale: [45, 4, 1], c1: new THREE.Color('#aa8844'), c2: new THREE.Color('#ffcc66') },
  ], [])

  const uniformSets = useMemo(() => ribbons.map(r => ({
    uTime: { value: 0 },
    uOpacity: { value: 0 },
    uColor1: { value: r.c1 },
    uColor2: { value: r.c2 },
  })), [ribbons])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    const camZ = state.camera.position.z
    uniformSets.forEach((u, i) => {
      u.uTime.value = t + i * 2
      const dist = Math.abs(camZ - ribbons[i].pos[2])
      u.uOpacity.value = Math.max(0, 1 - dist / 70) * 0.45
    })
  })

  return (
    <>
      {ribbons.map((r, i) => (
        <mesh key={i} position={r.pos} rotation={r.rot} scale={r.scale}>
          <planeGeometry args={[1, 1]} />
          <shaderMaterial vertexShader={auroraVS} fragmentShader={auroraFS} uniforms={uniformSets[i]} transparent blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </>
  )
}

/* ─── Anamorphic Lens Flare (camera-attached) ─── */

function LensFlare({ progress }) {
  const ref = useRef()
  const { camera } = useThree()

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uIntensity: { value: 0 },
  }), [])

  useFrame((state) => {
    if (!ref.current) return
    const p = progress.current
    uniforms.uTime.value = state.clock.elapsedTime
    uniforms.uIntensity.value = p > 0.4 ? (p - 0.4) * 1.5 * p : 0

    ref.current.position.copy(camera.position)
    ref.current.position.z -= 5
    ref.current.quaternion.copy(camera.quaternion)
  })

  return (
    <mesh ref={ref} renderOrder={998}>
      <planeGeometry args={[30, 15]} />
      <shaderMaterial vertexShader={flareVS} fragmentShader={flareFS} uniforms={uniforms} transparent blending={THREE.AdditiveBlending} depthWrite={false} depthTest={false} />
    </mesh>
  )
}

/* ─── Cinematic Photo Memory ─── */

function PhotoMemory({ photoUrl, config }) {
  const groupRef = useRef()
  const photoRef = useRef()
  const bgGlowRef = useRef()
  const burstRef = useRef()
  const trailRef = useRef()
  const ringMeshRef = useRef()
  const flashRef = useRef()
  const lightRef = useRef()

  const texture = useLoader(THREE.TextureLoader, photoUrl)
  const { zPos, xPos, yPos, enterAngle, floatSeed, orbitDir, size } = config

  const appeared = useRef(false)
  const appearTime = useRef(0)

  const frameUniforms = useMemo(() => ({
    uTime: { value: 0 }, uOpacity: { value: 0 }, uSeed: { value: floatSeed },
  }), [floatSeed])

  const ringUniforms = useMemo(() => ({
    uProgress: { value: 0 },
  }), [])

  const sparkCount = 40
  const sparkData = useMemo(() => {
    const pos = new Float32Array(sparkCount * 3), cols = new Float32Array(sparkCount * 3)
    for (let i = 0; i < sparkCount; i++) {
      const a = Math.random() * Math.PI * 2, r = 1.5 + Math.random() * 1.5
      pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = Math.sin(a) * r; pos[i * 3 + 2] = (Math.random() - 0.5) * 0.8
      cols[i * 3] = 1.0; cols[i * 3 + 1] = 0.8 + Math.random() * 0.2; cols[i * 3 + 2] = 0.5 + Math.random() * 0.3
    }
    return { positions: pos, colors: cols }
  }, [])

  const burstCount = 50
  const burstData = useMemo(() => {
    const pos = new Float32Array(burstCount * 3), cols = new Float32Array(burstCount * 3)
    const dirs = []
    for (let i = 0; i < burstCount; i++) {
      cols[i * 3] = 1.0; cols[i * 3 + 1] = 0.9; cols[i * 3 + 2] = 0.6
      const a = Math.random() * Math.PI * 2, spd = 2 + Math.random() * 4
      dirs.push([Math.cos(a) * spd, Math.sin(a) * spd, (Math.random() - 0.5) * 2])
    }
    return { positions: pos, colors: cols, dirs }
  }, [])

  const trailCount = 50
  const trailData = useMemo(() => {
    const pos = new Float32Array(trailCount * 3), cols = new Float32Array(trailCount * 3)
    for (let i = 0; i < trailCount; i++) {
      const f = i / trailCount
      cols[i * 3] = 1.0; cols[i * 3 + 1] = 0.85 - f * 0.35; cols[i * 3 + 2] = 0.6 - f * 0.45
    }
    return { positions: pos, colors: cols }
  }, [])

  useFrame((state) => {
    if (!groupRef.current) return
    const camZ = state.camera.position.z
    const dist = camZ - zPos
    const absDist = Math.abs(dist)
    const t = state.clock.elapsedTime

    const fadeIn = 42, fadeOut = 16
    const approaching = dist > 0
    let opacity = approaching
      ? (absDist < fadeIn ? Math.pow(Math.max(0, 1 - absDist / fadeIn), 2) : 0)
      : (absDist < fadeOut ? Math.pow(Math.max(0, 1 - absDist / fadeOut), 3) : 0)

    if (opacity > 0.05 && !appeared.current) {
      appeared.current = true
      appearTime.current = t
    }

    const sinceBurst = t - appearTime.current
    const burstPhase = appeared.current ? Math.min(1, sinceBurst / 1.2) : 0

    const entryProgress = approaching ? Math.max(0, 1 - absDist / fadeIn) : 1
    const scaleEase = entryProgress * entryProgress * (3 - 2 * entryProgress)
    const scaleAnim = approaching ? 0.05 + scaleEase * 0.95 : 1.0 - (1 - opacity) * 0.5

    const spiralAngle = approaching ? (1 - entryProgress) * enterAngle * 2.5 : 0
    const entryX = approaching ? xPos + Math.cos(spiralAngle) * (1 - entryProgress) * 6 * Math.sign(enterAngle) : xPos
    const entryY = approaching ? yPos + Math.sin(spiralAngle) * (1 - entryProgress) * 3 : yPos
    const rotY = approaching ? (1 - entryProgress) * enterAngle * 0.6 : 0

    groupRef.current.position.set(
      entryX, entryY + Math.sin(t * 0.4 + floatSeed) * 0.5, zPos
    )
    groupRef.current.scale.setScalar(scaleAnim * size)
    groupRef.current.rotation.set(
      Math.sin(t * 0.2 + floatSeed * 3) * 0.03,
      rotY,
      Math.sin(t * 0.3 + floatSeed) * 0.04
    )

    if (photoRef.current) photoRef.current.material.opacity = opacity
    if (bgGlowRef.current) bgGlowRef.current.material.opacity = opacity * 0.25
    frameUniforms.uTime.value = t
    frameUniforms.uOpacity.value = opacity * 0.85

    if (flashRef.current) {
      const flashIntensity = appeared.current ? Math.max(0, 1 - sinceBurst * 3) : 0
      flashRef.current.material.opacity = flashIntensity * 0.8
    }

    ringUniforms.uProgress.value = burstPhase

    if (ringMeshRef.current) {
      ringMeshRef.current.scale.setScalar(1 + burstPhase * 4)
      ringMeshRef.current.material.uniforms.uProgress.value = burstPhase
    }

    if (lightRef.current) {
      const lightFade = appeared.current ? Math.max(0, 1 - sinceBurst * 2) * 3 : 0
      lightRef.current.intensity = lightFade + opacity * 0.5
    }

    if (burstRef.current) {
      const bArr = burstRef.current.geometry.attributes.position.array
      if (appeared.current && burstPhase < 1) {
        burstRef.current.material.opacity = (1 - burstPhase) * 0.7
        for (let i = 0; i < burstCount; i++) {
          bArr[i * 3] = burstData.dirs[i][0] * burstPhase * 1.5
          bArr[i * 3 + 1] = burstData.dirs[i][1] * burstPhase * 1.5
          bArr[i * 3 + 2] = burstData.dirs[i][2] * burstPhase
        }
      } else {
        burstRef.current.material.opacity = 0
      }
      burstRef.current.geometry.attributes.position.needsUpdate = true
    }

    if (trailRef.current) {
      trailRef.current.material.opacity = opacity * 0.35
      const tArr = trailRef.current.geometry.attributes.position.array
      for (let i = 0; i < trailCount; i++) {
        const f = i / trailCount
        const spiralF = f * Math.PI * 1.5
        tArr[i * 3] = Math.cos(spiralF + floatSeed) * f * 3 * Math.sign(enterAngle)
        tArr[i * 3 + 1] = Math.sin(spiralF + floatSeed) * f * 2 + Math.sin(t + f * 5) * 0.1
        tArr[i * 3 + 2] = f * 6
      }
      trailRef.current.geometry.attributes.position.needsUpdate = true
    }

    if (sparkData.positions && groupRef.current) {
      const sRef = groupRef.current.children[6]
      if (sRef && sRef.isPoints) {
        sRef.material.opacity = opacity * 0.5
        sRef.rotation.z = t * 0.25 * orbitDir
        const sArr = sRef.geometry.attributes.position.array
        for (let i = 0; i < sparkCount; i++) {
          const a = (i / sparkCount) * Math.PI * 2 + t * 0.5 * orbitDir + floatSeed
          const r = 2.0 + Math.sin(t * 2 + i * 0.5) * 0.5
          sArr[i * 3] = Math.cos(a) * r
          sArr[i * 3 + 1] = Math.sin(a) * r
          sArr[i * 3 + 2] = Math.sin(t * 1.2 + i) * 0.3
        }
        sRef.geometry.attributes.position.needsUpdate = true
      }
    }
  })

  return (
    <group ref={groupRef}>
      {/* 0: background glow */}
      <mesh ref={bgGlowRef} position={[0, 0, -0.08]}>
        <planeGeometry args={[7, 5.5]} />
        <meshBasicMaterial color="#ffbb66" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>

      {/* 1: materialization flash */}
      <mesh ref={flashRef} position={[0, 0, -0.05]}>
        <circleGeometry args={[3, 32]} />
        <meshBasicMaterial color="#ffffee" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>

      {/* 2: expanding ring */}
      <mesh ref={ringMeshRef} position={[0, 0, -0.04]}>
        <circleGeometry args={[1, 64]} />
        <shaderMaterial vertexShader={ringVS} fragmentShader={ringFS} uniforms={ringUniforms} transparent blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>

      {/* 3: frame glow shader */}
      <mesh position={[0, 0, -0.03]}>
        <planeGeometry args={[4.6, 3.6]} />
        <shaderMaterial vertexShader={frameVS} fragmentShader={frameFS} uniforms={frameUniforms} transparent blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>

      {/* 4: photo */}
      <mesh ref={photoRef}>
        <planeGeometry args={[3.8, 2.8]} />
        <meshBasicMaterial map={texture} transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      {/* 5: materialization burst particles */}
      <points ref={burstRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={burstCount} array={burstData.positions} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={burstCount} array={burstData.colors} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial map={spriteTexture} size={0.18} transparent opacity={0} vertexColors sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} />
      </points>

      {/* 6: orbiting sparkles */}
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={sparkCount} array={sparkData.positions} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={sparkCount} array={sparkData.colors} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial map={spriteTexture} size={0.14} transparent opacity={0} vertexColors sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} />
      </points>

      {/* 7: spiral trail */}
      <points ref={trailRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={trailCount} array={trailData.positions} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={trailCount} array={trailData.colors} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial map={spriteTexture} size={0.1} transparent opacity={0} vertexColors sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} />
      </points>

      {/* point light per photo */}
      <pointLight ref={lightRef} position={[0, 0, 0.5]} intensity={0} color="#ffddaa" distance={15} />
    </group>
  )
}

/* ─── Floating Memories ─── */

function FloatingMemories() {
  const memories = useMemo(() => {
    const formations = [
      { x: -8, y: 1, a: 1 }, { x: 9, y: -1.5, a: -1 }, { x: -6, y: -3, a: 0.7 },
      { x: 7, y: 3, a: -0.8 }, { x: -10, y: 0, a: 1.2 }, { x: 11, y: -2, a: -1.1 },
      { x: -5, y: 4, a: 0.5 }, { x: 8, y: 1.5, a: -0.6 }, { x: -9, y: -2, a: 0.9 },
      { x: 6, y: -4, a: -0.7 }, { x: -7, y: 2.5, a: 1.1 }, { x: 10, y: 0.5, a: -0.9 },
      { x: -11, y: -1, a: 0.8 }, { x: 5, y: 3.5, a: -1.3 }, { x: -8, y: -3.5, a: 0.6 },
      { x: 9, y: 2, a: -0.5 }, { x: -6, y: 1.5, a: 1.0 }, { x: 7, y: -3, a: -1.2 },
      { x: -10, y: 3, a: 0.4 }, { x: 12, y: -0.5, a: -0.8 }, { x: -4, y: -4, a: 1.3 },
      { x: 8, y: 4, a: -0.4 }, { x: -9, y: 0.5, a: 0.7 }, { x: 6, y: -2, a: -1.0 },
    ]
    return MEMORY_INDICES.map((idx, i) => ({
      url: `/gallery/thumbs/photo${idx}.webp`,
      config: {
        zPos: -18 - i * 12,
        xPos: formations[i].x + (Math.random() - 0.5) * 2,
        yPos: formations[i].a + (Math.random() - 0.5) * 1.5,
        enterAngle: formations[i].a,
        floatSeed: Math.random() * Math.PI * 2,
        orbitDir: i % 2 === 0 ? 1 : -1,
        size: 0.85 + Math.random() * 0.35,
      },
    }))
  }, [])

  return (
    <>
      {memories.map((m, i) => (
        <Suspense key={i} fallback={null}>
          <PhotoMemory photoUrl={m.url} config={m.config} />
        </Suspense>
      ))}
    </>
  )
}

/* ─── Nebula Dust Clouds ─── */

function NebulaClouds() {
  const clouds = useMemo(() => {
    const palette = [
      new THREE.Color('#553388'), new THREE.Color('#884466'), new THREE.Color('#665533'),
      new THREE.Color('#446688'), new THREE.Color('#885544'), new THREE.Color('#553366'),
      new THREE.Color('#667744'), new THREE.Color('#774455'),
    ]
    return Array.from({ length: 8 }, (_, i) => ({
      position: [(Math.random() - 0.5) * 35, (Math.random() - 0.5) * 25, -25 - i * 35],
      scale: 15 + Math.random() * 12,
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uColor: { value: palette[i] } },
    }))
  }, [])

  useFrame((state) => {
    const t = state.clock.elapsedTime, camZ = state.camera.position.z
    clouds.forEach(c => {
      c.uniforms.uTime.value = t
      c.uniforms.uOpacity.value = Math.max(0, 1 - Math.abs(camZ - c.position[2]) / 60) * 0.35
    })
  })

  return (
    <>
      {clouds.map((c, i) => (
        <mesh key={i} position={c.position} rotation={[0, 0, i * 0.7]}>
          <planeGeometry args={[c.scale, c.scale]} />
          <shaderMaterial vertexShader={nebulaVS} fragmentShader={nebulaFS} uniforms={c.uniforms} transparent blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </>
  )
}

/* ─── Comets ─── */

function FlyingComet({ delay, direction, speed: cs }) {
  const ref = useRef(), trailRef = useRef(), startTime = useRef(null)
  const trailCount = 120
  const trailData = useMemo(() => {
    const pos = new Float32Array(trailCount * 3), cols = new Float32Array(trailCount * 3)
    for (let i = 0; i < trailCount; i++) { const f = i / trailCount; cols[i * 3] = 1; cols[i * 3 + 1] = 0.95 - f * 0.5; cols[i * 3 + 2] = 0.75 - f * 0.6 }
    return { positions: pos, colors: cols }
  }, [])

  useFrame((state) => {
    if (startTime.current === null) startTime.current = state.clock.elapsedTime
    const elapsed = state.clock.elapsedTime - startTime.current - delay, dur = cs || 3.5
    if (elapsed < 0 || elapsed > dur) { if (ref.current) ref.current.visible = false; if (trailRef.current) trailRef.current.visible = false; return }
    if (ref.current) ref.current.visible = true; if (trailRef.current) trailRef.current.visible = true
    const t = elapsed / dur, ease = t * t * (3 - 2 * t)
    const x = direction[0] * (ease - 0.5) * 100, y = direction[1] * (ease - 0.5) * 100, z = state.camera.position.z - 12 - ease * 50
    if (ref.current) { ref.current.position.set(x, y, z); ref.current.scale.setScalar(1.2 + Math.sin(elapsed * 10) * 0.3) }
    if (trailRef.current) {
      const arr = trailRef.current.geometry.attributes.position.array
      for (let i = 0; i < trailCount; i++) { const f = i / trailCount; arr[i * 3] = x - direction[0] * f * 15; arr[i * 3 + 1] = y - direction[1] * f * 15; arr[i * 3 + 2] = z + f * 10 }
      trailRef.current.geometry.attributes.position.needsUpdate = true
    }
  })

  return (
    <>
      <mesh ref={ref} visible={false}><sphereGeometry args={[0.25, 12, 12]} /><meshBasicMaterial color="#ffffdd" blending={THREE.AdditiveBlending} depthWrite={false} /></mesh>
      <points ref={trailRef} visible={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={trailCount} array={trailData.positions} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={trailCount} array={trailData.colors} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial map={spriteTexture} size={0.2} transparent opacity={0.7} vertexColors sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} />
      </points>
    </>
  )
}

/* ─── Asteroids ─── */

function Asteroids({ progress }) {
  const count = 20, meshes = useRef([])
  const data = useMemo(() => Array.from({ length: count }, () => ({
    x: (Math.random() - 0.5) * 55, y: (Math.random() - 0.5) * 40,
    z: -40 - Math.random() * 200, size: 0.1 + Math.random() * 0.45, rotSpeed: (Math.random() - 0.5) * 3,
  })), [])

  useFrame((state) => {
    const t = state.clock.elapsedTime, p = progress.current, vis = p > 0.1 && p < 0.75
    meshes.current.forEach((m, i) => { if (!m) return; m.visible = vis; if (vis) { m.rotation.x = t * data[i].rotSpeed; m.rotation.y = t * data[i].rotSpeed * 0.7 } })
  })

  return <>{data.map((d, i) => (
    <mesh key={i} ref={el => (meshes.current[i] = el)} position={[d.x, d.y, d.z]} visible={false}>
      <dodecahedronGeometry args={[d.size, 0]} /><meshStandardMaterial color="#887766" roughness={0.85} metalness={0.15} />
    </mesh>
  ))}</>
}

/* ─── Distant Star ─── */

function DistantStar({ progress }) {
  const starMeshRef = useRef(), lensMeshRef = useRef(), shaftMeshRef = useRef()
  const outerGlowRef = useRef(), raysRef = useRef(), lightRef = useRef(), light2Ref = useRef()

  const starU = useMemo(() => ({ uTime: { value: 0 }, uIntensity: { value: 0 } }), [])
  const lensU = useMemo(() => ({ uTime: { value: 0 }, uIntensity: { value: 0 } }), [])
  const shaftU = useMemo(() => ({ uTime: { value: 0 }, uIntensity: { value: 0 } }), [])

  const rayCount = 300
  const rayData = useMemo(() => {
    const pos = new Float32Array(rayCount * 3), cols = new Float32Array(rayCount * 3), seeds = new Float32Array(rayCount)
    for (let i = 0; i < rayCount; i++) {
      const a = Math.random() * Math.PI * 2, r = 0.3 + Math.random() * 12
      pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = Math.sin(a) * r; pos[i * 3 + 2] = (Math.random() - 0.5) * 3
      cols[i * 3] = 1; cols[i * 3 + 1] = 0.85 + Math.random() * 0.15; cols[i * 3 + 2] = 0.5 + Math.random() * 0.4
      seeds[i] = Math.random()
    }
    return { positions: pos, colors: cols, seeds }
  }, [])

  useFrame((state) => {
    const p = progress.current, t = state.clock.elapsedTime
    starU.uTime.value = t; starU.uIntensity.value = p * p * 2.5
    lensU.uTime.value = t; lensU.uIntensity.value = Math.max(0, (p - 0.3) * 2) * p
    shaftU.uTime.value = t; shaftU.uIntensity.value = Math.max(0, (p - 0.2) * 1.5) * p
    const grow = p < 0.35 ? p * 2.8 : 1 + (p - 0.35) * 10
    if (starMeshRef.current) starMeshRef.current.scale.setScalar(3 + grow * 7)
    if (lensMeshRef.current) lensMeshRef.current.scale.setScalar(5 + grow * 14)
    if (shaftMeshRef.current) shaftMeshRef.current.scale.setScalar(8 + grow * 22)
    if (outerGlowRef.current) { outerGlowRef.current.scale.setScalar(8 + grow * 25); outerGlowRef.current.material.opacity = Math.min(0.1, p * 0.12) }
    if (raysRef.current) {
      raysRef.current.material.opacity = Math.min(0.55, p * p * 0.9); raysRef.current.material.size = 0.08 + p * 0.5; raysRef.current.rotation.z = t * 0.08
      const arr = raysRef.current.geometry.attributes.position.array
      for (let i = 0; i < rayCount; i++) {
        const a = rayData.seeds[i] * Math.PI * 2 + t * 0.15, baseR = 0.3 + rayData.seeds[i] * 12
        const r = baseR * (1 + grow * 0.4) + Math.sin(t * 2.5 + rayData.seeds[i] * 8) * 0.6
        arr[i * 3] = Math.cos(a) * r; arr[i * 3 + 1] = Math.sin(a) * r
      }
      raysRef.current.geometry.attributes.position.needsUpdate = true
    }
    if (lightRef.current) lightRef.current.intensity = p * p * 15
    if (light2Ref.current) light2Ref.current.intensity = p * p * 8
  })

  return (
    <group position={[0, 0, -320]}>
      <mesh ref={starMeshRef}><circleGeometry args={[1, 64]} /><shaderMaterial vertexShader={starVS} fragmentShader={starFS} uniforms={starU} transparent blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} /></mesh>
      <mesh ref={lensMeshRef}><circleGeometry args={[1, 64]} /><shaderMaterial vertexShader={lensVS} fragmentShader={lensFS} uniforms={lensU} transparent blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} /></mesh>
      <mesh ref={shaftMeshRef}><circleGeometry args={[1, 64]} /><shaderMaterial vertexShader={shaftVS} fragmentShader={shaftFS} uniforms={shaftU} transparent blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} /></mesh>
      <mesh ref={outerGlowRef}><circleGeometry args={[1, 64]} /><meshBasicMaterial color="#ffcc66" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} /></mesh>
      <points ref={raysRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={rayCount} array={rayData.positions} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={rayCount} array={rayData.colors} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial map={spriteTexture} size={0.12} transparent opacity={0} vertexColors sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} />
      </points>
      <pointLight ref={lightRef} position={[0, 0, 10]} intensity={0} color="#ffdd99" distance={300} />
      <pointLight ref={light2Ref} position={[0, 0, 30]} intensity={0} color="#ffaa55" distance={180} />
    </group>
  )
}

/* ─── Golden Wash ─── */

function GoldenWash({ progress }) {
  const ref = useRef()
  const { camera } = useThree()
  useFrame(() => {
    if (!ref.current) return
    const w = progress.current > 0.82 ? (progress.current - 0.82) / 0.18 : 0
    ref.current.material.opacity = w * w * 0.95
    ref.current.position.copy(camera.position); ref.current.position.z -= 2; ref.current.quaternion.copy(camera.quaternion)
  })
  return <mesh ref={ref} renderOrder={999}><planeGeometry args={[150, 150]} /><meshBasicMaterial color="#fff5e0" transparent opacity={0} depthTest={false} depthWrite={false} /></mesh>
}

/* ─── Ambient Dust ─── */

function AmbientDust({ progress }) {
  const ref = useRef()
  const count = 600
  const data = useMemo(() => {
    const pos = new Float32Array(count * 3), cols = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 80; pos[i * 3 + 1] = (Math.random() - 0.5) * 80; pos[i * 3 + 2] = Math.random() * -320
      const w = Math.random(); cols[i * 3] = 0.7 + w * 0.3; cols[i * 3 + 1] = 0.6 + w * 0.3; cols[i * 3 + 2] = 0.8 + w * 0.2
    }
    return { positions: pos, colors: cols }
  }, [])

  useFrame((state) => {
    if (!ref.current) return
    const t = state.clock.elapsedTime, arr = ref.current.geometry.attributes.position.array
    for (let i = 0; i < count; i++) { arr[i * 3] += Math.sin(t * 0.25 + i * 0.7) * 0.004; arr[i * 3 + 1] += Math.cos(t * 0.2 + i * 0.5) * 0.004 }
    ref.current.geometry.attributes.position.needsUpdate = true
    ref.current.material.opacity = 0.2 + progress.current * 0.2
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={data.positions} itemSize={3} />
        <bufferAttribute attach="attributes-color" count={count} array={data.colors} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial map={spriteTexture} size={0.07} transparent opacity={0.2} vertexColors sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} />
    </points>
  )
}

/* ─── Flight Controller (with barrel roll) ─── */

function EpilogueFlightController({ progress, onComplete }) {
  const { camera } = useThree()
  const startTime = useRef(null)
  const completed = useRef(false)

  useFrame((state) => {
    if (startTime.current === null) startTime.current = state.clock.elapsedTime
    const elapsed = state.clock.elapsedTime - startTime.current
    let p = Math.min(1, elapsed / FLIGHT_DURATION)

    const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2
    progress.current = ease

    const z = 5 + ease * -325
    const dampen = 1 - ease * 0.9
    const wobbleX = Math.sin(elapsed * 0.6) * dampen * 1.2
    const wobbleY = Math.cos(elapsed * 0.45) * dampen * 0.7

    camera.position.set(wobbleX, wobbleY, z)

    const lookAheadX = Math.sin(elapsed * 0.35) * dampen * 0.6
    const lookAheadY = Math.cos(elapsed * 0.28) * dampen * 0.3
    camera.lookAt(lookAheadX, lookAheadY, z - 35)

    const roll = Math.sin(elapsed * 0.4) * dampen * 0.06
    camera.rotation.z = roll

    if (p >= 1 && !completed.current) { completed.current = true; onComplete() }
  })

  return null
}

/* ─── Scene ─── */

function EpilogueScene({ onComplete }) {
  const progress = useRef(0)

  return (
    <>
      <ambientLight intensity={0.12} />
      <pointLight position={[0, 0, 15]} intensity={0.6} color="#bbaadd" distance={50} />

      <EpilogueFlightController progress={progress} onComplete={onComplete} />
      <WarmWarpStars progress={progress} />
      <SpeedTunnel progress={progress} />
      <AmbientDust progress={progress} />
      <CameraTrail />
      <NebulaClouds />
      <AuroraRibbons />
      <FloatingMemories />
      <LensFlare progress={progress} />

      <FlyingComet delay={1} direction={[1, 0.5]} />
      <FlyingComet delay={3.5} direction={[-0.9, 0.4]} />
      <FlyingComet delay={5.5} direction={[0.7, -0.6]} />
      <FlyingComet delay={8} direction={[-1.1, 0.3]} />
      <FlyingComet delay={10.5} direction={[0.5, 0.8]} />
      <FlyingComet delay={13} direction={[-0.6, -0.7]} speed={2.5} />
      <FlyingComet delay={15} direction={[0.9, 0.2]} speed={2} />

      <Asteroids progress={progress} />
      <DistantStar progress={progress} />
      <GoldenWash progress={progress} />
    </>
  )
}

/* ─── Main Export ─── */

export default function StarflightEpilogue({ onComplete }) {
  const [flightDone, setFlightDone] = useState(false)

  const handleFlightComplete = useCallback(() => {
    setFlightDone(true)
    setTimeout(() => { if (onComplete) onComplete() }, 1200)
  }, [onComplete])

  return (
    <div className="portal-journey-container">
      <Canvas
        camera={{ position: [0, 0, 5], fov: 70, near: 0.1, far: 600 }}
        dpr={[1, 1.5]}
        gl={{ antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false, depth: true }}
        style={{ opacity: flightDone ? 0 : 1, transition: 'opacity 1.2s ease' }}
      >
        <color attach="background" args={['#020006']} />
        <EpilogueScene onComplete={handleFlightComplete} />
      </Canvas>
    </div>
  )
}
