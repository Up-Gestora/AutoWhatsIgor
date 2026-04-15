import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const videoRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(videoRoot, '..')

const NODE = process.execPath

const variants = [
  { id: 'pro-01', props: 'props/v2-pro-01.json' },
  { id: 'pro-02', props: 'props/v2-pro-02.json' },
  { id: 'pro-03', props: 'props/v2-pro-03.json' }
]

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
    // child_process.spawn cannot directly execute .cmd files reliably on Windows.
    return run('cmd.exe', ['/d', '/s', '/c', cmd, ...args], { cwd })
  }
  return run(cmd, args, { cwd })
}

async function main() {
  // 1) Sync assets first (UI + b-roll).
  await run(NODE, ['scripts/sync-assets-v2.mjs'], { cwd: videoRoot })

  // 2) Render outputs
  const outDir = path.join(repoRoot, 'docs', 'ads', 'v2')
  await fs.mkdir(outDir, { recursive: true })

  const entry = 'src/index.ts'
  const compositionId = 'AdV2'

  for (const v of variants) {
    const outMp4 = path.join(outDir, `${v.id}.mp4`)
    const propsPath = path.join(videoRoot, v.props)

    // eslint-disable-next-line no-console
    console.log(`\n=== Render V2: ${v.id} ===`)

    // Render MP4 (H.264, muted)
    // --crf 18 for higher quality (still small enough for ads)
    // eslint-disable-next-line no-await-in-loop
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

    // Thumbnail
    if (process.env.RENDER_THUMBS !== '0') {
      const outPng = path.join(outDir, `${v.id}.png`)
      // eslint-disable-next-line no-await-in-loop
      await runCli(
        'npx',
        ['remotion', 'still', entry, compositionId, outPng, '--props', propsPath, '--frame', '0', '--overwrite'],
        { cwd: videoRoot }
      )
    }

    // QA stills at key frames (optional)
    if (process.env.RENDER_QA_STILLS === '1') {
      const frames = [0, 60, 120, 210, 330, 440]
      for (const f of frames) {
        const outStill = path.join(outDir, `${v.id}.qa.${String(f).padStart(3, '0')}.png`)
        // eslint-disable-next-line no-await-in-loop
        await runCli(
          'npx',
          ['remotion', 'still', entry, compositionId, outStill, '--props', propsPath, '--frame', String(f), '--overwrite'],
          { cwd: videoRoot }
        )
      }
    }
  }

  // eslint-disable-next-line no-console
  console.log('\nOK. Outputs em:', outDir)
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exitCode = 1
})

