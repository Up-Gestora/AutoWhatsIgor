import { createDefaultMarketingDeck } from '@/lib/marketing/default-deck'
import { sanitizeDeckV2 } from '@/lib/marketing/deck-schema-v2'
import type { MarketingDeck, MarketingDeckV1, MarketingSlideV1 } from '@/lib/marketing/deck-types'

const LEGACY_KIND_TO_TARGET_ID: Record<MarketingSlideV1['kind'], string> = {
  cover: 'cover',
  problem: 'problem',
  'what-is': 'solution',
  'how-it-works': 'how-it-works',
  features: 'features',
  pricing: 'pricing',
  advantages: 'results',
  'use-cases': 'use-cases',
  'faq-objections': 'objections',
  'final-cta': 'final-cta'
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isLikelyV1Deck(value: unknown): value is MarketingDeckV1 {
  if (!isObject(value)) {
    return false
  }

  if (value.version === 1) {
    return true
  }

  const slides = Array.isArray(value.slides) ? value.slides : []
  return slides.some((slide) => isObject(slide) && typeof slide.kind === 'string')
}

function mapLegacySlideToBlocks(legacy: MarketingSlideV1) {
  const blocks: MarketingDeck['slides'][number]['blocks'] = [
    {
      id: `${legacy.id}-heading`,
      type: 'heading',
      title: legacy.title,
      subtitle: legacy.subtitle ?? ''
    }
  ]

  if (legacy.body && legacy.body.trim().length > 0) {
    blocks.push({
      id: `${legacy.id}-paragraph`,
      type: 'paragraph',
      text: legacy.body.trim()
    })
  }

  if (Array.isArray(legacy.bullets) && legacy.bullets.length > 0) {
    blocks.push({
      id: `${legacy.id}-bullets`,
      type: 'bullet-list',
      items: legacy.bullets
    })
  }

  if (Array.isArray(legacy.cards) && legacy.cards.length > 0) {
    blocks.push({
      id: `${legacy.id}-cards`,
      type: 'card-grid',
      variant: 'generic',
      columns: 3,
      items: legacy.cards.map((card) => ({
        title: card.title,
        value: card.value,
        description: card.description
      }))
    })
  }

  if (legacy.ctaLabel && legacy.ctaHref) {
    blocks.push({
      id: `${legacy.id}-cta`,
      type: 'cta',
      label: legacy.ctaLabel,
      href: legacy.ctaHref
    })
  }

  return blocks
}

export function migrateDeckV1ToV2(legacyDeck: MarketingDeckV1, fallbackDeck: MarketingDeck): MarketingDeck {
  const legacyByTarget = new Map<string, MarketingSlideV1>()

  for (const slide of legacyDeck.slides ?? []) {
    const targetId = LEGACY_KIND_TO_TARGET_ID[slide.kind]
    if (!targetId) {
      continue
    }
    if (!legacyByTarget.has(targetId)) {
      legacyByTarget.set(targetId, slide)
    }
  }

  const migratedSlides = fallbackDeck.slides.map((fallbackSlide) => {
    const legacy = legacyByTarget.get(fallbackSlide.id)
    if (!legacy) {
      return fallbackSlide
    }

    const blocks = mapLegacySlideToBlocks(legacy)

    return {
      ...fallbackSlide,
      enabled: legacy.enabled,
      title: legacy.title || fallbackSlide.title,
      blocks: blocks.length > 0 ? blocks : fallbackSlide.blocks
    }
  })

  return {
    version: 2,
    language: 'pt-BR',
    audience: 'pme',
    templateKey: fallbackDeck.templateKey,
    title: legacyDeck.title || fallbackDeck.title,
    subtitle: legacyDeck.subtitle || fallbackDeck.subtitle,
    slides: migratedSlides
  }
}

export function ensureDeckV2(rawDeck: unknown): MarketingDeck {
  const fallback = createDefaultMarketingDeck()

  if (!isObject(rawDeck)) {
    return fallback
  }

  if (rawDeck.version === 2) {
    return sanitizeDeckV2(rawDeck, fallback)
  }

  if (isLikelyV1Deck(rawDeck)) {
    return sanitizeDeckV2(migrateDeckV1ToV2(rawDeck, fallback), fallback)
  }

  return fallback
}
