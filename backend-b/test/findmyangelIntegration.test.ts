import assert from 'node:assert/strict'
import test from 'node:test'
import { buildServer } from '../src/server'
import {
  handleFindmyangelTemplateMessage,
  handleFindmyangelUserCreated,
  normalizeFindmyangelWhatsappCandidates,
  normalizeFindmyangelWhatsappToE164Digits,
  renderWelcomeText,
  toUserJid
} from '../src/integrations/findmyangel'

test('normalizeFindmyangelWhatsappToE164Digits normalizes BR formatted numbers', () => {
  assert.equal(normalizeFindmyangelWhatsappToE164Digits('(11) 99999-9999', '55'), '5511999999999')
})

test('normalizeFindmyangelWhatsappToE164Digits normalizes BR formatted landline/legacy numbers (10 digits)', () => {
  assert.equal(normalizeFindmyangelWhatsappToE164Digits('(43) 8846-2272', '55'), '554388462272')
})

test('normalizeFindmyangelWhatsappToE164Digits strips BR ninth digit when enabled', () => {
  assert.equal(normalizeFindmyangelWhatsappToE164Digits('(43) 9 8846-2272', '55'), '5543988462272')
  assert.equal(
    normalizeFindmyangelWhatsappToE164Digits('(43) 9 8846-2272', '55', { brStripNinthDigit: true }),
    '554388462272'
  )
  assert.equal(
    normalizeFindmyangelWhatsappToE164Digits('+55 43 9 8846-2272', '55', { brStripNinthDigit: true }),
    '554388462272'
  )
})

test('normalizeFindmyangelWhatsappCandidates builds with9/without9 variants for BR mobile', () => {
  const candidates = normalizeFindmyangelWhatsappCandidates('(43) 9 8846-2272', '55')
  assert.deepEqual(candidates, [
    { kind: 'with9', digits: '5543988462272' },
    { kind: 'without9', digits: '554388462272' }
  ])
})

test('normalizeFindmyangelWhatsappToE164Digits keeps E.164 when + is present', () => {
  assert.equal(normalizeFindmyangelWhatsappToE164Digits('+55 11 99999-9999', '55'), '5511999999999')
})

test('normalizeFindmyangelWhatsappToE164Digits accepts raw digit E.164 without +', () => {
  assert.equal(normalizeFindmyangelWhatsappToE164Digits('5511999999999', '55'), '5511999999999')
})

test('normalizeFindmyangelWhatsappToE164Digits throws on invalid input', () => {
  assert.throws(() => normalizeFindmyangelWhatsappToE164Digits('', '55'), /invalid_whatsapp/)
  assert.throws(() => normalizeFindmyangelWhatsappToE164Digits('abc', '55'), /invalid_whatsapp/)
})

test('toUserJid builds user JID from E.164 digits', () => {
  assert.equal(toUserJid('5511999999999'), '5511999999999@s.whatsapp.net')
})

test('renderWelcomeText replaces placeholders and cleans spacing', () => {
  assert.equal(renderWelcomeText('Olá {name}!', { name: 'Maria' }), 'Olá Maria!')
  assert.equal(renderWelcomeText('Olá {name}!', { name: null }), 'Olá!')
  assert.equal(renderWelcomeText('Email: {email}.', { email: 'a@b.com' }), 'Email: a@b.com.')
})

test('handleFindmyangelUserCreated upserts lead and enqueues welcome message', async () => {
  let capturedLead: any = null
  let capturedOutbound: any = null

  const result = await handleFindmyangelUserCreated({
    payload: {
      userId: 'uid-1',
      name: 'Maria',
      email: 'maria@example.com',
      whatsapp: '(11) 99999-9999',
      createdAtMs: 123
    },
    idempotencyKey: 'idem-1',
    env: {
      FINDMYANGEL_TARGET_SESSION_ID: 'session-1',
      FINDMYANGEL_TARGET_USER_EMAIL: 'angel@findmyangel.com',
      FINDMYANGEL_WELCOME_TEXT: 'Olá {name}!',
      FINDMYANGEL_DEFAULT_COUNTRY_CODE: '55'
    },
    deps: {
      leadStore: {
        upsertFromClient: async (input: any) => {
          capturedLead = input
          return {
            id: input.leadId,
            sessionId: input.sessionId
          }
        }
      } as any,
      outboundService: {
        enqueueText: async (input: any) => {
          capturedOutbound = input
          return { id: 42 }
        }
      } as any,
      now: () => 1000
    }
  })

  assert.equal(result.sessionId, 'session-1')
  assert.equal(result.chatId, '5511999999999@s.whatsapp.net')
  assert.equal(result.leadId, result.chatId)
  assert.equal(result.outboundId, 42)

  assert.equal(capturedLead.sessionId, 'session-1')
  assert.equal(capturedLead.leadId, '5511999999999@s.whatsapp.net')
  assert.equal(capturedLead.chatId, '5511999999999@s.whatsapp.net')
  assert.equal(capturedLead.whatsapp, '5511999999999')
  assert.equal(capturedLead.source, 'findmyangel')
  assert.equal(capturedLead.createdAtMs, 123)
  assert.equal(capturedLead.lastContactAtMs, 1000)
  assert.equal(capturedLead.observations, '[FindmyAngel] email=maria@example.com uid=uid-1')

  assert.equal(capturedOutbound.sessionId, 'session-1')
  assert.equal(capturedOutbound.chatId, '5511999999999@s.whatsapp.net')
  assert.equal(capturedOutbound.text, 'Olá Maria!')
  assert.equal(capturedOutbound.idempotencyKey, 'idem-1')
  assert.equal(capturedOutbound.origin, 'automation_api')
})

