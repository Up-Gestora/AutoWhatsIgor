import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebaseAdmin'
import { requireUser } from '@/lib/userBackend'
import {
  assertOwnerAccount,
  listOwnerSubaccounts,
  MAX_SUBACCOUNTS_PER_OWNER,
  SubaccountsError
} from '@/lib/subaccountsBackend'

export const runtime = 'nodejs'

type CreateSubaccountBody = {
  email?: string
  password?: string
  nome?: string
}

export async function GET(request: NextRequest) {
  const auth = await requireUser(request)
  if (auth instanceof NextResponse) {
    return auth
  }

  try {
    const ownerUid = assertOwnerAccount(auth)
    const subaccounts = await listOwnerSubaccounts(ownerUid)
    return NextResponse.json({ success: true, subaccounts })
  } catch (error) {
    return mapSubaccountsError(error)
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireUser(request)
  if (auth instanceof NextResponse) {
    return auth
  }

  try {
    const ownerUid = assertOwnerAccount(auth)
    if (!adminAuth || !adminDb) {
      return NextResponse.json({ error: 'firebase_admin_unavailable' }, { status: 500 })
    }

    const body = (await request.json().catch(() => ({}))) as CreateSubaccountBody
    const email = normalizeEmail(body.email)
    const password = typeof body.password === 'string' ? body.password.trim() : ''
    const nome = normalizeOptionalText(body.nome)

    if (!email) {
      return NextResponse.json({ error: 'email_required' }, { status: 400 })
    }
    if (!password) {
      return NextResponse.json({ error: 'password_required' }, { status: 400 })
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'password_too_short' }, { status: 400 })
    }

    const existing = await listOwnerSubaccounts(ownerUid)
    if (existing.length >= MAX_SUBACCOUNTS_PER_OWNER) {
      return NextResponse.json({ error: 'subaccounts_limit_reached' }, { status: 409 })
    }

    const createdAt = new Date().toISOString()
    let createdUid = ''

    try {
      const created = await adminAuth.createUser({
        email,
        password,
        ...(nome ? { displayName: nome } : {})
      })
      createdUid = created.uid
    } catch (error) {
      return mapSubaccountsError(error)
    }

    try {
      const batch = adminDb.batch()
      const userRef = adminDb.collection('users').doc(createdUid)
      batch.set(
        userRef,
        {
          email,
          ...(nome ? { nome } : {}),
          role: 'user',
          accountType: 'subaccount',
          ownerUid,
          createdAt,
          updatedAt: createdAt
        },
        { merge: true }
      )

      const ownerSubRef = adminDb.collection('users').doc(ownerUid).collection('subaccounts').doc(createdUid)
      batch.set(
        ownerSubRef,
        {
          uid: createdUid,
          email,
          ...(nome ? { nome } : {}),
          createdAt,
          updatedAt: createdAt
        },
        { merge: true }
      )

      await batch.commit()
    } catch (error) {
      if (createdUid) {
        try {
          await adminAuth.deleteUser(createdUid)
        } catch {
          // Ignore cleanup failure.
        }
      }
      throw error
    }

    return NextResponse.json(
      {
        success: true,
        subaccount: {
          uid: createdUid,
          email,
          nome: nome || null,
          createdAt,
          updatedAt: createdAt
        }
      },
      { status: 201 }
    )
  } catch (error) {
    return mapSubaccountsError(error)
  }
}

function normalizeEmail(value: unknown) {
  if (typeof value !== 'string') {
    return ''
  }
  return value.trim().toLowerCase()
}

function normalizeOptionalText(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }
  return value.trim()
}

function mapSubaccountsError(error: unknown) {
  if (error instanceof SubaccountsError) {
    return NextResponse.json({ error: error.code }, { status: error.status })
  }

  const code = extractErrorCode(error)
  if (code === 'auth/email-already-exists') {
    return NextResponse.json({ error: 'email_already_exists' }, { status: 409 })
  }
  if (code === 'auth/invalid-email') {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 })
  }
  if (code === 'auth/invalid-password') {
    return NextResponse.json({ error: 'invalid_password' }, { status: 400 })
  }

  return NextResponse.json({ error: 'subaccounts_request_failed' }, { status: 500 })
}

function extractErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return ''
  }
  if ('code' in error && typeof (error as { code?: unknown }).code === 'string') {
    return (error as { code: string }).code
  }
  return ''
}
