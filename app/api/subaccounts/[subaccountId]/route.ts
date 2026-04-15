import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebaseAdmin'
import { requireUser } from '@/lib/userBackend'
import {
  assertOwnerAccount,
  getOwnerSubaccount,
  removeSubaccountFromAssignments,
  SubaccountsError
} from '@/lib/subaccountsBackend'

export const runtime = 'nodejs'

type RouteParams = {
  params: Promise<{
    subaccountId: string
  }>
}

type UpdateSubaccountBody = {
  email?: string
  password?: string
  nome?: string | null
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = await requireUser(request)
  if (auth instanceof NextResponse) {
    return auth
  }

  try {
    const ownerUid = assertOwnerAccount(auth)
    if (!adminAuth || !adminDb) {
      return NextResponse.json({ error: 'firebase_admin_unavailable' }, { status: 500 })
    }

    const { subaccountId } = await params
    const subUid = String(subaccountId ?? '').trim()
    if (!subUid) {
      return NextResponse.json({ error: 'subaccount_id_required' }, { status: 400 })
    }

    const existing = await getOwnerSubaccount(ownerUid, subUid)
    if (!existing) {
      return NextResponse.json({ error: 'subaccount_not_found' }, { status: 404 })
    }

    const body = (await request.json().catch(() => ({}))) as UpdateSubaccountBody
    const hasEmail = Object.prototype.hasOwnProperty.call(body, 'email')
    const hasPassword = Object.prototype.hasOwnProperty.call(body, 'password')
    const hasNome = Object.prototype.hasOwnProperty.call(body, 'nome')

    const email = normalizeEmail(body.email)
    const password = normalizePassword(body.password)
    const nome = normalizeNullableText(body.nome)

    if (!hasEmail && !hasPassword && !hasNome) {
      return NextResponse.json({ error: 'subaccount_update_required' }, { status: 400 })
    }
    if (hasEmail && !email) {
      return NextResponse.json({ error: 'invalid_email' }, { status: 400 })
    }
    if (hasPassword && password.length > 0 && password.length < 6) {
      return NextResponse.json({ error: 'password_too_short' }, { status: 400 })
    }

    const authUpdate: { email?: string; password?: string; displayName?: string | null } = {}
    if (hasEmail) {
      authUpdate.email = email
    }
    if (hasPassword && password) {
      authUpdate.password = password
    }
    if (hasNome) {
      authUpdate.displayName = nome
    }

    if (Object.keys(authUpdate).length > 0) {
      try {
        await adminAuth.updateUser(subUid, authUpdate)
      } catch (error) {
        return mapSubaccountsError(error)
      }
    }

    const updatedAt = new Date().toISOString()
    const nextEmail = hasEmail ? email : existing.email
    const nextNome = hasNome ? nome : existing.nome

    const batch = adminDb.batch()
    const userRef = adminDb.collection('users').doc(subUid)
    batch.set(
      userRef,
      {
        ...(hasEmail ? { email: nextEmail } : {}),
        ...(hasNome ? { nome: nextNome } : {}),
        updatedAt
      },
      { merge: true }
    )

    const ownerSubRef = adminDb.collection('users').doc(ownerUid).collection('subaccounts').doc(subUid)
    batch.set(
      ownerSubRef,
      {
        ...(hasEmail ? { email: nextEmail } : {}),
        ...(hasNome ? { nome: nextNome } : {}),
        updatedAt
      },
      { merge: true }
    )
    await batch.commit()

    return NextResponse.json({
      success: true,
      subaccount: {
        uid: subUid,
        email: nextEmail,
        nome: nextNome,
        updatedAt
      }
    })
  } catch (error) {
    return mapSubaccountsError(error)
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = await requireUser(request)
  if (auth instanceof NextResponse) {
    return auth
  }

  try {
    const ownerUid = assertOwnerAccount(auth)
    if (!adminAuth || !adminDb) {
      return NextResponse.json({ error: 'firebase_admin_unavailable' }, { status: 500 })
    }

    const { subaccountId } = await params
    const subUid = String(subaccountId ?? '').trim()
    if (!subUid) {
      return NextResponse.json({ error: 'subaccount_id_required' }, { status: 400 })
    }

    const existing = await getOwnerSubaccount(ownerUid, subUid)
    if (!existing) {
      return NextResponse.json({ error: 'subaccount_not_found' }, { status: 404 })
    }

    const unassignedChats = await removeSubaccountFromAssignments(ownerUid, subUid, ownerUid)

    const ownerSubRef = adminDb.collection('users').doc(ownerUid).collection('subaccounts').doc(subUid)
    await ownerSubRef.delete()

    const subUserRef = adminDb.collection('users').doc(subUid)
    if (typeof adminDb.recursiveDelete === 'function') {
      await adminDb.recursiveDelete(subUserRef)
    } else {
      await subUserRef.delete()
    }

    try {
      await adminAuth.deleteUser(subUid)
    } catch (error) {
      const code = extractErrorCode(error)
      if (code !== 'auth/user-not-found') {
        throw error
      }
    }

    return NextResponse.json({
      success: true,
      uid: subUid,
      unassignedChats
    })
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

function normalizePassword(value: unknown) {
  if (typeof value !== 'string') {
    return ''
  }
  return value.trim()
}

function normalizeNullableText(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed || null
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
