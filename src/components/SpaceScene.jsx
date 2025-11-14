import { useRef, useMemo, useState, Suspense } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Stars, Sphere, MeshDistortMaterial, Float, Html, useTexture, RoundedBox } from '@react-three/drei'
import * as THREE from 'three'

function useSmoothCamera(step) {
  const { camera } = useThree()
  const lookAtTarget = useRef(new THREE.Vector3())

  const positionsByStep = {
    0: { pos: [0, 8, 42], look: [0, -2, -15] },
    1: { pos: [-28, 5, 5], look: [-28, 0, -18] },
    2: { pos: [28, 5, 5], look: [28, 0, -18] },
    3: { pos: [0, -5, 0], look: [0, -8, -30] },
    4: { pos: [0, 10, -10], look: [0, 8, -50] },
  }

  useFrame(() => {
    const cfg = positionsByStep[step] ?? positionsByStep[0]
    const targetPos = new THREE.Vector3(...cfg.pos)
    const targetLookVec = new THREE.Vector3(...cfg.look)
    
    camera.position.lerp(targetPos, 0.035)
    lookAtTarget.current.lerp(targetLookVec, 0.035)
    camera.lookAt(lookAtTarget.current)
  })
}

// Оптимизированное ядро планеты с уменьшенной детализацией
function PlanetCore({ map, color, size, detail = 64 }) {
  const meshRef = useRef()
  useFrame((state) => {
    if (!meshRef.current) return
    meshRef.current.rotation.y += 0.001
  })

  // Еще больше уменьшил детализацию для скорости
  const actualDetail = Math.max(16, detail / 4)

  return (
    <Sphere ref={meshRef} args={[size, actualDetail, actualDetail]}>
      {map ? (
        <meshStandardMaterial 
          map={map} 
          metalness={0.2} 
          roughness={0.9}
          // Отключаем ненужные расчеты
          transparent={false}
        />
      ) : (
        <meshBasicMaterial color={color} />
      )}
    </Sphere>
  )
}

// Упрощенная атмосфера планеты
function PlanetAtmosphere({ color, size }) {
  return (
    <Sphere args={[size * 1.08, 16, 16]}>
      <meshBasicMaterial 
        color={color} 
        transparent 
        opacity={0.12} 
        side={THREE.BackSide}
        depthWrite={false}
      />
    </Sphere>
  )
}

// Упрощенные кольца планеты
function PlanetRings({ color, size }) {
  const ringRef = useRef()
  useFrame((state) => {
    if (!ringRef.current) return
    ringRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.15) * 0.06
  })

  return (
    <mesh ref={ringRef} rotation={[Math.PI / 2.2, 0, 0]}>
      <torusGeometry args={[size * 2, size * 0.08, 16, 64]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.3}
        transparent
        opacity={0.5}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  )
}

// Оптимизированная планета с Suspense
function Planet({ position, color, size, withRings = false, texturePath }) {
  const texture = texturePath ? useTexture(texturePath) : null

  return (
    <Float speed={0.6} rotationIntensity={0.2} floatIntensity={0.2}>
      <group position={position}>
        <Suspense fallback={
          <Sphere args={[size, 8, 8]}>
            <meshBasicMaterial color={color} wireframe />
          </Sphere>
        }>
          <PlanetCore map={texture} color={color} size={size} />
        </Suspense>
        <PlanetAtmosphere color={color} size={size} />
        {withRings && <PlanetRings color={color} size={size} />}
      </group>
    </Float>
  )
}

