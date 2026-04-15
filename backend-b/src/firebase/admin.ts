import admin from 'firebase-admin'
import type { ServiceAccount } from 'firebase-admin'

let cachedDb: FirebaseFirestore.Firestore | null = null
let initialized = false

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

    return {
      projectId,
      clientEmail,
      privateKey: privateKeyRaw.replace(/\\n/g, '\n')
    }
  } catch (error) {
    console.warn('[FirebaseAdmin] Failed to parse FIREBASE_SERVICE_ACCOUNT:', (error as Error).message)
    return null
  }
}

export function getFirestoreAdmin(): FirebaseFirestore.Firestore | null {
  if (initialized) {
    return cachedDb
  }

  const serviceAccount = loadServiceAccount()
  initialized = true
  if (!serviceAccount) {
    cachedDb = null
    return cachedDb
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    })
  }

  cachedDb = admin.firestore()
  return cachedDb
}

export { admin }
