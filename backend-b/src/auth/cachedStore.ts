import type { AuthStatePayload, AuthStateStore } from './types'

export class CachedAuthStateStore implements AuthStateStore {
  private readonly primary: AuthStateStore
  private readonly cache?: AuthStateStore

  constructor(primary: AuthStateStore, cache?: AuthStateStore) {
    this.primary = primary
    this.cache = cache
  }

  async get(sessionId: string): Promise<AuthStatePayload | null> {
    if (this.cache) {
      try {
        const cached = await this.cache.get(sessionId)
        if (cached) {
          return cached
        }
      } catch {
        // Ignore cache errors to keep primary path healthy.
      }
    }

    const state = await this.primary.get(sessionId)
    if (state && this.cache) {
      try {
        await this.cache.set(sessionId, state)
      } catch {
        // Ignore cache errors to keep primary path healthy.
      }
    }

    return state
  }

  async set(sessionId: string, state: AuthStatePayload): Promise<void> {
    await this.primary.set(sessionId, state)
    if (this.cache) {
      try {
        await this.cache.set(sessionId, state)
      } catch {
        // Ignore cache errors to keep primary path healthy.
      }
    }
  }

  async delete(sessionId: string): Promise<void> {
    await this.primary.delete(sessionId)
    if (this.cache) {
      try {
        await this.cache.delete(sessionId)
      } catch {
        // Ignore cache errors to keep primary path healthy.
      }
    }
  }
}
