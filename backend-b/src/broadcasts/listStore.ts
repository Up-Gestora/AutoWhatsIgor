import type { Pool } from 'pg'
import { normalizeWhatsappToE164Digits } from '../whatsapp/normalize'
import type { BroadcastContactRecord, BroadcastListRecord } from './types'

type BroadcastListStoreOptions = {
  pool: Pool
  listsTableName?: string
  contactsTableName?: string
  defaultCountryCode: string
  brStripNinthDigit?: boolean
  maxContactsPerList: number
}

type BroadcastListRow = {
  session_id: string
  list_id: string
  name: string
  created_at: Date | string | null
  updated_at: Date | string | null
  contacts_count?: number | string | null
}

type BroadcastContactRow = {
  session_id: string
  list_id: string
  contact_id: string
  name: string | null
  whatsapp: string
  created_at: Date | string | null
  updated_at: Date | string | null
}

export class BroadcastListStore {
  private readonly pool: Pool
  private readonly listsTableName: string
  private readonly contactsTableName: string
  private readonly defaultCountryCode: string
  private readonly brStripNinthDigit: boolean
  private readonly maxContactsPerList: number

  constructor(options: BroadcastListStoreOptions) {
    this.pool = options.pool
    this.listsTableName = options.listsTableName ?? 'broadcast_lists'
    this.contactsTableName = options.contactsTableName ?? 'broadcast_list_contacts'
    this.defaultCountryCode = options.defaultCountryCode
    this.brStripNinthDigit = Boolean(options.brStripNinthDigit)
    this.maxContactsPerList = Math.max(1, Math.floor(options.maxContactsPerList))
  }

  async init(): Promise<void> {
    const lists = this.quoteIdentifier(this.listsTableName)
    const contacts = this.quoteIdentifier(this.contactsTableName)

    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${lists} (
        session_id TEXT NOT NULL,
        list_id TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (session_id, list_id)
      )`
    )

    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${contacts} (
        session_id TEXT NOT NULL,
        list_id TEXT NOT NULL,
        contact_id TEXT NOT NULL,
        name TEXT,
        whatsapp TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (session_id, list_id, contact_id)
      )`
    )

