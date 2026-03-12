import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.resolve(__dirname, '../public/textures/earth')

const LAT = 43.32
const LON = 76.84
const GRID = 4
const TILE_SIZE = 256

const EARTH_TEXTURES = [
  { name: 'earth_day.jpg', url: 'https://www.solarsystemscope.com/textures/download/2k_earth_daymap.jpg' },
  { name: 'earth_clouds.jpg', url: 'https://www.solarsystemscope.com/textures/download/2k_earth_clouds.jpg' },
  { name: 'earth_night.jpg', url: 'https://www.solarsystemscope.com/textures/download/2k_earth_nightmap.jpg' },
]

const ZOOM_LEVELS = [5, 8, 11, 14, 16, 18]

function latLonToTile(lat, lon, z) {
  const x = Math.floor((lon + 180) / 360 * Math.pow(2, z))
  const latRad = lat * Math.PI / 180
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * Math.pow(2, z))
  return { x, y }
}

async function downloadFile(url, dest) {
  console.log(`  Downloading: ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(dest, buf)
  console.log(`  Saved: ${dest}`)
}

async function downloadEarthTextures() {
  console.log('\n=== Downloading Earth textures ===')
  for (const tex of EARTH_TEXTURES) {
    const dest = path.join(OUT_DIR, tex.name)
    if (fs.existsSync(dest)) {
      console.log(`  Skipping (exists): ${tex.name}`)
      continue
    }
    await downloadFile(tex.url, dest)
  }
}

async function compositeTiles(zoom) {
  console.log(`\n=== Zoom ${zoom} ===`)
  const dest = path.join(OUT_DIR, `zoom-${zoom}.jpg`)
  if (fs.existsSync(dest)) {
    console.log(`  Skipping (exists): zoom-${zoom}.jpg`)
    return
  }

  const center = latLonToTile(LAT, LON, zoom)
  const half = Math.floor(GRID / 2)
  const startX = center.x - half
  const startY = center.y - half

  const composites = []

  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const tx = startX + col
      const ty = startY + row
      const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${ty}/${tx}`

      console.log(`  Tile z=${zoom} x=${tx} y=${ty}`)
      const res = await fetch(url)
      if (!res.ok) {
        console.warn(`  WARNING: HTTP ${res.status} for tile ${zoom}/${ty}/${tx}, using blank`)
        composites.push({
          input: Buffer.alloc(TILE_SIZE * TILE_SIZE * 3, 20),
          raw: { width: TILE_SIZE, height: TILE_SIZE, channels: 3 },
          left: col * TILE_SIZE,
          top: row * TILE_SIZE,
        })
        continue
      }

      const buf = Buffer.from(await res.arrayBuffer())
      composites.push({
        input: buf,
        left: col * TILE_SIZE,
        top: row * TILE_SIZE,
      })
    }
  }

  const totalSize = GRID * TILE_SIZE
  await sharp({
    create: {
      width: totalSize,
      height: totalSize,
      channels: 3,
      background: { r: 20, g: 20, b: 30 },
    },
  })
    .composite(composites)
    .jpeg({ quality: 85 })
    .toFile(dest)

  console.log(`  Saved: ${dest}`)
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })

  await downloadEarthTextures()

  for (const z of ZOOM_LEVELS) {
    await compositeTiles(z)
  }

  console.log('\n=== Done! ===')
  console.log(`Files in ${OUT_DIR}:`)
  fs.readdirSync(OUT_DIR).forEach(f => console.log(`  ${f}`))
}

main().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
