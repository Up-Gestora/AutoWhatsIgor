import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/userBackend'
import {
  assertOwnerAccount,
  findInvalidOwnerSubaccountUids,
  MAX_SUBACCOUNTS_PER_OWNER,
  setChatAssignment,
  SubaccountsError
} from '@/lib/subaccountsBackend'

export const runtime = 'nodejs'

type AssignmentBody = {
  chatId?: string
  subaccountUids?: string[]
}

export async function PUT(request: NextRequest) {
  const auth = await requireUser(request)
  if (auth instanceof NextResponse) {
    return auth
  }

  try {
    const ownerUid = assertOwnerAccount(auth)
    const body = (await request.json().catch(() => ({}))) as AssignmentBody
    const chatId = typeof body.chatId === 'string' ? body.chatId.trim() : ''
    const subaccountUids = normalizeUidList(body.subaccountUids)

    if (!chatId) {
      return NextResponse.json({ error: 'chatId_required' }, { status: 400 })
    }
    if (subaccountUids.length > MAX_SUBACCOUNTS_PER_OWNER) {
      return NextResponse.json({ error: 'subaccounts_limit_reached' }, { status: 400 })
    }

    const invalidUids = await findInvalidOwnerSubaccountUids(ownerUid, subaccountUids)
    if (invalidUids.length > 0) {
      return NextResponse.json(
        { error: 'invalid_subaccount_uid', invalidSubaccountUids: invalidUids },
        { status: 400 }
      )
    }

    const assignment = await setChatAssignment(ownerUid, chatId, subaccountUids, auth.uid)
    return NextResponse.json({
      success: true,
      assignment
    })
  } catch (error) {
    return mapSubaccountsError(error)
  }
}

function normalizeUidList(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return []
  }
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of input) {
    if (typeof item !== 'string') {
      continue
    }
    const uid = item.trim()
    if (!uid || seen.has(uid)) {
      continue
    }
    seen.add(uid)
    result.push(uid)
  }
  return result
}

function mapSubaccountsError(error: unknown) {
  if (error instanceof SubaccountsError) {
    return NextResponse.json({ error: error.code }, { status: error.status })
  }
  return NextResponse.json({ error: 'subaccounts_request_failed' }, { status: 500 })
}
