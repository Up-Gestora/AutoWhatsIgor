import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/userBackend'
import {
  assertOwnerAccount,
  getOwnerSubaccountSettings,
  setOwnerSubaccountSettings,
  SubaccountsError
} from '@/lib/subaccountsBackend'

export const runtime = 'nodejs'

type UpdateSubaccountSettingsBody = {
  quickRepliesCrud?: boolean
}

export async function GET(request: NextRequest) {
  const auth = await requireUser(request, {
    allowSubaccount: true,
    capability: 'conversations'
  })
  if (auth instanceof NextResponse) {
    return auth
  }

  try {
    const ownerUid = auth.ownerUid.trim() || auth.uid
    const settings = await getOwnerSubaccountSettings(ownerUid)
    const canManageQuickReplies = auth.isSubaccount ? settings.quickRepliesCrud : true
    return NextResponse.json({
      success: true,
      settings,
      canManageQuickReplies
    })
  } catch (error) {
    return mapSubaccountsError(error)
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireUser(request)
  if (auth instanceof NextResponse) {
    return auth
  }

  try {
    const ownerUid = assertOwnerAccount(auth)
    const body = (await request.json().catch(() => ({}))) as UpdateSubaccountSettingsBody
    if (typeof body.quickRepliesCrud !== 'boolean') {
      return NextResponse.json({ error: 'quick_replies_crud_invalid' }, { status: 400 })
    }

    const settings = await setOwnerSubaccountSettings(
      ownerUid,
      { quickRepliesCrud: body.quickRepliesCrud },
      auth.uid
    )

    return NextResponse.json({
      success: true,
      settings,
      canManageQuickReplies: true
    })
  } catch (error) {
    return mapSubaccountsError(error)
  }
}

function mapSubaccountsError(error: unknown) {
  if (error instanceof SubaccountsError) {
    return NextResponse.json({ error: error.code }, { status: error.status })
  }

  return NextResponse.json({ error: 'subaccounts_settings_request_failed' }, { status: 500 })
}
