import { downloadFirebaseStorageObjectFromUrl, type DownloadFirebaseStorageResult } from '../firebase/storage'

type DownloadOptions = {
  timeoutMs: number
  maxBytes: number
}

type FirebaseFallbackDownloader = (url: string, maxBytes: number) => Promise<DownloadFirebaseStorageResult>

export async function downloadToBuffer(
  url: string,
  options: DownloadOptions,
  firebaseFallback: FirebaseFallbackDownloader = (targetUrl, maxBytes) =>
    downloadFirebaseStorageObjectFromUrl(targetUrl, { maxBytes })
): Promise<{ buffer: Buffer; contentType: string | null }> {
  const rawUrl = (url ?? '').trim()
  if (!rawUrl) {
    throw new Error('media_url_invalid')
  }

  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error('media_url_invalid')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('media_url_invalid')
  }

  const timeoutMs = Math.max(1, Math.floor(options.timeoutMs))
  const maxBytes = Math.max(1, Math.floor(options.maxBytes))

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(rawUrl, { redirect: 'follow', signal: controller.signal })
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        const fallback = await firebaseFallback(rawUrl, maxBytes)
        if (fallback.downloaded) {
          return { buffer: fallback.buffer, contentType: fallback.contentType }
        }
        if (fallback.reason === 'too_large') {
          throw new Error('media_download_too_large')
        }
      }
      throw new Error(`media_download_http_${response.status}`)
    }

    const contentTypeHeader = response.headers.get('content-type')
    const contentType = contentTypeHeader && contentTypeHeader.trim() ? contentTypeHeader.trim() : null

    const contentLengthHeader = response.headers.get('content-length')
    if (contentLengthHeader) {
      const contentLength = Number(contentLengthHeader)
      if (Number.isFinite(contentLength) && contentLength > maxBytes) {
        controller.abort()
        throw new Error('media_download_too_large')
      }
    }

    if (!response.body) {
      throw new Error('media_download_empty')
    }

    const reader = response.body.getReader?.()
    if (!reader) {
      const arrayBuffer = await response.arrayBuffer()
      if (arrayBuffer.byteLength > maxBytes) {
        throw new Error('media_download_too_large')
      }
      return { buffer: Buffer.from(arrayBuffer), contentType }
    }

    const chunks: Buffer[] = []
    let total = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue

      total += value.byteLength
      if (total > maxBytes) {
        controller.abort()
        throw new Error('media_download_too_large')
      }
      chunks.push(Buffer.from(value))
    }

    if (total <= 0) {
      throw new Error('media_download_empty')
    }

    return { buffer: Buffer.concat(chunks, total), contentType }
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error('media_download_timeout')
    }

    const message = error instanceof Error ? error.message : ''
    if (message.startsWith('media_')) {
      throw error as Error
    }

    throw new Error('media_download_failed')
  } finally {
    clearTimeout(timer)
  }
}

function isAbortError(error: unknown) {
  const anyErr = error as { name?: unknown; code?: unknown; cause?: { name?: unknown } } | null
  return (
    anyErr?.name === 'AbortError' ||
    anyErr?.code === 'ABORT_ERR' ||
    anyErr?.cause?.name === 'AbortError'
  )
}

