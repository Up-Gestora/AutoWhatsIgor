// Generates tutorial screenshots from SITE_URL (defaults to production),
// anonymizes/masks sensitive areas, highlights key UI, and exports WebP assets to
// public/tutorials/.
//
// Usage (PowerShell):
//   $env:SITE_URL="https://auto-whats.vercel.app/"
//   $env:USE_EXISTING_ACCOUNT="1"
//   $env:TUTORIAL_EMAIL="tutorial+assets@exemplo.com"
//   $env:TUTORIAL_PASSWORD="SUA_SENHA"
//   $env:HEADLESS="1"
//   npm run generate:tutorial-assets

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import sharp from 'sharp'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const SITE_URL = (process.env.SITE_URL || 'https://auto-whats.vercel.app/').replace(/\/?$/, '/')

const USE_EXISTING = process.env.USE_EXISTING_ACCOUNT === '1'
const TUTORIAL_EMAIL = process.env.TUTORIAL_EMAIL || ''
const TUTORIAL_PASSWORD = process.env.TUTORIAL_PASSWORD || ''

const WAIT_FOR_SCAN = process.env.WAIT_FOR_SCAN === '1'
const HEADLESS =
  process.env.HEADLESS === '1' ? true : process.env.HEADED === '1' ? false : !WAIT_FOR_SCAN

const DEVICE_SCALE_FACTOR = 2
const VIEWPORT = { width: 1440, height: 900 }
const CROP = { width: 1280, height: 720 } // 16:9
const WEBP = { width: 1280, height: 720, quality: 82 }
const SAFE_TOP_PX = 80 // avoid capturing the dashboard topbar (shows user name)

const AUTH_DIR = path.resolve(__dirname, '.auth')
const AUTH_STATE_PATH = path.join(AUTH_DIR, 'tutorial-storage.json')

const RAW_DIR = path.resolve(__dirname, '..', 'docs', 'tutorial-assets', 'raw')
const OUT_DIR = path.resolve(__dirname, '..', 'public', 'tutorials')
const MANIFEST_PATH = path.join(OUT_DIR, 'tutorials.manifest.json')

function nowIso() {
  return new Date().toISOString()
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true })
}

async function fileExists(p) {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function bestEffortWait(page) {
  // Avoid hanging on long-lived connections (e.g. websockets).
  await page.waitForLoadState('domcontentloaded', { timeout: 20_000 }).catch(() => {})
  await page.waitForLoadState('networkidle', { timeout: 7_500 }).catch(() => {})
  await page.waitForTimeout(400)
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n))
}

function toNormRect(childBox, parentBox) {
  const x = (childBox.x - parentBox.x) / parentBox.width
  const y = (childBox.y - parentBox.y) / parentBox.height
  const w = childBox.width / parentBox.width
  const h = childBox.height / parentBox.height
  return {
    x: clamp(x, 0, 1),
    y: clamp(y, 0, 1),
    w: clamp(w, 0, 1),
    h: clamp(h, 0, 1)
  }
}

function unionBoxes(a, b) {
  const x1 = Math.min(a.x, b.x)
  const y1 = Math.min(a.y, b.y)
  const x2 = Math.max(a.x + a.width, b.x + b.width)
  const y2 = Math.max(a.y + a.height, b.y + b.height)
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
}

async function getBox(locator) {
  await locator.scrollIntoViewIfNeeded().catch(() => {})
  const box = await locator.boundingBox()
  if (!box) throw new Error('Could not resolve bounding box for locator')
  return box
}

async function getScroll(page) {
  return page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))
}

function makeCropBox(targetBox, { scroll, viewport }) {
  const cropW = Math.min(CROP.width, viewport.width)
  const cropH = Math.min(CROP.height, viewport.height)
  const centerX = targetBox.x + targetBox.width / 2
  const centerY = targetBox.y + targetBox.height / 2

  const minX = scroll.x
  const maxX = scroll.x + viewport.width - cropW
  const maxOffsetY = Math.max(0, viewport.height - cropH)
  const safeTop = Math.min(SAFE_TOP_PX, maxOffsetY)
  const minY = scroll.y + safeTop
  const maxY = scroll.y + viewport.height - cropH

  const x = clamp(centerX - cropW / 2, minX, maxX)
  const y = clamp(centerY - cropH / 2, minY, maxY)
  return { x, y, width: cropW, height: cropH }
}

async function screenshotClip(page, outPath, clipBox, { mask = [] } = {}) {
  await page.screenshot({
    path: outPath,
    clip: {
      x: Math.max(0, clipBox.x),
      y: Math.max(0, clipBox.y),
      width: Math.max(1, clipBox.width),
      height: Math.max(1, clipBox.height)
    },
    mask,
    maskColor: '#0b0f14'
  })
}

function json(body) {
  return JSON.stringify(body)
}

function randomId(prefix) {
  return `${prefix}_${Math.random().toString(16).slice(2)}`
}

