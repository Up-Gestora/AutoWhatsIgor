import { readFile } from 'node:fs/promises'
import path from 'node:path'

export const size = {
  width: 1200,
  height: 630
}

export const contentType = 'image/png'

const OPEN_GRAPH_IMAGE_PATH = path.join(process.cwd(), 'public', 'social', 'og-pt.png')

export default async function OpenGraphImage() {
  const image = await readFile(OPEN_GRAPH_IMAGE_PATH)

  return new Response(new Uint8Array(image), {
    headers: {
      'content-type': contentType,
      'cache-control': 'public, max-age=31536000, immutable'
    }
  })
}
