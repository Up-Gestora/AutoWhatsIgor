import {
  MARKETING_SLIDE_KEYS,
  MARKETING_SLIDE_LAYOUTS,
  MARKETING_SLIDE_THEMES,
  type MarketingBlock,
  type MarketingCardItem,
  type MarketingCardVariant,
  type MarketingDeck,
  type MarketingMetric,
  type MarketingSlideKey,
  type MarketingSlideLayout,
  type MarketingSlideTheme,
  type MarketingSlideV2,
  type MarketingTimelineStep
} from '@/lib/marketing/deck-types'

const CARD_VARIANTS: MarketingCardVariant[] = ['feature', 'proof', 'pricing', 'comparison', 'generic']
const EMPTY_ARRAY: never[] = []

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback
}

function asOptionalString(value: unknown) {
  const parsed = asString(value)
  return parsed || undefined
}

function sanitizeStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return EMPTY_ARRAY as string[]
  }
  return value
    .map((item) => asString(item))
    .filter((item) => item.length > 0)
}

function sanitizeMetrics(value: unknown): MarketingMetric[] {
  if (!Array.isArray(value)) {
    return []
  }

  const items: MarketingMetric[] = []
  for (const item of value) {
    if (!isObject(item)) {
      continue
    }

    const label = asString(item.label)
    const val = asString(item.value)
    if (!label || !val) {
      continue
    }

    items.push({
      label,
      value: val,
      note: asOptionalString(item.note)
    })
  }

  return items
}

function sanitizeCards(value: unknown): MarketingCardItem[] {
  if (!Array.isArray(value)) {
    return []
  }

  const items: MarketingCardItem[] = []
  for (const item of value) {
    if (!isObject(item)) {
      continue
    }

    const title = asString(item.title)
    if (!title) {
      continue
    }

    items.push({
      title,
      value: asOptionalString(item.value),
      description: asOptionalString(item.description),
      tag: asOptionalString(item.tag)
    })
  }

  return items
}

function sanitizeTimelineSteps(value: unknown): MarketingTimelineStep[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => {
      if (!isObject(item)) {
        return null
      }

      const title = asString(item.title)
      const description = asString(item.description)
      if (!title || !description) {
        return null
      }

      return { title, description }
    })
    .filter((item): item is MarketingTimelineStep => Boolean(item))
}

function pickSlideKey(value: unknown, fallback: MarketingSlideKey): MarketingSlideKey {
  return typeof value === 'string' && MARKETING_SLIDE_KEYS.includes(value as MarketingSlideKey)
    ? (value as MarketingSlideKey)
    : fallback
}

function pickSlideLayout(value: unknown, fallback: MarketingSlideLayout): MarketingSlideLayout {
  return typeof value === 'string' && MARKETING_SLIDE_LAYOUTS.includes(value as MarketingSlideLayout)
    ? (value as MarketingSlideLayout)
    : fallback
}

function pickSlideTheme(value: unknown, fallback: MarketingSlideTheme): MarketingSlideTheme {
  return typeof value === 'string' && MARKETING_SLIDE_THEMES.includes(value as MarketingSlideTheme)
    ? (value as MarketingSlideTheme)
    : fallback
}

function buildFallbackHeadingBlock(id: string, title: string): MarketingBlock {
  return {
    id,
    type: 'heading',
    title
  }
}

export function createDefaultBlockByType(type: MarketingBlock['type'], id: string): MarketingBlock {
  switch (type) {
    case 'heading':
      return { id, type: 'heading', title: 'Novo cabecalho', subtitle: 'Subtitulo' }
    case 'paragraph':
      return { id, type: 'paragraph', text: 'Texto do slide.' }
    case 'bullet-list':
      return { id, type: 'bullet-list', title: 'Lista', items: ['Item 1', 'Item 2'] }
    case 'stat-grid':
      return {
        id,
        type: 'stat-grid',
        title: 'Metricas',
        items: [
          { label: 'Metrica 1', value: '100' },
          { label: 'Metrica 2', value: '200' }
        ]
      }
    case 'card-grid':
      return {
        id,
        type: 'card-grid',
        title: 'Cards',
        variant: 'generic',
        columns: 3,
        items: [
          { title: 'Card 1', description: 'Descricao 1' },
          { title: 'Card 2', description: 'Descricao 2' }
        ]
      }
    case 'timeline':
      return {
        id,
        type: 'timeline',
        title: 'Timeline',
        steps: [
          { title: 'Passo 1', description: 'Descricao do passo 1' },
          { title: 'Passo 2', description: 'Descricao do passo 2' }
        ]
      }
    case 'quote':
      return { id, type: 'quote', quote: 'Frase de impacto.', author: 'Autor' }
    case 'cta':
      return { id, type: 'cta', label: 'Chamada para ação', href: '/login?mode=signup' }
    case 'kpi-strip':
      return {
        id,
        type: 'kpi-strip',
        items: [
          { label: 'KPI 1', value: '10%' },
          { label: 'KPI 2', value: '20%' }
        ]
      }
    default:
      return { id, type: 'paragraph', text: 'Bloco não reconhecido.' }
  }
}

