import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const SITE_URL = process.env.SITE_URL || 'https://auto-whats.vercel.app/'

function nowStamp() {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true })
}

async function bestEffortWait(page) {
  await page.waitForLoadState('domcontentloaded', { timeout: 20_000 }).catch(() => {})
  await page.waitForLoadState('networkidle', { timeout: 7_500 }).catch(() => {})
  await page.waitForTimeout(500)
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

async function getBox(locator) {
  await locator.scrollIntoViewIfNeeded().catch(() => {})
  const box = await locator.boundingBox()
  if (!box) throw new Error('Could not resolve bounding box for locator')
  return box
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

async function main() {
  const stamp = nowStamp()
  const outDir = path.resolve(__dirname, '..', 'docs', 'ads-assets', 'v2', 'ui')
  const fullDir = path.join(outDir, 'full')
  const cropsDir = path.join(outDir, 'crops')
  await ensureDir(fullDir)
  await ensureDir(cropsDir)

  const waitForScan = process.env.WAIT_FOR_SCAN === '1'
  const headless =
    process.env.HEADLESS === '1' ? true : process.env.HEADED === '1' ? false : !waitForScan

  const exampleWhatsapp = process.env.TUTORIAL_WHATSAPP || '(11) 99999-9999'
  const examplePassword = process.env.TUTORIAL_PASSWORD || 'Tutorial@2026!'
  const exampleEmail = process.env.TUTORIAL_EMAIL || `ads+${stamp}@example.com`
  const useExisting = process.env.USE_EXISTING_ACCOUNT === '1'

  const deviceScaleFactor = 2
  const manifest = {
    site: SITE_URL,
    generatedAt: new Date().toISOString(),
    mode: { waitForScan, headless },
    auth: {
      email: exampleEmail,
      whatsapp: exampleWhatsapp,
      passwordSetViaEnv: Boolean(process.env.TUTORIAL_PASSWORD),
      emailSetViaEnv: Boolean(process.env.TUTORIAL_EMAIL)
    },
    crops: {}
  }

  let browser
  let page
  let context
  try {
    browser = await chromium.launch({ headless })
    context = await browser.newContext({
      locale: 'pt-BR',
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor
    })
    page = await context.newPage()

  // --- Signup screen (no PII persisted: mask inputs just in case) ---
  await page.goto(`${SITE_URL}login?mode=signup`, { waitUntil: 'domcontentloaded' })
  await bestEffortWait(page)
  const authCard = page.locator('div.bg-surface-light').first()
  await authCard.waitFor({ state: 'visible', timeout: 20_000 })

  const signupBtn = page.getByRole('button', { name: /criar conta/i }).first()
  const signupBox = await getBox(authCard)
  const signupBtnBox = await getBox(signupBtn)
  const signupMask = [page.locator('#email'), page.locator('#whatsapp')]

  const signupOut = path.join(cropsDir, 'signup.png')
  await screenshotClip(page, signupOut, signupBox, { mask: signupMask })
  manifest.crops['signup.png'] = {
    size: { w: Math.round(signupBox.width * deviceScaleFactor), h: Math.round(signupBox.height * deviceScaleFactor) },
    highlight: toNormRect(signupBtnBox, signupBox),
    note: 'Signup auth card. Inputs masked.'
  }

  if (useExisting) {
    if (!process.env.TUTORIAL_EMAIL || !process.env.TUTORIAL_PASSWORD) {
      throw new Error('USE_EXISTING_ACCOUNT=1 requires TUTORIAL_EMAIL and TUTORIAL_PASSWORD')
    }

    await page.goto(`${SITE_URL}login?mode=login`, { waitUntil: 'domcontentloaded' })
    await bestEffortWait(page)
    await page.fill('#email', exampleEmail)
    await page.fill('#password', examplePassword)
    await bestEffortWait(page)
    const loginBtn = page.getByRole('button', { name: /entrar/i }).first()
    await loginBtn.click()
  } else {
    // --- Create account (needed to access dashboard) ---
    await page.fill('#email', exampleEmail)
    await page.fill('#whatsapp', exampleWhatsapp)
    await page.fill('#password', examplePassword)
    await page.fill('#confirmPassword', examplePassword)
    await bestEffortWait(page)
    await signupBtn.click()
  }

  await page.waitForURL(/\/dashboard/i, { timeout: 60_000 })
  await bestEffortWait(page)

  const sessionId = await page.evaluate(() => {
    const keys = Object.keys(window.localStorage || {})
    const authKey = keys.find((key) => key.startsWith('firebase:authUser:'))
    if (!authKey) return null
    const raw = window.localStorage.getItem(authKey)
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw)
      return parsed?.uid || null
    } catch {
      return null
    }
  })
  if (sessionId) {
    manifest.auth.sessionId = sessionId
  }

  // --- Connections: "Generate QR" (idle) ---
  await page.goto(`${SITE_URL}dashboard/conexoes`, { waitUntil: 'domcontentloaded' })
  await bestEffortWait(page)

  const connectionCard = page.locator('div.bg-surface-light', { hasText: 'WhatsApp Web' }).first()
  await connectionCard.waitFor({ state: 'visible', timeout: 30_000 })
  const qrBtn = page.getByRole('button', { name: /gerar qr code/i }).first()
  await qrBtn.waitFor({ state: 'visible', timeout: 30_000 })

  const conexoesIdleBox = await getBox(connectionCard)
  const qrBtnBox = await getBox(qrBtn)
  const conexoesIdleOut = path.join(cropsDir, 'conexoes-gerar-qr.png')
  await screenshotClip(page, conexoesIdleOut, conexoesIdleBox)
  manifest.crops['conexoes-gerar-qr.png'] = {
    size: {
      w: Math.round(conexoesIdleBox.width * deviceScaleFactor),
      h: Math.round(conexoesIdleBox.height * deviceScaleFactor)
    },
    highlight: toNormRect(qrBtnBox, conexoesIdleBox),
    note: 'Connections card (idle) with Generate QR button.'
  }

  // --- Connections: QR visible (masked) ---
  const conexoesQrOut = path.join(cropsDir, 'conexoes-qr-masked.png')
  let qrRect = null
  try {
    await qrBtn.click()
    const qrImg = page.getByAltText('WhatsApp QR Code')
    await qrImg.waitFor({ state: 'visible', timeout: 45_000 })
    await bestEffortWait(page)
    const qrImgBox = await getBox(qrImg)
    await screenshotClip(page, conexoesQrOut, conexoesIdleBox, { mask: [qrImg] })
    qrRect = toNormRect(qrImgBox, conexoesIdleBox)
  } catch (error) {
    await screenshotClip(page, conexoesQrOut, conexoesIdleBox)
  }
  manifest.crops['conexoes-qr-masked.png'] = {
    size: {
      w: Math.round(conexoesIdleBox.width * deviceScaleFactor),
      h: Math.round(conexoesIdleBox.height * deviceScaleFactor)
    },
    highlight: null,
    qrRect,
    note: qrRect
      ? 'Connections card with QR (masked).'
      : 'Connections card without QR (fallback).'
  }

  // --- Optional: connected state (requires scan) ---
  if (waitForScan) {
    // eslint-disable-next-line no-console
    console.log('QR exibido. Escaneie no WhatsApp (Aparelhos conectados -> Conectar um aparelho).')

    await page.getByText(/conectado com sucesso/i).waitFor({ timeout: 12 * 60_000 })
    await bestEffortWait(page)

    const connectedHeading = page.getByRole('heading', { name: /conectado com sucesso/i }).first()
    const connectedContainer = connectedHeading.locator('..')
    const deviceInfoCard = connectedContainer.locator('div.bg-surface-lighter')

    const masks = []
    if ((await deviceInfoCard.count()) > 0) masks.push(deviceInfoCard)

    const connectedOut = path.join(cropsDir, 'conectado-masked.png')
    await screenshotClip(page, connectedOut, conexoesIdleBox, { mask: masks })
    manifest.crops['conectado-masked.png'] = {
      size: {
        w: Math.round(conexoesIdleBox.width * deviceScaleFactor),
        h: Math.round(conexoesIdleBox.height * deviceScaleFactor)
      },
      highlight: null,
      note: 'Connected state, device/number masked.'
    }
  }

  // --- Conversations: IA Global ON (best-effort) ---
  await page.goto(`${SITE_URL}dashboard/conversas`, { waitUntil: 'domcontentloaded' })
  await bestEffortWait(page)
  await page.getByText('IA Global').waitFor({ timeout: 45_000 })

  const aiCard = page.locator('div', { has: page.getByText('IA Global') }).first()
  await aiCard.waitFor({ state: 'visible', timeout: 30_000 })
  const aiToggle = aiCard.locator('label').first()
  const aiCheckbox = aiToggle.locator('input[type=\"checkbox\"]').first()

  // Toggle on (may fail due to backend/credits; still capture UI for ad purposes).
  await page.waitForFunction((el) => el && !el.disabled, await aiCheckbox.elementHandle(), {
    timeout: 30_000
  }).catch(() => {})
  await aiToggle.click().catch(() => {})
  await page.getByText(/ativad[ao]/i).waitFor({ timeout: 10_000 }).catch(() => {})
  await bestEffortWait(page)

  const aiCardBox = await getBox(aiCard)
  const aiToggleBox = await getBox(aiToggle)
  const iaOut = path.join(cropsDir, 'ia-global-on.png')
  await screenshotClip(page, iaOut, aiCardBox)
  manifest.crops['ia-global-on.png'] = {
    size: { w: Math.round(aiCardBox.width * deviceScaleFactor), h: Math.round(aiCardBox.height * deviceScaleFactor) },
    highlight: toNormRect(aiToggleBox, aiCardBox),
    note: 'IA Global card (best-effort ON).'
  }

  // --- Treinamento: "Modelo de IA" card ---
  await page.goto(`${SITE_URL}dashboard/treinamento`, { waitUntil: 'domcontentloaded' })
  await bestEffortWait(page)

  const modelHeading = page.getByRole('heading', { name: /modelo de ia/i }).first()
  await modelHeading.waitFor({ state: 'visible', timeout: 45_000 })

  const modelCard = page.locator('div.bg-surface-light', { has: modelHeading }).first()
  await modelCard.waitFor({ state: 'visible', timeout: 30_000 })

  const geminiText = modelCard.getByText(/gemini\s*3\.0\s*flash/i).first()
  await geminiText.waitFor({ state: 'visible', timeout: 30_000 })
  const googleTile = geminiText.locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]')

  const modelCardBox = await getBox(modelCard)
  const googleTileBox = await getBox(googleTile)
  const treinamentoOut = path.join(cropsDir, 'treinamento-modelo.png')
  await screenshotClip(page, treinamentoOut, modelCardBox)
  manifest.crops['treinamento-modelo.png'] = {
    size: {
      w: Math.round(modelCardBox.width * deviceScaleFactor),
      h: Math.round(modelCardBox.height * deviceScaleFactor)
    },
    highlight: toNormRect(googleTileBox, modelCardBox),
    note: 'Treinamento: Modelo de IA (Gemini destacado).'
  }

  // --- Leads: CRM table ---
  await page.route('**/api/conversations/chats/*/ai-followup/draft**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        draft: {
          text:
            'Oi! Vi que voce ainda nao concluiu o atendimento. Posso te ajudar com alguma duvida ou agendar um horario?'
        }
      })
    })
  })

  await page.goto(`${SITE_URL}dashboard/leads`, { waitUntil: 'domcontentloaded' })
  await bestEffortWait(page)

  const leadsTable = page.locator('table').first()
  await leadsTable.waitFor({ state: 'visible', timeout: 45_000 })
  const leadsCard = leadsTable.locator('xpath=ancestor::div[contains(@class,"bg-surface-light")][1]')
  await leadsCard.waitFor({ state: 'visible', timeout: 30_000 })

  const leadsBox = await getBox(leadsCard)
  const leadsOut = path.join(cropsDir, 'crm-leads.png')
  await screenshotClip(page, leadsOut, leadsBox)
  manifest.crops['crm-leads.png'] = {
    size: {
      w: Math.round(leadsBox.width * deviceScaleFactor),
      h: Math.round(leadsBox.height * deviceScaleFactor)
    },
    highlight: null,
    note: 'CRM: tabela de leads.'
  }

  // --- Follow-up modal ---
  try {
    const followBtn = page.getByTitle(/follow-up com ia/i).first()
    await followBtn.waitFor({ state: 'visible', timeout: 30_000 })
    await followBtn.click()
    const followHeading = page.getByRole('heading', { name: /follow-up com ia/i }).first()
    await followHeading.waitFor({ state: 'visible', timeout: 20_000 })
    const followCard = followHeading.locator('xpath=ancestor::div[contains(@class,"bg-surface-light")][1]')
    const followBox = await getBox(followCard)
    const followOut = path.join(cropsDir, 'followup-modal.png')
    await screenshotClip(page, followOut, followBox)
    manifest.crops['followup-modal.png'] = {
      size: {
        w: Math.round(followBox.width * deviceScaleFactor),
        h: Math.round(followBox.height * deviceScaleFactor)
      },
      highlight: null,
      note: 'Follow-up modal com rascunho.'
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Nao foi possivel capturar o modal de follow-up.', error?.message || error)
  }

  } finally {
    if (context) {
      await context.close().catch(() => {})
    }
    if (browser) {
      await browser.close().catch(() => {})
    }
  }

  await fs.writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
  // eslint-disable-next-line no-console
  console.log('OK. Ads UI assets em:', outDir)
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exitCode = 1
})
