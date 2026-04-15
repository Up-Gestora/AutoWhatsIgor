import { config as loadDotenv } from 'dotenv'
import { Pool } from 'pg'

loadDotenv()

const databaseUrl = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL
const sessionId = process.env.SESSION_ID
const leadsTable = process.env.LEADS_TABLE || 'leads'

if (!databaseUrl) {
  throw new Error('DATABASE_URL (or DATABASE_PUBLIC_URL) is required')
}
if (!sessionId) {
  throw new Error('SESSION_ID is required')
}

const now = new Date()
const dayMs = 24 * 60 * 60 * 1000

const leads = [
  {
    leadId: 'demo-lead-001',
    name: 'Mariana Oliveira',
    whatsapp: '+551199990001',
    chatId: 'demo-chat-001',
    status: 'em_processo',
    lastContactAt: new Date(now.getTime() - 2 * dayMs),
    nextContactAt: new Date(now.getTime() + 1 * dayMs),
    observations: 'Quer saber valores e formas de pagamento.',
    createdAt: new Date(now.getTime() - 7 * dayMs),
    lastMessage: 'Qual o preco do plano Pro?',
    source: 'ads'
  },
  {
    leadId: 'demo-lead-002',
    name: 'Carlos Santos',
    whatsapp: '+551199990002',
    chatId: null,
    status: 'novo',
    lastContactAt: new Date(now.getTime() - 1 * dayMs),
    nextContactAt: null,
    observations: null,
    createdAt: new Date(now.getTime() - 5 * dayMs),
    lastMessage: 'Como funciona a conexao?',
    source: 'organic'
  },
  {
    leadId: 'demo-lead-003',
    name: 'Camila Rocha',
    whatsapp: '+551199990003',
    chatId: null,
    status: 'inativo',
    lastContactAt: new Date(now.getTime() - 10 * dayMs),
    nextContactAt: null,
    observations: 'Contato encerrado apos envio do link.',
    createdAt: new Date(now.getTime() - 14 * dayMs),
    lastMessage: 'Obrigada! Vou testar.',
    source: 'ads'
  },
  {
    leadId: 'demo-lead-004',
    name: 'Rafael Lima',
    whatsapp: '+551199990004',
    chatId: null,
    status: 'cliente',
    lastContactAt: new Date(now.getTime() - 3 * dayMs),
    nextContactAt: new Date(now.getTime() + 4 * dayMs),
    observations: 'Cliente ativo, pediu ajuda no onboarding.',
    createdAt: new Date(now.getTime() - 20 * dayMs),
    lastMessage: 'Pode me ajudar a configurar?',
    source: 'referral'
  },
  {
    leadId: 'demo-lead-005',
    name: 'Juliana Costa',
    whatsapp: '+551199990005',
    chatId: null,
    status: 'em_processo',
    lastContactAt: new Date(now.getTime() - 4 * dayMs),
    nextContactAt: new Date(now.getTime() + 2 * dayMs),
    observations: 'Interessada no plano anual.',
    createdAt: new Date(now.getTime() - 9 * dayMs),
    lastMessage: 'Tem desconto no anual?',
    source: 'ads'
  },
  {
    leadId: 'demo-lead-006',
    name: 'Bruno Alves',
    whatsapp: '+551199990006',
    chatId: null,
    status: 'novo',
    lastContactAt: new Date(now.getTime() - 6 * dayMs),
    nextContactAt: null,
    observations: null,
    createdAt: new Date(now.getTime() - 6 * dayMs),
    lastMessage: 'Posso integrar com meu CRM?',
    source: 'organic'
  }
]

const quoteIdentifier = (name: string) => `"${name.replace(/"/g, '""')}"`
const table = quoteIdentifier(leadsTable)

const hostname = (() => {
  try {
    return new URL(databaseUrl).hostname
  } catch {
    return ''
  }
})()

const pool = new Pool({
  connectionString: databaseUrl,
  // Railway proxy requires TLS. Local dev Postgres typically does not.
  ...(hostname && hostname !== 'localhost' && hostname !== '127.0.0.1'
    ? { ssl: { rejectUnauthorized: false } }
    : {})
})

async function upsertLead(lead: (typeof leads)[number]) {
  await pool.query(
    `INSERT INTO ${table} (
      session_id, lead_id, name, whatsapp, chat_id, status, last_contact_at, next_contact_at,
      observations, created_at, last_message, source, updated_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW()
    )
    ON CONFLICT (session_id, lead_id)
    DO UPDATE SET
      name = EXCLUDED.name,
      whatsapp = EXCLUDED.whatsapp,
      chat_id = EXCLUDED.chat_id,
      status = EXCLUDED.status,
      last_contact_at = EXCLUDED.last_contact_at,
      next_contact_at = EXCLUDED.next_contact_at,
      observations = EXCLUDED.observations,
      last_message = EXCLUDED.last_message,
      source = EXCLUDED.source,
      updated_at = NOW()`,
    [
      sessionId,
      lead.leadId,
      lead.name,
      lead.whatsapp,
      lead.chatId,
      lead.status,
      lead.lastContactAt,
      lead.nextContactAt,
      lead.observations,
      lead.createdAt,
      lead.lastMessage,
      lead.source
    ]
  )
}

async function main() {
  for (const lead of leads) {
    // eslint-disable-next-line no-await-in-loop
    await upsertLead(lead)
  }
  // eslint-disable-next-line no-console
  console.log(`OK. Seeded ${leads.length} leads for session ${sessionId}.`)
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end().catch(() => {})
  })
