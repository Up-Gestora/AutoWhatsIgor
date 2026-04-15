import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const SITE_URL = 'https://auto-whats.vercel.app/'
const SKIP_SIGNUP = process.env.SKIP_SIGNUP === '1'

function nowStamp() {
  // 2026-02-05T23-59-59Z (safe for filenames)
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
}

function toFileUrl(absPath) {
  // Windows-safe file:// URL
  const normalized = absPath.replaceAll('\\', '/')
  return normalized.startsWith('/')
    ? `file://${normalized}`
    : `file:///${normalized}`
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true })
}

async function tryClick(locator) {
  try {
    await locator.click({ timeout: 2500 })
    return true
  } catch {
    return false
  }
}

async function bestEffortWait(page) {
  // Avoid hanging on long-lived connections (e.g. websockets).
  await page.waitForLoadState('domcontentloaded', { timeout: 20_000 }).catch(() => {})
  await page.waitForLoadState('networkidle', { timeout: 7_500 }).catch(() => {})
  await page.waitForTimeout(800)
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function buildTutorialHtml({ generatedAt, steps, exampleEmail, exampleWhatsapp }) {
  const stepItems = steps
    .map((s) => {
      return `
        <section class="step">
          <div class="step__meta">
            <div class="step__num">${s.n}</div>
            <div>
              <h2 class="step__title">${escapeHtml(s.title)}</h2>
              <p class="step__desc">${escapeHtml(s.description)}</p>
            </div>
          </div>
          <figure class="shot">
            <img src="${escapeHtml(s.imageSrc)}" alt="${escapeHtml(s.title)}" />
            <figcaption>${escapeHtml(s.caption)}</figcaption>
          </figure>
        </section>
      `.trim()
    })
    .join('\n')

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AutoWhats - Como criar uma conta</title>
    <style>
      :root {
        --bg: #0b0f14;
        --card: #111826;
        --ink: #e8eefc;
        --muted: #a7b3cc;
        --accent: #3ddc97;
        --border: rgba(255,255,255,0.10);
      }

      * { box-sizing: border-box; }
      body {
        margin: 0;
        font: 14px/1.45 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans", "Liberation Sans";
        color: var(--ink);
        background: radial-gradient(1100px 700px at 20% 10%, rgba(61,220,151,0.18), transparent 55%),
                    radial-gradient(900px 600px at 90% 30%, rgba(57,138,255,0.18), transparent 55%),
                    var(--bg);
      }
      .wrap {
        max-width: 980px;
        margin: 0 auto;
        padding: 40px 22px 60px;
      }
      header {
        background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));
        border: 1px solid var(--border);
        border-radius: 18px;
        padding: 20px 22px;
      }
      h1 {
        margin: 0;
        font-size: 28px;
        letter-spacing: -0.02em;
      }
      .sub {
        margin-top: 8px;
        color: var(--muted);
      }
      .meta {
        margin-top: 14px;
        display: flex;
        flex-wrap: wrap;
        gap: 10px 16px;
        color: var(--muted);
        font-size: 12px;
      }
      .meta code {
        background: rgba(0,0,0,0.35);
        border: 1px solid var(--border);
        padding: 1px 6px;
        border-radius: 999px;
        color: var(--ink);
      }

      .steps { margin-top: 22px; display: grid; gap: 16px; }
      .step {
        background: rgba(17,24,38,0.9);
        border: 1px solid var(--border);
        border-radius: 18px;
        padding: 18px 18px 14px;
      }
      .step__meta {
        display: grid;
        grid-template-columns: 44px 1fr;
        gap: 12px;
        align-items: start;
      }
      .step__num {
        width: 44px;
        height: 44px;
        border-radius: 14px;
        display: grid;
        place-items: center;
        background: rgba(61,220,151,0.16);
        border: 1px solid rgba(61,220,151,0.35);
        color: var(--accent);
        font-weight: 800;
        font-size: 16px;
      }
      .step__title { margin: 0; font-size: 18px; }
      .step__desc { margin: 6px 0 0; color: var(--muted); }

      figure.shot { margin: 14px 0 0; }
      figure.shot img {
        width: 100%;
        border-radius: 14px;
        border: 1px solid var(--border);
        display: block;
        background: rgba(0,0,0,0.25);
      }
      figure.shot figcaption {
        margin-top: 8px;
        color: var(--muted);
        font-size: 12px;
      }

      .note {
        margin-top: 16px;
        background: rgba(61,220,151,0.08);
        border: 1px solid rgba(61,220,151,0.25);
        border-radius: 14px;
        padding: 12px 14px;
        color: var(--muted);
      }
      .note strong { color: var(--ink); }

      @media print {
        body { background: white; color: #111; }
        header, .step, .note { background: white; border-color: #ddd; }
        .sub, .meta, .step__desc, figure.shot figcaption, .note { color: #333; }
        .step__num { border-color: #0a7; color: #0a7; background: #e7fff4; }
        img { page-break-inside: avoid; }
        .step { break-inside: avoid; }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <header>
        <h1>Como criar uma conta no AutoWhats</h1>
        <div class="sub">Passo a passo para abrir sua conta e acessar o Dashboard.</div>
        <div class="meta">
          <div>Site: <code>${escapeHtml(SITE_URL)}</code></div>
          <div>Gerado em: <code>${escapeHtml(generatedAt)}</code></div>
          <div>Email (exemplo): <code>${escapeHtml(exampleEmail)}</code></div>
          <div>WhatsApp (exemplo): <code>${escapeHtml(exampleWhatsapp)}</code></div>
        </div>
      </header>

      <div class="steps">
        ${stepItems}
      </div>

      <div class="note">
        <strong>Dica:</strong> se você já tiver uma conta, use o botão <strong>Login</strong> na Home ou acesse <strong>/login</strong>.
      </div>
    </div>
  </body>
</html>`
}

async function main() {
  const stamp = nowStamp()
  const outDir = path.resolve('docs', 'tutorial-criar-conta')
  const shotsDir = path.join(outDir, 'screenshots')
  await ensureDir(shotsDir)

  let exampleEmail = `tutorial+${stamp}@example.com`
  let exampleWhatsapp = '(11) 99999-9999'
  const examplePassword = 'Tutorial@2026!'

  let homeImg
  let signupImg
  let filledImg
  let dashImg

  if (SKIP_SIGNUP) {
    const manifestPath = path.join(outDir, 'tutorial.manifest.json')
    const manifestRaw = await fs.readFile(manifestPath, 'utf8').catch(() => '')
    if (manifestRaw) {
      try {
        const m = JSON.parse(manifestRaw)
        if (m?.exampleEmail) exampleEmail = m.exampleEmail
        if (m?.exampleWhatsapp) exampleWhatsapp = m.exampleWhatsapp
      } catch {
        // ignore
      }
    }

    const required = [
      { key: 'home', file: '01-home.png' },
      { key: 'signup', file: '02-signup.png' },
      { key: 'filled', file: '03-form-preenchido.png' },
      { key: 'dash', file: '04-dashboard.png' }
    ]
    for (const r of required) {
      const abs = path.join(shotsDir, r.file)
      await fs.access(abs).catch(() => {
        throw new Error(
          `SKIP_SIGNUP=1 foi usado, mas o screenshot obrigatório não existe: ${abs}`
        )
      })
    }

    homeImg = './screenshots/01-home.png'
    signupImg = './screenshots/02-signup.png'
    filledImg = './screenshots/03-form-preenchido.png'
    dashImg = './screenshots/04-dashboard.png'
  } else {
    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
      locale: 'pt-BR',
      viewport: { width: 1280, height: 720 }
    })
    const page = await context.newPage()

    let n = 1
    const shot = async (slug, caption) => {
      const fileName = `${String(n).padStart(2, '0')}-${slug}.png`
      const abs = path.join(shotsDir, fileName)
      await page.screenshot({ path: abs, fullPage: true })
      const rel = `./screenshots/${fileName}`
      n += 1
      return rel
    }

    // 1) Home
    await page.goto(SITE_URL, { waitUntil: 'domcontentloaded' })
    await bestEffortWait(page)
    homeImg = await shot('home', 'Página inicial do AutoWhats.')

    // 2) Ir para signup via CTA "Teste gratuitamente" (fallback: URL direta)
    const cta = page.getByRole('link', { name: /teste gratuitamente/i }).first()
    const clicked = await tryClick(cta)
    if (!clicked) {
      await page.goto(`${SITE_URL}login?mode=signup`, { waitUntil: 'domcontentloaded' })
    }
    await bestEffortWait(page)
    signupImg = await shot('signup', 'Tela de criação de conta (cadastro).')

    // 3) Preencher formulário
    await page.fill('#email', exampleEmail)
    await page.fill('#whatsapp', exampleWhatsapp)
    await page.fill('#password', examplePassword)
    await page.fill('#confirmPassword', examplePassword)
    await bestEffortWait(page)
    filledImg = await shot(
      'form-preenchido',
      'Exemplo de preenchimento: Email, WhatsApp e senha (a senha aparece mascarada).'
    )

    // 4) Criar conta e chegar ao dashboard
    await page.getByRole('button', { name: /criar conta/i }).click()
    await page.waitForURL(/\/dashboard/i, { timeout: 45_000 })
    await bestEffortWait(page)
    dashImg = await shot('dashboard', 'Ao finalizar o cadastro, você é redirecionado ao Dashboard.')

    await browser.close()
  }

  const steps = [
    {
      n: 1,
      title: 'Acesse o site',
      description: `Entre em ${SITE_URL} no navegador.`,
      caption: 'A Home do AutoWhats.',
      imageSrc: homeImg
    },
    {
      n: 2,
      title: 'Clique em "Teste gratuitamente"',
      description: 'Na página inicial, clique no botão de CTA para abrir a tela de cadastro.',
      caption: 'Link para abrir o modo de cadastro.',
      imageSrc: signupImg
    },
    {
      n: 3,
      title: 'Preencha os dados do cadastro',
      description:
        'Informe um Email válido, seu WhatsApp e crie uma senha. Depois repita a senha em "Confirmar Senha".',
      caption: 'Campos obrigatórios preenchidos.',
      imageSrc: filledImg
    },
    {
      n: 4,
      title: 'Finalize em "Criar Conta"',
      description: 'Clique no botão "Criar Conta" e aguarde o redirecionamento.',
      caption: 'Dashboard após a criação da conta.',
      imageSrc: dashImg
    }
  ]

  const generatedAt = new Date().toISOString()
  const html = buildTutorialHtml({ generatedAt, steps, exampleEmail, exampleWhatsapp })
  const tutorialHtmlPath = path.join(outDir, 'tutorial.html')
  await fs.writeFile(tutorialHtmlPath, html, 'utf8')

  // Render HTML -> PDF
  const pdfBrowser = await chromium.launch({ headless: true })
  const pdfContext = await pdfBrowser.newContext({ viewport: { width: 1280, height: 720 } })
  const pdfPage = await pdfContext.newPage()
  await pdfPage.goto(toFileUrl(tutorialHtmlPath), { waitUntil: 'load' })
  await pdfPage.waitForTimeout(500)
  const pdfPath = path.join(outDir, 'tutorial-criar-conta.pdf')
  await pdfPage.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' }
  })
  await pdfBrowser.close()

  // Small "manifest" for reference (no password stored).
  const manifestPath = path.join(outDir, 'tutorial.manifest.json')
  await fs.writeFile(
    manifestPath,
    JSON.stringify(
      {
        site: SITE_URL,
        generatedAt,
        exampleEmail,
        exampleWhatsapp,
        outputs: {
          html: './tutorial.html',
          pdf: './tutorial-criar-conta.pdf',
          screenshotsDir: './screenshots'
        }
      },
      null,
      2
    ),
    'utf8'
  )

  // eslint-disable-next-line no-console
  console.log(`Tutorial gerado em: ${outDir}`)
  // eslint-disable-next-line no-console
  console.log(`PDF: ${pdfPath}`)
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exitCode = 1
})