test('handleFindmyangelUserCreated falls back to with9 when lookup is unavailable', async () => {
  let capturedLead: any = null
  let capturedOutbound: any = null

  const result = await handleFindmyangelUserCreated({
    payload: {
      userId: 'uid-strip-9',
      name: 'Teste',
      email: 't@example.com',
      whatsapp: '(43) 9 8846-2272'
    },
    env: {
      FINDMYANGEL_TARGET_SESSION_ID: 'session-1',
      FINDMYANGEL_TARGET_USER_EMAIL: 'angel@findmyangel.com',
      FINDMYANGEL_BR_STRIP_NINTH_DIGIT: true,
      FINDMYANGEL_WELCOME_TEXT: 'Olá {name}!',
      FINDMYANGEL_DEFAULT_COUNTRY_CODE: '55'
    },
    deps: {
      leadStore: {
        upsertFromClient: async (input: any) => {
          capturedLead = input
          return {
            id: input.leadId,
            sessionId: input.sessionId
          }
        }
      } as any,
      outboundService: {
        enqueueText: async (input: any) => {
          capturedOutbound = input
          return { id: 999 }
        }
      } as any,
      now: () => 1000
    }
  })

  assert.equal(result.chatId, '5543988462272@s.whatsapp.net')
  assert.equal(result.resolution?.strategy, 'auto_detect')
  assert.equal(result.resolution?.chosen, 'with9')
  assert.equal(result.resolution?.reason, 'both_unknown')
  assert.equal(result.resolution?.existsWith9, null)
  assert.equal(result.resolution?.existsWithout9, null)
  assert.equal(capturedLead.whatsapp, '5543988462272')
  assert.equal(capturedLead.chatId, '5543988462272@s.whatsapp.net')
  assert.equal(capturedOutbound.chatId, '5543988462272@s.whatsapp.net')
})

test('handleFindmyangelUserCreated resolves to without9 when only without9 exists', async () => {
  let capturedLead: any = null
  let capturedOutbound: any = null
  const lookupCalls: string[][] = []

  const result = await handleFindmyangelUserCreated({
    payload: {
      userId: 'uid-without9',
      whatsapp: '(43) 9 8846-2272'
    },
    env: {
      FINDMYANGEL_TARGET_SESSION_ID: 'session-1',
      FINDMYANGEL_TARGET_USER_EMAIL: 'angel@findmyangel.com',
      FINDMYANGEL_WELCOME_TEXT: 'OlÃ¡ {name}!',
      FINDMYANGEL_DEFAULT_COUNTRY_CODE: '55'
    },
    deps: {
      leadStore: {
        upsertFromClient: async (input: any) => {
          capturedLead = input
          return { id: input.leadId, sessionId: input.sessionId }
        }
      } as any,
      outboundService: {
        enqueueText: async (input: any) => {
          capturedOutbound = input
          return { id: 55 }
        }
      } as any,
      whatsappLookup: {
        checkWhatsappNumbers: async (_sessionId: string, phoneNumbers: string[]) => {
          lookupCalls.push(phoneNumbers)
          const candidate = phoneNumbers[0]
          if (candidate === '5543988462272') {
            return [{ phoneNumber: candidate, exists: false }]
          }
          if (candidate === '554388462272') {
            return [{ phoneNumber: candidate, exists: true }]
          }
          return []
        }
      }
    }
  })

  assert.deepEqual(lookupCalls, [['5543988462272'], ['554388462272']])
  assert.equal(result.chatId, '554388462272@s.whatsapp.net')
  assert.equal(result.resolution?.chosen, 'without9')
  assert.equal(result.resolution?.reason, 'exists_without9')
  assert.equal(result.resolution?.existsWith9, false)
  assert.equal(result.resolution?.existsWithout9, true)
  assert.equal(capturedLead.whatsapp, '554388462272')
  assert.equal(capturedOutbound.chatId, '554388462272@s.whatsapp.net')
})

