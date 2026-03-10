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

/* ─── Star shader (circular, no square edges) ─── */

const starVertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const starFragmentShader = `
uniform float uTime;
uniform float uIntensity;
varying vec2 vUv;

void main() {
  vec2 uv = vUv - 0.5;
  float dist = length(uv);

  float mask = smoothstep(0.5, 0.35, dist);

  float core = exp(-dist * 22.0) * 2.0;
  float innerGlow = exp(-dist * 8.0) * 0.9;

  float pulse = 1.0 + sin(uTime * 2.5) * 0.12 + sin(uTime * 4.3) * 0.06;
  float halo = exp(-dist * 3.0) * 0.4 * pulse;

  float angle = atan(uv.y, uv.x);

  float rays4 = pow(abs(cos(angle * 2.0)), 50.0) * exp(-dist * 3.5) * 0.8;
  float rays6 = pow(abs(cos(angle * 3.0 + 0.5)), 70.0) * exp(-dist * 4.5) * 0.35;
  float rotRays = pow(abs(cos(angle * 4.0 + uTime * 0.25)), 90.0) * exp(-dist * 4.0) * 0.2;

  float ring1 = exp(-pow((dist - 0.12 * pulse) * 14.0, 2.0)) * 0.2;
  float ring2 = exp(-pow((dist - 0.2 * pulse) * 11.0, 2.0)) * 0.1;

  float brightness = (core + innerGlow + halo + rays4 + rays6 + rotRays + ring1 + ring2) * uIntensity * mask;

  vec3 hotWhite = vec3(1.0, 0.98, 0.95);
  vec3 warmYellow = vec3(1.0, 0.88, 0.55);
  vec3 deepOrange = vec3(1.0, 0.6, 0.25);
  vec3 color = mix(deepOrange, warmYellow, smoothstep(0.0, 0.3, brightness));
  color = mix(color, hotWhite, smoothstep(0.5, 1.5, brightness));

  color += vec3(
    sin(dist * 25.0 - uTime * 2.0) * 0.02,
    sin(dist * 25.0 - uTime * 2.0 + 2.094) * 0.02,
    sin(dist * 25.0 - uTime * 2.0 + 4.189) * 0.02
  ) * exp(-dist * 6.0) * uIntensity;

  gl_FragColor = vec4(color * brightness, brightness * mask);
}
`

/* ─── Gravitational lensing ring shader ─── */

const lensRingVertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const lensRingFragmentShader = `
uniform float uTime;
uniform float uIntensity;
varying vec2 vUv;

void main() {
  vec2 uv = vUv - 0.5;
  float dist = length(uv);

  float ring = exp(-pow((dist - 0.35) * 10.0, 2.0)) * 0.7;
  float ring2 = exp(-pow((dist - 0.42) * 12.0, 2.0)) * 0.3;
  float innerRing = exp(-pow((dist - 0.25) * 14.0, 2.0)) * 0.4;

  float angle = atan(uv.y, uv.x);
  float shimmer = 0.7 + 0.3 * sin(angle * 6.0 + uTime * 3.0);
  float shimmer2 = 0.8 + 0.2 * sin(angle * 8.0 - uTime * 2.0);

  float brightness = (ring * shimmer + ring2 * shimmer2 + innerRing) * uIntensity;

  float mask = smoothstep(0.5, 0.4, dist);

  vec3 color = mix(vec3(1.0, 0.7, 0.3), vec3(1.0, 0.95, 0.8), brightness);
  gl_FragColor = vec4(color * brightness, brightness * mask * 0.6);
}
`

/* ─── Photo frame glow shader ─── */

const frameVertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const frameFragmentShader = `
uniform float uTime;
uniform float uOpacity;
uniform float uSeed;
varying vec2 vUv;

void main() {
  vec2 uv = vUv;
  vec2 fc = abs(uv - 0.5) * 2.0;
  float edge = max(fc.x, fc.y);

  float border = smoothstep(0.72, 0.92, edge) * smoothstep(1.0, 0.95, edge);
  float glow = border * (0.5 + 0.5 * sin(uTime * 2.5 + uSeed + uv.x * 6.28));

  float traveling = sin(uTime * 1.5 + uSeed) * 0.5 + 0.5;
  float travelGlow = smoothstep(0.7, 0.9, edge) * smoothstep(1.0, 0.93, edge);
  float travelAngle = atan(uv.y - 0.5, uv.x - 0.5);
  float travelMask = smoothstep(0.0, 0.3, sin(travelAngle * 2.0 + uTime * 3.0 + uSeed));
  travelGlow *= travelMask * 0.4;

  float corners = smoothstep(0.82, 1.0, fc.x) * smoothstep(0.82, 1.0, fc.y);
  float cornerPulse = corners * (0.7 + 0.4 * sin(uTime * 2.0 + uSeed));

  float outerHalo = smoothstep(1.0, 0.55, edge) * 0.12;

  vec3 gold = vec3(1.0, 0.85, 0.5);
  vec3 warm = vec3(1.0, 0.65, 0.35);
  vec3 color = mix(gold, warm, sin(uTime * 1.2 + uSeed) * 0.5 + 0.5);

  float alpha = (glow + travelGlow + cornerPulse * 0.5 + outerHalo) * uOpacity;
  gl_FragColor = vec4(color, alpha);
}
`

/* ─── Nebula dust shader ─── */

const nebulaVertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const nebulaFragmentShader = `
uniform float uTime;
uniform float uOpacity;
uniform vec3 uColor;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y);
}
float fbm(vec2 p) {
  float v=0.0, a=0.5;
  for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.1; a*=0.5; }
  return v;
}

void main() {
  vec2 uv = vUv - 0.5;
  float dist = length(uv);
  float n = fbm(uv * 3.5 + uTime * 0.12);
  float n2 = fbm(uv * 5.0 - uTime * 0.08 + 50.0);
  float shape = exp(-dist * 2.5) * (n * 0.7 + n2 * 0.3);
  vec3 col = uColor * shape * 2.5;
  float alpha = shape * uOpacity * smoothstep(0.5, 0.0, dist);
  gl_FragColor = vec4(col, alpha);
}
`

/* ─── Light shaft shader ─── */

const shaftVertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const shaftFragmentShader = `
uniform float uTime;
uniform float uIntensity;
varying vec2 vUv;

void main() {
  vec2 uv = vUv - 0.5;
  float angle = atan(uv.y, uv.x);
  float dist = length(uv);

  float shaft = 0.0;
  for (float i = 0.0; i < 8.0; i++) {
    float a = i * 0.7854 + uTime * 0.15;
    float diff = abs(mod(angle - a + 3.14159, 6.28318) - 3.14159);
    shaft += exp(-diff * 20.0) * exp(-dist * 2.0) * 0.15;
  }

  float mask = smoothstep(0.5, 0.3, dist);
  float brightness = shaft * uIntensity * mask;

  vec3 color = mix(vec3(1.0, 0.8, 0.4), vec3(1.0, 0.95, 0.85), dist * 2.0);
  gl_FragColor = vec4(color * brightness, brightness * 0.5);
}
`

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

/* ─── Speed Tunnel (cylindrical streaks) ─── */

