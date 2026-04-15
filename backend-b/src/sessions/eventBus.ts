import crypto from 'crypto'

type SendFn = (event: string, data: unknown) => void

type Subscriber = {
  id: string
  send: SendFn
}

export class SessionEventBus {
  private readonly subscribers = new Map<string, Map<string, Subscriber>>()

  addSubscriber(sessionId: string, send: SendFn): () => void {
    const id = crypto.randomUUID()
    const entry = this.subscribers.get(sessionId) ?? new Map<string, Subscriber>()
    entry.set(id, { id, send })
    this.subscribers.set(sessionId, entry)

    return () => {
      const bucket = this.subscribers.get(sessionId)
      if (!bucket) {
        return
      }
      bucket.delete(id)
      if (bucket.size === 0) {
        this.subscribers.delete(sessionId)
      }
    }
  }

  emit(sessionId: string, event: string, data: unknown) {
    const bucket = this.subscribers.get(sessionId)
    if (!bucket) {
      return
    }

    for (const subscriber of bucket.values()) {
      subscriber.send(event, data)
    }
  }

  getStats() {
    const sessions: Record<string, number> = {}
    for (const [sessionId, bucket] of this.subscribers.entries()) {
      sessions[sessionId] = bucket.size
    }
    return {
      sessions
    }
  }
}