function PhotoFrame({ photo, position, index, total, onClick }) {
  const texture = useTexture(photo.src)
  const [hovered, setHovered] = useState(false)
  const meshRef = useRef()

  useFrame((state) => {
    if (!meshRef.current) return
    meshRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.25 + index) * 0.06
  })

  const scale = 1.3

  return (
    <group
      ref={meshRef}
      position={position}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered(true)
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        setHovered(false)
        document.body.style.cursor = 'default'
      }}
    >
      <RoundedBox args={[scale * 1.55, scale * 1.25, 0.04]} radius={0.04}>
        <meshBasicMaterial
          color="#ff6b9d"
          transparent
          opacity={hovered ? 0.5 : 0.25}
          blending={THREE.AdditiveBlending}
        />
      </RoundedBox>

      <RoundedBox args={[scale * 1.45, scale * 1.3, 0.02]} radius={0.03} position={[0, 0, 0.03]}>
        <meshStandardMaterial 
          color="#ffffff" 
          roughness={0.8} 
          metalness={0.08}
          emissive={hovered ? "#ff6b9d" : "#000000"}
          emissiveIntensity={0.2}
        />
      </RoundedBox>

      <mesh position={[0, scale * 0.06, 0.05]}>
        <planeGeometry args={[scale * 1.25, scale * 0.9]} />
        <meshStandardMaterial map={texture} roughness={0.65} metalness={0.08} />
      </mesh>

      {hovered && (
        <>
          <Html
            position={[0, -scale * 0.52, 0.06]}
            distanceFactor={9}
            occlude
            style={{ pointerEvents: 'none' }}
          >
            <div
              style={{
                width: 200,
                textAlign: 'center',
                fontSize: '0.68rem',
                color: '#fff',
                fontFamily: 'monospace',
                textShadow: '0 0 6px rgba(255,107,157,0.5)',
                background: 'rgba(0,0,0,0.6)',
                padding: '4px 8px',
                borderRadius: '6px',
              }}
            >
              {photo.caption}
            </div>
          </Html>
          <mesh position={[0, 0, 0.07]}>
            <ringGeometry args={[scale * 0.9, scale * 0.95, 32]} />
            <meshBasicMaterial color="#ff6b9d" transparent opacity={0.6} side={THREE.DoubleSide} />
          </mesh>
        </>
      )}

      <Html position={[0, scale * 0.68, 0.06]} distanceFactor={9} occlude style={{ pointerEvents: 'none' }}>
        <div
          style={{
            fontSize: '0.62rem',
            color: 'rgba(255,255,255,0.75)',
            letterSpacing: '0.08em',
          }}
        >
          {index + 1}/{total}
        </div>
      </Html>
    </group>
  )
}

function PhotoRing({ photos, planetPosition, onPhotoClick, offset }) {
  const total = Math.min(photos.length, 5)
  const visiblePhotos = photos.slice(0, total)
  const radius = 5.5
  const [px, py, pz] = planetPosition

  return (
    <group>
      {visiblePhotos.map((p, i) => {
        const angle = (i / total) * Math.PI * 2 - Math.PI / 2
        const x = px + Math.cos(angle) * radius
        const y = py + Math.sin(angle) * 0.6
        const z = pz + Math.sin(angle) * radius * 0.35 + 3

        const globalIndex = offset + i

        return (
          <PhotoFrame
            key={i}
            photo={p}
            index={i}
            total={total}
            position={[x, y, z]}
            onClick={() => onPhotoClick(globalIndex)}
          />
        )
      })}
    </group>
  )
}

function ShootingStar() {
  const ref = useRef()
  const [start] = useState(() => ({
    x: Math.random() * 50 - 25,
    y: Math.random() * 25 - 12,
    z: Math.random() * 30 - 70,
  }))
  const velocity = useMemo(() => ({
    x: -0.25 - Math.random() * 0.15,
    y: -0.12 - Math.random() * 0.08,
    z: 0.03 + Math.random() * 0.05,
  }), [])

  useFrame(() => {
    if (!ref.current) return
    ref.current.position.x += velocity.x
    ref.current.position.y += velocity.y
    ref.current.position.z += velocity.z
    
    if (ref.current.position.x < -35 || ref.current.position.y < -20 || ref.current.position.z > 8) {
      ref.current.position.set(start.x, start.y, start.z)
    }
  })

  return (
    <group ref={ref} position={[start.x, start.y, start.z]}>
      <mesh>
        <sphereGeometry args={[0.06, 6, 6]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0.5, 0.25, -0.2]} rotation={[0, 0, Math.PI / 4]}>
        <planeGeometry args={[0.9, 0.08]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.5} />
      </mesh>
    </group>
  )
}

// Оптимизированная пыль
function FloatingDust() {
  const ref = useRef()
  const points = useMemo(() => {
    const temp = []
    for (let i = 0; i < 300; i++) { // Уменьшил с 600 до 300
      const x = (Math.random() - 0.5) * 150
      const y = (Math.random() - 0.5) * 150
      const z = (Math.random() - 0.5) * 150
      temp.push(x, y, z)
    }
    return new Float32Array(temp)
  }, [])

  useFrame(() => {
    if (!ref.current) return
    ref.current.rotation.y += 0.0003
    ref.current.rotation.x += 0.0001
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={points.length / 3}
          array={points}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.08}
        color="#ff6b9d"
        transparent
        opacity={0.6}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  )
}

