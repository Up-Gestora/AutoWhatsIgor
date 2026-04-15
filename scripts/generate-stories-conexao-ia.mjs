import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const SITE_URL = 'https://auto-whats.vercel.app/'

function nowStamp() {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function toFileUrl(absPath) {
  const normalized = absPath.replaceAll('\\', '/')
  return normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true })
}

async function bestEffortWait(page) {
  await page.waitForLoadState('domcontentloaded', { timeout: 20_000 }).catch(() => {})
  await page.waitForLoadState('networkidle', { timeout: 7_500 }).catch(() => {})
  await page.waitForTimeout(600)
}

function buildStoriesHtml({ generatedAt, slides }) {
  const slideSections = slides
    .map((s, idx) => {
      const num = String(idx + 1).padStart(2, '0')
      const image = s.imageSrc
        ? `<div class="shot">
             <img src="${escapeHtml(s.imageSrc)}" alt="${escapeHtml(s.title)}" />
           </div>`
        : ''

      const kicker = s.kicker ? `<div class="kicker">${escapeHtml(s.kicker)}</div>` : ''
      const subtitle = s.subtitle ? `<div class="subtitle">${escapeHtml(s.subtitle)}</div>` : ''

      return `
        <section class="slide">
          <div class="chrome">
            <div class="brand">Auto<span>Whats</span></div>
            <div class="step">Passo ${num}</div>
          </div>

          <div class="content">
            ${kicker}
            <h1>${escapeHtml(s.title)}</h1>
            ${subtitle}
            ${image}
          </div>

          <div class="footer">
            <div class="hint">${escapeHtml(s.hint || '')}</div>
            <div class="meta">${escapeHtml(generatedAt)}</div>
          </div>
        </section>
      `.trim()
    })
    .join('\n')

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Tutorial Stories - Conectar Whats e Ligar IA</title>
    <style>
      @page { size: 1080px 1920px; margin: 0; }
      html, body { margin: 0; padding: 0; }
      body {
        font: 44px/1.1 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans", "Liberation Sans";
        background: #070b12;
      }

      .slide {
        width: 1080px;
        height: 1920px;
        position: relative;
        color: #ecf3ff;
        background:
          radial-gradient(900px 700px at 15% 8%, rgba(61,220,151,0.18), transparent 60%),
          radial-gradient(800px 650px at 92% 18%, rgba(57,138,255,0.18), transparent 62%),
          radial-gradient(900px 700px at 70% 95%, rgba(255,166,0,0.10), transparent 55%),
          linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01));
        page-break-after: always;
        overflow: hidden;
      }

      .chrome {
        position: absolute;
        left: 56px;
        right: 56px;
        top: 56px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 28px;
        color: rgba(236,243,255,0.70);
      }
      .brand {
        letter-spacing: -0.02em;
        font-weight: 800;
        color: rgba(236,243,255,0.92);
      }
      .brand span {
        color: #3ddc97;
      }
      .step {
        padding: 10px 14px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(0,0,0,0.28);
        font-weight: 700;
      }

      .content {
        position: absolute;
        left: 56px;
        right: 56px;
        top: 150px;
        bottom: 140px;
        display: flex;
        flex-direction: column;
        gap: 18px;
      }
      .kicker {
        display: inline-flex;
        align-self: flex-start;
        gap: 10px;
        padding: 10px 14px;
        border-radius: 999px;
        font-size: 22px;
        letter-spacing: 0.10em;
        text-transform: uppercase;
        background: rgba(61,220,151,0.10);
        border: 1px solid rgba(61,220,151,0.28);
        color: rgba(236,243,255,0.86);
      }
      h1 {
        margin: 0;
        font-size: 68px;
        letter-spacing: -0.03em;
        line-height: 0.98;
      }
      .subtitle {
        font-size: 30px;
        line-height: 1.25;
        color: rgba(236,243,255,0.76);
        max-width: 860px;
      }

      .shot {
        margin-top: 18px;
        border-radius: 28px;
        border: 1px solid rgba(255,255,255,0.14);
        background: rgba(0,0,0,0.22);
        padding: 18px;
        box-shadow: 0 30px 90px rgba(0,0,0,0.45);
      }
      .shot img {
        width: 100%;
        display: block;
        border-radius: 20px;
      }

      .footer {
        position: absolute;
        left: 56px;
        right: 56px;
        bottom: 56px;
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 18px;
        color: rgba(236,243,255,0.58);
        font-size: 18px;
      }
      .hint {
        max-width: 700px;
        line-height: 1.25;
      }
      .meta {
        white-space: nowrap;
        padding: 8px 10px;
        border-radius: 10px;
        border: 1px solid rgba(255,255,255,0.10);
        background: rgba(0,0,0,0.22);
      }
    </style>
  </head>
  <body>
    ${slideSections}
  </body>
