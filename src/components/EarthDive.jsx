import { useRef, useMemo, useState, useCallback, useEffect, Suspense } from 'react'
import { Canvas, useFrame, useThree, useLoader } from '@react-three/fiber'
import { motion, AnimatePresence } from 'framer-motion'
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

const FLIGHT_DURATION = 26

/* ─── GLSL: Atmosphere Fresnel ─── */

const atmosVS = `
varying vec3 vNormal; varying vec3 vViewDir;
void main() {
  vNormal = normalize(normalMatrix * normal);
  vec4 wp = modelViewMatrix * vec4(position, 1.0);
  vViewDir = normalize(-wp.xyz);
  gl_Position = projectionMatrix * wp;
}
`
const atmosFS = `
uniform float uIntensity;
varying vec3 vNormal; varying vec3 vViewDir;
void main() {
  float f = pow(1.0 - dot(vNormal, vViewDir), 3.0) * uIntensity;
  vec3 c = mix(vec3(0.3, 0.6, 1.0), vec3(0.5, 0.8, 1.0), f);
  gl_FragColor = vec4(c, f * 0.8);
}
`

/* ─── GLSL: Heat vignette ─── */

const heatVS = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`
const heatFS = `
uniform float uIntensity, uTime; varying vec2 vUv;
void main() {
  vec2 uv = vUv - 0.5; float d = length(uv);
  float edge = smoothstep(0.3, 0.55, d);
  float flicker = 0.8 + 0.2 * sin(uTime * 15.0 + d * 20.0);
  float heat = edge * uIntensity * flicker;
  vec3 c = mix(vec3(1.0, 0.4, 0.1), vec3(1.0, 0.8, 0.3), 1.0 - d);
  gl_FragColor = vec4(c, heat * 0.7);
}
`

/* ─── GLSL: Landing glow pulse ─── */

const glowVS = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`
const glowFS = `
uniform float uTime, uIntensity; varying vec2 vUv;
void main() {
  vec2 uv = vUv - 0.5; float d = length(uv);
  float ring1 = exp(-pow((d - 0.15) * 12.0, 2.0)) * 0.8;
  float ring2 = exp(-pow((d - 0.3) * 8.0, 2.0)) * 0.4;
  float pulse = 0.7 + 0.3 * sin(uTime * 3.0);
  float core = exp(-d * 10.0) * 1.2;
  float b = (ring1 * pulse + ring2 + core) * uIntensity;
  float mask = smoothstep(0.5, 0.3, d);
  vec3 c = mix(vec3(1.0, 0.7, 0.3), vec3(1.0, 0.95, 0.85), core);
  gl_FragColor = vec4(c * b, b * mask);
}
`

/* ═══════════════════════════════════════ */
/* ─── Components ─── */
/* ═══════════════════════════════════════ */

function DeepStars({ progress }) {
  const ref = useRef()
  const count = 3000
  const data = useMemo(() => {
    const pos = new Float32Array(count * 3), cols = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2, phi = Math.acos(2 * Math.random() - 1)
      const r = 150 + Math.random() * 150
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      pos[i * 3 + 2] = r * Math.cos(phi)
      cols[i * 3] = 0.8 + Math.random() * 0.2; cols[i * 3 + 1] = 0.8 + Math.random() * 0.2; cols[i * 3 + 2] = 0.9 + Math.random() * 0.1
    }
    return { positions: pos, colors: cols }
  }, [])

  useFrame((state) => {
    if (!ref.current) return
    const p = progress.current
    ref.current.material.opacity = p < 0.35 ? 0.9 : Math.max(0, 0.9 - (p - 0.35) * 4)
    ref.current.material.size = 0.15 + Math.sin(state.clock.elapsedTime * 0.5) * 0.02
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={data.positions} itemSize={3} />
        <bufferAttribute attach="attributes-color" count={count} array={data.colors} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial map={spriteTexture} size={0.15} transparent opacity={0.9} vertexColors sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} />
    </points>
  )
}

