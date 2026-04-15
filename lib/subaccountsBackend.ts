import 'server-only'
import { adminDb } from '@/lib/firebaseAdmin'
import type { UserAuthResult } from '@/lib/userBackend'

export const MAX_SUBACCOUNTS_PER_OWNER = 10

export type SubaccountPublic = {
  uid: string
  email: string
  nome: string | null
  createdAt: string | null
  updatedAt: string | null
}

export type ChatAssignment = {
  chatId: string
  subaccountUids: string[]
  updatedAt: string
  updatedByUid: string
}

export type OwnerSubaccountSettings = {
  quickRepliesCrud: boolean
}

export class SubaccountsError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, status = 400, message?: string) {
    super(message ?? code)
    this.code = code
    this.status = status
  }
}

function ensureDb() {
  if (!adminDb) {
    throw new SubaccountsError('firebase_admin_unavailable', 500)
  }
  return adminDb
}

function usersCollection() {
  return ensureDb().collection('users')
}

function ownerSubaccountsCollection(ownerUid: string) {
  return usersCollection().doc(ownerUid).collection('subaccounts')
}

function ownerAssignmentsCollection(ownerUid: string) {
  return usersCollection().doc(ownerUid).collection('chatAssignments')
}

function normalizeOwnerSubaccountSettings(data: Record<string, unknown> | undefined): OwnerSubaccountSettings {
  const rawPermissions =
    data?.subaccountPermissions && typeof data.subaccountPermissions === 'object' && !Array.isArray(data.subaccountPermissions)
      ? (data.subaccountPermissions as Record<string, unknown>)
      : undefined

  return {
    quickRepliesCrud: rawPermissions?.quickRepliesCrud === true
  }
}

function sanitizeUidList(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return []
  }
  const seen = new Set<string>()
  const output: string[] = []
  for (const value of input) {
    if (typeof value !== 'string') {
      continue
    }
    const uid = value.trim()
    if (!uid || seen.has(uid)) {
      continue
    }
    seen.add(uid)
    output.push(uid)
  }
  return output
}

function toSubaccountPublic(
  uid: string,
  data: Record<string, unknown> | undefined
): SubaccountPublic {
  const email = typeof data?.email === 'string' ? data.email.trim() : ''
  const nome = typeof data?.nome === 'string' ? data.nome.trim() : ''
  const createdAt = typeof data?.createdAt === 'string' ? data.createdAt : null
  const updatedAt = typeof data?.updatedAt === 'string' ? data.updatedAt : null

  return {
    uid,
    email,
    nome: nome || null,
    createdAt,
    updatedAt
  }
}

function toChatAssignment(chatId: string, data: Record<string, unknown> | undefined): ChatAssignment {
  const updatedAt = typeof data?.updatedAt === 'string' ? data.updatedAt : new Date().toISOString()
  const updatedByUid = typeof data?.updatedByUid === 'string' ? data.updatedByUid : ''
  return {
    chatId,
    subaccountUids: sanitizeUidList(data?.subaccountUids),
    updatedAt,
    updatedByUid
  }
}

export function assertOwnerAccount(auth: UserAuthResult): string {
  if (auth.isSubaccount) {
    throw new SubaccountsError('subaccount_forbidden', 403)
  }
  return auth.uid
}

export async function listOwnerSubaccounts(ownerUid: string): Promise<SubaccountPublic[]> {
  const snapshot = await ownerSubaccountsCollection(ownerUid).get()
  const items = snapshot.docs.map((doc) =>
    toSubaccountPublic(doc.id, doc.data() as Record<string, unknown>)
  )

  items.sort((a, b) => {
    const aTime = a.createdAt ? Date.parse(a.createdAt) : 0
    const bTime = b.createdAt ? Date.parse(b.createdAt) : 0
    return aTime - bTime
  })

  return items
}

export async function getOwnerSubaccount(
  ownerUid: string,
  subUid: string
): Promise<SubaccountPublic | null> {
  const normalized = subUid.trim()
  if (!normalized) {
    return null
  }

  const doc = await ownerSubaccountsCollection(ownerUid).doc(normalized).get()
  if (!doc.exists) {
    return null
  }

  return toSubaccountPublic(doc.id, doc.data() as Record<string, unknown>)
}

export async function findInvalidOwnerSubaccountUids(
  ownerUid: string,
  subUids: string[]
): Promise<string[]> {
  const unique = sanitizeUidList(subUids)
  if (unique.length === 0) {
    return []
  }

  const refs = unique.map((uid) => ownerSubaccountsCollection(ownerUid).doc(uid))
  const snapshots = await Promise.all(refs.map((ref) => ref.get()))
  const invalid: string[] = []
  snapshots.forEach((snapshot, index) => {
    if (!snapshot.exists) {
      invalid.push(unique[index])
    }
  })

  return invalid
}

export async function listAssignedChatIdsForSubaccount(
  ownerUid: string,
  subUid: string
): Promise<string[]> {
  const normalizedSubUid = subUid.trim()
  if (!normalizedSubUid) {
    return []
  }

  const snapshot = await ownerAssignmentsCollection(ownerUid)
    .where('subaccountUids', 'array-contains', normalizedSubUid)
    .get()

  return snapshot.docs
    .map((doc) => {
      const rawChatId = typeof doc.data().chatId === 'string' ? doc.data().chatId : doc.id
      return rawChatId.trim()
    })
    .filter(Boolean)
}

