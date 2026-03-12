import { useRef, useMemo, useState, useCallback } from 'react'
import { Canvas, useFrame, useThree, useLoader } from '@react-three/fiber'
import { motion, AnimatePresence } from 'framer-motion'
import * as THREE from 'three'

/* ─── Shared sprite texture ─── */
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

const FLIGHT_DURATION = 30

/* ─── Geography ─── */
/*
 * Three.js SphereGeometry vertex formula:
 *   x = -r * cos(phi) * sin(theta)
 *   y =  r * cos(theta)
 *   z =  r * sin(phi) * sin(theta)
 * where phi = u * 2PI, theta = v * PI
 * and u = (lon + 180) / 360, v = (90 - lat) / 180
 *
 * This means:
 *   u=0   → lon -180° → phi=0
 *   u=0.5 → lon 0° (Prime Meridian) → phi=PI → +X direction
 *   u=0.75 → lon 90°E → phi=1.5PI → -Z direction
 *
 * Almaty: lat 43.32°N, lon 76.84°E
 */
function latLonToVec3(latDeg, lonDeg, radius) {
  const u = (lonDeg + 180) / 360
  const v = (90 - latDeg) / 180
  const phi = u * Math.PI * 2
  const theta = v * Math.PI
  return new THREE.Vector3(
    -radius * Math.cos(phi) * Math.sin(theta),
    radius * Math.cos(theta),
    radius * Math.sin(phi) * Math.sin(theta)
  )
}

const ALMATY_SURFACE = latLonToVec3(43.32, 76.84, 10)
const ALMATY_DIR = ALMATY_SURFACE.clone().normalize()

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
  float rim = 1.0 - dot(vNormal, vViewDir);
  float f = pow(rim, 3.0) * uIntensity;
  vec3 c = mix(vec3(0.3, 0.5, 1.0), vec3(0.6, 0.85, 1.0), rim);
  gl_FragColor = vec4(c, f * 0.85);
}
`

/* ─── GLSL: Heat vignette ─── */
const heatVS = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`
const heatFS = `
uniform float uIntensity, uTime; varying vec2 vUv;
void main() {
  vec2 uv = vUv - 0.5; float d = length(uv);
  float edge = smoothstep(0.25, 0.55, d);
  float flicker = 0.8 + 0.2 * sin(uTime * 18.0 + d * 25.0);
  float heat = edge * uIntensity * flicker;
  vec3 c = mix(vec3(1.0, 0.4, 0.1), vec3(1.0, 0.85, 0.4), 1.0 - d);
  gl_FragColor = vec4(c, heat * 0.75);
}
`

/* ═══════════════════════════════════════ */
/* ─── 3D Scene Components ─── */
/* ═══════════════════════════════════════ */

function DeepStars({ progress }) {
  const ref = useRef()
  const count = 4000
  const data = useMemo(() => {
    const pos = new Float32Array(count * 3), cols = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2, phi = Math.acos(2 * Math.random() - 1)
      const r = 180 + Math.random() * 200
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      pos[i * 3 + 2] = r * Math.cos(phi)
      const warmth = Math.random()
      cols[i * 3] = 0.8 + warmth * 0.2
      cols[i * 3 + 1] = 0.8 + Math.random() * 0.15
      cols[i * 3 + 2] = 0.85 + (1 - warmth) * 0.15
    }
    return { positions: pos, colors: cols }
  }, [])

  useFrame((state) => {
    if (!ref.current) return
    const p = progress.current
    ref.current.material.opacity = p < 0.45 ? 0.9 : Math.max(0, 0.9 - (p - 0.45) * 5)
    ref.current.material.size = 0.18 + Math.sin(state.clock.elapsedTime * 0.5) * 0.02
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={data.positions} itemSize={3} />
        <bufferAttribute attach="attributes-color" count={count} array={data.colors} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial map={spriteTexture} size={0.18} transparent opacity={0.9} vertexColors sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} />
    </points>
  )
}

