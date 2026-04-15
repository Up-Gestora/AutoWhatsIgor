import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadOpenAIKey } from './_env.mjs'
import { openaiFetchJson } from './_http.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const repoRoot = path.resolve(__dirname, '..', '..', '..')
const defaultBriefPath = path.join(__dirname, 'marketing-slides.brief.json')
const defaultOutputRoot = path.join(repoRoot, 'docs', 'ads-assets', 'marketing-slides')

const DEFAULT_MODEL = 'gpt-image-1.5'
const DEFAULT_SIZE = '1536x1024'
const DEFAULT_QUALITY = 'medium'
const DEFAULT_OUTPUT_FORMAT = 'png'
const DEFAULT_INPUT_FIDELITY = 'high'

const EDIT_CRITICAL_KINDS = new Set(['logo', 'ui'])
const EDIT_KIND_PRIORITY = ['logo', 'ui', 'broll', 'reference']

function nowStamp() {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
}

function printUsage() {
  // eslint-disable-next-line no-console
  console.log(
    [
      'Usage:',
      '  node video/scripts/openai/generate-marketing-slides.mjs [options]',
      '',
      'Options:',
      '  --brief <path>        Custom brief JSON path',
      '  --output-root <path>  Custom output root directory',
      '  --dry-run             Build prompt pack + manifest without calling OpenAI',
      '  --help                Show this help',
      '',
      'Env:',
      `  IMAGE_MODEL           Default: ${DEFAULT_MODEL}`,
      `  IMAGE_SIZE            Default: ${DEFAULT_SIZE}`,
      `  IMAGE_QUALITY         Default: ${DEFAULT_QUALITY}`,
      `  IMAGE_OUTPUT_FORMAT   Default: ${DEFAULT_OUTPUT_FORMAT}`,
      '  OPENAI_API_KEY        Required when not using --dry-run'
    ].join('\n')
  )
}

function parseCliArgs(argv) {
  const out = {
    briefPath: null,
    outputRoot: null,
    dryRun: false,
    help: false
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--brief') {
      out.briefPath = argv[i + 1]
      i += 1
      continue
    }
    if (arg === '--output-root') {
      out.outputRoot = argv[i + 1]
      i += 1
      continue
    }
    if (arg === '--dry-run') {
      out.dryRun = true
      continue
    }
    if (arg === '--help') {
      out.help = true
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  return out
}

function parseBooleanEnv(raw) {
  if (raw == null) return false
  const normalized = String(raw).trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes'
}

function sanitizeSlug(input) {
  const normalized = String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_ ]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return normalized || 'slide'
}

function toRepoRelative(filePath) {
  return path.relative(repoRoot, filePath).replaceAll('\\', '/')
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function safeString(value, fallback = '') {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : fallback
}

function safeArray(value) {
  return Array.isArray(value) ? value : []
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true })
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

function parseSize(size) {
  const parts = String(size || '')
    .toLowerCase()
    .split('x')
    .map((part) => Number.parseInt(part, 10))

  if (parts.length !== 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) {
    throw new Error(`Invalid IMAGE_SIZE value: "${size}". Expected format WIDTHxHEIGHT, e.g. 1536x1024.`)
  }

  return { width: parts[0], height: parts[1] }
}

function normalizeOutputExtension(outputFormat) {
  const normalized = String(outputFormat || DEFAULT_OUTPUT_FORMAT).trim().toLowerCase()
  if (normalized === 'jpg') return 'jpeg'
  if (normalized === 'jpeg' || normalized === 'png' || normalized === 'webp') return normalized
  throw new Error(`Unsupported IMAGE_OUTPUT_FORMAT: "${outputFormat}". Use png, jpeg, or webp.`)
}

function mimeFromPath(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  return 'application/octet-stream'
}

async function writeJson(filePath, payload) {
  await ensureDir(path.dirname(filePath))
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8')
}

async function writeText(filePath, content) {
  await ensureDir(path.dirname(filePath))
  await fs.writeFile(filePath, content, 'utf8')
}

