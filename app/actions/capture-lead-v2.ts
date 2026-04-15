'use server'

import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { resolveBackendUrl, getBackendAdminKey } from '@/lib/adminBackend'
import { SITE_URL } from '@/lib/site-url'

const SENDER_SESSION_ID = 'C06o8269r8gEkfClOTzpEuLfumE3'

type CaptureLeadV2Input = {
  name: string
  whatsapp: string
  pagePath?: string
  referrer?: string
  utm?: {
    source?: string
    medium?: string
    campaign?: string
    content?: string
    term?: string
  }
  honey?: string
}

type CaptureLeadV2Result = { success: true } | { success: false; error: string }

function normalizeBrazilWhatsapp(raw: string): string | null {
  const digits = (raw ?? '').replace(/\D/g, '')
  if (!digits) return null

  // Assume Brazil:
  // - 10/11 digits (DDD + number) => prefix 55
  // - 55 + 10/11 digits => already normalized
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`
  }

  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return digits
  }

  return null
}

function stripBrazilNinthDigitIfPresent(e164Digits: string): string {
  // Some Brazilian numbers may be stored without the 9th digit.
  // When present: 55 + DDD(2) + 9 + XXXXXXXX(8) => strip the 9 after DDD.
  if (e164Digits.startsWith('55') && e164Digits.length === 13 && e164Digits[4] === '9') {
    return `${e164Digits.slice(0, 4)}${e164Digits.slice(5)}`
  }
  return e164Digits
}

function resolveSignupUrl(pagePath?: string) {
  return pagePath?.startsWith('/en') ? `${SITE_URL}/en/signup` : `${SITE_URL}/pt/cadastro`
}

function buildWelcomeMessage(firstName: string, pagePath?: string) {
  const safeName = (firstName ?? '').trim() || 'tudo bem'
  const signupUrl = resolveSignupUrl(pagePath)

  return [
    `Oi ${safeName}! Aqui é do AutoWhats.`,
    '',
    'Vi que você pediu infos pela nossa landing.',
    '',
    'O AutoWhats automatiza seu atendimento no WhatsApp com IA treinada com suas regras e base de conhecimento (FAQ, preços, horários, etc). Em poucos minutos você:',
    '1) cria sua conta',
    '2) conecta o WhatsApp via QR Code',
    '3) ativa a IA e define quando ela chama um humano',
    '',
    `Crie sua conta grátis aqui: ${signupUrl}`,
    '',
    'Se você me disser seu nicho e o que você quer automatizar, eu te ajudo com a configuração inicial.'
  ].join('\n')
}

function cleanOptional(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

export async function captureLeadV2(input: CaptureLeadV2Input): Promise<CaptureLeadV2Result> {
  const honey = cleanOptional(input?.honey)
  if (honey) {
    // Honeypot triggered: pretend success to avoid giving bots feedback.
    return { success: true }
  }

  if (!db) {
    console.error('[captureLeadV2] Firebase db not initialized')
    return { success: false, error: 'firebase_unavailable' }
  }

  const name = (input?.name ?? '').trim()
  if (name.length < 2 || name.length > 80) {
    return { success: false, error: 'name_invalid' }
  }

  const whatsappDigits = normalizeBrazilWhatsapp((input?.whatsapp ?? '').trim())
  if (!whatsappDigits) {
    return { success: false, error: 'whatsapp_invalid' }
  }

  const sendWhatsappDigits = stripBrazilNinthDigitIfPresent(whatsappDigits)

  const chatId = `${sendWhatsappDigits}@s.whatsapp.net`
  const idempotencyKey = `landing_v2_welcome:${sendWhatsappDigits}`

  const pagePath = cleanOptional(input?.pagePath)
  const referrer = cleanOptional(input?.referrer)
  const utmRaw = input?.utm ?? {}
  const utm: Record<string, string> = {}
  const utmSource = cleanOptional(utmRaw.source)
  const utmMedium = cleanOptional(utmRaw.medium)
  const utmCampaign = cleanOptional(utmRaw.campaign)
  const utmContent = cleanOptional(utmRaw.content)
  const utmTerm = cleanOptional(utmRaw.term)
  if (utmSource) utm.source = utmSource
  if (utmMedium) utm.medium = utmMedium
  if (utmCampaign) utm.campaign = utmCampaign
  if (utmContent) utm.content = utmContent
  if (utmTerm) utm.term = utmTerm
  const hasUtm = Object.keys(utm).length > 0

  // 1) Persist lead first (even if WhatsApp send fails).
  try {
    await addDoc(collection(db, 'leads'), {
      name,
      email: '',
      whatsapp: whatsappDigits,
      source: 'landing_v2',
      createdAt: serverTimestamp(),
      ...(pagePath ? { pagePath } : {}),
      ...(referrer ? { referrer } : {}),
      ...(hasUtm ? { utm } : {})
    })
  } catch (error) {
    console.error('[captureLeadV2] Failed to save lead:', (error as Error).message)
    return { success: false, error: 'lead_save_failed' }
  }

  // 2) Send initial WhatsApp message via Backend B admin endpoint.
  const backendUrl = resolveBackendUrl()
  const adminKey = getBackendAdminKey()
  if (!backendUrl || !adminKey) {
    console.error('[captureLeadV2] Backend config missing', {
      hasBackendUrl: Boolean(backendUrl),
      hasAdminKey: Boolean(adminKey)
    })
    return { success: false, error: 'whatsapp_send_failed' }
  }

  const firstName = name.split(/\s+/)[0] ?? name
  const text = buildWelcomeMessage(firstName, pagePath)

  try {
    const response = await fetch(`${backendUrl}/messages/send`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-admin-key': adminKey,
        'x-idempotency-key': idempotencyKey
      },
      body: JSON.stringify({
        sessionId: SENDER_SESSION_ID,
        chatId,
        origin: 'automation_api',
        text,
        idempotencyKey
      }),
      cache: 'no-store'
    })

    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      console.error('[captureLeadV2] Backend send failed', {
        status: response.status,
        payload
      })
      return { success: false, error: 'whatsapp_send_failed' }
    }
  } catch (error) {
    console.error('[captureLeadV2] Backend send threw', (error as Error).message)
    return { success: false, error: 'whatsapp_send_failed' }
  }

  return { success: true }
}