function EarthGlobe({ progress }) {
  const earthRef = useRef(), cloudRef = useRef(), atmosRef = useRef()
  const dayTex = useLoader(THREE.TextureLoader, '/textures/earth/earth_day.jpg')
  const cloudTex = useLoader(THREE.TextureLoader, '/textures/earth/earth_clouds.jpg')
  const nightTex = useLoader(THREE.TextureLoader, '/textures/earth/earth_night.jpg')
  const atmosUniforms = useMemo(() => ({ uIntensity: { value: 0.5 } }), [])

  useFrame((state) => {
    const p = progress.current, t = state.clock.elapsedTime
    // Globe visible until transition to satellite zoom
    const vis = p < 0.52
    if (earthRef.current) earthRef.current.visible = vis
    if (cloudRef.current) cloudRef.current.visible = vis
    if (atmosRef.current) atmosRef.current.visible = vis
    if (!vis) return

    // Very slow rotation
    const rot = t * 0.006
    if (earthRef.current) earthRef.current.rotation.y = rot
    if (cloudRef.current) cloudRef.current.rotation.y = rot + t * 0.002

    // Atmosphere glow intensifies as we get closer
    atmosUniforms.uIntensity.value = p > 0.30 ? Math.min(2.5, 0.5 + (p - 0.30) * 10) : 0.5

    // Smooth fade-out
    if (p > 0.45) {
      const fade = Math.max(0, 1 - (p - 0.45) / 0.07)
      if (earthRef.current) earthRef.current.material.opacity = fade
      if (cloudRef.current) cloudRef.current.material.opacity = fade * 0.35
    }
  })

  return (
    <group>
      <mesh ref={earthRef}>
        <sphereGeometry args={[10, 128, 128]} />
        <meshStandardMaterial map={dayTex} emissiveMap={nightTex} emissive="#ffffff" emissiveIntensity={0.3} roughness={0.85} metalness={0.05} transparent />
      </mesh>
      <mesh ref={cloudRef}>
        <sphereGeometry args={[10.06, 128, 128]} />
        <meshStandardMaterial map={cloudTex} transparent opacity={0.35} depthWrite={false} />
      </mesh>
      <mesh ref={atmosRef}>
        <sphereGeometry args={[10.6, 64, 64]} />
        <shaderMaterial vertexShader={atmosVS} fragmentShader={atmosFS} uniforms={atmosUniforms} transparent side={THREE.BackSide} depthWrite={false} />
      </mesh>
    </group>
  )
}

function HeatParticles({ progress }) {
  const ref = useRef()
  const { camera } = useThree()
  const count = 500
  const data = useMemo(() => {
    const pos = new Float32Array(count * 3), cols = new Float32Array(count * 3), seeds = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 12
      pos[i * 3 + 1] = (Math.random() - 0.5) * 12
      pos[i * 3 + 2] = -3 - Math.random() * 12
      const h = Math.random()
      cols[i * 3] = 1.0; cols[i * 3 + 1] = 0.3 + h * 0.5; cols[i * 3 + 2] = h * 0.15
      seeds[i] = Math.random()
    }
    return { positions: pos, colors: cols, seeds }
  }, [])

  useFrame(() => {
    if (!ref.current) return
    const p = progress.current
    const active = p > 0.35 && p < 0.50
    ref.current.visible = active
    if (!active) return
    const intensity = p < 0.42 ? (p - 0.35) / 0.07 : (0.50 - p) / 0.08
    ref.current.material.opacity = intensity * 0.8
    ref.current.material.size = 0.06 + intensity * 0.2
    const camPos = camera.position
    const arr = ref.current.geometry.attributes.position.array
    for (let i = 0; i < count; i++) {
      arr[i * 3 + 2] += (2 + data.seeds[i] * 4) * intensity
      if (arr[i * 3 + 2] > 8) {
        arr[i * 3] = camPos.x + (Math.random() - 0.5) * 12
        arr[i * 3 + 1] = camPos.y + (Math.random() - 0.5) * 12
        arr[i * 3 + 2] = camPos.z - 10 - Math.random() * 8
      }
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
    const active = p > 0.35 && p < 0.50
    uniforms.uIntensity.value = active ? (p < 0.42 ? (p - 0.35) / 0.07 : (0.50 - p) / 0.08) * 0.9 : 0
    ref.current.position.copy(camera.position)
    const forward = new THREE.Vector3(0, 0, -3).applyQuaternion(camera.quaternion)
    ref.current.position.add(forward)
    ref.current.quaternion.copy(camera.quaternion)
  })

  return (
    <mesh ref={ref} renderOrder={990}>
      <planeGeometry args={[30, 20]} />
      <shaderMaterial vertexShader={heatVS} fragmentShader={heatFS} uniforms={uniforms} transparent depthTest={false} depthWrite={false} />
    </mesh>
  )
}

