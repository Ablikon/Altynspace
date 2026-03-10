import { useRef, useMemo, useState, useCallback } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

const spriteTexture = (() => {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.3, 'rgba(255,255,255,0.6)')
  grad.addColorStop(0.7, 'rgba(255,255,255,0.1)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(canvas)
})()

const FLIGHT_DURATION = 11

const vortexVertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const vortexFragmentShader = `
uniform float uTime;
varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vec2 center = vUv - 0.5;
  float dist = length(center);
  float angle = atan(center.y, center.x);

  float spiral = angle * 3.0 - dist * 15.0 + uTime * 2.5;
  float n = noise(vec2(spiral * 0.5, dist * 8.0 - uTime * 1.5));
  float n2 = noise(vec2(spiral * 0.3 + 50.0, dist * 5.0 + uTime * 0.8));

  float ring = smoothstep(0.5, 0.35, dist) * smoothstep(0.0, 0.08, dist);
  float swirl = (n * 0.6 + n2 * 0.4) * ring;

  float bright = smoothstep(0.4, 0.1, dist) * 0.3;
  float edge = smoothstep(0.5, 0.42, dist) * smoothstep(0.35, 0.42, dist) * 1.5;

  vec3 blue = vec3(0.3, 0.5, 1.0);
  vec3 purple = vec3(0.6, 0.3, 1.0);
  vec3 white = vec3(0.9, 0.9, 1.0);

  vec3 col = mix(blue, purple, n) * swirl * 1.5;
  col += white * bright;
  col += vec3(0.5, 0.6, 1.0) * edge;

  float alpha = (swirl * 0.8 + bright + edge * 0.5) * smoothstep(0.52, 0.4, dist);
  gl_FragColor = vec4(col, alpha);
}
`

