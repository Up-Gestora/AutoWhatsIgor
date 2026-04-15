import type { Pool } from 'pg'
import { toUserJid } from '../whatsapp/normalize'
import type {
  BroadcastFailureRecord,
  BroadcastJobRecord,
  BroadcastJobStatus,
  BroadcastMessagePayload
} from './types'

type BroadcastJobStoreOptions = {
  pool: Pool
  jobsTableName?: string
  itemsTableName?: string
  contactsTableName: string
  maxContactsPerJob: number
}

type Queryable = {
  query: (sql: string, params?: unknown[]) => Promise<{ rowCount: number; rows: unknown[] }>
}

type BroadcastJobRow = {
  session_id: string
  job_id: string
  list_id: string
  status: BroadcastJobStatus
  pause_reason: string | null
  payload: unknown
  total_count: number | string | null
  sent_count: number | string | null
  failed_count: number | string | null
  charged_blocks: number | string | null
  created_at: Date | string | null
  updated_at: Date | string | null
  started_at: Date | string | null
  completed_at: Date | string | null
  next_send_at: Date | string | null
  success_timeout_anchor_at: Date | string | null
}

type BroadcastItemRow = {
  id: number
  session_id: string
  job_id: string
  contact_name: string | null
  contact_whatsapp: string
  chat_id: string
  status: string
  attempts: number | string | null
  message_id: string | null
  error: string | null
  created_at: Date | string | null
  updated_at: Date | string | null
  sent_at: Date | string | null
}

export class BroadcastJobStore {
  private readonly pool: Pool
  private readonly jobsTableName: string
  private readonly itemsTableName: string
  private readonly contactsTableName: string
  private readonly maxContactsPerJob: number

  constructor(options: BroadcastJobStoreOptions) {
    this.pool = options.pool
    this.jobsTableName = options.jobsTableName ?? 'broadcast_jobs'
    this.itemsTableName = options.itemsTableName ?? 'broadcast_items'
    this.contactsTableName = options.contactsTableName
    this.maxContactsPerJob = Math.max(1, Math.floor(options.maxContactsPerJob))
  }

