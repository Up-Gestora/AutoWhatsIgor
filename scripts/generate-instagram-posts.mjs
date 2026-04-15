/**
 * AutoWhats - Instagram feed posts generator (PNG + captions)
 *
 * Usage:
 *   node scripts/generate-instagram-posts.mjs
 *
 * If Chromium is missing (Playwright):
 *   npx playwright install chromium
 *
 * Env vars:
 *   OUTPUT_DIR   Output directory (default: docs/instagram/<timestamp>/)
 *   FORMAT       portrait | square | both (default: portrait)
 *   BRAND_HANDLE Optional handle (ex: @autowhats)
 *   CTA_TEXT     Footer CTA (default: "Teste grátis • link na bio")
 *   PRICE_FROM   Used only in Post 10 (default: "R$ 100/mês")
 *   HEADLESS     1 (default) or 0
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const THEME = {
  background: '#0D1117',
  backgroundAlt: '#0A1628',
  surface: '#161B22',
  surfaceLighter: '#21262D',
  primary: '#25D366',
  primaryDark: '#128C7E',
  primaryLight: '#34E879',
  text: '#E6EDF3',
  textMuted: '#9CA3AF'
}

const DEFAULT_CTA_TEXT = 'Teste grátis • link na bio'
const DEFAULT_PRICE_FROM = 'R$ 100/mês'

function nowStamp() {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
}

function toFileUrl(absPath) {
  const normalized = absPath.replaceAll('\\', '/')
  return normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true })
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function normalizeFormat(value) {
  const raw = String(value || 'portrait')
    .trim()
    .toLowerCase()

  if (raw === 'portrait' || raw === 'square' || raw === 'both') {
    return raw
  }

  throw new Error(`FORMAT inválido: "${value}". Use portrait | square | both.`)
}

function normalizeHeadless(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return true
  }
  const raw = String(value).trim().toLowerCase()
  return !(raw === '0' || raw === 'false' || raw === 'no')
}

function formatCaption({ captionLines, hashtags }) {
  const lines = [...captionLines]
  if (hashtags?.trim()) {
    lines.push('')
    lines.push(hashtags.trim())
  }
  return lines.join('\n')
}

function buildPosts({ ctaText, priceFrom }) {
  return [
    {
      slug: '01-atendimento-24-7',
      kicker: 'ATENDIMENTO 24/7',
      headline: { prefix: 'Seu WhatsApp respondido pela', highlight: 'IA', suffix: '' },
      subheadline: 'Respostas rápidas, naturais e com controle de quando o humano entra.',
      cards: [
        { title: 'Respostas instantâneas', description: '24h por dia, sem deixar lead no vácuo.' },
        { title: 'Sem inventar', description: 'Quando não sabe, encaminha ou fica em silêncio.' },
        { title: 'Tudo no painel', description: 'Conversas, leads, clientes e métricas.' }
      ],
      captionLines: [
        'Leads chegando e você sem tempo? O AutoWhats atende por você no WhatsApp com IA — com controle e segurança.',
        '',
        '✅ Respostas automáticas 24/7',
        '✅ IA que não inventa: quando não sabe, chama o humano',
        '✅ CRM + métricas no dashboard',
        '',
        'Teste grátis — link na bio.'
      ],
      hashtags:
        '#WhatsApp #Atendimento #Automacao #IA #Vendas #CRM #Empreendedorismo #MarketingDigital #SaaS #Negocios',
      altText:
        'Arte dark do AutoWhats com o título “Seu WhatsApp respondido pela IA” e 3 cards de benefícios.'
    },
    {
      slug: '02-conexao-qr',
      kicker: 'CONEXÃO EM MINUTOS',
      headline: { prefix: 'Conecte via', highlight: 'QR Code', suffix: '' },
      subheadline: 'Gere o QR no painel e escaneie no celular. Simples.',
      cards: [
        { title: '1) Gerar QR', description: 'Conexões → “Gerar QR Code”.' },
        { title: '2) Escanear', description: 'WhatsApp → Aparelhos conectados.' },
        { title: '3) Pronto', description: 'Sessão ativa e automações ligadas.' }
      ],
      captionLines: [
        'Conectar seu WhatsApp no AutoWhats é em poucos passos:',
        '',
        '1) Gere o QR no painel',
        '2) Escaneie pelo WhatsApp',
        '3) Comece a automatizar',
        '',
        'Teste grátis — link na bio.'
      ],
      hashtags:
        '#WhatsAppBusiness #Automacao #AtendimentoAoCliente #IA #Produtividade #Empresas #Vendas #SaaS #WhatsApp',
      altText: 'Post explicando conexão por QR Code em 3 passos.'
    },
    {
      slug: '03-ia-sem-inventar',
      kicker: 'CONFIANÇA',
      headline: { prefix: 'IA que sabe os', highlight: 'limites', suffix: '' },
      subheadline: 'Quando a pergunta foge do contexto, ela não inventa resposta.',
      cards: [
        { title: 'Encaminhar', description: 'Avisa que um humano vai responder.' },
        { title: 'Silêncio', description: 'Não responde e evita ruído.' },
        { title: 'Fora de contexto', description: 'Opção de desativar o chat automaticamente.' }
      ],
      captionLines: [
        'O maior risco da IA no atendimento é responder errado. Aqui, não.',
        '',
        'Você escolhe o comportamento quando a IA não tem base: silêncio ou encaminhar para humano.',
        '',
        'Teste grátis — link na bio.'
      ],
      hashtags:
        '#IA #Atendimento #WhatsApp #Automacao #Confianca #ExperienciaDoCliente #Vendas #Negocios',
      altText: 'Post sobre IA não inventar respostas e transferir para humano.'
    },
    {
      slug: '04-treinamento-ia',
      kicker: 'TREINAMENTO',
      headline: { prefix: 'Treine a IA com a sua', highlight: 'empresa', suffix: '' },
      subheadline: 'Tom de voz + serviços + horários + preços + regras.',
      cards: [
        { title: 'Tom de voz', description: 'Defina como ela fala e se usa emojis.' },
        { title: 'Base de conhecimento', description: 'Empresa, serviços, valores e FAQs.' },
        { title: 'Escolha o modelo', description: 'Opções no painel (OpenAI/Gemini).' }
      ],
      captionLines: [
        'Sua IA precisa soar como a sua marca. No AutoWhats você configura:',
        '',
        '• nome da empresa e da IA',
        '• serviços, horários e valores',
        '• regras (quando responder / quando chamar humano)',
        '',
        'Teste grátis — link na bio.'
      ],
      hashtags: '#IA #Treinamento #WhatsApp #Automacao #Atendimento #BrandVoice #SaaS',
      altText: 'Post explicando que dá para configurar e treinar a IA com dados da empresa.'
    },
    {
      slug: '05-controle-por-chat',
      kicker: 'CONTROLE',
      headline: { prefix: 'IA global ou por', highlight: 'conversa', suffix: '' },
      subheadline: 'Ative/desative em massa e ajuste chat a chat quando precisar.',
      cards: [
        { title: 'IA Global', description: 'Liga para todas as conversas.' },
        { title: 'Por chat', description: 'Controle individual por conversa.' },
        { title: 'Em massa', description: 'Ative/desative tudo com 1 clique.' }
      ],
      captionLines: [
        'Campanha rodando? Liga a IA. Atendimento humano? Desliga em conversas específicas.',
        '',
        'Você tem controle total do que fica automatizado.',
        '',
        'Teste grátis — link na bio.'
      ],
      hashtags: '#WhatsApp #Automacao #IA #Atendimento #Gestao #Vendas #Produtividade',
      altText: 'Post sobre controle de IA global e por conversa.'
    },
    {
      slug: '06-crm-leads-clientes',
      kicker: 'CRM',
      headline: { prefix: 'Leads viram', highlight: 'clientes', suffix: '' },
      subheadline: 'Organize seu funil e acompanhe cada contato sem planilhas.',
      cards: [
        { title: 'Pipeline', description: 'Novo → Aguardando → Em processo → Cliente (ou Inativo).' },
        { title: 'Conversão fácil', description: 'Transforme lead em cliente pelo painel.' },
        { title: 'Sugestões da IA', description: 'Campos com revisão (status/obs/próx. contato).' }
      ],
      captionLines: [
        'Atendimento bom sem organização vira bagunça. O CRM do AutoWhats te ajuda a:',
        '',
        '• ver o status de cada lead',
        '• priorizar quem precisa de retorno',
        '• manter histórico e observações',
        '',
        'Teste grátis — link na bio.'
      ],
      hashtags: '#CRM #Vendas #WhatsApp #Automacao #IA #Leads #Empreendedorismo #Negocios',
      altText: 'Post sobre CRM integrado com funil de leads e clientes.'
    },
    {
      slug: '07-followup-ia',
      kicker: 'FOLLOW-UP',
      headline: { prefix: 'Follow-up com IA,', highlight: 'editável', suffix: '' },
      subheadline: 'A IA gera o rascunho. Você revisa e envia no WhatsApp.',
      cards: [
        { title: 'Rascunho pronto', description: 'Retome conversas sem esforço.' },
        { title: 'Você aprova', description: 'Edite antes de enviar.' },
        { title: 'Sem repetição', description: 'Controle para evitar mensagens duplicadas.' }
      ],
      captionLines: [
        'A maioria das vendas se perde no follow-up. Aqui você ganha velocidade sem perder o toque humano:',
        '',
        'IA sugere → você ajusta → você envia.',
        '',
        'Teste grátis — link na bio.'
      ],
      hashtags: '#FollowUp #Vendas #WhatsApp #IA #Automacao #Atendimento #CRM',
      altText: 'Post explicando follow-up com IA com revisão antes do envio.'
    },
    {
      slug: '08-agenda',
      kicker: 'AGENDA',
      headline: { prefix: 'Agenda integrada ao', highlight: 'atendimento', suffix: '' },
      subheadline: 'Organize horários e agendamentos (e marque quando for necessário).',
      cards: [
        { title: 'Horários disponíveis', description: 'Configure por dia da semana.' },
        { title: 'Agendamentos', description: 'Crie, confirme, cancele e conclua.' },
        { title: 'Mais rápido', description: 'Interface fluida (drag-and-drop).' }
      ],
      captionLines: [
        'Se seu negócio depende de agenda, você precisa de controle.',
        '',
        'Organize horários e agendamentos no painel e reduza idas e vindas no WhatsApp.',
        '',
        'Teste grátis — link na bio.'
      ],
      hashtags: '#Agenda #Agendamento #WhatsApp #Atendimento #Automacao #IA #Negocios',
      altText: 'Post sobre agenda e agendamentos integrados ao atendimento.'
    },
    {
      slug: '09-creditos-financeiro',
      kicker: 'CUSTO SOB CONTROLE',
      headline: { prefix: 'Créditos + painel', highlight: 'financeiro', suffix: '' },
      subheadline: 'Acompanhe consumo de IA e evite surpresas.',
      cards: [
        { title: 'Consumo', description: 'Tokens e custo (USD/BRL) por período.' },
        { title: 'Pré-pago', description: 'Recarregue quando quiser.' },
        { title: 'Bloqueio automático', description: 'Se o saldo zerar, a IA pausa.' }
      ],
      captionLines: [
        'IA no atendimento precisa ser sustentável. Por isso você vê o consumo e controla o gasto.',
        '',
        'Sem susto no fim do mês: créditos + painel financeiro.',
        '',
        'Teste grátis — link na bio.'
      ],
      hashtags: '#IA #Custos #Automacao #WhatsApp #SaaS #Empresas #Produtividade #Atendimento',
      altText: 'Post sobre créditos e painel financeiro para controlar custo da IA.'
    },
    {
      slug: '10-planos',
      kicker: 'PLANOS',
      headline: { prefix: 'Comece no', highlight: 'teste grátis', suffix: '' },
      subheadline: 'Planos para cada necessidade. Evolua conforme o volume.',
      cards: [
        { title: 'Teste grátis', description: 'Acesso ao sistema + créditos iniciais.' },
        { title: 'Pro', description: `A partir de ${priceFrom}.` },
        { title: 'Enterprise', description: 'Sob consulta (integrações e suporte).' }
      ],
      captionLines: [
        'Quer automatizar sem travar seu atendimento? Comece no teste grátis.',
        '',
        `Planos Pro a partir de ${priceFrom} (e Enterprise sob consulta).`,
        '',
        'Teste grátis — link na bio.'
      ],
      hashtags: '#WhatsApp #Automacao #IA #Planos #SaaS #Vendas #Atendimento #Empreendedorismo',
      altText: 'Post com resumo de planos: teste grátis, Pro a partir de R$100/mês e Enterprise sob consulta.'
    }
  ].map((post) => ({
    ...post,
    ctaText
  }))
}

function buildHtml({ generatedAt, dims, format, ctaText, brandHandle, posts }) {
  const scale = dims.height / 1350
  const safe = 80

  const fontH1 = Math.round(88 * scale)
  const fontSub = Math.round(34 * scale)
  const fontCardTitle = Math.round(30 * scale)
  const fontCardDesc = Math.round(22 * scale)
  const fontKicker = Math.round(22 * scale)
  const fontFooter = Math.round(22 * scale)

  const sections = posts
    .map((p) => {
      const cards = p.cards
        .map(
          (card) => `
            <div class="card">
              <div class="card__titleRow">
                <span class="card__dot" aria-hidden="true"></span>
                <div class="card__title">${escapeHtml(card.title)}</div>
              </div>
              <div class="card__desc">${escapeHtml(card.description)}</div>
            </div>
          `.trim()
        )
        .join('\n')

      const headline = `
        <span class="h1__text">
          ${escapeHtml(p.headline.prefix)} ${p.headline.highlight ? `<span class="gradient-text">${escapeHtml(p.headline.highlight)}</span>` : ''} ${escapeHtml(p.headline.suffix || '')}
        </span>
      `.trim()

      return `
        <section class="post" data-slug="${escapeHtml(p.slug)}">
          <div class="frame">
            <div class="top">
              <div class="brand">Auto<span>Whats</span></div>
              <div class="kicker">${escapeHtml(p.kicker)}</div>
            </div>

            <div class="body">
              <h1 class="h1">${headline}</h1>
              <p class="sub">${escapeHtml(p.subheadline)}</p>

              <div class="cards">
                ${cards}
              </div>
            </div>

            <div class="footer">
              <div class="cta">${escapeHtml(ctaText)}</div>
              <div class="handle">${escapeHtml(brandHandle || '')}</div>
            </div>
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
    <title>AutoWhats - Instagram Posts (${escapeHtml(format)})</title>
    <meta name="generatedAt" content="${escapeHtml(generatedAt)}" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=swap" rel="stylesheet" />
    <style>
      :root {
        --w: ${dims.width}px;
        --h: ${dims.height}px;
        --safe: ${safe}px;

        --bg: ${THEME.background};
        --bg2: ${THEME.backgroundAlt};
        --surface: ${THEME.surface};
        --surface2: ${THEME.surfaceLighter};
        --primary: ${THEME.primary};
        --primaryDark: ${THEME.primaryDark};
        --primaryLight: ${THEME.primaryLight};
        --ink: ${THEME.text};
        --muted: ${THEME.textMuted};

        --h1: ${fontH1}px;
        --sub: ${fontSub}px;
        --kicker: ${fontKicker}px;
        --cardTitle: ${fontCardTitle}px;
        --cardDesc: ${fontCardDesc}px;
        --footer: ${fontFooter}px;
      }

      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; }
      body {
        font-family: Outfit, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans", "Liberation Sans";
        background: #000;
        color: var(--ink);
      }

      .post {
        width: var(--w);
        height: var(--h);
        position: relative;
        overflow: hidden;
        background:
          radial-gradient(900px 700px at 15% 8%, rgba(37,211,102,0.18), transparent 60%),
          radial-gradient(800px 650px at 92% 18%, rgba(57,138,255,0.18), transparent 62%),
          radial-gradient(900px 700px at 70% 95%, rgba(255,166,0,0.10), transparent 55%),
          linear-gradient(135deg, var(--bg) 0%, var(--bg2) 50%, var(--bg) 100%);
      }

      .frame {
        height: 100%;
        padding: var(--safe);
        display: flex;
        flex-direction: column;
        gap: 26px;
      }

      .top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
      }
      .brand {
        font-weight: 800;
        font-size: 30px;
        letter-spacing: -0.02em;
        color: rgba(230,237,243,0.92);
        display: inline-flex;
        align-items: baseline;
        gap: 0;
        white-space: nowrap;
      }
      .brand span { color: var(--primary); }

      .kicker {
        font-size: var(--kicker);
        letter-spacing: 0.12em;
        text-transform: uppercase;
        padding: 10px 14px;
        border-radius: 999px;
        background: rgba(37,211,102,0.10);
        border: 1px solid rgba(37,211,102,0.28);
        color: rgba(230,237,243,0.88);
        font-weight: 700;
      }

      .body {
        display: flex;
        flex-direction: column;
        gap: 18px;
        flex: 1;
      }

      .h1 {
        margin: 0;
        font-size: var(--h1);
        letter-spacing: -0.03em;
        line-height: 0.96;
        max-width: 940px;
      }
      .h1__text { display: inline; }
      .gradient-text {
        background: linear-gradient(135deg, var(--primary) 0%, var(--primaryLight) 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }

      .sub {
        margin: 0;
        font-size: var(--sub);
        line-height: 1.25;
        color: rgba(230,237,243,0.76);
        max-width: 920px;
      }

      .cards {
        margin-top: 10px;
        display: grid;
        gap: 18px;
        grid-template-columns: 1fr;
        align-content: start;
      }
      .card {
        border-radius: 22px;
        padding: 22px 22px 20px;
        background: rgba(22,27,34,0.86);
        border: 1px solid rgba(255,255,255,0.11);
        box-shadow: 0 22px 60px rgba(0,0,0,0.35);
      }
      .card__titleRow {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .card__dot {
        width: 12px;
        height: 12px;
        border-radius: 999px;
        background: linear-gradient(135deg, var(--primary) 0%, var(--primaryDark) 100%);
        box-shadow: 0 0 18px rgba(37,211,102,0.35);
        flex: 0 0 auto;
      }
      .card__title {
        font-size: var(--cardTitle);
        font-weight: 800;
        letter-spacing: -0.02em;
        color: rgba(230,237,243,0.92);
      }
      .card__desc {
        margin-top: 10px;
        font-size: var(--cardDesc);
        line-height: 1.25;
        color: rgba(230,237,243,0.70);
        max-width: 920px;
      }

      .footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
        font-size: var(--footer);
        color: rgba(230,237,243,0.78);
      }
      .cta {
        padding: 10px 14px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(0,0,0,0.25);
        font-weight: 700;
      }
      .handle {
        padding: 10px 14px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,0.10);
        background: rgba(0,0,0,0.20);
        color: rgba(230,237,243,0.62);
        font-weight: 600;
        min-height: 1em;
      }
      .handle:empty {
        border-color: transparent;
        background: transparent;
        padding: 0;
      }
    </style>
  </head>
  <body>
    ${sections}
  </body>
</html>`
}

async function readPngDimensions(filePath) {
  const handle = await fs.open(filePath, 'r')
  try {
    const header = Buffer.alloc(24)
    await handle.read(header, 0, header.length, 0)

    const signature = header.subarray(0, 8)
    const expected = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    if (!signature.equals(expected)) {
      throw new Error('invalid_png_signature')
    }

    const chunkType = header.subarray(12, 16).toString('ascii')
    if (chunkType !== 'IHDR') {
      throw new Error(`invalid_png_header_chunk:${chunkType}`)
    }

    const width = header.readUInt32BE(16)
    const height = header.readUInt32BE(20)
    return { width, height }
  } finally {
    await handle.close().catch(() => {})
  }
}

async function assertPngSize(filePath, expectedWidth, expectedHeight) {
  const { width, height } = await readPngDimensions(filePath)
  if (width !== expectedWidth || height !== expectedHeight) {
    throw new Error(
      `PNG size mismatch for ${filePath}: got ${width}x${height}, expected ${expectedWidth}x${expectedHeight}`
    )
  }
}

async function generatePngs({ htmlPath, dims, posts, outImagesDir, headless }) {
  const browser = await chromium.launch({ headless })
  const context = await browser.newContext({
    locale: 'pt-BR',
    viewport: { width: dims.width, height: dims.height },
    deviceScaleFactor: 1
  })
  const page = await context.newPage()

  await page.goto(toFileUrl(htmlPath), { waitUntil: 'load' })
  await page.evaluate(() => (document.fonts?.ready ? document.fonts.ready : Promise.resolve()))
  await page.waitForTimeout(200)

  const postEls = page.locator('section.post')
  const count = await postEls.count()
  if (count !== posts.length) {
    throw new Error(`Expected ${posts.length} posts in HTML, got ${count}.`)
  }

  const outputs = []
  for (let i = 0; i < posts.length; i += 1) {
    const post = posts[i]
    const el = postEls.nth(i)
    await el.scrollIntoViewIfNeeded()
    await page.waitForTimeout(80)

    const fileName = `${String(i + 1).padStart(2, '0')}-${post.slug}.png`
    const outPath = path.join(outImagesDir, fileName)
    await el.screenshot({ path: outPath })
    await assertPngSize(outPath, dims.width, dims.height)
    outputs.push({ slug: post.slug, fileName, path: './images/' + fileName })
  }

  await context.close()
  await browser.close()

  return outputs
}

async function writeCaptions({ outDir, posts }) {
  const md = [
    '# AutoWhats — Captions (Instagram)',
    '',
    `Gerado em: ${new Date().toISOString()}`,
    ''
  ]

  const json = posts.map((post, index) => {
    const caption = formatCaption({ captionLines: post.captionLines, hashtags: post.hashtags })
    md.push(`## Post ${String(index + 1).padStart(2, '0')} — ${post.slug}`)
    md.push('')
    md.push(`- Kicker: ${post.kicker}`)
    md.push(`- Headline: ${post.headline.prefix} ${post.headline.highlight} ${post.headline.suffix}`.replaceAll('  ', ' ').trim())
    md.push(`- Subheadline: ${post.subheadline}`)
    md.push(`- Alt-text: ${post.altText}`)
    md.push('')
    md.push('Legenda:')
    md.push('')
    md.push('```')
    md.push(caption)
    md.push('```')
    md.push('')

    return {
      index: index + 1,
      slug: post.slug,
      kicker: post.kicker,
      headline: post.headline,
      subheadline: post.subheadline,
      cards: post.cards,
      ctaText: post.ctaText,
      caption,
      hashtags: post.hashtags,
      altText: post.altText
    }
  })

  await fs.writeFile(path.join(outDir, 'captions.md'), md.join('\n'), 'utf8')
  await fs.writeFile(path.join(outDir, 'captions.json'), JSON.stringify(json, null, 2), 'utf8')
}

function resolveDims(format) {
  if (format === 'portrait') return { width: 1080, height: 1350 }
  if (format === 'square') return { width: 1080, height: 1080 }
  throw new Error(`Unknown format: ${format}`)
}

async function main() {
  const stamp = nowStamp()
  const outputDir = path.resolve(process.env.OUTPUT_DIR || path.join('docs', 'instagram', stamp))
  const format = normalizeFormat(process.env.FORMAT)
  const brandHandle = (process.env.BRAND_HANDLE || '').trim()
  const ctaText = (process.env.CTA_TEXT || DEFAULT_CTA_TEXT).trim()
  const priceFrom = (process.env.PRICE_FROM || DEFAULT_PRICE_FROM).trim()
  const headless = normalizeHeadless(process.env.HEADLESS)

  await ensureDir(outputDir)

  const posts = buildPosts({ ctaText, priceFrom })
  await writeCaptions({ outDir: outputDir, posts })

  const formats = format === 'both' ? ['portrait', 'square'] : [format]
  const outputsByFormat = {}

  for (const fmt of formats) {
    const dims = resolveDims(fmt)
    const outDir = format === 'both' && fmt === 'square' ? path.join(outputDir, 'square') : outputDir
    const imagesDir = path.join(outDir, 'images')
    await ensureDir(imagesDir)

    const htmlPath = path.join(outDir, 'posts.html')
    const html = buildHtml({
      generatedAt: new Date().toISOString(),
      dims,
      format: fmt,
      ctaText,
      brandHandle,
      posts
    })
    await fs.writeFile(htmlPath, html, 'utf8')

    const imageOutputs = await generatePngs({
      htmlPath,
      dims,
      posts,
      outImagesDir: imagesDir,
      headless
    })

    outputsByFormat[fmt] = {
      dims,
      html: path.relative(outputDir, htmlPath).replaceAll('\\', '/'),
      imagesDir: path.relative(outputDir, imagesDir).replaceAll('\\', '/'),
      images: imageOutputs
    }
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    outputDir,
    env: {
      format,
      brandHandle: brandHandle || null,
      ctaText,
      priceFrom,
      headless
    },
    theme: THEME,
    outputs: outputsByFormat
  }
  await fs.writeFile(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')

  // eslint-disable-next-line no-console
  console.log('OK. Instagram posts gerados em:', outputDir)
  // eslint-disable-next-line no-console
  console.log('Arquivos: posts.html, images/, captions.md, captions.json, manifest.json')
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err)
  // eslint-disable-next-line no-console
  console.error('Falha ao gerar posts do Instagram:', msg)
  // eslint-disable-next-line no-console
  console.error('Dica: se o Chromium do Playwright não estiver instalado, rode: npx playwright install chromium')
  process.exitCode = 1
})