function PortalRing() {
  const ring1 = useRef()
  const ring2 = useRef()
  const ring3 = useRef()
  const vortexRef = useRef()

  const swirlCount = 500
  const swirlRef = useRef()
  const swirlData = useMemo(() => {
    const pos = new Float32Array(swirlCount * 3)
    const cols = new Float32Array(swirlCount * 3)
    const phases = []
    for (let i = 0; i < swirlCount; i++) {
      const a = (i / swirlCount) * Math.PI * 2 * 4
      const r = 5 + Math.random() * 9
      pos[i * 3] = Math.cos(a) * r
      pos[i * 3 + 1] = Math.sin(a) * r
      pos[i * 3 + 2] = (Math.random() - 0.5) * 3
      const c = Math.random()
      if (c < 0.3) { cols[i * 3] = 0.4; cols[i * 3 + 1] = 0.6; cols[i * 3 + 2] = 1.0 }
      else if (c < 0.6) { cols[i * 3] = 0.7; cols[i * 3 + 1] = 0.4; cols[i * 3 + 2] = 1.0 }
      else if (c < 0.85) { cols[i * 3] = 1.0; cols[i * 3 + 1] = 0.8; cols[i * 3 + 2] = 1.0 }
      else { cols[i * 3] = 1.0; cols[i * 3 + 1] = 1.0; cols[i * 3 + 2] = 1.0 }
      phases.push(a)
    }
    return { positions: pos, colors: cols, phases }
  }, [])

  const sparkCount = 200
  const sparkRef = useRef()
  const sparkData = useMemo(() => {
    const pos = new Float32Array(sparkCount * 3)
    const cols = new Float32Array(sparkCount * 3)
    const vel = []
    for (let i = 0; i < sparkCount; i++) {
      const a = Math.random() * Math.PI * 2
      const r = 9 + Math.random() * 2
      pos[i * 3] = Math.cos(a) * r
      pos[i * 3 + 1] = Math.sin(a) * r
      pos[i * 3 + 2] = 0
      cols[i * 3] = 0.8 + Math.random() * 0.2
      cols[i * 3 + 1] = 0.7 + Math.random() * 0.3
      cols[i * 3 + 2] = 1.0
      vel.push({ a, speed: 0.5 + Math.random() * 2, life: Math.random() })
    }
    return { positions: pos, colors: cols, vel }
  }, [])

  const rayCount = 24
  const rays = useMemo(() => {
    return Array.from({ length: rayCount }, (_, i) => ({
      angle: (i / rayCount) * Math.PI * 2,
      length: 6 + Math.random() * 8,
      width: 0.04 + Math.random() * 0.06,
      speed: 0.3 + Math.random() * 0.5,
      phase: Math.random() * Math.PI * 2,
    }))
  }, [])

  const vortexUniforms = useMemo(() => ({
    uTime: { value: 0 },
  }), [])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (ring1.current) ring1.current.rotation.z = t * 0.2
    if (ring2.current) ring2.current.rotation.z = -t * 0.12
    if (ring3.current) ring3.current.rotation.z = t * 0.07

    vortexUniforms.uTime.value = t

    if (swirlRef.current) {
      const arr = swirlRef.current.geometry.attributes.position.array
      for (let i = 0; i < swirlCount; i++) {
        const phase = swirlData.phases[i]
        const pullIn = Math.sin(t * 0.8 + phase) * 0.3
        const r = (5 + Math.random() * 9) * (1 - pullIn * 0.1)
        const a = phase + t * 0.4
        arr[i * 3] = Math.cos(a) * r
        arr[i * 3 + 1] = Math.sin(a) * r
        arr[i * 3 + 2] = Math.sin(t * 2 + phase * 3) * 1.5
      }
      swirlRef.current.geometry.attributes.position.needsUpdate = true
    }

    if (sparkRef.current) {
      const arr = sparkRef.current.geometry.attributes.position.array
      for (let i = 0; i < sparkCount; i++) {
        const v = sparkData.vel[i]
        v.life += 0.008 * v.speed
        if (v.life > 1) {
          v.life = 0
          v.a = Math.random() * Math.PI * 2
          v.speed = 0.5 + Math.random() * 2
        }
        const r = 10 + v.life * 12
        const a = v.a + t * 0.15
        arr[i * 3] = Math.cos(a) * r
        arr[i * 3 + 1] = Math.sin(a) * r
        arr[i * 3 + 2] = (v.life - 0.5) * 6
      }
      sparkRef.current.geometry.attributes.position.needsUpdate = true
      sparkRef.current.material.opacity = 0.3 + Math.sin(t * 3) * 0.15
    }
  })

  return (
    <group position={[0, 0, -50]}>
      {/* Vortex core shader */}
      <mesh>
        <planeGeometry args={[22, 22]} />
        <shaderMaterial
          vertexShader={vortexVertexShader}
          fragmentShader={vortexFragmentShader}
          uniforms={vortexUniforms}
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Inner bright ring */}
      <group ref={ring1}>
        <mesh>
          <torusGeometry args={[10, 0.3, 32, 128]} />
          <meshStandardMaterial color="#ffffff" emissive="#99bbff" emissiveIntensity={6} />
        </mesh>
        <mesh>
          <torusGeometry args={[10, 1.5, 32, 128]} />
          <meshBasicMaterial color="#7799ff" transparent opacity={0.18} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
        <mesh>
          <torusGeometry args={[10, 3, 16, 64]} />
          <meshBasicMaterial color="#5577cc" transparent opacity={0.05} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      </group>

      {/* Middle ring */}
      <group ref={ring2}>
        <mesh>
          <torusGeometry args={[12.5, 0.18, 32, 128]} />
          <meshStandardMaterial color="#ddccff" emissive="#bb88ff" emissiveIntensity={4} />
        </mesh>
        <mesh>
          <torusGeometry args={[12.5, 1.2, 32, 128]} />
          <meshBasicMaterial color="#9966ff" transparent opacity={0.12} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      </group>

      {/* Outer ring */}
      <group ref={ring3}>
        <mesh>
          <torusGeometry args={[15, 0.12, 16, 100]} />
          <meshBasicMaterial color="#aabbff" transparent opacity={0.4} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
        <mesh>
          <torusGeometry args={[15, 2, 16, 100]} />
          <meshBasicMaterial color="#6655cc" transparent opacity={0.04} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      </group>

      {/* Energy rays radiating outward */}
      {rays.map((ray, i) => (
        <mesh key={i} position={[0, 0, 0.1]} rotation={[0, 0, ray.angle]}>
          <planeGeometry args={[ray.length, ray.width]} />
          <meshBasicMaterial color="#8899ff" transparent opacity={0.2 + Math.sin(ray.phase) * 0.1} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ))}

      {/* Swirling particles */}
      <points ref={swirlRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={swirlCount} array={swirlData.positions} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={swirlCount} array={swirlData.colors} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial map={spriteTexture} size={0.22} transparent opacity={0.75} vertexColors sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} />
      </points>

      {/* Flying sparks */}
      <points ref={sparkRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={sparkCount} array={sparkData.positions} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={sparkCount} array={sparkData.colors} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial map={spriteTexture} size={0.12} transparent opacity={0.4} vertexColors sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} />
      </points>

      {/* Multi-layer glow */}
      <mesh>
        <sphereGeometry args={[11, 32, 32]} />
        <meshBasicMaterial color="#6677cc" transparent opacity={0.04} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.BackSide} />
      </mesh>
      <mesh>
        <sphereGeometry args={[16, 32, 32]} />
        <meshBasicMaterial color="#5544aa" transparent opacity={0.025} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.BackSide} />
      </mesh>

      <pointLight position={[0, 0, 4]} intensity={5} color="#88aaff" distance={50} />
      <pointLight position={[0, 0, -4]} intensity={4} color="#aa88ff" distance={45} />
      <pointLight position={[0, 0, 0]} intensity={3} color="#6677ee" distance={30} />
    </group>
  )
}

