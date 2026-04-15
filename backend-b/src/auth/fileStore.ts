import { promises as fs } from 'fs'
import path from 'path'
import type { AuthStatePayload, AuthStateStore } from './types'
import type { AuthStateCrypto } from './crypto'

type FileAuthStateStoreOptions = {
  dir: string
  crypto: AuthStateCrypto
  ttlMs?: number
}

export class FileAuthStateStore implements AuthStateStore {
  private readonly dir: string
  private readonly crypto: AuthStateCrypto
  private readonly ttlMs: number

  constructor(options: FileAuthStateStoreOptions) {
    this.dir = options.dir
    this.crypto = options.crypto
    this.ttlMs = options.ttlMs ?? 0
  }

  async get(sessionId: string): Promise<AuthStatePayload | null> {
    const filePath = this.getFilePath(sessionId)
    const stat = await fs.stat(filePath).catch(() => null)
    if (!stat) {
      return null
    }

    if (this.ttlMs > 0 && Date.now() - stat.mtimeMs > this.ttlMs) {
      await this.safeUnlink(filePath)
      return null
    }

    try {
      const raw = await fs.readFile(filePath, 'utf8')
      const envelope = this.crypto.parse(raw)
      const decrypted = this.crypto.decrypt(envelope)
      return JSON.parse(decrypted) as AuthStatePayload
    } catch {
      await this.safeUnlink(filePath)
      return null
    }
  }

  async set(sessionId: string, state: AuthStatePayload): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true })
    const filePath = this.getFilePath(sessionId)
    const plaintext = JSON.stringify(state)
    const envelope = this.crypto.encrypt(plaintext)
    await fs.writeFile(filePath, this.crypto.serialize(envelope), 'utf8')
  }

  async delete(sessionId: string): Promise<void> {
    await this.safeUnlink(this.getFilePath(sessionId))
  }

  private getFilePath(sessionId: string) {
    const safeId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_')
    return path.join(this.dir, `${safeId}.json`)
  }

  private async safeUnlink(filePath: string) {
    await fs.unlink(filePath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') {
        throw error
      }
    })
  }
}
