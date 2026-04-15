import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const videoRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(videoRoot, '..')

const capturePath = path.join(videoRoot, 'public', 'captures', 'hero-block-raw.webm')
const outDir = path.join(repoRoot, 'docs', 'ads', 'hero')
const outMp4 = path.join(outDir, 'hero-block-15s.mp4')

function run(cmd, args, { cwd } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: 'inherit' })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${cmd} exited with code ${code}`))
    })
  })
}

function runCli(cmd, args, { cwd } = {}) {
  if (process.platform === 'win32') {
    return run('cmd.exe', ['/d', '/s', '/c', cmd, ...args], { cwd })
  }
  return run(cmd, args, { cwd })
}

async function assertCaptureExists() {
  try {
    await fs.access(capturePath)
  } catch {
    throw new Error(
      'Arquivo de captura nao encontrado em video/public/captures/hero-block-raw.webm. Rode antes: cmd /d /s /c node scripts/export-hero-block-reel.mjs'
    )
  }
}

async function main() {
  await assertCaptureExists()
  await fs.mkdir(outDir, { recursive: true })

  await runCli(
    'npx',
    [
      'remotion',
      'render',
      'src/index.ts',
      'HeroCapture9x16',
      outMp4,
      '--codec',
      'h264',
      '--crf',
      '18',
      '--muted',
      '--overwrite'
    ],
    { cwd: videoRoot }
  )

  // eslint-disable-next-line no-console
  console.log('OK. Render final em:', outMp4)
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
