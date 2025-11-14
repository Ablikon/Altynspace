import { useRef, useMemo, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Stars, Sphere, Html, MeshDistortMaterial, Float, useTexture } from '@react-three/drei'
import * as THREE from 'three'

function PhotoOrbit({ photo, index, totalPhotos, onPhotoClick, planetPosition }) {
  const meshRef = useRef()
  const [hovered, setHovered] = useState(false)
  
  const angle = (index / totalPhotos) * Math.PI * 2
  const radius = 3
  const orbitSpeed = 0.0005
  
  useFrame((state) => {
    if (meshRef.current) {
      const time = state.clock.elapsedTime * orbitSpeed + angle
      meshRef.current.position.x = planetPosition[0] + Math.cos(time) * radius
      meshRef.current.position.y = planetPosition[1] + Math.sin(time) * radius * 0.5
      meshRef.current.position.z = planetPosition[2] + Math.sin(time) * radius
      meshRef.current.lookAt(0, 0, 0)
    }
  })

  return (
    <mesh
      ref={meshRef}
      onClick={() => onPhotoClick(index)}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      scale={hovered ? 0.25 : 0.2}
    >
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial 
        map={useTexture(photo.src)} 
        side={THREE.DoubleSide}
        transparent
        opacity={hovered ? 1 : 0.8}
      />
      {hovered && (
        <Html distanceFactor={10} position={[0, 0.6, 0]}>
          <div style={{
            background: 'rgba(0,0,0,0.8)',
            color: 'white',
            padding: '0.5rem',
            borderRadius: '8px',
            whiteSpace: 'nowrap',
            fontSize: '0.8rem',
            pointerEvents: 'none'
          }}>
            {photo.caption}
          </div>
        </Html>
      )}
      <mesh position={[0, 0, 0.01]}>
        <ringGeometry args={[0.55, 0.6, 32]} />
        <meshBasicMaterial color={hovered ? "#ff6b9d" : "#ffffff"} transparent opacity={0.5} />
      </mesh>
    </mesh>
  )
}

function RealisticPlanet({ position, color, size = 1, distort = 0.3, speed = 2, photos, onPhotoClick }) {
  const meshRef = useRef()
  const glowRef = useRef()
  const [clicked, setClicked] = useState(false)

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.003
      meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.2) * 0.1
    }
    if (glowRef.current) {
      glowRef.current.rotation.y -= 0.002
    }
  })

  return (
    <Float speed={speed} rotationIntensity={0.3} floatIntensity={0.3}>
      <group position={position}>
        {/* Основная планета */}
        <Sphere ref={meshRef} args={[size, 64, 64]} onClick={() => setClicked(!clicked)}>
          <MeshDistortMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.4}
            distort={distort}
            speed={1.5}
            roughness={0.3}
            metalness={0.7}
          />
        </Sphere>
        
        {/* Атмосфера */}
        <Sphere args={[size * 1.15, 32, 32]}>
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.15}
            side={THREE.BackSide}
          />
        </Sphere>
        
        {/* Внешнее свечение */}
        <Sphere ref={glowRef} args={[size * 1.3, 32, 32]}>
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.1}
            side={THREE.BackSide}
            blending={THREE.AdditiveBlending}
          />
        </Sphere>

        {/* Кратеры/детали */}
        {[...Array(5)].map((_, i) => (
          <Sphere
            key={i}
            args={[size * 0.1, 16, 16]}
            position={[
              Math.cos(i * 2) * size * 0.9,
              Math.sin(i * 3) * size * 0.9,
              Math.sin(i * 1.5) * size * 0.9
            ]}
          >
            <meshStandardMaterial
              color={new THREE.Color(color).multiplyScalar(0.5)}
              roughness={0.8}
            />
          </Sphere>
        ))}

        {/* Фотографии на орбите */}
        {photos && photos.map((photo, index) => (
          <PhotoOrbit
            key={index}
            photo={photo}
            index={index}
            totalPhotos={photos.length}
            onPhotoClick={onPhotoClick}
            planetPosition={position}
          />
        ))}
      </group>
    </Float>
  )
}