function EarthGlobe({ progress }) {
  const earthRef = useRef(), cloudRef = useRef(), atmosRef = useRef()
  const dayTex = useLoader(THREE.TextureLoader, '/textures/earth/earth_day.jpg')
  const cloudTex = useLoader(THREE.TextureLoader, '/textures/earth/earth_clouds.jpg')
  const nightTex = useLoader(THREE.TextureLoader, '/textures/earth/earth_night.jpg')
  const atmosUniforms = useMemo(() => ({ uIntensity: { value: 0.6 } }), [])

  const KZ_ROT = (76.84 - 90) * Math.PI / 180

  useFrame((state) => {
    const p = progress.current, t = state.clock.elapsedTime
    const vis = p < 0.38
    if (earthRef.current) earthRef.current.visible = vis
    if (cloudRef.current) cloudRef.current.visible = vis
    if (atmosRef.current) atmosRef.current.visible = vis
    if (!vis) return

    const rot = KZ_ROT + t * 0.015
    if (earthRef.current) earthRef.current.rotation.y = rot
    if (cloudRef.current) cloudRef.current.rotation.y = rot + t * 0.004
    atmosUniforms.uIntensity.value = p > 0.15 ? Math.min(2.5, 0.6 + (p - 0.15) * 10) : 0.6
  })

  return (
    <group position={[0, 0, -80]}>
      <mesh ref={earthRef}>
        <sphereGeometry args={[10, 64, 64]} />
        <meshStandardMaterial map={dayTex} emissiveMap={nightTex} emissive="#ffffff" emissiveIntensity={0.35} roughness={0.8} metalness={0.1} />
      </mesh>
      <mesh ref={cloudRef}>
        <sphereGeometry args={[10.08, 64, 64]} />
        <meshStandardMaterial map={cloudTex} transparent opacity={0.3} depthWrite={false} />
      </mesh>
      <mesh ref={atmosRef}>
        <sphereGeometry args={[10.5, 64, 64]} />
        <shaderMaterial vertexShader={atmosVS} fragmentShader={atmosFS} uniforms={atmosUniforms} transparent side={THREE.BackSide} depthWrite={false} />
      </mesh>
    </group>
  )
}

function HeatParticles({ progress }) {
  const ref = useRef()
  const count = 400
  const data = useMemo(() => {
    const pos = new Float32Array(count * 3), cols = new Float32Array(count * 3), seeds = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 20; pos[i * 3 + 1] = (Math.random() - 0.5) * 20; pos[i * 3 + 2] = -5 - Math.random() * 15
      const h = Math.random(); cols[i * 3] = 1.0; cols[i * 3 + 1] = 0.3 + h * 0.5; cols[i * 3 + 2] = h * 0.2
      seeds[i] = Math.random()
    }
    return { positions: pos, colors: cols, seeds }
  }, [])

  useFrame(() => {
    if (!ref.current) return
    const p = progress.current
    const active = p > 0.28 && p < 0.42
    ref.current.visible = active
    if (!active) return
    const intensity = p < 0.35 ? (p - 0.28) / 0.07 : (0.42 - p) / 0.07
    ref.current.material.opacity = intensity * 0.7
    ref.current.material.size = 0.08 + intensity * 0.2
    const arr = ref.current.geometry.attributes.position.array
    for (let i = 0; i < count; i++) {
      arr[i * 3 + 2] += (2 + data.seeds[i] * 4) * intensity
      if (arr[i * 3 + 2] > 10) { arr[i * 3] = (Math.random() - 0.5) * 20; arr[i * 3 + 1] = (Math.random() - 0.5) * 20; arr[i * 3 + 2] = -15 - Math.random() * 10 }
    }
    ref.current.geometry.attributes.position.needsUpdate = true
  })

  return (
    <points ref={ref} visible={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={data.positions} itemSize={3} />
        <bufferAttribute attach="attributes-color" count={count} array={data.colors} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial map={spriteTexture} size={0.1} transparent opacity={0} vertexColors sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} />
    </points>
  )
}

