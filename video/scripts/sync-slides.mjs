import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const repoRoot = path.resolve(__dirname, '..', '..')
const srcDir = path.join(repoRoot, 'docs', 'tutorial-stories-conexao-ia', 'slides')
const dstDir = path.join(repoRoot, 'video', 'public', 'slides')

const required = ['01.png', '05.png', '06.png', '07.png', '08.png', '09.png', '10.png']

async function fileExists(p) {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function main() {
  const missing = []
  for (const f of required) {
    const abs = path.join(srcDir, f)
    // eslint-disable-next-line no-await-in-loop
    const ok = await fileExists(abs)
    if (!ok) missing.push(abs)
  }

  if (missing.length > 0) {
    const msg = [
      'Nao foi possivel sincronizar os slides para o Remotion.',
      'Arquivos obrigatorios ausentes (gere novamente o tutorial stories primeiro):',
      ...missing.map((m) => `- ${m}`)
    ].join('\n')
    throw new Error(msg)
  }

  await fs.mkdir(dstDir, { recursive: true })

  for (const f of required) {
    const from = path.join(srcDir, f)
    const to = path.join(dstDir, f)
    // eslint-disable-next-line no-await-in-loop
    await fs.copyFile(from, to)
  }

  // eslint-disable-next-line no-console
  console.log('OK. Slides sincronizados em:', dstDir)
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exitCode = 1
})

