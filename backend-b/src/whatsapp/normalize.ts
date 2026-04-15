export function normalizeWhatsappToE164Digits(
  input: string,
  defaultCountryCode: string,
  options?: { brStripNinthDigit?: boolean }
): string {
  const raw = (input ?? '').trim()
  if (!raw) {
    throw new Error('invalid_whatsapp')
  }

  const digits = raw.replace(/\D/g, '')
  if (!digits) {
    throw new Error('invalid_whatsapp')
  }

  const isInternational = raw.startsWith('+')
  const country = (defaultCountryCode ?? '').replace(/\D/g, '')
  let normalized = digits

  // If the number is not explicitly international (+), accept BR-style inputs without the DDI:
  // - 10 digits: DDD + landline/legacy (8 digits)
  // - 11 digits: DDD + mobile (9 digits)
  if (!isInternational && (digits.length === 10 || digits.length === 11)) {
    if (!country) {
      throw new Error('invalid_default_country_code')
    }
    normalized = `${country}${digits}`
  }

  // Optional Brazil-specific fix: strip the 9th digit (right after DDD) for +55 numbers.
  if (options?.brStripNinthDigit && normalized.startsWith('55') && normalized.length === 13) {
    // 55 + DDD(2) + 9 + XXXXXXXX(8)
    if (normalized[4] === '9') {
      normalized = `${normalized.slice(0, 4)}${normalized.slice(5)}`
    }
  }

  if (normalized.length < 7 || normalized.length > 15) {
    throw new Error('invalid_whatsapp')
  }

  return normalized
}

export function toUserJid(e164Digits: string): string {
  const trimmed = (e164Digits ?? '').trim()
  if (!trimmed) {
    throw new Error('invalid_whatsapp')
  }
  return `${trimmed}@s.whatsapp.net`
}

