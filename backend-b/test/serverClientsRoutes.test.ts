import assert from 'node:assert/strict'
import test from 'node:test'
import { buildServer } from '../src/server'
import type { ClientRecord } from '../src/clients/types'

const baseEnv = {
  LOG_LEVEL: 'fatal',
  ALLOWED_ORIGINS: '*',
  ADMIN_API_KEY: 'admin'
} as any

function buildClient(overrides: Partial<ClientRecord> = {}): ClientRecord {
  const now = Date.now()
  return {
    id: 'client-1',
    sessionId: 's1',
    name: 'Alice',
    whatsapp: '5511999999999',
    chatId: null,
    status: 'ativo',
    lastContactAt: now,
    nextContactAt: null,
    observations: null,
    createdAt: now - 60_000,
    lastMessage: null,
    source: 'manual',
    totalValue: null,
    lastPurchaseAt: null,
    updatedAt: now,
    ...overrides
  }
}

test('clients create persists manual client payload', async () => {
  let capturedCreate: any = null

  const app = buildServer(baseEnv, {
    clientStore: {
      create: async (input: any) => {
        capturedCreate = input
        return buildClient({
          id: input.id,
          sessionId: input.sessionId,
          name: input.name,
          whatsapp: input.whatsapp,
          status: input.status,
          nextContactAt: input.nextContactAt,
          observations: input.observations,
          source: input.source
        })
      }
    } as any
  })

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/sessions/s1/clients',
      headers: {
        'x-admin-key': 'admin',
        'content-type': 'application/json'
      },
      payload: {
        name: '  Alice  ',
        whatsapp: ' 5511999999999 ',
        status: 'vip',
        nextContactAt: 123456789,
        observations: '  Cliente premium  '
      }
    })

    assert.equal(response.statusCode, 200)
    const body = response.json() as any
    assert.equal(body.success, true)
    assert.equal(body.client.name, 'Alice')
    assert.equal(body.client.status, 'vip')
    assert.equal(capturedCreate.name, 'Alice')
    assert.equal(capturedCreate.whatsapp, '5511999999999')
    assert.equal(capturedCreate.status, 'vip')
    assert.equal(capturedCreate.nextContactAt, 123456789)
    assert.equal(capturedCreate.observations, 'Cliente premium')
    assert.equal(capturedCreate.source, 'manual')
  } finally {
    await app.close()
  }
})

test('clients create rejects empty payload', async () => {
  const app = buildServer(baseEnv, {
    clientStore: {
      create: async () => buildClient()
    } as any
  })

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/sessions/s1/clients',
      headers: {
        'x-admin-key': 'admin',
        'content-type': 'application/json'
      },
      payload: {}
    })

    assert.equal(response.statusCode, 400)
    assert.equal((response.json() as any).error, 'client_create_required')
  } finally {
    await app.close()
  }
})

test('clients create rejects lead status', async () => {
  const app = buildServer(baseEnv, {
    clientStore: {
      create: async () => buildClient()
    } as any
  })

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/sessions/s1/clients',
      headers: {
        'x-admin-key': 'admin',
        'content-type': 'application/json'
      },
      payload: {
        name: 'Alice',
        status: 'lead'
      }
    })

    assert.equal(response.statusCode, 400)
    assert.equal((response.json() as any).error, 'use_convert_endpoint')
  } finally {
    await app.close()
  }
})

test('clients import rejects empty contacts payload', async () => {
  const app = buildServer(baseEnv, {
    clientStore: {
      create: async () => buildClient()
    } as any
  })

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/sessions/s1/clients/import',
      headers: {
        'x-admin-key': 'admin',
        'content-type': 'application/json'
      },
      payload: {
        contacts: []
      }
    })

    assert.equal(response.statusCode, 400)
    assert.equal((response.json() as any).error, 'client_import_contacts_required')
  } finally {
    await app.close()
  }
})

test('clients import creates, updates and reports invalid rows', async () => {
  const createdPayloads: any[] = []
  const existing = buildClient({
    id: 'client-existing',
    name: 'Bob',
    whatsapp: '5511988888888',
    status: 'ativo',
    observations: 'Atual'
  })

  const app = buildServer(baseEnv, {
    clientStore: {
      findByChatOrWhatsapp: async (_sessionId: string, _chatId: string | null, whatsapp: string | null) => {
        if (whatsapp === '5511988888888') {
          return existing
        }
        return null
      },
      create: async (input: any) => {
        createdPayloads.push(input)
        return buildClient({
          id: input.id,
          sessionId: input.sessionId,
          name: input.name,
          whatsapp: input.whatsapp,
          status: input.status,
          nextContactAt: input.nextContactAt,
          observations: input.observations,
          source: input.source
        })
      }
    } as any
  })

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/sessions/s1/clients/import',
      headers: {
        'x-admin-key': 'admin',
        'content-type': 'application/json'
      },
      payload: {
        contacts: [
          { name: 'Alice', whatsapp: '5511999999999', status: 'vip' },
          { name: 'Bob Atualizado', whatsapp: '5511988888888', observations: 'VIP' },
          { name: '   ', whatsapp: '   ' },
          { name: 'Carol', status: 'lead' }
        ]
      }
    })

    assert.equal(response.statusCode, 200)
    const body = response.json() as any
    assert.equal(body.success, true)
    assert.deepEqual(body.summary, {
      total: 4,
      created: 1,
      updated: 1,
      skipped: 0,
      invalid: 2
    })
    assert.deepEqual(body.invalidRows, [
      { index: 2, error: 'client_create_required' },
      { index: 3, error: 'use_convert_endpoint' }
    ])
    assert.equal(createdPayloads.length, 2)
    assert.equal(createdPayloads[0].id !== undefined, true)
    assert.equal(createdPayloads[0].name, 'Alice')
    assert.equal(createdPayloads[0].status, 'vip')
    assert.equal(createdPayloads[0].source, 'import')
    assert.equal(createdPayloads[1].id, 'client-existing')
    assert.equal(createdPayloads[1].name, 'Bob Atualizado')
    assert.equal(createdPayloads[1].status, 'ativo')
    assert.equal(createdPayloads[1].observations, 'VIP')
    assert.equal(createdPayloads[1].source, existing.source)
  } finally {
    await app.close()
  }
})

test('clients import skips existing rows when updateExisting is false', async () => {
  let createCalls = 0
  const existing = buildClient({
    id: 'client-existing',
    whatsapp: '5511988888888'
  })

  const app = buildServer(baseEnv, {
    clientStore: {
      findByChatOrWhatsapp: async (_sessionId: string, _chatId: string | null, whatsapp: string | null) => {
        if (whatsapp === existing.whatsapp) {
          return existing
        }
        return null
      },
      create: async () => {
        createCalls += 1
        return buildClient()
      }
    } as any
  })

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/sessions/s1/clients/import',
      headers: {
        'x-admin-key': 'admin',
        'content-type': 'application/json'
      },
      payload: {
        updateExisting: false,
        contacts: [{ name: 'Bob', whatsapp: existing.whatsapp }]
      }
    })

    assert.equal(response.statusCode, 200)
    const body = response.json() as any
    assert.equal(body.success, true)
    assert.deepEqual(body.summary, {
      total: 1,
      created: 0,
      updated: 0,
      skipped: 1,
      invalid: 0
    })
    assert.deepEqual(body.invalidRows, [])
    assert.equal(createCalls, 0)
  } finally {
    await app.close()
  }
})