</html>`
}

async function main() {
  const stamp = nowStamp()
  const outDir = path.resolve('docs', 'tutorial-stories-conexao-ia')
  const rawDir = path.join(outDir, 'raw')
  const slidesDir = path.join(outDir, 'slides')
  await ensureDir(rawDir)
  await ensureDir(slidesDir)

  const waitForScan = process.env.WAIT_FOR_SCAN === '1'
  const headless =
    process.env.HEADLESS === '1' ? true : process.env.HEADED === '1' ? false : !waitForScan

  const exampleWhatsapp = process.env.TUTORIAL_WHATSAPP || '(11) 99999-9999'
  const examplePassword = process.env.TUTORIAL_PASSWORD || 'Tutorial@2026!'
  const exampleEmail =
    process.env.TUTORIAL_EMAIL || `tutorial+${stamp}@example.com`

  const browser = await chromium.launch({ headless })
  const context = await browser.newContext({
    locale: 'pt-BR',
    viewport: { width: 1280, height: 720 }
  })
  const page = await context.newPage()

  let n = 1
  const shot = async (slug, { mask = [], caption = '' } = {}) => {
    const fileName = `${String(n).padStart(2, '0')}-${slug}.png`
    const abs = path.join(rawDir, fileName)
    await page.screenshot({
      path: abs,
      fullPage: true,
      mask,
      maskColor: '#0b0f14'
    })
    n += 1
    return { rel: `./raw/${fileName}`, abs, caption }
  }

  // Home -> Signup
  await page.goto(SITE_URL, { waitUntil: 'domcontentloaded' })
  await bestEffortWait(page)
  const home = await shot('home', { caption: 'Home do AutoWhats.' })

  const cta = page.getByRole('link', { name: /teste gratuitamente/i }).first()
  await cta.click({ timeout: 20_000 }).catch(async () => {
    await page.goto(`${SITE_URL}login?mode=signup`, { waitUntil: 'domcontentloaded' })
  })
  await page.waitForURL(/\/login/i, { timeout: 20_000 }).catch(() => {})
  await bestEffortWait(page)
  const signup = await shot('signup', { caption: 'Tela de cadastro.' })

  // Fill signup form and create account
  await page.fill('#email', exampleEmail)
  await page.fill('#whatsapp', exampleWhatsapp)
  await page.fill('#password', examplePassword)
  await page.fill('#confirmPassword', examplePassword)
  await bestEffortWait(page)
  const filled = await shot('signup-preenchido', { caption: 'Cadastro preenchido.' })

  await page.getByRole('button', { name: /criar conta/i }).click()
  await page.waitForURL(/\/dashboard/i, { timeout: 45_000 })
  await bestEffortWait(page)
  const dashboard = await shot('dashboard', { caption: 'Dashboard após criar a conta.' })

  // Connections: generate QR
  await page.goto(`${SITE_URL}dashboard/conexoes`, { waitUntil: 'domcontentloaded' })
  await bestEffortWait(page)
  const qrButton = page.getByRole('button', { name: /gerar qr code/i })
  await qrButton.waitFor({ state: 'attached', timeout: 30_000 })
  const conexoesIdle = await shot('conexoes', { caption: 'Página de conexões.' })

  await qrButton.click()
  const qrImg = page.getByAltText('WhatsApp QR Code')
  await qrImg.waitFor({ state: 'attached', timeout: 45_000 })

  // Mask the QR in tutorial assets (never store a scannable QR in docs output).
  const conexoesQr = await shot('conexoes-qr-mascarado', {
    caption: 'QR Code (mascarado para segurança).',
    mask: [qrImg]
  })

  let conectado = null
  if (waitForScan) {
    // eslint-disable-next-line no-console
    console.log('QR exibido. Escaneie pelo WhatsApp (Aparelhos conectados -> Conectar um aparelho).')

    await page.getByText(/autenticado/i).waitFor({ timeout: 12 * 60_000 }).catch(() => {})
    await bestEffortWait(page)

    await page.getByText(/conectado com sucesso/i).waitFor({ timeout: 12 * 60_000 })
    await bestEffortWait(page)

    // Mask any device-identifying info (number / device model) regardless of locale/encoding.
    const masks = []
    const connectedHeading = page.getByRole('heading', { name: /conectado com sucesso/i })
    const connectedContainer = connectedHeading.locator('..')
    const deviceInfoCard = connectedContainer.locator('div.bg-surface-lighter')
    if ((await deviceInfoCard.count()) > 0) {
      masks.push(deviceInfoCard)
    } else {
      // Fallback: mask all "surface-lighter" blocks (should still hide the number if present).
      masks.push(page.locator('div.bg-surface-lighter'))
    }

    conectado = await shot('conectado-mascarado', {
      caption: 'WhatsApp conectado (dados mascarados).',
      mask: masks
    })
  }

  // Conversations: enable IA Global
  await page.goto(`${SITE_URL}dashboard/conversas`, { waitUntil: 'domcontentloaded' })
  await bestEffortWait(page)
  await page.getByText('IA Global').waitFor({ timeout: 30_000 })
  const conversasOff = await shot('conversas-ia-global', {
    caption: 'Tela de conversas com controle de IA global.'
  })

  const aiCard = page.locator('div', { has: page.getByText('IA Global') }).first()
  const aiToggle = aiCard.locator('label').first()
  const aiCheckbox = aiToggle.locator('input[type=\"checkbox\"]').first()
  await page.waitForFunction((el) => el && !el.disabled, await aiCheckbox.elementHandle(), {
    timeout: 30_000
  }).catch(() => {})

  // Best-effort: toggle on (might revert if backend/credits fail).
  await aiToggle.click().catch(() => {})
  await page.getByText(/ativada para todos/i).waitFor({ timeout: 20_000 }).catch(() => {})
  await bestEffortWait(page)
  const conversasOn = await shot('conversas-ia-ativada', {
    caption: 'IA global ativada.'
  })

  // Training page (show it, no edits)
  await page.goto(`${SITE_URL}dashboard/treinamento`, { waitUntil: 'domcontentloaded' })
  await bestEffortWait(page)
  await page.getByText(/Treinamento da IA/i).waitFor({ timeout: 30_000 }).catch(() => {})
  const treinamento = await shot('treinamento-ia', { caption: 'Configuração do modelo e instruções da IA.' })

  await browser.close()

  const generatedAt = new Date().toISOString()
  const slides = [
    {
      kicker: 'Em minutos',
      title: 'Conta + Whats + IA',
      subtitle: 'Crie sua conta, conecte seu WhatsApp via QR e ligue a IA para responder automaticamente.',
      imageSrc: home.rel,
      hint: 'Este tutorial gera prints reais do produto.'
    },
    {
      kicker: 'Passo a passo',
      title: 'Crie sua conta',
      subtitle: 'Clique em "Teste gratuitamente" e abra a tela de cadastro.',
      imageSrc: signup.rel,
      hint: 'Dica: use um email real se for sua conta definitiva.'
    },
    {
      kicker: 'Cadastro',
      title: 'Preencha os dados',
      subtitle: 'Email + WhatsApp + senha. Depois clique em "Criar Conta".',
      imageSrc: filled.rel,
      hint: 'A senha aparece mascarada no formulário.'
    },
    {
      kicker: 'Dashboard',
      title: 'Acesse o painel',
      subtitle: 'Ao finalizar, você entra no Dashboard.',
      imageSrc: dashboard.rel,
      hint: 'Próximo: conectar o WhatsApp.'
    },
    {
      kicker: 'WhatsApp',
      title: 'Gere o QR Code',
      subtitle: 'No menu, abra "Conexões" e clique em "Gerar QR Code".',
      imageSrc: conexoesIdle.rel,
      hint: 'O backend cria uma sessão segura para o seu número.'
    },
    {
      kicker: 'WhatsApp',
      title: 'Escaneie o QR',
      subtitle: 'No celular: Configurações -> Aparelhos conectados -> Conectar um aparelho.',
      imageSrc: conexoesQr.rel,
      hint: 'QR mascarado no tutorial para evitar uso indevido.'
    },
    ...(conectado
      ? [
          {
            kicker: 'Conexão',
            title: 'Whats conectado',
            subtitle: 'Quando conectar, o status muda para "Conectado com sucesso!".',
            imageSrc: conectado.rel,
            hint: 'Dados pessoais mascarados.'
          }
        ]
      : []),
    {
      kicker: 'IA',
      title: 'Ligue a IA Global',
      subtitle: 'Em "Conversas", ative a IA global para responder automaticamente.',
      imageSrc: conversasOff.rel,
      hint: 'Você também pode ligar/desligar IA em massa.'
    },
    {
      kicker: 'IA',
      title: 'IA ativada',
      subtitle: 'Com a IA ligada, ela pode atender leads do seu tráfego pago automaticamente.',
      imageSrc: conversasOn.rel,
      hint: 'Se você ficar sem créditos, a IA pode ser desativada.'
    },
    {
      kicker: 'Treinamento',
      title: 'Ajuste o comportamento',
      subtitle: 'Em "Treinamento IA", escolha o modelo e configure as instruções de resposta.',
      imageSrc: treinamento.rel,
      hint: 'Recomendado: defina nome da empresa, serviços e regras.'
    }
  ]

  const storiesHtml = buildStoriesHtml({ generatedAt, slides })
  const htmlPath = path.join(outDir, 'stories.html')
  await fs.writeFile(htmlPath, storiesHtml, 'utf8')

  // Render HTML -> PDF + slide PNGs
  const renderBrowser = await chromium.launch({ headless: true })
  const renderContext = await renderBrowser.newContext({ viewport: { width: 1080, height: 1920 } })
  const renderPage = await renderContext.newPage()
  await renderPage.goto(toFileUrl(htmlPath), { waitUntil: 'load' })
  await renderPage.waitForTimeout(300)

  // PDF
  const pdfPath = path.join(outDir, 'stories.pdf')
  await renderPage.pdf({
    path: pdfPath,
    printBackground: true,
    width: '1080px',
    height: '1920px',
    margin: { top: '0', bottom: '0', left: '0', right: '0' },
    pageRanges: ''
  })

  // Per-slide PNGs
  const slideEls = renderPage.locator('section.slide')
  const slideCount = await slideEls.count()
  for (let i = 0; i < slideCount; i += 1) {
    const fileName = `${String(i + 1).padStart(2, '0')}.png`
    await slideEls.nth(i).screenshot({ path: path.join(slidesDir, fileName) })
  }

  await renderBrowser.close()

  const manifest = {
    site: SITE_URL,
    generatedAt,
    auth: {
      email: exampleEmail,
      whatsapp: exampleWhatsapp,
      passwordSetViaEnv: Boolean(process.env.TUTORIAL_PASSWORD),
      emailSetViaEnv: Boolean(process.env.TUTORIAL_EMAIL)
    },
    mode: {
      waitForScan,
      headless
    },
    outputs: {
      html: './stories.html',
      pdf: './stories.pdf',
      rawDir: './raw',
      slidesDir: './slides'
    }
  }
  await fs.writeFile(path.join(outDir, 'stories.manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')

  // eslint-disable-next-line no-console
  console.log(`OK. Stories em: ${outDir}`)
  // eslint-disable-next-line no-console
  console.log(`PDF: ${pdfPath}`)
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exitCode = 1
})
