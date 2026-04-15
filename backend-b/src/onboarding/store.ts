import type { Pool } from 'pg'
import type {
  AcquisitionFunnelGroupBy,
  AcquisitionFunnelRow,
  OnboardingCohort,
  OnboardingEventInput,
  OnboardingEventName,
  OnboardingEventRecord,
  OnboardingFunnelCohort
} from './types'

type OnboardingStoreOptions = {
  pool: Pool
  tableName?: string
}

const STAGE_EVENT_NAMES = [
  'whatsapp_saved',
  'whatsapp_connected',
  'training_score_70_reached',
  'ai_enabled',
  'first_ai_response_sent'
] as const

const ACQUISITION_STAGE_EVENT_NAMES = [
  'whatsapp_connected',
  'training_score_70_reached',
  'first_ai_response_sent',
  'account_activated_7d'
] as const

const SIGNUP_FALLBACK_EVENT_NAMES = ['dashboard_home_viewed', ...STAGE_EVENT_NAMES] as const
const SIGNUP_CANDIDATE_EVENT_NAMES = ['signup_completed', ...SIGNUP_FALLBACK_EVENT_NAMES] as const

const COHORT_DATE_TRUNC: Record<OnboardingCohort, 'day' | 'week' | 'month'> = {
  day: 'day',
  week: 'week',
  month: 'month'
}

export class OnboardingStore {
  private readonly pool: Pool
  private readonly tableName: string

  constructor(options: OnboardingStoreOptions) {
    this.pool = options.pool
    this.tableName = options.tableName ?? 'onboarding_events'
  }