test('handleFindmyangelUserCreated resolves to with9 when both variants exist', async () => {
  const lookupCalls: string[][] = []
  const result = await handleFindmyangelUserCreated({
    payload: {
      userId: 'uid-both',
      whatsapp: '(43) 9 8846-2272'
    },
    env: {
      FINDMYANGEL_TARGET_SESSION_ID: 'session-1',
      FINDMYANGEL_TARGET_USER_EMAIL: 'angel@findmyangel.com',
      FINDMYANGEL_WELCOME_TEXT: 'OlÃ¡ {name}!',
      FINDMYANGEL_DEFAULT_COUNTRY_CODE: '55'
    },
    deps: {
      leadStore: { upsertFromClient: async () => ({}) } as any,
      outboundService: { enqueueText: async () => ({ id: 1 }) } as any,
      whatsappLookup: {
        checkWhatsappNumbers: async (_sessionId: string, phoneNumbers: string[]) => {
          lookupCalls.push(phoneNumbers)
          const candidate = phoneNumbers[0]
          return [{ phoneNumber: candidate, exists: true }]
        }
      }
    }
  })

  assert.deepEqual(lookupCalls, [['5543988462272'], ['554388462272']])
  assert.equal(result.chatId, '5543988462272@s.whatsapp.net')
  assert.equal(result.resolution?.chosen, 'with9')
  assert.equal(result.resolution?.reason, 'both_exists')
  assert.equal(result.resolution?.existsWith9, true)
  assert.equal(result.resolution?.existsWithout9, true)
})

test('handleFindmyangelUserCreated keeps with9 when with9 probe returns canonical without9 phone', async () => {
  const result = await handleFindmyangelUserCreated({
    payload: {
      userId: 'uid-canonical-without9',
      whatsapp: '(43) 9 8846-2272'
    },
    env: {
      FINDMYANGEL_TARGET_SESSION_ID: 'session-1',
      FINDMYANGEL_TARGET_USER_EMAIL: 'angel@findmyangel.com',
      FINDMYANGEL_WELCOME_TEXT: 'OlÃƒÂ¡ {name}!',
      FINDMYANGEL_DEFAULT_COUNTRY_CODE: '55'
    },
    deps: {
      leadStore: { upsertFromClient: async () => ({}) } as any,
      outboundService: { enqueueText: async () => ({ id: 1 }) } as any,
      whatsappLookup: {
        checkWhatsappNumbers: async (_sessionId: string, phoneNumbers: string[]) => {
          const candidate = phoneNumbers[0]
          if (candidate === '5543988462272') {
            return [{ phoneNumber: '554388462272', exists: true }]
          }
          return [{ phoneNumber: '554388462272', exists: true }]
        }
      }
    }
  })

  assert.equal(result.chatId, '5543988462272@s.whatsapp.net')
  assert.equal(result.resolution?.chosen, 'with9')
  assert.equal(result.resolution?.reason, 'both_exists')
  assert.equal(result.resolution?.existsWith9, true)
  assert.equal(result.resolution?.existsWithout9, true)
})

test('handleFindmyangelUserCreated uses preferred variant when both candidates exist', async () => {
  const result = await handleFindmyangelUserCreated({
    payload: {
      userId: 'uid-preferred-both',
      whatsapp: '(43) 9 8846-2272'
    },
    env: {
      FINDMYANGEL_TARGET_SESSION_ID: 'session-1',
      FINDMYANGEL_TARGET_USER_EMAIL: 'angel@findmyangel.com',
      FINDMYANGEL_WELCOME_TEXT: 'OlÃ¡ {name}!',
      FINDMYANGEL_DEFAULT_COUNTRY_CODE: '55'
    },
    deps: {
      leadStore: { upsertFromClient: async () => ({}) } as any,
      outboundService: { enqueueText: async () => ({ id: 1 }) } as any,
      whatsappPreferenceStore: {
        getPreferredVariant: async () => 'without9'
      } as any,
      whatsappLookup: {
        checkWhatsappNumbers: async (_sessionId: string, phoneNumbers: string[]) => {
          return [{ phoneNumber: phoneNumbers[0], exists: true }]
        }
      }
    }
  })

  assert.equal(result.chatId, '554388462272@s.whatsapp.net')
  assert.equal(result.resolution?.chosen, 'without9')
  assert.equal(result.resolution?.reason, 'both_exists_preferred')
  assert.equal(result.resolution?.preferredVariantBefore, 'without9')
})

