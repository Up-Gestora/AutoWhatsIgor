import { Pool } from 'pg'
import type { AppEnv } from '../config/env'

export function createPostgresPool(env: AppEnv): Pool {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required')
  }

  return new Pool({
    connectionString: env.DATABASE_URL
  })
}
