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

function PortalRing() {
  const ring1 = useRef()
  const ring2 = useRef()
  const ring3 = useRef()
  const coreRef = useRef()

  const swirlCount = 300
  const swirlRef = useRef()
  const swirlData = useMemo(() => {
    const pos = new Float32Array(swirlCount * 3)
    const cols = new Float32Array(swirlCount * 3)
    const phases = []
    for (let i = 0; i < swirlCount; i++) {
      const a = (i / swirlCount) * Math.PI * 2 * 3
      const r = 9 + (Math.random() - 0.5) * 3
      pos[i * 3] = Math.cos(a) * r
      pos[i * 3 + 1] = Math.sin(a) * r
      pos[i * 3 + 2] = (Math.random() - 0.5) * 2
      const c = Math.random()
      cols[i * 3] = c < 0.5 ? 0.6 : 1.0
      cols[i * 3 + 1] = 0.7
      cols[i * 3 + 2] = c < 0.5 ? 1.0 : 0.9
      phases.push(a)
    }
    return { positions: pos, colors: cols, phases }
  }, [])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (ring1.current) ring1.current.rotation.z = t * 0.15
    if (ring2.current) ring2.current.rotation.z = -t * 0.1
    if (ring3.current) ring3.current.rotation.z = t * 0.06
    if (coreRef.current) {
      const p = 0.8 + Math.sin(t * 2) * 0.2
      coreRef.current.scale.set(p, p, 1)
    }
    if (swirlRef.current) {
      const arr = swirlRef.current.geometry.attributes.position.array
      for (let i = 0; i < swirlCount; i++) {
        const phase = swirlData.phases[i]
        const r = 9 + Math.sin(t * 1.8 + phase * 2) * 1.2
        const a = phase + t * 0.35
        arr[i * 3] = Math.cos(a) * r
        arr[i * 3 + 1] = Math.sin(a) * r
        arr[i * 3 + 2] = Math.sin(t * 2.5 + phase * 4) * 1
      }
      swirlRef.current.geometry.attributes.position.needsUpdate = true
    }
  })

  return (
    <group position={[0, 0, -50]}>
      <group ref={ring1}>
        <mesh>
          <torusGeometry args={[10, 0.25, 24, 100]} />
          <meshStandardMaterial color="#ffffff" emissive="#99bbff" emissiveIntensity={5} />
        </mesh>
        <mesh>
          <torusGeometry args={[10, 1.2, 24, 100]} />
          <meshBasicMaterial color="#7799ff" transparent opacity={0.15} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      </group>
      <group ref={ring2}>
        <mesh>
          <torusGeometry args={[12.5, 0.15, 24, 100]} />
          <meshStandardMaterial color="#ddccff" emissive="#bb88ff" emissiveIntensity={3.5} />
        </mesh>
        <mesh>
          <torusGeometry args={[12.5, 0.9, 24, 100]} />
          <meshBasicMaterial color="#9966ff" transparent opacity={0.1} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      </group>
      <group ref={ring3}>
        <mesh>
          <torusGeometry args={[15, 0.1, 16, 80]} />
          <meshBasicMaterial color="#aabbff" transparent opacity={0.35} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      </group>
      <group ref={coreRef}>
        <mesh>
          <circleGeometry args={[8, 64]} />
          <meshBasicMaterial color="#8899ff" transparent opacity={0.08} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
        <mesh>
          <circleGeometry args={[4, 64]} />
          <meshBasicMaterial color="#aaccff" transparent opacity={0.14} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      </group>
      <points ref={swirlRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={swirlCount} array={swirlData.positions} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={swirlCount} array={swirlData.colors} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial map={spriteTexture} size={0.2} transparent opacity={0.7} vertexColors sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} />
      </points>
      <pointLight position={[0, 0, 3]} intensity={4} color="#88aaff" distance={40} />
      <pointLight position={[0, 0, -3]} intensity={3} color="#aa88ff" distance={35} />
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