function buildFixtures() {
  const now = Date.now()
  const leads = [
    {
      id: 'lead_demo_01',
      name: 'Carla Demo',
      whatsapp: '(11) 99999-1111',
      chatId: 'chat_demo_01',
      status: 'novo',
      lastContact: now - 2 * 60 * 60 * 1000,
      nextContact: now + 24 * 60 * 60 * 1000,
      observations: 'Pediu valores. Enviar tabela.',
      createdAt: now - 7 * 24 * 60 * 60 * 1000,
      lastMessage: 'Qual o valor do plano?',
      source: 'whatsapp'
    },
    {
      id: 'lead_demo_02',
      name: 'Joao Demo',
      whatsapp: '(11) 99999-2222',
      chatId: 'chat_demo_02',
      status: 'em_processo',
      lastContact: now - 12 * 60 * 1000,
      nextContact: now + 2 * 60 * 60 * 1000,
      observations: 'Agendar avaliacao.',
      createdAt: now - 3 * 24 * 60 * 60 * 1000,
      lastMessage: 'Pode ser amanha 14h?',
      source: 'whatsapp'
    },
    {
      id: 'lead_demo_03',
      name: 'Mariana Demo',
      whatsapp: '(11) 99999-3333',
      chatId: 'chat_demo_03',
      status: 'inativo',
      lastContact: now - 2 * 24 * 60 * 60 * 1000,
      nextContact: null,
      observations: 'Atendimento concluido.',
      createdAt: now - 10 * 24 * 60 * 60 * 1000,
      lastMessage: 'Obrigado!',
      source: 'whatsapp'
    }
  ]

  const clients = [
    {
      id: 'client_demo_01',
      name: 'Cliente VIP Demo',
      whatsapp: '(11) 98888-0001',
      chatId: 'chat_demo_01',
      status: 'vip',
      lastContactAt: now - 8 * 60 * 60 * 1000,
      nextContactAt: now + 7 * 24 * 60 * 60 * 1000,
      observations: 'Preferencia por atendimento rapido.',
      createdAt: now - 120 * 24 * 60 * 60 * 1000,
      lastMessage: 'Fechado, pode agendar.',
      source: 'whatsapp',
      totalValue: 2490,
      lastPurchaseAt: now - 15 * 24 * 60 * 60 * 1000
    },
    {
      id: 'client_demo_02',
      name: 'Cliente Ativo Demo',
      whatsapp: '(11) 98888-0002',
      chatId: 'chat_demo_02',
      status: 'ativo',
      lastContactAt: now - 3 * 24 * 60 * 60 * 1000,
      nextContactAt: now + 30 * 24 * 60 * 60 * 1000,
      observations: 'Renovacao no mes que vem.',
      createdAt: now - 60 * 24 * 60 * 60 * 1000,
      lastMessage: 'Pode mandar o contrato.',
      source: 'whatsapp',
      totalValue: 990,
      lastPurchaseAt: now - 2 * 24 * 60 * 60 * 1000
    }
  ]

  const suggestions = [
    {
      id: 101,
      sessionId: 'session_demo',
      chatId: 'chat_demo_01',
      targetType: 'lead',
      targetId: 'lead_demo_01',
      inboundId: null,
      provider: 'openai',
      model: 'gpt-5.2',
      status: 'pending',
      base: {
        name: 'Carla Demo',
        whatsapp: '(11) 99999-1111',
        status: 'novo',
        observations: 'Pediu valores.',
        nextContactAt: now + 24 * 60 * 60 * 1000,
        updatedAt: now - 60 * 60 * 1000
      },
      patch: {
        status: 'em_processo',
        observations: 'Enviar tabela de valores e confirmar interesse.',
        nextContactAt: now + 2 * 60 * 60 * 1000
      },
      reason: 'Lead pediu valores e demonstrou interesse.',
      appliedPatch: null,
      createdAt: now - 2 * 60 * 60 * 1000,
      updatedAt: now - 45 * 60 * 1000,
      decidedAt: null,
      appliedAt: null
    },
    {
      id: 202,
      sessionId: 'session_demo',
      chatId: 'chat_demo_02',
      targetType: 'client',
      targetId: 'client_demo_02',
      inboundId: null,
      provider: 'google',
      model: 'gemini-3-flash-preview',
      status: 'pending',
      base: {
        name: 'Cliente Ativo Demo',
        whatsapp: '(11) 98888-0002',
        status: 'ativo',
        observations: 'Renovacao no mes que vem.',
        nextContactAt: now + 30 * 24 * 60 * 60 * 1000,
        updatedAt: now - 2 * 60 * 60 * 1000
      },
      patch: {
        observations: 'Sugerir pacote Pro e oferecer desconto anual.',
        nextContactAt: now + 10 * 24 * 60 * 60 * 1000
      },
      reason: 'Cliente com potencial de upsell.',
      appliedPatch: null,
      createdAt: now - 4 * 60 * 60 * 1000,
      updatedAt: now - 30 * 60 * 1000,
      decidedAt: null,
      appliedAt: null
    }
  ]

  const chats = [
    {
      id: 'chat_demo_01',
      name: 'Carla Demo',
      isGroup: false,
      unreadCount: 2,
      lastMessage: {
        id: 'm_01',
        text: 'Qual o valor do plano?',
        type: 'conversation',
        timestampMs: now - 2 * 60 * 60 * 1000,
        fromMe: false
      },
      lastActivityMs: now - 2 * 60 * 60 * 1000
    },
    {
      id: 'chat_demo_02',
      name: 'Grupo Demo (Suporte)',
      isGroup: true,
      unreadCount: 0,
      lastMessage: {
        id: 'm_02',
        text: 'Pode ser amanha 14h?',
        type: 'conversation',
        timestampMs: now - 12 * 60 * 1000,
        fromMe: false
      },
      lastActivityMs: now - 12 * 60 * 1000
    }
  ]

  const messagesByChat = {
    chat_demo_01: [
      {
        id: 'm_demo_01',
        type: 'conversation',
        text: 'Oi! Gostaria de saber o valor do plano.',
        timestampMs: now - 2 * 60 * 60 * 1000,
        chatId: 'chat_demo_01',
        fromMe: false
      },
      {
        id: 'm_demo_02',
        type: 'conversation',
        text: 'Claro! Posso te explicar os planos e o que estÃ¡ incluso.',
        timestampMs: now - (2 * 60 * 60 * 1000 - 60 * 1000),
        chatId: 'chat_demo_01',
        fromMe: true
      }
    ],
    chat_demo_02: [
      {
        id: 'm_demo_03',
        type: 'conversation',
        text: 'Pode ser amanhÃ£ 14h?',
        timestampMs: now - 12 * 60 * 1000,
        chatId: 'chat_demo_02',
        fromMe: false
      }
    ]
  }

  const configs = [
    { chatId: 'chat_demo_01', aiEnabled: true, updatedAt: now - 60_000 },
    { chatId: 'chat_demo_02', aiEnabled: false, disabledReason: null, updatedAt: now - 60_000 }
  ]

  const billing = {
    stripeConfigured: true,
    billing: {
      customer: { stripeCustomerId: 'cus_demo', email: 'tutorial@exemplo.com', updatedAt: now },
      subscription: {
        stripeSubscriptionId: 'sub_demo',
        status: 'active',
        priceId: 'price_demo',
        currentPeriodEnd: now + 14 * 24 * 60 * 60 * 1000,
        cancelAtPeriodEnd: false,
        updatedAt: now
      },
      paymentMethod: {
        stripePaymentMethodId: 'pm_demo',
        brand: 'Visa',
        last4: '4242',
        expMonth: 12,
        expYear: 2030,
        updatedAt: now
      }
    },
    credits: {
      balanceBrl: 50,
      blockedAt: null,
      blockedReason: null,
      updatedAt: now
    }
  }

  return { leads, clients, suggestions, chats, messagesByChat, configs, billing }
}

