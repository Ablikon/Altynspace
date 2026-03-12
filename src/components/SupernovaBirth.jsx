import { useRef, useMemo, useState, useCallback, useEffect } from 'react'
import { Canvas, useFrame, useThree, useLoader } from '@react-three/fiber'
import { motion, AnimatePresence } from 'framer-motion'
import * as THREE from 'three'

/* ═══════════════════════════════════════ */
/* ─── Canvas Textures ─── */
/* ═══════════════════════════════════════ */

const glowSprite = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64
    const ctx = c.getContext('2d')
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.15, 'rgba(255,255,255,0.5)')
    g.addColorStop(0.4, 'rgba(255,255,255,0.08)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64)
    return new THREE.CanvasTexture(c)
})()

const starSprite = (() => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128
    const ctx = c.getContext('2d')
    const cx = 64, cy = 64
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 48)
    g.addColorStop(0, 'rgba(255,255,250,1)')
    g.addColorStop(0.04, 'rgba(255,255,240,0.9)')
    g.addColorStop(0.12, 'rgba(255,248,225,0.4)')
    g.addColorStop(0.3, 'rgba(220,230,255,0.08)')
    g.addColorStop(1, 'rgba(200,220,255,0)')
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128)
    ctx.globalCompositeOperation = 'lighter'
    for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle)
        const sg = ctx.createLinearGradient(0, 0, 52, 0)
        sg.addColorStop(0, 'rgba(255,255,245,0.6)')
        sg.addColorStop(0.25, 'rgba(255,250,230,0.18)')
        sg.addColorStop(1, 'rgba(240,240,255,0)')
        ctx.fillStyle = sg; ctx.fillRect(0, -1.5, 52, 3)
        ctx.restore()
    }
    return new THREE.CanvasTexture(c)
})()

const FLIGHT_DURATION = 50
const NEB = new THREE.Vector3(0, 0, -200)

/* ═══════════════════════════════════════ */
/* ─── GLSL Nebula Shader ─── */
/* ═══════════════════════════════════════ */
const nebulaVS = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`
const nebulaFS = `
uniform float uTime, uIntensity, uCompress;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y);
}
float fbm(vec2 p) {
  float v=0.0, a=0.5;
  for(int i=0;i<6;i++) { v += a*noise(p); p *= 2.1; a *= 0.48; }
  return v;
}

