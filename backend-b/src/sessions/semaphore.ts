export class AsyncSemaphore {
  private readonly max: number
  private active = 0
  private queue: Array<() => void> = []

  constructor(max: number) {
    if (max <= 0) {
      throw new Error('Semaphore max must be positive')
    }
    this.max = max
  }

  async acquire(): Promise<() => void> {
    if (this.active < this.max) {
      this.active += 1
      return () => this.release()
    }

    return new Promise((resolve) => {
      this.queue.push(() => {
        this.active += 1
        resolve(() => this.release())
      })
    })
  }

  private release() {
    this.active = Math.max(0, this.active - 1)
    const next = this.queue.shift()
    if (next) {
      next()
    }
  }

  snapshot() {
    return {
      max: this.max,
      active: this.active,
      queued: this.queue.length
    }
  }
}