function SpeedTunnel({ progress }) {
  const ref = useRef()
  const count = 500

  const data = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const cols = new Float32Array(count * 3)
    const seeds = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const radius = 6 + Math.random() * 40
      pos[i * 3] = Math.cos(angle) * radius
      pos[i * 3 + 1] = Math.sin(angle) * radius
      pos[i * 3 + 2] = Math.random() * -250
      cols[i * 3] = 0.7 + Math.random() * 0.3
      cols[i * 3 + 1] = 0.7 + Math.random() * 0.2
      cols[i * 3 + 2] = 0.9 + Math.random() * 0.1
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
      arr[i * 3 + 2] += speed * (1.0 + data.seeds[i] * 2.5)
      if (arr[i * 3 + 2] > 10) {
        const angle = Math.random() * Math.PI * 2
        const radius = 6 + Math.random() * 40
        arr[i * 3] = Math.cos(angle) * radius
        arr[i * 3 + 1] = Math.sin(angle) * radius
        arr[i * 3 + 2] = -250 + Math.random() * -60
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

/* ─── Cinematic Photo Memory ─── */

function PhotoMemory({ photoUrl, config }) {
  const groupRef = useRef()
  const photoRef = useRef()
  const frameMatRef = useRef()
  const bgGlowRef = useRef()
  const trailRef = useRef()
  const burstRef = useRef()

  const texture = useLoader(THREE.TextureLoader, photoUrl)
  const { zPos, xPos, yPos, enterAngle, floatSeed, orbitDir, size } = config

  const frameUniforms = useMemo(() => ({
    uTime: { value: 0 },
    uOpacity: { value: 0 },
    uSeed: { value: floatSeed },
  }), [floatSeed])

  const sparkCount = 30
  const sparkData = useMemo(() => {
    const pos = new Float32Array(sparkCount * 3)
    const cols = new Float32Array(sparkCount * 3)
    for (let i = 0; i < sparkCount; i++) {
      const a = Math.random() * Math.PI * 2
      const r = 1.5 + Math.random() * 1.5
      pos[i * 3] = Math.cos(a) * r
      pos[i * 3 + 1] = Math.sin(a) * r
      pos[i * 3 + 2] = (Math.random() - 0.5) * 0.8
      const warmth = Math.random()
      cols[i * 3] = 1.0
      cols[i * 3 + 1] = 0.8 + warmth * 0.2
      cols[i * 3 + 2] = 0.5 + warmth * 0.3
    }
    return { positions: pos, colors: cols }
  }, [])

  const trailCount = 40
  const trailData = useMemo(() => {
    const pos = new Float32Array(trailCount * 3)
    const cols = new Float32Array(trailCount * 3)
    for (let i = 0; i < trailCount; i++) {
      const f = i / trailCount
      cols[i * 3] = 1.0
      cols[i * 3 + 1] = 0.85 - f * 0.3
      cols[i * 3 + 2] = 0.6 - f * 0.4
    }
    return { positions: pos, colors: cols }
  }, [])

  useFrame((state) => {
    if (!groupRef.current) return
    const camZ = state.camera.position.z
    const dist = camZ - zPos
    const absDist = Math.abs(dist)
    const t = state.clock.elapsedTime

    const fadeIn = 40
    const fadeOut = 15
    const approaching = dist > 0

    let opacity
    if (approaching) {
      opacity = absDist < fadeIn ? Math.pow(Math.max(0, 1 - absDist / fadeIn), 2) : 0
    } else {
      opacity = absDist < fadeOut ? Math.pow(Math.max(0, 1 - absDist / fadeOut), 3) : 0
    }

    const entryProgress = approaching ? Math.max(0, 1 - absDist / fadeIn) : 1
    const scaleAnim = approaching
      ? 0.1 + entryProgress * entryProgress * 0.9
      : 1.0 - (1 - opacity) * 0.5

    const entryX = approaching ? xPos + (1 - entryProgress) * enterAngle * 8 : xPos
    const entryY = approaching ? yPos + (1 - entryProgress) * Math.sin(floatSeed) * 4 : yPos
    const rotY = approaching ? (1 - entryProgress) * enterAngle * 0.8 : 0
    const rotZ = Math.sin(t * 0.3 + floatSeed) * 0.04

    groupRef.current.position.set(entryX, entryY + Math.sin(t * 0.5 + floatSeed) * 0.4, zPos)
    groupRef.current.scale.setScalar(scaleAnim * size)
    groupRef.current.rotation.set(0, rotY, rotZ)

    if (photoRef.current) photoRef.current.material.opacity = opacity
    if (bgGlowRef.current) bgGlowRef.current.material.opacity = opacity * 0.2

    frameUniforms.uTime.value = t
    frameUniforms.uOpacity.value = opacity * 0.8

    if (burstRef.current) {
      burstRef.current.material.opacity = opacity * 0.45
      burstRef.current.rotation.z = t * 0.3 * orbitDir
      const sArr = burstRef.current.geometry.attributes.position.array
      for (let i = 0; i < sparkCount; i++) {
        const a = (i / sparkCount) * Math.PI * 2 + t * 0.6 * orbitDir + floatSeed
        const r = 1.8 + Math.sin(t * 2.5 + i * 0.5) * 0.4
        sArr[i * 3] = Math.cos(a) * r
        sArr[i * 3 + 1] = Math.sin(a) * r
        sArr[i * 3 + 2] = Math.sin(t * 1.5 + i) * 0.2
      }
      burstRef.current.geometry.attributes.position.needsUpdate = true
    }

    if (trailRef.current) {
      trailRef.current.material.opacity = opacity * 0.3
      const tArr = trailRef.current.geometry.attributes.position.array
      for (let i = 0; i < trailCount; i++) {
        const f = i / trailCount
        tArr[i * 3] = f * enterAngle * -3
        tArr[i * 3 + 1] = f * Math.sin(floatSeed) * -2 + Math.sin(t + f * 4) * 0.1
        tArr[i * 3 + 2] = f * 5
      }
      trailRef.current.geometry.attributes.position.needsUpdate = true
    }
  })

  return (
    <group ref={groupRef}>
      {/* large outer glow */}
      <mesh ref={bgGlowRef} position={[0, 0, -0.06]}>
        <planeGeometry args={[6, 5]} />
        <meshBasicMaterial color="#ffbb66" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>

      {/* animated frame shader */}
      <mesh position={[0, 0, -0.03]}>
        <planeGeometry args={[4.4, 3.4]} />
        <shaderMaterial
          ref={frameMatRef}
          vertexShader={frameVertexShader}
          fragmentShader={frameFragmentShader}
          uniforms={frameUniforms}
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* actual photo */}
      <mesh ref={photoRef}>
        <planeGeometry args={[3.6, 2.6]} />
        <meshBasicMaterial map={texture} transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      {/* orbiting sparkles */}
      <points ref={burstRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={sparkCount} array={sparkData.positions} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={sparkCount} array={sparkData.colors} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial map={spriteTexture} size={0.14} transparent opacity={0} vertexColors sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} />
      </points>

      {/* trailing light particles */}
      <points ref={trailRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={trailCount} array={trailData.positions} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={trailCount} array={trailData.colors} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial map={spriteTexture} size={0.1} transparent opacity={0} vertexColors sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} />
      </points>
    </group>
  )
}

function FloatingMemories() {
  const memories = useMemo(() => {
    const formations = [
      { x: -8, y: 1, angle: 1 },
      { x: 9, y: -1.5, angle: -1 },
      { x: -6, y: -3, angle: 0.7 },
      { x: 7, y: 3, angle: -0.8 },
      { x: -10, y: 0, angle: 1.2 },
      { x: 11, y: -2, angle: -1.1 },
      { x: -5, y: 4, angle: 0.5 },
      { x: 8, y: 1.5, angle: -0.6 },
      { x: -9, y: -2, angle: 0.9 },
      { x: 6, y: -4, angle: -0.7 },
      { x: -7, y: 2.5, angle: 1.1 },
      { x: 10, y: 0.5, angle: -0.9 },
      { x: -11, y: -1, angle: 0.8 },
      { x: 5, y: 3.5, angle: -1.3 },
      { x: -8, y: -3.5, angle: 0.6 },
      { x: 9, y: 2, angle: -0.5 },
      { x: -6, y: 1.5, angle: 1.0 },
      { x: 7, y: -3, angle: -1.2 },
      { x: -10, y: 3, angle: 0.4 },
      { x: 12, y: -0.5, angle: -0.8 },
      { x: -4, y: -4, angle: 1.3 },
      { x: 8, y: 4, angle: -0.4 },
      { x: -9, y: 0.5, angle: 0.7 },
      { x: 6, y: -2, angle: -1.0 },
    ]
    return MEMORY_INDICES.map((idx, i) => ({
      url: `/gallery/thumbs/photo${idx}.webp`,
      config: {
        zPos: -18 - i * 12,
        xPos: formations[i].x + (Math.random() - 0.5) * 2,
        yPos: formations[i].y + (Math.random() - 0.5) * 1.5,
        enterAngle: formations[i].angle,
        floatSeed: Math.random() * Math.PI * 2,
        orbitDir: i % 2 === 0 ? 1 : -1,
        size: 0.8 + Math.random() * 0.4,
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
      new THREE.Color('#553388'), new THREE.Color('#884466'),
      new THREE.Color('#665533'), new THREE.Color('#446688'),
      new THREE.Color('#885544'), new THREE.Color('#553366'),
      new THREE.Color('#667744'), new THREE.Color('#774455'),
    ]
    return Array.from({ length: 8 }, (_, i) => ({
      position: [(Math.random() - 0.5) * 35, (Math.random() - 0.5) * 25, -25 - i * 35],
      scale: 15 + Math.random() * 12,
      color: palette[i],
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0 },
        uColor: { value: palette[i] },
      },
    }))
  }, [])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    const camZ = state.camera.position.z
    clouds.forEach((c) => {
      c.uniforms.uTime.value = t
      const dist = Math.abs(camZ - c.position[2])
      c.uniforms.uOpacity.value = Math.max(0, 1 - dist / 60) * 0.35
    })
  })

  return (
    <>
      {clouds.map((c, i) => (
        <mesh key={i} position={c.position} rotation={[0, 0, i * 0.7]}>
          <planeGeometry args={[c.scale, c.scale]} />
          <shaderMaterial
            vertexShader={nebulaVertexShader}
            fragmentShader={nebulaFragmentShader}
            uniforms={c.uniforms}
            transparent
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </>
  )
}

/* ─── Comets ─── */

function FlyingComet({ delay, direction, speed: cometSpeed }) {
  const ref = useRef()
  const trailRef = useRef()
  const startTime = useRef(null)

  const trailCount = 120
  const trailData = useMemo(() => {
    const pos = new Float32Array(trailCount * 3)
    const cols = new Float32Array(trailCount * 3)
    for (let i = 0; i < trailCount; i++) {
      const f = i / trailCount
      cols[i * 3] = 1.0
      cols[i * 3 + 1] = 0.95 - f * 0.5
      cols[i * 3 + 2] = 0.75 - f * 0.6
    }
    return { positions: pos, colors: cols }
  }, [])

  useFrame((state) => {
    if (startTime.current === null) startTime.current = state.clock.elapsedTime
    const elapsed = state.clock.elapsedTime - startTime.current - delay
    const dur = cometSpeed || 3.5
    if (elapsed < 0 || elapsed > dur) {
      if (ref.current) ref.current.visible = false
      if (trailRef.current) trailRef.current.visible = false
      return
    }
    if (ref.current) ref.current.visible = true
    if (trailRef.current) trailRef.current.visible = true

    const t = elapsed / dur
    const ease = t * t * (3 - 2 * t)
    const x = direction[0] * (ease - 0.5) * 100
    const y = direction[1] * (ease - 0.5) * 100
    const z = state.camera.position.z - 12 - ease * 50

    if (ref.current) {
      ref.current.position.set(x, y, z)
      ref.current.scale.setScalar(1.2 + Math.sin(elapsed * 10) * 0.3)
    }

    if (trailRef.current) {
      const arr = trailRef.current.geometry.attributes.position.array
      for (let i = 0; i < trailCount; i++) {
        const f = i / trailCount
        arr[i * 3] = x - direction[0] * f * 15
        arr[i * 3 + 1] = y - direction[1] * f * 15
        arr[i * 3 + 2] = z + f * 10
      }
      trailRef.current.geometry.attributes.position.needsUpdate = true
    }
  })

  return (
    <>
      <mesh ref={ref} visible={false}>
        <sphereGeometry args={[0.25, 12, 12]} />
        <meshBasicMaterial color="#ffffdd" blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
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
  const count = 20
  const meshes = useRef([])

  const data = useMemo(() => {
    return Array.from({ length: count }, () => ({
      x: (Math.random() - 0.5) * 55,
      y: (Math.random() - 0.5) * 40,
      z: -40 - Math.random() * 200,
      size: 0.1 + Math.random() * 0.45,
      rotSpeed: (Math.random() - 0.5) * 3,
    }))
  }, [])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    const p = progress.current
    const vis = p > 0.1 && p < 0.75

    meshes.current.forEach((mesh, i) => {
      if (!mesh) return
      mesh.visible = vis
      if (vis) {
        mesh.rotation.x = t * data[i].rotSpeed
        mesh.rotation.y = t * data[i].rotSpeed * 0.7
      }
    })
  })

  return (
    <>
      {data.map((d, i) => (
        <mesh key={i} ref={(el) => (meshes.current[i] = el)} position={[d.x, d.y, d.z]} visible={false}>
          <dodecahedronGeometry args={[d.size, 0]} />
          <meshStandardMaterial color="#887766" roughness={0.85} metalness={0.15} />
        </mesh>
      ))}
    </>
  )
}

/* ─── Distant Star (shader-based, circular) ─── */

function DistantStar({ progress }) {
  const starMeshRef = useRef()
  const lensMeshRef = useRef()
  const shaftMeshRef = useRef()
  const outerGlowRef = useRef()
  const raysRef = useRef()
  const lightRef = useRef()
  const light2Ref = useRef()

  const starUniforms = useMemo(() => ({
    uTime: { value: 0 },
    uIntensity: { value: 0 },
  }), [])

  const lensUniforms = useMemo(() => ({
    uTime: { value: 0 },
    uIntensity: { value: 0 },
  }), [])

  const shaftUniforms = useMemo(() => ({
    uTime: { value: 0 },
    uIntensity: { value: 0 },
  }), [])

  const rayCount = 300
  const rayData = useMemo(() => {
    const pos = new Float32Array(rayCount * 3)
    const cols = new Float32Array(rayCount * 3)
    const seeds = new Float32Array(rayCount)
    for (let i = 0; i < rayCount; i++) {
      const angle = Math.random() * Math.PI * 2
      const r = 0.3 + Math.random() * 12
      pos[i * 3] = Math.cos(angle) * r
      pos[i * 3 + 1] = Math.sin(angle) * r
      pos[i * 3 + 2] = (Math.random() - 0.5) * 3
      cols[i * 3] = 1.0
      cols[i * 3 + 1] = 0.85 + Math.random() * 0.15
      cols[i * 3 + 2] = 0.5 + Math.random() * 0.4
      seeds[i] = Math.random()
    }
    return { positions: pos, colors: cols, seeds }
  }, [])

  useFrame((state) => {
    const p = progress.current
    const t = state.clock.elapsedTime

    starUniforms.uTime.value = t
    starUniforms.uIntensity.value = p * p * 2.5
    lensUniforms.uTime.value = t
    lensUniforms.uIntensity.value = Math.max(0, (p - 0.3) * 2) * p
    shaftUniforms.uTime.value = t
    shaftUniforms.uIntensity.value = Math.max(0, (p - 0.2) * 1.5) * p

    const grow = p < 0.35 ? p * 2.8 : 1 + (p - 0.35) * 10

    if (starMeshRef.current) starMeshRef.current.scale.setScalar(3 + grow * 7)
    if (lensMeshRef.current) lensMeshRef.current.scale.setScalar(5 + grow * 14)
    if (shaftMeshRef.current) shaftMeshRef.current.scale.setScalar(8 + grow * 22)

    if (outerGlowRef.current) {
      outerGlowRef.current.scale.setScalar(8 + grow * 25)
      outerGlowRef.current.material.opacity = Math.min(0.1, p * 0.12)
    }

    if (raysRef.current) {
      raysRef.current.material.opacity = Math.min(0.55, p * p * 0.9)
      raysRef.current.material.size = 0.08 + p * 0.5
      raysRef.current.rotation.z = t * 0.08

      const arr = raysRef.current.geometry.attributes.position.array
      for (let i = 0; i < rayCount; i++) {
        const a = rayData.seeds[i] * Math.PI * 2 + t * 0.15
        const baseR = 0.3 + rayData.seeds[i] * 12
        const r = baseR * (1 + grow * 0.4) + Math.sin(t * 2.5 + rayData.seeds[i] * 8) * 0.6
        arr[i * 3] = Math.cos(a) * r
        arr[i * 3 + 1] = Math.sin(a) * r
      }
      raysRef.current.geometry.attributes.position.needsUpdate = true
    }

    if (lightRef.current) lightRef.current.intensity = p * p * 15
    if (light2Ref.current) light2Ref.current.intensity = p * p * 8
  })

  return (
    <group position={[0, 0, -320]}>
      {/* core star with rays */}
      <mesh ref={starMeshRef}>
        <circleGeometry args={[1, 64]} />
        <shaderMaterial
          vertexShader={starVertexShader}
          fragmentShader={starFragmentShader}
          uniforms={starUniforms}
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* gravitational lensing ring */}
      <mesh ref={lensMeshRef}>
        <circleGeometry args={[1, 64]} />
        <shaderMaterial
          vertexShader={lensRingVertexShader}
          fragmentShader={lensRingFragmentShader}
          uniforms={lensUniforms}
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* volumetric light shafts */}
      <mesh ref={shaftMeshRef}>
        <circleGeometry args={[1, 64]} />
        <shaderMaterial
          vertexShader={shaftVertexShader}
          fragmentShader={shaftFragmentShader}
          uniforms={shaftUniforms}
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* soft outer glow */}
      <mesh ref={outerGlowRef}>
        <circleGeometry args={[1, 64]} />
        <meshBasicMaterial color="#ffcc66" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>

      {/* orbiting ray particles */}
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
    const p = progress.current
    const wash = p > 0.82 ? (p - 0.82) / 0.18 : 0
    ref.current.material.opacity = wash * wash * 0.95

    ref.current.position.copy(camera.position)
    ref.current.position.z -= 2
    ref.current.quaternion.copy(camera.quaternion)
  })

  return (
    <mesh ref={ref} renderOrder={999}>
      <planeGeometry args={[150, 150]} />
      <meshBasicMaterial color="#fff5e0" transparent opacity={0} depthTest={false} depthWrite={false} />
    </mesh>
  )
}