function HeatVignette({ progress }) {
  const ref = useRef()
  const { camera } = useThree()
  const uniforms = useMemo(() => ({ uIntensity: { value: 0 }, uTime: { value: 0 } }), [])

  useFrame((state) => {
    if (!ref.current) return
    const p = progress.current
    uniforms.uTime.value = state.clock.elapsedTime
    const active = p > 0.28 && p < 0.42
    uniforms.uIntensity.value = active ? (p < 0.35 ? (p - 0.28) / 0.07 : (0.42 - p) / 0.07) * 0.8 : 0
    ref.current.position.copy(camera.position); ref.current.position.z -= 3; ref.current.quaternion.copy(camera.quaternion)
  })

  return (
    <mesh ref={ref} renderOrder={990}>
      <planeGeometry args={[30, 20]} />
      <shaderMaterial vertexShader={heatVS} fragmentShader={heatFS} uniforms={uniforms} transparent depthTest={false} depthWrite={false} />
    </mesh>
  )
}

function WhiteFlash({ progress }) {
  const ref = useRef()
  const { camera } = useThree()

  useFrame(() => {
    if (!ref.current) return
    const p = progress.current
    let flash = 0
    if (p > 0.36 && p < 0.44) { const t = (p - 0.36) / 0.08; flash = t < 0.5 ? t * 2 : 2 - t * 2 }
    ref.current.material.opacity = flash * 0.9
    ref.current.position.copy(camera.position); ref.current.position.z -= 2; ref.current.quaternion.copy(camera.quaternion)
  })

  return (
    <mesh ref={ref} renderOrder={995}>
      <planeGeometry args={[60, 40]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={0} depthTest={false} depthWrite={false} />
    </mesh>
  )
}

function CloudLayers({ progress }) {
  const meshes = useRef([])
  const clouds = useMemo(() => Array.from({ length: 8 }, (_, i) => ({
    y: -30 - i * 8, scale: 40 + Math.random() * 20, opBase: 0.2 + Math.random() * 0.25, rotZ: Math.random() * Math.PI,
  })), [])

  useFrame(() => {
    const p = progress.current
    const active = p > 0.40 && p < 0.55
    meshes.current.forEach((m, i) => {
      if (!m) return
      m.visible = active
      if (active) { const fade = p < 0.47 ? (p - 0.40) / 0.07 : Math.max(0, (0.55 - p) / 0.08); m.material.opacity = clouds[i].opBase * fade }
    })
  })

  return <>{clouds.map((c, i) => (
    <mesh key={i} ref={el => (meshes.current[i] = el)} position={[0, c.y, -80]} rotation={[-Math.PI / 2, 0, c.rotZ]} visible={false}>
      <planeGeometry args={[c.scale, c.scale]} /><meshBasicMaterial color="#eeeeff" transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  ))}</>
}

function CloudParticles({ progress }) {
  const ref = useRef()
  const count = 300
  const data = useMemo(() => {
    const pos = new Float32Array(count * 3), seeds = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 30; pos[i * 3 + 1] = -20 - Math.random() * 60; pos[i * 3 + 2] = -80 + (Math.random() - 0.5) * 20
      seeds[i] = Math.random()
    }
    return { positions: pos, seeds }
  }, [])

  useFrame(() => {
    if (!ref.current) return
    const p = progress.current
    const active = p > 0.40 && p < 0.55
    ref.current.visible = active
    if (!active) return
    const intensity = p < 0.47 ? (p - 0.40) / 0.07 : (0.55 - p) / 0.08
    ref.current.material.opacity = intensity * 0.5
    ref.current.material.size = 0.3 + intensity * 0.5
    const arr = ref.current.geometry.attributes.position.array
    for (let i = 0; i < count; i++) {
      arr[i * 3 + 1] += (3 + data.seeds[i] * 5) * intensity
      if (arr[i * 3 + 1] > 10) { arr[i * 3] = (Math.random() - 0.5) * 30; arr[i * 3 + 1] = -60 - Math.random() * 20 }
    }
    ref.current.geometry.attributes.position.needsUpdate = true
  })

  return (
    <points ref={ref} visible={false}>
      <bufferGeometry><bufferAttribute attach="attributes-position" count={count} array={data.positions} itemSize={3} /></bufferGeometry>
      <pointsMaterial map={spriteTexture} size={0.4} transparent opacity={0} color="#ddeeff" sizeAttenuation blending={THREE.NormalBlending} depthWrite={false} />
    </points>
  )
}

