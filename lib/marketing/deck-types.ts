import type { Timestamp } from 'firebase/firestore'

export type MarketingDeckStatus = 'draft' | 'ready'

export const MARKETING_SLIDE_KEYS = [
  'cover',
  'problem',
  'solution',
  'how-it-works',
  'features',
  'results',
  'use-cases',
  'pricing',
  'roi',
  'objections',
  'onboarding',
  'final-cta'
] as const

export type MarketingSlideKey = (typeof MARKETING_SLIDE_KEYS)[number]

export const MARKETING_SLIDE_KEY_LABELS: Record<MarketingSlideKey, string> = {
  cover: 'Capa',
  problem: 'Problema',
  solution: 'Solucao',
  'how-it-works': 'Como funciona',
  features: 'Funcionalidades',
  results: 'Resultados',
  'use-cases': 'Casos de uso',
  pricing: 'Precos',
  roi: 'ROI',
  objections: 'Objecoes',
  onboarding: 'Implantacao',
  'final-cta': 'CTA final'
}

export const MARKETING_SLIDE_LAYOUTS = [
  'hero-split',
  'problem-impact',
  'solution-proof',
  'flow-diagram',
  'feature-masonry',
  'results-dashboard',
  'cases-grid',
  'pricing-spotlight',
  'roi-focus',
  'objection-comparison',
  'timeline-roadmap',
  'final-offer'
] as const

export type MarketingSlideLayout = (typeof MARKETING_SLIDE_LAYOUTS)[number]

export const MARKETING_SLIDE_THEMES = [
  'emerald-night',
  'midnight-blue',
  'sunrise-orange',
  'ocean-cyan',
  'slate-premium',
  'forest-glow'
] as const

export type MarketingSlideTheme = (typeof MARKETING_SLIDE_THEMES)[number]

export type MarketingCardVariant = 'feature' | 'proof' | 'pricing' | 'comparison' | 'generic'

export type MarketingMetric = {
  label: string
  value: string
  note?: string
}

export type MarketingCardItem = {
  title: string
  value?: string
  description?: string
  tag?: string
}

export type MarketingTimelineStep = {
  title: string
  description: string
}

export type MarketingHeadingBlock = {
  id: string
  type: 'heading'
  eyebrow?: string
  title: string
  subtitle?: string
}

export type MarketingParagraphBlock = {
  id: string
  type: 'paragraph'
  text: string
}

export type MarketingBulletListBlock = {
  id: string
  type: 'bullet-list'
  title?: string
  items: string[]
}

export type MarketingStatGridBlock = {
  id: string
  type: 'stat-grid'
  title?: string
  items: MarketingMetric[]
}

export type MarketingCardGridBlock = {
  id: string
  type: 'card-grid'
  title?: string
  variant: MarketingCardVariant
  columns?: 2 | 3 | 4
  items: MarketingCardItem[]
}

export type MarketingTimelineBlock = {
  id: string
  type: 'timeline'
  title?: string
  steps: MarketingTimelineStep[]
}

export type MarketingQuoteBlock = {
  id: string
  type: 'quote'
  quote: string
  author: string
  role?: string
}

export type MarketingCtaBlock = {
  id: string
  type: 'cta'
  label: string
  href: string
  supportingText?: string
}

export type MarketingKpiStripBlock = {
  id: string
  type: 'kpi-strip'
  items: MarketingMetric[]
}

export type MarketingBlock =
  | MarketingHeadingBlock
  | MarketingParagraphBlock
  | MarketingBulletListBlock
  | MarketingStatGridBlock
  | MarketingCardGridBlock
  | MarketingTimelineBlock
  | MarketingQuoteBlock
  | MarketingCtaBlock
  | MarketingKpiStripBlock

export type MarketingBlockType = MarketingBlock['type']

export const MARKETING_BLOCK_TYPE_LABELS: Record<MarketingBlockType, string> = {
  heading: 'Cabecalho',
  paragraph: 'Paragrafo',
  'bullet-list': 'Bullets',
  'stat-grid': 'Metrica',
  'card-grid': 'Cards',
  timeline: 'Timeline',
  quote: 'Depoimento',
  cta: 'CTA',
  'kpi-strip': 'Faixa KPI'
}

export type MarketingSlideV2 = {
  id: string
  key: MarketingSlideKey
  enabled: boolean
  title: string
  layout: MarketingSlideLayout
  theme: MarketingSlideTheme
  blocks: MarketingBlock[]
}

export type MarketingDeckV2 = {
  version: 2
  language: 'pt-BR'
  audience: 'pme'
  templateKey: string
  title: string
  subtitle: string
  slides: MarketingSlideV2[]
}

export const MARKETING_V1_SLIDE_KINDS = [
  'cover',
  'problem',
  'what-is',
  'how-it-works',
  'features',
  'pricing',
  'advantages',
  'use-cases',
  'faq-objections',
  'final-cta'
] as const

export type MarketingSlideKindV1 = (typeof MARKETING_V1_SLIDE_KINDS)[number]

export type MarketingSlideCardV1 = {
  title: string
  value?: string
  description?: string
}

export type MarketingSlideV1 = {
  id: string
  kind: MarketingSlideKindV1
  enabled: boolean
  title: string
  subtitle?: string
  body?: string
  bullets: string[]
  cards: MarketingSlideCardV1[]
  ctaLabel?: string
  ctaHref?: string
}

export type MarketingDeckV1 = {
  version: 1
  language: 'pt-BR'
  audience: 'pme'
  title: string
  subtitle: string
  slides: MarketingSlideV1[]
}

export type MarketingDeck = MarketingDeckV2

export type MarketingDeckUserRef = {
  uid: string
  email: string | null
}

export type MarketingDeckDoc = {
  type: 'marketing_deck'
  name: string
  status: MarketingDeckStatus
  deck: MarketingDeckV1 | MarketingDeckV2
  createdAt: Timestamp | null
  updatedAt: Timestamp | null
  createdBy: MarketingDeckUserRef
  updatedBy: MarketingDeckUserRef
}