function normalizeReference(rawReference, slideKey, referenceIndex) {
  const ref = rawReference && typeof rawReference === 'object' ? rawReference : {}
  const refPath = safeString(ref.path)
  if (!refPath) {
    throw new Error(`brief_invalid_reference_path:${slideKey}:${referenceIndex}`)
  }

  return {
    path: refPath.replaceAll('\\', '/'),
    kind: safeString(ref.kind, 'reference').toLowerCase(),
    critical: ref.critical === true,
    note: safeString(ref.note)
  }
}

function normalizeSlide(rawSlide, index) {
  const slide = rawSlide && typeof rawSlide === 'object' ? rawSlide : {}
  const key = safeString(slide.key, `slide-${index + 1}`)
  const title = safeString(slide.title, `Slide ${index + 1}`)
  const objective = safeString(slide.objective)
  const message = safeString(slide.message)
  const bullets = safeArray(slide.bullets).map((item) => safeString(item)).filter(Boolean)
  const cta = safeString(slide.cta)
  const themeHint = safeString(slide.theme_hint)
  const references = safeArray(slide.references).map((item, refIndex) => normalizeReference(item, key, refIndex))

  return {
    key,
    title,
    objective,
    message,
    bullets,
    cta,
    theme_hint: themeHint,
    references
  }
}

function normalizeBrief(rawBrief) {
  const brief = rawBrief && typeof rawBrief === 'object' ? rawBrief : {}
  const slides = safeArray(brief.slides).map((slide, index) => normalizeSlide(slide, index))

  if (slides.length === 0) {
    throw new Error('brief_slides_required')
  }

  return {
    deck_title: safeString(brief.deck_title, 'AutoWhats - Deck Comercial'),
    deck_subtitle: safeString(brief.deck_subtitle, 'Automacao de WhatsApp com IA'),
    language: safeString(brief.language, 'pt-BR'),
    slides
  }
}

function formatBulletLines(bullets) {
  if (!bullets.length) {
    return '- Sem bullets adicionais.'
  }
  return bullets.map((item) => `- ${item}`).join('\n')
}

function buildReferenceLine(ref) {
  const flags = []
  if (ref.critical) flags.push('critical')
  if (!ref.exists) flags.push('missing')
  const flagLabel = flags.length ? ` [${flags.join(',')}]` : ''
  const note = ref.note ? ` - ${ref.note}` : ''
  return `- (${ref.kind}) ${ref.path}${flagLabel}${note}`
}

function buildSlidePrompt({ brief, slide, slideNumber, totalSlides, references, outputSize }) {
  const referencesText = references.length
    ? references.map((ref) => buildReferenceLine(ref)).join('\n')
    : '- Sem referencias de arquivo.'

  return [
    'Voce e um diretor de arte senior e designer de apresentacoes B2B SaaS.',
    'Crie UMA imagem de slide comercial pronta para apresentacao executiva.',
    '',
    'Contexto da apresentacao:',
    `- Deck: ${brief.deck_title}`,
    `- Subtitulo: ${brief.deck_subtitle}`,
    `- Idioma: ${brief.language}`,
    `- Slide: ${slideNumber}/${totalSlides} (${slide.key})`,
    '',
    'Conteudo obrigatorio do slide:',
    `- Titulo: "${slide.title}"`,
    slide.objective ? `- Objetivo de negocio: "${slide.objective}"` : '- Objetivo de negocio: manter foco em conversao comercial.',
    slide.message ? `- Mensagem principal: "${slide.message}"` : '- Mensagem principal: manter proposta de valor clara.',
    `- Bullets obrigatorios:\n${formatBulletLines(slide.bullets)}`,
    slide.cta ? `- CTA obrigatorio: "${slide.cta}"` : '- CTA: adicionar chamada de acao comercial coerente.',
    '',
    'Direcao visual:',
    `- Theme hint: ${slide.theme_hint || 'premium saas, limpo, hierarquia forte'}`,
    '- Composicao profissional, contraste alto e leitura imediata.',
    '- Evitar poluicao visual e excesso de texto em bloco corrido.',
    '- Preservar fidelidade de marca com base nos arquivos de referencia.',
    '',
    'Regras obrigatorias:',
    `- Formato final: ${outputSize} (16:9 landscape).`,
    '- Manter area segura: nao encostar textos nas bordas.',
    '- Nao inventar metricas numericas.',
    '- Nao inventar logos ou interfaces que conflitem com os arquivos enviados.',
    '- Entregar visual premium e consistente com AutoWhats.',
    '',
    'Referencias de arquivo (usar como fonte de verdade):',
    referencesText
  ].join('\n')
}