export async function isChatAssignedToSubaccount(
  ownerUid: string,
  subUid: string,
  chatId: string
): Promise<boolean> {
  const safeChatId = chatId.trim()
  const safeSubUid = subUid.trim()
  if (!safeChatId || !safeSubUid) {
    return false
  }

  const snapshot = await ownerAssignmentsCollection(ownerUid).doc(safeChatId).get()
  if (!snapshot.exists) {
    return false
  }

  const data = snapshot.data() as Record<string, unknown> | undefined
  const assigned = sanitizeUidList(data?.subaccountUids)
  return assigned.includes(safeSubUid)
}

export async function getAssignedSubaccountsByChatIds(
  ownerUid: string,
  chatIds: string[]
): Promise<Record<string, string[]>> {
  const safeChatIds = Array.from(
    new Set(
      chatIds
        .filter((entry) => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  )

  if (safeChatIds.length === 0) {
    return {}
  }

  const refs = safeChatIds.map((chatId) => ownerAssignmentsCollection(ownerUid).doc(chatId))
  const snapshots = await Promise.all(refs.map((ref) => ref.get()))
  const output: Record<string, string[]> = {}

  snapshots.forEach((snapshot, index) => {
    const chatId = safeChatIds[index]
    if (!snapshot.exists) {
      output[chatId] = []
      return
    }
    const data = snapshot.data() as Record<string, unknown> | undefined
    output[chatId] = sanitizeUidList(data?.subaccountUids)
  })

  return output
}

export async function setChatAssignment(
  ownerUid: string,
  chatId: string,
  subaccountUids: string[],
  updatedByUid: string
): Promise<ChatAssignment> {
  const safeChatId = chatId.trim()
  if (!safeChatId) {
    throw new SubaccountsError('chatId_required', 400)
  }

  const safeSubaccountUids = sanitizeUidList(subaccountUids)
  const nowIso = new Date().toISOString()
  const docRef = ownerAssignmentsCollection(ownerUid).doc(safeChatId)

  if (safeSubaccountUids.length === 0) {
    await docRef.delete()
    return {
      chatId: safeChatId,
      subaccountUids: [],
      updatedAt: nowIso,
      updatedByUid
    }
  }

  const assignment: ChatAssignment = {
    chatId: safeChatId,
    subaccountUids: safeSubaccountUids,
    updatedAt: nowIso,
    updatedByUid
  }

  await docRef.set(assignment, { merge: true })
  return assignment
}

export async function removeSubaccountFromAssignments(
  ownerUid: string,
  subUid: string,
  updatedByUid: string
): Promise<number> {
  const normalizedSubUid = subUid.trim()
  if (!normalizedSubUid) {
    return 0
  }

  const snapshot = await ownerAssignmentsCollection(ownerUid)
    .where('subaccountUids', 'array-contains', normalizedSubUid)
    .get()

  if (snapshot.empty) {
    return 0
  }

  const nowIso = new Date().toISOString()
  let affected = 0

  for (const doc of snapshot.docs) {
    const current = sanitizeUidList(doc.data().subaccountUids)
    const next = current.filter((uid) => uid !== normalizedSubUid)
    if (next.length === 0) {
      await doc.ref.delete()
    } else {
      await doc.ref.set(
        {
          subaccountUids: next,
          updatedAt: nowIso,
          updatedByUid
        },
        { merge: true }
      )
    }
    affected += 1
  }

  return affected
}

export async function getChatAssignment(
  ownerUid: string,
  chatId: string
): Promise<ChatAssignment | null> {
  const safeChatId = chatId.trim()
  if (!safeChatId) {
    return null
  }

  const snapshot = await ownerAssignmentsCollection(ownerUid).doc(safeChatId).get()
  if (!snapshot.exists) {
    return null
  }

  return toChatAssignment(safeChatId, snapshot.data() as Record<string, unknown>)
}

export async function getOwnerSubaccountSettings(ownerUid: string): Promise<OwnerSubaccountSettings> {
  const safeOwnerUid = ownerUid.trim()
  if (!safeOwnerUid) {
    throw new SubaccountsError('owner_uid_required', 400)
  }

  const snapshot = await usersCollection().doc(safeOwnerUid).get()
  const data = snapshot.exists ? (snapshot.data() as Record<string, unknown> | undefined) : undefined
  return normalizeOwnerSubaccountSettings(data)
}

export async function setOwnerSubaccountSettings(
  ownerUid: string,
  settings: OwnerSubaccountSettings,
  updatedByUid: string
): Promise<OwnerSubaccountSettings> {
  const safeOwnerUid = ownerUid.trim()
  if (!safeOwnerUid) {
    throw new SubaccountsError('owner_uid_required', 400)
  }
  if (typeof settings.quickRepliesCrud !== 'boolean') {
    throw new SubaccountsError('quick_replies_crud_invalid', 400)
  }

  const safeUpdatedByUid = updatedByUid.trim()
  const updatedAt = new Date().toISOString()
  const nextSettings: OwnerSubaccountSettings = {
    quickRepliesCrud: settings.quickRepliesCrud === true
  }

  const payload: Record<string, unknown> = {
    'subaccountPermissions.quickRepliesCrud': nextSettings.quickRepliesCrud,
    'subaccountPermissions.quickRepliesCrudUpdatedAt': updatedAt,
    updatedAt
  }
  if (safeUpdatedByUid) {
    payload['subaccountPermissions.quickRepliesCrudUpdatedByUid'] = safeUpdatedByUid
  }

  await usersCollection().doc(safeOwnerUid).set(payload, { merge: true })
  return nextSettings
}