function OrbitalLights({ planetPosition, radius = 8, count = 12 }) {
  const groupRef = useRef()

  useFrame((state) => {
    if (!groupRef.current) return
    groupRef.current.rotation.y = state.clock.elapsedTime * 0.3
  })

  return (
    <group ref={groupRef} position={planetPosition}>
      {[...Array(count)].map((_, i) => {
        const angle = (i / count) * Math.PI * 2
        const x = Math.cos(angle) * radius
        const z = Math.sin(angle) * radius
        return (
          <pointLight
            key={i}
            position={[x, 0, z]}
            intensity={1.2} // Уменьшил интенсивность
            color="#ff6b9d"
            distance={8}
          />
        )
      })}
    </group>
  )
}

// Компонент одной звездочки
function Star({ position, rotation, delay }) {
  const meshRef = useRef()

  useFrame((state) => {
    if (!meshRef.current) return
    const time = state.clock.elapsedTime + delay
    
    const flicker = Math.sin(time * 4) * 0.2 + 0.8 // Уменьшил частоту мерцания
    meshRef.current.scale.setScalar(flicker)
    meshRef.current.rotation.z = time * 1.5
  })

  const starShape = useMemo(() => {
    const shape = new THREE.Shape()
    const outerRadius = 0.08 // Уменьшил размер
    const innerRadius = 0.03
    const points = 5

    for (let i = 0; i < points * 2; i++) {
      const radius = i % 2 === 0 ? outerRadius : innerRadius
      const angle = (i * Math.PI) / points
      const x = Math.cos(angle) * radius
      const y = Math.sin(angle) * radius
      
      if (i === 0) {
        shape.moveTo(x, y)
      } else {
        shape.lineTo(x, y)
      }
    }
    shape.closePath()
    return shape
  }, [])

  return (
    <mesh ref={meshRef} position={position} rotation={[0, 0, rotation]}>
      <shapeGeometry args={[starShape]} />
      <meshBasicMaterial
        color="#ff1744"
        transparent
        opacity={0.85}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  )
}

// Летающее сердечко из звездочек
function FlyingStarHeart({ delay = 0 }) {
  const groupRef = useRef()
  const [start] = useState(() => ({
    x: (Math.random() - 0.5) * 50,
    y: -20 - Math.random() * 10,
    z: (Math.random() - 0.5) * 50,
  }))

  const starPositions = useMemo(() => {
    const positions = []
    const heartPoints = 12 // Уменьшил с 16 до 12
    
    for (let i = 0; i < heartPoints; i++) {
      const t = (i / heartPoints) * Math.PI * 2
      const x = 16 * Math.pow(Math.sin(t), 3) * 0.05
      const y = (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * 0.05
      positions.push({ x, y, rotation: Math.random() * Math.PI * 2 })
    }
    return positions
  }, [])

  useFrame((state) => {
    if (!groupRef.current) return
    const time = state.clock.elapsedTime + delay
    
    groupRef.current.position.y = start.y + time * 1.5 // Медленнее
    groupRef.current.position.x = start.x + Math.sin(time * 0.2) * 2
    groupRef.current.position.z = start.z + Math.cos(time * 0.2) * 2
    groupRef.current.rotation.z = time * 0.25
    
    if (groupRef.current.position.y > 35) {
      groupRef.current.position.set(start.x, start.y, start.z)
    }
  })

  return (
    <group ref={groupRef} position={[start.x, start.y, start.z]}>
      {starPositions.map((pos, i) => (
        <Star 
          key={i} 
          position={[pos.x, pos.y, 0]} 
          rotation={pos.rotation}
          delay={delay + i * 0.04}
        />
      ))}
    </group>
  )
}

// Тонкое пульсирующее кольцо
function PulsingRing({ planetPosition, size }) {
  const ringRef = useRef()

  useFrame((state) => {
    if (!ringRef.current) return
    const pulse = Math.sin(state.clock.elapsedTime * 1.0) * 0.1 + 1
    ringRef.current.scale.set(pulse, pulse, pulse)
    ringRef.current.rotation.z = state.clock.elapsedTime * 0.25
  })

  return (
    <mesh ref={ringRef} position={planetPosition} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[size * 1.4, size * 0.05, 24, 48]} />
      <meshBasicMaterial
        color="#ff6b9d"
        transparent
        opacity={0.2}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  )
}

