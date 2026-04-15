import { admin, getFirestoreAdmin } from './admin'

export type FirebaseStorageObjectRef = {
  bucket: string
  objectPath: string
}

export type DeleteFirebaseStorageResult = {
  deleted: boolean
  bucket?: string
  objectPath?: string
  reason?:
    | 'unsupported_url'
    | 'prefix_mismatch'
    | 'firebase_admin_unavailable'
    | 'delete_failed'
  error?: string
}

export type DownloadFirebaseStorageResult =
  | {
      downloaded: true
      bucket: string
      objectPath: string
      buffer: Buffer
      contentType: string | null
    }
  | {
      downloaded: false
      bucket?: string
      objectPath?: string
      reason:
        | 'unsupported_url'
        | 'prefix_mismatch'
        | 'firebase_admin_unavailable'
        | 'not_found'
        | 'too_large'
        | 'download_failed'
      error?: string
    }

export function parseFirebaseStorageUrl(value: string): FirebaseStorageObjectRef | null {
  const raw = (value ?? '').trim()
  if (!raw) return null

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }

  if (url.hostname === 'firebasestorage.googleapis.com') {
    // Typical download URL:
    // https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<encodedPath>?alt=media&token=...
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length < 5) return null
    if (parts[0] !== 'v0' || parts[1] !== 'b' || parts[3] !== 'o') return null
    const bucket = parts[2] ?? ''
    const encoded = parts.slice(4).join('/')
    if (!bucket || !encoded) return null
    try {
      return { bucket, objectPath: decodeURIComponent(encoded) }
    } catch {
      return null
    }
  }

  if (url.hostname === 'storage.googleapis.com') {
    // Alternate URL style:
    // https://storage.googleapis.com/<bucket>/<path>
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length < 2) return null
    const bucket = parts[0] ?? ''
    const objectPathRaw = parts.slice(1).join('/')
    if (!bucket || !objectPathRaw) return null
    try {
      return { bucket, objectPath: decodeURIComponent(objectPathRaw) }
    } catch {
      return null
    }
  }

  return null
}

export async function deleteFirebaseStorageObjectFromUrl(
  downloadUrl: string,
  options: { expectedObjectPrefix?: string } = {}
): Promise<DeleteFirebaseStorageResult> {
  const ref = parseFirebaseStorageUrl(downloadUrl)
  if (!ref) {
    return { deleted: false, reason: 'unsupported_url' }
  }

  const expectedPrefix = options.expectedObjectPrefix?.trim()
  if (expectedPrefix && !ref.objectPath.startsWith(expectedPrefix)) {
    return { deleted: false, reason: 'prefix_mismatch', bucket: ref.bucket, objectPath: ref.objectPath }
  }

  // Ensure firebase-admin is initialized (getFirestoreAdmin() initializes the app).
  void getFirestoreAdmin()
  if (!admin.apps.length) {
    return { deleted: false, reason: 'firebase_admin_unavailable', bucket: ref.bucket, objectPath: ref.objectPath }
  }
  if (typeof (admin as any).storage !== 'function') {
    return { deleted: false, reason: 'firebase_admin_unavailable', bucket: ref.bucket, objectPath: ref.objectPath }
  }

  try {
    const bucket = (admin.storage().bucket(ref.bucket) as any) ?? null
    const file = bucket?.file ? bucket.file(ref.objectPath) : null
    if (!file?.delete) {
      return { deleted: false, reason: 'firebase_admin_unavailable', bucket: ref.bucket, objectPath: ref.objectPath }
    }

    await file.delete({ ignoreNotFound: true })
    return { deleted: true, bucket: ref.bucket, objectPath: ref.objectPath }
  } catch (error) {
    return {
      deleted: false,
      reason: 'delete_failed',
      bucket: ref.bucket,
      objectPath: ref.objectPath,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

export async function downloadFirebaseStorageObjectFromUrl(
  downloadUrl: string,
  options: { maxBytes: number; expectedObjectPrefix?: string }
): Promise<DownloadFirebaseStorageResult> {
  const ref = parseFirebaseStorageUrl(downloadUrl)
  if (!ref) {
    return { downloaded: false, reason: 'unsupported_url' }
  }

  const expectedPrefix = options.expectedObjectPrefix?.trim()
  if (expectedPrefix && !ref.objectPath.startsWith(expectedPrefix)) {
    return { downloaded: false, reason: 'prefix_mismatch', bucket: ref.bucket, objectPath: ref.objectPath }
  }

  const maxBytes = Math.max(1, Math.floor(options.maxBytes))

  // Ensure firebase-admin is initialized (getFirestoreAdmin() initializes the app).
  void getFirestoreAdmin()
  if (!admin.apps.length) {
    return { downloaded: false, reason: 'firebase_admin_unavailable', bucket: ref.bucket, objectPath: ref.objectPath }
  }
  if (typeof (admin as any).storage !== 'function') {
    return { downloaded: false, reason: 'firebase_admin_unavailable', bucket: ref.bucket, objectPath: ref.objectPath }
  }

  try {
    const bucket = (admin.storage().bucket(ref.bucket) as any) ?? null
    const file = bucket?.file ? bucket.file(ref.objectPath) : null
    if (!file?.download) {
      return { downloaded: false, reason: 'firebase_admin_unavailable', bucket: ref.bucket, objectPath: ref.objectPath }
    }

    let contentType: string | null = null
    if (file.getMetadata) {
      try {
        const metadataResult = await file.getMetadata()
        const metadata = Array.isArray(metadataResult) ? metadataResult[0] : metadataResult
        const sizeRaw = metadata?.size
        const size = Number(sizeRaw)
        if (Number.isFinite(size) && size > maxBytes) {
          return { downloaded: false, reason: 'too_large', bucket: ref.bucket, objectPath: ref.objectPath }
        }
        if (typeof metadata?.contentType === 'string' && metadata.contentType.trim()) {
          contentType = metadata.contentType.trim()
        }
      } catch (error) {
        if (isStorageObjectNotFound(error)) {
          return { downloaded: false, reason: 'not_found', bucket: ref.bucket, objectPath: ref.objectPath }
        }
      }
    }

    const downloadResult = await file.download()
    const buffer = Array.isArray(downloadResult) ? downloadResult[0] : downloadResult
    if (!buffer || !Buffer.isBuffer(buffer)) {
      return {
        downloaded: false,
        reason: 'download_failed',
        bucket: ref.bucket,
        objectPath: ref.objectPath,
        error: 'invalid_download_buffer'
      }
    }
    if (buffer.byteLength > maxBytes) {
      return { downloaded: false, reason: 'too_large', bucket: ref.bucket, objectPath: ref.objectPath }
    }

    return {
      downloaded: true,
      bucket: ref.bucket,
      objectPath: ref.objectPath,
      buffer,
      contentType
    }
  } catch (error) {
    if (isStorageObjectNotFound(error)) {
      return { downloaded: false, reason: 'not_found', bucket: ref.bucket, objectPath: ref.objectPath }
    }
    return {
      downloaded: false,
      reason: 'download_failed',
      bucket: ref.bucket,
      objectPath: ref.objectPath,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

function isStorageObjectNotFound(error: unknown): boolean {
  const value = error as any
  const code = value?.code
  const statusCode = value?.statusCode
  const message = typeof value?.message === 'string' ? value.message.toLowerCase() : ''
  return code === 404 || statusCode === 404 || message.includes('no such object') || message.includes('not found')
}