/* ─── Satellite Zoom Layers ─── */

const ZOOM_CONFIG = [
  { file: '/textures/earth/zoom-5.jpg', y: -90, size: 120, showAt: 0.48, hideAt: 0.62 },
  { file: '/textures/earth/zoom-8.jpg', y: -120, size: 80, showAt: 0.55, hideAt: 0.70 },
  { file: '/textures/earth/zoom-11.jpg', y: -150, size: 55, showAt: 0.62, hideAt: 0.78 },
  { file: '/textures/earth/zoom-14.jpg', y: -180, size: 35, showAt: 0.70, hideAt: 0.88 },
  { file: '/textures/earth/zoom-16.jpg', y: -210, size: 22, showAt: 0.80, hideAt: 0.94 },
  { file: '/textures/earth/zoom-18.jpg', y: -235, size: 14, showAt: 0.88, hideAt: 1.01 },
]

function SatelliteLayer({ config, progress }) {
  const ref = useRef()
  const texture = useLoader(THREE.TextureLoader, config.file)

  useFrame(() => {
    if (!ref.current) return
    const p = progress.current
    const { showAt, hideAt } = config
    let opacity = 0
    if (p >= showAt && p < hideAt) {
      const fadeIn = 0.04, fadeOut = 0.04
      if (p < showAt + fadeIn) opacity = (p - showAt) / fadeIn
      else if (p > hideAt - fadeOut) opacity = (hideAt - p) / fadeOut
      else opacity = 1
    }
    ref.current.material.opacity = Math.max(0, Math.min(1, opacity))
  })

  return (
    <mesh ref={ref} position={[0, config.y, -80]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[config.size, config.size]} />
      <meshBasicMaterial map={texture} transparent opacity={0} side={THREE.DoubleSide} />
    </mesh>
  )
}

function SatelliteLayers({ progress }) {
  return <>{ZOOM_CONFIG.map((cfg, i) => (
    <Suspense key={i} fallback={null}><SatelliteLayer config={cfg} progress={progress} /></Suspense>
  ))}</>
}

function AtmoHaze({ progress }) {
  const meshes = useRef([])
  const layers = useMemo(() => [
    { y: -100, size: 100, color: '#8899bb' }, { y: -135, size: 70, color: '#99aabb' },
    { y: -165, size: 50, color: '#aabbcc' }, { y: -195, size: 30, color: '#bbccdd' },
  ], [])

  useFrame(() => {
    const p = progress.current
    meshes.current.forEach((m, i) => {
      if (!m) return
      const show = p > 0.50 && p < 0.92
      m.visible = show
      if (show) { const d = Math.abs(p - (0.55 + i * 0.1)); m.material.opacity = Math.max(0, 0.15 - d * 0.8) }
    })
  })

  return <>{layers.map((l, i) => (
    <mesh key={i} ref={el => (meshes.current[i] = el)} position={[0, l.y, -80]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
      <planeGeometry args={[l.size, l.size]} /><meshBasicMaterial color={l.color} transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  ))}</>
}

function LandingGlow({ progress }) {
  const ref = useRef()
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uIntensity: { value: 0 } }), [])

  useFrame((state) => {
    if (!ref.current) return
    uniforms.uTime.value = state.clock.elapsedTime
    uniforms.uIntensity.value = progress.current > 0.88 ? (progress.current - 0.88) / 0.12 * 1.5 : 0
  })

  return (
    <mesh ref={ref} position={[0, -237, -80]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[3, 64]} />
      <shaderMaterial vertexShader={glowVS} fragmentShader={glowFS} uniforms={uniforms} transparent blending={THREE.AdditiveBlending} depthWrite={false} />
    </mesh>
  )
}

