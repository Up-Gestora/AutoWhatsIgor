'use server'

import { resolveBackendUrl, getBackendAdminKey } from '@/lib/adminBackend'

const DEFAULT_SENDER_SESSION_ID = 'C06o8269r8gEkfClOTzpEuLfumE3'
const DEFAULT_COUNTRY_CODE = '55'

type RequestSignupHelpInput = {
  name?: string
  whatsapp: string
  stage?: string
}

type RequestSignupHelpResult = {
  success: boolean
  error?: string
}

function normalizeWhatsapp(raw: string): string | null {
  const digits = (raw ?? '').replace(/\D/g, '')
  if (!digits) {
    return null
  }

  if (digits.length === 10 || digits.length === 11) {
    return `${DEFAULT_COUNTRY_CODE}${digits}`
  }
  if (digits.startsWith(DEFAULT_COUNTRY_CODE) && (digits.length === 12 || digits.length === 13)) {
    return digits
  }
  return null
}

function stripBrazilNinthDigitIfPresent(e164Digits: string): string {
  if (e164Digits.startsWith('55') && e164Digits.length === 13 && e164Digits[4] === '9') {
    return `${e164Digits.slice(0, 4)}${e164Digits.slice(5)}`
  }
  return e164Digits
}

function buildHelpMessage(input: { name: string; stage: string }): string {
  return [
    `Oi ${input.name}! Aqui é da equipe AutoWhats.`,
    '',
    `Vi que você está na etapa de ${input.stage} da criação da conta.`,
    'Se travar em qualquer ponto, me responda aqui com sua dúvida que eu te ajudo a concluir rapidinho.',
    '',
    'Se preferir, eu também posso te orientar passo a passo para conectar o WhatsApp e ativar a IA.'
  ].join('\n')
}

export async function requestSignupHelp(input: RequestSignupHelpInput): Promise<RequestSignupHelpResult> {
  const backendUrl = resolveBackendUrl()
  const adminKey = getBackendAdminKey()
  if (!backendUrl || !adminKey) {
    return { success: false, error: 'backend_config_missing' }
  }

  const senderSessionId =
    process.env.SIGNUP_HELP_SENDER_SESSION_ID?.trim() ||
    process.env.ONBOARDING_NURTURE_SENDER_SESSION_ID?.trim() ||
    DEFAULT_SENDER_SESSION_ID
  if (!senderSessionId) {
    return { success: false, error: 'sender_session_missing' }
  }

  const normalized = normalizeWhatsapp(input.whatsapp)
  if (!normalized) {
    return { success: false, error: 'whatsapp_invalid' }
  }
  const destinationDigits = stripBrazilNinthDigitIfPresent(normalized)
  const chatId = `${destinationDigits}@s.whatsapp.net`
  const stage = typeof input.stage === 'string' && input.stage.trim() ? input.stage.trim() : 'cadastro'
  const safeName = typeof input.name === 'string' && input.name.trim() ? input.name.trim().split(/\s+/)[0] : 'Cliente'
  const text = buildHelpMessage({ name: safeName, stage })
  const idempotencyKey = `signup_help:${destinationDigits}:${Math.floor(Date.now() / (5 * 60 * 1000))}`

  try {
    const response = await fetch(`${backendUrl}/messages/send`, {
      method: 'POST',
      headers: {
        'x-admin-key': adminKey,
        'content-type': 'application/json',
        'x-idempotency-key': idempotencyKey
      },
      body: JSON.stringify({
        sessionId: senderSessionId,
        chatId,
        text,
        origin: 'automation_api',
        idempotencyKey
      }),
      cache: 'no-store'
    })

    if (!response.ok) {
      return { success: false, error: 'whatsapp_send_failed' }
    }
    return { success: true }
  } catch {
    return { success: false, error: 'whatsapp_send_failed' }
  }
}
