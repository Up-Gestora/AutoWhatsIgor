import type { Pool } from 'pg'

type DashboardStoreOptions = {
  pool: Pool
  leadsTable?: string
  clientsTable?: string
  inboundTable?: string
  aiResponsesTable?: string
}

export type DashboardStats = {
  totalLeads: number
  totalClients: number
  inboundMessages: number
  aiMessages: number
  responseRate: number
  fromMs: number
  toMs: number
}

export class DashboardStore {
  private readonly pool: Pool
  private readonly leadsTable: string
  private readonly clientsTable: string
  private readonly inboundTable: string
  private readonly aiResponsesTable: string

  constructor(options: DashboardStoreOptions) {
    this.pool = options.pool
    this.leadsTable = options.leadsTable ?? 'leads'
    this.clientsTable = options.clientsTable ?? 'clients'
    this.inboundTable = options.inboundTable ?? 'inbound_messages'
    this.aiResponsesTable = options.aiResponsesTable ?? 'ai_responses'
  }

  async getStats(sessionId: string, fromMs: number, toMs = Date.now()): Promise<DashboardStats> {
    const leadsTable = this.quoteIdentifier(this.leadsTable)
    const clientsTable = this.quoteIdentifier(this.clientsTable)
    const inboundTable = this.quoteIdentifier(this.inboundTable)
    const aiResponsesTable = this.quoteIdentifier(this.aiResponsesTable)

    const [leadsResult, clientsResult, inboundResult, aiResult] = await Promise.all([
      this.pool.query(`SELECT COUNT(*)::int AS count FROM ${leadsTable} WHERE session_id = $1`, [sessionId]),
      this.pool.query(`SELECT COUNT(*)::int AS count FROM ${clientsTable} WHERE session_id = $1`, [sessionId]),
      this.pool.query(
        `SELECT COUNT(*)::int AS count
         FROM ${inboundTable}
         WHERE session_id = $1
         AND from_me = FALSE
         AND message_ts >= to_timestamp($2 / 1000.0)
         AND message_ts <= to_timestamp($3 / 1000.0)`,
        [sessionId, fromMs, toMs]
      ),
      this.pool.query(
        `SELECT COUNT(*)::int AS count
         FROM ${aiResponsesTable}
         WHERE session_id = $1
         AND status = 'sent'
         AND updated_at >= to_timestamp($2 / 1000.0)
         AND updated_at <= to_timestamp($3 / 1000.0)`,
        [sessionId, fromMs, toMs]
      )
    ])

    const totalLeads = Number(leadsResult.rows[0]?.count ?? 0)
    const totalClients = Number(clientsResult.rows[0]?.count ?? 0)
    const inboundMessages = Number(inboundResult.rows[0]?.count ?? 0)
    const aiMessages = Number(aiResult.rows[0]?.count ?? 0)
    const responseRate = inboundMessages > 0 ? aiMessages / inboundMessages : 0

    return {
      totalLeads,
      totalClients,
      inboundMessages,
      aiMessages,
      responseRate,
      fromMs,
      toMs
    }
  }

  private quoteIdentifier(name: string) {
    const escaped = name.replace(/"/g, '""')
    return `"${escaped}"`
  }
}
