import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { loadOpenAIKey } from './_env.mjs'
import { openaiFetchBinary, openaiFetchJson } from './_http.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const repoRoot = path.resolve(__dirname, '..', '..', '..')

async function exists(p) {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

function readEnv(name, fallback) {
  const v = process.env[name]
  if (v == null || String(v).trim() === '') return fallback
  return v
}

function readIntEnv(name, fallback) {
  const v = readEnv(name, '')
  if (!v) return fallback
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.trunc(n)
}

async function createVideoJob({ apiKey, model, prompt, seconds, size }) {
  const url = 'https://api.openai.com/v1/videos'

  const form = new FormData()
  form.append('model', model)
  form.append('prompt', prompt)
  form.append('seconds', String(seconds))
  form.append('size', size)

  const json = await openaiFetchJson(url, {
    apiKey,
    method: 'POST',
    body: form
  })

  if (!json?.id) throw new Error('OpenAI video create: missing id in response')
  return json
}

async function pollVideoJob({
  apiKey,
  id,
  pollIntervalMs = 8000,
  timeoutMs = 20 * 60_000
}) {
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

async function downloadThumbnailWebp({ apiKey, id }) {
  // Best-effort: some API versions expose a thumbnail variant via the content endpoint.
  const url = `https://api.openai.com/v1/videos/${id}/content?variant=thumbnail`
  return openaiFetchBinary(url, { apiKey, retries: 1 })
}

function defaultPrompt() {
  // Single prompt for a 12s YouTube ad. Keep it strict to reduce the chance of unwanted text/logos.
  return [
    'Generate a 12-second horizontal 16:9 (1280x720) cinematic video ad.',
    'Visual style: dark premium, neon green and teal accents, subtle grain, high-contrast studio lighting.',
    'Important constraints: no real people, no faces, no brand logos, no copyrighted characters, no copyrighted music.',
    'Use a generic messaging app UI (WhatsApp-inspired colors, but NOT WhatsApp and no WhatsApp logo).',
    'No on-screen text until the final end-card.',
    '',
    'Storyboard (4 scenes, 3s each):',
    '1) 0-3s: urgent avalanche of notifications and chat bubbles (generic), fast-paced, no readable text.',
    '2) 3-6s: generic dashboard shows a QR; a phone scans; clean “connected” animation (no real device brands).',
    '3) 6-9s: AI replies automatically (chat bubbles glow with a subtle AI effect), fast and smooth.',
    '4) 9-12s: minimalist end-card with perfectly legible text only: “AutoWhats” and “Teste gratis”. Include a green rounded button shape.',
    '',
    'Audio: include Brazilian Portuguese voiceover, synced to the scenes, using EXACTLY these lines (no extra words):',
    '1) "Rodou anuncio e o lead caiu no WhatsApp?"',
    '2) "AutoWhats conecta por QR e responde 24/7 com IA treinavel."',
    '3) "Clique e crie sua conta para testar gratis."',
    'Also add subtle UI sound effects (notification swooshes) under the voiceover.',
    ''
  ].join('\n')
}

async function main() {
  const apiKey = await loadOpenAIKey()

  const model = String(readEnv('MODEL', 'sora-2'))
  const seconds = readIntEnv('SECONDS', 12)
  const size = String(readEnv('SIZE', '1280x720'))
  const prompt = String(readEnv('PROMPT', defaultPrompt()))

  const outDir = path.join(repoRoot, String(readEnv('OUT_DIR', 'docs/ads/youtube')))
  const outBase = String(readEnv('OUT_BASENAME', 'autowhats-youtube-12s')).replace(/\.(mp4|webp)$/i, '')

  const outPath = path.join(outDir, `${outBase}.mp4`)
  const thumbPath = path.join(outDir, `${outBase}.thumb.webp`)

  const pollIntervalMs = readIntEnv('POLL_INTERVAL_MS', 8000)
  const timeoutMs = readIntEnv('TIMEOUT_MS', 20 * 60_000)

  const skipExisting = readEnv('SKIP_EXISTING', '1') !== '0'
  const wantThumb = readEnv('THUMBNAIL', '1') !== '0'

  if (skipExisting && (await exists(outPath))) {
    // eslint-disable-next-line no-console
    console.log('SKIP (exists):', path.relative(repoRoot, outPath))
    return
  }

  await fs.mkdir(outDir, { recursive: true })

  // eslint-disable-next-line no-console
  console.log('\n=== SORA YOUTUBE AD GEN (12s) ===')
  // eslint-disable-next-line no-console
  console.log('model=', model, 'seconds=', seconds, 'size=', size)
  // eslint-disable-next-line no-console
  console.log('out=', path.relative(repoRoot, outPath))

  const created = await createVideoJob({ apiKey, model, prompt, seconds, size })
  const completed = await pollVideoJob({
    apiKey,
    id: created.id,
    pollIntervalMs,
    timeoutMs
  })

  const bytes = await downloadVideo({ apiKey, id: completed.id })
  await fs.writeFile(outPath, bytes)

  // eslint-disable-next-line no-console
  console.log('OK:', path.relative(repoRoot, outPath))

  if (wantThumb) {
    try {
      const thumbBytes = await downloadThumbnailWebp({ apiKey, id: completed.id })
      await fs.writeFile(thumbPath, thumbBytes)
      // eslint-disable-next-line no-console
      console.log('OK:', path.relative(repoRoot, thumbPath))
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('WARN: thumbnail download failed (non-fatal):', err?.message || err)
    }
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exitCode = 1
})

