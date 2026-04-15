import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function parseDotEnv(raw) {
  const out = {}
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    let val = trimmed.slice(idx + 1).trim()
    // Remove optional wrapping quotes
    if (
      (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
      (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
    ) {
      val = val.slice(1, -1)
    }
    out[key] = val
  }
  return out
}

export async function loadOpenAIKey() {
  // Prefer environment variables (CI-friendly)
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY
  if (process.env.OPEN_AI_KEY) return process.env.OPEN_AI_KEY

  const repoRoot = path.resolve(__dirname, '..', '..', '..')
  const candidates = [
    path.join(repoRoot, 'server', '.env'),
    path.join(repoRoot, 'backend-b', '.env'),
    path.join(repoRoot, 'video', '.env'),
    path.join(repoRoot, '.env.local'),
    path.join(repoRoot, '.env')
  ]

  for (const p of candidates) {
    try {
      const raw = await fs.readFile(p, 'utf8')
      const env = parseDotEnv(raw)
      const key = env.OPENAI_API_KEY || env.OPEN_AI_KEY
      if (key) {
        process.env.OPENAI_API_KEY = key
        return key
      }
    } catch {
      // ignore
    }
  }

  throw new Error(
    'OPENAI_API_KEY not found. Set process.env.OPENAI_API_KEY or add it to server/.env, backend-b/.env, or video/.env (gitignored).'
  )
}