function FinalWash({ progress }) {
  const ref = useRef()
  const { camera } = useThree()
  useFrame(() => {
    if (!ref.current) return
    const wash = progress.current > 0.94 ? (progress.current - 0.94) / 0.06 : 0
    ref.current.material.opacity = wash * wash * 0.6
    ref.current.position.copy(camera.position); ref.current.position.z -= 2; ref.current.quaternion.copy(camera.quaternion)
  })
  return <mesh ref={ref} renderOrder={999}><planeGeometry args={[100, 100]} /><meshBasicMaterial color="#fff8ee" transparent opacity={0} depthTest={false} depthWrite={false} /></mesh>
}

function DescentDust({ progress }) {
  const ref = useRef()
  const count = 200
  const data = useMemo(() => {
    const pos = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 40; pos[i * 3 + 1] = -50 - Math.random() * 200; pos[i * 3 + 2] = -80 + (Math.random() - 0.5) * 30
    }
    return pos
  }, [])

  useFrame((state) => {
    if (!ref.current) return
    const p = progress.current
    const show = p > 0.50 && p < 0.95
    ref.current.visible = show
    if (show) {
      ref.current.material.opacity = 0.2
      const t = state.clock.elapsedTime, arr = ref.current.geometry.attributes.position.array
      for (let i = 0; i < count; i++) { arr[i * 3] += Math.sin(t * 0.3 + i) * 0.01; arr[i * 3 + 1] += Math.cos(t * 0.2 + i * 0.5) * 0.01 }
      ref.current.geometry.attributes.position.needsUpdate = true
    }
  })

  return (
    <points ref={ref} visible={false}>
      <bufferGeometry><bufferAttribute attach="attributes-position" count={count} array={data} itemSize={3} /></bufferGeometry>
      <pointsMaterial map={spriteTexture} size={0.08} transparent opacity={0} color="#ccddee" sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} />
    </points>
  )
}

/* ─── Progress sync bridge (Canvas → React state) ─── */

function ProgressSync({ progress, onProgress }) {
  useFrame(() => { onProgress(progress.current) })
  return null
}

/* ─── Flight Controller ─── */

function DiveFlightController({ progress, onComplete }) {
  const { camera } = useThree()
  const startTime = useRef(null)
  const completed = useRef(false)

  useFrame((state) => {
    if (startTime.current === null) startTime.current = state.clock.elapsedTime
    const elapsed = state.clock.elapsedTime - startTime.current
    const t = state.clock.elapsedTime
    let p = Math.min(1, elapsed / FLIGHT_DURATION)
    const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2
    progress.current = ease

    if (ease < 0.30) {
      const sub = ease / 0.30
      const z = 80 - sub * 140
      camera.position.set(Math.sin(t * 0.3) * (1 - sub) * 1.5, Math.cos(t * 0.25) * (1 - sub) * 0.8, z)
      camera.lookAt(0, 0, -80)
    } else if (ease < 0.42) {
      const sub = (ease - 0.30) / 0.12
      const z = -60 - sub * 10
      const shake = Math.max(0, 1 - Math.abs(sub - 0.5) * 2)
      camera.position.set((Math.random() - 0.5) * shake * 1.5, (Math.random() - 0.5) * shake * 1.5, z)
      camera.lookAt(0, -20 * sub, -80)
    } else if (ease < 0.55) {
      const sub = (ease - 0.42) / 0.13
      const y = -5 - sub * 40
      camera.position.set(Math.sin(t * 0.15) * 1, y, -70 + Math.sin(t * 0.2) * 2)
      camera.lookAt(0, y - 30, -80)
    } else {
      const sub = (ease - 0.55) / 0.45
      const decel = 1 - sub * sub * 0.5
      const y = -45 - sub * 195 * decel
      camera.position.set(Math.sin(t * 0.12) * (1 - sub) * 0.5, y, -70 + (1 - sub) * 5)
      camera.lookAt(0, y - 15, -80)
    }

    if (p >= 1 && !completed.current) { completed.current = true; onComplete() }
  })

  return null
}