test('handleFindmyangelUserCreated uses preferred variant when lookup fails', async () => {
  const result = await handleFindmyangelUserCreated({
    payload: {
      userId: 'uid-preferred-check-failed',
      whatsapp: '(43) 9 8846-2272'
    },
    env: {
      FINDMYANGEL_TARGET_SESSION_ID: 'session-1',
      FINDMYANGEL_TARGET_USER_EMAIL: 'angel@findmyangel.com',
      FINDMYANGEL_WELCOME_TEXT: 'OlÃ¡ {name}!',
      FINDMYANGEL_DEFAULT_COUNTRY_CODE: '55'
    },
    deps: {
      leadStore: { upsertFromClient: async () => ({}) } as any,
      outboundService: { enqueueText: async () => ({ id: 1 }) } as any,
      whatsappPreferenceStore: {
        getPreferredVariant: async () => 'without9'
      } as any,
      whatsappLookup: {
        checkWhatsappNumbers: async () => {
          throw new Error('lookup-failed')
        }
      }
    }
  })

  assert.equal(result.chatId, '554388462272@s.whatsapp.net')
  assert.equal(result.resolution?.chosen, 'without9')
  assert.equal(result.resolution?.reason, 'check_failed_preferred')
  assert.equal(result.resolution?.preferredVariantBefore, 'without9')
})

test('handleFindmyangelUserCreated falls back to with9 when lookup throws', async () => {
  const result = await handleFindmyangelUserCreated({
    payload: {
      userId: 'uid-lookup-fail',
      whatsapp: '(43) 9 8846-2272'
    },
    env: {
      FINDMYANGEL_TARGET_SESSION_ID: 'session-1',
      FINDMYANGEL_TARGET_USER_EMAIL: 'angel@findmyangel.com',
      FINDMYANGEL_WELCOME_TEXT: 'OlÃ¡ {name}!',
      FINDMYANGEL_DEFAULT_COUNTRY_CODE: '55'
    },
    deps: {
      leadStore: { upsertFromClient: async () => ({}) } as any,
      outboundService: { enqueueText: async () => ({ id: 1 }) } as any,
      whatsappLookup: {
        checkWhatsappNumbers: async () => {
          throw new Error('lookup-failed')
        }
      }
    }
  })

  assert.equal(result.chatId, '5543988462272@s.whatsapp.net')
  assert.equal(result.resolution?.chosen, 'with9')
  assert.equal(result.resolution?.reason, 'check_failed')
  assert.equal(result.resolution?.existsWith9, null)
  assert.equal(result.resolution?.existsWithout9, null)
})

test('handleFindmyangelUserCreated throws when both variants are not found', async () => {
  await assert.rejects(
    handleFindmyangelUserCreated({
      payload: {
        userId: 'uid-not-found',
        whatsapp: '(43) 9 8846-2272'
      },
      env: {
        FINDMYANGEL_TARGET_SESSION_ID: 'session-1',
        FINDMYANGEL_TARGET_USER_EMAIL: 'angel@findmyangel.com',
        FINDMYANGEL_WELCOME_TEXT: 'OlÃƒÂ¡ {name}!',
        FINDMYANGEL_DEFAULT_COUNTRY_CODE: '55'
      },
      deps: {
        leadStore: { upsertFromClient: async () => ({}) } as any,
        outboundService: { enqueueText: async () => ({ id: 1 }) } as any,
        whatsappLookup: {
          checkWhatsappNumbers: async (_sessionId: string, phoneNumbers: string[]) => {
            const candidate = phoneNumbers[0]
            return [{ phoneNumber: candidate, exists: false }]
          }
        }
      }
    }),
    /whatsapp_not_found/
  )
})

test('handleFindmyangelUserCreated skips dual lookup when there is a single candidate', async () => {
  let lookupCalled = 0
  const result = await handleFindmyangelUserCreated({
    payload: {
      userId: 'uid-single-candidate',
      whatsapp: '(43) 8846-2272'
    },
    env: {
      FINDMYANGEL_TARGET_SESSION_ID: 'session-1',
      FINDMYANGEL_TARGET_USER_EMAIL: 'angel@findmyangel.com',
      FINDMYANGEL_WELCOME_TEXT: 'OlÃ¡ {name}!',
      FINDMYANGEL_DEFAULT_COUNTRY_CODE: '55'
    },
    deps: {
      leadStore: { upsertFromClient: async () => ({}) } as any,
      outboundService: { enqueueText: async () => ({ id: 1 }) } as any,
      whatsappLookup: {
        checkWhatsappNumbers: async () => {
          lookupCalled += 1
          return [{ phoneNumber: '554388462272', exists: true }]
        }
      }
    }
  })

  assert.equal(lookupCalled, 0)
  assert.equal(result.chatId, '554388462272@s.whatsapp.net')
  assert.equal(result.resolution?.chosen, 'without9')
})

