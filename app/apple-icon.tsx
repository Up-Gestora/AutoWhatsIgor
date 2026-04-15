import { readFile } from 'node:fs/promises'
import path from 'node:path'

export const size = {
  width: 180,
  height: 180
}

export const contentType = 'image/png'

const APPLE_ICON_PATH = path.join(process.cwd(), 'public', 'brand', 'logo-mark.png')

export default async function AppleIcon() {
  const icon = await readFile(APPLE_ICON_PATH)

  return new Response(new Uint8Array(icon), {
    headers: {
      'content-type': contentType,
      'cache-control': 'public, max-age=31536000, immutable'
    }
  })
}