void main() {
  vec2 uv = vUv - 0.5;
  float d = length(uv);

  float t = uTime * 0.015;
  float n1 = fbm(uv * 3.5 + t);
  float n2 = fbm(uv * 5.0 - t * 0.8 + 7.0);
  float n3 = fbm(uv * 7.5 + t * 0.5 + 15.0);
  float n4 = fbm(uv * 12.0 - t * 0.3 + 25.0);

  // Rich color palette
  vec3 deepPurple = vec3(0.35, 0.08, 0.55);
  vec3 royalBlue = vec3(0.08, 0.15, 0.45);
  vec3 warmGold = vec3(0.85, 0.6, 0.15);
  vec3 hotPink = vec3(0.75, 0.18, 0.4);
  vec3 teal = vec3(0.1, 0.35, 0.4);

  vec3 col = mix(deepPurple, royalBlue, n1);
  col = mix(col, warmGold, n2 * 0.4);
  col = mix(col, hotPink, n3 * 0.25);
  col = mix(col, teal, n4 * 0.15);

  // Radial structure
  float falloff = 1.0 - smoothstep(0.05, 0.55, d);
  float darkLanes = smoothstep(0.35, 0.55, n4) * 0.5;
  float emission = exp(-d * 5.0) * 0.4;

  // Compression effect: colors brighten toward center
  float compressBright = uCompress * exp(-d * 8.0) * 2.0;
  col += vec3(1.0, 0.85, 0.5) * (emission + compressBright);
  col *= (1.0 - darkLanes);
  col *= (n1 * 0.4 + 0.6) * 1.3;

  float alpha = falloff * uIntensity * (n1 * 0.3 + n2 * 0.2 + 0.5);
  alpha = clamp(alpha, 0.0, 1.0);

  gl_FragColor = vec4(col, alpha);
}
`

/* ═══════════════════════════════════════ */
/* ─── Photo → Stars Edge Detection ─── */
/* ═══════════════════════════════════════ */
const PHOTO_SRC = '/gallery/IMG_5560.jpg'
const MAX_EDGE_STARS = 6000
const MAX_FILL_STARS = 600
const PORTRAIT_SCALE = 18 // world units width

function processPhotoToStars(img) {
    // Higher resolution for maximum detail
    const FULL_W = 350, FULL_H = Math.round(FULL_W * (img.height / img.width))
    const fc = document.createElement('canvas'); fc.width = FULL_W; fc.height = FULL_H
    const fctx = fc.getContext('2d'); fctx.drawImage(img, 0, 0, FULL_W, FULL_H)

    // Crop: top 60% height, center 85% width — full face, hair, chin, neck
    const cropX = Math.floor(FULL_W * 0.075), cropY = 0
    const cropW = Math.floor(FULL_W * 0.85), cropH = Math.floor(FULL_H * 0.60)
    const W = cropW, H = cropH

    const c = document.createElement('canvas'); c.width = W; c.height = H
    const ctx = c.getContext('2d')
    ctx.drawImage(fc, cropX, cropY, cropW, cropH, 0, 0, W, H)

    const d = ctx.getImageData(0, 0, W, H).data
    const gray = new Float32Array(W * H)
    for (let i = 0; i < W * H; i++) gray[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) / 255

    // Sobel edge detection
    const edge = new Float32Array(W * H)
    for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
            const gx = -gray[(y - 1) * W + (x - 1)] + gray[(y - 1) * W + (x + 1)]
                - 2 * gray[y * W + (x - 1)] + 2 * gray[y * W + (x + 1)]
                - gray[(y + 1) * W + (x - 1)] + gray[(y + 1) * W + (x + 1)]
            const gy = -gray[(y - 1) * W + (x - 1)] - 2 * gray[(y - 1) * W + x] - gray[(y - 1) * W + (x + 1)]
                + gray[(y + 1) * W + (x - 1)] + 2 * gray[(y + 1) * W + x] + gray[(y + 1) * W + (x + 1)]
            edge[y * W + x] = Math.sqrt(gx * gx + gy * gy)
        }
    }

    const edgeStars = [], fillStars = []
    const aspect = H / W

    // Collect edge pixels — higher threshold to only get strong features
    const candidates = []
    for (let y = 2; y < H - 2; y++) {
        for (let x = 2; x < W - 2; x++) {
            const e = edge[y * W + x]
            if (e > 0.25) candidates.push({ x, y, e, b: gray[y * W + x] })
        }
    }
    candidates.sort((a, b) => b.e - a.e)

    // Dense sampling — smaller minimum distance for finer detail
    const taken = new Set()
    const minDist = 0.7
    for (const c of candidates) {
        if (edgeStars.length >= MAX_EDGE_STARS) break
        const key = `${Math.floor(c.x / minDist)},${Math.floor(c.y / minDist)}`
        if (taken.has(key)) continue
        taken.add(key)
        const wx = (c.x / W - 0.5) * PORTRAIT_SCALE
        const wy = -(c.y / H - 0.5) * PORTRAIT_SCALE * aspect
        edgeStars.push([wx, wy, c.b])
    }

    // Fill stars — only in brightest areas (skin highlights), much sparser
    for (let y = 3; y < H - 3; y += 3) {
        for (let x = 3; x < W - 3; x += 3) {
            if (fillStars.length >= MAX_FILL_STARS) break
            const b = gray[y * W + x]
            if (b > 0.55 && edge[y * W + x] < 0.15) {
                if (Math.random() < 0.12) {
                    const wx = (x / W - 0.5) * PORTRAIT_SCALE
                    const wy = -(y / H - 0.5) * PORTRAIT_SCALE * aspect
                    fillStars.push([wx, wy, b])
                }
            }
        }
    }

    return { edgeStars, fillStars }
}

/* Name "Алтынай" as separate stars below the silhouette */
const NAME_STARS = (() => {
    const pts = []; let x = -9.5; const sp = 2.2
    pts.push([x, 0], [x + 0.5, 1.8], [x + 1, 0], [x + 0.2, 0.7], [x + 0.8, 0.7]); x += sp  // А
    pts.push([x + 0.5, 1.8], [x, 0], [x + 1, 0]); x += sp                           // Л
    pts.push([x, 1.8], [x + 1, 1.8], [x + 0.5, 1.8], [x + 0.5, 0]); x += sp             // Т
    pts.push([x, 1.8], [x, 0], [x, 0.9], [x + 0.38, 0.9], [x + 0.38, 0], [x + 0.8, 1.8], [x + 0.8, 0]); x += sp // Ы
    pts.push([x, 1.8], [x, 0], [x, 0.9], [x + 0.8, 0.9], [x + 0.8, 1.8], [x + 0.8, 0]); x += sp // Н
    pts.push([x, 0], [x + 0.5, 1.8], [x + 1, 0], [x + 0.2, 0.7], [x + 0.8, 0.7]); x += sp   // А
    pts.push([x, 0], [x, 1.8], [x + 0.8, 0], [x + 0.8, 1.8], [x + 0.4, 2.15])           // Й
    return pts
})()

const NAME_LINES = (() => {
    const l = []; let b = 0
    l.push([b, b + 1], [b + 1, b + 2], [b + 3, b + 4]); b += 5
    l.push([b, b + 1], [b, b + 2]); b += 3
    l.push([b, b + 1], [b + 2, b + 3]); b += 4
    l.push([b, b + 1], [b + 2, b + 3], [b + 3, b + 4], [b + 5, b + 6]); b += 7
    l.push([b, b + 1], [b + 2, b + 3], [b + 4, b + 5]); b += 6
    l.push([b, b + 1], [b + 1, b + 2], [b + 3, b + 4]); b += 5
    l.push([b, b + 1], [b + 1, b + 2], [b + 2, b + 3]); b += 5
    return l
})()

/* ═══════════════════════════════════════ */
/* ─── 3D Components ─── */
/* ═══════════════════════════════════════ */

function DeepStars({ progress }) {
    const ref1 = useRef(), ref2 = useRef(), ref3 = useRef()
    const bright = useMemo(() => {
        const n = 5000, pos = new Float32Array(n * 3), cols = new Float32Array(n * 3)
        for (let i = 0; i < n; i++) {
            const t = Math.random() * Math.PI * 2, p = Math.acos(2 * Math.random() - 1), r = 130 + Math.random() * 280
            pos[i * 3] = r * Math.sin(p) * Math.cos(t); pos[i * 3 + 1] = r * Math.sin(p) * Math.sin(t); pos[i * 3 + 2] = r * Math.cos(p)
            const w = Math.random()
            if (w < 0.3) { cols[i * 3] = 0.7; cols[i * 3 + 1] = 0.8; cols[i * 3 + 2] = 1 }
            else if (w < 0.6) { cols[i * 3] = 1; cols[i * 3 + 1] = 0.95; cols[i * 3 + 2] = 0.85 }
            else { cols[i * 3] = 1; cols[i * 3 + 1] = 0.88; cols[i * 3 + 2] = 0.65 }
        }
        return { positions: pos, colors: cols }
    }, [])
    const dim = useMemo(() => {
        const n = 4000, pos = new Float32Array(n * 3)
        for (let i = 0; i < n; i++) {
            const t = Math.random() * Math.PI * 2, p = Math.acos(2 * Math.random() - 1), r = 250 + Math.random() * 250
            pos[i * 3] = r * Math.sin(p) * Math.cos(t); pos[i * 3 + 1] = r * Math.sin(p) * Math.sin(t); pos[i * 3 + 2] = r * Math.cos(p)
        }
        return pos
    }, [])
    const clusters = useMemo(() => {
        const n = 800, pos = new Float32Array(n * 3)
        for (let i = 0; i < n; i++) {
            const cx = (Math.random() - 0.5) * 300, cy = (Math.random() - 0.5) * 200, cz = -100 - Math.random() * 200
            pos[i * 3] = cx + (Math.random() - 0.5) * 20; pos[i * 3 + 1] = cy + (Math.random() - 0.5) * 15; pos[i * 3 + 2] = cz + (Math.random() - 0.5) * 20
        }
        return pos
    }, [])

    useFrame((s) => {
        const p = progress.current, flash = p > 0.60 && p < 0.70
        if (ref1.current) { ref1.current.material.opacity = flash ? 0.25 : 0.9; ref1.current.material.size = 0.12 + Math.sin(s.clock.elapsedTime * 0.3) * 0.01 }
        if (ref2.current) ref2.current.material.opacity = flash ? 0.1 : 0.3
        if (ref3.current) ref3.current.material.opacity = flash ? 0.05 : 0.15
    })

    return (<>
        <points ref={ref1}><bufferGeometry><bufferAttribute attach="attributes-position" count={5000} array={bright.positions} itemSize={3} /><bufferAttribute attach="attributes-color" count={5000} array={bright.colors} itemSize={3} /></bufferGeometry><pointsMaterial map={glowSprite} size={0.12} transparent opacity={0.9} vertexColors sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} /></points>
        <points ref={ref2}><bufferGeometry><bufferAttribute attach="attributes-position" count={4000} array={dim} itemSize={3} /></bufferGeometry><pointsMaterial map={glowSprite} size={0.04} transparent opacity={0.3} color="#aabbee" sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} /></points>
        <points ref={ref3}><bufferGeometry><bufferAttribute attach="attributes-position" count={800} array={clusters} itemSize={3} /></bufferGeometry><pointsMaterial map={glowSprite} size={0.08} transparent opacity={0.15} color="#ddeeff" sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} /></points>
    </>)
}

function ReverseEarth({ progress }) {
    const ref = useRef(), atmosRef = useRef()
    const dayTex = useLoader(THREE.TextureLoader, '/textures/earth/earth_day.jpg')
    useFrame((s) => {
        if (!ref.current) return
        const p = progress.current, vis = p > 0.02 && p < 0.28
        ref.current.visible = vis; if (atmosRef.current) atmosRef.current.visible = vis
        if (!vis) return
        const sub = (p - 0.02) / 0.26, scale = Math.max(0.01, 1 - sub * 0.97)
        ref.current.scale.setScalar(scale); if (atmosRef.current) atmosRef.current.scale.setScalar(scale)
        ref.current.rotation.y = s.clock.elapsedTime * 0.008; ref.current.material.opacity = Math.max(0, 1 - sub * 1.5)
    })
    return (<group position={[0, -12, -25]}>
        <mesh ref={ref}><sphereGeometry args={[8, 64, 64]} /><meshStandardMaterial map={dayTex} transparent roughness={0.8} /></mesh>
        <mesh ref={atmosRef}><sphereGeometry args={[8.5, 32, 32]} /><meshBasicMaterial color="#4488ff" transparent opacity={0.12} side={THREE.BackSide} depthWrite={false} /></mesh>
    </group>)
}

function CityLights({ progress }) {
    const ref = useRef()
    const count = 500
    const data = useMemo(() => {
        const pos = new Float32Array(count * 3), cols = new Float32Array(count * 3)
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2, r = Math.random() * 35
            pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = -5 - Math.random() * 4; pos[i * 3 + 2] = Math.sin(a) * r - 10
            const w = Math.random(); cols[i * 3] = 1; cols[i * 3 + 1] = 0.65 + w * 0.35; cols[i * 3 + 2] = 0.2 + w * 0.5
        }
        return { positions: pos, colors: cols }
    }, [])
    useFrame(() => { if (!ref.current) return; const p = progress.current; ref.current.visible = p < 0.10; if (p < 0.10) ref.current.material.opacity = Math.max(0, 1 - p / 0.10) })
    return (<points ref={ref}><bufferGeometry><bufferAttribute attach="attributes-position" count={count} array={data.positions} itemSize={3} /><bufferAttribute attach="attributes-color" count={count} array={data.colors} itemSize={3} /></bufferGeometry><pointsMaterial map={glowSprite} size={0.2} transparent opacity={1} vertexColors sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} /></points>)
}

/* GLSL Procedural Nebula — volumetric-looking gas clouds */
function ProceduralNebula({ progress }) {
    const ref = useRef(), ref2 = useRef()
    const uniforms = useMemo(() => ({ uTime: { value: 0 }, uIntensity: { value: 0 }, uCompress: { value: 0 } }), [])
    const uniforms2 = useMemo(() => ({ uTime: { value: 0 }, uIntensity: { value: 0 }, uCompress: { value: 0 } }), [])

    const ref3 = useRef(), ref4 = useRef()
    const uniforms3 = useMemo(() => ({ uTime: { value: 0 }, uIntensity: { value: 0 }, uCompress: { value: 0 } }), [])
    const uniforms4 = useMemo(() => ({ uTime: { value: 0 }, uIntensity: { value: 0 }, uCompress: { value: 0 } }), [])

    useFrame((s) => {
        const p = progress.current, t = s.clock.elapsedTime
        const vis = p > 0.26 && p < 0.66
        const inten = p < 0.35 ? (p - 0.26) / 0.09 : p > 0.58 ? Math.max(0, 1 - (p - 0.58) / 0.08) : 1
        const comp = p > 0.48 ? Math.min(1, (p - 0.48) / 0.12) : 0
        if (ref.current) {
            ref.current.visible = vis
            if (vis) { uniforms.uTime.value = t; uniforms.uIntensity.value = inten; uniforms.uCompress.value = comp }
        }
        if (ref2.current) {
            ref2.current.visible = vis
            if (vis) { uniforms2.uTime.value = t + 50; uniforms2.uIntensity.value = inten * 0.6; uniforms2.uCompress.value = comp; ref2.current.rotation.z = t * 0.005 }
        }
        // Ambient wisps visible in deep space
        const wispVis = p > 0.15 && p < 0.70
        if (ref3.current) {
            ref3.current.visible = wispVis
            if (wispVis) { uniforms3.uTime.value = t + 100; uniforms3.uIntensity.value = Math.min(0.3, (p - 0.15) / 0.1 * 0.3); uniforms3.uCompress.value = 0 }
        }
        if (ref4.current) {
            ref4.current.visible = wispVis
            if (wispVis) { uniforms4.uTime.value = t + 200; uniforms4.uIntensity.value = Math.min(0.25, (p - 0.15) / 0.1 * 0.25); uniforms4.uCompress.value = 0 }
        }
    })

    return (<>
        <mesh ref={ref} position={NEB}><planeGeometry args={[120, 120]} /><shaderMaterial vertexShader={nebulaVS} fragmentShader={nebulaFS} uniforms={uniforms} transparent blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} /></mesh>
        <mesh ref={ref2} position={[NEB.x + 8, NEB.y - 5, NEB.z - 18]} rotation={[0.2, 0.3, 0.4]}><planeGeometry args={[80, 80]} /><shaderMaterial vertexShader={nebulaVS} fragmentShader={nebulaFS} uniforms={uniforms2} transparent blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} /></mesh>
        {/* Ambient deep space wisps */}
        <mesh ref={ref3} position={[60, 30, -120]} rotation={[0.5, 0.8, 0]}><planeGeometry args={[50, 50]} /><shaderMaterial vertexShader={nebulaVS} fragmentShader={nebulaFS} uniforms={uniforms3} transparent blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} /></mesh>
        <mesh ref={ref4} position={[-50, -20, -80]} rotation={[0.3, -0.6, 0.2]}><planeGeometry args={[40, 40]} /><shaderMaterial vertexShader={nebulaVS} fragmentShader={nebulaFS} uniforms={uniforms4} transparent blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} /></mesh>
    </>)
}

/* Gas particles around nebula for depth */
function NebulaParticles({ progress }) {
    const ref = useRef()
    const count = 1500
    const data = useMemo(() => {
        const pos = new Float32Array(count * 3), cols = new Float32Array(count * 3), orig = new Float32Array(count * 3), seeds = new Float32Array(count)
        for (let i = 0; i < count; i++) {
            const t = Math.random() * Math.PI * 2, p = Math.acos(2 * Math.random() - 1), r = 3 + Math.pow(Math.random(), 0.6) * 38
            const x = NEB.x + r * Math.sin(p) * Math.cos(t), y = NEB.y + r * Math.sin(p) * Math.sin(t), z = NEB.z + r * Math.cos(p)
            pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; orig[i * 3] = x; orig[i * 3 + 1] = y; orig[i * 3 + 2] = z
            seeds[i] = Math.random() * Math.PI * 2
            const c = Math.random()
            if (c < 0.25) { cols[i * 3] = 0.5; cols[i * 3 + 1] = 0.15; cols[i * 3 + 2] = 0.75 }
            else if (c < 0.5) { cols[i * 3] = 0.15; cols[i * 3 + 1] = 0.3; cols[i * 3 + 2] = 0.8 }
            else if (c < 0.75) { cols[i * 3] = 0.9; cols[i * 3 + 1] = 0.65; cols[i * 3 + 2] = 0.15 }
            else { cols[i * 3] = 0.85; cols[i * 3 + 1] = 0.3; cols[i * 3 + 2] = 0.5 }
        }
        return { positions: pos, colors: cols, origPos: orig, seeds }
    }, [])

    useFrame((s) => {
        if (!ref.current) return
        const p = progress.current, t = s.clock.elapsedTime
        const vis = p > 0.28 && p < 0.65; ref.current.visible = vis; if (!vis) return
        const fadeIn = Math.min(1, (p - 0.28) / 0.08), compress = p > 0.48 ? Math.min(1, (p - 0.48) / 0.12) : 0
        ref.current.material.opacity = fadeIn * 0.3 * (1 - compress * 0.6)
        ref.current.material.size = 2.0 - compress * 1.3
        const arr = ref.current.geometry.attributes.position.array, orig = data.origPos
        for (let i = 0; i < count; i++) {
            const i3 = i * 3
            const cx = orig[i3] + (NEB.x - orig[i3]) * compress * 0.9
            const cy = orig[i3 + 1] + (NEB.y - orig[i3 + 1]) * compress * 0.9
            const cz = orig[i3 + 2] + (NEB.z - orig[i3 + 2]) * compress * 0.9
            const sa = compress * Math.PI * 6 + data.seeds[i], sr = (1 - compress) * 1.5
            arr[i3] = cx + Math.cos(sa) * sr + Math.sin(t * 0.12 + data.seeds[i]) * 0.25
            arr[i3 + 1] = cy + Math.sin(sa) * sr + Math.cos(t * 0.1 + i * 0.01) * 0.15
            arr[i3 + 2] = cz + Math.sin(t * 0.08 + data.seeds[i] + 1) * 0.15
        }
        ref.current.geometry.attributes.position.needsUpdate = true
    })

    return (<points ref={ref} visible={false}><bufferGeometry><bufferAttribute attach="attributes-position" count={count} array={data.positions} itemSize={3} /><bufferAttribute attach="attributes-color" count={count} array={data.colors} itemSize={3} /></bufferGeometry><pointsMaterial map={glowSprite} size={2.0} transparent opacity={0} vertexColors sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} /></points>)
}

function CosmicDust({ progress }) {
    const ref = useRef(); const { camera } = useThree(); const count = 600
    const data = useMemo(() => {
        const pos = new Float32Array(count * 3), cols = new Float32Array(count * 3)
        for (let i = 0; i < count; i++) {
            pos[i * 3] = (Math.random() - 0.5) * 100; pos[i * 3 + 1] = (Math.random() - 0.5) * 100; pos[i * 3 + 2] = (Math.random() - 0.5) * 100
            cols[i * 3] = 0.55 + Math.random() * 0.3; cols[i * 3 + 1] = 0.5 + Math.random() * 0.25; cols[i * 3 + 2] = 0.65 + Math.random() * 0.3
        }
        return { positions: pos, colors: cols }
    }, [])
    useFrame(() => {
        if (!ref.current) return; const p = progress.current; const vis = p > 0.08 && p < 0.50
        ref.current.visible = vis; if (!vis) return; ref.current.material.opacity = 0.35
        const arr = ref.current.geometry.attributes.position.array, cz = camera.position.z
        for (let i = 0; i < count; i++) { arr[i * 3 + 2] += 0.5; if (arr[i * 3 + 2] > cz + 50) { arr[i * 3] = camera.position.x + (Math.random() - 0.5) * 100; arr[i * 3 + 1] = camera.position.y + (Math.random() - 0.5) * 100; arr[i * 3 + 2] = cz - 50 - Math.random() * 40 } }
        ref.current.geometry.attributes.position.needsUpdate = true
    })
    return (<points ref={ref} visible={false}><bufferGeometry><bufferAttribute attach="attributes-position" count={count} array={data.positions} itemSize={3} /><bufferAttribute attach="attributes-color" count={count} array={data.colors} itemSize={3} /></bufferGeometry><pointsMaterial map={glowSprite} size={0.05} transparent opacity={0} vertexColors sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} /></points>)
}

function SupernovaFlash({ progress }) {
    const flashRef = useRef(), burstRef = useRef(); const { camera } = useThree()
    const burstCount = 800
    const burstData = useMemo(() => {
        const pos = new Float32Array(burstCount * 3), cols = new Float32Array(burstCount * 3), vel = new Float32Array(burstCount * 3)
        for (let i = 0; i < burstCount; i++) {
            pos[i * 3] = NEB.x; pos[i * 3 + 1] = NEB.y; pos[i * 3 + 2] = NEB.z
            const t = Math.random() * Math.PI * 2, p = Math.acos(2 * Math.random() - 1), s = 0.5 + Math.random() * 2.5
            vel[i * 3] = s * Math.sin(p) * Math.cos(t); vel[i * 3 + 1] = s * Math.sin(p) * Math.sin(t); vel[i * 3 + 2] = s * Math.cos(p)
            const c = Math.random(); if (c < 0.4) { cols[i * 3] = 1; cols[i * 3 + 1] = 0.95; cols[i * 3 + 2] = 0.8 } else if (c < 0.7) { cols[i * 3] = 1; cols[i * 3 + 1] = 0.75; cols[i * 3 + 2] = 0.35 } else { cols[i * 3] = 0.8; cols[i * 3 + 1] = 0.85; cols[i * 3 + 2] = 1 }
        }
        return { positions: pos, colors: cols, velocities: vel }
    }, [])

    useFrame(() => {
        const p = progress.current
        if (flashRef.current) {
            let f = 0; if (p > 0.60 && p < 0.72) { const s = (p - 0.60) / 0.12; f = s < 0.2 ? s / 0.2 : Math.max(0, 1 - (s - 0.2) / 0.8) }
            flashRef.current.material.opacity = f * 0.97; flashRef.current.position.copy(camera.position)
            const fw = new THREE.Vector3(0, 0, -1.5).applyQuaternion(camera.quaternion); flashRef.current.position.add(fw); flashRef.current.quaternion.copy(camera.quaternion)
        }
        if (burstRef.current) {
            const vis = p > 0.62 && p < 0.78; burstRef.current.visible = vis; if (vis) {
                const s = (p - 0.62) / 0.16
                burstRef.current.material.opacity = Math.max(0, 0.85 - s * 0.85); burstRef.current.material.size = 0.12 + s * 0.6
                const arr = burstRef.current.geometry.attributes.position.array, v = burstData.velocities
                for (let i = 0; i < burstCount; i++) { arr[i * 3] += v[i * 3] * 0.9; arr[i * 3 + 1] += v[i * 3 + 1] * 0.9; arr[i * 3 + 2] += v[i * 3 + 2] * 0.9 }
                burstRef.current.geometry.attributes.position.needsUpdate = true
            }
        }
    })

    return (<><mesh ref={flashRef} renderOrder={998}><planeGeometry args={[80, 60]} /><meshBasicMaterial color="#fffbee" transparent opacity={0} depthTest={false} depthWrite={false} /></mesh>
        <points ref={burstRef} visible={false}><bufferGeometry><bufferAttribute attach="attributes-position" count={burstCount} array={burstData.positions} itemSize={3} /><bufferAttribute attach="attributes-color" count={burstCount} array={burstData.colors} itemSize={3} /></bufferGeometry><pointsMaterial map={glowSprite} size={0.12} transparent opacity={0} vertexColors sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} /></points></>)
}

function NewStar({ progress }) {
    const core = useRef(), glow = useRef(), outer = useRef()
    useFrame((s) => {
        const p = progress.current, t = s.clock.elapsedTime, vis = p > 0.68, fi = vis ? Math.min(1, (p - 0.68) / 0.08) : 0, pulse = 0.85 + 0.15 * Math.sin(t * 2.5)
        if (core.current) { core.current.visible = vis; core.current.material.opacity = fi; core.current.scale.setScalar(fi * 0.6 * pulse) }
        if (glow.current) { glow.current.visible = vis; glow.current.material.opacity = fi * 0.5; glow.current.scale.setScalar(fi * (3 + Math.sin(t * 1.5) * 0.5)); glow.current.rotation.z = t * 0.03 }
        if (outer.current) { outer.current.visible = vis; outer.current.material.opacity = fi * 0.15; outer.current.scale.setScalar(fi * (7 + Math.sin(t * 0.8) * 1.2)) }
    })
    return (<group position={NEB}>
        <sprite ref={core} visible={false}><spriteMaterial map={starSprite} transparent blending={THREE.AdditiveBlending} depthWrite={false} color="#fffef0" /></sprite>
        <sprite ref={glow} visible={false}><spriteMaterial map={starSprite} transparent blending={THREE.AdditiveBlending} depthWrite={false} color="#ffe8cc" /></sprite>
        <sprite ref={outer} visible={false}><spriteMaterial map={glowSprite} transparent blending={THREE.AdditiveBlending} depthWrite={false} color="#ffeedd" /></sprite>
    </group>)
}

/* Photo-based constellation — loads actual photo, does edge detection, uses 5000 stars */
function SilhouetteConstellation({ progress }) {
    const groupRef = useRef(), edgeRef = useRef(), fillRef = useRef(), haloRef = useRef()
    const [photoData, setPhotoData] = useState(null)

    // Load photo and process at mount
    useEffect(() => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
            const result = processPhotoToStars(img)
            setPhotoData(result)
        }
        img.src = PHOTO_SRC
    }, [])

    // Edge stars — bright points tracing her features
    const edgeCount = photoData ? photoData.edgeStars.length : 0
    const edgeBuffers = useMemo(() => {
        if (!photoData) return null
        const n = photoData.edgeStars.length
        const pos = new Float32Array(n * 3), cols = new Float32Array(n * 3)
        for (let i = 0; i < n; i++) {
            // Start scattered
            pos[i * 3] = (Math.random() - 0.5) * 80
            pos[i * 3 + 1] = (Math.random() - 0.5) * 60
            pos[i * 3 + 2] = (Math.random() - 0.5) * 25
            const b = photoData.edgeStars[i][2]
            cols[i * 3] = 0.85 + b * 0.15; cols[i * 3 + 1] = 0.82 + b * 0.15; cols[i * 3 + 2] = 0.7 + b * 0.25
        }
        return { positions: pos, colors: cols }
    }, [photoData])

    // Fill stars — dimmer interior
    const fillCount = photoData ? photoData.fillStars.length : 0
    const fillBuffers = useMemo(() => {
        if (!photoData) return null
        const n = photoData.fillStars.length
        const pos = new Float32Array(n * 3), cols = new Float32Array(n * 3)
        for (let i = 0; i < n; i++) {
            pos[i * 3] = (Math.random() - 0.5) * 70
            pos[i * 3 + 1] = (Math.random() - 0.5) * 50
            pos[i * 3 + 2] = (Math.random() - 0.5) * 20
            const b = photoData.fillStars[i][2]
            cols[i * 3] = 0.75 + b * 0.2; cols[i * 3 + 1] = 0.72 + b * 0.18; cols[i * 3 + 2] = 0.6 + b * 0.3
        }
        return { positions: pos, colors: cols }
    }, [photoData])

    // Target positions from photo pixels
    const edgeTargets = useMemo(() => {
        if (!photoData) return []
        return photoData.edgeStars.map(([x, y]) => new THREE.Vector3(x, y, (Math.random() - 0.5) * 0.5))
    }, [photoData])
    const fillTargets = useMemo(() => {
        if (!photoData) return []
        return photoData.fillStars.map(([x, y]) => new THREE.Vector3(x, y, (Math.random() - 0.5) * 0.8))
    }, [photoData])

    useFrame((s) => {
        if (!groupRef.current || !photoData || !edgeRef.current) return
        const p = progress.current, t = s.clock.elapsedTime
        const vis = p > 0.72; groupRef.current.visible = vis; if (!vis) return
        const formT = Math.min(1, Math.max(0, (p - 0.72) / 0.14))
        const formS = formT * formT * (3 - 2 * formT)

        // Edge stars converge to photo positions
        const ea = edgeRef.current.geometry.attributes.position.array
        for (let i = 0; i < edgeCount; i++) {
            const i3 = i * 3
            const delay = (i / edgeCount) * 0.4, indF = Math.min(1, Math.max(0, (formS - delay) / (1 - delay + 0.001)))
            const lr = indF * 0.08
            ea[i3] += (edgeTargets[i].x - ea[i3]) * lr
            ea[i3 + 1] += (edgeTargets[i].y - ea[i3 + 1]) * lr
            ea[i3 + 2] += (edgeTargets[i].z - ea[i3 + 2]) * lr
            ea[i3] += Math.sin(t * 0.6 + i * 0.01) * 0.006; ea[i3 + 1] += Math.cos(t * 0.5 + i * 0.015) * 0.006
        }
        edgeRef.current.geometry.attributes.position.needsUpdate = true
        edgeRef.current.material.opacity = Math.min(1, formS * 1.5)
        edgeRef.current.material.size = 0.18 + Math.sin(t * 0.7) * 0.02

        // Fill stars converge slightly later
        if (fillRef.current && fillCount > 0) {
            const fa = fillRef.current.geometry.attributes.position.array
            const fFormS = Math.min(1, Math.max(0, formT - 0.1) / 0.9)
            for (let i = 0; i < fillCount; i++) {
                const i3 = i * 3
                const delay = (i / fillCount) * 0.5, indF = Math.min(1, Math.max(0, (fFormS - delay) / (1 - delay + 0.001)))
                const lr = indF * 0.06
                fa[i3] += (fillTargets[i].x - fa[i3]) * lr
                fa[i3 + 1] += (fillTargets[i].y - fa[i3 + 1]) * lr
                fa[i3 + 2] += (fillTargets[i].z - fa[i3 + 2]) * lr
                fa[i3] += Math.sin(t * 0.5 + i * 0.02) * 0.005; fa[i3 + 1] += Math.cos(t * 0.45 + i * 0.025) * 0.005
            }
            fillRef.current.geometry.attributes.position.needsUpdate = true
            fillRef.current.material.opacity = Math.min(0.5, fFormS * 0.7)
            fillRef.current.material.size = 0.12 + Math.sin(t * 0.8) * 0.015
        }

        // Halo glow behind edge stars
        if (haloRef.current) {
            const ha = haloRef.current.geometry.attributes.position.array
            // Only update every 5th star for halos (performance)
            for (let i = 0; i < edgeCount; i += 5) {
                const si = i / 5, si3 = si * 3, i3 = i * 3
                ha[si3] = ea[i3]; ha[si3 + 1] = ea[i3 + 1]; ha[si3 + 2] = ea[i3 + 2]
            }
            haloRef.current.geometry.attributes.position.needsUpdate = true
            haloRef.current.material.opacity = Math.min(0.15, formS * 0.2)
            haloRef.current.material.size = 0.8 + Math.sin(t * 0.5) * 0.1
        }

        if (p > 0.90) groupRef.current.rotation.y = (p - 0.90) * Math.PI * 0.12
    })

    if (!photoData || !edgeBuffers) return null
    const haloCount = Math.ceil(edgeCount / 5)

    return (<group ref={groupRef} position={NEB} visible={false}>
        <points ref={edgeRef}><bufferGeometry><bufferAttribute attach="attributes-position" count={edgeCount} array={edgeBuffers.positions} itemSize={3} /><bufferAttribute attach="attributes-color" count={edgeCount} array={edgeBuffers.colors} itemSize={3} /></bufferGeometry><pointsMaterial map={starSprite} size={0.18} transparent opacity={0} vertexColors sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} /></points>
        {fillBuffers && <points ref={fillRef}><bufferGeometry><bufferAttribute attach="attributes-position" count={fillCount} array={fillBuffers.positions} itemSize={3} /><bufferAttribute attach="attributes-color" count={fillCount} array={fillBuffers.colors} itemSize={3} /></bufferGeometry><pointsMaterial map={glowSprite} size={0.12} transparent opacity={0} vertexColors sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} /></points>}
        <points ref={haloRef}><bufferGeometry><bufferAttribute attach="attributes-position" count={haloCount} array={new Float32Array(haloCount * 3)} itemSize={3} /></bufferGeometry><pointsMaterial map={glowSprite} size={0.8} transparent opacity={0} color="#ffeedd" sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} /></points>
    </group>)
}

/* Name constellation — appears AFTER silhouette */
function NameConstellation({ progress }) {
    const groupRef = useRef(), starsRef = useRef(), haloRef = useRef(), linesRef = useRef()
    const nameCount = NAME_STARS.length, sc = 2.6

    const starData = useMemo(() => {
        const pos = new Float32Array(nameCount * 3), cols = new Float32Array(nameCount * 3)
        for (let i = 0; i < nameCount; i++) {
            pos[i * 3] = (Math.random() - 0.5) * 40; pos[i * 3 + 1] = -15 + (Math.random() - 0.5) * 10; pos[i * 3 + 2] = (Math.random() - 0.5) * 10
            const t = Math.random(); cols[i * 3] = 0.95 + t * 0.05; cols[i * 3 + 1] = 0.9 + t * 0.08; cols[i * 3 + 2] = 0.75 + t * 0.15
        }
        return { positions: pos, colors: cols }
    }, [])

    const targets = useMemo(() => NAME_STARS.map(([x, y]) => new THREE.Vector3(x * sc, (y - 0.9) * sc - 12, 0)), [])
    const linePos = useMemo(() => new Float32Array(NAME_LINES.length * 6), [])

    useFrame((s) => {
        if (!groupRef.current) return; const p = progress.current, t = s.clock.elapsedTime
        const vis = p > 0.84; groupRef.current.visible = vis; if (!vis) return
        const formT = Math.min(1, Math.max(0, (p - 0.84) / 0.08))
        const formS = formT * formT * (3 - 2 * formT)
        const arr = starsRef.current.geometry.attributes.position.array

        for (let i = 0; i < nameCount; i++) {
            const i3 = i * 3
            const delay = (i / nameCount) * 0.5, indF = Math.min(1, Math.max(0, (formS - delay) / (1 - delay + 0.01)))
            const lerp = indF * 0.12
            arr[i3] += (targets[i].x - arr[i3]) * lerp; arr[i3 + 1] += (targets[i].y - arr[i3 + 1]) * lerp; arr[i3 + 2] += (targets[i].z - arr[i3 + 2]) * lerp
            arr[i3] += Math.sin(t * 1.3 + i * 0.3) * 0.012; arr[i3 + 1] += Math.cos(t * 1.1 + i * 0.5) * 0.012
        }
        starsRef.current.geometry.attributes.position.needsUpdate = true
        starsRef.current.material.opacity = Math.min(1, formS * 1.4)
        starsRef.current.material.size = 0.55 + Math.sin(t * 0.9) * 0.05

        if (haloRef.current) {
            const ha = haloRef.current.geometry.attributes.position.array
            for (let i = 0; i < nameCount; i++) { ha[i * 3] = arr[i * 3]; ha[i * 3 + 1] = arr[i * 3 + 1]; ha[i * 3 + 2] = arr[i * 3 + 2] }
            haloRef.current.geometry.attributes.position.needsUpdate = true; haloRef.current.material.opacity = Math.min(0.25, formS * 0.35)
            haloRef.current.material.size = 2.0 + Math.sin(t * 0.7) * 0.15
        }

        const lineProg = formS > 0.3 ? Math.min(1, (formS - 0.3) * 1.5) : 0
        linesRef.current.material.opacity = lineProg * 0.4
        const la = linesRef.current.geometry.attributes.position.array
        for (let i = 0; i < NAME_LINES.length; i++) {
            const i6 = i * 6, ld = i / NAME_LINES.length
            if (lineProg > ld) {
                const [f, t2] = NAME_LINES[i]
                la[i6] = arr[f * 3]; la[i6 + 1] = arr[f * 3 + 1]; la[i6 + 2] = arr[f * 3 + 2]; la[i6 + 3] = arr[t2 * 3]; la[i6 + 4] = arr[t2 * 3 + 1]; la[i6 + 5] = arr[t2 * 3 + 2]
            }
            else { la[i6] = 0; la[i6 + 1] = 0; la[i6 + 2] = 0; la[i6 + 3] = 0; la[i6 + 4] = 0; la[i6 + 5] = 0 }
        }
        linesRef.current.geometry.attributes.position.needsUpdate = true

        if (p > 0.90) groupRef.current.rotation.y = (p - 0.90) * Math.PI * 0.15
    })

    return (<group ref={groupRef} position={NEB} visible={false}>
        <points ref={starsRef}><bufferGeometry><bufferAttribute attach="attributes-position" count={nameCount} array={starData.positions} itemSize={3} /><bufferAttribute attach="attributes-color" count={nameCount} array={starData.colors} itemSize={3} /></bufferGeometry><pointsMaterial map={starSprite} size={0.55} transparent opacity={0} vertexColors sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} /></points>
        <points ref={haloRef}><bufferGeometry><bufferAttribute attach="attributes-position" count={nameCount} array={new Float32Array(nameCount * 3)} itemSize={3} /></bufferGeometry><pointsMaterial map={glowSprite} size={2.0} transparent opacity={0} color="#ffeedd" sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} /></points>
        <lineSegments ref={linesRef}><bufferGeometry><bufferAttribute attach="attributes-position" count={NAME_LINES.length * 2} array={linePos} itemSize={3} /></bufferGeometry><lineBasicMaterial color="#ccddff" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} /></lineSegments>
    </group>)
}

function ProgressSync({ progress, onProgress }) {
    const prev = useRef(0); useFrame(() => { const p = progress.current; if (Math.abs(p - prev.current) > 0.002) { prev.current = p; onProgress(p) } }); return null
}

function NovaFlightController({ progress, onComplete }) {
    const { camera } = useThree(); const startTime = useRef(null), completed = useRef(false)
    useFrame((s) => {
        if (startTime.current === null) startTime.current = s.clock.elapsedTime
        const elapsed = s.clock.elapsedTime - startTime.current, t = s.clock.elapsedTime
        let p = Math.min(1, elapsed / FLIGHT_DURATION)
        const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2
        progress.current = ease

        if (ease < 0.20) {
            // Reverse ascent — no initial pause, start immediately
            const sub = ease / 0.20, s2 = sub * sub * (3 - 2 * sub)
            camera.position.set(Math.sin(t * 0.1) * (1 - s2) * 1.5, 2 + s2 * 88, 5 + s2 * 35)
            camera.lookAt(0, s2 * 25, -s2 * 15)
        } else if (ease < 0.38) {
            // Deep space toward nebula
            const sub = (ease - 0.20) / 0.18, s2 = sub * sub * (3 - 2 * sub)
            camera.position.set(Math.sin(t * 0.07) * (2 - s2 * 1.8), 90 - s2 * 88 + Math.cos(t * 0.1) * 0.3, 40 - s2 * 142)
            camera.lookAt(0, 0, -200)
        } else if (ease < 0.52) {
            // Enter nebula
            const sub = (ease - 0.38) / 0.14, s2 = sub * sub * (3 - 2 * sub)
            camera.position.set(Math.sin(t * 0.06) * 3 * (1 - s2), 2 + Math.cos(t * 0.08) * 1.5 * (1 - s2), -102 - s2 * 65)
            camera.lookAt(0, 0, -200)
        } else if (ease < 0.62) {
            // Compression
            const sub = (ease - 0.52) / 0.10
            camera.position.set(Math.sin(t * 0.1) * (1 - sub) * 1.2, Math.cos(t * 0.08) * (1 - sub) * 0.8, -167 - sub * 13)
            camera.lookAt(0, 0, -200)
        } else if (ease < 0.72) {
            // Supernova flash
            camera.position.set(Math.sin(t * 0.03) * 0.3, Math.cos(t * 0.025) * 0.2, -178)
            camera.lookAt(0, 0, -200)
        } else if (ease < 0.92) {
            // Constellation forming — slow pullback
            const sub = (ease - 0.72) / 0.20, s2 = sub * sub * (3 - 2 * sub)
            camera.position.set(Math.sin(t * 0.035) * 2, Math.cos(t * 0.03) * 1, -178 + s2 * 14)
            camera.lookAt(0, 0, -200)
        } else {
            // Final orbit
            const sub = (ease - 0.92) / 0.08, angle = sub * Math.PI * 0.2
            camera.position.set(Math.sin(angle) * 26, Math.cos(t * 0.04) * 1.5, -200 + Math.cos(angle) * 26)
            camera.lookAt(0, 0, -200)
        }
        if (p >= 1 && !completed.current) { completed.current = true; onComplete() }
    }); return null
}

function BackgroundShift({ progress }) {
    const { scene } = useThree()
    useFrame(() => {
        const p = progress.current
        if (p > 0.28 && p < 0.62) { const s = Math.min(1, (p - 0.28) / 0.08); scene.background = new THREE.Color(s * 0.012, s * 0.006, s * 0.035) }
        else if (p >= 0.62 && p < 0.72) scene.background = new THREE.Color(0.003, 0.001, 0.01)
        else scene.background = new THREE.Color(0.001, 0.001, 0.005)
    }); return null
}

function NovaScene({ progress, onComplete, onProgress }) {
    const starLightRef = useRef()
    useFrame(() => { if (starLightRef.current) { const p = progress.current; starLightRef.current.intensity = p > 0.68 ? Math.min(5, (p - 0.68) / 0.08 * 5) : 0 } })
    return (<>
        <ambientLight intensity={0.1} />
        <pointLight ref={starLightRef} position={NEB} intensity={0} color="#fffbe8" distance={120} />
        <directionalLight position={[20, 15, 30]} intensity={0.25} color="#eef" />
        <NovaFlightController progress={progress} onComplete={onComplete} />
        <ProgressSync progress={progress} onProgress={onProgress} />
        <BackgroundShift progress={progress} />
        <DeepStars progress={progress} />
        <CityLights progress={progress} />
        <ReverseEarth progress={progress} />
        <CosmicDust progress={progress} />
        <ProceduralNebula progress={progress} />
        <NebulaParticles progress={progress} />
        <SupernovaFlash progress={progress} />
        <NewStar progress={progress} />
        <SilhouetteConstellation progress={progress} />
        <NameConstellation progress={progress} />
    </>)
}

/* ═══════════════════════════════════════ */
export default function SupernovaBirth({ onRestart }) {
    const [flightDone, setFlightDone] = useState(false)
    const [showFinal, setShowFinal] = useState(false)
    const progressRef = useRef(0)
    const [, setLP] = useState(0)
    const handleProgress = useCallback((p) => { setLP(p) }, [])
    const handleFlightComplete = useCallback(() => { setFlightDone(true); setTimeout(() => setShowFinal(true), 1200) }, [])

    return (
        <div className="portal-journey-container">
            <Canvas camera={{ position: [0, 2, 5], fov: 60, near: 0.1, far: 600 }} dpr={[1, 1.5]}
                gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', stencil: false, depth: true }}
                style={{ opacity: flightDone ? 0.6 : 1, transition: 'opacity 2.5s ease' }}>
                <color attach="background" args={['#000004']} />
                <NovaScene progress={progressRef} onComplete={handleFlightComplete} onProgress={handleProgress} />
            </Canvas>

            <AnimatePresence>
                {showFinal && (<motion.div className="earth-dive-final" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 2.5 }}>
                    <div className="earth-dive-final-content">
                        <motion.p className="earth-dive-address" style={{ fontSize: '1.5rem' }} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.5, delay: 0.5 }}>Наша любовь зажгла новую звезду</motion.p>
                        <motion.p className="earth-dive-subtitle" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.2, delay: 2.5 }}>и теперь она будет светить вечно</motion.p>
                        <motion.p className="earth-dive-subtitle" style={{ marginTop: '1rem' }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.2, delay: 4 }}>Созвездие Алтынай ✨</motion.p>
                        <motion.p className="earth-dive-heart" initial={{ opacity: 0, scale: 0.3 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1, delay: 5.5, type: 'spring', stiffness: 100 }}>💫</motion.p>
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 7 }}><button className="planet-button earth-dive-restart" onClick={onRestart}>Сначала</button></motion.div>
                    </div>
                </motion.div>)}
            </AnimatePresence>
        </div>
    )
}