function WarpStars({ progress }) {
  const ref = useRef()
  const count = 2000

  const data = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const cols = new Float32Array(count * 3)
    const seeds = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 80
      pos[i * 3 + 1] = (Math.random() - 0.5) * 80
      pos[i * 3 + 2] = Math.random() * -200
      const warmth = Math.random()
      cols[i * 3] = 0.7 + warmth * 0.3
      cols[i * 3 + 1] = 0.7 + warmth * 0.2
      cols[i * 3 + 2] = 1.0
      seeds[i] = Math.random()
    }
    return { positions: pos, colors: cols, seeds }
  }, [])

  useFrame(() => {
    if (!ref.current) return
    const p = progress.current
    const speed = p < 0.3 ? p / 0.3 * 3 : p < 0.7 ? 3 : 3 * (1 - (p - 0.7) / 0.3)
    const arr = ref.current.geometry.attributes.position.array

    for (let i = 0; i < count; i++) {
      arr[i * 3 + 2] += speed * (0.5 + data.seeds[i] * 1.5)
      if (arr[i * 3 + 2] > 10) {
        arr[i * 3] = (Math.random() - 0.5) * 80
        arr[i * 3 + 1] = (Math.random() - 0.5) * 80
        arr[i * 3 + 2] = -200 + Math.random() * -50
      }
    }
    ref.current.geometry.attributes.position.needsUpdate = true

    const mat = ref.current.material
    mat.size = 0.08 + speed * 0.08
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={data.positions} itemSize={3} />
        <bufferAttribute attach="attributes-color" count={count} array={data.colors} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial map={spriteTexture} size={0.1} transparent opacity={0.8} vertexColors sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} />
    </points>
  )
}

function TunnelParticles({ progress }) {
  const ref = useRef()
  const count = 800

  const data = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const cols = new Float32Array(count * 3)
    const phases = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      const t = i / count
      const angle = t * Math.PI * 20 + Math.random() * Math.PI
      const r = 4 + Math.random() * 8
      pos[i * 3] = Math.cos(angle) * r
      pos[i * 3 + 1] = Math.sin(angle) * r
      pos[i * 3 + 2] = -50 - t * 150
      cols[i * 3] = 0.5 + t * 0.5
      cols[i * 3 + 1] = 0.4 + t * 0.4
      cols[i * 3 + 2] = 1.0 - t * 0.5
      phases[i] = angle
    }
    return { positions: pos, colors: cols, phases }
  }, [])

  useFrame((state) => {
    if (!ref.current) return
    const p = progress.current
    const t = state.clock.elapsedTime
    const arr = ref.current.geometry.attributes.position.array
    const visible = p > 0.15 && p < 0.85

    ref.current.material.opacity = visible ? Math.min(0.6, (p - 0.15) * 4) * (p < 0.75 ? 1 : (0.85 - p) / 0.1) : 0

    if (!visible) return

    for (let i = 0; i < count; i++) {
      const frac = i / count
      const a = data.phases[i] + t * 0.6
      const r = 4 + Math.sin(t * 1.5 + frac * 10) * 2 + Math.random() * 0.1
      arr[i * 3] = Math.cos(a) * r
      arr[i * 3 + 1] = Math.sin(a) * r
    }
    ref.current.geometry.attributes.position.needsUpdate = true
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={data.positions} itemSize={3} />
        <bufferAttribute attach="attributes-color" count={count} array={data.colors} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial map={spriteTexture} size={0.2} transparent opacity={0} vertexColors sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} />
    </points>
  )
}

