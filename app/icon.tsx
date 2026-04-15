import { readFile } from 'node:fs/promises'
import path from 'node:path'

export const size = {
  width: 32,
  height: 32
}

export const contentType = 'image/png'

const ICON_PATH = path.join(process.cwd(), 'public', 'brand', 'logo-mark.png')

export default async function Icon() {
  const icon = await readFile(ICON_PATH)

  return new Response(new Uint8Array(icon), {
    headers: {
      'content-type': contentType,
      'cache-control': 'public, max-age=31536000, immutable'
    }
  })
}
