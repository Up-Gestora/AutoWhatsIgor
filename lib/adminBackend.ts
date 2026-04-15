import 'server-only'
import { NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebaseAdmin'

type AdminAuthResult = {
  uid: string
}

export async function requireAdmin(request: Request): Promise<AdminAuthResult | NextResponse> {
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
  } catch (error) {
    return NextResponse.json({ error: 'invalid_auth_token' }, { status: 401 })
  }

  if (!adminDb) {
    return NextResponse.json({ error: 'admin_role_unavailable' }, { status: 403 })
  }

  const userDoc = await adminDb.collection('users').doc(decoded.uid).get()
  const role = userDoc.exists ? userDoc.data()?.role : 'user'
  if (role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  return { uid: decoded.uid }
}

export function resolveBackendUrl() {
  const raw =
    process.env.BACKEND_URL?.trim() ??
    process.env.NEXT_PUBLIC_BACKEND_URL?.trim() ??
    ''

  if (!raw) {
    return ''
  }

  const value = raw.replace(/\/+$/, '')
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value)
      // Evita resolução IPv6 (::1) que pode falhar quando o backend local está apenas em IPv4.
      if (url.hostname === 'localhost') {
        url.hostname = '127.0.0.1'
      }
      return url.toString().replace(/\/+$/, '')
    } catch {
      return value
    }
  }

  const isLocal = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(value)
  const protocol = isLocal ? 'http' : 'https'
  const localNormalized = value.replace(/^localhost(?=(:\d+)?$)/i, '127.0.0.1')
  return `${protocol}://${localNormalized}`
}

export function resolveBackendUrlFallbacks() {
  const primary = resolveBackendUrl()
  if (!primary) {
    return []
  }

  const fallbacks: string[] = [primary]
  try {
    const url = new URL(primary)
    if (url.hostname === '127.0.0.1') {
      const alt = new URL(primary)
      alt.hostname = 'localhost'
      const altValue = alt.toString().replace(/\/+$/, '')
      if (!fallbacks.includes(altValue)) {
        fallbacks.push(altValue)
      }
    }
  } catch {
    // sem fallback quando URL não puder ser parseada
  }

  return fallbacks
}

export function getBackendAdminKey() {
  return (process.env.BACKEND_ADMIN_KEY ?? process.env.ADMIN_API_KEY ?? '').trim()
}
