import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

const CAPTURE_URL = process.env.CAPTURE_URL || 'http://localhost:3000/render/hero-block'
const CAPTURE_MS = Number.parseInt(process.env.CAPTURE_MS || '15000', 10)
const CAPTURE_OUT = process.env.CAPTURE_OUT || path.join('video', 'public', 'captures', 'hero-block-raw.webm')
const HEADLESS = process.env.HEADLESS === '0' ? false : true
const CAPTURE_SIZE = { width: 1080, height: 1920 }

function toAbsoluteOutputPath(outPath) {
  if (path.isAbsolute(outPath)) {
    return outPath
  }
  return path.join(repoRoot, outPath)
}

function assertInputs() {
  if (!Number.isFinite(CAPTURE_MS) || CAPTURE_MS <= 0) {
    throw new Error('CAPTURE_MS invalido. Use um inteiro positivo em milissegundos.')
  }
}

async function main() {
  assertInputs()

  const outputPath = toAbsoluteOutputPath(CAPTURE_OUT)
  const outputDir = path.dirname(outputPath)
  const recordingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'autowhats-hero-capture-'))

  try {
    await fs.mkdir(outputDir, { recursive: true })
    await fs.rm(outputPath, { force: true })

    const browser = await chromium.launch({ headless: HEADLESS })
    let recordedPath = ''

    try {
      const context = await browser.newContext({
        viewport: CAPTURE_SIZE,
        deviceScaleFactor: 1,
        recordVideo: {
          dir: recordingDir,
          size: CAPTURE_SIZE
        }
      })

      const page = await context.newPage()
      const videoHandle = page.video()

      let response
      try {
        response = await page.goto(CAPTURE_URL, {
          waitUntil: 'domcontentloaded',
          timeout: 15_000
        })
      } catch {
        throw new Error(
          `Nao foi possivel acessar ${CAPTURE_URL}. Inicie o frontend com \"cmd /d /s /c npm run dev\" e tente novamente.`
        )
      }

      if (!response || !response.ok()) {
        throw new Error(
          `Falha ao abrir ${CAPTURE_URL}. Status: ${response ? response.status() : 'sem resposta'}`
        )
      }

      await page.getByTestId('hero-block-capture-canvas').waitFor({
        state: 'visible',
        timeout: 15_000
      })
      await page.evaluate(() => document.fonts?.ready ?? Promise.resolve())
      await page.waitForTimeout(1_000)
      await page.waitForTimeout(CAPTURE_MS)

      await context.close()

      if (!videoHandle) {
        throw new Error('Playwright nao retornou handle de video para a captura.')
      }
      recordedPath = await videoHandle.path()
    } finally {
      await browser.close()
    }

    if (!recordedPath) {
      throw new Error('Capture concluida sem arquivo de video gravado.')
    }

    await fs.copyFile(recordedPath, outputPath)

    // eslint-disable-next-line no-console
    console.log('OK. Captura gerada em:', outputPath)
  } finally {
    await fs.rm(recordingDir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