  async init(): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${table} (
        id BIGSERIAL PRIMARY KEY,
        session_id TEXT NOT NULL,
        event_id TEXT NOT NULL,
        event_name TEXT NOT NULL,
        event_source TEXT NOT NULL,
        occurred_at TIMESTAMPTZ NOT NULL,
        properties JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`
    )

    await this.pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.tableName}_event_id_uidx`)}
       ON ${table} (event_id)`
    )
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.tableName}_session_occurred_idx`)}
       ON ${table} (session_id, occurred_at DESC)`
    )
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.tableName}_name_occurred_idx`)}
       ON ${table} (event_name, occurred_at DESC)`
    )
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.tableName}_session_name_occurred_idx`)}
       ON ${table} (session_id, event_name, occurred_at DESC)`
    )
  }

  async insertEvent(input: OnboardingEventInput): Promise<{ recorded: boolean; record: OnboardingEventRecord | null }> {
    const sessionId = input.sessionId.trim()
    const eventId = input.eventId.trim()
    if (!sessionId) {
      throw new Error('sessionId is required')
    }
    if (!eventId) {
      throw new Error('eventId is required')
    }

    const table = this.quoteIdentifier(this.tableName)
    const result = await this.pool.query(
      `INSERT INTO ${table} (
        session_id,
        event_id,
        event_name,
        event_source,
        occurred_at,
        properties
      ) VALUES (
        $1, $2, $3, $4, to_timestamp($5 / 1000.0), $6::jsonb
      )
      ON CONFLICT (event_id) DO NOTHING
      RETURNING id, session_id, event_id, event_name, event_source, occurred_at, properties, created_at`,
      [
        sessionId,
        eventId,
        input.eventName,
        input.eventSource,
        input.occurredAtMs,
        JSON.stringify(input.properties ?? {})
      ]
    )

    if ((result.rowCount ?? 0) <= 0) {
      return { recorded: false, record: null }
    }

    return {
      recorded: true,
      record: this.mapRow(result.rows[0])
    }
  }

  async hasEventForSession(sessionId: string, eventName: OnboardingEventName): Promise<boolean> {
    const safeSessionId = sessionId.trim()
    if (!safeSessionId) {
      return false
    }

    const table = this.quoteIdentifier(this.tableName)
    const result = await this.pool.query(
      `SELECT 1
       FROM ${table}
       WHERE session_id = $1
         AND event_name = $2
       LIMIT 1`,
      [safeSessionId, eventName]
    )

    return (result.rowCount ?? 0) > 0
  }

  async getFirstEventAtByNames(
    sessionId: string,
    eventNames: readonly OnboardingEventName[]
  ): Promise<Partial<Record<OnboardingEventName, number>>> {
    const safeSessionId = sessionId.trim()
    if (!safeSessionId || eventNames.length === 0) {
      return {}
    }

    const table = this.quoteIdentifier(this.tableName)
    const result = await this.pool.query(
      `SELECT event_name, MIN(occurred_at) AS occurred_at
       FROM ${table}
       WHERE session_id = $1
         AND event_name = ANY($2::text[])
       GROUP BY event_name`,
      [safeSessionId, eventNames]
    )

    const output: Partial<Record<OnboardingEventName, number>> = {}
    for (const row of result.rows) {
      const eventName = String(row.event_name ?? '').trim() as OnboardingEventName
      const occurredAt = row.occurred_at instanceof Date ? row.occurred_at.getTime() : Date.parse(String(row.occurred_at))
      if (eventName && Number.isFinite(occurredAt)) {
        output[eventName] = occurredAt
      }
    }
    return output
  }

  async getLatestTrainingScore(sessionId: string): Promise<number | null> {
    const safeSessionId = sessionId.trim()
    if (!safeSessionId) {
      return null
    }

    const table = this.quoteIdentifier(this.tableName)
    const result = await this.pool.query(
      `SELECT properties->>'score' AS score
       FROM ${table}
       WHERE session_id = $1
         AND event_name = 'training_score_updated'
       ORDER BY occurred_at DESC, id DESC
       LIMIT 1`,
      [safeSessionId]
    )

    if ((result.rowCount ?? 0) <= 0) {
      return null
    }
    const parsed = Number(result.rows[0]?.score)
    if (!Number.isFinite(parsed)) {
      return null
    }
    return Math.max(0, Math.min(100, parsed))
  }

  async getFunnelByCohort(fromMs: number, toMs: number, cohort: OnboardingCohort): Promise<OnboardingFunnelCohort[]> {
    const startMs = Math.min(fromMs, toMs)
    const endMs = Math.max(fromMs, toMs)
    const cohortDateTrunc = COHORT_DATE_TRUNC[cohort] ?? 'week'
    const table = this.quoteIdentifier(this.tableName)

    const result = await this.pool.query(
      `WITH signup_candidates AS (
         SELECT
           session_id,
           MIN(occurred_at) FILTER (WHERE event_name = 'signup_completed') AS signup_completed_at,
           MIN(occurred_at) FILTER (WHERE event_name = ANY($4::text[])) AS fallback_at
         FROM ${table}
         WHERE occurred_at >= to_timestamp($1 / 1000.0)
           AND occurred_at <= to_timestamp($2 / 1000.0)
           AND event_name = ANY($5::text[])
         GROUP BY session_id
       ),
       signups AS (
         SELECT
           session_id,
           COALESCE(signup_completed_at, fallback_at) AS signup_at
         FROM signup_candidates
         WHERE COALESCE(signup_completed_at, fallback_at) IS NOT NULL
       ),
       stages AS (
         SELECT
           s.session_id,
           s.signup_at,
           date_trunc('${cohortDateTrunc}', s.signup_at) AS cohort_start,
           MIN(CASE WHEN e.event_name = 'whatsapp_saved' THEN e.occurred_at END) AS whatsapp_saved_at,
           MIN(CASE WHEN e.event_name = 'whatsapp_connected' THEN e.occurred_at END) AS whatsapp_connected_at,
           MIN(CASE WHEN e.event_name = 'training_score_70_reached' THEN e.occurred_at END) AS training_score_70_reached_at,
           MIN(CASE WHEN e.event_name = 'ai_enabled' THEN e.occurred_at END) AS ai_enabled_at,
           MIN(CASE WHEN e.event_name = 'first_ai_response_sent' THEN e.occurred_at END) AS first_ai_response_sent_at
         FROM signups s
         LEFT JOIN ${table} e
           ON e.session_id = s.session_id
          AND e.event_name = ANY($3::text[])
          AND e.occurred_at >= s.signup_at
          AND e.occurred_at <= to_timestamp($2 / 1000.0)
         GROUP BY s.session_id, s.signup_at
       )
       SELECT
         cohort_start,
         COUNT(*)::int AS signups,
         COUNT(whatsapp_saved_at)::int AS whatsapp_saved,
         COUNT(whatsapp_connected_at)::int AS whatsapp_connected,
         COUNT(training_score_70_reached_at)::int AS training_score_70_reached,
         COUNT(ai_enabled_at)::int AS ai_enabled,
         COUNT(first_ai_response_sent_at)::int AS first_ai_response_sent
       FROM stages
       GROUP BY cohort_start
       ORDER BY cohort_start ASC`,
      [startMs, endMs, STAGE_EVENT_NAMES, SIGNUP_FALLBACK_EVENT_NAMES, SIGNUP_CANDIDATE_EVENT_NAMES]
    )

    return result.rows.map((row) => {
      const cohortStartMs =
        row.cohort_start instanceof Date ? row.cohort_start.getTime() : Date.parse(String(row.cohort_start))
      const signups = Number(row.signups ?? 0)
      const activated = Number(row.first_ai_response_sent ?? 0)
      return {
        cohortStartMs: Number.isFinite(cohortStartMs) ? cohortStartMs : 0,
        signups,
        stageCounts: {
          whatsapp_saved: Number(row.whatsapp_saved ?? 0),
          whatsapp_connected: Number(row.whatsapp_connected ?? 0),
          training_score_70_reached: Number(row.training_score_70_reached ?? 0),
          ai_enabled: Number(row.ai_enabled ?? 0),
          first_ai_response_sent: activated
        },
        conversionToActivated: signups > 0 ? activated / signups : 0
      } satisfies OnboardingFunnelCohort
    })
  }

  async getAcquisitionFunnelByCohort(
    fromMs: number,
    toMs: number,
    cohort: OnboardingCohort,
    groupBy: AcquisitionFunnelGroupBy
  ): Promise<AcquisitionFunnelRow[]> {
    const startMs = Math.min(fromMs, toMs)
    const endMs = Math.max(fromMs, toMs)
    const cohortDateTrunc = COHORT_DATE_TRUNC[cohort] ?? 'week'
    const safeGroupBy = groupBy === 'campaign' ? 'campaign' : 'campaign'
    const table = this.quoteIdentifier(this.tableName)

    const groupBySelect =
      safeGroupBy === 'campaign'
        ? `COALESCE(NULLIF(TRIM(LOWER(
             COALESCE(
               e.properties #>> '{acquisition,campaign}',
               e.properties->>'utm_campaign',
               ''
             )
           )), ''), 'direct') AS campaign_key`
        : `'direct' AS campaign_key`

    const result = await this.pool.query(
      `WITH signup_events AS (
         SELECT
           e.session_id,
           e.occurred_at,
           ${groupBySelect},
           COALESCE(NULLIF(TRIM(LOWER(
             COALESCE(
               e.properties #>> '{acquisition,source}',
               e.properties->>'utm_source',
               ''
             )
           )), ''), 'direct') AS source_key
         FROM ${table} e
         WHERE e.event_name = 'signup_completed'
           AND e.occurred_at >= to_timestamp($1 / 1000.0)
           AND e.occurred_at <= to_timestamp($2 / 1000.0)
       ),
       signups AS (
         SELECT
           session_id,
           MIN(occurred_at) AS signup_at,
           date_trunc('${cohortDateTrunc}', MIN(occurred_at)) AS cohort_start,
           MIN(campaign_key) AS campaign_key,
           MIN(source_key) AS source_key
         FROM signup_events
         GROUP BY session_id
       ),
       stages AS (
         SELECT
           s.session_id,
           s.cohort_start,
           s.campaign_key,
           s.source_key,
           MIN(CASE WHEN e.event_name = 'whatsapp_connected' THEN e.occurred_at END) AS whatsapp_connected_at,
           MIN(CASE WHEN e.event_name = 'training_score_70_reached' THEN e.occurred_at END) AS training_score_70_reached_at,
           MIN(CASE WHEN e.event_name = 'first_ai_response_sent' THEN e.occurred_at END) AS first_ai_response_sent_at,
           MIN(CASE WHEN e.event_name = 'account_activated_7d' THEN e.occurred_at END) AS account_activated_7d_at
         FROM signups s
         LEFT JOIN ${table} e
           ON e.session_id = s.session_id
          AND e.event_name = ANY($3::text[])
          AND e.occurred_at >= s.signup_at
          AND e.occurred_at <= to_timestamp($2 / 1000.0)
         GROUP BY s.session_id, s.cohort_start, s.campaign_key, s.source_key
       )
       SELECT
         cohort_start,
         campaign_key,
         source_key,
         COUNT(*)::int AS signups,
         COUNT(whatsapp_connected_at)::int AS whatsapp_connected,
         COUNT(training_score_70_reached_at)::int AS training_score_70_reached,
         COUNT(first_ai_response_sent_at)::int AS first_ai_response_sent,
         COUNT(account_activated_7d_at)::int AS account_activated_7d
       FROM stages
       GROUP BY cohort_start, campaign_key, source_key
       ORDER BY cohort_start ASC, signups DESC, campaign_key ASC`,
      [startMs, endMs, ACQUISITION_STAGE_EVENT_NAMES]
    )

    return result.rows.map((row) => {
      const cohortStartMs =
        row.cohort_start instanceof Date ? row.cohort_start.getTime() : Date.parse(String(row.cohort_start))
      const signups = Number(row.signups ?? 0)
      const whatsappConnected = Number(row.whatsapp_connected ?? 0)
      const score70 = Number(row.training_score_70_reached ?? 0)
      const firstAiResponse = Number(row.first_ai_response_sent ?? 0)
      const activated7d = Number(row.account_activated_7d ?? 0)

      return {
        cohortStartMs: Number.isFinite(cohortStartMs) ? cohortStartMs : 0,
        campaignKey: String(row.campaign_key ?? 'direct') || 'direct',
        sourceKey: String(row.source_key ?? 'direct') || 'direct',
        signups,
        stageCounts: {
          whatsapp_connected: whatsappConnected,
          training_score_70_reached: score70,
          first_ai_response_sent: firstAiResponse,
          account_activated_7d: activated7d
        },
        rates: {
          signup_to_whatsapp_connected: signups > 0 ? whatsappConnected / signups : 0,
          signup_to_training_score_70_reached: signups > 0 ? score70 / signups : 0,
          signup_to_first_ai_response_sent: signups > 0 ? firstAiResponse / signups : 0,
          activation_7d: signups > 0 ? activated7d / signups : 0
        }
      } satisfies AcquisitionFunnelRow
    })
  }

  private mapRow(row: Record<string, unknown>): OnboardingEventRecord {
    const occurredAt =
      row.occurred_at instanceof Date ? row.occurred_at.getTime() : Date.parse(String(row.occurred_at ?? ''))
    const createdAt =
      row.created_at instanceof Date ? row.created_at.getTime() : Date.parse(String(row.created_at ?? ''))

    return {
      id: Number(row.id ?? 0),
      sessionId: String(row.session_id ?? ''),
      eventId: String(row.event_id ?? ''),
      eventName: String(row.event_name ?? '') as OnboardingEventName,
      eventSource: String(row.event_source ?? '') as OnboardingEventInput['eventSource'],
      occurredAtMs: Number.isFinite(occurredAt) ? occurredAt : Date.now(),
      properties:
        row.properties && typeof row.properties === 'object' && !Array.isArray(row.properties)
          ? (row.properties as Record<string, unknown>)
          : {},
      createdAtMs: Number.isFinite(createdAt) ? createdAt : Date.now()
    }
  }

  private quoteIdentifier(name: string) {
    const escaped = name.replace(/"/g, '""')
    return `"${escaped}"`
  }
}
