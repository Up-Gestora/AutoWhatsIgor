import 'server-only'
import { NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebaseAdmin'

type UserRole = 'admin' | 'user'

export type AccountType = 'main' | 'subaccount'
export type Capability = 'conversations'

export type ResolveSessionOptions = {
  allowSubaccount?: boolean
  capability?: Capability
}

export type RequireUserOptions = ResolveSessionOptions

export type UserAuthResult = {
  uid: string
  role: UserRole
  accountType: AccountType
  ownerUid: string
  isSubaccount: boolean
}

export async function requireUser(
  request: Request,
  options: RequireUserOptions = {}
): Promise<UserAuthResult | NextResponse> {
  if (!adminAuth) {
    return NextResponse.json({ error: 'firebase_admin_unavailable' }, { status: 500 })
  }

  const authHeader = request.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length).trim()
    : authHeader.trim()

  if (!token) {
    return NextResponse.json({ error: 'missing_auth_token' }, { status: 401 })
  }

  let decoded: { uid: string }
  try {
    decoded = await adminAuth.verifyIdToken(token)
  } catch {
    return NextResponse.json({ error: 'invalid_auth_token' }, { status: 401 })
  }

  let role: UserRole = 'user'
  let accountType: AccountType = 'main'
  let ownerUid = decoded.uid

  if (adminDb) {
    try {
      const userDoc = await adminDb.collection('users').doc(decoded.uid).get()
      if (userDoc.exists) {
        const data = userDoc.data() ?? {}
        role = data.role === 'admin' ? 'admin' : 'user'
        accountType = data.accountType === 'subaccount' ? 'subaccount' : 'main'
        if (accountType === 'subaccount') {
          const rawOwnerUid = typeof data.ownerUid === 'string' ? data.ownerUid.trim() : ''
          ownerUid = rawOwnerUid || decoded.uid
        }
      } else {
        role = 'user'
        accountType = 'main'
        ownerUid = decoded.uid
      }
    } catch {
      role = 'user'
      accountType = 'main'
      ownerUid = decoded.uid
    }
  }

  const authResult: UserAuthResult = {
    uid: decoded.uid,
    role,
    accountType,
    ownerUid: accountType === 'subaccount' ? ownerUid : decoded.uid,
    isSubaccount: accountType === 'subaccount'
  }

  if (authResult.isSubaccount && (!options.allowSubaccount || options.capability !== 'conversations')) {
    return NextResponse.json({ error: 'subaccount_forbidden' }, { status: 403 })
  }

  return authResult
}

export async function resolveSessionId(
  request: Request,
  requestedSessionId?: string | null,
  options: ResolveSessionOptions = {}
): Promise<{
  sessionId: string
  role: UserRole
  uid: string
  accountType: AccountType
  ownerUid: string
  isSubaccount: boolean
} | NextResponse> {
  const auth = await requireUser(request, options)
  if (auth instanceof NextResponse) {
    return auth
  }

  const requested = requestedSessionId?.trim() || ''

  if (auth.role === 'admin') {
    return {
      sessionId: requested || auth.uid,
      role: auth.role,
      uid: auth.uid,
      accountType: auth.accountType,
      ownerUid: auth.ownerUid,
      isSubaccount: auth.isSubaccount
    }
  }

  if (auth.isSubaccount) {
    if (!options.allowSubaccount || options.capability !== 'conversations') {
      return NextResponse.json({ error: 'subaccount_forbidden' }, { status: 403 })
    }

    const ownerSessionId = auth.ownerUid.trim() || auth.uid
    if (requested && requested !== auth.uid && requested !== ownerSessionId) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    return {
      sessionId: ownerSessionId,
      role: auth.role,
      uid: auth.uid,
      accountType: auth.accountType,
      ownerUid: ownerSessionId,
      isSubaccount: true
    }
  }

  const sessionId = requested || auth.uid
  if (sessionId !== auth.uid) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  return {
    sessionId,
    role: auth.role,
    uid: auth.uid,
    accountType: auth.accountType,
    ownerUid: auth.uid,
    isSubaccount: false
  }
}
