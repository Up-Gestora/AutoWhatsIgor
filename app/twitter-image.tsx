import { readFile } from 'node:fs/promises'
import path from 'node:path'

export const size = {
  width: 1200,
  height: 600
}

export const contentType = 'image/png'

const TWITTER_IMAGE_PATH = path.join(process.cwd(), 'public', 'social', 'twitter-pt.png')

export default async function TwitterImage() {
  const image = await readFile(TWITTER_IMAGE_PATH)

  return new Response(new Uint8Array(image), {
    headers: {
      'content-type': contentType,
      'cache-control': 'public, max-age=31536000, immutable'
    }
  })
}
