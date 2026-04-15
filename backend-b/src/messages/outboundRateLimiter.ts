import type Redis from 'ioredis'

type OutboundRateLimiterOptions = {
  redis: Redis
  sessionIntervalMs: number
  chatIntervalMs: number
  keyPrefix?: string
}

export class OutboundRateLimiter {
  private readonly redis: Redis
  private readonly sessionIntervalMs: number
  private readonly chatIntervalMs: number
  private readonly keyPrefix: string

  constructor(options: OutboundRateLimiterOptions) {
    this.redis = options.redis
    this.sessionIntervalMs = Math.max(0, options.sessionIntervalMs)
    this.chatIntervalMs = Math.max(0, options.chatIntervalMs)
    this.keyPrefix = options.keyPrefix ?? 'outbound-rate'
  }

  async allow(sessionId: string, chatId: string): Promise<boolean> {
    if (this.sessionIntervalMs <= 0 && this.chatIntervalMs <= 0) {
      return true
    }

    const sessionKey = `${this.keyPrefix}:session:${sessionId}`
    const chatKey = `${this.keyPrefix}:chat:${sessionId}:${encodeURIComponent(chatId)}`
    const script = `
      local sessionTtl = tonumber(ARGV[1])
      local chatTtl = tonumber(ARGV[2])
      if sessionTtl > 0 then
        if redis.call("exists", KEYS[1]) == 1 then
          return 0
        end
      end
      if chatTtl > 0 then
        if redis.call("exists", KEYS[2]) == 1 then
          return 0
        end
      end
      if sessionTtl > 0 then
        redis.call("psetex", KEYS[1], sessionTtl, "1")
      end
      if chatTtl > 0 then
        redis.call("psetex", KEYS[2], chatTtl, "1")
      end
      return 1
    `

    const result = await this.redis.eval(script, 2, sessionKey, chatKey, `${this.sessionIntervalMs}`, `${this.chatIntervalMs}`)
    return Number(result) === 1
  }
}
