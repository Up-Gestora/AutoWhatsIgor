import 'server-only'
import admin from 'firebase-admin'
import type { ServiceAccount } from 'firebase-admin'

function loadServiceAccount(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) {
    return null
  }

  try {
    const sanitized = raw.trim().replace(/^'|'$/g, '')
    const parsed = JSON.parse(sanitized) as Record<string, unknown>
    const projectId =
      typeof parsed.projectId === 'string'
        ? parsed.projectId
        : typeof parsed.project_id === 'string'
          ? parsed.project_id
          : ''
    const clientEmail =
      typeof parsed.clientEmail === 'string'
        ? parsed.clientEmail
        : typeof parsed.client_email === 'string'
          ? parsed.client_email
          : ''
    const privateKeyRaw =
      typeof parsed.privateKey === 'string'
        ? parsed.privateKey
        : typeof parsed.private_key === 'string'
          ? parsed.private_key
          : ''

    if (!projectId || !clientEmail || !privateKeyRaw) {
      return null
    }

    const serviceAccount: ServiceAccount = {
      projectId,
      clientEmail,
      privateKey: privateKeyRaw.replace(/\\n/g, '\n')
    }
    return serviceAccount
  } catch (error) {
    console.warn('[FirebaseAdmin] Failed to parse FIREBASE_SERVICE_ACCOUNT:', (error as Error).message)
    return null
  }
}

const serviceAccount = loadServiceAccount()
const defaultStorageBucket =
  process.env.FIREBASE_STORAGE_BUCKET?.trim() ||
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() ||
  undefined

if (!admin.apps.length && serviceAccount) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    ...(defaultStorageBucket ? { storageBucket: defaultStorageBucket } : {})
  })
}

export const adminApp = admin.apps.length ? admin.app() : null
export const adminAuth = admin.apps.length ? admin.auth() : null
export const adminDb = admin.apps.length ? admin.firestore() : null
export const adminStorage = admin.apps.length ? admin.storage() : null

export function getAdminStorageBucket() {
  if (!adminStorage) {
    return null
  }

  const explicitBucket =
    process.env.FIREBASE_STORAGE_BUCKET?.trim() ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() ||
    ''

  try {
    return explicitBucket ? adminStorage.bucket(explicitBucket) : adminStorage.bucket()
  } catch {
    return null
  }
}