    await this.pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.contactsTableName}_whatsapp_unique_idx`)}
       ON ${contacts} (session_id, list_id, whatsapp)`
    )
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.listsTableName}_session_updated_idx`)}
       ON ${lists} (session_id, updated_at DESC)`
    )
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.contactsTableName}_session_list_created_idx`)}
       ON ${contacts} (session_id, list_id, created_at ASC)`
    )
  }

  async listLists(sessionId: string, limit = 200): Promise<BroadcastListRecord[]> {
    const safeSessionId = sessionId.trim()
    if (!safeSessionId) {
      throw new Error('sessionId is required')
    }

    const lists = this.quoteIdentifier(this.listsTableName)
    const contacts = this.quoteIdentifier(this.contactsTableName)
    const safeLimit = clampLimit(limit, 1, 1000)
    const result = await this.pool.query(
      `SELECT l.session_id, l.list_id, l.name, l.created_at, l.updated_at,
              COALESCE(c.contacts_count, 0) AS contacts_count
       FROM ${lists} l
       LEFT JOIN (
         SELECT session_id, list_id, COUNT(*)::INT AS contacts_count
         FROM ${contacts}
         WHERE session_id = $1
         GROUP BY session_id, list_id
       ) c
       ON c.session_id = l.session_id AND c.list_id = l.list_id
       WHERE l.session_id = $1
       ORDER BY l.updated_at DESC, l.created_at DESC
       LIMIT $2`,
      [safeSessionId, safeLimit]
    )
    return result.rows.map((row) => this.toList(row as BroadcastListRow))
  }

  async getList(sessionId: string, listId: string): Promise<BroadcastListRecord | null> {
    const safeSessionId = sessionId.trim()
    const safeListId = listId.trim()
    if (!safeSessionId) {
      throw new Error('sessionId is required')
    }
    if (!safeListId) {
      throw new Error('listId is required')
    }

    const lists = this.quoteIdentifier(this.listsTableName)
    const contacts = this.quoteIdentifier(this.contactsTableName)
    const result = await this.pool.query(
      `SELECT l.session_id, l.list_id, l.name, l.created_at, l.updated_at,
              COALESCE(c.contacts_count, 0) AS contacts_count
       FROM ${lists} l
       LEFT JOIN (
         SELECT session_id, list_id, COUNT(*)::INT AS contacts_count
         FROM ${contacts}
         WHERE session_id = $1 AND list_id = $2
         GROUP BY session_id, list_id
       ) c
       ON c.session_id = l.session_id AND c.list_id = l.list_id
       WHERE l.session_id = $1 AND l.list_id = $2
       LIMIT 1`,
      [safeSessionId, safeListId]
    )
    if (result.rowCount === 0) {
      return null
    }
    return this.toList(result.rows[0] as BroadcastListRow)
  }

  async createList(sessionId: string, listId: string, name: string): Promise<BroadcastListRecord> {
    const safeSessionId = sessionId.trim()
    const safeListId = listId.trim()
    const safeName = name.trim()
    if (!safeSessionId) {
      throw new Error('sessionId is required')
    }
    if (!safeListId) {
      throw new Error('listId is required')
    }
    if (!safeName) {
      throw new Error('name is required')
    }

    const lists = this.quoteIdentifier(this.listsTableName)
    const result = await this.pool.query(
      `INSERT INTO ${lists} (session_id, list_id, name, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       RETURNING session_id, list_id, name, created_at, updated_at`,
      [safeSessionId, safeListId, safeName]
    )
    return this.toList({ ...(result.rows[0] as BroadcastListRow), contacts_count: 0 })
  }

  async updateList(sessionId: string, listId: string, name: string): Promise<BroadcastListRecord | null> {
    const safeSessionId = sessionId.trim()
    const safeListId = listId.trim()
    const safeName = name.trim()
    if (!safeSessionId) {
      throw new Error('sessionId is required')
    }
    if (!safeListId) {
      throw new Error('listId is required')
    }
    if (!safeName) {
      throw new Error('name is required')
    }

    const lists = this.quoteIdentifier(this.listsTableName)
    const result = await this.pool.query(
      `UPDATE ${lists}
       SET name = $3, updated_at = NOW()
       WHERE session_id = $1 AND list_id = $2
       RETURNING session_id, list_id, name, created_at, updated_at`,
      [safeSessionId, safeListId, safeName]
    )

    if (result.rowCount === 0) {
      return null
    }

    const list = this.toList({ ...(result.rows[0] as BroadcastListRow), contacts_count: null })
    const count = await this.countContacts(safeSessionId, safeListId)
    return { ...list, contactsCount: count }
  }

  async deleteList(sessionId: string, listId: string): Promise<void> {
    const safeSessionId = sessionId.trim()
    const safeListId = listId.trim()
    if (!safeSessionId) {
      throw new Error('sessionId is required')
    }
    if (!safeListId) {
      throw new Error('listId is required')
    }

    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const contacts = this.quoteIdentifier(this.contactsTableName)
      const lists = this.quoteIdentifier(this.listsTableName)
      await client.query(`DELETE FROM ${contacts} WHERE session_id = $1 AND list_id = $2`, [safeSessionId, safeListId])
      await client.query(`DELETE FROM ${lists} WHERE session_id = $1 AND list_id = $2`, [safeSessionId, safeListId])
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async listContacts(sessionId: string, listId: string, limit = 5000): Promise<BroadcastContactRecord[]> {
    const safeSessionId = sessionId.trim()
    const safeListId = listId.trim()
    if (!safeSessionId) {
      throw new Error('sessionId is required')
    }
    if (!safeListId) {
      throw new Error('listId is required')
    }

    const contacts = this.quoteIdentifier(this.contactsTableName)
    const safeLimit = clampLimit(limit, 1, this.maxContactsPerList)
    const result = await this.pool.query(
      `SELECT session_id, list_id, contact_id, name, whatsapp, created_at, updated_at
       FROM ${contacts}
       WHERE session_id = $1 AND list_id = $2
       ORDER BY created_at ASC, contact_id ASC
       LIMIT $3`,
      [safeSessionId, safeListId, safeLimit]
    )
    return result.rows.map((row) => this.toContact(row as BroadcastContactRow))
  }

  async upsertContact(input: {
    sessionId: string
    listId: string
    contactId: string
    name?: string | null
    whatsapp: string
  }): Promise<BroadcastContactRecord> {
    const safeSessionId = input.sessionId.trim()
    const safeListId = input.listId.trim()
    const safeContactId = input.contactId.trim()
    const safeName = typeof input.name === 'string' ? input.name.trim() : ''
    if (!safeSessionId) {
      throw new Error('sessionId is required')
    }
    if (!safeListId) {
      throw new Error('listId is required')
    }
    if (!safeContactId) {
      throw new Error('contactId is required')
    }

    const whatsapp = this.normalizeWhatsapp(input.whatsapp)

    const existing = await this.findContactByWhatsapp(safeSessionId, safeListId, whatsapp)
    if (!existing) {
      const count = await this.countContacts(safeSessionId, safeListId)
      if (count >= this.maxContactsPerList) {
        throw new Error('broadcast_list_contacts_limit_exceeded')
      }
    }

    const contacts = this.quoteIdentifier(this.contactsTableName)
    const result = await this.pool.query(
      `INSERT INTO ${contacts} (session_id, list_id, contact_id, name, whatsapp, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT (session_id, list_id, whatsapp)
       DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
       RETURNING session_id, list_id, contact_id, name, whatsapp, created_at, updated_at`,
      [safeSessionId, safeListId, safeContactId, safeName || null, whatsapp]
    )
    return this.toContact(result.rows[0] as BroadcastContactRow)
  }

  async upsertContactsBulk(options: {
    sessionId: string
    listId: string
    contacts: Array<{ contactId: string; name?: string | null; whatsapp: string }>
  }): Promise<{ inserted: number; updated: number }> {
    const safeSessionId = options.sessionId.trim()
    const safeListId = options.listId.trim()
    if (!safeSessionId) {
      throw new Error('sessionId is required')
    }
    if (!safeListId) {
      throw new Error('listId is required')
    }

    const rows = (options.contacts ?? [])
      .map((contact) => {
        const contactId = contact.contactId?.trim()
        const name = typeof contact.name === 'string' ? contact.name.trim() : ''
        const whatsapp = contact.whatsapp
        if (!contactId) {
          return null
        }
        try {
          const normalized = this.normalizeWhatsapp(whatsapp)
          return { contactId, name: name || null, whatsapp: normalized }
        } catch {
          return null
        }
      })
      .filter(Boolean) as Array<{ contactId: string; name: string | null; whatsapp: string }>

    if (rows.length === 0) {
      return { inserted: 0, updated: 0 }
    }

    const uniqueByWhatsapp = new Map<string, { contactId: string; name: string | null; whatsapp: string }>()
    for (const row of rows) {
      uniqueByWhatsapp.set(row.whatsapp, row)
    }
    const deduped = Array.from(uniqueByWhatsapp.values())

    const whatsapps = deduped.map((row) => row.whatsapp)
    const existingWhatsapps = await this.listExistingWhatsapps(safeSessionId, safeListId, whatsapps)
    const newCount = whatsapps.length - existingWhatsapps.size

    const currentCount = await this.countContacts(safeSessionId, safeListId)
    if (currentCount + newCount > this.maxContactsPerList) {
      throw new Error('broadcast_list_contacts_limit_exceeded')
    }

    const contactIds = deduped.map((row) => row.contactId)
    const names = deduped.map((row) => row.name)

    const contacts = this.quoteIdentifier(this.contactsTableName)
    const result = await this.pool.query(
      `INSERT INTO ${contacts} (session_id, list_id, contact_id, name, whatsapp, created_at, updated_at)
       SELECT $1, $2, x.contact_id, x.name, x.whatsapp, NOW(), NOW()
       FROM UNNEST($3::text[], $4::text[], $5::text[]) AS x(contact_id, name, whatsapp)
       ON CONFLICT (session_id, list_id, whatsapp)
       DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
       RETURNING whatsapp, xmax`,
      [safeSessionId, safeListId, contactIds, names, whatsapps]
    )

    let inserted = 0
    let updated = 0
    for (const row of result.rows as Array<{ whatsapp: string; xmax: string | number }>) {
      const xmax = typeof row.xmax === 'string' ? Number(row.xmax) : Number(row.xmax)
      if (!Number.isFinite(xmax) || xmax === 0) {
        inserted += 1
      } else {
        updated += 1
      }
    }

    return { inserted, updated }
  }

  async updateContact(
    sessionId: string,
    listId: string,
    contactId: string,
    update: { name?: string | null; whatsapp?: string }
  ): Promise<BroadcastContactRecord | null> {
    const safeSessionId = sessionId.trim()
    const safeListId = listId.trim()
    const safeContactId = contactId.trim()
    if (!safeSessionId) {
      throw new Error('sessionId is required')
    }
    if (!safeListId) {
      throw new Error('listId is required')
    }
    if (!safeContactId) {
      throw new Error('contactId is required')
    }

    const fields: string[] = []
    const values: Array<string | null> = [safeSessionId, safeListId, safeContactId]
    let index = 4

    if (Object.prototype.hasOwnProperty.call(update, 'name')) {
      const name = typeof update.name === 'string' ? update.name.trim() : ''
      fields.push(`name = $${index}`)
      values.push(name ? name : null)
      index += 1
    }

    if (typeof update.whatsapp === 'string') {
      const normalized = this.normalizeWhatsapp(update.whatsapp)
      fields.push(`whatsapp = $${index}`)
      values.push(normalized)
      index += 1
    }

    if (fields.length === 0) {
      return this.getContact(safeSessionId, safeListId, safeContactId)
    }

    const contacts = this.quoteIdentifier(this.contactsTableName)
    try {
      const result = await this.pool.query(
        `UPDATE ${contacts}
         SET ${fields.join(', ')}, updated_at = NOW()
         WHERE session_id = $1 AND list_id = $2 AND contact_id = $3
         RETURNING session_id, list_id, contact_id, name, whatsapp, created_at, updated_at`,
        values
      )
      if (result.rowCount === 0) {
        return null
      }
      return this.toContact(result.rows[0] as BroadcastContactRow)
    } catch (error) {
      const code = (error as any)?.code
      if (code === '23505') {
        throw new Error('broadcast_contact_whatsapp_conflict')
      }
      throw error
    }
  }

  async deleteContact(sessionId: string, listId: string, contactId: string): Promise<void> {
    const safeSessionId = sessionId.trim()
    const safeListId = listId.trim()
    const safeContactId = contactId.trim()
    if (!safeSessionId) {
      throw new Error('sessionId is required')
    }
    if (!safeListId) {
      throw new Error('listId is required')
    }
    if (!safeContactId) {
      throw new Error('contactId is required')
    }

    const contacts = this.quoteIdentifier(this.contactsTableName)
    await this.pool.query(
      `DELETE FROM ${contacts} WHERE session_id = $1 AND list_id = $2 AND contact_id = $3`,
      [safeSessionId, safeListId, safeContactId]
    )
  }

  async getContact(sessionId: string, listId: string, contactId: string): Promise<BroadcastContactRecord | null> {
    const contacts = this.quoteIdentifier(this.contactsTableName)
    const result = await this.pool.query(
      `SELECT session_id, list_id, contact_id, name, whatsapp, created_at, updated_at
       FROM ${contacts}
       WHERE session_id = $1 AND list_id = $2 AND contact_id = $3
       LIMIT 1`,
      [sessionId, listId, contactId]
    )
    if (result.rowCount === 0) {
      return null
    }
    return this.toContact(result.rows[0] as BroadcastContactRow)
  }

  private normalizeWhatsapp(raw: string): string {
    return normalizeWhatsappToE164Digits(raw, this.defaultCountryCode, { brStripNinthDigit: this.brStripNinthDigit })
  }

  private async countContacts(sessionId: string, listId: string): Promise<number> {
    const contacts = this.quoteIdentifier(this.contactsTableName)
    const result = await this.pool.query(
      `SELECT COUNT(*)::INT AS count
       FROM ${contacts}
       WHERE session_id = $1 AND list_id = $2`,
      [sessionId, listId]
    )
    const value = (result.rows?.[0] as any)?.count
    const count = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(count) ? count : 0
  }

  private async listExistingWhatsapps(sessionId: string, listId: string, whatsapps: string[]): Promise<Set<string>> {
    if (whatsapps.length === 0) {
      return new Set()
    }
    const contacts = this.quoteIdentifier(this.contactsTableName)
    const result = await this.pool.query(
      `SELECT whatsapp
       FROM ${contacts}
       WHERE session_id = $1 AND list_id = $2 AND whatsapp = ANY($3::text[])`,
      [sessionId, listId, whatsapps]
    )
    return new Set(result.rows.map((row) => String((row as any).whatsapp)))
  }

  private async findContactByWhatsapp(
    sessionId: string,
    listId: string,
    whatsapp: string
  ): Promise<BroadcastContactRecord | null> {
    const contacts = this.quoteIdentifier(this.contactsTableName)
    const result = await this.pool.query(
      `SELECT session_id, list_id, contact_id, name, whatsapp, created_at, updated_at
       FROM ${contacts}
       WHERE session_id = $1 AND list_id = $2 AND whatsapp = $3
       LIMIT 1`,
      [sessionId, listId, whatsapp]
    )
    if (result.rowCount === 0) {
      return null
    }
    return this.toContact(result.rows[0] as BroadcastContactRow)
  }

  private toList(row: BroadcastListRow): BroadcastListRecord {
    const contactsCountRaw = (row.contacts_count ?? 0) as any
    const contactsCount = typeof contactsCountRaw === 'number' ? contactsCountRaw : Number(contactsCountRaw)
    return {
      id: row.list_id,
      sessionId: row.session_id,
      name: row.name,
      contactsCount: Number.isFinite(contactsCount) ? contactsCount : 0,
      createdAt: toMs(row.created_at),
      updatedAt: toMs(row.updated_at)
    }
  }

  private toContact(row: BroadcastContactRow): BroadcastContactRecord {
    return {
      id: row.contact_id,
      sessionId: row.session_id,
      listId: row.list_id,
      name: row.name ?? null,
      whatsapp: row.whatsapp,
      createdAt: toMs(row.created_at),
      updatedAt: toMs(row.updated_at)
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

function clampLimit(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min
  }
  return Math.min(max, Math.max(min, Math.floor(value)))
}