function buildOverlaySvg({ width, height, highlight, extra }) {
  const dimOpacity = 0.25

  const hx = highlight ? Math.round(highlight.x * width) : 0
  const hy = highlight ? Math.round(highlight.y * height) : 0
  const hw = highlight ? Math.round(highlight.w * width) : 0
  const hh = highlight ? Math.round(highlight.h * height) : 0

  const stroke = Math.max(6, Math.round(Math.min(width, height) * 0.006))
  const radius = Math.max(14, Math.round(Math.min(width, height) * 0.03))
  const glow = Math.max(8, Math.round(Math.min(width, height) * 0.02))

  const hasHighlight = Boolean(highlight && hw > 0 && hh > 0)

  const extraSvg = extra ? extra : ''

  // SVG mask: cut highlight area out of the dim overlay (so the highlighted region stays crisp).
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="${Math.round(glow / 2)}" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <mask id="cut">
      <rect width="100%" height="100%" fill="white"/>
      ${hasHighlight ? `<rect x="${hx}" y="${hy}" width="${hw}" height="${hh}" rx="${radius}" fill="black"/>` : ''}
    </mask>
  </defs>

  <rect width="100%" height="100%" fill="rgba(0,0,0,${dimOpacity})" mask="url(#cut)"/>
  ${
    hasHighlight
      ? `<rect x="${hx}" y="${hy}" width="${hw}" height="${hh}" rx="${radius}"
          fill="none" stroke="#25D366" stroke-width="${stroke}" filter="url(#glow)"/>`
      : ''
  }
  ${extraSvg}
</svg>`
}

function buildQrPlaceholderSvg({ width, height, qrRect }) {
  if (!qrRect) return null
  const qx = Math.round(qrRect.x * width)
  const qy = Math.round(qrRect.y * height)
  const qw = Math.round(qrRect.w * width)
  const qh = Math.round(qrRect.h * height)
  if (qw < 40 || qh < 40) return null

  const pad = Math.round(Math.min(qw, qh) * 0.08)
  const innerX = qx + pad
  const innerY = qy + pad
  const innerW = Math.max(1, qw - pad * 2)
  const innerH = Math.max(1, qh - pad * 2)
  const radius = Math.round(Math.min(qw, qh) * 0.08)

  // A fake (non-scannable) "QR-like" pattern using a checkerboard. This is only visual.
  return `
  <defs>
    <pattern id="qrPattern" width="18" height="18" patternUnits="userSpaceOnUse">
      <rect width="18" height="18" fill="#ffffff"/>
      <rect x="0" y="0" width="9" height="9" fill="#0b0f14"/>
      <rect x="9" y="9" width="9" height="9" fill="#0b0f14"/>
      <rect x="9" y="0" width="9" height="3" fill="#25D366" opacity="0.6"/>
      <rect x="0" y="9" width="3" height="9" fill="#25D366" opacity="0.6"/>
    </pattern>
  </defs>
  <g>
    <rect x="${qx}" y="${qy}" width="${qw}" height="${qh}" rx="${radius}" fill="#0b0f14" opacity="0.92"/>
    <rect x="${innerX}" y="${innerY}" width="${innerW}" height="${innerH}" rx="${Math.max(
    8,
    Math.round(radius * 0.6)
  )}" fill="url(#qrPattern)"/>
    <rect x="${qx}" y="${qy}" width="${qw}" height="${qh}" rx="${radius}" fill="none" stroke="#25D366" stroke-width="${Math.max(
    6,
    Math.round(Math.min(qw, qh) * 0.04)
  )}" opacity="0.85"/>
    <text x="${qx + qw / 2}" y="${qy + qh + Math.round(Math.min(44, qh * 0.18))}"
      text-anchor="middle" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial"
      font-size="${Math.max(24, Math.round(Math.min(qw, qh) * 0.16))}"
      fill="#e8eefc" opacity="0.9">QR (DEMO)</text>
  </g>
