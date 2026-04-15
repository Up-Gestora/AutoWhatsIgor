import { admin, getFirestoreAdmin } from '../firebase/admin'

type UserProfile = {
  name: string | null
  companyName?: string | null
}

export async function resolveSessionIdByEmail(email: string): Promise<string> {
  const safeEmail = normalizeOptionalText(email)
  if (!safeEmail) {
    throw new Error('sender_email_missing')
  }

  const db = getFirestoreAdmin()
  if (!db || !admin.apps.length) {
    throw new Error('firebase_admin_unavailable')
  }

  try {
    const authUser = await admin.auth().getUserByEmail(safeEmail)
    return authUser.uid
  } catch {
    const direct = await db.collection('users').where('email', '==', safeEmail).limit(1).get()
    if (!direct.empty) {
      return direct.docs[0]!.id
    }

    const lowered = safeEmail.toLowerCase()
    if (lowered !== safeEmail) {
      const fallback = await db.collection('users').where('email', '==', lowered).limit(1).get()
      if (!fallback.empty) {
        return fallback.docs[0]!.id
      }
    }
    throw new Error('sender_session_not_found')
  }
}

export async function loadUserProfile(sessionId: string): Promise<UserProfile | null> {
  const safeSessionId = normalizeOptionalText(sessionId)
  if (!safeSessionId) {
    return null
  }

  const db = getFirestoreAdmin()
  if (!db) {
    return null
  }

  const doc = await db.collection('users').doc(safeSessionId).get()
  if (!doc.exists) {
    return null
  }

  const data = doc.data() ?? {}
  return {
    name: normalizeOptionalText(data.nome ?? data.name ?? data.displayName),
    companyName: normalizeOptionalText(data.nomeEmpresa ?? data.companyName ?? data.company)
  }
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}
