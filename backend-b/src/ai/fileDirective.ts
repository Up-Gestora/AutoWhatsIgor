const FILE_DIRECTIVE_RE = /\[ENVIAR_ARQUIVO:([^\]\s]+)\]/g
const CONTACT_DIRECTIVE_RE = /\[ENVIAR_CONTATO:([^\]\r\n]+)\]/g
const SPLIT_DIRECTIVE_RE = /\[\s*(?:SEPARAR|SEPARATE)\s*\]|\*\*\s*(?:SEPARAR|SEPARATE)\s*\*\*|^\s*(?:SEPARAR|SEPARATE)\s*$/gim
const ORDERED_DIRECTIVE_RE =
  /\[ENVIAR_ARQUIVO:([^\]\s]+)\]|\[ENVIAR_CONTATO:([^\]\r\n]+)\]|\[\s*(?:SEPARAR|SEPARATE)\s*\]|\*\*\s*(?:SEPARAR|SEPARATE)\s*\*\*|^\s*(?:SEPARAR|SEPARATE)\s*$/gim
const MAX_CONTACT_DIRECTIVES = 3

export type SendDirectiveContact = {
  name: string
  whatsapp: string
}

export type ReplySendItem = { type: 'text'; text: string } | { type: 'file'; fileId: string }

export type ExtractOrderedSendSequenceResult = {
  cleanedReply: string
  items: ReplySendItem[]
  fileIds: string[]
  contacts: SendDirectiveContact[]
}

export type ExtractSendDirectivesResult = {
  cleanedReply: string
  fileIds: string[]
  contacts: SendDirectiveContact[]
}

export function extractOrderedSendSequence(
  reply: string,
  options: { maxContacts?: number } = {}
): ExtractOrderedSendSequenceResult {
  const text = String(reply ?? '').replace(/\r\n/g, '\n')
  const items: ReplySendItem[] = []
  const fileIds: string[] = []
  const contacts: SendDirectiveContact[] = []
  const seenFiles = new Set<string>()
  let lastIndex = 0
  let buffer = ''

  for (const match of text.matchAll(ORDERED_DIRECTIVE_RE)) {
    const start = match.index ?? 0
    buffer += text.slice(lastIndex, start)
    pushTextItem(items, buffer)
    buffer = ''
    lastIndex = start + match[0].length

    const rawFileId = match[1]
    if (rawFileId) {
      const fileId = rawFileId.trim()
      if (!fileId || seenFiles.has(fileId)) {
        continue
      }
      seenFiles.add(fileId)
      fileIds.push(fileId)
      items.push({ type: 'file', fileId })
      continue
    }

    const rawContact = match[2]
    if (!rawContact) {
      continue
    }

    const parsed = parseContactDirective(rawContact)
    if (parsed) {
      contacts.push(parsed)
    }
  }

  buffer += text.slice(lastIndex)
  pushTextItem(items, buffer)

  const uniqueContacts = dedupeContacts(contacts)
  const maxContacts = Math.max(1, Math.floor(options.maxContacts ?? MAX_CONTACT_DIRECTIVES))
  const limitedContacts = uniqueContacts.slice(0, maxContacts)
  const cleanedReply = items
    .filter((item): item is Extract<ReplySendItem, { type: 'text' }> => item.type === 'text')
    .map((item) => item.text)
    .join('\n\n')
    .trim()

  return {
    cleanedReply,
    items,
    fileIds,
    contacts: limitedContacts
  }
}

export function extractSendDirectives(
  reply: string,
  options: { maxContacts?: number } = {}
): ExtractSendDirectivesResult {
  const { cleanedReply, fileIds, contacts } = extractOrderedSendSequence(reply, options)
  return {
    cleanedReply,
    fileIds,
    contacts
  }
}

export function extractFileDirectives(reply: string): { cleanedReply: string; fileIds: string[] } {
  const result = extractSendDirectives(reply)
  return {
    cleanedReply: result.cleanedReply,
    fileIds: result.fileIds
  }
}

function parseContactDirective(raw: string): SendDirectiveContact | null {
  const value = raw.trim()
  if (!value) {
    return null
  }

  const separator = value.lastIndexOf('|')
  if (separator <= 0 || separator >= value.length - 1) {
    return null
  }

  const name = value.slice(0, separator).trim()
  const whatsapp = value.slice(separator + 1).replace(/\D/g, '')
  if (!name || whatsapp.length < 10 || whatsapp.length > 15) {
    return null
  }

  return { name, whatsapp }
}

function pushTextItem(items: ReplySendItem[], raw: string) {
  const text = normalizeTextChunk(raw)
  if (!text) {
    return
  }
  items.push({ type: 'text', text })
}

function normalizeTextChunk(value: string): string {
  return value
    .replace(FILE_DIRECTIVE_RE, '')
    .replace(CONTACT_DIRECTIVE_RE, '')
    .replace(SPLIT_DIRECTIVE_RE, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function dedupeContacts(contacts: SendDirectiveContact[]): SendDirectiveContact[] {
  const uniqueContacts: SendDirectiveContact[] = []
  const seenWhatsapps = new Set<string>()
  for (const contact of contacts) {
    if (!contact.name || !contact.whatsapp || seenWhatsapps.has(contact.whatsapp)) {
      continue
    }
    seenWhatsapps.add(contact.whatsapp)
    uniqueContacts.push(contact)
  }
  return uniqueContacts
}

export { FILE_DIRECTIVE_RE, CONTACT_DIRECTIVE_RE, SPLIT_DIRECTIVE_RE, MAX_CONTACT_DIRECTIVES }