async function resolveSlideReferences(slide) {
  const refs = []
  for (const ref of slide.references) {
    const absPath = path.resolve(repoRoot, ref.path)
    // eslint-disable-next-line no-await-in-loop
    const exists = await fileExists(absPath)
    refs.push({
      ...ref,
      absPath,
      exists
    })
  }
  return refs
}

function priorityForKind(kind) {
  const index = EDIT_KIND_PRIORITY.indexOf(kind)
  return index === -1 ? 999 : index
}

function pickEditReferences(resolvedRefs, maxItems = 4) {
  return [...resolvedRefs]
    .filter((ref) => ref.exists)
    .sort((a, b) => {
      const criticalDelta = Number(b.critical) - Number(a.critical)
      if (criticalDelta !== 0) return criticalDelta
      return priorityForKind(a.kind) - priorityForKind(b.kind)
    })
    .slice(0, maxItems)
}

function chooseGenerationMode(resolvedRefs) {
  const criticalVisualRefs = resolvedRefs.filter((ref) => ref.critical && EDIT_CRITICAL_KINDS.has(ref.kind))
  const criticalVisualRefsExisting = criticalVisualRefs.filter((ref) => ref.exists)
  const editRefs = pickEditReferences(resolvedRefs, 4)

  if (criticalVisualRefsExisting.length > 0 && editRefs.length > 0) {
    return {
      mode: 'edit',
      selectedReferences: editRefs,
      decision: 'critical_reference_available'
    }
  }

  if (criticalVisualRefs.length > 0 && criticalVisualRefsExisting.length === 0) {
    return {
      mode: 'generation',
      selectedReferences: [],
      decision: 'fallback_generation_missing_critical'
    }
  }

  return {
    mode: 'generation',
    selectedReferences: [],
    decision: 'no_critical_visual_reference'
  }
}

async function createImageGeneration({
  apiKey,
  model,
  prompt,
  size,
  quality,
  outputFormat
}) {
  const url = 'https://api.openai.com/v1/images/generations'
  const body = JSON.stringify({
    model,
    prompt,
    size,
    quality,
    output_format: outputFormat
  })

  return openaiFetchJson(url, {
    apiKey,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  })
}

async function createImageEdit({
  apiKey,
  model,
  prompt,
  size,
  quality,
  outputFormat,
  inputFidelity,
  imageReferences
}) {
  const url = 'https://api.openai.com/v1/images/edits'
  const form = new FormData()
  form.append('model', model)
  form.append('prompt', prompt)
  form.append('size', size)
  form.append('quality', quality)
  form.append('output_format', outputFormat)
  form.append('input_fidelity', inputFidelity)

  for (const ref of imageReferences) {
    // eslint-disable-next-line no-await-in-loop
    const buffer = await fs.readFile(ref.absPath)
    const blob = new Blob([buffer], { type: mimeFromPath(ref.absPath) })
    form.append('image[]', blob, path.basename(ref.absPath))
  }

  return openaiFetchJson(url, {
    apiKey,
    method: 'POST',
    body: form
  })
}

async function decodeImageFromResponse(payload) {
  const item = payload?.data?.[0]
  if (!item) {
    throw new Error('openai_images_empty_response')
  }

  let buffer = null
  let sourceType = null

  if (item.b64_json) {
    buffer = Buffer.from(item.b64_json, 'base64')
    sourceType = 'b64_json'
  } else if (item.url) {
    const res = await fetch(item.url)
    if (!res.ok) {
      throw new Error(`openai_images_download_failed:${res.status}`)
    }
    const bytes = await res.arrayBuffer()
    buffer = Buffer.from(bytes)
    sourceType = 'url'
  }

  if (!buffer) {
    throw new Error('openai_images_no_binary_payload')
  }

  const revisedPrompt = safeString(item.revised_prompt) || safeString(payload?.revised_prompt) || null

  return {
    buffer,
    revisedPrompt,
    sourceType
  }
}