  async init(): Promise<void> {
    const jobs = this.quoteIdentifier(this.jobsTableName)
    const items = this.quoteIdentifier(this.itemsTableName)

    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${jobs} (
        session_id TEXT NOT NULL,
        job_id TEXT NOT NULL,
        list_id TEXT NOT NULL,
        status TEXT NOT NULL,
        pause_reason TEXT,
        payload JSONB NOT NULL,
        total_count INT NOT NULL DEFAULT 0,
        sent_count INT NOT NULL DEFAULT 0,
        failed_count INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        next_send_at TIMESTAMPTZ,
        success_timeout_anchor_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (session_id, job_id)
      )`
    )
    await this.pool.query(
      `ALTER TABLE ${jobs}
       ADD COLUMN IF NOT EXISTS charged_blocks INT NOT NULL DEFAULT 0`
    )
    await this.pool.query(
      `ALTER TABLE ${jobs}
       ADD COLUMN IF NOT EXISTS success_timeout_anchor_at TIMESTAMPTZ`
    )
    await this.pool.query(
      `ALTER TABLE ${jobs}
       ALTER COLUMN success_timeout_anchor_at SET DEFAULT NOW()`
    )
    await this.pool.query(
      `UPDATE ${jobs}
       SET success_timeout_anchor_at = COALESCE(success_timeout_anchor_at, started_at, created_at, updated_at, NOW())
       WHERE success_timeout_anchor_at IS NULL`
    )

    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${items} (
        id BIGSERIAL PRIMARY KEY,
        session_id TEXT NOT NULL,
        job_id TEXT NOT NULL,
        contact_name TEXT,
        contact_whatsapp TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INT NOT NULL DEFAULT 0,
        message_id TEXT,
        error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        sent_at TIMESTAMPTZ
      )`
    )

    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.jobsTableName}_session_status_next_idx`)}
       ON ${jobs} (session_id, status, next_send_at)`
    )
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.jobsTableName}_session_created_idx`)}
       ON ${jobs} (session_id, created_at DESC)`
    )
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.jobsTableName}_active_timeout_idx`)}
       ON ${jobs} (status, success_timeout_anchor_at)
       WHERE status IN ('running', 'paused')`
    )
    await this.pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.jobsTableName}_active_session_idx`)}
       ON ${jobs} (session_id)
       WHERE status IN ('running', 'paused')`
    )

    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.itemsTableName}_job_status_idx`)}
       ON ${items} (session_id, job_id, status, id ASC)`
    )
    await this.pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.itemsTableName}_job_whatsapp_unique_idx`)}
       ON ${items} (session_id, job_id, contact_whatsapp)`
    )
  }

  async createJobFromList(options: {
    sessionId: string
    jobId: string
    listId: string
    payload: BroadcastMessagePayload
  }): Promise<BroadcastJobRecord> {
    const sessionId = options.sessionId.trim()
    const jobId = options.jobId.trim()
    const listId = options.listId.trim()

    if (!sessionId) {
      throw new Error('sessionId is required')
    }
    if (!jobId) {
      throw new Error('jobId is required')
    }
    if (!listId) {
      throw new Error('listId is required')
    }

    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')

      const active = await client.query(
        `SELECT job_id FROM ${this.quoteIdentifier(this.jobsTableName)}
         WHERE session_id = $1 AND status IN ('running', 'paused')
         LIMIT 1`,
        [sessionId]
      )
      if ((active.rowCount ?? 0) > 0) {
        throw new Error('broadcast_job_active_exists')
      }

      const contactsTable = this.quoteIdentifier(this.contactsTableName)
      const contactsResult = await client.query(
        `SELECT name, whatsapp
         FROM ${contactsTable}
         WHERE session_id = $1 AND list_id = $2
         ORDER BY created_at ASC
         LIMIT $3`,
        [sessionId, listId, this.maxContactsPerJob + 1]
      )
      const contacts = (contactsResult.rows ?? []).map((row: any) => ({
        name: typeof row.name === 'string' ? row.name : null,
        whatsapp: String(row.whatsapp ?? '')
      }))

      if (contacts.length === 0) {
        throw new Error('broadcast_list_empty')
      }
      if (contacts.length > this.maxContactsPerJob) {
        throw new Error('broadcast_contacts_limit_exceeded')
      }

      const jobs = this.quoteIdentifier(this.jobsTableName)
      const now = new Date()
      const insertJob = await client.query(
        `INSERT INTO ${jobs} (
          session_id,
          job_id,
          list_id,
          status,
          pause_reason,
          payload,
          total_count,
          sent_count,
          failed_count,
          charged_blocks,
          created_at,
          updated_at,
          started_at,
          completed_at,
          next_send_at,
          success_timeout_anchor_at
        ) VALUES ($1, $2, $3, 'running', NULL, $4, $5, 0, 0, 0, $6, $7, NULL, NULL, $8, $9)
        RETURNING session_id, job_id, list_id, status, pause_reason, payload, total_count, sent_count, failed_count, charged_blocks,
                  created_at, updated_at, started_at, completed_at, next_send_at, success_timeout_anchor_at`,
        [sessionId, jobId, listId, options.payload, contacts.length, now, now, now, now]
      )

      const names = contacts.map((c) => c.name)
      const whatsapps = contacts.map((c) => c.whatsapp)
      const chatIds = whatsapps.map((digits) => toUserJid(digits))

      const items = this.quoteIdentifier(this.itemsTableName)
      await client.query(
        `INSERT INTO ${items} (
          session_id,
          job_id,
          contact_name,
          contact_whatsapp,
          chat_id,
          status,
          attempts,
          message_id,
          error,
          created_at,
          updated_at,
          sent_at
        )
        SELECT $1, $2, x.contact_name, x.contact_whatsapp, x.chat_id, 'pending', 0, NULL, NULL, NOW(), NOW(), NULL
        FROM UNNEST($3::text[], $4::text[], $5::text[]) AS x(contact_name, contact_whatsapp, chat_id)
        ON CONFLICT (session_id, job_id, contact_whatsapp) DO NOTHING`,
        [sessionId, jobId, names, whatsapps, chatIds]
      )

      await client.query('COMMIT')
      return this.toJob(insertJob.rows[0] as BroadcastJobRow)
    } catch (error) {
      await client.query('ROLLBACK')
      const code = (error as any)?.code
      if (code === '23505') {
        throw new Error('broadcast_job_active_exists')
      }
      throw error
    } finally {
      client.release()
    }
  }

  async listJobs(sessionId: string, limit = 25): Promise<BroadcastJobRecord[]> {
    const safeSessionId = sessionId.trim()
    if (!safeSessionId) {
      throw new Error('sessionId is required')
    }

    const safeLimit = clampLimit(limit, 1, 200)
    const jobs = this.quoteIdentifier(this.jobsTableName)
    const result = await this.pool.query(
      `SELECT session_id, job_id, list_id, status, pause_reason, payload, total_count, sent_count, failed_count, charged_blocks,
              created_at, updated_at, started_at, completed_at, next_send_at, success_timeout_anchor_at
       FROM ${jobs}
       WHERE session_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [safeSessionId, safeLimit]
    )
    return result.rows.map((row) => this.toJob(row as BroadcastJobRow))
  }

  async getJob(sessionId: string, jobId: string): Promise<BroadcastJobRecord | null> {
    const safeSessionId = sessionId.trim()
    const safeJobId = jobId.trim()
    if (!safeSessionId) {
      throw new Error('sessionId is required')
    }
    if (!safeJobId) {
      throw new Error('jobId is required')
    }

    const jobs = this.quoteIdentifier(this.jobsTableName)
    const result = await this.pool.query(
      `SELECT session_id, job_id, list_id, status, pause_reason, payload, total_count, sent_count, failed_count, charged_blocks,
              created_at, updated_at, started_at, completed_at, next_send_at, success_timeout_anchor_at
       FROM ${jobs}
       WHERE session_id = $1 AND job_id = $2
       LIMIT 1`,
      [safeSessionId, safeJobId]
    )
    if (result.rowCount === 0) {
      return null
    }
    return this.toJob(result.rows[0] as BroadcastJobRow)
  }

  async listFailures(sessionId: string, jobId: string, limit = 500): Promise<BroadcastFailureRecord[]> {
    const safeSessionId = sessionId.trim()
    const safeJobId = jobId.trim()
    if (!safeSessionId) {
      throw new Error('sessionId is required')
    }
    if (!safeJobId) {
      throw new Error('jobId is required')
    }

    const safeLimit = clampLimit(limit, 1, 5000)
    const items = this.quoteIdentifier(this.itemsTableName)
    const result = await this.pool.query(
      `SELECT id, session_id, job_id, contact_name, contact_whatsapp, chat_id, error, updated_at
       FROM ${items}
       WHERE session_id = $1 AND job_id = $2 AND status = 'failed'
       ORDER BY id ASC
       LIMIT $3`,
      [safeSessionId, safeJobId, safeLimit]
    )
    return (result.rows as any[]).map((row) => ({
      id: Number(row.id),
      sessionId: String(row.session_id),
      jobId: String(row.job_id),
      contactName: row.contact_name ? String(row.contact_name) : null,
      whatsapp: String(row.contact_whatsapp),
      chatId: String(row.chat_id),
      error: row.error ? String(row.error) : null,
      updatedAt: toMs(row.updated_at)
    }))
  }

  async resumeJob(sessionId: string, jobId: string): Promise<BroadcastJobRecord | null> {
    const safeSessionId = sessionId.trim()
    const safeJobId = jobId.trim()
    if (!safeSessionId) {
      throw new Error('sessionId is required')
    }
    if (!safeJobId) {
      throw new Error('jobId is required')
    }

    const jobs = this.quoteIdentifier(this.jobsTableName)
    const result = await this.pool.query(
      `UPDATE ${jobs}
       SET status = 'running', pause_reason = NULL, updated_at = NOW(), next_send_at = NOW(),
           success_timeout_anchor_at = NOW()
       WHERE session_id = $1 AND job_id = $2 AND status = 'paused'
       RETURNING session_id, job_id, list_id, status, pause_reason, payload, total_count, sent_count, failed_count, charged_blocks,
                 created_at, updated_at, started_at, completed_at, next_send_at, success_timeout_anchor_at`,
      [safeSessionId, safeJobId]
    )
    if (result.rowCount === 0) {
      return null
    }
    return this.toJob(result.rows[0] as BroadcastJobRow)
  }

  async pauseJobById(sessionId: string, jobId: string, reason: string): Promise<BroadcastJobRecord | null> {
    const safeSessionId = sessionId.trim()
    const safeJobId = jobId.trim()
    if (!safeSessionId) {
      throw new Error('sessionId is required')
    }
    if (!safeJobId) {
      throw new Error('jobId is required')
    }

    const safeReason = reason.trim() || 'paused'
    const jobs = this.quoteIdentifier(this.jobsTableName)
    const result = await this.pool.query(
      `UPDATE ${jobs}
       SET status = 'paused', pause_reason = $3, updated_at = NOW(), next_send_at = NULL
       WHERE session_id = $1 AND job_id = $2 AND status = 'running'
       RETURNING session_id, job_id, list_id, status, pause_reason, payload, total_count, sent_count, failed_count, charged_blocks,
                 created_at, updated_at, started_at, completed_at, next_send_at, success_timeout_anchor_at`,
      [safeSessionId, safeJobId, safeReason]
    )
    if (result.rowCount === 0) {
      return null
    }
    return this.toJob(result.rows[0] as BroadcastJobRow)
  }

  async resumeCancelledJobFromCancelledItems(sessionId: string, jobId: string): Promise<BroadcastJobRecord | null> {
    const safeSessionId = sessionId.trim()
    const safeJobId = jobId.trim()
    if (!safeSessionId) {
      throw new Error('sessionId is required')
    }
    if (!safeJobId) {
      throw new Error('jobId is required')
    }

    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')

      const jobs = this.quoteIdentifier(this.jobsTableName)
      const items = this.quoteIdentifier(this.itemsTableName)

      const lockedJob = await client.query(
        `SELECT session_id
         FROM ${jobs}
         WHERE session_id = $1 AND job_id = $2 AND status = 'cancelled'
         LIMIT 1
         FOR UPDATE`,
        [safeSessionId, safeJobId]
      )
      if ((lockedJob.rowCount ?? 0) === 0) {
        await client.query('COMMIT')
        return null
      }

      const active = await client.query(
        `SELECT job_id
         FROM ${jobs}
         WHERE session_id = $1
           AND job_id <> $2
           AND status IN ('running', 'paused')
         LIMIT 1`,
        [safeSessionId, safeJobId]
      )
      if ((active.rowCount ?? 0) > 0) {
        throw new Error('broadcast_job_active_exists')
      }

      const reactivated = await client.query(
        `UPDATE ${items}
         SET status = 'pending', error = NULL, message_id = NULL, sent_at = NULL, updated_at = NOW()
         WHERE session_id = $1 AND job_id = $2 AND status = 'cancelled'`,
        [safeSessionId, safeJobId]
      )
      if ((reactivated.rowCount ?? 0) === 0) {
        await client.query('COMMIT')
        return null
      }

      const countsResult = await client.query(
        `SELECT COUNT(*)::int AS total_count,
                COALESCE(SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END), 0)::int AS sent_count,
                COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0)::int AS failed_count
         FROM ${items}
         WHERE session_id = $1 AND job_id = $2`,
        [safeSessionId, safeJobId]
      )
      const counts = (countsResult.rows[0] ?? {}) as any
      const totalCount = toInt(counts.total_count)
      const sentCount = toInt(counts.sent_count)
      const failedCount = toInt(counts.failed_count)

      const resumed = await client.query(
        `UPDATE ${jobs}
         SET status = 'running',
             pause_reason = NULL,
             total_count = $3,
             sent_count = $4,
             failed_count = $5,
             updated_at = NOW(),
             completed_at = NULL,
             next_send_at = NOW(),
             success_timeout_anchor_at = NOW()
         WHERE session_id = $1 AND job_id = $2 AND status = 'cancelled'
         RETURNING session_id, job_id, list_id, status, pause_reason, payload, total_count, sent_count, failed_count, charged_blocks,
                   created_at, updated_at, started_at, completed_at, next_send_at, success_timeout_anchor_at`,
        [safeSessionId, safeJobId, totalCount, sentCount, failedCount]
      )
      if ((resumed.rowCount ?? 0) === 0) {
        await client.query('COMMIT')
        return null
      }

      await client.query('COMMIT')
      return this.toJob(resumed.rows[0] as BroadcastJobRow)
    } catch (error) {
      await client.query('ROLLBACK')
      const code = (error as any)?.code
      if (code === '23505') {
        throw new Error('broadcast_job_active_exists')
      }
      throw error
    } finally {
      client.release()
    }
  }

  async cancelJob(sessionId: string, jobId: string): Promise<BroadcastJobRecord | null> {
    const safeSessionId = sessionId.trim()
    const safeJobId = jobId.trim()
    if (!safeSessionId) {
      throw new Error('sessionId is required')
    }
    if (!safeJobId) {
      throw new Error('jobId is required')
    }

    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const jobs = this.quoteIdentifier(this.jobsTableName)
      const updated = await client.query(
        `UPDATE ${jobs}
         SET status = 'cancelled', pause_reason = COALESCE(pause_reason, 'cancelled'), updated_at = NOW(),
             completed_at = COALESCE(completed_at, NOW()), next_send_at = NULL
         WHERE session_id = $1 AND job_id = $2 AND status IN ('running', 'paused')
         RETURNING session_id, job_id, list_id, status, pause_reason, payload, total_count, sent_count, failed_count, charged_blocks,
                   created_at, updated_at, started_at, completed_at, next_send_at, success_timeout_anchor_at`,
        [safeSessionId, safeJobId]
      )
      if (updated.rowCount === 0) {
        await client.query('COMMIT')
        return null
      }

      const items = this.quoteIdentifier(this.itemsTableName)
      await client.query(
        `UPDATE ${items}
         SET status = 'cancelled', updated_at = NOW()
         WHERE session_id = $1 AND job_id = $2 AND status = 'pending'`,
        [safeSessionId, safeJobId]
      )

      await client.query('COMMIT')
      return this.toJob(updated.rows[0] as BroadcastJobRow)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async cancelJobsBySuccessTimeout(timeoutMs: number, reason: string, limit = 100): Promise<BroadcastJobRecord[]> {
    const safeTimeoutMs = Math.max(1, Math.floor(timeoutMs))
    const safeReason = reason.trim() || 'timeout_no_success'
    const safeLimit = clampLimit(limit, 1, 500)

    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')

      const jobs = this.quoteIdentifier(this.jobsTableName)
      const items = this.quoteIdentifier(this.itemsTableName)
      const result = await client.query(
        `WITH candidate AS (
           SELECT session_id, job_id
           FROM ${jobs}
           WHERE status = 'running'
             AND COALESCE(success_timeout_anchor_at, started_at, created_at, updated_at, NOW())
                 <= NOW() - (($1::double precision / 1000.0) * INTERVAL '1 second')
           ORDER BY COALESCE(success_timeout_anchor_at, started_at, created_at, updated_at, NOW()) ASC, created_at ASC
           LIMIT $2
           FOR UPDATE SKIP LOCKED
         ),
         updated AS (
           UPDATE ${jobs} job
           SET status = 'cancelled',
               pause_reason = $3,
               updated_at = NOW(),
               completed_at = COALESCE(job.completed_at, NOW()),
               next_send_at = NULL
           FROM candidate
           WHERE job.session_id = candidate.session_id
             AND job.job_id = candidate.job_id
           RETURNING job.session_id, job.job_id, job.list_id, job.status, job.pause_reason, job.payload,
                     job.total_count, job.sent_count, job.failed_count, job.charged_blocks, job.created_at,
                     job.updated_at, job.started_at, job.completed_at, job.next_send_at, job.success_timeout_anchor_at
         ),
         cancelled_items AS (
           UPDATE ${items} item
           SET status = 'cancelled',
               updated_at = NOW()
           FROM updated
           WHERE item.session_id = updated.session_id
             AND item.job_id = updated.job_id
             AND item.status = 'pending'
           RETURNING item.id
         )
         SELECT session_id, job_id, list_id, status, pause_reason, payload, total_count, sent_count, failed_count,
                charged_blocks, created_at, updated_at, started_at, completed_at, next_send_at, success_timeout_anchor_at
         FROM updated`,
        [safeTimeoutMs, safeLimit, safeReason]
      )

      await client.query('COMMIT')
      return result.rows.map((row) => this.toJob(row as BroadcastJobRow))
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async lockNextRunnableJob(
    client: Queryable,
    connectedSessionIds: string[]
  ): Promise<BroadcastJobRecord | null> {
    const filtered = (connectedSessionIds ?? []).map((id) => id.trim()).filter(Boolean)
    if (filtered.length === 0) {
      return null
    }

    const jobs = this.quoteIdentifier(this.jobsTableName)
    const result = await client.query(
      `SELECT session_id, job_id, list_id, status, pause_reason, payload, total_count, sent_count, failed_count, charged_blocks,
              created_at, updated_at, started_at, completed_at, next_send_at, success_timeout_anchor_at
       FROM ${jobs}
       WHERE status = 'running'
         AND next_send_at IS NOT NULL
         AND next_send_at <= NOW()
         AND session_id = ANY($1::text[])
       ORDER BY next_send_at ASC, created_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
      [filtered]
    )

    if (result.rowCount === 0) {
      return null
    }

    return this.toJob(result.rows[0] as BroadcastJobRow)
  }

  async scheduleNextSendAt(client: Queryable, sessionId: string, jobId: string, nextSendAtMs: number): Promise<void> {
    const jobs = this.quoteIdentifier(this.jobsTableName)
    await client.query(
      `UPDATE ${jobs} SET next_send_at = $3, updated_at = NOW() WHERE session_id = $1 AND job_id = $2`,
      [sessionId, jobId, new Date(nextSendAtMs)]
    )
  }

  async pauseJob(client: Queryable, sessionId: string, jobId: string, reason: string): Promise<void> {
    const jobs = this.quoteIdentifier(this.jobsTableName)
    await client.query(
      `UPDATE ${jobs}
       SET status = 'paused', pause_reason = $3, updated_at = NOW(), next_send_at = NULL
       WHERE session_id = $1 AND job_id = $2`,
      [sessionId, jobId, reason || 'paused']
    )
  }

  async pauseRunningJobsBySessionIds(
    sessionIds: string[],
    reason: string,
    limit = 100
  ): Promise<BroadcastJobRecord[]> {
    const filtered = Array.from(new Set((sessionIds ?? []).map((id) => id.trim()).filter(Boolean)))
    if (filtered.length === 0) {
      return []
    }

    const safeReason = reason.trim() || 'paused'
    const safeLimit = clampLimit(limit, 1, 500)

    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const jobs = this.quoteIdentifier(this.jobsTableName)
      const result = await client.query(
        `WITH candidate AS (
           SELECT session_id, job_id
           FROM ${jobs}
           WHERE status = 'running'
             AND session_id = ANY($1::text[])
           ORDER BY next_send_at ASC NULLS LAST, created_at ASC
           LIMIT $2
           FOR UPDATE SKIP LOCKED
         ),
         updated AS (
           UPDATE ${jobs} job
           SET status = 'paused',
               pause_reason = $3,
               updated_at = NOW(),
               next_send_at = NULL
           FROM candidate
           WHERE job.session_id = candidate.session_id
             AND job.job_id = candidate.job_id
           RETURNING job.session_id, job.job_id, job.list_id, job.status, job.pause_reason, job.payload,
                     job.total_count, job.sent_count, job.failed_count, job.charged_blocks, job.created_at,
                     job.updated_at, job.started_at, job.completed_at, job.next_send_at, job.success_timeout_anchor_at
         )
         SELECT session_id, job_id, list_id, status, pause_reason, payload, total_count, sent_count, failed_count,
                charged_blocks, created_at, updated_at, started_at, completed_at, next_send_at, success_timeout_anchor_at
         FROM updated`,
        [filtered, safeLimit, safeReason]
      )
      await client.query('COMMIT')
      return result.rows.map((row) => this.toJob(row as BroadcastJobRow))
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async failJob(client: Queryable, sessionId: string, jobId: string, reason: string): Promise<void> {
    const jobs = this.quoteIdentifier(this.jobsTableName)
    await client.query(
      `UPDATE ${jobs}
       SET status = 'failed', pause_reason = $3, updated_at = NOW(), next_send_at = NULL,
           completed_at = COALESCE(completed_at, NOW())
       WHERE session_id = $1 AND job_id = $2`,
      [sessionId, jobId, reason || 'failed']
    )
  }

  async completeJob(client: Queryable, sessionId: string, jobId: string): Promise<void> {
    const jobs = this.quoteIdentifier(this.jobsTableName)
    await client.query(
      `UPDATE ${jobs}
       SET status = 'completed', updated_at = NOW(), completed_at = COALESCE(completed_at, NOW()), next_send_at = NULL
       WHERE session_id = $1 AND job_id = $2`,
      [sessionId, jobId]
    )
  }

  async lockNextPendingItem(
    client: Queryable,
    sessionId: string,
    jobId: string
  ): Promise<Pick<BroadcastItemRow, 'id' | 'chat_id' | 'contact_name' | 'contact_whatsapp'> | null> {
    const items = this.quoteIdentifier(this.itemsTableName)
    const result = await client.query(
      `SELECT id, chat_id, contact_name, contact_whatsapp
       FROM ${items}
       WHERE session_id = $1 AND job_id = $2 AND status = 'pending'
       ORDER BY id ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
      [sessionId, jobId]
    )
    if (result.rowCount === 0) {
      return null
    }
    const row = result.rows[0] as any
    return {
      id: Number(row.id),
      chat_id: String(row.chat_id),
      contact_name: row.contact_name ? String(row.contact_name) : null,
      contact_whatsapp: String(row.contact_whatsapp)
    }
  }

  async markItemSent(client: Queryable, itemId: number, messageId: string | null): Promise<void> {
    const items = this.quoteIdentifier(this.itemsTableName)
    await client.query(
      `UPDATE ${items}
       SET status = 'sent', message_id = $2, error = NULL, sent_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [itemId, messageId ?? null]
    )
  }

  async markItemFailed(client: Queryable, itemId: number, error: string): Promise<void> {
    const items = this.quoteIdentifier(this.itemsTableName)
    await client.query(
      `UPDATE ${items}
       SET status = 'failed', error = $2, updated_at = NOW()
       WHERE id = $1`,
      [itemId, error || 'failed']
    )
  }

  async deleteContactByWhatsapp(
    client: Queryable,
    sessionId: string,
    listId: string,
    whatsapp: string
  ): Promise<boolean> {
    const contacts = this.quoteIdentifier(this.contactsTableName)
    const result = await client.query(
      `DELETE FROM ${contacts}
       WHERE session_id = $1 AND list_id = $2 AND whatsapp = $3`,
      [sessionId, listId, whatsapp]
    )
    return (result.rowCount ?? 0) > 0
  }

  async incrementJobCounts(client: Queryable, options: {
    sessionId: string
    jobId: string
    sentInc?: number
    failedInc?: number
    nextSendAtMs?: number | null
  }): Promise<void> {
    const sentInc = Math.max(0, Math.floor(options.sentInc ?? 0))
    const failedInc = Math.max(0, Math.floor(options.failedInc ?? 0))
    const jobs = this.quoteIdentifier(this.jobsTableName)

    const nextSendAt =
      options.nextSendAtMs === null || options.nextSendAtMs === undefined ? null : new Date(options.nextSendAtMs)

    await client.query(
      `UPDATE ${jobs}
       SET sent_count = sent_count + $3,
           failed_count = failed_count + $4,
           updated_at = NOW(),
           started_at = COALESCE(started_at, NOW()),
           success_timeout_anchor_at = CASE
             WHEN $3 > 0 THEN NOW()
             ELSE COALESCE(success_timeout_anchor_at, started_at, created_at, updated_at, NOW())
           END,
           next_send_at = $5
       WHERE session_id = $1 AND job_id = $2`,
      [options.sessionId, options.jobId, sentInc, failedInc, nextSendAt]
    )
  }

  async updateChargedBlocks(client: Queryable, sessionId: string, jobId: string, chargedBlocks: number): Promise<void> {
    const jobs = this.quoteIdentifier(this.jobsTableName)
    const nextValue = Math.max(0, Math.floor(chargedBlocks))
    await client.query(
      `UPDATE ${jobs}
       SET charged_blocks = $3, updated_at = NOW()
       WHERE session_id = $1 AND job_id = $2`,
      [sessionId, jobId, nextValue]
    )
  }

  async getSentCountByPeriod(sessionId: string, fromMs: number, toMs: number): Promise<number> {
    const safeSessionId = sessionId.trim()
    if (!safeSessionId) {
      throw new Error('sessionId is required')
    }

    const items = this.quoteIdentifier(this.itemsTableName)
    const result = await this.pool.query(
      `SELECT COUNT(*)::int AS sent_count
       FROM ${items}
       WHERE session_id = $1
         AND status = 'sent'
         AND sent_at >= to_timestamp($2 / 1000.0)
         AND sent_at <= to_timestamp($3 / 1000.0)`,
      [safeSessionId, fromMs, toMs]
    )
    return Number(result.rows[0]?.sent_count ?? 0)
  }

  private toJob(row: BroadcastJobRow): BroadcastJobRecord {
    return {
      id: row.job_id,
      sessionId: row.session_id,
      listId: row.list_id,
      status: row.status,
      pauseReason: row.pause_reason ?? null,
      payload: row.payload as BroadcastMessagePayload,
      totalCount: toInt(row.total_count),
      sentCount: toInt(row.sent_count),
      failedCount: toInt(row.failed_count),
      chargedBlocks: toInt(row.charged_blocks),
      createdAt: toMs(row.created_at),
      updatedAt: toMs(row.updated_at),
      startedAt: toMs(row.started_at),
      completedAt: toMs(row.completed_at),
      nextSendAt: toMs(row.next_send_at)
    }
  }

  private quoteIdentifier(name: string) {
    const escaped = name.replace(/"/g, '""')
    return `"${escaped}"`
  }
}

function toMs(value: Date | string | null | undefined): number | null {
  if (!value) {
    return null
  }
  if (value instanceof Date) {
    return value.getTime()
  }
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

function toInt(value: number | string | null | undefined): number {
  if (value === null || value === undefined) {
    return 0
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.floor(value) : 0
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.floor(parsed) : 0
}

function clampLimit(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min
  }
  return Math.min(max, Math.max(min, Math.floor(value)))
}

