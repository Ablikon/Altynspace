import sharp from 'sharp'
import { readdir, mkdir } from 'fs/promises'
import { join, extname } from 'path'

const GALLERY_DIR = 'public/gallery'
const THUMBS_DIR = 'public/gallery/thumbs'
const FULL_DIR = 'public/gallery/full'

const THUMB_WIDTH = 400
const FULL_WIDTH = 1200
const WEBP_QUALITY = 82

async function run() {
  await mkdir(THUMBS_DIR, { recursive: true })
  await mkdir(FULL_DIR, { recursive: true })

  const files = (await readdir(GALLERY_DIR)).filter(f =>
    /\.(png|jpe?g)$/i.test(f)
  )

  console.log(`Found ${files.length} images to optimize`)

  let done = 0
  const concurrency = 4
  const queue = [...files]

  async function worker() {
    while (queue.length) {
      const file = queue.shift()
      const src = join(GALLERY_DIR, file)
      const base = file.replace(/\.(png|jpe?g)$/i, '')
      const outThumb = join(THUMBS_DIR, `${base}.webp`)
      const outFull = join(FULL_DIR, `${base}.webp`)

      try {
        const img = sharp(src)
        const meta = await img.metadata()

        await sharp(src)
          .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
          .webp({ quality: WEBP_QUALITY })
          .toFile(outThumb)

        const fullWidth = Math.min(FULL_WIDTH, meta.width || FULL_WIDTH)
        await sharp(src)
          .resize({ width: fullWidth, withoutEnlargement: true })
          .webp({ quality: WEBP_QUALITY })
          .toFile(outFull)

        done++
        if (done % 10 === 0 || done === files.length) {
          console.log(`  ${done}/${files.length}`)
        }
      } catch (err) {
        console.error(`  FAIL ${file}: ${err.message}`)
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  console.log('Done!')
}

run()