test('handleFindmyangelUserCreated uses default idempotencyKey when header is missing', async () => {
  let capturedOutbound: any = null

  await handleFindmyangelUserCreated({
    payload: {
      userId: 'uid-2',
      whatsapp: '(11) 99999-9999'
    },
    env: {
      FINDMYANGEL_TARGET_SESSION_ID: 'session-1',
      FINDMYANGEL_TARGET_USER_EMAIL: 'angel@findmyangel.com',
      FINDMYANGEL_WELCOME_TEXT: 'Olá {name}!',
      FINDMYANGEL_DEFAULT_COUNTRY_CODE: '55'
    },
    deps: {
      leadStore: { upsertFromClient: async () => ({}) } as any,
      outboundService: {
        enqueueText: async (input: any) => {
          capturedOutbound = input
          return { id: 1 }
        }
      } as any
    }
  })

  assert.equal(capturedOutbound.idempotencyKey, 'findmyangel:user:uid-2:welcome-v1')
})

test('handleFindmyangelTemplateMessage upserts lead and enqueues template message', async () => {
  let capturedLead: any = null
  let capturedOutbound: any = null

  const result = await handleFindmyangelTemplateMessage({
    payload: {
      userId: 'uid-template-1',
      source: 'admin-users-modal',
      whatsapp: '(11) 98888-7777',
      name: 'Joana',
      text: 'Ola Joana!',
      template: {
        id: 'tpl-01',
        name: 'Boas-vindas'
      },
      requestedBy: 'master-uid',
      profileNumber: 1234,
      requestedAtMs: 500
    },
    idempotencyKey: 'request-template-1',
    env: {
      FINDMYANGEL_TARGET_SESSION_ID: 'session-1',
      FINDMYANGEL_TARGET_USER_EMAIL: 'angel@findmyangel.com',
      FINDMYANGEL_WELCOME_TEXT: 'unused',
      FINDMYANGEL_DEFAULT_COUNTRY_CODE: '55'
    },
    deps: {
      leadStore: {
        upsertFromClient: async (input: any) => {
          capturedLead = input
          return {
            id: input.leadId,
            sessionId: input.sessionId
          }
        }
      } as any,
      outboundService: {
        enqueueText: async (input: any) => {
          capturedOutbound = input
          return { id: 777 }
        }
      } as any,
      now: () => 1000
    }
  })

  assert.equal(result.sessionId, 'session-1')
  assert.equal(result.chatId, '5511988887777@s.whatsapp.net')
  assert.equal(result.leadId, result.chatId)
  assert.equal(result.outboundId, 777)

  assert.equal(capturedLead.sessionId, 'session-1')
  assert.equal(capturedLead.whatsapp, '5511988887777')
  assert.equal(capturedLead.chatId, '5511988887777@s.whatsapp.net')
  assert.equal(capturedLead.source, 'findmyangel')
  assert.match(capturedLead.observations, /\[FindmyAngel\]\[Template\]/)
  assert.match(capturedLead.observations, /template=tpl-01/)

  assert.equal(capturedOutbound.sessionId, 'session-1')
  assert.equal(capturedOutbound.chatId, '5511988887777@s.whatsapp.net')
  assert.equal(capturedOutbound.text, 'Ola Joana!')
  assert.equal(capturedOutbound.idempotencyKey, 'request-template-1')
  assert.equal(capturedOutbound.origin, 'automation_api')
})