function NebulaParticles({ progress }) {
  const ref = useRef()
  const count = 600

  const data = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const cols = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = (Math.random() - 0.5) * Math.PI
      const r = 5 + Math.random() * 25
      pos[i * 3] = Math.cos(theta) * Math.cos(phi) * r
      pos[i * 3 + 1] = Math.sin(phi) * r
      pos[i * 3 + 2] = -200 + Math.sin(theta) * Math.cos(phi) * r
      const warmth = 0.5 + Math.random() * 0.5
      cols[i * 3] = warmth
      cols[i * 3 + 1] = warmth * 0.6
      cols[i * 3 + 2] = warmth * 0.3
    }
    return { positions: pos, colors: cols }
  }, [])

  useFrame(() => {
    if (!ref.current) return
    const p = progress.current
    const fadeIn = p > 0.55 ? Math.min(1, (p - 0.55) / 0.2) : 0
    ref.current.material.opacity = fadeIn * 0.5
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={data.positions} itemSize={3} />
        <bufferAttribute attach="attributes-color" count={count} array={data.colors} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial map={spriteTexture} size={0.5} transparent opacity={0} vertexColors sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} />
    </points>
  )
}

function WarmLights({ progress }) {
  const ref1 = useRef()
  const ref2 = useRef()
  const ref3 = useRef()

  useFrame(() => {
    const p = progress.current
    const intensity = p > 0.6 ? (p - 0.6) / 0.4 : 0
    if (ref1.current) ref1.current.intensity = intensity * 4
    if (ref2.current) ref2.current.intensity = intensity * 2.5
    if (ref3.current) ref3.current.intensity = intensity * 2
  })

  return (
    <>
      <pointLight ref={ref1} position={[0, 0, -200]} intensity={0} color="#ffcc88" distance={60} />
      <pointLight ref={ref2} position={[-10, 8, -195]} intensity={0} color="#ffaa77" distance={50} />
      <pointLight ref={ref3} position={[8, -6, -205]} intensity={0} color="#ff9988" distance={45} />
    </>
  )
}

function FlightController({ progress, onComplete }) {
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

    const z = 10 + ease * -220
    const wobbleX = Math.sin(elapsed * 1.2) * (1 - ease) * 0.5
    const wobbleY = Math.cos(elapsed * 0.9) * (1 - ease) * 0.3

    camera.position.set(wobbleX, wobbleY, z)
    camera.lookAt(wobbleX * 0.3, wobbleY * 0.3, z - 20)

    if (p >= 1 && !completed.current) {
      completed.current = true
      onComplete()
    }
  })

  return null
}

function FlightScene({ onComplete }) {
  const progress = useRef(0)

  return (
    <>
      <ambientLight intensity={0.15} />
      <pointLight position={[0, 0, 20]} intensity={1.5} color="#aabbff" distance={60} />

      <FlightController progress={progress} onComplete={onComplete} />
      <PortalRing />
      <WarpStars progress={progress} />
      <TunnelParticles progress={progress} />
      <NebulaParticles progress={progress} />
      <WarmLights progress={progress} />
    </>
  )
}

export default function PortalJourney({ onComplete, onBack }) {
  const [flightDone, setFlightDone] = useState(false)

  const handleFlightComplete = useCallback(() => {
    setFlightDone(true)
    if (onComplete) onComplete()
  }, [onComplete])

  return (
    <div className="portal-journey-container">
      <Canvas
        camera={{ position: [0, 0, 10], fov: 75, near: 0.1, far: 500 }}
        dpr={[1, 1.5]}
        gl={{
          antialias: false,
          alpha: false,
          powerPreference: 'high-performance',
          stencil: false,
          depth: true,
        }}
        style={{ opacity: flightDone ? 0.4 : 1, transition: 'opacity 1.5s ease' }}
      >
        <color attach="background" args={['#020008']} />
        <FlightScene onComplete={handleFlightComplete} />
      </Canvas>
    </div>
  )
}
