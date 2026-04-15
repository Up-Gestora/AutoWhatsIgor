import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { loadOpenAIKey } from './_env.mjs'
import { openaiFetchBinary, openaiFetchJson } from './_http.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const repoRoot = path.resolve(__dirname, '..', '..', '..')
const outDir = path.join(repoRoot, 'docs', 'ads-assets', 'v2', 'broll', 'videos')

function parseList(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

async function exists(p) {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function createVideoJob({ apiKey, model, prompt, seconds, size }) {
  const url = 'https://api.openai.com/v1/videos'

  const form = new FormData()
  form.append('model', model)
  form.append('prompt', prompt)
  form.append('seconds', String(seconds))
  form.append('size', size)

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: form
  })

  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    // ignore
  }

  if (!res.ok) {
    const msg = json?.error?.message || json?.message || text || `OpenAI video create failed (${res.status})`
    const err = new Error(msg)
    err.status = res.status
    err.payload = json || text
    throw err
  }

  if (!json?.id) throw new Error('OpenAI video create: missing id in response')
  return json
}

async function pollVideoJob({ apiKey, id, pollIntervalMs = 4000, timeoutMs = 12 * 60_000 }) {
  const url = `https://api.openai.com/v1/videos/${id}`
  const started = Date.now()

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const json = await openaiFetchJson(url, { apiKey, method: 'GET' })
    const status = json?.status
    const progress = json?.progress

    // eslint-disable-next-line no-console
    console.log(`POLL ${id}: ${status}${typeof progress === 'number' ? ` (${progress}%)` : ''}`)

    if (status === 'completed' || status === 'succeeded') return json
    if (status === 'failed' || status === 'canceled' || status === 'cancelled') {
      throw new Error(`Video job ${id} ended with status=${status} (${json?.error?.message || 'no error message'})`)
    }

    if (Date.now() - started > timeoutMs) throw new Error(`Timeout waiting for video job ${id}`)
    // eslint-disable-next-line no-await-in-loop
    await delay(pollIntervalMs)
  }
}

async function downloadVideo({ apiKey, id }) {
  const url = `https://api.openai.com/v1/videos/${id}/content`
  return openaiFetchBinary(url, { apiKey, retries: 3 })
}

async function runOne({ apiKey, baseName, prompt, seconds, size, model, tag }) {
  const outPath = path.join(outDir, `${baseName}.${tag}.mp4`)
  if (process.env.SKIP_EXISTING !== '0' && (await exists(outPath))) {
    // eslint-disable-next-line no-console
    console.log('SKIP (exists):', path.relative(repoRoot, outPath))
    return { outPath, skipped: true }
  }

  // eslint-disable-next-line no-console
  console.log(`\n=== VIDEO GEN: ${baseName} (${tag}) ===`)
  const created = await createVideoJob({ apiKey, model, prompt, seconds, size })
  const completed = await pollVideoJob({ apiKey, id: created.id })
  const bytes = await downloadVideo({ apiKey, id: completed.id })
  await fs.mkdir(outDir, { recursive: true })
  await fs.writeFile(outPath, bytes)

  // eslint-disable-next-line no-console
  console.log('OK:', path.relative(repoRoot, outPath))
  return { outPath, skipped: false }
}

async function main() {
  const apiKey = await loadOpenAIKey()

  const draftModel = process.env.DRAFT_MODEL || 'sora-2'
  const proModel = process.env.PRO_MODEL || 'sora-2-pro'
  const seconds = Number(process.env.SECONDS || 8)
  const size = process.env.SIZE || '720x1280'
  const continueOnError = process.env.CONTINUE_ON_ERROR !== '0'

  const upgrade = process.env.UPGRADE === '1'
  const upgradeTargets = new Set(
    parseList(process.env.UPGRADE_TARGETS || 'chat-float,qr-scan,clock-loop')
  )
  const only = new Set(parseList(process.env.CLIPS || ''))
  const includeNeonWaves = process.env.INCLUDE_NEON_WAVES === '1'

  const style =
    'dark premium, neon green and teal accents, cinematic lighting, subtle grain, minimal, no text, no logos, no people, no letters, no numbers, clean loopable motion'

  const clips = [
    ...(includeNeonWaves
      ? [
          {
            key: 'neon-waves',
            baseName: 'broll-neon-waves',
            prompt: `${style}. Pure abstract flowing ribbons of light, smooth gradients, soft bloom, no objects, no symbols, no grids, 9:16.`
          }
        ]
      : []),
    {
      key: 'chat-float',
      baseName: 'broll-chat-float',
      prompt: `${style}. A generic minimal 3D chat bubble icon floating in space, soft rotation, green rim light, dark studio background, 9:16.`
    },
    {
      key: 'qr-scan',
      baseName: 'broll-qr-scan',
      prompt: `${style}. Abstract tech pattern of dots and rounded rectangles, stylized, with a soft scanning light bar passing over it, 9:16.`
    },
    {
      key: 'clock-loop',
      baseName: 'broll-clock-loop',
      prompt: `${style}. A minimal 3D clock/calendar icon gently rotating, green glow, dark background, 9:16.`
    }
  ]

  await fs.mkdir(outDir, { recursive: true })

  const selected = only.size ? clips.filter((c) => only.has(c.key)) : clips
  const errors = []

  // 1) Drafts
  for (const c of selected) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await runOne({
        apiKey,
        baseName: c.baseName,
        prompt: c.prompt,
        seconds,
        size,
        model: draftModel,
        tag: draftModel
      })
    } catch (err) {
      errors.push({ clip: c.key, stage: 'draft', error: err })
      // eslint-disable-next-line no-console
      console.error(`WARN: clip ${c.key} draft failed:`, err?.message || err)
      if (!continueOnError) throw err
    }
  }

  // 2) Upgrades (optional)
  if (upgrade) {
    for (const c of selected) {
      if (!upgradeTargets.has(c.key)) continue
      try {
        // eslint-disable-next-line no-await-in-loop
        await runOne({
          apiKey,
          baseName: c.baseName,
          prompt: c.prompt,
          seconds,
          size,
          model: proModel,
          tag: proModel
        })
      } catch (err) {
        errors.push({ clip: c.key, stage: 'pro', error: err })
        // eslint-disable-next-line no-console
        console.error(`WARN: clip ${c.key} pro failed:`, err?.message || err)
        if (!continueOnError) throw err
      }
    }
  }

  // eslint-disable-next-line no-console
  console.log('\nOK. Videos em:', outDir)
  // eslint-disable-next-line no-console
  console.log('Dica: defina UPGRADE=1 para gerar os "pro" (sora-2-pro) dos melhores clipes.')
  // eslint-disable-next-line no-console
  if (errors.length) console.log(`OBS: ${errors.length} clipe(s) falharam (veja WARN acima).`)
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exitCode = 1
})