`
}

async function processImage({ rawPath, outPath, highlight, qrRect }) {
  // Build overlays directly at final size. Raw captures are already 16:9, so this
  // is just a scale-down and keeps normalized highlight/QR rects accurate.
  const width = WEBP.width
  const height = WEBP.height

  const qrExtra = buildQrPlaceholderSvg({ width, height, qrRect })
  const overlaySvg = buildOverlaySvg({ width, height, highlight, extra: qrExtra })

  const overlayPng = await sharp(Buffer.from(overlaySvg), { density: 144 })
    .resize(width, height, { fit: 'fill' })
    .png()
    .toBuffer()

  await sharp(rawPath)
    .resize(width, height, { fit: 'cover' })
    .composite([{ input: overlayPng }])
    .webp({ quality: WEBP.quality })
    .toFile(outPath)
}

async function installNetworkGuards(context, fixtures) {
  // Avoid polluting analytics/ads pixels while automating production.
  const abort = async (pattern) => {
    await context.route(pattern, (route) => route.abort()).catch(() => {})
  }

  await abort('**/connect.facebook.net/**')
  await abort('**/www.googletagmanager.com/**')
  await abort('**/www.google-analytics.com/**')
  await abort('**/stats.g.doubleclick.net/**')

  await context.route('**/api/**', async (route) => {
    const req = route.request()
    const method = req.method().toUpperCase()
    const url = new URL(req.url())
    const pathname = url.pathname

    const fulfill = (body, { status = 200 } = {}) => {
      return route.fulfill({
        status,
        contentType: 'application/json',
        body: json(body)
      })
    }

    // Keep the UI real (production) but the content deterministic and PII-free.
    if (pathname === '/api/billing/plan') {
      return fulfill({ plan: 'pro' })
    }

    if (pathname === '/api/billing/overview') {
      const payload = fixtures.billing
      return fulfill({
        stripeConfigured: Boolean(payload.stripeConfigured),
        billing: payload.billing ?? null,
        credits: payload.credits ?? null
      })
    }

    if (pathname === '/api/dashboard/summary') {
      const now = Date.now()
      return fulfill({
        success: true,
        stats: {
          totalLeads: fixtures.leads.length,
          totalClients: fixtures.clients.length,
          aiMessages: 48,
          inboundMessages: 120,
          responseRate: 0.92,
          fromMs: now - 7 * 24 * 60 * 60 * 1000,
          toMs: now
        },
        recentLeads: fixtures.leads.slice(0, 3).map((lead) => ({
          id: lead.id,
          name: lead.name ?? null,
          whatsapp: lead.whatsapp ?? null,
          status: lead.status,
          lastContact: lead.lastContact ?? null,
          createdAt: lead.createdAt ?? null,
          lastMessage: lead.lastMessage ?? null
        })),
        conversions: {
          fromMs: now - 7 * 24 * 60 * 60 * 1000,
          toMs: now,
          leadsCreated: 18,
          convertedLeads: 4,
          aiAssistedConvertedLeads: 2,
          conversionRate: 4 / 18,
          aiAssistedRate: 2 / 4
        }
      })
    }

    if (pathname === '/api/financeiro/summary') {
      return fulfill({
        success: true,
        summary: {
          credits: fixtures.billing.credits ?? null,
          responses: { count: 132 },
          averages: { costPerResponseBrl: 0.29, tokensPerResponse: 870 }
        }
      })
    }

    if (pathname === '/api/leads') {
      return fulfill({ leads: fixtures.leads })
    }
    if (pathname.startsWith('/api/leads/')) {
      // Best-effort "success" for any lead mutation in case UI triggers something.
      return fulfill({ success: true })
    }

    if (pathname === '/api/clients') {
      return fulfill({ clients: fixtures.clients })
    }
    if (pathname.startsWith('/api/clients/')) {
      return fulfill({ success: true })
    }

    if (pathname === '/api/ai-suggestions') {
      const targetType = url.searchParams.get('targetType')
      const rows =
        targetType === 'lead'
          ? fixtures.suggestions.filter((s) => s.targetType === 'lead')
          : targetType === 'client'
            ? fixtures.suggestions.filter((s) => s.targetType === 'client')
            : fixtures.suggestions

      return fulfill({ suggestions: rows })
    }
    if (pathname.startsWith('/api/ai-suggestions/')) {
      // accept/reject endpoints
      return fulfill({ success: true })
    }

    if (pathname === '/api/ai-config') {
      // Prevent writes to backend-b during captures (training/conversations saves call this).
      return fulfill({ success: true })
    }

    if (pathname === '/api/conversations/chats') {
      return fulfill({ chats: fixtures.chats })
    }

    if (pathname === '/api/conversations/chats/ai-configs') {
      return fulfill({ configs: fixtures.configs })
    }

    if (pathname.startsWith('/api/conversations/chats/ai-configs/')) {
      return fulfill({ totalChats: fixtures.chats.length, updated: fixtures.chats.length })
    }

    // /api/conversations/chats/:id/messages
    if (pathname.startsWith('/api/conversations/chats/') && pathname.endsWith('/messages')) {
      const parts = pathname.split('/')
      const chatId = decodeURIComponent(parts[4] || '')
      const messages = fixtures.messagesByChat?.[chatId] ?? []
      return fulfill({ messages })
    }

    // /api/conversations/chats/:id/read
    if (pathname.startsWith('/api/conversations/chats/') && pathname.endsWith('/read')) {
      return fulfill({ success: true })
    }

    // /api/conversations/chats/:id/ai-config
    if (pathname.startsWith('/api/conversations/chats/') && pathname.endsWith('/ai-config')) {
      let aiEnabled = true
      try {
        const raw = req.postData() || ''
        const parsed = raw ? JSON.parse(raw) : {}
        if (typeof parsed.aiEnabled === 'boolean') aiEnabled = parsed.aiEnabled
      } catch {
        // ignore
      }
      const parts = pathname.split('/')
      const chatId = decodeURIComponent(parts[4] || '')
      return fulfill({ config: { chatId, aiEnabled, updatedAt: Date.now() } })
    }

    if (pathname === '/api/conversations/messages/send') {
      return fulfill({ success: true, messageId: randomId('msg') })
    }

    // Not intercepted.
    return route.continue()
  })
}

async function maybeHandleWhatsappModal(page) {
  const modalWhatsapp = page.locator('#modal-whatsapp')
  if ((await modalWhatsapp.count()) === 0) return false
  if (!(await modalWhatsapp.isVisible().catch(() => false))) return false

  const example = process.env.TUTORIAL_WHATSAPP || '(11) 99999-9999'
  await modalWhatsapp.fill(example)
  const submit = page.getByRole('button', { name: /salvar e acessar dashboard/i }).first()
  await submit.click()
  await page.waitForTimeout(500)
  return true
}

async function ensureLoggedIn(page, context) {
  if (!USE_EXISTING) {
    throw new Error(
      'This generator only supports USE_EXISTING_ACCOUNT=1 (production capture). Set USE_EXISTING_ACCOUNT=1 and provide TUTORIAL_EMAIL/TUTORIAL_PASSWORD.'
    )
  }

  if (!TUTORIAL_EMAIL || !TUTORIAL_PASSWORD) {
    throw new Error('Missing TUTORIAL_EMAIL or TUTORIAL_PASSWORD.')
  }

  // Try with current storageState (if any), otherwise login.
  await page.goto(`${SITE_URL}dashboard/tutoriais`, { waitUntil: 'domcontentloaded' })
  await bestEffortWait(page)

  const sidebar = page.locator('aside').first()
  const emailInput = page.locator('#email')

  const isSidebarVisible = await sidebar.isVisible().catch(() => false)
  const isLoginVisible = await emailInput.isVisible().catch(() => false)

  if (!isSidebarVisible && !isLoginVisible) {
    // Give the app a chance to redirect client-side.
    await page.waitForTimeout(1500)
  }

  const sidebarVisible2 = await sidebar.isVisible().catch(() => false)
  if (sidebarVisible2) {
    return { reused: true }
  }

  // Login flow.
  await page.goto(`${SITE_URL}login?mode=login`, { waitUntil: 'domcontentloaded' })
  await bestEffortWait(page)

  await page.fill('#email', TUTORIAL_EMAIL)
  await page.fill('#password', TUTORIAL_PASSWORD)
  await page.getByRole('button', { name: /entrar/i }).first().click()

  await page.waitForURL(/\/dashboard/i, { timeout: 60_000 })
  await bestEffortWait(page)
  await maybeHandleWhatsappModal(page)

  await ensureDir(AUTH_DIR)
  await context.storageState({ path: AUTH_STATE_PATH })
  return { reused: false }
}

async function captureAround(page, { outPng, targetBox, highlightBox, mask = [] }) {
  const scroll = await getScroll(page)
  const viewport = page.viewportSize() ?? VIEWPORT
  const clip = makeCropBox(targetBox, { scroll, viewport })
  const highlight = highlightBox ? toNormRect(highlightBox, clip) : null
  await screenshotClip(page, outPng, clip, { mask })
  return { clip, highlight }
}

async function captureConexoesQr(page, rawPath) {
  await page.goto(`${SITE_URL}dashboard/conexoes`, { waitUntil: 'domcontentloaded' })
  await bestEffortWait(page)

  const connectionCard = page.locator('div.bg-surface-light', { hasText: 'WhatsApp Web' }).first()
  await connectionCard.waitFor({ state: 'visible', timeout: 45_000 })

  const cardBox = await getBox(connectionCard)
  // The UI may be idle (Gerar QR Code) or error (Tentar novamente) depending on backend health.
  const qrBtn = page.getByRole('button', { name: /gerar qr code|tentar novamente/i }).first()
  const qrBtnVisible = await qrBtn.isVisible().catch(() => false)
  const qrBtnBox = qrBtnVisible ? await getBox(qrBtn) : null

  let qrRectBox = null
  let highlightBox = null
  let mask = []

  // If the account is already connected, the UI can show device info + phone number.
  // Mask that container to avoid any PII leaking into screenshots.
  const deviceInfoCard = connectionCard.getByText(/conectado com sucesso/i).first().locator('..').locator('div.bg-surface-lighter').first()
  if ((await deviceInfoCard.count()) > 0) {
    const visible = await deviceInfoCard.isVisible().catch(() => false)
    if (visible) {
      mask.push(deviceInfoCard)
    }
  }

  try {
    if (!qrBtnVisible) {
      throw new Error('qr_button_not_visible')
    }

    await qrBtn.click()
    const qrImg = page.getByAltText('WhatsApp QR Code')
    await qrImg.waitFor({ state: 'visible', timeout: 45_000 })
    await bestEffortWait(page)
    const qrImgBox = await getBox(qrImg)
    qrRectBox = qrImgBox
    highlightBox = qrImgBox
    mask = [qrImg]
  } catch {
    // Fallback: capture the idle card and highlight the generate button.
    highlightBox = qrBtnBox ?? cardBox
    const side = Math.round(Math.min(360, Math.max(240, cardBox.width * 0.45)))
    const x = cardBox.x + (cardBox.width - side) / 2
    const y = clamp(
      (qrBtnBox?.y ?? cardBox.y + cardBox.height - 160) - side - 24,
      cardBox.y + 120,
      cardBox.y + cardBox.height - side - 120
    )
    qrRectBox = { x, y, width: side, height: side }
  }

  const { clip, highlight } = await captureAround(page, {
    outPng: rawPath,
    targetBox: cardBox,
    highlightBox,
    mask
  })

  return {
    note: mask.length > 0 ? 'QR visible (masked)' : 'QR not visible (fallback placeholder)',
    clip,
    highlight,
    qrRect: qrRectBox ? toNormRect(qrRectBox, clip) : null
  }
}

async function captureConversasIaGlobal(page, rawPath) {
  await page.goto(`${SITE_URL}dashboard/conversas`, { waitUntil: 'domcontentloaded' })
  await bestEffortWait(page)

  await page.getByText('IA Global').first().waitFor({ state: 'visible', timeout: 60_000 })

  const aiTitle = page.getByText('IA Global').first()
  const aiCard = aiTitle.locator('xpath=ancestor::div[contains(@class,"bg-surface-lighter")][1]')
  await aiCard.waitFor({ state: 'visible', timeout: 30_000 })

  // Our Switch component is a <label><input type="checkbox" class="sr-only" /><div class="w-11 h-6 ..."/></label>
  // The input is sr-only (boundingBox can be null), so highlight the track div.
  const switchLabel = aiCard.locator('label:has(input[type="checkbox"])').first()
  const switchTrack = switchLabel.locator('div').first()

  const cardBox = await getBox(aiCard)
  const switchBox = await getBox(switchTrack)

  const { clip, highlight } = await captureAround(page, {
    outPng: rawPath,
    targetBox: cardBox,
    highlightBox: switchBox
  })

  return { note: 'IA Global card', clip, highlight, qrRect: null }
}

async function captureTreinamentoModelo(page, rawPath) {
  await page.goto(`${SITE_URL}dashboard/treinamento`, { waitUntil: 'domcontentloaded' })
  await bestEffortWait(page)

  const modelHeading = page.getByRole('heading', { name: /modelo de ia/i }).first()
  await modelHeading.waitFor({ state: 'visible', timeout: 60_000 })

  const modelCard = page.locator('div.bg-surface-light', { has: modelHeading }).first()
  await modelCard.waitFor({ state: 'visible', timeout: 30_000 })

  const geminiText = modelCard.getByText(/gemini/i).first()
  await geminiText.waitFor({ state: 'visible', timeout: 30_000 })
  const googleTile = geminiText.locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]')

  const cardBox = await getBox(modelCard)
  const tileBox = await getBox(googleTile)

  const { clip, highlight } = await captureAround(page, {
    outPng: rawPath,
    targetBox: cardBox,
    highlightBox: tileBox
  })

  return { note: 'Modelo de IA card', clip, highlight, qrRect: null }
}

async function captureTreinamentoToggles(page, rawPath) {
  // Assumes we are already on /dashboard/treinamento.
  await page.getByText(/se apresentar como ia/i).first().waitFor({ state: 'visible', timeout: 60_000 })

  const toggleLabel = page.getByText(/se apresentar como ia/i).first()
  const toggleCard = toggleLabel.locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]')
  await toggleCard.waitFor({ state: 'visible', timeout: 30_000 })
  const switchLabel = toggleCard.locator('label:has(input[type=\"checkbox\"])').first()
  const switchTrack = switchLabel.locator('div').first()

  const cardBox = await getBox(toggleCard)
  const switchBox = await getBox(switchTrack)

  const { clip, highlight } = await captureAround(page, {
    outPng: rawPath,
    targetBox: cardBox,
    highlightBox: switchBox
  })

  return { note: 'Toggles section', clip, highlight, qrRect: null }
}

async function captureTreinamentoCampos(page, rawPath) {
  // Assumes we are already on /dashboard/treinamento.
  const companyLabel = page.getByText('Nome da Empresa').first()
  await companyLabel.waitFor({ state: 'visible', timeout: 60_000 })

  const companyWrap = companyLabel.locator('xpath=ancestor::div[contains(@class,"space-y-2")][1]')
  const aiWrap = page.getByText('Nome da IA').first().locator('xpath=ancestor::div[contains(@class,"space-y-2")][1]')

  const companyInput = companyWrap.locator('input').first()
  const aiInput = aiWrap.locator('input').first()

  // Type and screenshot fast to avoid the 3s autosave.
  await companyInput.fill('AutoWhats Demo')
  await aiInput.fill('Auri')

  const companyBox = await getBox(companyInput)
  const aiBox = await getBox(aiInput)
  const fieldsUnion = unionBoxes(companyBox, aiBox)

  const { clip, highlight } = await captureAround(page, {
    outPng: rawPath,
    targetBox: fieldsUnion,
    highlightBox: fieldsUnion
  })

  // Important: Treinamento has a 3s autosave that writes to Firestore. Navigate away
  // immediately after the shot to avoid persisting any temporary values.
  await page.goto(`${SITE_URL}dashboard/leads`, { waitUntil: 'domcontentloaded' }).catch(() => {})
  await bestEffortWait(page)

  return { note: 'Campos de treinamento (preenchidos sem salvar)', clip, highlight, qrRect: null }
}

async function captureLeadsLista(page, rawPath) {
  await page.goto(`${SITE_URL}dashboard/leads`, { waitUntil: 'domcontentloaded' })
  await bestEffortWait(page)

  const table = page.locator('table').first()
  await table.waitFor({ state: 'visible', timeout: 60_000 })
  const card = table.locator('xpath=ancestor::div[contains(@class,"bg-surface-light")][1]')
  await card.waitFor({ state: 'visible', timeout: 30_000 })

  const cardBox = await getBox(card)
  const { clip, highlight } = await captureAround(page, {
    outPng: rawPath,
    targetBox: cardBox,
    highlightBox: null
  })

  return { note: 'Leads lista', clip, highlight, qrRect: null }
}

async function captureLeadsSugestoes(page, rawPath) {
  // Assumes we are on /dashboard/leads.
  const sugTab = page.getByRole('button', { name: /sugest/i }).first()
  await sugTab.waitFor({ state: 'visible', timeout: 30_000 })
  await sugTab.click()
  await bestEffortWait(page)

  const heading = page.getByRole('heading', { name: /sugest/i }).first()
  await heading.waitFor({ state: 'visible', timeout: 60_000 })

  const firstCard = page
    .locator('div.bg-surface-light', { has: page.getByRole('button', { name: /aprovar/i }) })
    .first()
  await firstCard.waitFor({ state: 'visible', timeout: 30_000 })

  const approveBtn = firstCard.getByRole('button', { name: /aprovar/i }).first()
  await approveBtn.waitFor({ state: 'visible', timeout: 30_000 })

  const headingBox = await getBox(heading)
  const cardBox = await getBox(firstCard)
  const union = unionBoxes(headingBox, cardBox)
  const approveBox = await getBox(approveBtn)

  const { clip, highlight } = await captureAround(page, {
    outPng: rawPath,
    targetBox: union,
    highlightBox: approveBox
  })

  return { note: 'Leads sugestoes IA', clip, highlight, qrRect: null }
}

async function captureClientesLista(page, rawPath) {
  await page.goto(`${SITE_URL}dashboard/clientes`, { waitUntil: 'domcontentloaded' })
  await bestEffortWait(page)

  const table = page.locator('table').first()
  await table.waitFor({ state: 'visible', timeout: 60_000 })
  const card = table.locator('xpath=ancestor::div[contains(@class,"bg-surface-light")][1]')
  await card.waitFor({ state: 'visible', timeout: 30_000 })

  const cardBox = await getBox(card)
  const { clip, highlight } = await captureAround(page, {
    outPng: rawPath,
    targetBox: cardBox,
    highlightBox: null
  })

  return { note: 'Clientes lista', clip, highlight, qrRect: null }
}

async function captureBillingVisaoGeral(page, rawPath) {
  await page.goto(`${SITE_URL}dashboard/configuracoes?tab=assinatura_creditos`, {
    waitUntil: 'domcontentloaded'
  })
  await bestEffortWait(page)

  const heading = page.getByRole('heading', { name: /assinatura e cr/i }).first()
  await heading.waitFor({ state: 'visible', timeout: 60_000 })

  const subscriptionCard = page.locator('div.bg-surface-light', {
    has: page.getByText(/status da assinatura/i)
  }).first()
  const creditsCard = page.locator('div.bg-surface-light', {
    has: page.getByText(/crÃ©ditos|cr[eé]ditos/i)
  }).first()

  await subscriptionCard.waitFor({ state: 'visible', timeout: 30_000 })
  await creditsCard.waitFor({ state: 'visible', timeout: 30_000 })

  const a = await getBox(subscriptionCard)
  const b = await getBox(creditsCard)
  const target = unionBoxes(a, b)

  const { clip, highlight } = await captureAround(page, {
    outPng: rawPath,
    targetBox: target,
    // Highlight the credits card (robust across minor UI text/formatting changes).
    highlightBox: b
  })

  return { note: 'Billing overview', clip, highlight, qrRect: null }
}

async function main() {
  const start = Date.now()
  await ensureDir(RAW_DIR)
  await ensureDir(OUT_DIR)

  if (!USE_EXISTING) {
    throw new Error(
      'This generator targets production UI. Set USE_EXISTING_ACCOUNT=1 and provide a dedicated tutorial account via TUTORIAL_EMAIL/TUTORIAL_PASSWORD.'
    )
  }

  if (!TUTORIAL_EMAIL || !TUTORIAL_PASSWORD) {
    throw new Error('Missing TUTORIAL_EMAIL or TUTORIAL_PASSWORD.')
  }

  const fixtures = buildFixtures()
  const manifest = {
    generatedAt: nowIso(),
    siteUrl: SITE_URL,
    mode: { headless: HEADLESS, waitForScan: WAIT_FOR_SCAN },
    capture: { viewport: VIEWPORT, deviceScaleFactor: DEVICE_SCALE_FACTOR, crop: CROP, webp: WEBP },
    assets: {}
  }

  let browser
  let context
  let page
  try {
    const storageExists = await fileExists(AUTH_STATE_PATH)
    browser = await chromium.launch({ headless: HEADLESS })
    context = await browser.newContext({
      locale: 'pt-BR',
      viewport: VIEWPORT,
      deviceScaleFactor: DEVICE_SCALE_FACTOR,
      storageState: storageExists ? AUTH_STATE_PATH : undefined
    })

    await installNetworkGuards(context, fixtures)

    page = await context.newPage()
    const authInfo = await ensureLoggedIn(page, context)
    manifest.auth = {
      reusedStorageState: authInfo.reused,
      storageStatePath: path.relative(path.resolve(__dirname, '..'), AUTH_STATE_PATH).replaceAll('\\', '/'),
      emailSet: Boolean(TUTORIAL_EMAIL)
    }

    // --- Captures (raw PNG) ---
    const captures = [
      {
        file: 'conexoes-qr-mascarado.webp',
        raw: path.join(RAW_DIR, 'conexoes-qr-mascarado.png'),
        run: () => captureConexoesQr(page, path.join(RAW_DIR, 'conexoes-qr-mascarado.png'))
      },
      {
        file: 'conversas-ia-global.webp',
        raw: path.join(RAW_DIR, 'conversas-ia-global.png'),
        run: () => captureConversasIaGlobal(page, path.join(RAW_DIR, 'conversas-ia-global.png'))
      },
      {
        file: 'treinamento-modelo.webp',
        raw: path.join(RAW_DIR, 'treinamento-modelo.png'),
        run: () => captureTreinamentoModelo(page, path.join(RAW_DIR, 'treinamento-modelo.png'))
      },
      {
        file: 'treinamento-toggles.webp',
        raw: path.join(RAW_DIR, 'treinamento-toggles.png'),
        run: () => captureTreinamentoToggles(page, path.join(RAW_DIR, 'treinamento-toggles.png'))
      },
      {
        file: 'treinamento-campos.webp',
        raw: path.join(RAW_DIR, 'treinamento-campos.png'),
        run: () => captureTreinamentoCampos(page, path.join(RAW_DIR, 'treinamento-campos.png'))
      },
      {
        file: 'leads-lista.webp',
        raw: path.join(RAW_DIR, 'leads-lista.png'),
        run: () => captureLeadsLista(page, path.join(RAW_DIR, 'leads-lista.png'))
      },
      {
        file: 'leads-sugestoes.webp',
        raw: path.join(RAW_DIR, 'leads-sugestoes.png'),
        run: async () => {
          // Ensure leads page is loaded first
          await page.goto(`${SITE_URL}dashboard/leads`, { waitUntil: 'domcontentloaded' })
          await bestEffortWait(page)
          return captureLeadsSugestoes(page, path.join(RAW_DIR, 'leads-sugestoes.png'))
        }
      },
      {
        file: 'clientes-lista.webp',
        raw: path.join(RAW_DIR, 'clientes-lista.png'),
        run: () => captureClientesLista(page, path.join(RAW_DIR, 'clientes-lista.png'))
      },
      {
        file: 'billing-visao-geral.webp',
        raw: path.join(RAW_DIR, 'billing-visao-geral.png'),
        run: () => captureBillingVisaoGeral(page, path.join(RAW_DIR, 'billing-visao-geral.png'))
      }
    ]

    for (const item of captures) {
      const result = await item.run()
      manifest.assets[item.file] = {
        raw: path.relative(path.resolve(__dirname, '..'), item.raw).replaceAll('\\', '/'),
        note: result.note,
        clip: result.clip,
        highlight: result.highlight,
        qrRect: result.qrRect ?? null
      }

      const outPath = path.join(OUT_DIR, item.file)
      await processImage({
        rawPath: item.raw,
        outPath,
        highlight: result.highlight,
        qrRect: result.qrRect
      })
    }

    manifest.durationMs = Date.now() - start
    await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8')

    // eslint-disable-next-line no-console
    console.log('OK. Tutorial assets em:', OUT_DIR)
  } finally {
    if (context) await context.close().catch(() => {})
    if (browser) await browser.close().catch(() => {})
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exitCode = 1
})
