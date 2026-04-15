import path from 'path'
import type { AppEnv } from '../config/env'
import type { Pool } from 'pg'
import { createPostgresPool } from '../storage/postgres'
import { AuthStateCrypto } from './crypto'
import { CachedAuthStateStore } from './cachedStore'
import { FileAuthStateStore } from './fileStore'
import { PostgresAuthStateStore } from './postgresStore'

export type AuthStateStores = {
  store: CachedAuthStateStore
  primary: PostgresAuthStateStore
  cache?: FileAuthStateStore
}

export async function buildAuthStateStores(env: AppEnv, pool?: Pool): Promise<AuthStateStores> {
  if (!env.AUTH_ENCRYPTION_KEY) {
    throw new Error('AUTH_ENCRYPTION_KEY is required')
  }

  const crypto = AuthStateCrypto.fromSecret(env.AUTH_ENCRYPTION_KEY)
  const activePool = pool ?? createPostgresPool(env)
  const primary = new PostgresAuthStateStore({
    pool: activePool,
    crypto,
    tableName: env.AUTH_STATE_TABLE
  })
  await primary.init()

  const cacheDir = env.AUTH_CACHE_DIR ?? path.join(env.SESSIONS_DIR, 'auth-cache')
  const cache = new FileAuthStateStore({
    dir: cacheDir,
    crypto,
    ttlMs: env.AUTH_CACHE_TTL_MS
  })

  return {
    store: new CachedAuthStateStore(primary, cache),
    primary,
    cache
  }
}

export async function buildAuthStateStore(env: AppEnv, pool?: Pool) {
  const stores = await buildAuthStateStores(env, pool)
  return stores.store
}