export function sanitizeBlock(rawBlock: unknown, fallbackId: string): MarketingBlock | null {
  if (!isObject(rawBlock)) {
    return null
  }

  const id = asString(rawBlock.id, fallbackId)
  const type = rawBlock.type
  if (typeof type !== 'string') {
    return null
  }

  switch (type) {
    case 'heading': {
      const title = asString(rawBlock.title)
      if (!title) {
        return null
      }
      return {
        id,
        type: 'heading',
        eyebrow: asOptionalString(rawBlock.eyebrow),
        title,
        subtitle: asOptionalString(rawBlock.subtitle)
      }
    }
    case 'paragraph': {
      const text = asString(rawBlock.text)
      if (!text) {
        return null
      }
      return { id, type: 'paragraph', text }
    }
    case 'bullet-list': {
      const items = sanitizeStringList(rawBlock.items)
      if (items.length === 0) {
        return null
      }
      return {
        id,
        type: 'bullet-list',
        title: asOptionalString(rawBlock.title),
        items
      }
    }
    case 'stat-grid': {
      const items = sanitizeMetrics(rawBlock.items)
      if (items.length === 0) {
        return null
      }
      return {
        id,
        type: 'stat-grid',
        title: asOptionalString(rawBlock.title),
        items
      }
    }
    case 'card-grid': {
      const items = sanitizeCards(rawBlock.items)
      if (items.length === 0) {
        return null
      }
      const columnsRaw = Number(rawBlock.columns)
      const columns = columnsRaw === 2 || columnsRaw === 3 || columnsRaw === 4 ? (columnsRaw as 2 | 3 | 4) : 3
      const variant = CARD_VARIANTS.includes(rawBlock.variant as MarketingCardVariant)
        ? (rawBlock.variant as MarketingCardVariant)
        : 'generic'
      return {
        id,
        type: 'card-grid',
        title: asOptionalString(rawBlock.title),
        variant,
        columns,
        items
      }
    }
    case 'timeline': {
      const steps = sanitizeTimelineSteps(rawBlock.steps)
      if (steps.length === 0) {
        return null
      }
      return {
        id,
        type: 'timeline',
        title: asOptionalString(rawBlock.title),
        steps
      }
    }
    case 'quote': {
      const quote = asString(rawBlock.quote)
      const author = asString(rawBlock.author)
      if (!quote || !author) {
        return null
      }
      return {
        id,
        type: 'quote',
        quote,
        author,
        role: asOptionalString(rawBlock.role)
      }
    }
    case 'cta': {
      const label = asString(rawBlock.label)
      const href = asString(rawBlock.href)
      if (!label || !href) {
        return null
      }
      return {
        id,
        type: 'cta',
        label,
        href,
        supportingText: asOptionalString(rawBlock.supportingText)
      }
    }
    case 'kpi-strip': {
      const items = sanitizeMetrics(rawBlock.items)
      if (items.length === 0) {
        return null
      }
      return {
        id,
        type: 'kpi-strip',
        items
      }
    }
    default:
      return null
  }
}

export function sanitizeSlideV2(rawSlide: unknown, fallbackSlide: MarketingSlideV2): MarketingSlideV2 {
  if (!isObject(rawSlide)) {
    return fallbackSlide
  }

  const id = asString(rawSlide.id, fallbackSlide.id)
  const title = asString(rawSlide.title, fallbackSlide.title)
  const key = pickSlideKey(rawSlide.key, fallbackSlide.key)
  const layout = pickSlideLayout(rawSlide.layout, fallbackSlide.layout)
  const theme = pickSlideTheme(rawSlide.theme, fallbackSlide.theme)
  const enabled = typeof rawSlide.enabled === 'boolean' ? rawSlide.enabled : fallbackSlide.enabled

  const rawBlocks = Array.isArray(rawSlide.blocks) ? rawSlide.blocks : []
  const blocks = rawBlocks
    .map((block, index) => sanitizeBlock(block, `${id}-block-${index + 1}`))
    .filter((block): block is MarketingBlock => Boolean(block))

  return {
    id,
    key,
    title,
    layout,
    theme,
    enabled,
    blocks: blocks.length > 0 ? blocks : [buildFallbackHeadingBlock(`${id}-heading`, title)]
  }
}

export function sanitizeDeckV2(rawDeck: unknown, fallbackDeck: MarketingDeck): MarketingDeck {
  if (!isObject(rawDeck)) {
    return fallbackDeck
  }

  const slidesRaw = Array.isArray(rawDeck.slides) ? rawDeck.slides : []
  const fallbackSlidesById = new Map(fallbackDeck.slides.map((slide) => [slide.id, slide]))
  const normalizedSlides: MarketingSlideV2[] = []

  for (const rawSlide of slidesRaw) {
    if (!isObject(rawSlide)) {
      continue
    }
    const rawId = asString(rawSlide.id)
    if (!rawId) {
      continue
    }

    const fallbackSlide = fallbackSlidesById.get(rawId)
    if (!fallbackSlide) {
      continue
    }

    normalizedSlides.push(sanitizeSlideV2(rawSlide, fallbackSlide))
    fallbackSlidesById.delete(rawId)
  }

  if (fallbackSlidesById.size > 0) {
    for (const fallbackSlide of fallbackSlidesById.values()) {
      normalizedSlides.push(fallbackSlide)
    }
  }

  return {
    version: 2,
    language: 'pt-BR',
    audience: 'pme',
    templateKey: asString(rawDeck.templateKey, fallbackDeck.templateKey),
    title: asString(rawDeck.title, fallbackDeck.title),
    subtitle: asString(rawDeck.subtitle, fallbackDeck.subtitle),
    slides: normalizedSlides
  }
}
