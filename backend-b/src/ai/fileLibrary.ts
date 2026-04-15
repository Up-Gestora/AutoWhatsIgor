import { getFirestoreAdmin } from '../firebase/admin'

export type AiUserFileType = 'image' | 'video' | 'audio' | 'document'

export type AiUserFile = {
  id: string
  nome: string
  descricao: string
  quandoUsar: string
  tipo: AiUserFileType
  mimeType: string
  sizeBytes: number
  downloadUrl: string
  storagePath: string
  updatedAtMs: number | null
}

type CacheEntry = {
  expiresAt: number
  files: AiUserFile[]
  byId: Map<string, AiUserFile>
}

type AiFileLibraryOptions = {
  ttlMs?: number
  maxFiles?: number
}

function toMillis(value: unknown): number | null {
  if (!value) {
    return null
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : parsed
  }
  if (typeof value === 'object') {
    const asAny = value as { toMillis?: () => number; seconds?: number; nanoseconds?: number }
    if (typeof asAny.toMillis === 'function') {
      return asAny.toMillis()
    }
    if (typeof asAny.seconds === 'number') {
      const nanos = typeof asAny.nanoseconds === 'number' ? asAny.nanoseconds : 0
      return asAny.seconds * 1000 + Math.floor(nanos / 1e6)
    }
  }
  return null
}

function normalizeType(value: unknown): AiUserFileType | null {
  if (typeof value !== 'string') {
    return null
  }
  const normalized = value.trim().toLowerCase()
  if (normalized === 'image') return 'image'
  if (normalized === 'video') return 'video'
  if (normalized === 'audio') return 'audio'
  if (normalized === 'document' || normalized === 'pdf') return 'document'
  return null
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function getNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export class AiFileLibrary {
  private readonly ttlMs: number
  private readonly maxFiles: number
  private readonly cache = new Map<string, CacheEntry>()

  constructor(options: AiFileLibraryOptions = {}) {
    this.ttlMs = Math.max(0, options.ttlMs ?? 60_000)
    this.maxFiles = Math.max(1, options.maxFiles ?? 100)
  }

  async list(sessionId: string, limit = 25): Promise<AiUserFile[]> {
    const safeSessionId = sessionId.trim()
    if (!safeSessionId) {
      return []
    }

    const now = Date.now()
    const cached = this.cache.get(safeSessionId)
    if (cached && cached.expiresAt > now) {
      return cached.files.slice(0, Math.max(0, limit))
    }

    const db = getFirestoreAdmin()
    if (!db) {
      return []
    }

    let snapshots
    try {
      snapshots = await db
        .collection('users')
        .doc(safeSessionId)
        .collection('arquivos')
        .orderBy('updatedAt', 'desc')
        .limit(this.maxFiles)
        .get()
    } catch {
      snapshots = await db
        .collection('users')
        .doc(safeSessionId)
        .collection('arquivos')
        .limit(this.maxFiles)
        .get()
    }

    const files: AiUserFile[] = []
    const byId = new Map<string, AiUserFile>()

    for (const snap of snapshots.docs) {
      const data = snap.data() as Record<string, unknown>
      const tipo = normalizeType(data.tipo)
      const downloadUrl = getString(data.downloadUrl).trim()
      if (!tipo || !downloadUrl) {
        continue
      }

      const file: AiUserFile = {
        id: snap.id,
        nome: getString(data.nome).trim(),
        descricao: getString(data.descricao).trim(),
        quandoUsar: getString(data.quandoUsar).trim(),
        tipo,
        mimeType: getString(data.mimeType).trim(),
        sizeBytes: getNumber(data.sizeBytes),
        downloadUrl,
        storagePath: getString(data.storagePath).trim(),
        updatedAtMs: toMillis(data.updatedAt) ?? toMillis(data.createdAt)
      }

      if (!file.nome) {
        continue
      }

      files.push(file)
      byId.set(file.id, file)
    }

    files.sort((a, b) => (b.updatedAtMs ?? 0) - (a.updatedAtMs ?? 0))

    this.cache.set(safeSessionId, {
      expiresAt: now + this.ttlMs,
      files,
      byId
    })

    return files.slice(0, Math.max(0, limit))
  }

  async get(sessionId: string, fileId: string): Promise<AiUserFile | null> {
    const safeSessionId = sessionId.trim()
    const safeFileId = fileId.trim()
    if (!safeSessionId || !safeFileId) {
      return null
    }

    const now = Date.now()
    const cached = this.cache.get(safeSessionId)
    if (cached && cached.expiresAt > now) {
      return cached.byId.get(safeFileId) ?? null
    }

    // Refresh cache with the latest list so callers that use get() first don't
    // poison list() results for the TTL window.
    await this.list(safeSessionId, this.maxFiles)
    const refreshed = this.cache.get(safeSessionId)
    if (refreshed && refreshed.expiresAt > Date.now()) {
      const hit = refreshed.byId.get(safeFileId)
      if (hit) {
        return hit
      }
    }

    const db = getFirestoreAdmin()
    if (!db) {
      return null
    }

    const snap = await db
      .collection('users')
      .doc(safeSessionId)
      .collection('arquivos')
      .doc(safeFileId)
      .get()

    if (!snap.exists) {
      return null
    }

    const data = snap.data() as Record<string, unknown>
    const tipo = normalizeType(data.tipo)
    const downloadUrl = getString(data.downloadUrl).trim()
    if (!tipo || !downloadUrl) {
      return null
    }

    const file: AiUserFile = {
      id: snap.id,
      nome: getString(data.nome).trim(),
      descricao: getString(data.descricao).trim(),
      quandoUsar: getString(data.quandoUsar).trim(),
      tipo,
      mimeType: getString(data.mimeType).trim(),
      sizeBytes: getNumber(data.sizeBytes),
      downloadUrl,
      storagePath: getString(data.storagePath).trim(),
      updatedAtMs: toMillis(data.updatedAt) ?? toMillis(data.createdAt)
    }

    if (!file.nome) {
      return null
    }

    // Merge into cache if present (best effort).
    const entry = this.cache.get(safeSessionId)
    if (entry) {
      entry.byId.set(file.id, file)
      entry.files.unshift(file)
    }

    return file
  }
}
