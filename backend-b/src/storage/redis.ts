import Redis from 'ioredis'
import type { AppEnv } from '../config/env'

export function createRedisClient(env: AppEnv): Redis {
  if (!env.REDIS_URL) {
    throw new Error('REDIS_URL is required')
  }

  return new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 2
  })
}
