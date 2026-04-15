export type MetricsSnapshot = {
  startedAtMs: number
  uptimeSec: number
  counters: Record<string, number>
  gauges: Record<string, number>
}

export class MetricsStore {
  private readonly startedAtMs = Date.now()
  private readonly counters = new Map<string, number>()
  private readonly gauges = new Map<string, number>()

  increment(name: string, value = 1) {
    if (!Number.isFinite(value)) {
      return
    }
    const current = this.counters.get(name) ?? 0
    this.counters.set(name, current + value)
  }

  setGauge(name: string, value: number) {
    if (!Number.isFinite(value)) {
      return
    }
    this.gauges.set(name, value)
  }

  getCounter(name: string) {
    return this.counters.get(name) ?? 0
  }

  getGauge(name: string) {
    return this.gauges.get(name)
  }

  snapshot(): MetricsSnapshot {
    return {
      startedAtMs: this.startedAtMs,
      uptimeSec: Math.round((Date.now() - this.startedAtMs) / 1000),
      counters: Object.fromEntries(this.counters.entries()),
      gauges: Object.fromEntries(this.gauges.entries())
    }
  }
}