async function readPngDimensions(filePath) {
  const fd = await fs.open(filePath, 'r')
  try {
    const header = Buffer.alloc(24)
    await fd.read(header, 0, header.length, 0)

    const signature = header.subarray(0, 8)
    const expected = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    if (!signature.equals(expected)) {
      throw new Error('invalid_png_signature')
    }

    const chunkType = header.subarray(12, 16).toString('ascii')
    if (chunkType !== 'IHDR') {
      throw new Error(`invalid_png_header_chunk:${chunkType}`)
    }

    return {
      width: header.readUInt32BE(16),
      height: header.readUInt32BE(20)
    }
  } finally {
    await fd.close().catch(() => {})
  }
}

function buildBaseQaAlerts({ slide, resolvedRefs, generationMode }) {
  const alerts = []

  const totalTextLength = [slide.title, slide.message, slide.cta, ...slide.bullets].join(' ').length
  if (totalTextLength > 320) {
    alerts.push({
      type: 'text_legibility',
      severity: 'warning',
      message: 'Texto obrigatorio longo; revisar legibilidade e reducao de densidade.'
    })
  }

  if (slide.bullets.some((item) => item.length > 110)) {
    alerts.push({
      type: 'text_legibility',
      severity: 'warning',
      message: 'Algum bullet esta longo; revisar quebra de linhas na arte final.'
    })
  }

  const hasExistingLogo = resolvedRefs.some((ref) => ref.kind === 'logo' && ref.exists)
  if (!hasExistingLogo) {
    alerts.push({
      type: 'brand_alignment',
      severity: 'warning',
      message: 'Nenhum arquivo de logo encontrado para este slide; validar consistencia de marca.'
    })
  }

  const hasExistingUi = resolvedRefs.some((ref) => ref.kind === 'ui' && ref.exists)
  if (generationMode === 'generation' && !hasExistingUi) {
    alerts.push({
      type: 'brand_alignment',
      severity: 'warning',
      message: 'Slide sem referencia visual de UI no modo generation; revisar fidelidade ao produto.'
    })
  }

  alerts.push({
    type: 'visual_artifacts',
    severity: 'review',
    message: 'Inspecao manual obrigatoria para artefatos visuais e texto com erros.'
  })

  return alerts
}

function buildMissingReferenceAlerts(resolvedRefs) {
  return resolvedRefs
    .filter((ref) => !ref.exists)
    .map((ref) => ({
      type: 'missing_reference',
      severity: ref.critical ? 'warning' : 'info',
      message: `Arquivo de referencia ausente: ${ref.path}`
    }))
}

