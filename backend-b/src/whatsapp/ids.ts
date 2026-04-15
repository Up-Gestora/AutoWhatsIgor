export function extractWhatsappFromJid(jid: string): string | null {
  const trimmed = (jid ?? '').trim()
  if (!trimmed) {
    return null
  }

  const lower = trimmed.toLowerCase()

  // Only user JIDs map to phone numbers. Other domains (groups, broadcasts, lid, etc.)
  // do not represent a WhatsApp phone number and should not populate the CRM field.
  const isUserJid =
    lower.endsWith('@s.whatsapp.net') ||
    lower.endsWith('@c.us')

  if (!isUserJid) {
    return null
  }

  const userPart = trimmed.split('@')[0] ?? ''
  const withoutDevice = userPart.split(':')[0] ?? ''

  const digits = withoutDevice.replace(/\D/g, '')
  if (!digits) {
    return null
  }

  // E.164 max is 15 digits; avoid persisting IDs that are not phone numbers.
  if (digits.length < 7 || digits.length > 15) {
    return null
  }

  return digits
}

// Alias for clarity at call sites: this returns phone digits only (best-effort), not LIDs.
export const extractPhoneDigitsFromJid = extractWhatsappFromJid
