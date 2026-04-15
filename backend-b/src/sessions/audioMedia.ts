type ResolvedAudioMediaOptions = {
  mimeType?: string
  ptt: boolean
}

export function resolveAudioMediaOptions(buffer: Buffer, mimeType?: string): ResolvedAudioMediaOptions {
  const normalizedDeclared = normalizeDeclaredAudioMimeType(mimeType)
  const declaredBase = normalizedDeclared?.split(';')[0]?.trim()

  const inferredMimeType =
    !declaredBase || declaredBase === 'application/octet-stream' ? inferAudioMimeTypeFromBuffer(buffer) : undefined

  const resolvedMimeType = normalizeDeclaredAudioMimeType(inferredMimeType ?? normalizedDeclared)
  const ptt = shouldUsePtt(resolvedMimeType)

  return {
    ...(resolvedMimeType ? { mimeType: resolvedMimeType } : {}),
    ptt
  }
}

function normalizeDeclaredAudioMimeType(value?: string): string | undefined {
  const raw = (value ?? '').trim().toLowerCase()
  if (!raw) {
    return undefined
  }

  const [baseRaw] = raw.split(';')
  const base = normalizeBaseMimeType(baseRaw)
  if (!base) {
    return undefined
  }

  if (base === 'audio/opus' || base === 'audio/ogg') {
    return 'audio/ogg; codecs=opus'
  }

  return base
}

function normalizeBaseMimeType(value: string): string | undefined {
  const trimmed = (value ?? '').trim().toLowerCase()
  if (!trimmed) {
    return undefined
  }

  const aliasMap: Record<string, string> = {
    'audio/mp3': 'audio/mpeg',
    'audio/x-mp3': 'audio/mpeg',
    'audio/x-m4a': 'audio/mp4',
    'audio/x-wav': 'audio/wav',
    'audio/wave': 'audio/wav'
  }

  const mapped = aliasMap[trimmed] ?? trimmed
  if (mapped === 'application/octet-stream') {
    return mapped
  }

  return mapped.startsWith('audio/') ? mapped : undefined
}

function inferAudioMimeTypeFromBuffer(buffer: Buffer): string | undefined {
  if (!buffer || buffer.byteLength < 4) {
    return undefined
  }

  if (buffer.byteLength >= 4 && buffer.toString('ascii', 0, 4) === 'OggS') {
    return 'audio/ogg; codecs=opus'
  }

  if (
    buffer.byteLength >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WAVE'
  ) {
    return 'audio/wav'
  }

  if (buffer.byteLength >= 4 && buffer.toString('ascii', 0, 4) === 'fLaC') {
    return 'audio/flac'
  }

  if (
    buffer.byteLength >= 8 &&
    buffer[0] === 0xff &&
    (buffer[1] & 0xe0) === 0xe0
  ) {
    return 'audio/mpeg'
  }

  if (buffer.byteLength >= 3 && buffer.toString('ascii', 0, 3) === 'ID3') {
    return 'audio/mpeg'
  }

  if (buffer.byteLength >= 8 && buffer.toString('ascii', 4, 8) === 'ftyp') {
    return 'audio/mp4'
  }

  return undefined
}

function shouldUsePtt(mimeType?: string): boolean {
  const normalized = (mimeType ?? '').trim().toLowerCase()
  if (!normalized) {
    return false
  }

  return normalized.startsWith('audio/ogg') || normalized.includes('codecs=opus')
}