function buildReviewHtml({
  brief,
  model,
  size,
  quality,
  outputFormat,
  runDirRelative,
  manifest,
  promptPackPathRelative
}) {
  const generatedAt = manifest.generated_at
  const cards = manifest.slides
    .map((slide) => {
      const imageSrc = slide.output_file_name ? `./slides/${slide.output_file_name}` : null
      const alerts = Array.isArray(slide.qa_alerts) ? slide.qa_alerts : []
      const alertHtml =
        alerts.length > 0
          ? `<ul>${alerts.map((alert) => `<li><strong>${escapeHtml(alert.type)}</strong>: ${escapeHtml(alert.message)}</li>`).join('')}</ul>`
          : '<p>Sem alertas.</p>'

      return `
        <article class="card">
          <header>
            <h3>${escapeHtml(slide.slide_key)}</h3>
            <span class="status status-${escapeHtml(slide.status)}">${escapeHtml(slide.status)}</span>
          </header>
          <p><strong>Titulo:</strong> ${escapeHtml(slide.title || '')}</p>
          <p><strong>Modo:</strong> ${escapeHtml(slide.generation_mode || '-')}</p>
          <p><strong>Saida:</strong> ${escapeHtml(slide.output_path || '-')}</p>
          <div class="media">
            ${
              imageSrc
                ? `<img src="${escapeHtml(imageSrc)}" alt="${escapeHtml(slide.slide_key)}" />`
                : '<div class="placeholder">Imagem nao gerada</div>'
            }
          </div>
          <section>
            <h4>QA alerts</h4>
            ${alertHtml}
          </section>
        </article>
      `
    })
    .join('\n')

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AutoWhats Marketing Slides Review</title>
    <style>
      :root {
        --bg: #090d14;
        --panel: #111827;
        --panel2: #0b1220;
        --line: #243041;
        --text: #e6edf3;
        --muted: #9fb0c3;
        --ok: #22c55e;
        --warn: #f59e0b;
        --err: #ef4444;
        --info: #38bdf8;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 24px;
        font-family: "Segoe UI", Arial, sans-serif;
        background: radial-gradient(circle at top, #16233a 0%, var(--bg) 50%);
        color: var(--text);
      }
      a { color: var(--info); }
      .meta {
        border: 1px solid var(--line);
        border-radius: 14px;
        background: rgba(17, 24, 39, 0.78);
        padding: 16px;
        margin-bottom: 16px;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
        gap: 14px;
      }
      .card {
        border: 1px solid var(--line);
        border-radius: 14px;
        background: linear-gradient(180deg, rgba(17, 24, 39, 0.85), rgba(11, 18, 32, 0.9));
        padding: 14px;
      }
      .card header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .card h3 {
        margin: 0;
        font-size: 16px;
      }
      .status {
        border-radius: 999px;
        padding: 4px 10px;
        font-size: 12px;
        border: 1px solid var(--line);
      }
      .status-generated { color: var(--ok); }
      .status-generated_with_alerts { color: var(--warn); }
      .status-failed { color: var(--err); }
      .status-dry_run { color: var(--info); }
      .status-skipped_auth_error { color: var(--warn); }
      .media {
        margin: 12px 0;
        border: 1px dashed #2c3a4e;
        border-radius: 12px;
        overflow: hidden;
        background: #05080f;
      }
      img {
        width: 100%;
        display: block;
      }
      .placeholder {
        display: grid;
        place-items: center;
        min-height: 180px;
        color: var(--muted);
      }
      h4 {
        margin: 10px 0 8px;
        color: var(--muted);
      }
      ul {
        margin: 0;
        padding-left: 18px;
      }
      li {
        margin-bottom: 6px;
      }
    </style>
  </head>
  <body>
    <section class="meta">
      <h1>AutoWhats - Marketing Slides Review</h1>
      <p><strong>Deck:</strong> ${escapeHtml(brief.deck_title)}</p>
      <p><strong>Subtitulo:</strong> ${escapeHtml(brief.deck_subtitle)}</p>
      <p><strong>Idioma:</strong> ${escapeHtml(brief.language)}</p>
      <p><strong>Gerado em:</strong> ${escapeHtml(generatedAt)}</p>
      <p><strong>Run dir:</strong> ${escapeHtml(runDirRelative)}</p>
      <p><strong>Modelo:</strong> ${escapeHtml(model)} | <strong>Tamanho:</strong> ${escapeHtml(size)} | <strong>Qualidade:</strong> ${escapeHtml(quality)} | <strong>Formato:</strong> ${escapeHtml(outputFormat)}</p>
      <p><strong>Prompt pack:</strong> ${escapeHtml(promptPackPathRelative)}</p>
    </section>
    <section class="grid">
      ${cards}
    </section>
  </body>
</html>`
}

function summarizeError(error) {
  if (!error) return 'unknown_error'
  if (typeof error === 'string') return error
  const parts = []
  if (error.message) parts.push(String(error.message))
  if (error.status) parts.push(`status:${error.status}`)
  return parts.length > 0 ? parts.join(' | ') : String(error)
}

async function run() {
  const args = parseCliArgs(process.argv.slice(2))
  if (args.help) {
    printUsage()
    return
  }

  const dryRun = args.dryRun || parseBooleanEnv(process.env.DRY_RUN)
  const model = process.env.IMAGE_MODEL || DEFAULT_MODEL
  const size = process.env.IMAGE_SIZE || DEFAULT_SIZE
  const quality = process.env.IMAGE_QUALITY || DEFAULT_QUALITY
  const outputFormat = normalizeOutputExtension(process.env.IMAGE_OUTPUT_FORMAT || DEFAULT_OUTPUT_FORMAT)
  const inputFidelity = process.env.IMAGE_INPUT_FIDELITY || DEFAULT_INPUT_FIDELITY
  const expectedSize = parseSize(size)

  const briefPath = args.briefPath ? path.resolve(process.cwd(), args.briefPath) : defaultBriefPath
  const outputRoot = args.outputRoot ? path.resolve(process.cwd(), args.outputRoot) : defaultOutputRoot

  const briefRaw = await fs.readFile(briefPath, 'utf8')
  const brief = normalizeBrief(JSON.parse(briefRaw))

  const stamp = nowStamp()
  const runDir = path.join(outputRoot, stamp)
  const slidesDir = path.join(runDir, 'slides')
  const promptPackPath = path.join(runDir, 'prompt-pack.json')
  const manifestPath = path.join(runDir, 'manifest.json')
  const reviewPath = path.join(runDir, 'review.html')

  await ensureDir(slidesDir)

  const resolvedRefsBySlide = []
  for (const slide of brief.slides) {
    // eslint-disable-next-line no-await-in-loop
    const refs = await resolveSlideReferences(slide)
    resolvedRefsBySlide.push(refs)
  }

  const promptPack = brief.slides.map((slide, index) => {
    const resolvedRefs = resolvedRefsBySlide[index]
    const modeDecision = chooseGenerationMode(resolvedRefs)
    return {
      slide_key: slide.key,
      slide_index: index + 1,
      generation_mode: modeDecision.mode,
      generation_decision: modeDecision.decision,
      selected_reference_paths: modeDecision.selectedReferences.map((ref) => ref.path),
      prompt: buildSlidePrompt({
        brief,
        slide,
        slideNumber: index + 1,
        totalSlides: brief.slides.length,
        references: resolvedRefs,
        outputSize: size
      }),
      source_refs: resolvedRefs.map((ref) => ({
        path: ref.path,
        kind: ref.kind,
        critical: ref.critical,
        exists: ref.exists,
        note: ref.note
      }))
    }
  })

  await writeJson(promptPackPath, {
    generated_at: new Date().toISOString(),
    model,
    size,
    quality,
    output_format: outputFormat,
    dry_run: dryRun,
    brief_path: toRepoRelative(briefPath),
    slides: promptPack
  })

  const manifest = {
    model,
    size,
    quality,
    output_format: outputFormat,
    generated_at: new Date().toISOString(),
    dry_run: dryRun,
    brief_path: toRepoRelative(briefPath),
    prompt_pack_path: toRepoRelative(promptPackPath),
    slides: []
  }

  let apiKey = null
  let fatalAuthError = null

  if (!dryRun) {
    try {
      apiKey = await loadOpenAIKey()
    } catch (error) {
      fatalAuthError = {
        message: `OpenAI API key not available: ${summarizeError(error)}`,
        status: 401
      }
    }
  }

  let failedCount = 0

  for (let index = 0; index < brief.slides.length; index += 1) {
    const slide = brief.slides[index]
    const resolvedRefs = resolvedRefsBySlide[index]
    const promptEntry = promptPack[index]
    const qaAlerts = [
      ...buildMissingReferenceAlerts(resolvedRefs),
      ...buildBaseQaAlerts({
        slide,
        resolvedRefs,
        generationMode: promptEntry.generation_mode
      })
    ]

    if (promptEntry.generation_decision === 'fallback_generation_missing_critical') {
      qaAlerts.push({
        type: 'brand_alignment',
        severity: 'warning',
        message: 'Referencias criticas ausentes. O script usou mode generation como fallback.'
      })
    }

    const manifestEntry = {
      slide_key: slide.key,
      title: slide.title,
      prompt_used: promptEntry.prompt,
      revised_prompt: null,
      source_refs: promptEntry.source_refs,
      output_path: null,
      output_file_name: null,
      generation_mode: promptEntry.generation_mode,
      status: 'pending',
      error: null,
      qa_alerts: qaAlerts
    }

    if (dryRun) {
      manifestEntry.status = 'dry_run'
      manifest.slides.push(manifestEntry)
      // eslint-disable-next-line no-await-in-loop
      await writeJson(manifestPath, manifest)
      continue
    }

    if (fatalAuthError) {
      manifestEntry.status = 'skipped_auth_error'
      manifestEntry.error = fatalAuthError.message
      manifest.slides.push(manifestEntry)
      // eslint-disable-next-line no-await-in-loop
      await writeJson(manifestPath, manifest)
      failedCount += 1
      continue
    }

    try {
      let responseJson
      if (promptEntry.generation_mode === 'edit') {
        responseJson = await createImageEdit({
          apiKey,
          model,
          prompt: promptEntry.prompt,
          size,
          quality,
          outputFormat,
          inputFidelity,
          imageReferences: chooseGenerationMode(resolvedRefs).selectedReferences
        })
      } else {
        responseJson = await createImageGeneration({
          apiKey,
          model,
          prompt: promptEntry.prompt,
          size,
          quality,
          outputFormat
        })
      }

      const decoded = await decodeImageFromResponse(responseJson)
      const fileExt = outputFormat === 'jpeg' ? 'jpg' : outputFormat
      const outFileName = `${String(index + 1).padStart(2, '0')}-${sanitizeSlug(slide.key)}.${fileExt}`
      const outAbsPath = path.join(slidesDir, outFileName)

      await fs.writeFile(outAbsPath, decoded.buffer)

      if (outputFormat === 'png') {
        try {
          const dims = await readPngDimensions(outAbsPath)
          if (dims.width !== expectedSize.width || dims.height !== expectedSize.height) {
            manifestEntry.qa_alerts.push({
              type: 'dimension_mismatch',
              severity: 'warning',
              message: `Dimensao fora do esperado: ${dims.width}x${dims.height} (esperado ${expectedSize.width}x${expectedSize.height}).`
            })
          }
        } catch (dimensionError) {
          manifestEntry.qa_alerts.push({
            type: 'dimension_check_failed',
            severity: 'warning',
            message: `Falha ao validar dimensao PNG: ${summarizeError(dimensionError)}`
          })
        }
      }

      manifestEntry.revised_prompt = decoded.revisedPrompt
      manifestEntry.output_path = toRepoRelative(outAbsPath)
      manifestEntry.output_file_name = outFileName
      manifestEntry.status = manifestEntry.qa_alerts.length > 0 ? 'generated_with_alerts' : 'generated'
      manifestEntry.source_type = decoded.sourceType
    } catch (error) {
      manifestEntry.status = 'failed'
      manifestEntry.error = summarizeError(error)
      failedCount += 1

      if (error?.status === 401 || error?.status === 403) {
        fatalAuthError = {
          message: `Authentication error from OpenAI: ${summarizeError(error)}`,
          status: error.status
        }
      }
    }

    manifest.slides.push(manifestEntry)
    // eslint-disable-next-line no-await-in-loop
    await writeJson(manifestPath, manifest)
  }

  const reviewHtml = buildReviewHtml({
    brief,
    model,
    size,
    quality,
    outputFormat,
    runDirRelative: toRepoRelative(runDir),
    manifest,
    promptPackPathRelative: toRepoRelative(promptPackPath)
  })
  await writeText(reviewPath, reviewHtml)

  // eslint-disable-next-line no-console
  console.log('OK. Marketing slides output:', runDir)
  // eslint-disable-next-line no-console
  console.log('Prompt pack:', promptPackPath)
  // eslint-disable-next-line no-console
  console.log('Manifest:', manifestPath)
  // eslint-disable-next-line no-console
  console.log('Review:', reviewPath)

  if (failedCount > 0) {
    process.exitCode = 1
  }
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error)
  process.exitCode = 1
})
