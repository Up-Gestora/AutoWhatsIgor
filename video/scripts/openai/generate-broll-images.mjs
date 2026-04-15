import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadOpenAIKey } from './_env.mjs'
import { openaiFetchJson } from './_http.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const repoRoot = path.resolve(__dirname, '..', '..', '..')
const outDir = path.join(repoRoot, 'docs', 'ads-assets', 'v2', 'broll', 'images')

function b64ToBuffer(b64) {
  return Buffer.from(b64, 'base64')
}

async function writePng(filePath, pngBuffer) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, pngBuffer)
}

async function generateOne({ apiKey, model, prompt, size, quality, outName }) {
  const url = 'https://api.openai.com/v1/images/generations'
  const body = JSON.stringify({
    model,
    prompt,
    size,
    quality
  })

  const json = await openaiFetchJson(url, {
    apiKey,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  })

  const item = json?.data?.[0]
  if (!item) throw new Error('OpenAI images: empty response')

  if (item.b64_json) {
    const buf = b64ToBuffer(item.b64_json)
    await writePng(path.join(outDir, outName), buf)
    return
  }

  if (item.url) {
    const res = await fetch(item.url)
    if (!res.ok) throw new Error(`Failed to download image URL (status ${res.status})`)
    const ab = await res.arrayBuffer()
    await writePng(path.join(outDir, outName), Buffer.from(ab))
    return
  }

  throw new Error('OpenAI images: response did not include b64_json or url')
}

async function main() {
  const apiKey = await loadOpenAIKey()

  const model = process.env.IMAGE_MODEL || 'gpt-image-1'
  const quality = process.env.IMAGE_QUALITY || 'medium'

  const style =
    'dark premium, neon green and teal accents, subtle grain, soft studio lighting, high contrast, minimal, no text, no logos, no people'

  const jobs = [
    {
      outName: 'bg-abstract-01.png',
      size: '1024x1536',
      prompt: `${style}. Abstract gradient waves, cinematic, smooth shapes, depth, 9:16.`
    },
    {
      outName: 'bg-abstract-02.png',
      size: '1024x1536',
      prompt: `${style}. Abstract glassy blobs, green glow, dark background, elegant, 9:16.`
    },
    {
      outName: 'bg-abstract-03.png',
      size: '1024x1536',
      prompt: `${style}. Abstract grid + glow, tech feel, subtle scanlines, 9:16.`
    },
    {
      outName: 'icon-chat-3d.png',
      size: '1024x1024',
      prompt: `${style}. 3D minimal icon: chat bubbles with a lightning bolt, neon green accent, centered, plain dark background.`
    },
    {
      outName: 'icon-qr-3d.png',
      size: '1024x1024',
      prompt: `${style}. 3D minimal icon: QR tile (decorative, not scannable), neon green accent, centered, plain dark background.`
    },
    {
      outName: 'icon-clock-3d.png',
      size: '1024x1024',
      prompt: `${style}. 3D minimal icon: clock + calendar, neon green accent, centered, plain dark background.`
    }
  ]

  await fs.mkdir(outDir, { recursive: true })

  for (const j of jobs) {
    const outPath = path.join(outDir, j.outName)
    try {
      await fs.access(outPath)
      // eslint-disable-next-line no-console
      console.log('SKIP (exists):', outPath)
      continue
    } catch {
      // continue
    }

    // eslint-disable-next-line no-console
    console.log('GEN:', j.outName)
    // eslint-disable-next-line no-await-in-loop
    await generateOne({
      apiKey,
      model,
      prompt: j.prompt,
      size: j.size,
      quality,
      outName: j.outName
    })
  }

  // eslint-disable-next-line no-console
  console.log('OK. Images em:', outDir)
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exitCode = 1
})