/* White flash for 3D→2D transition */
function WhiteFlash({ progress }) {
  const ref = useRef()
  const { camera } = useThree()
  useFrame(() => {
    if (!ref.current) return
    const p = progress.current
    let flash = 0
    if (p > 0.47 && p < 0.55) {
      const t = (p - 0.47) / 0.08
      flash = t < 0.5 ? t * 2 : 2 - t * 2
    }
    ref.current.material.opacity = flash * 0.95
    ref.current.position.copy(camera.position)
    const fwd = new THREE.Vector3(0, 0, -2).applyQuaternion(camera.quaternion)
    ref.current.position.add(fwd)
    ref.current.quaternion.copy(camera.quaternion)
  })
  return (
    <mesh ref={ref} renderOrder={995}>
      <planeGeometry args={[60, 40]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={0} depthTest={false} depthWrite={false} />
    </mesh>
  )
}

/* Final golden wash */
function FinalWash({ progress }) {
  const ref = useRef()
  const { camera } = useThree()
  useFrame(() => {
    if (!ref.current) return
    const p = progress.current
    const wash = p > 0.93 ? (p - 0.93) / 0.07 : 0
    ref.current.material.opacity = wash * wash * 0.7
    ref.current.position.copy(camera.position)
    const fwd = new THREE.Vector3(0, 0, -2).applyQuaternion(camera.quaternion)
    ref.current.position.add(fwd)
    ref.current.quaternion.copy(camera.quaternion)
  })
  return (
    <mesh ref={ref} renderOrder={999}>
      <planeGeometry args={[100, 100]} />
      <meshBasicMaterial color="#fff5e6" transparent opacity={0} depthTest={false} depthWrite={false} />
    </mesh>
  )
}

function ProgressSync({ progress, onProgress }) {
  const prev = useRef(0)
  useFrame(() => {
    const p = progress.current
    // Only update React state when progress changes enough to matter
    if (Math.abs(p - prev.current) > 0.002) {
      prev.current = p
      onProgress(p)
    }
  })
  return null
}

/* ─── Flight Controller ─── */
function DiveFlightController({ progress, onComplete }) {
  const { camera } = useThree()
  const startTime = useRef(null)
  const completed = useRef(false)

  const keyframes = useMemo(() => {
    // Camera start: far out, offset from the Almaty direction
    const startDir = ALMATY_DIR.clone()
    startDir.x += 0.3
    startDir.y += 0.2
    startDir.normalize()
    const start = startDir.clone().multiplyScalar(90)

    // Orbit approach — further along the approach to Almaty
    const approach = ALMATY_DIR.clone().multiplyScalar(40)
    approach.y += 5

    // Close approach — near the globe surface above Kazakhstan
    const close = ALMATY_DIR.clone().multiplyScalar(14)
    close.y += 1

    // Very close — just above the atmosphere
    const skim = ALMATY_DIR.clone().multiplyScalar(11.5)

    return { start, approach, close, skim }
  }, [])

  useFrame((state) => {
    if (startTime.current === null) startTime.current = state.clock.elapsedTime
    const elapsed = state.clock.elapsedTime - startTime.current
    const t = state.clock.elapsedTime
    let p = Math.min(1, elapsed / FLIGHT_DURATION)
    // Ease: slow start, fast middle, slow end
    const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2
    progress.current = ease

    const { start, approach, close, skim } = keyframes

    if (ease < 0.20) {
      /* Phase 1: Deep space — camera approaches Earth */
      const sub = ease / 0.20
      const s = sub * sub * (3 - 2 * sub) // smoothstep
      const pos = start.clone().lerp(approach, s)
      pos.x += Math.sin(t * 0.12) * (1 - s) * 2
      pos.y += Math.cos(t * 0.1) * (1 - s) * 1.2
      camera.position.copy(pos)
      camera.lookAt(0, 0, 0)

    } else if (ease < 0.38) {
      /* Phase 2: Orbital approach — spiral toward Kazakhstan */
      const sub = (ease - 0.20) / 0.18
      const s = sub * sub * (3 - 2 * sub)
      const pos = approach.clone().lerp(close, s)
      // Subtle orbital arc
      const arcAngle = sub * Math.PI * 0.15
      const arcOffset = new THREE.Vector3(
        Math.sin(arcAngle) * (1 - s) * 3,
        0,
        Math.cos(arcAngle) * (1 - s) * 2
      )
      pos.add(arcOffset)
      pos.x += Math.sin(t * 0.2) * 0.2 * (1 - s)
      camera.position.copy(pos)
      // Gradually shift look-at from globe center to Almaty surface
      const lookTarget = new THREE.Vector3().lerpVectors(
        new THREE.Vector3(0, 0, 0),
        ALMATY_SURFACE,
        s * 0.7
      )
      camera.lookAt(lookTarget)

    } else if (ease < 0.50) {
      /* Phase 3: Atmosphere entry — heat, shake, very close */
      const sub = (ease - 0.38) / 0.12
      const s = sub * sub * (3 - 2 * sub)
      const pos = close.clone().lerp(skim, s)
      // Smooth camera shake — low frequency for cinematic feel
      const shakeScale = Math.sin(sub * Math.PI) * 0.12
      pos.x += Math.sin(t * 8) * shakeScale
      pos.y += Math.cos(t * 10) * shakeScale * 0.7
      pos.z += Math.sin(t * 7 + 1.5) * shakeScale * 0.3
      camera.position.copy(pos)
      camera.lookAt(ALMATY_SURFACE)

    } else {
      /* Phase 4-5: After white flash, the 3D scene dims and HTML satellite overlay takes over */
      // Camera stays fixed looking at Almaty
      camera.position.copy(skim)
      camera.lookAt(ALMATY_SURFACE)
    }

    if (p >= 1 && !completed.current) {
      completed.current = true
      onComplete()
    }
  })

  return null
}

/* 3D Scene — only used for the globe approach (phases 1–3) */
function DiveScene({ progress, onComplete, onProgress }) {
  return (
    <>
      <ambientLight intensity={0.25} />
      <directionalLight position={[40, 25, 50]} intensity={1.8} color="#fffde8" />
      <pointLight position={[-30, 10, 20]} intensity={0.4} color="#8899cc" />

      <DiveFlightController progress={progress} onComplete={onComplete} />
      <ProgressSync progress={progress} onProgress={onProgress} />

      <DeepStars progress={progress} />
      <EarthGlobe progress={progress} />
      <HeatParticles progress={progress} />
      <HeatVignette progress={progress} />
      <WhiteFlash progress={progress} />
      <FinalWash progress={progress} />
    </>
  )
}

/* ═══════════════════════════════════════ */
/* ─── HTML Overlay Components ─── */
/* ═══════════════════════════════════════ */

/* Satellite zoom images config — shown as full-screen HTML overlays, not 3D planes */
const ZOOM_LAYERS = [
  { file: '/textures/earth/zoom-5.jpg', showAt: 0.50, hideAt: 0.64, label: null, scale: 1.6 },
  { file: '/textures/earth/zoom-8.jpg', showAt: 0.57, hideAt: 0.72, label: 'Казахстан', scale: 1.8 },
  { file: '/textures/earth/zoom-11.jpg', showAt: 0.65, hideAt: 0.79, label: 'Алматы', scale: 2.0 },
  { file: '/textures/earth/zoom-14.jpg', showAt: 0.72, hideAt: 0.86, label: null, scale: 2.2 },
  { file: '/textures/earth/zoom-16.jpg', showAt: 0.80, hideAt: 0.93, label: 'Боралдай', scale: 2.5 },
  { file: '/textures/earth/zoom-18.jpg', showAt: 0.88, hideAt: 1.01, label: 'Водник-3', scale: 3.0 },
]

function SatelliteOverlay({ progress }) {
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 6 }}>
      {ZOOM_LAYERS.map((layer, i) => {
        const { showAt, hideAt, scale } = layer
        if (progress < showAt || progress >= hideAt + 0.03) return null

        // Compute opacity: fade in and fade out
        const fadeIn = 0.04, fadeOut = 0.04
        let opacity = 0
        if (progress >= showAt && progress < hideAt) {
          if (progress < showAt + fadeIn) opacity = (progress - showAt) / fadeIn
          else if (progress > hideAt - fadeOut) opacity = (hideAt - progress) / fadeOut
          else opacity = 1
        }
        opacity = Math.max(0, Math.min(1, opacity))

        // Scale: the image zooms in slightly as progress advances
        const progressInLayer = (progress - showAt) / (hideAt - showAt)
        const currentScale = 1 + (scale - 1) * progressInLayer

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity,
              transition: 'none',
            }}
          >
            <img
              src={layer.file}
              alt=""
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: `scale(${currentScale})`,
                transformOrigin: 'center center',
                filter: `brightness(${0.7 + opacity * 0.3})`,
              }}
            />
          </div>
        )
      })}
    </div>
  )
}

