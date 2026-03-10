import { useRef, useMemo, useState, Suspense } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  Stars,
  Sphere,
  Float,
  Html,
  useTexture,
  RoundedBox,
  AdaptiveDpr,
} from '@react-three/drei'
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
  const tex = new THREE.CanvasTexture(canvas)
  return tex
})()

// --------------- Camera ---------------

function useSmoothCamera(step) {
  const { camera } = useThree()
  const lookAtTarget = useRef(new THREE.Vector3())

  const positionsByStep = {
    0: { pos: [0, 5, 22], look: [-3, 1, -5] },
    1: { pos: [-15, 5, 6], look: [-15, 2, -8] },
    2: { pos: [20, 4, -19], look: [20, -3, -35] },
    3: { pos: [-10, -2, -44], look: [-10, -10, -60] },
    4: { pos: [-25, -2, -78], look: [-25, -5, -90] },
    5: { pos: [18, -10, -106], look: [18, -12, -115] },
    6: { pos: [0, 7, -135], look: [0, 5, -145] },
  }

  useFrame(() => {
    const cfg = positionsByStep[step] ?? positionsByStep[0]
    const targetPos = new THREE.Vector3(...cfg.pos)
    const targetLook = new THREE.Vector3(...cfg.look)
    camera.position.lerp(targetPos, 0.03)
    lookAtTarget.current.lerp(targetLook, 0.04)
    camera.lookAt(lookAtTarget.current)
  })
}

// --------------- Planet components ---------------

function PlanetCore({ map, color, size }) {
  const meshRef = useRef()
  useFrame(() => {
    if (meshRef.current) meshRef.current.rotation.y += 0.002
  })

  return (
    <Sphere ref={meshRef} args={[size, 64, 64]}>
      <meshStandardMaterial
        map={map || null}
        color={map ? '#ffffff' : color}
        emissive={color}
        emissiveIntensity={map ? 0.08 : 0.18}
        metalness={0.1}
        roughness={0.75}
      />
    </Sphere>
  )
}

