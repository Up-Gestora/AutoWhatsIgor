import type { Pool } from 'pg'
import type {
  TrainingCopilotDecision,
  TrainingCopilotMessage,
  TrainingCopilotProposal,
  TrainingCopilotSessionState
} from './trainingCopilotSchema'

type TrainingCopilotStoreOptions = {
  pool: Pool
  tableName?: string
}

type SessionRow = {
  session_id: string
  messages: unknown
  pending_proposal: unknown
  decisions: unknown
  proposal_seq: number
  created_at: Date | string
  updated_at: Date | string
}

export class TrainingCopilotStore {
  private readonly pool: Pool
  private readonly tableName: string

  constructor(options: TrainingCopilotStoreOptions) {
    this.pool = options.pool
    this.tableName = options.tableName ?? 'ai_training_copilot_sessions'
  }

  async init(): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${table} (
        session_id TEXT PRIMARY KEY,
        messages JSONB NOT NULL DEFAULT '[]'::jsonb,
        pending_proposal JSONB NULL,
        decisions JSONB NOT NULL DEFAULT '[]'::jsonb,
        proposal_seq INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`
    )
  }

  async get(sessionId: string): Promise<TrainingCopilotSessionState | null> {
    const table = this.quoteIdentifier(this.tableName)
    const result = await this.pool.query(
      `SELECT session_id, messages, pending_proposal, decisions, proposal_seq, created_at, updated_at
       FROM ${table}
       WHERE session_id = $1`,
      [sessionId]
    )

    if ((result.rowCount ?? 0) === 0) {
      return null
    }

    return this.toState(result.rows[0] as SessionRow)
  }

  async upsert(
    sessionId: string,
    input: {
      messages: TrainingCopilotMessage[]
      pendingProposal: TrainingCopilotProposal | null
      decisions: TrainingCopilotDecision[]
      proposalSeq: number
    }
  ): Promise<TrainingCopilotSessionState> {
    const table = this.quoteIdentifier(this.tableName)
    const result = await this.pool.query(
      `INSERT INTO ${table} (
         session_id,
         messages,
         pending_proposal,
         decisions,
         proposal_seq,
         created_at,
         updated_at
       )
       VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5, NOW(), NOW())
       ON CONFLICT (session_id)
       DO UPDATE SET
         messages = EXCLUDED.messages,
         pending_proposal = EXCLUDED.pending_proposal,
         decisions = EXCLUDED.decisions,
         proposal_seq = EXCLUDED.proposal_seq,
         updated_at = NOW()
       RETURNING session_id, messages, pending_proposal, decisions, proposal_seq, created_at, updated_at`,
      [
        sessionId,
        stringifyJsonb(input.messages),
        stringifyJsonb(input.pendingProposal),
        stringifyJsonb(input.decisions),
        Math.max(0, Math.round(input.proposalSeq))
      ]
    )

    return this.toState(result.rows[0] as SessionRow)
  }

  async reset(sessionId: string): Promise<TrainingCopilotSessionState> {
    return this.upsert(sessionId, {
      messages: [],
      pendingProposal: null,
      decisions: [],
      proposalSeq: 0
    })
  }

  async delete(sessionId: string): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(`DELETE FROM ${table} WHERE session_id = $1`, [sessionId])
  }

  private toState(row: SessionRow): TrainingCopilotSessionState {
    const createdAtMs = parseTimestampMs(row.created_at) ?? Date.now()
    const updatedAtMs = parseTimestampMs(row.updated_at) ?? createdAtMs

    return {
      sessionId: row.session_id,
      messages: parseMessages(row.messages),
      pendingProposal: parseProposal(row.pending_proposal),
      decisions: parseDecisions(row.decisions),
      proposalSeq: Number.isFinite(row.proposal_seq) ? Math.max(0, Math.round(row.proposal_seq)) : 0,
      createdAtMs,
      updatedAtMs
    }
  }

  private quoteIdentifier(name: string): string {
    const escaped = name.replace(/"/g, '""')
    return `"${escaped}"`
  }
}

function parseMessages(raw: unknown): TrainingCopilotMessage[] {
  const parsed = parseJsonb(raw)
  if (!Array.isArray(parsed)) {
    return []
  }

  const out: TrainingCopilotMessage[] = []
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue
    }

    const row = entry as Record<string, unknown>
    const id = typeof row.id === 'string' ? row.id : ''
    const role = row.role === 'user' || row.role === 'assistant' ? row.role : null
    const content = typeof row.content === 'string' ? row.content : ''
    const createdAtMs = parseTimestampMs(row.createdAtMs) ?? null

    if (!id || !role || !content.trim() || !createdAtMs) {
      continue
    }

    out.push({
      id,
      role,
      content,
      createdAtMs
    })
  }

  return out.sort((a, b) => a.createdAtMs - b.createdAtMs)
}

function parseProposal(raw: unknown): TrainingCopilotProposal | null {
  const parsed = parseJsonb(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null
  }

  const row = parsed as Record<string, unknown>
  const id = typeof row.id === 'string' ? row.id : ''
  const seq = typeof row.seq === 'number' ? Math.max(0, Math.round(row.seq)) : 0
  const status = row.status === 'pending' ? row.status : null
  const summary = typeof row.summary === 'string' ? row.summary : ''
  const rationale = typeof row.rationale === 'string' ? row.rationale : null
  const patch = row.patch && typeof row.patch === 'object' && !Array.isArray(row.patch) ? row.patch : null
  const createdAtMs = parseTimestampMs(row.createdAtMs) ?? null

  if (!id || !status || !summary.trim() || !patch || !createdAtMs) {
    return null
  }

  return {
    id,
    seq,
    status,
    summary,
    rationale,
    patch: patch as TrainingCopilotProposal['patch'],
    createdAtMs
  }
}

function parseDecisions(raw: unknown): TrainingCopilotDecision[] {
  const parsed = parseJsonb(raw)
  if (!Array.isArray(parsed)) {
    return []
  }

  const out: TrainingCopilotDecision[] = []
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue
    }

    const row = entry as Record<string, unknown>
    const proposalId = typeof row.proposalId === 'string' ? row.proposalId : ''
    const status =
      row.status === 'accepted' || row.status === 'rejected' || row.status === 'superseded'
        ? row.status
        : null
    const actorRole =
      row.actorRole === 'admin' || row.actorRole === 'user' || row.actorRole === 'system'
        ? row.actorRole
        : null
    const actorUid = typeof row.actorUid === 'string' && row.actorUid.trim() ? row.actorUid : null
    const reason = typeof row.reason === 'string' && row.reason.trim() ? row.reason : null
    const createdAtMs = parseTimestampMs(row.createdAtMs) ?? null

    if (!proposalId || !status || !createdAtMs) {
      continue
    }

    out.push({
      proposalId,
      status,
      actorRole,
      actorUid,
      reason,
      createdAtMs
    })
  }

  return out.sort((a, b) => a.createdAtMs - b.createdAtMs)
}

function parseTimestampMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (value instanceof Date) {
    return value.getTime()
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

function parseJsonb(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  try {
    return JSON.parse(trimmed)
  } catch {
    return null
  }
}

function stringifyJsonb(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }

  return JSON.stringify(value)
}