/* ─── Scene ─── */

function DiveScene({ progress, onComplete, onProgress }) {
  return (
    <>
      <ambientLight intensity={0.3} />
      <directionalLight position={[50, 30, 40]} intensity={1.5} color="#fffde8" />

      <DiveFlightController progress={progress} onComplete={onComplete} />
      <ProgressSync progress={progress} onProgress={onProgress} />
      <DeepStars progress={progress} />
      <Suspense fallback={null}><EarthGlobe progress={progress} /></Suspense>
      <HeatParticles progress={progress} />
      <HeatVignette progress={progress} />
      <WhiteFlash progress={progress} />
      <CloudLayers progress={progress} />
      <CloudParticles progress={progress} />
      <SatelliteLayers progress={progress} />
      <AtmoHaze progress={progress} />
      <DescentDust progress={progress} />
      <LandingGlow progress={progress} />
      <FinalWash progress={progress} />
    </>
  )
}

/* ─── Labels (HTML overlay) ─── */

const LABELS = [
  { text: 'Казахстан', showAt: 0.46, hideAt: 0.60 },
  { text: 'Алматы', showAt: 0.62, hideAt: 0.76 },
  { text: 'Боралдай', showAt: 0.76, hideAt: 0.86 },
  { text: 'Водник-3', showAt: 0.86, hideAt: 0.94 },
]

function DiveLabels({ progress }) {
  return (
    <div className="earth-dive-labels">
      <AnimatePresence>
        {LABELS.map(l => {
          if (progress < l.showAt || progress >= l.hideAt) return null
          return (
            <motion.div key={l.text} className="earth-dive-label"
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -15, scale: 0.95 }}
              transition={{ duration: 0.8 }}
            >{l.text}</motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}

/* ─── Main Export ─── */

export default function EarthDive({ onRestart }) {
  const [flightDone, setFlightDone] = useState(false)
  const [showFinal, setShowFinal] = useState(false)
  const [labelProgress, setLabelProgress] = useState(0)
  const progressRef = useRef(0)
  const frameCount = useRef(0)

  const handleProgress = useCallback((p) => {
    frameCount.current++
    if (frameCount.current % 6 === 0) setLabelProgress(p)
  }, [])

  const handleFlightComplete = useCallback(() => {
    setFlightDone(true)
    setTimeout(() => setShowFinal(true), 600)
  }, [])

  return (
    <div className="portal-journey-container">
      <Canvas
        camera={{ position: [0, 0, 80], fov: 60, near: 0.1, far: 500 }}
        dpr={[1, 1.5]}
        gl={{ antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false, depth: true }}
        style={{ opacity: flightDone ? 0.3 : 1, transition: 'opacity 1.2s ease' }}
      >
        <color attach="background" args={['#000005']} />
        <DiveScene progress={progressRef} onComplete={handleFlightComplete} onProgress={handleProgress} />
      </Canvas>

      <DiveLabels progress={labelProgress} />

      {showFinal && (
        <div className="earth-dive-final">
          <motion.div className="earth-dive-final-content"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.2 }}
          >
            <p className="earth-dive-address">Водник-3, дом 89</p>
            <p className="earth-dive-subtitle">Я прилетел к тебе через всю вселенную</p>
            <p className="earth-dive-heart">❤️</p>
            <button className="planet-button earth-dive-restart" onClick={onRestart}>Сначала</button>
          </motion.div>
        </div>
      )}
    </div>
  )
}