/* ─── Ambient Dust ─── */

function AmbientDust({ progress }) {
  const ref = useRef()
  const count = 600

  const data = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const cols = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 80
      pos[i * 3 + 1] = (Math.random() - 0.5) * 80
      pos[i * 3 + 2] = Math.random() * -320
      const warmth = Math.random()
      cols[i * 3] = 0.7 + warmth * 0.3
      cols[i * 3 + 1] = 0.6 + warmth * 0.3
      cols[i * 3 + 2] = 0.8 + warmth * 0.2
    }
    return { positions: pos, colors: cols }
  }, [])

  useFrame((state) => {
    if (!ref.current) return
    const t = state.clock.elapsedTime
    const arr = ref.current.geometry.attributes.position.array
    for (let i = 0; i < count; i++) {
      arr[i * 3] += Math.sin(t * 0.25 + i * 0.7) * 0.004
      arr[i * 3 + 1] += Math.cos(t * 0.2 + i * 0.5) * 0.004
    }
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

/* ─── Flight Controller ─── */

function EpilogueFlightController({ progress, onComplete }) {
  const { camera } = useThree()
  const startTime = useRef(null)
  const completed = useRef(false)

  useFrame((state) => {
    if (startTime.current === null) startTime.current = state.clock.elapsedTime
    const elapsed = state.clock.elapsedTime - startTime.current
    let p = Math.min(1, elapsed / FLIGHT_DURATION)

    const ease = p < 0.5
      ? 2 * p * p
      : 1 - Math.pow(-2 * p + 2, 2) / 2
    progress.current = ease

    const z = 5 + ease * -325
    const wobbleX = Math.sin(elapsed * 0.6) * (1 - ease * 0.9) * 1.2
    const wobbleY = Math.cos(elapsed * 0.45) * (1 - ease * 0.9) * 0.7
    const lookShift = Math.sin(elapsed * 0.35) * (1 - ease) * 0.5

    camera.position.set(wobbleX, wobbleY, z)
    camera.lookAt(lookShift, wobbleY * 0.1, z - 35)

    if (p >= 1 && !completed.current) {
      completed.current = true
      onComplete()
    }
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
      <NebulaClouds />
      <FloatingMemories />

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

export default function StarflightEpilogue({ onRestart }) {
  const [flightDone, setFlightDone] = useState(false)
  const [showFinal, setShowFinal] = useState(false)

  const handleFlightComplete = useCallback(() => {
    setFlightDone(true)
    setTimeout(() => setShowFinal(true), 800)
  }, [])

  return (
    <div className="portal-journey-container">
      <Canvas
        camera={{ position: [0, 0, 5], fov: 70, near: 0.1, far: 600 }}
        dpr={[1, 1.5]}
        gl={{
          antialias: false,
          alpha: false,
          powerPreference: 'high-performance',
          stencil: false,
          depth: true,
        }}
        style={{ opacity: flightDone ? 0.3 : 1, transition: 'opacity 1.5s ease' }}
      >
        <color attach="background" args={['#020006']} />
        <EpilogueScene onComplete={handleFlightComplete} />
      </Canvas>

      {showFinal && (
        <div className="epilogue-final-overlay">
          <div className="epilogue-final-content">
            <p className="epilogue-final-text">Наша история продолжается...</p>
            <p className="epilogue-final-subtitle">и это только начало</p>
            <button className="planet-button epilogue-restart-btn" onClick={onRestart}>
              Сначала
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