test('handleFindmyangelTemplateMessage schedules failover for BR dual candidate', async () => {
  let capturedFailoverInput: any = null
  const result = await handleFindmyangelTemplateMessage({
    payload: {
      userId: 'uid-template-failover',
      source: 'admin-users-modal',
      whatsapp: '(43) 9 8846-2272',
      name: 'Joana',
      text: 'Mensagem teste',
      template: {
        id: 'tpl-01',
        name: 'Boas-vindas'
      },
      requestedBy: 'master-uid'
    },
    idempotencyKey: 'request-template-failover',
    env: {
      FINDMYANGEL_TARGET_SESSION_ID: 'session-1',
      FINDMYANGEL_TARGET_USER_EMAIL: 'angel@findmyangel.com',
      FINDMYANGEL_BR_FAILOVER_ENABLED: true,
      FINDMYANGEL_BR_FAILOVER_DELAY_MS: 60000,
      FINDMYANGEL_WELCOME_TEXT: 'unused',
      FINDMYANGEL_DEFAULT_COUNTRY_CODE: '55'
    },
    deps: {
      leadStore: { upsertFromClient: async () => ({}) } as any,
      outboundService: { enqueueText: async () => ({ id: 888 }) } as any,
      failoverJobStore: {
        enqueue: async (input: any) => {
          capturedFailoverInput = input
          return { scheduled: true }
        }
      } as any,
      whatsappLookup: {
        checkWhatsappNumbers: async (_sessionId: string, phoneNumbers: string[]) => {
          return [{ phoneNumber: phoneNumbers[0], exists: true }]
        }
      },
      now: () => 1000
    }
  })

  assert.equal(result.failoverScheduled, true)
  assert.equal(capturedFailoverInput.requestId, 'request-template-failover')
  assert.equal(capturedFailoverInput.flow, 'template-message')
  assert.equal(capturedFailoverInput.userId, 'uid-template-failover')
  assert.equal(capturedFailoverInput.templateId, 'tpl-01')
  assert.equal(capturedFailoverInput.primaryVariant, 'with9')
  assert.equal(capturedFailoverInput.alternateVariant, 'without9')
  assert.equal(capturedFailoverInput.primaryChatId, '5543988462272@s.whatsapp.net')
  assert.equal(capturedFailoverInput.alternateChatId, '554388462272@s.whatsapp.net')
  assert.equal(capturedFailoverInput.primaryOutboundId, 888)
  assert.equal(capturedFailoverInput.runAtMs, 61000)
})

test('route returns 404 when integration is disabled', async () => {
  const app = buildServer(
    {
      LOG_LEVEL: 'fatal',
      ALLOWED_ORIGINS: '*',
      ADMIN_API_KEY: 'admin',
      FINDMYANGEL_INTEGRATION_ENABLED: false,
      FINDMYANGEL_INTEGRATION_SECRET: 'secretsecretsecretsecret',
      FINDMYANGEL_TARGET_SESSION_ID: 'session-1',
      FINDMYANGEL_TARGET_USER_EMAIL: 'angel@findmyangel.com',
      FINDMYANGEL_WELCOME_TEXT: 'Olá {name}!',
      FINDMYANGEL_DEFAULT_COUNTRY_CODE: '55'
    } as any,
    {
      leadStore: { upsertFromClient: async () => ({}) } as any,
      outboundService: { enqueueText: async () => ({ id: 1 }) } as any
    }
  )

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/integrations/findmyangel/user-created',
      payload: { userId: 'u', whatsapp: '(11) 99999-9999' }
    })

    assert.equal(response.statusCode, 404)
  } finally {
    await app.close()
  }
})

test('route returns 401 when bearer token is invalid', async () => {
  const app = buildServer(
    {
      LOG_LEVEL: 'fatal',
      ALLOWED_ORIGINS: '*',
      ADMIN_API_KEY: 'admin',
      FINDMYANGEL_INTEGRATION_ENABLED: true,
      FINDMYANGEL_INTEGRATION_SECRET: 'secretsecretsecretsecret',
      FINDMYANGEL_TARGET_SESSION_ID: 'session-1',
      FINDMYANGEL_TARGET_USER_EMAIL: 'angel@findmyangel.com',
      FINDMYANGEL_WELCOME_TEXT: 'Olá {name}!',
      FINDMYANGEL_DEFAULT_COUNTRY_CODE: '55'
    } as any,
    {
      leadStore: { upsertFromClient: async () => ({}) } as any,
      outboundService: { enqueueText: async () => ({ id: 1 }) } as any
    }
  )

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/integrations/findmyangel/user-created',
      headers: { authorization: 'Bearer wrong' },
      payload: { userId: 'u', whatsapp: '(11) 99999-9999' }
    })

    assert.equal(response.statusCode, 401)
  } finally {
    await app.close()
  }
})

test('route falls back to with9 when no lookup service is provided', async () => {
  const app = buildServer(
    {
      LOG_LEVEL: 'fatal',
      ALLOWED_ORIGINS: '*',
      ADMIN_API_KEY: 'admin',
      FINDMYANGEL_INTEGRATION_ENABLED: true,
      FINDMYANGEL_INTEGRATION_SECRET: 'secretsecretsecretsecret',
      FINDMYANGEL_TARGET_SESSION_ID: 'session-1',
      FINDMYANGEL_TARGET_USER_EMAIL: 'angel@findmyangel.com',
      FINDMYANGEL_BR_STRIP_NINTH_DIGIT: true,
      FINDMYANGEL_WELCOME_TEXT: 'Olá {name}!',
      FINDMYANGEL_DEFAULT_COUNTRY_CODE: '55'
    } as any,
    {
      leadStore: { upsertFromClient: async () => ({}) } as any,
      outboundService: { enqueueText: async () => ({ id: 1 }) } as any
    }
  )

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/integrations/findmyangel/user-created',
      headers: { authorization: 'Bearer secretsecretsecretsecret' },
      payload: { userId: 'u', whatsapp: '(43) 9 8846-2272' }
    })

    assert.equal(response.statusCode, 200)
    const body = response.json() as any
    assert.equal(body.success, true)
    assert.equal(body.chatId, '5543988462272@s.whatsapp.net')
    assert.equal(body.leadId, '5543988462272@s.whatsapp.net')
  } finally {
    await app.close()
  }
})

