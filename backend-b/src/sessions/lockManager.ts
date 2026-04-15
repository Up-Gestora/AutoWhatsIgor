import crypto from 'crypto'
import type Redis from 'ioredis'

export class SessionLock {
  private readonly client: Redis
  private readonly key: string
  private readonly token: string
  private readonly ttlMs: number

  constructor(client: Redis, key: string, token: string, ttlMs: number) {
    this.client = client
    this.key = key
    this.token = token
    this.ttlMs = ttlMs
  }

  async renew(): Promise<boolean> {
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("pexpire", KEYS[1], ARGV[2])
      else
        return 0
      end
    `
    const result = await this.client.eval(script, 1, this.key, this.token, `${this.ttlMs}`)
    return Number(result) > 0
  }

  async release(): Promise<void> {
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `
    await this.client.eval(script, 1, this.key, this.token)
  }
}

export class RedisSessionLockManager {
  private readonly client: Redis
  private readonly prefix: string

  constructor(client: Redis, prefix = 'session-lock') {
    this.client = client
    this.prefix = prefix
  }

  async acquire(sessionId: string, ttlMs: number): Promise<SessionLock | null> {
    const token = crypto.randomUUID()
    const key = `${this.prefix}:${sessionId}`
    const result = await this.client.set(key, token, 'PX', ttlMs, 'NX')
    if (result !== 'OK') {
      return null
    }

    return new SessionLock(this.client, key, token, ttlMs)
  }
}