/* Location labels — shown on top of satellite imagery */
const LABELS = [
  { text: 'Казахстан', showAt: 0.55, hideAt: 0.67 },
  { text: 'Алматы', showAt: 0.67, hideAt: 0.78 },
  { text: 'Боралдай', showAt: 0.78, hideAt: 0.88 },
  { text: 'Водник-3', showAt: 0.88, hideAt: 0.96 },
]

function DiveLabels({ progress }) {
  return (
    <div className="earth-dive-labels">
      <AnimatePresence mode="wait">
        {LABELS.map(l => {
          if (progress < l.showAt || progress >= l.hideAt) return null
          return (
            <motion.div key={l.text} className="earth-dive-label"
              style={{ position: 'absolute' }}
              initial={{ opacity: 0, y: 30, scale: 0.85 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              transition={{ duration: 1.0, ease: 'easeOut' }}
            >{l.text}</motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}

/* Atmospheric haze overlay — subtle color tinting during descent */
function AtmoHazeOverlay({ progress }) {
  if (progress < 0.48 || progress > 0.96) return null
  // Starts blue-ish, transitions to warm golden
  const warmth = Math.max(0, (progress - 0.48) / 0.48)
  const r = Math.round(100 + warmth * 155)
  const g = Math.round(140 + warmth * 80)
  const b = Math.round(200 - warmth * 100)
  const opacity = progress < 0.55
    ? (progress - 0.48) / 0.07 * 0.15
    : progress > 0.90
      ? Math.min(0.3, 0.15 + (progress - 0.90) / 0.06 * 0.15)
      : 0.15
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
      background: `radial-gradient(ellipse at center, rgba(${r},${g},${b},${opacity}) 0%, transparent 70%)`,
      pointerEvents: 'none', zIndex: 7,
    }} />
  )
}

/* ═══════════════════════════════════════ */
/* ─── Main Export ─── */
/* ═══════════════════════════════════════ */
export default function EarthDive({ onRestart, onNext }) {
  const [flightDone, setFlightDone] = useState(false)
  const [showFinal, setShowFinal] = useState(false)
  const [labelProgress, setLabelProgress] = useState(0)
  const progressRef = useRef(0)

  const handleProgress = useCallback((p) => {
    setLabelProgress(p)
  }, [])

  const handleFlightComplete = useCallback(() => {
    setFlightDone(true)
    setTimeout(() => setShowFinal(true), 800)
  }, [])

  // Canvas fades out after globe transition; satellite images show on top
  const canvasOpacity = labelProgress > 0.50
    ? Math.max(0, 1 - (labelProgress - 0.50) / 0.08)
    : 1

  return (
    <div className="portal-journey-container">
      {/* 3D Canvas — shows globe approach, fades to 0 after transition */}
      <Canvas
        camera={{ position: [15, 12, 80], fov: 55, near: 0.1, far: 500 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', stencil: false, depth: true }}
        style={{
          opacity: flightDone ? 0 : canvasOpacity,
          transition: flightDone ? 'opacity 1.5s ease' : 'none',
        }}
      >
        <color attach="background" args={['#000005']} />
        <DiveScene progress={progressRef} onComplete={handleFlightComplete} onProgress={handleProgress} />
      </Canvas>

      {/* Satellite imagery overlays — appear after globe fades */}
      <SatelliteOverlay progress={labelProgress} />

      {/* Atmospheric haze tint */}
      <AtmoHazeOverlay progress={labelProgress} />

      {/* Location labels */}
      <DiveLabels progress={labelProgress} />

      {/* Final landing overlay */}
      <AnimatePresence>
        {showFinal && (
          <motion.div
            className="earth-dive-final"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 2 }}
          >
            <div className="earth-dive-final-content">
              <motion.p className="earth-dive-address"
                initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1.2, delay: 0.5 }}
              >Водник-3, дом 89</motion.p>

              <motion.p className="earth-dive-subtitle"
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1, delay: 1.8 }}
              >Из бесконечного космоса, через звёзды и галактики...</motion.p>

              <motion.p className="earth-dive-subtitle"
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1, delay: 3.2 }}
              >мимо планет, через атмосферу и облака...</motion.p>

              <motion.p className="earth-dive-subtitle" style={{ marginTop: '0.8rem' }}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1.2, delay: 4.8 }}
              >я прилетел именно сюда — к тебе</motion.p>

              <motion.p className="earth-dive-heart"
                initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, delay: 6.2, type: 'spring', stiffness: 120 }}
              >❤️</motion.p>

              <motion.p className="earth-dive-subtitle" style={{ fontSize: '0.95rem', opacity: 0.6 }}
                initial={{ opacity: 0 }} animate={{ opacity: 0.6 }}
                transition={{ duration: 1.5, delay: 7.5 }}
              >Потому что ты — мой дом</motion.p>

              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 9 }}>
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                  {onNext && <button className="planet-button earth-dive-restart" onClick={onNext}>Дальше ✨</button>}
                  {/* <button className="planet-button earth-dive-restart" style={{ opacity: 0.6, fontSize: '0.85rem' }} onClick={onRestart}>Сначала</button> */}
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