test('template route uses session lookup and resolves to without9 when only without9 exists', async () => {
  const app = buildServer(
    {
      LOG_LEVEL: 'fatal',
      ALLOWED_ORIGINS: '*',
      ADMIN_API_KEY: 'admin',
      FINDMYANGEL_INTEGRATION_ENABLED: true,
      FINDMYANGEL_INTEGRATION_SECRET: 'secretsecretsecretsecret',
      FINDMYANGEL_TARGET_SESSION_ID: 'session-1',
      FINDMYANGEL_TARGET_USER_EMAIL: 'angel@findmyangel.com',
      FINDMYANGEL_WELCOME_TEXT: 'OlÃƒÂ¡ {name}!',
      FINDMYANGEL_DEFAULT_COUNTRY_CODE: '55'
    } as any,
    {
      leadStore: { upsertFromClient: async () => ({}) } as any,
      outboundService: { enqueueText: async () => ({ id: 123 }) } as any,
      sessionManager: {
        checkWhatsappNumbers: async (_sessionId: string, phoneNumbers: string[]) => {
          const candidate = phoneNumbers[0]
          if (candidate === '5543988462272') {
            return [{ phoneNumber: candidate, exists: false }]
          }
          if (candidate === '554388462272') {
            return [{ phoneNumber: candidate, exists: true }]
          }
          return []
        }
      } as any
    }
  )

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/integrations/findmyangel/template-message',
      headers: {
        authorization: 'Bearer secretsecretsecretsecret',
        'x-idempotency-key': 'request-template-without9'
      },
      payload: {
        userId: 'uid-1',
        source: 'admin-users-modal',
        whatsapp: '(43) 9 8846-2272',
        name: 'Maria',
        text: 'Mensagem de teste',
        template: {
          id: 'tpl-2',
          name: 'Teste'
        }
      }
    })

    assert.equal(response.statusCode, 200)
    const payload = response.json() as any
    assert.equal(payload.success, true)
    assert.equal(payload.chatId, '554388462272@s.whatsapp.net')
    assert.equal(payload.outboundId, 123)
  } finally {
    await app.close()
  }
})

test('template route returns 400 when WhatsApp number does not exist', async () => {
  const app = buildServer(
    {
      LOG_LEVEL: 'fatal',
      ALLOWED_ORIGINS: '*',
      ADMIN_API_KEY: 'admin',
      FINDMYANGEL_INTEGRATION_ENABLED: true,
      FINDMYANGEL_INTEGRATION_SECRET: 'secretsecretsecretsecret',
      FINDMYANGEL_TARGET_SESSION_ID: 'session-1',
      FINDMYANGEL_TARGET_USER_EMAIL: 'angel@findmyangel.com',
      FINDMYANGEL_WELCOME_TEXT: 'OlÃƒÂ¡ {name}!',
      FINDMYANGEL_DEFAULT_COUNTRY_CODE: '55'
    } as any,
    {
      leadStore: { upsertFromClient: async () => ({}) } as any,
      outboundService: { enqueueText: async () => ({ id: 1 }) } as any,
      sessionManager: {
        checkWhatsappNumbers: async (_sessionId: string, phoneNumbers: string[]) => {
          const candidate = phoneNumbers[0]
          return [{ phoneNumber: candidate, exists: false }]
        }
      } as any
    }
  )

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/integrations/findmyangel/template-message',
      headers: {
        authorization: 'Bearer secretsecretsecretsecret',
        'x-idempotency-key': 'request-template-not-found'
      },
      payload: {
        userId: 'uid-1',
        source: 'admin-users-modal',
        whatsapp: '(43) 9 8846-2272',
        name: 'Maria',
        text: 'Mensagem de teste',
        template: {
          id: 'tpl-2',
          name: 'Teste'
        }
      }
    })

    assert.equal(response.statusCode, 400)
    const payload = response.json() as any
    assert.equal(payload.success, false)
    assert.equal(payload.error, 'whatsapp_not_found')
  } finally {
    await app.close()
  }
})