function Ring({ position, color, size }) {
  const ringRef = useRef()
  
  useFrame((state) => {
    if (ringRef.current) {
      ringRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.5) * 0.1
    }
  })

  return (
    <mesh ref={ringRef} position={position} rotation={[Math.PI / 2.5, 0, 0]}>
      <torusGeometry args={[size * 1.5, size * 0.05, 16, 100]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.4}
        transparent
        opacity={0.7}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

function ShootingStar() {
  const ref = useRef()
  const [position] = useState(() => [
    Math.random() * 20 - 10,
    Math.random() * 20 - 10,
    -20
  ])

  useFrame((state) => {
    if (ref.current) {
      ref.current.position.z += 0.1
      if (ref.current.position.z > 10) {
        ref.current.position.z = -20
        ref.current.position.x = Math.random() * 20 - 10
        ref.current.position.y = Math.random() * 20 - 10
      }
    }
  })

  return (
    <mesh ref={ref} position={position}>
      <sphereGeometry args={[0.05, 8, 8]} />
      <meshBasicMaterial color="#ffffff" />
    </mesh>
  )
}

function FloatingParticles() {
  const particlesRef = useRef()
  
  const particles = useMemo(() => {
    const temp = []
    for (let i = 0; i < 300; i++) {
      const x = (Math.random() - 0.5) * 40
      const y = (Math.random() - 0.5) * 40
      const z = (Math.random() - 0.5) * 40
      temp.push(x, y, z)
    }
    return new Float32Array(temp)
  }, [])

  useFrame((state) => {
    if (particlesRef.current) {
      particlesRef.current.rotation.y += 0.0003
      particlesRef.current.rotation.x += 0.0001
    }
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
        size={0.05}
        color="#ff6b9d"
        transparent
        opacity={0.6}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

export default function SpaceScene({ photos, onPhotoClick }) {
  // Разделим фотографии между планетами
  const photosPerPlanet = Math.ceil(photos.length / 3)
  const planet1Photos = photos.slice(0, photosPerPlanet)
  const planet2Photos = photos.slice(photosPerPlanet, photosPerPlanet * 2)
  const planet3Photos = photos.slice(photosPerPlanet * 2)

  return (
    <>
      <ambientLight intensity={0.3} />
      <pointLight position={[10, 10, 10]} intensity={2} color="#ffffff" />
      <pointLight position={[-10, -10, -10]} intensity={1.5} color="#c471ed" />
      <pointLight position={[0, 10, -10]} intensity={1.5} color="#ff6b9d" />
      <spotLight position={[0, 0, 10]} intensity={1} angle={0.3} penumbra={1} color="#ffd700" />
      
      <Stars
        radius={200}
        depth={80}
        count={10000}
        factor={6}
        saturation={0}
        fade
        speed={1}
      />
      
      {/* Главная планета с кольцом */}
      <RealisticPlanet 
        position={[0, 0, -8]} 
        color="#ff6b9d" 
        size={1.5} 
        distort={0.4} 
        speed={1.5}
        photos={planet1Photos}
        onPhotoClick={onPhotoClick}
      />
      <Ring position={[0, 0, -8]} color="#ff6b9d" size={1.5} />
      
      {/* Вторая планета */}
      <RealisticPlanet 
        position={[-5, 2, -6]} 
        color="#c471ed" 
        size={1.2} 
        distort={0.5} 
        speed={2}
        photos={planet2Photos}
        onPhotoClick={onPhotoClick}
      />
      
      {/* Третья планета */}
      <RealisticPlanet 
        position={[5, -1, -10]} 
        color="#ffd700" 
        size={1} 
        distort={0.3} 
        speed={1.8}
        photos={planet3Photos}
        onPhotoClick={onPhotoClick}
      />
      
      {/* Дополнительные планеты без фото */}
      <RealisticPlanet position={[-3, -2, -15]} color="#64ffda" size={0.6} distort={0.6} speed={2.5} />
      <RealisticPlanet position={[4, 3, -18]} color="#ff9671" size={0.8} distort={0.4} speed={2.2} />
      
      {/* Падающие звезды */}
      {[...Array(5)].map((_, i) => (
        <ShootingStar key={i} />
      ))}
      
      <FloatingParticles />
    </>
  )
}
