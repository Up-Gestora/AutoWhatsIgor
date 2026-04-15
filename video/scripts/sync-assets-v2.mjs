import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const videoRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(videoRoot, '..')

const srcUiDir = path.join(repoRoot, 'docs', 'ads-assets', 'v2', 'ui')
const srcUiCropsDir = path.join(srcUiDir, 'crops')
const srcUiManifest = path.join(srcUiDir, 'manifest.json')

const srcBrollImagesDir = path.join(repoRoot, 'docs', 'ads-assets', 'v2', 'broll', 'images')
const srcBrollVideosDir = path.join(repoRoot, 'docs', 'ads-assets', 'v2', 'broll', 'videos')

const dstUiDir = path.join(videoRoot, 'public', 'ui')
const dstBrollImagesDir = path.join(videoRoot, 'public', 'broll', 'images')
const dstBrollVideosDir = path.join(videoRoot, 'public', 'broll', 'videos')

async function exists(p) {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function copyFile(src, dst) {
  await fs.mkdir(path.dirname(dst), { recursive: true })
  await fs.copyFile(src, dst)
}

async function main() {
  const requiredUi = [
    'signup.png',
    'conexoes-gerar-qr.png',
    'conexoes-qr-masked.png',
    'ia-global-on.png',
    'treinamento-modelo.png'
    // 'conectado-masked.png' is optional (requires WAIT_FOR_SCAN=1)
  ]

  const available = []

  if (!(await exists(srcUiCropsDir))) {
    throw new Error(
      `UI crops not found: ${srcUiCropsDir}. Run: node scripts/generate-ads-assets-v2.mjs (repo root)`
    )
  }

  for (const f of requiredUi) {
    const p = path.join(srcUiCropsDir, f)
    if (!(await exists(p))) throw new Error(`Missing required UI crop: ${p}`)
  }

  await fs.mkdir(dstUiDir, { recursive: true })
  for (const f of requiredUi) {
    // eslint-disable-next-line no-await-in-loop
    await copyFile(path.join(srcUiCropsDir, f), path.join(dstUiDir, f))
    available.push(`ui/${f}`)
  }

  // Optional UI crops used by the horizontal VSL composition.
  const optionalUi = ['crm-leads.png', 'followup-modal.png']
  for (const f of optionalUi) {
    const p = path.join(srcUiCropsDir, f)
    // eslint-disable-next-line no-await-in-loop
    if (await exists(p)) {
      // eslint-disable-next-line no-await-in-loop
      await copyFile(p, path.join(dstUiDir, f))
      available.push(`ui/${f}`)
    }
  }

  // Optional connected state
  const connected = path.join(srcUiCropsDir, 'conectado-masked.png')
  if (await exists(connected)) {
    await copyFile(connected, path.join(dstUiDir, 'conectado-masked.png'))
    available.push('ui/conectado-masked.png')
  }

  if (await exists(srcUiManifest)) {
    await copyFile(srcUiManifest, path.join(dstUiDir, 'manifest.json'))
    available.push('ui/manifest.json')
  }

  // B-roll images (optional but recommended)
  if (await exists(srcBrollImagesDir)) {
    await fs.mkdir(dstBrollImagesDir, { recursive: true })
    const imgs = await fs.readdir(srcBrollImagesDir)
    for (const f of imgs) {
      if (!f.toLowerCase().endsWith('.png')) continue
      // eslint-disable-next-line no-await-in-loop
      await copyFile(path.join(srcBrollImagesDir, f), path.join(dstBrollImagesDir, f))
      available.push(`broll/images/${f}`)
    }
  }

  // B-roll videos (optional; prefer pro if present)
  if (await exists(srcBrollVideosDir)) {
    await fs.mkdir(dstBrollVideosDir, { recursive: true })
    const picks = [
      { base: 'broll-neon-waves', out: 'broll-neon-waves.mp4' },
      { base: 'broll-chat-float', out: 'broll-chat-float.mp4' },
      { base: 'broll-qr-scan', out: 'broll-qr-scan.mp4' },
      { base: 'broll-clock-loop', out: 'broll-clock-loop.mp4' }
    ]

    for (const p of picks) {
      const pro = path.join(srcBrollVideosDir, `${p.base}.sora-2-pro.mp4`)
      const draft = path.join(srcBrollVideosDir, `${p.base}.sora-2.mp4`)
      const src = (await exists(pro)) ? pro : (await exists(draft)) ? draft : null
      if (!src) continue
      // eslint-disable-next-line no-await-in-loop
      await copyFile(src, path.join(dstBrollVideosDir, p.out))
      available.push(`broll/videos/${p.out}`)
    }
  }

  // Emit an availability map to make renders robust if a given asset is missing.
  const availabilityPath = path.join(videoRoot, 'public', 'ads-v2-availability.json')
  await fs.writeFile(
    availabilityPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), available }, null, 2),
    'utf8'
  )

  // eslint-disable-next-line no-console
  console.log('OK. Assets V2 sincronizados para:', path.join(videoRoot, 'public'))
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exitCode = 1
})