// Оптимизированное сердце из частиц
function HeartParticles({ planetPosition }) {
  const particlesRef = useRef()
  
  const particles = useMemo(() => {
    const temp = []
    const heartShape = (t) => {
      const x = 16 * Math.pow(Math.sin(t), 3)
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)
      return [x * 0.6, y * 0.6]
    }

    for (let i = 0; i < 180; i++) { // Уменьшил с 300 до 180
      const t = (i / 180) * Math.PI * 2
      const [hx, hy] = heartShape(t)
      const randomOffset = (Math.random() - 0.5) * 0.9
      temp.push(
        planetPosition[0] + hx + randomOffset,
        planetPosition[1] + hy + randomOffset,
        planetPosition[2] + (Math.random() - 0.5) * 3.5
      )
    }
    return new Float32Array(temp)
  }, [planetPosition])

  useFrame((state) => {
    if (!particlesRef.current) return
    particlesRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.2) * 0.3
    particlesRef.current.rotation.y = state.clock.elapsedTime * 0.06
    
    const pulse = Math.sin(state.clock.elapsedTime * 1.0) * 0.1 + 1
    particlesRef.current.scale.setScalar(pulse)
  })

  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={particles.length / 3}
          array={particles}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.18}
        color="#ff1744"
        transparent
        opacity={0.95}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  )
}

export default function SpaceScene({ step, photoGroups, onPhotoClick }) {
  useSmoothCamera(step)

  const planetConfigs = {
    1: {
      position: [-28, 0, -18],
      color: '#ff6b9d',
      size: 2.9,
      withRings: false,
      texturePath: '/textures/earth.jpg',
      offset: 0,
    },
    2: {
      position: [28, 0, -18],
      color: '#c471ed',
      size: 3.8,
      withRings: true,
      texturePath: '/textures/jupiter.jpg',
      offset: 7,
    },
    3: {
      position: [0, -8, -30],
      color: '#ffd700',
      size: 3.2,
      withRings: false,
      texturePath: '/textures/neptune.jpg',
      offset: 17,
    },
    4: {
      position: [0, 8, -50],
      color: '#ff6b9d',
      size: 5.2,
      withRings: true,
      texturePath: '/textures/altunai-planet.jpg',
      offset: 0,
    },
  }

  return (
    <>
      <ambientLight intensity={0.3} />
      <pointLight position={[50, 50, 50]} intensity={3} color="#ffffff" />
      <pointLight position={[-40, -40, -30]} intensity={2} color="#c471ed" />
      <spotLight position={[0, 40, 40]} intensity={2.2} angle={0.4} penumbra={1} color="#ff6b9d" castShadow={false} />
      <spotLight position={[0, -25, 25]} intensity={1.3} angle={0.5} penumbra={1} color="#ffd700" castShadow={false} />

      <Stars 
        radius={350}
        depth={150}
        count={15000} // Уменьшил с 25000 до 15000
        factor={4}
        saturation={0} 
        fade={true}
        speed={0.6} 
      />

      <FloatingDust />
      {[...Array(4)].map((_, i) => ( // Уменьшил с 6 до 4
        <ShootingStar key={i} />
      ))}

      {/* 5 летающих сердечек вместо 8 */}
      {[...Array(5)].map((_, i) => (
        <FlyingStarHeart key={`heart-${i}`} delay={i * 1.8} />
      ))}

      <Suspense fallback={null}>
        <Planet {...planetConfigs[1]} />
        <Planet {...planetConfigs[2]} />
        <Planet {...planetConfigs[3]} />
        <Planet {...planetConfigs[4]} />
      </Suspense>

      {step >= 1 && step <= 3 && (
        <Suspense fallback={null}>
          <PhotoRing
            photos={photoGroups[step] || []}
            planetPosition={planetConfigs[step].position}
            onPhotoClick={onPhotoClick}
            offset={planetConfigs[step].offset}
          />
        </Suspense>
      )}

      {step === 4 && (
        <>
          <PulsingRing planetPosition={planetConfigs[4].position} size={planetConfigs[4].size} />
          <OrbitalLights planetPosition={planetConfigs[4].position} radius={13} count={8} /> {/* Уменьшил с 12 до 8 */}
          <HeartParticles planetPosition={planetConfigs[4].position} />

          <spotLight
            position={[0, 32, -26]}
            target-position={planetConfigs[4].position}
            intensity={2.2}
            angle={0.18}
            penumbra={0.9}
            color="#ffffff"
            castShadow={false}
          />
        </>
      )}
    </>
  )
}