function AtmosphereGlow({ color, size }) {
  const mat = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        glowColor: { value: new THREE.Color(color) },
      },
      vertexShader: `
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;
        void main() {
          vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
          vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 glowColor;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;
        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPosition);
          float rim = 1.0 - max(0.0, dot(viewDir, vWorldNormal));
          float sharp = pow(rim, 5.5) * 0.6;
          float soft = pow(rim, 2.5) * 0.08;
          float intensity = sharp + soft;
          gl_FragColor = vec4(glowColor, intensity);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false,
    })
  }, [color])

  return <Sphere args={[size * 1.07, 32, 32]} material={mat} />
}

function PlanetAtmosphere({ color, size }) {
  return <AtmosphereGlow color={color} size={size} />
}

function PlanetRings({ color, size, multi = false }) {
  const ringRef = useRef()
  useFrame((state) => {
    if (ringRef.current) {
      ringRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.15) * 0.05
    }
  })

  const innerR1 = size * 1.4
  const outerR1 = size * 2.2
  const ringMat = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 1
    const ctx = canvas.getContext('2d')
    const grad = ctx.createLinearGradient(0, 0, 256, 0)
    grad.addColorStop(0.0, 'rgba(255,255,255,0.0)')
    grad.addColorStop(0.15, `${color}88`)
    grad.addColorStop(0.35, `${color}cc`)
    grad.addColorStop(0.5, `${color}55`)
    grad.addColorStop(0.65, `${color}aa`)
    grad.addColorStop(0.85, `${color}44`)
    grad.addColorStop(1.0, 'rgba(255,255,255,0.0)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 256, 1)
    const tex = new THREE.CanvasTexture(canvas)
    tex.wrapS = THREE.ClampToEdgeWrapping
    return tex
  }, [color])

  return (
    <group ref={ringRef} rotation={[Math.PI / 2.5, 0, 0]}>
      <mesh>
        <ringGeometry args={[innerR1, outerR1, 80]} />
        <meshBasicMaterial
          map={ringMat}
          transparent
          opacity={0.55}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      {multi && (
        <mesh>
          <ringGeometry args={[outerR1 + 0.2, outerR1 + size * 0.5, 80]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.15}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  )
}

function Planet({ position, color, size, withRings = false, multiRings = false, texturePath }) {
  const texture = texturePath ? useTexture(texturePath) : null

  return (
    <Float speed={0.5} rotationIntensity={0.05} floatIntensity={0.05}>
      <group position={position}>
        <PlanetCore map={texture} color={color} size={size} />
        <PlanetAtmosphere color={color} size={size} />
        {withRings && <PlanetRings color={color} size={size} multi={multiRings} />}
      </group>
    </Float>
  )
}

// --------------- Photo components ---------------

function PhotoFrame({ photo, position, index, total, onClick }) {
  const texture = useTexture(photo.thumb)
  const [hovered, setHovered] = useState(false)
  const meshRef = useRef()
  const fadeRef = useRef(0)

  useFrame((state, delta) => {
    if (meshRef.current) {
      fadeRef.current = Math.min(1, fadeRef.current + delta * 1.2)
      const f = fadeRef.current
      meshRef.current.scale.setScalar(f)
      meshRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.25 + index) * 0.04
    }
  })

  const s = 1.3

  return (
    <group
      ref={meshRef}
      position={position}
      scale={0}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer' }}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = 'default' }}
    >
      <RoundedBox args={[s * 1.55, s * 1.25, 0.04]} radius={0.04}>
        <meshBasicMaterial
          color="#ff6b9d"
          transparent
          opacity={hovered ? 0.5 : 0.2}
          blending={THREE.AdditiveBlending}
        />
      </RoundedBox>

      <RoundedBox args={[s * 1.45, s * 1.3, 0.02]} radius={0.03} position={[0, 0, 0.03]}>
        <meshStandardMaterial
          color="#ffffff"
          roughness={0.8}
          metalness={0.08}
          emissive={hovered ? '#ff6b9d' : '#111111'}
          emissiveIntensity={hovered ? 0.3 : 0.1}
        />
      </RoundedBox>

      <mesh position={[0, s * 0.05, 0.05]}>
        <planeGeometry args={[s * 1.25, s * 0.9]} />
        <meshStandardMaterial map={texture} roughness={0.6} metalness={0.1} />
      </mesh>

      {hovered && (
        <Html position={[0, -s * 0.55, 0.06]} distanceFactor={9} occlude style={{ pointerEvents: 'none' }}>
          <div style={{
            maxWidth: 220, textAlign: 'center', fontSize: '0.7rem', color: '#fff',
            fontFamily: 'system-ui, sans-serif', textShadow: '0 0 6px rgba(255,107,157,0.5)',
            background: 'rgba(0,0,0,0.7)', padding: '6px 10px', borderRadius: '8px',
          }}>
            {photo.caption}
          </div>
        </Html>
      )}

      <Html position={[0, s * 0.7, 0.06]} distanceFactor={9} occlude style={{ pointerEvents: 'none' }}>
        <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.75)', letterSpacing: '0.08em' }}>
          {index + 1}/{total}
        </div>
      </Html>
    </group>
  )
}

function PhotoPlaceholder({ position }) {
  const meshRef = useRef()
  const s = 1.3
  useFrame((state) => {
    if (meshRef.current) {
      const pulse = Math.sin(state.clock.elapsedTime * 3) * 0.15 + 0.85
      meshRef.current.scale.setScalar(pulse)
    }
  })
  return (
    <group ref={meshRef} position={position}>
      <RoundedBox args={[s * 1.55, s * 1.25, 0.04]} radius={0.04}>
        <meshBasicMaterial
          color="#ff6b9d"
          transparent
          opacity={0.25}
          blending={THREE.AdditiveBlending}
        />
      </RoundedBox>
      <mesh position={[0, 0, 0.02]}>
        <planeGeometry args={[s * 1.25, s * 0.9]} />
        <meshBasicMaterial color="#1a1a2e" transparent opacity={0.8} />
      </mesh>
    </group>
  )
}

function OrbitingPhoto({ baseAngle, radius, photo, index, total, onPhotoClick }) {
  const groupRef = useRef()

  useFrame((state) => {
    if (!groupRef.current) return
    const angle = baseAngle + state.clock.elapsedTime * 0.06
    groupRef.current.position.x = Math.cos(angle) * radius
    groupRef.current.position.z = Math.sin(angle) * radius
    groupRef.current.rotation.y = angle + Math.PI
  })

  return (
    <group ref={groupRef}>
      <Suspense fallback={<PhotoPlaceholder position={[0, 0, 0]} />}>
        <PhotoFrame
          photo={photo}
          index={index}
          total={total}
          position={[0, 0, 0]}
          onClick={onPhotoClick}
        />
      </Suspense>
    </group>
  )
}

function PhotoRing({ photos, planetPosition, onPhotoClick, offset }) {
  const total = Math.min(photos.length, 8)
  const visiblePhotos = photos.slice(0, total)
  const radius = 6.5

  return (
    <group position={planetPosition} rotation={[0.1, 0, 0]}>
      {visiblePhotos.map((p, i) => (
        <OrbitingPhoto
          key={i}
          baseAngle={(i / total) * Math.PI * 2}
          radius={radius}
          photo={p}
          index={i}
          total={total}
          onPhotoClick={() => onPhotoClick(offset + i)}
        />
      ))}
    </group>
  )
}

// --------------- Cosmic effects ---------------

function ShootingStar() {
  const ref = useRef()
  const [start] = useState(() => ({
    x: Math.random() * 80 - 40,
    y: Math.random() * 30 - 15,
    z: Math.random() * -170 + 30,
  }))
  const velocity = useMemo(() => ({
    x: -0.3 - Math.random() * 0.2,
    y: -0.15 - Math.random() * 0.1,
    z: 0.04 + Math.random() * 0.06,
  }), [])

  useFrame(() => {
    if (!ref.current) return
    ref.current.position.x += velocity.x
    ref.current.position.y += velocity.y
    ref.current.position.z += velocity.z
    if (ref.current.position.x < -40 || ref.current.position.y < -25) {
      ref.current.position.set(start.x, start.y, start.z)
    }
  })

  return (
    <group ref={ref} position={[start.x, start.y, start.z]}>
      <mesh>
        <sphereGeometry args={[0.06, 6, 6]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0.5, 0.25, -0.15]} rotation={[0, 0, Math.PI / 4]}>
        <planeGeometry args={[1.0, 0.04]} />
        <meshBasicMaterial color="#aaccff" transparent opacity={0.35} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  )
}

function Comet({ delay = 0 }) {
  const ref = useRef()
  const speed = useMemo(() => 0.12 + Math.random() * 0.08, [])
  const startPos = useMemo(() => ({
    x: 50 + Math.random() * 30,
    y: 15 + Math.random() * 20,
    z: Math.random() * -150 + 20,
  }), [])

  useFrame((state) => {
    if (!ref.current) return
    const t = (state.clock.elapsedTime + delay) * speed
    ref.current.position.x = startPos.x - t * 10
    ref.current.position.y = startPos.y - t * 3
    ref.current.position.z = startPos.z + t * 1.5

    if (ref.current.position.x < -60) {
      ref.current.position.set(startPos.x, startPos.y, startPos.z)
    }
  })

  return (
    <group ref={ref} position={[startPos.x, startPos.y, startPos.z]}>
      <mesh>
        <sphereGeometry args={[0.12, 8, 8]} />
        <meshBasicMaterial color="#aaddff" />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.25, 8, 8]} />
        <meshBasicMaterial color="#88ccff" transparent opacity={0.15} blending={THREE.AdditiveBlending} />
      </mesh>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <mesh key={i} position={[i * 0.45, i * 0.12, 0]}>
          <sphereGeometry args={[0.08 - i * 0.008, 6, 6]} />
          <meshBasicMaterial
            color="#aaddff"
            transparent
            opacity={0.35 - i * 0.05}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
    </group>
  )
}

function FloatingDust({ count = 250 }) {
  const ref = useRef()
  const points = useMemo(() => {
    const temp = []
    for (let i = 0; i < count; i++) {
      temp.push(
        (Math.random() - 0.5) * 200,
        (Math.random() - 0.5) * 100,
        Math.random() * -300 + 40,
      )
    }
    return new Float32Array(temp)
  }, [count])

  useFrame(() => {
    if (ref.current) {
      ref.current.rotation.y += 0.00015
      ref.current.rotation.x += 0.00005
    }
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={points} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        map={spriteTexture}
        size={0.1}
        color="#bbaaee"
        transparent
        opacity={0.6}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  )
}

function NebulaCloud({ position, color, scale = 1, secondaryColor }) {
  const ref = useRef()
  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.z = state.clock.elapsedTime * 0.005
      ref.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.003) * 0.02
    }
  })

  const count = 350
  const particles = useMemo(() => {
    const temp = []
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = (Math.random() - 0.5) * Math.PI * 0.5
      const r = (Math.pow(Math.random(), 0.6)) * 20 * scale
      temp.push(
        Math.cos(theta) * Math.cos(phi) * r + (Math.random() - 0.5) * 4 * scale,
        Math.sin(phi) * r * 0.35 + (Math.random() - 0.5) * 2 * scale,
        Math.sin(theta) * Math.cos(phi) * r + (Math.random() - 0.5) * 4 * scale,
      )
    }
    return new Float32Array(temp)
  }, [scale])

  const col2 = secondaryColor || color
  const count2 = 150
  const particles2 = useMemo(() => {
    const temp = []
    for (let i = 0; i < count2; i++) {
      const theta = Math.random() * Math.PI * 2
      const r = Math.random() * 12 * scale
      temp.push(
        Math.cos(theta) * r + (Math.random() - 0.5) * 6 * scale,
        (Math.random() - 0.5) * 5 * scale,
        Math.sin(theta) * r + (Math.random() - 0.5) * 6 * scale,
      )
    }
    return new Float32Array(temp)
  }, [scale])

  return (
    <group ref={ref} position={position}>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={count} array={particles} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial
          map={spriteTexture}
          size={4.0}
          color={color}
          transparent
          opacity={0.12}
          sizeAttenuation
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={count2} array={particles2} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial
          map={spriteTexture}
          size={6.0}
          color={col2}
          transparent
          opacity={0.07}
          sizeAttenuation
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>
    </group>
  )
}

function AsteroidField() {
  const meshRef = useRef()
  const count = 50
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const data = useMemo(() => {
    return Array.from({ length: count }, () => ({
      pos: [
        (Math.random() - 0.5) * 140,
        (Math.random() - 0.5) * 80,
        -30 + (Math.random() - 0.5) * 120,
      ],
      rot: Math.random() * Math.PI * 2,
      speed: 0.001 + Math.random() * 0.002,
      scale: 0.04 + Math.random() * 0.1,
    }))
  }, [])

  useFrame((state) => {
    if (!meshRef.current) return
    data.forEach((d, i) => {
      dummy.position.set(...d.pos)
      dummy.rotation.set(
        d.rot + state.clock.elapsedTime * d.speed,
        d.rot * 2 + state.clock.elapsedTime * d.speed * 0.7,
        0,
      )
      dummy.scale.setScalar(d.scale)
      dummy.updateMatrix()
      meshRef.current.setMatrixAt(i, dummy.matrix)
    })
    meshRef.current.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[null, null, count]}>
      <dodecahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color="#554433" roughness={0.95} metalness={0.1} />
    </instancedMesh>
  )
}

function SparkleField({ count = 80 }) {
  const ref = useRef()
  const data = useMemo(() => {
    const positions = []
    const phases = []
    for (let i = 0; i < count; i++) {
      positions.push(
        (Math.random() - 0.5) * 200,
        (Math.random() - 0.5) * 80,
        Math.random() * -300 + 40,
      )
      phases.push(Math.random() * Math.PI * 2)
    }
    return { positions: new Float32Array(positions), phases }
  }, [count])

  const sizesRef = useRef(new Float32Array(count).fill(0.05))

  useFrame((state) => {
    const t = state.clock.elapsedTime
    for (let i = 0; i < count; i++) {
      const sparkle = Math.pow(Math.max(0, Math.sin(t * 2.5 + data.phases[i])), 12)
      sizesRef.current[i] = sparkle * 0.2
    }
    if (ref.current) {
      ref.current.geometry.attributes.size.needsUpdate = true
    }
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={data.positions} itemSize={3} />
        <bufferAttribute attach="attributes-size" count={count} array={sizesRef.current} itemSize={1} />
      </bufferGeometry>
      <pointsMaterial
        map={spriteTexture}
        size={0.25}
        color="#ffffff"
        transparent
        opacity={1.0}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  )
}

function CosmicDustTrail({ color = '#c471ed', radius = 25, y = 0, speed = 0.1 }) {
  const ref = useRef()
  const count = 120
  const particles = useMemo(() => {
    const temp = []
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2
      const r = radius + (Math.random() - 0.5) * 6
      temp.push(
        Math.cos(angle) * r,
        y + (Math.random() - 0.5) * 2,
        Math.sin(angle) * r - 30,
      )
    }
    return new Float32Array(temp)
  }, [radius, y, count])

  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y = state.clock.elapsedTime * speed
    }
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={particles} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        map={spriteTexture}
        size={0.14}
        color={color}
        transparent
        opacity={0.4}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  )
}

function SpiralGalaxy({ position, rotation, scale = 1 }) {
  const groupRef = useRef()

  const numArms = 4
  const armCount = 4000
  const dustCount = 2000
  const coreCount = 800

  const armData = useMemo(() => {
    const pos = []
    const cols = []
    for (let i = 0; i < armCount; i++) {
      const arm = Math.floor(Math.random() * numArms)
      const armOffset = (arm / numArms) * Math.PI * 2
      const dist = Math.pow(Math.random(), 0.5) * 14 * scale
      const spiral = dist * 0.7
      const spread = (0.12 + dist * 0.02) * (Math.random() - 0.5) * 2
      const angle = armOffset + spiral + spread
      const x = Math.cos(angle) * dist
      const z = Math.sin(angle) * dist
      const y = (Math.random() - 0.5) * 0.15 * scale * (1.0 - dist / (14 * scale) * 0.8)
      pos.push(x, y, z)
      const t = dist / (14 * scale)
      const r = 0.55 + (1 - t) * 0.45
      const g = 0.5 + (1 - t) * 0.5
      const b = 0.9 + (1 - t) * 0.1
      cols.push(r, g, b)
    }
    return { positions: new Float32Array(pos), colors: new Float32Array(cols) }
  }, [scale])

  const dustData = useMemo(() => {
    const pos = []
    const cols = []
    for (let i = 0; i < dustCount; i++) {
      const arm = Math.floor(Math.random() * numArms)
      const armOffset = (arm / numArms) * Math.PI * 2
      const dist = Math.pow(Math.random(), 0.7) * 11 * scale
      const spiral = dist * 0.65
      const spread = (0.3 + dist * 0.04) * (Math.random() - 0.5) * 2
      const angle = armOffset + spiral + spread
      const x = Math.cos(angle) * dist
      const z = Math.sin(angle) * dist
      const y = (Math.random() - 0.5) * 0.1 * scale
      pos.push(x, y, z)
      const t = dist / (11 * scale)
      cols.push(
        0.8 + (1 - t) * 0.2,
        0.35 + (1 - t) * 0.45,
        0.15 + t * 0.15,
      )
    }
    return { positions: new Float32Array(pos), colors: new Float32Array(cols) }
  }, [scale])

  const coreData = useMemo(() => {
    const pos = []
    const cols = []
    for (let i = 0; i < coreCount; i++) {
      const r = Math.pow(Math.random(), 3) * 3.5 * scale
      const a = Math.random() * Math.PI * 2
      pos.push(
        Math.cos(a) * r,
        (Math.random() - 0.5) * 0.1 * scale,
        Math.sin(a) * r,
      )
      const t = r / (3.5 * scale)
      cols.push(
        1.0,
        0.85 - t * 0.3,
        0.4 - t * 0.25,
      )
    }
    return { positions: new Float32Array(pos), colors: new Float32Array(cols) }
  }, [scale])

  useFrame((state) => {
    if (groupRef.current) groupRef.current.rotation.y = state.clock.elapsedTime * 0.004
  })

  return (
    <group ref={groupRef} position={position} rotation={rotation}>
      {/* Outer arms - blue/white */}
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={armCount} array={armData.positions} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={armCount} array={armData.colors} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial
          map={spriteTexture}
          size={0.3 * scale}
          vertexColors
          transparent
          opacity={0.35}
          sizeAttenuation
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>
      {/* Warm dust layer - orange/red */}
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={dustCount} array={dustData.positions} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={dustCount} array={dustData.colors} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial
          map={spriteTexture}
          size={0.5 * scale}
          vertexColors
          transparent
          opacity={0.2}
          sizeAttenuation
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>
      {/* Dense bright core */}
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={coreCount} array={coreData.positions} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={coreCount} array={coreData.colors} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial
          map={spriteTexture}
          size={0.55 * scale}
          vertexColors
          transparent
          opacity={0.55}
          sizeAttenuation
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>
      {/* Multi-layer core glow */}
      <mesh>
        <sphereGeometry args={[4.0 * scale, 24, 24]} />
        <meshBasicMaterial color="#ffcc88" transparent opacity={0.06} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[2.0 * scale, 24, 24]} />
        <meshBasicMaterial color="#ffaa55" transparent opacity={0.12} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.8 * scale, 24, 24]} />
        <meshBasicMaterial color="#ffdd88" transparent opacity={0.3} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.3 * scale, 16, 16]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.5} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  )
}

function BackgroundSphere() {
  const mat = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        varying vec3 vDir;

        // quality hash - avoids grid artifacts
        vec2 hash2(vec2 p) {
          p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
          return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
        }
        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float hash3(vec3 p) {
          return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
        }

        // gradient noise - smooth, no grid artifacts
        float gnoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
          return mix(
            mix(dot(hash2(i), f),
                dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
            mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
                dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
            u.y) * 0.5 + 0.5;
        }

        float fbm(vec2 p) {
          float v = 0.0, a = 0.5;
          mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
          for (int i = 0; i < 7; i++) {
            v += a * gnoise(p);
            p = rot * p * 2.1 + vec2(100.0);
            a *= 0.48;
          }
          return v;
        }

        float stars(vec3 dir, float density) {
          vec3 p = dir * density;
          vec3 fl = floor(p);
          vec3 fr = fract(p);
          float d = 1.0;
          for (int x = -1; x <= 1; x++)
            for (int y = -1; y <= 1; y++)
              for (int z = -1; z <= 1; z++) {
                vec3 nb = vec3(float(x), float(y), float(z));
                vec3 sp = vec3(hash3(fl+nb), hash3(fl+nb+31.0), hash3(fl+nb+57.0));
                d = min(d, length(fr - nb - sp));
              }
          return d;
        }

        void main() {
          vec3 dir = normalize(vDir);
          float theta = atan(dir.z, dir.x);
          float phi = asin(clamp(dir.y, -1.0, 1.0));
          vec2 uv = vec2(theta / 6.2832 + 0.5, phi / 3.1416 + 0.5);

          // start with very dark sky
          vec3 col = vec3(0.005, 0.005, 0.012);

          // milky way - narrow bright band
          float band = exp(-pow(phi * 4.5, 2.0));
          float bandWide = exp(-pow(phi * 2.5, 2.0));

          // cloud structure within the band
          float n1 = fbm(uv * vec2(16.0, 8.0));
          float n2 = fbm(uv * vec2(30.0, 15.0) + 5.0);
          float n3 = fbm(uv * vec2(50.0, 25.0) + 11.0);

          // dark dust lanes - absorption within the milky way
          float dust = fbm(uv * vec2(20.0, 10.0) + 7.0);
          float dustMask = smoothstep(0.35, 0.55, dust) * band;
          float absorption = 1.0 - dustMask * 0.7;

          // milky way glow - blue-white core
          float milky = band * (n1 * 0.5 + n2 * 0.35 + n3 * 0.15);
          vec3 mwCore = vec3(0.45, 0.48, 0.65);
          vec3 mwEdge = vec3(0.15, 0.13, 0.22);
          vec3 mwColor = mix(mwEdge, mwCore, pow(band, 1.5));
          col += mwColor * milky * absorption * 0.8;

          // warm center bulge
          float bulge = exp(-pow(phi * 6.0, 2.0)) * exp(-pow((theta + 0.5) * 1.5, 2.0));
          col += vec3(0.25, 0.18, 0.08) * bulge * 0.25;

          // emission nebulae - pink/red regions within the band
          float emNeb = fbm(uv * 14.0 + vec2(3.0, 1.0));
          float emMask = smoothstep(0.55, 0.7, emNeb) * band;
          col += vec3(0.35, 0.08, 0.15) * emMask * 0.2;

          // blue reflection nebula
          float blueNeb = fbm(uv * 12.0 + vec2(-4.0, 6.0));
          float blueMask = smoothstep(0.5, 0.72, blueNeb) * bandWide;
          col += vec3(0.08, 0.15, 0.35) * blueMask * 0.15;

          // diffuse outer glow
          col += vec3(0.03, 0.03, 0.06) * bandWide * 0.5;

          // --- Stars ---
          // bright stars (sparse)
          float s1 = stars(dir, 60.0);
          float star1 = smoothstep(0.045, 0.0, s1);
          float starBright = hash3(floor(dir * 60.0));
          vec3 starCol1 = mix(vec3(0.85, 0.9, 1.0), vec3(1.0, 0.92, 0.75), starBright);
          col += starCol1 * star1 * 0.8;

          // medium stars
          float s2 = stars(dir + 100.0, 120.0);
          float star2 = smoothstep(0.04, 0.0, s2);
          col += vec3(0.9, 0.9, 1.0) * star2 * 0.5;

          // faint stars (dense)
          float s3 = stars(dir + 200.0, 250.0);
          float star3 = smoothstep(0.06, 0.015, s3);
          col += vec3(0.7, 0.7, 0.8) * star3 * 0.15 * (0.4 + bandWide * 0.6);

          // milky way dense field
          float s4 = stars(dir + 50.0, 450.0);
          float starDense = smoothstep(0.07, 0.025, s4) * band;
          col += vec3(0.7, 0.65, 0.75) * starDense * 0.12;

          gl_FragColor = vec4(col, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
    })
  }, [])

  const meshRef = useRef()
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.material.uniforms.uTime.value = state.clock.elapsedTime
    }
  })

  return <Sphere ref={meshRef} args={[400, 64, 64]} material={mat} />
}

// --------------- Heart effects ---------------

function Star({ position, rotation, delay }) {
  const meshRef = useRef()

  const starShape = useMemo(() => {
    const shape = new THREE.Shape()
    const outerR = 0.1
    const innerR = 0.04
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? outerR : innerR
      const a = (i * Math.PI) / 5
      const x = Math.cos(a) * r
      const y = Math.sin(a) * r
      i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)
    }
    shape.closePath()
    return shape
  }, [])

  useFrame((state) => {
    if (!meshRef.current) return
    const t = state.clock.elapsedTime + delay
    meshRef.current.scale.setScalar(Math.sin(t * 3) * 0.15 + 0.85)
    meshRef.current.rotation.z = t * 1.2
  })

  return (
    <mesh ref={meshRef} position={position} rotation={[0, 0, rotation]}>
      <shapeGeometry args={[starShape]} />
      <meshBasicMaterial color="#ff4477" transparent opacity={0.7} blending={THREE.AdditiveBlending} />
    </mesh>
  )
}

function FlyingStarHeart({ delay = 0 }) {
  const groupRef = useRef()
  const [start] = useState(() => ({
    x: (Math.random() - 0.5) * 60,
    y: -20 - Math.random() * 10,
    z: Math.random() * -160 + 25,
  }))

  const starPositions = useMemo(() => {
    const pts = []
    for (let i = 0; i < 12; i++) {
      const t = (i / 12) * Math.PI * 2
      const x = 16 * Math.pow(Math.sin(t), 3) * 0.05
      const y = (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * 0.05
      pts.push({ x, y, rotation: Math.random() * Math.PI * 2 })
    }
    return pts
  }, [])

  useFrame((state) => {
    if (!groupRef.current) return
    const t = state.clock.elapsedTime + delay
    groupRef.current.position.y = start.y + t * 1.2
    groupRef.current.position.x = start.x + Math.sin(t * 0.15) * 2
    groupRef.current.position.z = start.z + Math.cos(t * 0.15) * 2
    groupRef.current.rotation.z = t * 0.2
    if (groupRef.current.position.y > 40) {
      groupRef.current.position.set(start.x, start.y, start.z)
    }
  })

  return (
    <group ref={groupRef} position={[start.x, start.y, start.z]}>
      {starPositions.map((pos, i) => (
        <Star key={i} position={[pos.x, pos.y, 0]} rotation={pos.rotation} delay={delay + i * 0.04} />
      ))}
    </group>
  )
}

// --------------- Final planet effects ---------------

function OrbitalLights({ planetPosition, radius = 8, count = 6 }) {
  const groupRef = useRef()
  useFrame((state) => {
    if (groupRef.current) groupRef.current.rotation.y = state.clock.elapsedTime * 0.25
  })

  return (
    <group ref={groupRef} position={planetPosition}>
      {Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2
        return (
          <pointLight
            key={i}
            position={[Math.cos(angle) * radius, 0, Math.sin(angle) * radius]}
            intensity={0.6}
            color="#ff6b9d"
            distance={8}
          />
        )
      })}
    </group>
  )
}

function PulsingRing({ planetPosition, size }) {
  const ringRef = useRef()
  useFrame((state) => {
    if (!ringRef.current) return
    const pulse = Math.sin(state.clock.elapsedTime * 0.8) * 0.08 + 1
    ringRef.current.scale.set(pulse, pulse, pulse)
    ringRef.current.rotation.z = state.clock.elapsedTime * 0.2
  })

  return (
    <mesh ref={ringRef} position={planetPosition} rotation={[Math.PI / 2, 0, 0]}>
      <ringGeometry args={[size * 1.35, size * 1.45, 64]} />
      <meshBasicMaterial color="#ff6b9d" transparent opacity={0.15} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  )
}

function HeartParticles({ planetPosition }) {
  const ref = useRef()
  const count = 150
  const particles = useMemo(() => {
    const temp = []
    const heartFn = (t) => {
      const x = 16 * Math.pow(Math.sin(t), 3)
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)
      return [x * 0.55, y * 0.55]
    }
    for (let i = 0; i < count; i++) {
      const t = (i / count) * Math.PI * 2
      const [hx, hy] = heartFn(t)
      const off = (Math.random() - 0.5) * 0.7
      temp.push(
        planetPosition[0] + hx + off,
        planetPosition[1] + hy + off,
        planetPosition[2] + (Math.random() - 0.5) * 3,
      )
    }
    return new Float32Array(temp)
  }, [planetPosition])

  useFrame((state) => {
    if (!ref.current) return
    ref.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.15) * 0.2
    ref.current.rotation.y = state.clock.elapsedTime * 0.04
    ref.current.scale.setScalar(Math.sin(state.clock.elapsedTime * 0.8) * 0.06 + 1)
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={particles} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        map={spriteTexture}
        size={0.14}
        color="#ff4477"
        transparent
        opacity={0.8}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  )
}

// --------------- Extra cosmic elements ---------------

function FloatingOrb({ position, color, size = 0.15, speed = 1 }) {
  const ref = useRef()
  const ringRef = useRef()
  const startY = position[1]
  useFrame((state) => {
    if (!ref.current) return
    const t = state.clock.elapsedTime * speed
    ref.current.position.y = startY + Math.sin(t * 0.5) * 1.5
    ref.current.position.x = position[0] + Math.sin(t * 0.3) * 0.8
    const pulse = Math.sin(t * 2) * 0.15 + 1
    ref.current.children[1].scale.setScalar(pulse)
    if (ringRef.current) {
      ringRef.current.rotation.x = t * 0.8
      ringRef.current.rotation.z = t * 0.5
    }
  })
  return (
    <group ref={ref} position={position}>
      <mesh>
        <sphereGeometry args={[size * 0.5, 12, 12]} />
        <meshStandardMaterial color="#ffffff" emissive={color} emissiveIntensity={2} />
      </mesh>
      <mesh>
        <sphereGeometry args={[size * 2, 12, 12]} />
        <meshBasicMaterial color={color} transparent opacity={0.12} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh ref={ringRef}>
        <ringGeometry args={[size * 1.5, size * 1.8, 24]} />
        <meshBasicMaterial color={color} transparent opacity={0.15} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  )
}

function FloatingOrbs({ count = 15 }) {
  const orbs = useMemo(() => {
    const colors = ['#ff6b9d', '#c471ed', '#ffd700', '#4facfe', '#ff9f43', '#88ccff']
    return Array.from({ length: count }, () => ({
      position: [
        (Math.random() - 0.5) * 160,
        (Math.random() - 0.5) * 60,
        Math.random() * -280 + 30,
      ],
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 0.1 + Math.random() * 0.15,
      speed: 0.5 + Math.random() * 1,
    }))
  }, [count])

  return (
    <>
      {orbs.map((o, i) => (
        <FloatingOrb key={i} {...o} />
      ))}
    </>
  )
}

function TinyMoon({ planetPosition, orbitRadius, speed, size = 0.3, color = '#aaaacc' }) {
  const ref = useRef()
  const ringRef = useRef()
  useFrame((state) => {
    if (ref.current) {
      const t = state.clock.elapsedTime * speed
      ref.current.position.set(
        planetPosition[0] + Math.cos(t) * orbitRadius,
        planetPosition[1] + Math.sin(t * 0.7) * orbitRadius * 0.3,
        planetPosition[2] + Math.sin(t) * orbitRadius,
      )
    }
    if (ringRef.current) {
      const t = state.clock.elapsedTime * speed
      ringRef.current.rotation.x = t * 1.2
      ringRef.current.rotation.z = t * 0.7
    }
  })
  return (
    <group ref={ref}>
      <mesh>
        <sphereGeometry args={[size * 0.6, 16, 16]} />
        <meshStandardMaterial color="#ffffff" emissive={color} emissiveIntensity={1.5} />
      </mesh>
      <mesh>
        <sphereGeometry args={[size * 1.5, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.1} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh ref={ringRef}>
        <ringGeometry args={[size * 1.0, size * 1.25, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.2} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  )
}

function ParticleStream({ from, to, color = '#c471ed', count = 60 }) {
  const ref = useRef()
  const particles = useMemo(() => {
    const temp = []
    for (let i = 0; i < count; i++) {
      const t = i / count
      temp.push(
        from[0] + (to[0] - from[0]) * t + (Math.random() - 0.5) * 3,
        from[1] + (to[1] - from[1]) * t + (Math.random() - 0.5) * 3,
        from[2] + (to[2] - from[2]) * t + (Math.random() - 0.5) * 3,
      )
    }
    return new Float32Array(temp)
  }, [from, to, count])

  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.05) * 0.05
    }
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={particles} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        map={spriteTexture}
        size={0.12}
        color={color}
        transparent
        opacity={0.35}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  )
}

function StarCluster({ position, color = '#aabbdd', count = 80, spread = 3 }) {
  const points = useMemo(() => {
    const pos = []
    for (let i = 0; i < count; i++) {
      const r = Math.pow(Math.random(), 2) * spread
      const theta = Math.random() * Math.PI * 2
      const phi = (Math.random() - 0.5) * Math.PI
      pos.push(
        Math.cos(theta) * Math.cos(phi) * r,
        Math.sin(phi) * r,
        Math.sin(theta) * Math.cos(phi) * r,
      )
    }
    return new Float32Array(pos)
  }, [count, spread])

  return (
    <points position={position}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={points} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        map={spriteTexture} size={0.15} color={color} transparent opacity={0.7}
        sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false}
      />
    </points>
  )
}

function GlowPoint({ position, color = '#ffffff', size = 0.6 }) {
  const ref = useRef()
  useFrame((state) => {
    if (ref.current) {
      const pulse = Math.sin(state.clock.elapsedTime * 1.5) * 0.1 + 1
      ref.current.scale.setScalar(pulse)
    }
  })
  return (
    <group ref={ref} position={position}>
      <mesh>
        <sphereGeometry args={[size * 0.3, 8, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh>
        <sphereGeometry args={[size, 12, 12]} />
        <meshBasicMaterial color={color} transparent opacity={0.08} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  )
}

// --------------- Main scene ---------------

export default function SpaceScene({ step, photoGroups, onPhotoClick, isMobile }) {
  useSmoothCamera(step)

  const planetConfigs = {
    1: {
      position: [-15, 2, -8],
      color: '#ff6b9d',
      size: 2.9,
      withRings: false,
      texturePath: '/textures/earth.jpg',
      offset: 0,
    },
    2: {
      position: [20, -3, -35],
      color: '#c471ed',
      size: 3.8,
      withRings: true,
      texturePath: '/textures/jupiter.jpg',
      offset: 14,
    },
    3: {
      position: [-10, -10, -60],
      color: '#ffd700',
      size: 3.2,
      withRings: false,
      texturePath: '/textures/neptune.jpg',
      offset: 28,
    },
    4: {
      position: [-25, -5, -90],
      color: '#ff9f43',
      size: 3.5,
      withRings: true,
      multiRings: true,
      texturePath: '/textures/textur-gas-kvas-com-u1eq-p-teksturi-planeti-4.jpg',
      offset: 42,
    },
    5: {
      position: [18, -12, -115],
      color: '#e74c3c',
      size: 3.0,
      withRings: false,
      texturePath: '/textures/п.jpg',
      offset: 56,
    },
    6: {
      position: [0, 5, -145],
      color: '#ff6b9d',
      size: 5.2,
      withRings: true,
      multiRings: true,
      texturePath: '/textures/altunai-planet.jpg',
      offset: 70,
    },
  }

  const shootingStarCount = isMobile ? 3 : 5
  const heartCount = isMobile ? 6 : 10
  const cometCount = isMobile ? 1 : 2
  const dustCount = isMobile ? 150 : 250

  return (
    <>
      <AdaptiveDpr pixelated />
      <BackgroundSphere />

      <ambientLight intensity={0.3} />
      <pointLight position={[80, 60, 60]} intensity={2.8} color="#f0f0ff" />
      <pointLight position={[-40, -30, -80]} intensity={1.4} color="#8866bb" />
      <pointLight position={[30, 20, -110]} intensity={1.6} color="#f0f0ff" />
      <pointLight position={[-20, 15, -140]} intensity={1.4} color="#eeddff" />
      <spotLight position={[0, 40, 40]} intensity={1.4} angle={0.5} penumbra={1} color="#ff6b9d" />
      <spotLight position={[0, -30, -60]} intensity={0.8} angle={0.6} penumbra={1} color="#ffd700" />

      <Stars
        radius={350}
        depth={150}
        count={isMobile ? 10000 : 18000}
        factor={5}
        saturation={0.1}
        fade
        speed={0.4}
      />
      <Stars
        radius={300}
        depth={100}
        count={isMobile ? 3000 : 6000}
        factor={3}
        saturation={0.3}
        fade
        speed={0.2}
      />

      <FloatingDust count={dustCount} />
      <AsteroidField />
      <SparkleField count={isMobile ? 40 : 80} />

      <NebulaCloud position={[-60, 15, -200]} color="#7744bb" secondaryColor="#bb5599" scale={3.5} />
      <NebulaCloud position={[70, -12, -220]} color="#dd6699" secondaryColor="#ffaacc" scale={3.0} />
      <NebulaCloud position={[10, 35, -250]} color="#4455aa" secondaryColor="#6677dd" scale={4.0} />
      <NebulaCloud position={[-45, -20, -170]} color="#664488" secondaryColor="#8855bb" scale={2.5} />
      <NebulaCloud position={[50, 25, -280]} color="#995577" secondaryColor="#dd7799" scale={2.5} />
      <NebulaCloud position={[-20, -8, -300]} color="#554499" secondaryColor="#7766bb" scale={3.0} />
      <NebulaCloud position={[-90, 30, -80]} color="#5566aa" secondaryColor="#7788cc" scale={2.0} />
      <NebulaCloud position={[90, -25, -120]} color="#aa5577" secondaryColor="#cc7799" scale={2.2} />
      <NebulaCloud position={[-80, -35, -160]} color="#775599" secondaryColor="#9977bb" scale={1.8} />
      <NebulaCloud position={[85, 30, -50]} color="#cc8855" secondaryColor="#eebb88" scale={1.6} />

      <SpiralGalaxy position={[-70, 25, -230]} rotation={[1.0, 0.3, 0.5]} scale={3.5} />
      <SpiralGalaxy position={[80, -15, -260]} rotation={[-0.5, 0.8, 0.2]} scale={2.5} />
      <SpiralGalaxy position={[15, 40, -320]} rotation={[0.8, -0.4, 0.3]} scale={2.0} />

      <StarCluster position={[-45, 20, -30]} color="#aaccff" count={90} spread={3.5} />
      <StarCluster position={[50, 25, -70]} color="#ccbbee" count={70} spread={2.5} />
      <StarCluster position={[-55, -18, -100]} color="#bbddff" count={80} spread={3} />
      <StarCluster position={[45, -20, -130]} color="#ddccff" count={60} spread={2} />
      <StarCluster position={[-40, 30, -160]} color="#aabbee" count={75} spread={3} />

      <GlowPoint position={[-50, 25, -20]} color="#88bbff" size={0.5} />
      <GlowPoint position={[55, 18, -40]} color="#ffaacc" size={0.4} />
      <GlowPoint position={[-45, -22, -65]} color="#aaddff" size={0.6} />
      <GlowPoint position={[50, -15, -95]} color="#ffcc88" size={0.45} />
      <GlowPoint position={[-55, 20, -120]} color="#cc99ff" size={0.5} />
      <GlowPoint position={[48, 28, -150]} color="#88ccff" size={0.4} />
      <GlowPoint position={[-42, -25, -140]} color="#ffbb99" size={0.55} />

      <CosmicDustTrail color="#9977cc" radius={50} y={5} speed={0.02} />
      <CosmicDustTrail color="#cc7799" radius={40} y={-15} speed={-0.015} />

      {Array.from({ length: shootingStarCount }, (_, i) => (
        <ShootingStar key={`ss-${i}`} />
      ))}

      {Array.from({ length: cometCount }, (_, i) => (
        <Comet key={`comet-${i}`} delay={i * 10} />
      ))}

      {Array.from({ length: heartCount }, (_, i) => (
        <FlyingStarHeart key={`heart-${i}`} delay={i * 2} />
      ))}

      <FloatingOrbs count={isMobile ? 6 : 12} />

      <TinyMoon planetPosition={[-15, 2, -8]} orbitRadius={5.5} speed={0.4} size={0.25} color="#ddccbb" />
      <TinyMoon planetPosition={[20, -3, -35]} orbitRadius={7} speed={0.3} size={0.35} color="#bbaadd" />
      <TinyMoon planetPosition={[0, 5, -145]} orbitRadius={9} speed={0.2} size={0.4} color="#ffaacc" />

      <ParticleStream from={[-15, 2, -8]} to={[20, -3, -35]} color="#9977cc" count={60} />
      <ParticleStream from={[20, -3, -35]} to={[-10, -10, -60]} color="#cc7799" count={50} />
      <ParticleStream from={[-10, -10, -60]} to={[-25, -5, -90]} color="#aa8844" count={50} />
      <ParticleStream from={[-25, -5, -90]} to={[18, -12, -115]} color="#cc8866" count={50} />
      <ParticleStream from={[18, -12, -115]} to={[0, 5, -145]} color="#bb66aa" count={50} />

      {Object.entries(planetConfigs).map(([id, cfg]) => (
        <Planet key={id} {...cfg} />
      ))}

      {step >= 1 && step <= 5 && photoGroups[step] && photoGroups[step].length > 0 && (
        <Suspense fallback={null}>
          <PhotoRing
            photos={photoGroups[step]}
            planetPosition={planetConfigs[step].position}
            onPhotoClick={onPhotoClick}
            offset={planetConfigs[step].offset}
          />
        </Suspense>
      )}

      {step === 6 && (
        <>
          {photoGroups[6] && photoGroups[6].length > 0 && (
            <Suspense fallback={null}>
              <PhotoRing
                photos={photoGroups[6]}
                planetPosition={planetConfigs[6].position}
                onPhotoClick={onPhotoClick}
                offset={planetConfigs[6].offset}
              />
            </Suspense>
          )}
          <PulsingRing planetPosition={planetConfigs[6].position} size={planetConfigs[6].size} />
          <OrbitalLights planetPosition={planetConfigs[6].position} radius={12} count={6} />
          <HeartParticles planetPosition={planetConfigs[6].position} />
          <spotLight
            position={[0, 30, -28]}
            intensity={1.5}
            angle={0.2}
            penumbra={0.9}
            color="#ffffff"
          />
        </>
      )}

    </>
  )
}