test('template route requires idempotency key', async () => {
  const app = buildServer(
    {
      LOG_LEVEL: 'fatal',
      ALLOWED_ORIGINS: '*',
      ADMIN_API_KEY: 'admin',
      FINDMYANGEL_INTEGRATION_ENABLED: true,
      FINDMYANGEL_INTEGRATION_SECRET: 'secretsecretsecretsecret',
      FINDMYANGEL_TARGET_SESSION_ID: 'session-1',
      FINDMYANGEL_TARGET_USER_EMAIL: 'angel@findmyangel.com',
      FINDMYANGEL_WELCOME_TEXT: 'OlÃ¡ {name}!',
      FINDMYANGEL_DEFAULT_COUNTRY_CODE: '55'
    } as any,
    {
      leadStore: { upsertFromClient: async () => ({}) } as any,
      outboundService: { enqueueText: async () => ({ id: 1 }) } as any
    }
  )

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/integrations/findmyangel/template-message',
      headers: { authorization: 'Bearer secretsecretsecretsecret' },
      payload: {
        userId: 'uid-1',
        whatsapp: '(11) 99999-9999',
        text: 'Teste',
        template: { id: 'tpl-1' },
        idempotencyKey: 'body-only-key'
      }
    })

    assert.equal(response.statusCode, 400)
    assert.equal(response.json().error, 'idempotency_key_required')
  } finally {
    await app.close()
  }
})

test('template route returns 401 when bearer token is invalid', async () => {
  const app = buildServer(
    {
      LOG_LEVEL: 'fatal',
      ALLOWED_ORIGINS: '*',
      ADMIN_API_KEY: 'admin',
      FINDMYANGEL_INTEGRATION_ENABLED: true,
      FINDMYANGEL_INTEGRATION_SECRET: 'secretsecretsecretsecret',
      FINDMYANGEL_TARGET_SESSION_ID: 'session-1',
      FINDMYANGEL_TARGET_USER_EMAIL: 'angel@findmyangel.com',
      FINDMYANGEL_WELCOME_TEXT: 'OlÃ¡ {name}!',
      FINDMYANGEL_DEFAULT_COUNTRY_CODE: '55'
    } as any,
    {
      leadStore: { upsertFromClient: async () => ({}) } as any,
      outboundService: { enqueueText: async () => ({ id: 1 }) } as any
    }
  )

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/integrations/findmyangel/template-message',
      headers: { authorization: 'Bearer wrong' },
      payload: {
        userId: 'uid-1',
        whatsapp: '(11) 99999-9999',
        text: 'Teste',
        template: { id: 'tpl-1' }
      }
    })

    assert.equal(response.statusCode, 401)
    assert.equal(response.json().error, 'unauthorized')
  } finally {
    await app.close()
  }
})

test('template route sends message and returns outbound id', async () => {
  const app = buildServer(
    {
      LOG_LEVEL: 'fatal',
      ALLOWED_ORIGINS: '*',
      ADMIN_API_KEY: 'admin',
      FINDMYANGEL_INTEGRATION_ENABLED: true,
      FINDMYANGEL_INTEGRATION_SECRET: 'secretsecretsecretsecret',
      FINDMYANGEL_TARGET_SESSION_ID: 'session-1',
      FINDMYANGEL_TARGET_USER_EMAIL: 'angel@findmyangel.com',
      FINDMYANGEL_WELCOME_TEXT: 'OlÃ¡ {name}!',
      FINDMYANGEL_DEFAULT_COUNTRY_CODE: '55'
    } as any,
    {
      leadStore: { upsertFromClient: async () => ({}) } as any,
      outboundService: {
        enqueueText: async () => ({ id: 987, sessionId: 'session-1', chatId: '5511999999999@s.whatsapp.net' })
      } as any
    }
  )

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/integrations/findmyangel/template-message',
      headers: {
        authorization: 'Bearer secretsecretsecretsecret',
        'x-idempotency-key': 'request-template-2'
      },
      payload: {
        userId: 'uid-1',
        source: 'admin-users-modal',
        whatsapp: '(11) 99999-9999',
        name: 'Maria',
        text: 'Mensagem de teste',
        template: {
          id: 'tpl-2',
          name: 'Teste'
        },
        requestedBy: 'master-uid',
        profileNumber: 321
      }
    })

    assert.equal(response.statusCode, 200)
    const payload = response.json() as any
    assert.equal(payload.success, true)
    assert.equal(payload.outboundId, 987)
    assert.equal(payload.sessionId, 'session-1')
    assert.equal(payload.chatId, '5511999999999@s.whatsapp.net')
  } finally {
    await app.close()
  }
})
