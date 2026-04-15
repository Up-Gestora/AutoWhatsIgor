import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const videoRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(videoRoot, '..')

const NODE = process.execPath

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

async function main() {
  await run(NODE, ['scripts/sync-assets-v2.mjs'], { cwd: videoRoot })

  const outDir = path.join(repoRoot, 'docs', 'ads', 'vsl')
  await fs.mkdir(outDir, { recursive: true })

  const entry = 'src/index.ts'
  const compositionId = 'VSL16x9'
  const propsPath = path.join(videoRoot, 'props', 'vsl-01.json')
  const outMp4 = path.join(outDir, 'vsl-01.mp4')

  // eslint-disable-next-line no-console
  console.log(`\n=== Render VSL: vsl-01 ===`)

  await runCli(
    'npx',
    [
      'remotion',
      'render',
      entry,
      compositionId,
      outMp4,
      '--props',
      propsPath,
      '--codec',
      'h264',
      '--crf',
      '18',
      '--muted',
      '--overwrite'
    ],
    { cwd: videoRoot }
  )

  if (process.env.RENDER_THUMBS !== '0') {
    const outPng = path.join(outDir, 'vsl-01.png')
    await runCli(
      'npx',
      // Frame 45 catches the hook after it has animated in (better thumbnail than frame 0).
      ['remotion', 'still', entry, compositionId, outPng, '--props', propsPath, '--frame', '45', '--overwrite'],
      { cwd: videoRoot }
    )
  }

  // eslint-disable-next-line no-console
  console.log('\nOK. Outputs em:', outDir)
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exitCode = 1
})
