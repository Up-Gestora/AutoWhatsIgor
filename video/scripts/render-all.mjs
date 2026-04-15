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
  { id: 'reels-01', props: 'props/reels-01.json' },
  { id: 'reels-02', props: 'props/reels-02.json' },
  { id: 'reels-03', props: 'props/reels-03.json' }
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
    // Running through cmd.exe ensures `npx` resolves to `npx.cmd` (not PowerShell scripts).
    return run('cmd.exe', ['/d', '/s', '/c', cmd, ...args], { cwd })
  }
  return run(cmd, args, { cwd })
}

async function main() {
  // 1) Sync slides first (masked screenshots only).
  await run(NODE, ['scripts/sync-slides.mjs'], { cwd: videoRoot })

  // 2) Render outputs
  const outDir = path.join(repoRoot, 'docs', 'ads')
  await fs.mkdir(outDir, { recursive: true })

  const entry = 'src/index.ts'
  const compositionId = 'AdReel'

  for (const v of variants) {
    const outMp4 = path.join(outDir, `${v.id}.mp4`)
    const propsPath = path.join(videoRoot, v.props)

    // eslint-disable-next-line no-console
    console.log(`\n=== Render: ${v.id} ===`)

    // Render MP4
    // Note: Remotion bundles FFmpeg internally (no system ffmpeg required).
    // Use H.264 for broad compatibility (Meta/TikTok).
    // --overwrite ensures reruns don't fail.
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
        '--muted',
        '--overwrite'
      ],
      { cwd: videoRoot }
    )

    // Optional thumbnails (set RENDER_THUMBS=0 to skip).
    if (process.env.RENDER_THUMBS !== '0') {
      const outPng = path.join(outDir, `${v.id}.png`)
      // eslint-disable-next-line no-await-in-loop
      await runCli(
        'npx',
        ['remotion', 'still', entry, compositionId, outPng, '--props', propsPath, '--frame', '0'],
        { cwd: videoRoot }
      )
    }
  }

  // eslint-disable-next-line no-console
  console.log('\nOK. Outputs em:', path.join(repoRoot, 'docs', 'ads'))
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exitCode = 1
})
