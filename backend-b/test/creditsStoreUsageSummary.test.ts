import assert from 'node:assert/strict'
import test from 'node:test'
import { CreditsStore } from '../src/credits/store'

type QueryResult = { rowCount: number; rows: Array<Record<string, unknown>> }

class FakePool {
  async query(sql: string, _params: unknown[] = []): Promise<QueryResult> {
    const normalized = sql.trim().toUpperCase()

    if (normalized.includes('SUM(CASE WHEN DELTA_BRL < 0 THEN -DELTA_BRL ELSE 0 END)') && !normalized.includes('GROUP BY')) {
      return {
        rowCount: 1,
        rows: [
          {
            cost_brl: 0.02,
            events: 2
          }
        ]
      }
    }

    if (normalized.includes('GROUP BY DAY_LOCAL')) {
      return {
        rowCount: 2,
        rows: [
          {
            day_local: new Date('2026-02-10T00:00:00.000Z'),
            cost_brl: 0.01,
            events: 1
          },
          {
            day_local: new Date('2026-02-11T00:00:00.000Z'),
            cost_brl: 0.01,
            events: 1
          }
        ]
      }
    }

    throw new Error(`Unsupported query: ${sql}`)
  }

  async connect() {
    return {
      query: this.query.bind(this),
      release: () => undefined
    }
  }
}

test('CreditsStore.getUsageCostByReason returns aggregated debit cost and event count', async () => {
  const store = new CreditsStore({ pool: new FakePool() as any })
  const summary = await store.getUsageCostByReason('session-1', 1, 2, 'broadcast_transmission')

  assert.equal(summary.costBrl, 0.02)
  assert.equal(summary.events, 2)
})

test('CreditsStore.getUsageDailySeriesByReason returns day-series with BRL costs', async () => {
  const store = new CreditsStore({ pool: new FakePool() as any })
  const series = await store.getUsageDailySeriesByReason('session-1', 1, 2, 'broadcast_transmission')

  assert.deepEqual(series, [
    { day: '2026-02-10', costBrl: 0.01, events: 1 },
    { day: '2026-02-11', costBrl: 0.01, events: 1 }
  ])
})
